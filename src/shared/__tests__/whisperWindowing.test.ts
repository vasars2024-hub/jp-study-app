import { describe, expect, it } from 'vitest';
import {
  acceptSliceCues,
  commitWhisperWindow,
  repairCueEnds,
  whisperChunkCues,
  WHISPER_WINDOW_SEC,
  type WhisperTimedCue,
} from '../whisperWindowing';

const chunk = (start: number | null, end: number | null, text: string) => ({ timestamp: [start, end], text });

describe('whisperChunkCues (scorecard bug 30: a segment with no end time)', () => {
  it('closes a segment with no end at the next segment start instead of dropping it', () => {
    const cues = whisperChunkCues([chunk(1, null, 'いち'), chunk(4, 6, 'に')], 25);
    expect(cues.map((cue) => [cue.start, cue.end, cue.text])).toEqual([[1, 4, 'いち'], [4, 6, 'に']]);
    expect(cues[0].open).toBe(false);
  });

  it('closes the last open segment at the window edge and marks it cut', () => {
    const cues = whisperChunkCues([chunk(2, 5, 'まえ'), chunk(23.5, null, 'きれた')], 25);
    expect(cues[1]).toEqual({ start: 23.5, end: 25, text: 'きれた', open: true });
    expect(cues[0].open).toBe(false);
  });

  it('never yields a cue whose end is not after its start', () => {
    const cues = whisperChunkCues([chunk(25, null, 'はし'), chunk(3, 2, 'ぎゃく')], 25);
    for (const cue of cues) expect(cue.end).toBeGreaterThan(cue.start);
  });

  it('skips empty text and takes a missing start from the previous end', () => {
    const cues = whisperChunkCues([chunk(0, 2, 'a'), chunk(null, 3, 'b'), chunk(3, 4, '  ')], 25);
    expect(cues.map((cue) => [cue.start, cue.end, cue.text])).toEqual([[0, 2, 'a'], [2, 3, 'b']]);
  });
});

describe('repairCueEnds', () => {
  it('keeps a start-only cue, ending it at the next start or after a fallback', () => {
    expect(repairCueEnds([
      { start: 1, end: Number.NaN, text: 'a' },
      { start: 3, end: 2, text: 'b' },
      { start: 5, text: 'c' },
      { end: 9, text: 'no start' },
    ])).toEqual([
      { start: 1, end: 3, text: 'a' },
      { start: 3, end: 5, text: 'b' },
      { start: 5, end: 7, text: 'c' },
    ]);
  });
});

/** Replays the worker loop over a fake "model" that knows where the words are. */
function transcribeWithWindows(words: WhisperTimedCue[], totalSec: number): { cues: WhisperTimedCue[]; windows: number } {
  let startSec = 0;
  let committed = 0;
  const out: WhisperTimedCue[] = [];
  let windows = 0;
  while (startSec < totalSec && windows < 100) {
    windows += 1;
    const windowSec = Math.min(WHISPER_WINDOW_SEC, totalSec - startSec);
    const edge = startSec + windowSec;
    // What Whisper reports for this window: words fully inside, and a word cut by the edge
    // as a start with no end. Words cut at the window's START are not heard at all.
    const raw = words
      .filter((word) => word.start >= startSec && word.start < edge)
      .map((word) => chunk(word.start - startSec, word.end <= edge ? word.end - startSec : null, word.end <= edge ? word.text : `${word.text}…`));
    const step = commitWhisperWindow({
      cues: whisperChunkCues(raw, windowSec),
      windowStartSec: startSec,
      windowSec,
      audioEndSec: totalSec,
      committedUntilSec: committed,
    });
    committed = step.committedUntilSec;
    out.push(...step.kept);
    if (step.nextStartSec <= startSec) break;
    startSec = step.nextStartSec;
  }
  return { cues: out, windows };
}

describe('commitWhisperWindow', () => {
  it('re-reads a line cut by the window edge, so it arrives whole and once', () => {
    const words = [
      { start: 2, end: 5, text: 'ひとつめ' },
      { start: 22, end: 27, text: 'またがる' },
      { start: 30, end: 33, text: 'さいご' },
    ];
    const { cues } = transcribeWithWindows(words, 40);
    expect(cues.map((cue) => cue.text)).toEqual(['ひとつめ', 'またがる', 'さいご']);
    expect(cues[1]).toMatchObject({ start: 22, end: 27 });
  });

  it('never writes a line twice where windows overlap', () => {
    const words = Array.from({ length: 30 }, (_, index) => ({ start: index * 2, end: index * 2 + 1.5, text: `w${index}` }));
    const { cues } = transcribeWithWindows(words, 60);
    expect(cues.map((cue) => cue.text)).toEqual(words.map((word) => word.text));
  });

  it('advances by at least half a window, even when one segment fills it', () => {
    const words = [{ start: 1, end: 70, text: 'ながいながい' }];
    const { windows } = transcribeWithWindows(words, 70);
    expect(windows).toBeLessThanOrEqual(Math.ceil(70 / (WHISPER_WINDOW_SEC / 2)) + 1);
  });

  it('publishes everything in the last window', () => {
    const step = commitWhisperWindow({
      cues: whisperChunkCues([chunk(1, 2, 'a'), chunk(9, null, 'b')], 10),
      windowStartSec: 30,
      windowSec: 10,
      audioEndSec: 40,
      committedUntilSec: 0,
    });
    expect(step.kept.map((cue) => [cue.start, cue.end, cue.text])).toEqual([[31, 32, 'a'], [39, 40, 'b']]);
    expect(step.nextStartSec).toBe(40);
  });
});

describe('acceptSliceCues (the queue slices overlap)', () => {
  it('keeps a line spoken across the slice mark whole, and drops its tail from the next slice', () => {
    const first = acceptSliceCues(
      [{ start: 10, end: 12, text: 'a' }, { start: 28.5, end: 32, text: 'across' }, { start: 31, end: 33, text: 'next' }],
      { nominalEndSec: 30, isLast: false, committedUntilSec: 0 },
    );
    expect(first.kept.map((cue) => cue.text)).toEqual(['a', 'across']);
    const second = acceptSliceCues(
      [{ start: 30, end: 32, text: 'ross' }, { start: 31, end: 33, text: 'next' }],
      { nominalEndSec: 60, isLast: true, committedUntilSec: first.committedUntilSec },
    );
    expect(second.kept.map((cue) => cue.text)).toEqual(['next']);
  });
});
