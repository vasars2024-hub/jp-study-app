/**
 * DEFECT S5 regression guard — the whole-track cue list must not change identity per cue.
 *
 * The measurement that opened the bullet (2026-09-03, backup): with a clip playing and the
 * transcript block open, the renderer serviced **7 of 20** one-second timer ticks and the
 * longest gap between two of them was **10,966 ms**; with the transcript block closed and
 * the same clip still playing, **20 of 20** ticks and a 1,014 ms longest gap. So the stall
 * lives in the transcript block, not in the decoder — which ran 1,298 frames at 0 dropped
 * straight through the stalls — and not in throttling, which was ruled out with
 * `document.hasFocus()` true.
 *
 * The mechanism, found by reading the two files rather than by guessing at list size:
 * `VideoCoreSubtitleManager.getCues()` builds a **new array of new objects** on every call,
 * and `VideoCoreStudyOverlay`'s `cuechange` handler calls it once per spoken line. The
 * transcript panel then keys two things off that identity:
 *
 *  - `rows` is `useMemo(..., [cues])`, and the chunked tokenizer effect depends on `rows`.
 *    So every cue boundary ran `setTokenRows({})` and restarted the whole IPADIC pass from
 *    row 0 — on a 3,000-cue track that pass is a `setTimeout(…, 0)` chain 75 links long,
 *    each link tokenizing 40 lines and committing a growing object. It never finished, and
 *    it re-armed itself before it could, which is exactly why a *timer* recorder is what
 *    caught this: the queue it starves is the same one.
 *  - `TranscriptRow` is `React.memo`'d, and its `cue` prop came straight out of that array.
 *    New objects mean the shallow compare fails on **every** row, so each cue boundary
 *    re-rendered all ~3,000 rows — recomputing `readingLine(tokens)` over every one — when
 *    exactly two rows had changed.
 *
 * The fix is upstream of both: keep the previous array when the new one says the same
 * thing. This file pins the predicate, the updater, and that the overlay actually uses it.
 * A correct predicate nothing calls is the failure mode this repo has shipped before.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  sameVideoCoreCueList,
  stableCueList,
  type VideoCoreStudyCue,
} from '../../shared/videoCoreStudy';

const TRACK = 1;

/** An episode's worth of cues — the scale the defect was measured at. */
function buildTrack(count: number, trackNumber = TRACK): VideoCoreStudyCue[] {
  const cues: VideoCoreStudyCue[] = [];
  for (let i = 0; i < count; i += 1) {
    cues.push({
      index: i,
      trackNumber,
      text: `${i}行目のセリフです`,
      startMs: i * 3_400,
      endMs: i * 3_400 + 2_600,
    });
  }
  return cues;
}

/**
 * What the subtitle manager hands back: same content, nothing shared with the last call.
 * Structured-clone rather than a shallow copy, because the row objects are what
 * `React.memo` compares.
 */
function rebuild(cues: readonly VideoCoreStudyCue[]): VideoCoreStudyCue[] {
  return cues.map((cue) => ({ ...cue }));
}

describe('sameVideoCoreCueList', () => {
  it('is true for two separately built arrays with the same content', () => {
    const cues = buildTrack(700);
    const other = rebuild(cues);
    expect(other).not.toBe(cues);
    expect(other[0]).not.toBe(cues[0]);
    expect(sameVideoCoreCueList(cues, other)).toBe(true);
  });

  it('is true for the identical reference without walking it', () => {
    const cues = buildTrack(4);
    expect(sameVideoCoreCueList(cues, cues)).toBe(true);
  });

  it('is false when the track grows, which is how streamed events arrive', () => {
    const cues = buildTrack(700);
    expect(sameVideoCoreCueList(cues, buildTrack(701))).toBe(false);
  });

  it('is false for two empty-to-non-empty transitions in either direction', () => {
    expect(sameVideoCoreCueList([], buildTrack(1))).toBe(false);
    expect(sameVideoCoreCueList(buildTrack(1), [])).toBe(false);
  });

  /*
    The reason this compares all five fields instead of length and endpoints. A second
    language for the same release has the same cue count and near-identical timings, and a
    guard that missed the swap would leave the transcript, the analyser and mining reading
    the previous track with nothing on screen to say so.
  */
  it('is false when only the text differs, at the same count and timings', () => {
    const cues = buildTrack(700);
    const swapped = rebuild(cues);
    swapped[512] = { ...swapped[512], text: 'A different translation of the same line' };
    expect(swapped).toHaveLength(cues.length);
    expect(swapped[512].startMs).toBe(cues[512].startMs);
    expect(sameVideoCoreCueList(cues, swapped)).toBe(false);
  });

  it('is false when only the track number differs', () => {
    expect(sameVideoCoreCueList(buildTrack(20, 1), buildTrack(20, 2))).toBe(false);
  });

  it.each(['index', 'startMs', 'endMs'] as const)('is false when only %s differs', (field) => {
    const cues = buildTrack(20);
    const moved = rebuild(cues);
    moved[7] = { ...moved[7], [field]: moved[7][field] + 1 };
    expect(sameVideoCoreCueList(cues, moved)).toBe(false);
  });
});

describe('stableCueList keeps the identity every memo downstream is keyed on', () => {
  /*
    The count is the point, not the assertion shape. 700 cues at ~3.4 s apart is a
    24-minute episode, so this is one playthrough's worth of `cuechange` events.
  */
  const BOUNDARIES = 700;

  it('never replaces the array across a whole episode of cue boundaries', () => {
    const first = buildTrack(BOUNDARIES);
    let current: VideoCoreStudyCue[] = first;
    let replacements = 0;
    for (let i = 0; i < BOUNDARIES; i += 1) {
      const next = stableCueList(rebuild(current))(current);
      if (next !== current) replacements += 1;
      current = next;
    }
    expect(replacements).toBe(0);
    expect(current).toBe(first);
  });

  /*
    NEGATIVE CONTROL. The same loop with the guard removed — i.e. what the overlay did
    before this fix — must replace it every single time. Without this leg the assertion
    above is satisfied by a loop that never ran.
  */
  it('CONTROL: the unguarded assignment replaces it on every boundary', () => {
    const first = buildTrack(BOUNDARIES);
    let current: VideoCoreStudyCue[] = first;
    let replacements = 0;
    for (let i = 0; i < BOUNDARIES; i += 1) {
      const next = rebuild(current);
      if (next !== current) replacements += 1;
      current = next;
    }
    expect(replacements).toBe(BOUNDARIES);
    expect(current).not.toBe(first);
  });

  /*
    The `React.memo` half, stated as the number the panel actually pays. `TranscriptRow`'s
    shallow compare holds a row only when its `cue` prop is the same object.
  */
  it('holds every row memo, where the unguarded list holds none', () => {
    const before = buildTrack(700);
    const guarded = stableCueList(rebuild(before))(before);
    const unguarded = rebuild(before);
    const held = (list: readonly VideoCoreStudyCue[]): number =>
      list.reduce((count, cue, i) => (Object.is(cue, before[i]) ? count + 1 : count), 0);
    expect(held(guarded)).toBe(700);
    expect(held(unguarded)).toBe(0);
  });

  it('still adopts a genuine track swap rather than pinning the old one', () => {
    const russian = buildTrack(700, 4);
    const ukrainian = buildTrack(700, 5);
    expect(stableCueList(ukrainian)(russian)).toBe(ukrainian);
  });
});

/**
 * The ratchet. Comments are stripped first: the overlay explains this fix in prose right
 * above the code, so a raw-text match would pass on the explanation alone.
 */
function overlaySource(): string {
  return readFileSync(path.join(__dirname, '..', 'VideoCoreStudyOverlay.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the overlay routes every whole-track read through the guard', () => {
  it('guards the per-cue-boundary read, which is the one that caused the stall', () => {
    expect(overlaySource()).toContain(
      'setActiveCues(event.detail.cues);\n      setAllCues(stableCueList(manager.getCues()));',
    );
  });

  it('leaves no unguarded whole-track assignment anywhere in the file', () => {
    const source = overlaySource();
    expect(source).not.toMatch(/setAllCues\(manager\.getCues\(\)\)/);
    // Every non-empty assignment is wrapped; `setAllCues([])` is a deselect and needs no
    // guard, so it is excluded rather than silently counted as one.
    const assignments = source.match(/setAllCues\((?!\[\]\))/g) ?? [];
    const guarded = source.match(/setAllCues\(stableCueList\(/g) ?? [];
    expect(guarded).toHaveLength(assignments.length);
    expect(guarded.length).toBeGreaterThanOrEqual(7);
  });
});
