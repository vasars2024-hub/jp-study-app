import { describe, expect, it } from 'vitest';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  clampStudyPlaybackRate,
  cuePlaybackEndSec,
  cuePlaybackStartSec,
  evaluateVideoCoreDictation,
  isCueEndTransition,
  normalizeVideoCoreStudyPreferences,
  normalizeVideoCoreResumePositions,
  nextVideoCoreWhisperTrackNumber,
  resolveVideoCoreResumePosition,
  resolveStudyLoopSeekSec,
  stripAssCueText,
  upsertVideoCoreResumePosition,
  videoCoreResumeKey,
  whisperCuesToVideoCoreEvents,
  type VideoCoreStudyCue,
} from '../videoCoreStudy';

const cues: VideoCoreStudyCue[] = [
  { index: 0, trackNumber: 3, text: '一', startMs: 1000, endMs: 2000 },
  { index: 1, trackNumber: 3, text: '二', startMs: 3000, endMs: 4500 },
  { index: 2, trackNumber: 3, text: '三', startMs: 6000, endMs: 7000 },
];

describe('videoCoreStudy', () => {
  it('strips ASS presentation tags without changing the source cue', () => {
    const raw = '{\\an8}猫が\\N寝ている。';
    expect(stripAssCueText(raw)).toBe('猫が 寝ている。');
    expect(raw).toBe('{\\an8}猫が\\N寝ている。');
  });

  it('applies subtitle delay only to playback seeks', () => {
    expect(cuePlaybackStartSec(cues[1], 0.25)).toBe(3.25);
    expect(cuePlaybackEndSec(cues[1], -0.5)).toBe(4);
    expect(cues[1].startMs).toBe(3000);
  });

  it('resolves a secondary track against the same delayed playback clock', () => {
    expect(activeStudyCuesAtTime(cues, 3.2, 0.25).map((cue) => cue.index)).toEqual([]);
    expect(activeStudyCuesAtTime(cues, 3.3, 0.25).map((cue) => cue.index)).toEqual([1]);
    expect(activeStudyCuesAtTime(cues, 4.75, 0.25).map((cue) => cue.index)).toEqual([]);
  });

  it('finds adjacent cues from source time with bounded ends', () => {
    expect(adjacentStudyCue(cues, 3200, -1)?.index).toBe(0);
    expect(adjacentStudyCue(cues, 3200, 1)?.index).toBe(2);
    expect(adjacentStudyCue(cues, -1, -1)?.index).toBe(0);
    expect(adjacentStudyCue(cues, 8000, 1)?.index).toBe(2);
  });

  it('gives A-B repeat precedence over line repeat', () => {
    expect(resolveStudyLoopSeekSec(5, cues[1], 0, {
      lineLoop: true,
      abLoop: true,
      abStartSec: 2.2,
      abEndSec: 5,
    })).toBe(2.2);
  });

  it('repeats a line against the delayed playback boundary', () => {
    expect(resolveStudyLoopSeekSec(4.72, cues[1], 0.25, {
      lineLoop: true,
      abLoop: false,
      abStartSec: null,
      abEndSec: null,
    })).toBe(3.25);
  });

  it('recognizes cue-end transitions and clamps speed', () => {
    expect(isCueEndTransition(4.55, cues[1], 0)).toBe(true);
    expect(isCueEndTransition(5.2, cues[1], 0)).toBe(false);
    expect(clampStudyPlaybackRate(8)).toBe(3);
    expect(clampStudyPlaybackRate(Number.NaN)).toBe(1);
  });

  it('retains unrelated player preferences while normalizing study controls', () => {
    expect(normalizeVideoCoreStudyPreferences({
      playbackRate: 9,
      primarySubs: false,
      dualSubs: false,
      shadowingMode: true,
      subtitleFontSize: 100,
      preferredAudioLanguage: 'ja',
    })).toMatchObject({
      playbackRate: 3,
      primarySubs: false,
      dualSubs: false,
      shadowingMode: true,
      subtitleFontSize: 48,
      preferredAudioLanguage: 'ja',
    });
  });

  it('scores Japanese dictation without punctuation differences', () => {
    expect(evaluateVideoCoreDictation('猫が窓辺で寝ている', '猫が窓辺で寝ている。'))
      .toMatchObject({ exact: true, score: 100 });
  });

  it('converts Whisper seconds to exact VideoCore milliseconds on a new track', () => {
    expect(nextVideoCoreWhisperTrackNumber([1, 3, 4])).toBe(5);
    expect(whisperCuesToVideoCoreEvents([
      { start: 2.148, end: 5.148, text: '  猫が窓辺で寝ている。  ' },
      { start: 8, end: 8, text: 'invalid' },
    ], 5)).toEqual([
      expect.objectContaining({
        trackNumber: 5,
        text: '猫が窓辺で寝ている。',
        startTime: 2148,
        duration: 3000,
        codecID: 'S_TEXT/ASS',
      }),
    ]);
  });

  it('persists restart position by stable local-file identity and rejects the end', () => {
    const key = videoCoreResumeKey({
      playbackId: 'ephemeral-id',
      localFilePath: 'C:\\Anime\\Episode 01.mkv',
      mediaId: 154587,
      episodeNumber: 1,
    });
    expect(key).toBe('file:c:/anime/episode 01.mkv');
    const positions = upsertVideoCoreResumePosition([], {
      key,
      positionSec: 125.25,
      updatedAt: 1000,
    });
    expect(normalizeVideoCoreResumePositions([null, ...positions])).toEqual(positions);
    expect(resolveVideoCoreResumePosition(positions, key, 140)).toBe(125.25);
    expect(resolveVideoCoreResumePosition(positions, key, 128)).toBe(0);
  });
});
