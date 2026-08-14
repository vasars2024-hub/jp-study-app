/**
 * Stages F1/F2 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`.
 *
 * The two behaviours worth guarding here are the ones a later refactor would break
 * silently: that songs and signs never reach Whisper (they are what it hallucinates
 * on), and that merging respects the window cap even when the gap rule says merge —
 * an oversized window is an oversized IPC payload and a Whisper timeout.
 */
import { describe, expect, it } from 'vitest';
import {
  isSignCue,
  isSongCue,
  planAsrWindows,
  selectDialogueCues,
  windowCuesToSubtitleCues,
  FUSION_MAX_WINDOW_SEC,
  FUSION_TARGET_WINDOW_SEC,
  type FusionCue,
} from '../subtitleFusionCore';
import { parseSubtitles } from '../subtitleCues';
import { cuesToSrt } from '../subtitlesExport';

const cue = (start: number, end: number, text = 'line', style?: string): FusionCue =>
  (style ? { start, end, text, style } : { start, end, text });

describe('selectDialogueCues', () => {
  it('keeps spoken lines and orders them by time', () => {
    const selection = selectDialogueCues([cue(10, 11, 'second'), cue(1, 2, 'first')]);
    expect(selection.cues.map((c) => c.text)).toEqual(['first', 'second']);
    expect(selection.excluded).toEqual([]);
  });

  it('drops music-glyph lines as songs', () => {
    const selection = selectDialogueCues([cue(1, 3, '♪ far away ♪'), cue(4, 5, 'talk')]);
    expect(selection.cues.map((c) => c.text)).toEqual(['talk']);
    expect(selection.excluded).toEqual([{ reason: 'music', cue: cue(1, 3, '♪ far away ♪') }]);
  });

  it('drops signs and karaoke by ASS style name, whole tokens only', () => {
    const selection = selectDialogueCues([
      cue(1, 2, 'CLASS 2-B', 'SignsTitles'),
      cue(3, 4, 'kimi wo', 'OP-Romaji'),
      cue(5, 6, 'stop right there', 'Default'),
      // `Top` must not match the `op` song token.
      cue(7, 8, 'up here', 'Top'),
    ]);
    expect(selection.cues.map((c) => c.text)).toEqual(['stop right there', 'up here']);
    expect(selection.excluded.map((e) => e.reason)).toEqual(['sign', 'music']);
  });

  it('drops cues with no text or no duration', () => {
    const selection = selectDialogueCues([cue(1, 2, '   '), cue(3, 3, 'zero length')]);
    expect(selection.cues).toEqual([]);
    expect(selection.excluded.map((e) => e.reason)).toEqual(['empty', 'empty']);
  });

  it('classifies a real ASS block end to end', () => {
    const ass = [
      '[Script Info]',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Are you listening?',
      'Dialogue: 0,0:00:04.00,0:00:06.00,Sign_Board,,0,0,0,,{\\pos(10,10)}CLOSED',
      'Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,I said {\\i1}listen{\\i0}.',
    ].join('\n');
    const selection = selectDialogueCues(parseSubtitles(ass));
    expect(selection.cues.map((c) => c.text)).toEqual(['Are you listening?', 'I said listen.']);
    expect(selection.excluded.map((e) => e.reason)).toEqual(['sign']);
  });
});

describe('isSongCue / isSignCue', () => {
  it('reads the glyph even with no style', () => {
    expect(isSongCue(cue(0, 1, '🎵 la la'))).toBe(true);
    expect(isSongCue(cue(0, 1, 'la la'))).toBe(false);
  });

  it('separates the two reasons', () => {
    expect(isSignCue(cue(0, 1, 'x', 'Typesetting'))).toBe(true);
    expect(isSongCue(cue(0, 1, 'x', 'Typesetting'))).toBe(false);
    expect(isSongCue(cue(0, 1, 'x', 'ED2 Kanji'))).toBe(true);
  });
});

describe('planAsrWindows', () => {
  it('pads a lone cue on both sides', () => {
    expect(planAsrWindows([cue(10, 12)], { padSec: 0.25 })).toEqual([
      { startSec: 9.75, endSec: 12.25, cueIndices: [0] },
    ]);
  });

  it('never starts before zero', () => {
    expect(planAsrWindows([cue(0.1, 1)])[0].startSec).toBe(0);
  });

  it('merges cues inside the gap and splits at a larger one', () => {
    const windows = planAsrWindows(
      [cue(1, 2), cue(2.2, 3), cue(9, 10)],
      { mergeGapSec: 0.4, padSec: 0.25 },
    );
    expect(windows).toEqual([
      { startSec: 0.75, endSec: 3.25, cueIndices: [0, 1] },
      { startSec: 8.75, endSec: 10.25, cueIndices: [2] },
    ]);
  });

  it('stops merging at the soft target even when every gap is small', () => {
    // Twenty back-to-back 2 s cues: the gap rule alone would make one 40 s window.
    const cues = Array.from({ length: 20 }, (_, i) => cue(i * 2, i * 2 + 2));
    const windows = planAsrWindows(cues);
    expect(windows.length).toBeGreaterThan(1);
    for (const window of windows) {
      expect(window.endSec - window.startSec).toBeLessThanOrEqual(FUSION_TARGET_WINDOW_SEC);
    }
    // Every cue is still covered exactly once, in order.
    expect(windows.flatMap((w) => w.cueIndices)).toEqual(cues.map((_, i) => i));
  });

  it('gives a contiguous caption track one window per cue', () => {
    // The shape measured on a real YouTube English caption track: 38 cues, mean
    // length 7.89 s, and every single gap zero. Before the soft target existed
    // this collapsed to ~11 thirty-second windows — the grid the feature replaces.
    const cues = Array.from({ length: 38 }, (_, i) => cue(i * 7.89, (i + 1) * 7.89));
    const windows = planAsrWindows(cues);
    expect(windows).toHaveLength(38);
    expect(windows.every((w) => w.cueIndices.length === 1)).toBe(true);
    expect(windows[0].endSec - windows[0].startSec).toBeLessThan(FUSION_MAX_WINDOW_SEC / 2);
  });

  it('truncates a single over-long cue rather than dropping it', () => {
    const [window] = planAsrWindows([cue(0, 90)], { maxWindowSec: 30 });
    expect(window.cueIndices).toEqual([0]);
    expect(window.endSec - window.startSec).toBe(30);
  });

  it('clamps the tail to the media duration', () => {
    expect(planAsrWindows([cue(58, 59.9)], { durationSec: 60 })[0].endSec).toBe(60);
  });

  it('drops a window that padding cannot make long enough', () => {
    expect(planAsrWindows([cue(59.99, 60)], { durationSec: 60, padSec: 0 })).toEqual([]);
  });
});

describe('windowCuesToSubtitleCues', () => {
  const cues = [cue(1, 2, 'a'), cue(2.2, 3, 'b'), cue(9, 10, 'c')];
  const windows = planAsrWindows(cues);

  it('spans the merged cues with one line instead of duplicating the blob', () => {
    expect(windowCuesToSubtitleCues(windows, cues, ['あいうえお', 'かきくけこ'])).toEqual([
      { start: 1, end: 3, text: 'あいうえお' },
      { start: 9, end: 10, text: 'かきくけこ' },
    ]);
  });

  it('skips a window Whisper returned nothing for', () => {
    expect(windowCuesToSubtitleCues(windows, cues, ['  ', 'かきくけこ'])).toEqual([
      { start: 9, end: 10, text: 'かきくけこ' },
    ]);
  });
});

describe('the fused cues feed the existing SRT writer', () => {
  // `shared/subtitlesExport.ts` numbers every cue it is given, so what keeps a
  // blank window out of the file is `windowCuesToSubtitleCues`, not the writer.
  it('produces a file with no empty numbered blocks', () => {
    const cues = [cue(1, 2, 'a'), cue(9, 10, 'c')];
    const windows = planAsrWindows(cues);
    const srt = cuesToSrt(windowCuesToSubtitleCues(windows, cues, ['', 'かきくけこ']));
    expect(srt).toBe('1\n00:00:09,000 --> 00:00:10,000\nかきくけこ\n');
  });
});
