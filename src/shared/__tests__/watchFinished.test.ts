import { describe, expect, it } from 'vitest';
import {
  isWatchFinished,
  WATCH_FINISHED_FRACTION,
  watchFinishedProgress,
} from '../watchFinished';
import { isWatched, isContinueWatching } from '../mediaLibraryEntries';
import { WATCH_COMPLETE_FRACTION } from '../watchLibrary';
import { buildMediaHubSections } from '../mediaHub';
import { seanimeContinueWatching } from '../seanimeContinueWatching';
import { resumeWriteAction } from '../../media/videoCoreResumeWrite';
import { isFinished } from '../../renderer/components/media/upNext';
import type { MediaItem } from '../types';

const DURATION = 1_440;

function episode(positionSec: number, durationSec: number | undefined = DURATION): MediaItem {
  return {
    id: `ep-${positionSec}`,
    kind: 'video',
    title: 'Episode',
    fileName: 'ep.mkv',
    path: 'C:/Media/ep.mkv',
    addedAt: 1,
    positionSec,
    durationSec,
  } as MediaItem;
}

describe('isWatchFinished — the one finished rule', () => {
  it('is 90% of a measured duration', () => {
    expect(WATCH_FINISHED_FRACTION).toBe(0.9);
    expect(isWatchFinished(1_296, DURATION)).toBe(true);
    expect(isWatchFinished(1_295.9, DURATION)).toBe(false);
    expect(isWatchFinished(DURATION, DURATION)).toBe(true);
    // Past the end (a stale duration) is finished, not an error.
    expect(isWatchFinished(DURATION + 30, DURATION)).toBe(true);
  });

  it('makes no claim without a usable duration or position', () => {
    expect(isWatchFinished(7_000, undefined)).toBe(false);
    expect(isWatchFinished(7_000, null)).toBe(false);
    expect(isWatchFinished(7_000, 0)).toBe(false);
    expect(isWatchFinished(7_000, Number.NaN)).toBe(false);
    expect(isWatchFinished(Number.NaN, DURATION)).toBe(false);
    expect(isWatchFinished(undefined, DURATION)).toBe(false);
  });

  it('reports a clamped progress fraction', () => {
    expect(watchFinishedProgress(720, DURATION)).toBe(0.5);
    expect(watchFinishedProgress(-5, DURATION)).toBe(0);
    expect(watchFinishedProgress(2_000, DURATION)).toBe(1);
    expect(watchFinishedProgress(10, undefined)).toBeNull();
  });
});

/*
 * The defect this module exists for: five surfaces, four thresholds. Every one of them must
 * now flip on the same second. Checked on both sides of the boundary, because "always
 * finished" would pass the first half and "never" the second.
 */
describe('every surface agrees on the same boundary', () => {
  const before = 1_295;
  const at = 1_296;

  it('library tick and Continue shelf', () => {
    expect(isWatched(episode(at))).toBe(true);
    expect(isWatched(episode(before))).toBe(false);
    expect(isContinueWatching(episode(at))).toBe(false);
    expect(isContinueWatching(episode(before))).toBe(true);
  });

  it('Up next shelf ordering', () => {
    expect(isFinished(episode(at))).toBe(true);
    expect(isFinished(episode(before))).toBe(false);
  });

  it('the tracking library', () => {
    expect(WATCH_COMPLETE_FRACTION).toBe(WATCH_FINISHED_FRACTION);
  });

  it('Media Hub continue row', () => {
    const sections = buildMediaHubSections([episode(at), { ...episode(before), id: 'b' }]);
    expect(sections.continueWatching.map((item) => item.id)).toEqual(['b']);
  });

  it('Continue Watching rows', () => {
    const rows = (positionSec: number) => seanimeContinueWatching({
      resumePositions: [{ key: 'file:c:/media/ep.mkv', positionSec, updatedAt: 5 }],
      mediaItems: [{ ...episode(0), positionSec: undefined }],
    });
    expect(rows(at)).toHaveLength(0);
    expect(rows(before)).toHaveLength(1);
  });

  it('the resume store write', () => {
    const write = (positionSec: number) => resumeWriteAction({
      positionSec,
      hasMedia: true,
      sessionMaxSec: positionSec,
      durationSec: DURATION,
    });
    expect(write(at)).toBe('clear');
    expect(write(before)).toBe('save');
  });
});
