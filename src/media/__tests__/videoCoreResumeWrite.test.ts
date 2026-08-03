/**
 * A resume write must not be able to delete a position the user really reached —
 * Phase 6 slice 35.
 *
 * The first block is a MODEL of `ResumeTracker`'s four triggers (`timeupdate`, `pause`,
 * `ended`, effect teardown) over the REAL store functions and the REAL
 * {@link resumeWriteAction}. Only the triggers are modelled; every decision under test is
 * the shipped one. Same bargain as `directstreamOpenRecovery.test.ts`: the defect is a
 * *sequence*, and a sequence is worth pinning as a property rather than as a paragraph.
 */
import { describe, expect, it } from 'vitest';
import {
  RESUME_END_MARGIN_SEC,
  RESUME_MIN_MEANINGFUL_SEC,
  resumeWriteAction,
} from '../videoCoreResumeWrite';
import {
  normalizeVideoCoreResumePositions,
  resolveVideoCoreResumePosition,
  upsertVideoCoreResumePosition,
  type VideoCoreResumePosition,
} from '../../shared/videoCoreStudy';
import { seanimeContinueWatching } from '../../shared/seanimeContinueWatching';

const KEY = 'file:c:/media/frieren 01.mkv';

/**
 * The element as `ResumeTracker` sees it: a clock, whether media is attached, and a
 * duration the element only knows once metadata arrived.
 */
class ElementModel {
  currentTime = 0;
  duration = Number.NaN;
  hasMedia = false;

  /** What `video-core.tsx` §965-970 does when playback info goes null. */
  empty(): void {
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.hasMedia = false;
  }

  load(durationSec: number): void {
    this.hasMedia = true;
    this.duration = durationSec;
    this.currentTime = 0;
  }
}

/** `ResumeTracker`'s persist path, with the shipped rule at its centre. */
class TrackerModel {
  positions: VideoCoreResumePosition[];
  sessionMaxSec = 0;
  private clock = 1_000;

  constructor(seed: readonly VideoCoreResumePosition[] = []) {
    this.positions = normalizeVideoCoreResumePositions(seed);
  }

  /** Every trigger samples the clock first — that is how `sessionMaxSec` is earned. */
  private sample(element: ElementModel): void {
    if (element.hasMedia && Number.isFinite(element.currentTime)) {
      this.sessionMaxSec = Math.max(this.sessionMaxSec, element.currentTime);
    }
  }

  persist(element: ElementModel, finished = false): ResumeWriteOutcome {
    this.sample(element);
    const action = resumeWriteAction({
      positionSec: element.currentTime,
      hasMedia: element.hasMedia,
      sessionMaxSec: this.sessionMaxSec,
      durationSec: element.duration,
      finished,
    });
    if (action === 'save') {
      this.positions = upsertVideoCoreResumePosition(this.positions, {
        key: KEY,
        positionSec: element.currentTime,
        updatedAt: (this.clock += 1_000),
      });
    } else if (action === 'clear') {
      this.positions = this.positions.filter((position) => position.key !== KEY);
    }
    return action;
  }

  resolved(): number {
    return resolveVideoCoreResumePosition(this.positions, KEY);
  }
}

type ResumeWriteOutcome = ReturnType<typeof resumeWriteAction>;

const stored = (positionSec: number): VideoCoreResumePosition[] => [
  { key: KEY, positionSec, updatedAt: 1 },
];

describe('resumeWriteAction', () => {
  it('saves a position the user really reached', () => {
    expect(resumeWriteAction({
      positionSec: 8.8,
      hasMedia: true,
      sessionMaxSec: 8.8,
    })).toBe('save');
  });

  it('skips a write from an element that has no media', () => {
    expect(resumeWriteAction({
      positionSec: 0,
      hasMedia: false,
      sessionMaxSec: 528,
    })).toBe('skip');
  });

  it('skips 0 from a session that never started, so the stored point survives', () => {
    expect(resumeWriteAction({
      positionSec: 0,
      hasMedia: true,
      sessionMaxSec: 0,
    })).toBe('skip');
  });

  it('clears when a started session went back to the very top', () => {
    expect(resumeWriteAction({
      positionSec: 0.4,
      hasMedia: true,
      sessionMaxSec: 528,
    })).toBe('clear');
  });

  it('clears on `ended` whatever the clock says afterwards', () => {
    expect(resumeWriteAction({
      positionSec: 0,
      hasMedia: false,
      sessionMaxSec: 0,
      finished: true,
    })).toBe('clear');
  });

  it('clears inside the end margin, and saves just outside it', () => {
    const durationSec = 1_400;
    expect(resumeWriteAction({
      positionSec: durationSec - RESUME_END_MARGIN_SEC,
      hasMedia: true,
      sessionMaxSec: durationSec,
      durationSec,
    })).toBe('clear');
    expect(resumeWriteAction({
      positionSec: durationSec - RESUME_END_MARGIN_SEC - 0.001,
      hasMedia: true,
      sessionMaxSec: durationSec,
      durationSec,
    })).toBe('save');
  });

  it('treats the meaningful floor the same way the store\'s reader does', () => {
    const below = RESUME_MIN_MEANINGFUL_SEC - 0.001;
    expect(resolveVideoCoreResumePosition(stored(below), KEY)).toBe(0);
    expect(resumeWriteAction({
      positionSec: below,
      hasMedia: true,
      sessionMaxSec: 0,
    })).toBe('skip');
    expect(resumeWriteAction({
      positionSec: RESUME_MIN_MEANINGFUL_SEC,
      hasMedia: true,
      sessionMaxSec: 0,
    })).toBe('save');
  });

  it('skips a clock that is not a number, or one that ran backwards past zero', () => {
    expect(resumeWriteAction({
      positionSec: Number.NaN,
      hasMedia: true,
      sessionMaxSec: 528,
    })).toBe('skip');
    expect(resumeWriteAction({
      positionSec: -1,
      hasMedia: true,
      sessionMaxSec: 528,
    })).toBe('skip');
  });

  it('ignores a duration the element does not know yet', () => {
    expect(resumeWriteAction({
      positionSec: 8.8,
      hasMedia: true,
      sessionMaxSec: 8.8,
      durationSec: Number.NaN,
    })).toBe('save');
    expect(resumeWriteAction({
      positionSec: 8.8,
      hasMedia: true,
      sessionMaxSec: 8.8,
      durationSec: null,
    })).toBe('save');
  });
});

describe('the sequences that used to delete a stored position', () => {
  it('opening an episode and leaving before it plays keeps the stored point', () => {
    const tracker = new TrackerModel(stored(8.8));
    const element = new ElementModel();

    // The `watch` payload arrived and the element mounted, but nothing ever decoded — the
    // silent-open stall this phase has chased since slice 24, or simply a user who left.
    element.load(1_400);
    expect(tracker.persist(element)).toBe('skip');
    // Teardown, still at the top of the file.
    expect(tracker.persist(element)).toBe('skip');

    expect(tracker.resolved()).toBe(8.8);
  });

  it('a teardown that lands after the element was emptied keeps the stored point', () => {
    const tracker = new TrackerModel();
    const element = new ElementModel();
    element.load(1_400);
    element.currentTime = 528;
    expect(tracker.persist(element)).toBe('save');
    expect(tracker.resolved()).toBe(528);

    // `video-core.tsx` reset the element in an earlier commit; this teardown reads that
    // reset clock, and the position it reports belongs to no one.
    element.empty();
    expect(tracker.persist(element)).toBe('skip');

    expect(tracker.resolved()).toBe(528);
  });

  it('the old unconditional write is what these two tests are about', () => {
    // Same inputs, the pre-slice rule: whatever the clock says, store it.
    const zeroed = upsertVideoCoreResumePosition(stored(8.8), {
      key: KEY,
      positionSec: 0,
      updatedAt: 2,
    });
    expect(resolveVideoCoreResumePosition(zeroed, KEY)).toBe(0);
  });

  it('deliberately going back to the top still clears the point', () => {
    const tracker = new TrackerModel(stored(8.8));
    const element = new ElementModel();
    element.load(1_400);
    element.currentTime = 528;
    expect(tracker.persist(element)).toBe('save');

    element.currentTime = 0;
    expect(tracker.persist(element)).toBe('clear');
    expect(tracker.resolved()).toBe(0);
  });

  it('finishing an episode still clears it', () => {
    const tracker = new TrackerModel(stored(8.8));
    const element = new ElementModel();
    element.load(1_400);
    element.currentTime = 1_399.9;
    expect(tracker.persist(element, true)).toBe('clear');
    expect(tracker.resolved()).toBe(0);
  });
});

describe('what a zeroed entry costs the user', () => {
  const row = (positionSec: number) => seanimeContinueWatching({
    resumePositions: [{ key: 'file:c:/media/ep1.mkv', positionSec, updatedAt: 5_000 }],
  });

  it('drops the Continue Watching row entirely, which is why `skip` exists', () => {
    expect(row(620)).toHaveLength(1);
    expect(row(0)).toHaveLength(0);
  });
});
