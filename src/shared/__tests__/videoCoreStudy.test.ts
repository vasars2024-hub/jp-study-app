import { describe, expect, it } from 'vitest';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  clampStudyPlaybackRate,
  cuePlaybackEndSec,
  cuePlaybackStartSec,
  dismissVideoCoreComprehensionSuggestion,
  dismissVideoCoreShadowingSuggestion,
  evaluateVideoCoreDictation,
  isCueEndTransition,
  normalizeVideoCoreStudyPreferences,
  normalizeVideoCoreResumePositions,
  nextVideoCoreWhisperTrackNumber,
  recordVideoCoreComprehensionEvent,
  recordVideoCoreCueReplay,
  resolveVideoCoreResumePosition,
  resolveStudyLoopSeekSec,
  shouldSuggestVideoCoreComprehensionRescue,
  shouldSuggestVideoCoreShadowing,
  stripAssCueText,
  upsertVideoCoreResumePosition,
  videoCoreRescueScene,
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

  it('offers shadowing after three explicit replays of one cue in a bounded window', () => {
    const first = recordVideoCoreCueReplay(null, cues[1], 1_000);
    const second = recordVideoCoreCueReplay(first, cues[1], 2_000);
    const third = recordVideoCoreCueReplay(second, cues[1], 3_000);

    expect(first.replayCount).toBe(1);
    expect(shouldSuggestVideoCoreShadowing(second, cues[1], false)).toBe(false);
    expect(shouldSuggestVideoCoreShadowing(third, cues[1], false)).toBe(true);
    expect(shouldSuggestVideoCoreShadowing(third, cues[1], true)).toBe(false);
  });

  it('resets replay evidence for another cue or an expired window and honors dismissal', () => {
    const first = recordVideoCoreCueReplay(null, cues[1], 1_000);
    const dismissed = dismissVideoCoreShadowingSuggestion(
      recordVideoCoreCueReplay(
        recordVideoCoreCueReplay(first, cues[1], 2_000),
        cues[1],
        3_000,
      ),
    );

    expect(shouldSuggestVideoCoreShadowing(dismissed, cues[1], false)).toBe(false);
    expect(recordVideoCoreCueReplay(dismissed, cues[2], 4_000)).toMatchObject({
      replayCount: 1,
      dismissed: false,
    });
    expect(recordVideoCoreCueReplay(first, cues[1], 601_001)).toMatchObject({
      replayCount: 1,
      firstReplayAt: 601_001,
    });
  });

  it('offers a paused same-scene rescue only after dense lookup and rewind evidence', () => {
    const lookup1 = recordVideoCoreComprehensionEvent(null, 'lookup', cues[1], 1_000);
    const rewind1 = recordVideoCoreComprehensionEvent(lookup1, 'rewind', cues[1], 2_000);
    const lookup2 = recordVideoCoreComprehensionEvent(rewind1, 'lookup', cues[1], 3_000);
    const rewind2 = recordVideoCoreComprehensionEvent(lookup2, 'rewind', cues[0], 4_000);
    const paused = recordVideoCoreComprehensionEvent(rewind2, 'pause', cues[1], 5_000);

    expect(shouldSuggestVideoCoreComprehensionRescue(rewind2, cues[1], true, 5_000))
      .toBe(false);
    expect(shouldSuggestVideoCoreComprehensionRescue(paused, cues[1], false, 5_000))
      .toBe(false);
    expect(shouldSuggestVideoCoreComprehensionRescue(paused, cues[1], true, 5_000))
      .toBe(true);
    expect(shouldSuggestVideoCoreComprehensionRescue(
      dismissVideoCoreComprehensionSuggestion(paused),
      cues[1],
      true,
      5_000,
    )).toBe(false);
  });

  it('bounds comprehension evidence by time and nearby cues', () => {
    const first = recordVideoCoreComprehensionEvent(null, 'lookup', cues[0], 1_000);
    expect(recordVideoCoreComprehensionEvent(first, 'rewind', cues[0], 121_001))
      .toMatchObject({ lookupCount: 0, rewindCount: 1, firstEventAt: 121_001 });
    expect(recordVideoCoreComprehensionEvent(first, 'lookup', {
      index: 8,
      trackNumber: 3,
      startMs: 9_000,
      endMs: 10_000,
    }, 2_000)).toMatchObject({
      anchorCueIndex: 8,
      lookupCount: 1,
      firstEventAt: 2_000,
    });
  });

  it('builds an exact three-cue rescue loop around the difficult line', () => {
    expect(videoCoreRescueScene(cues, cues[1], 0.25)).toEqual({
      startSec: 1.25,
      endSec: 7.25,
      cueCount: 3,
      firstCueIndex: 0,
      lastCueIndex: 2,
    });
    expect(videoCoreRescueScene(cues, cues[0], 0)).toMatchObject({
      startSec: 1,
      endSec: 4.5,
      cueCount: 2,
      firstCueIndex: 0,
      lastCueIndex: 1,
    });
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
