import { describe, expect, it } from 'vitest';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  bridgedSecondaryCuesAtTime,
  SECONDARY_CUE_BRIDGE_MS,
  clampStudyPlaybackRate,
  cuePlaybackEndSec,
  cuePlaybackStartSec,
  transcriptSeekSec,
  dismissVideoCoreComprehensionSuggestion,
  dismissVideoCoreShadowingSuggestion,
  evaluateVideoCoreDictation,
  isCueEndTransition,
  normalizeVideoCoreStudyPreferences,
  normalizeVideoCoreResumePositions,
  SECONDARY_SUB_LANG_LABELS,
  SECONDARY_SUB_LANGS,
  shortLangTag,
  SUBTITLE_FONT_CHOICES,
  SUBTITLE_FONT_STACKS,
  toSubtitleFontChoice,
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

  /*
    The regression that let 633 of one track's 2,650 cues through unstripped: a karaoke
    template marker sits between the brace and the backslash, so a rule anchored on `{\`
    matched none of them. Per-letter blocks are the shape that release actually ships.
  */
  it('strips a braced override block that does not open with a backslash', () => {
    expect(stripAssCueText('T{*\\fs30.235\\fax-0.575}a{*\\fs30.471}n{*\\fax-0.56}a'))
      .toBe('Tana');
    expect(stripAssCueText('{\\k23}こん{\\k18}にちは')).toBe('こんにちは');
    // The documented boundary, pinned so a later widening is a deliberate act: a template
    // marker carrying no backslash is left in, for the same reason `{laughs}` is.
    expect(stripAssCueText('{=12}{\\k23}こんにちは')).toBe('{=12}こんにちは');
  });

  it('treats an ASS hard space as a space', () => {
    expect(stripAssCueText('Itsuka\\hKotori')).toBe('Itsuka Kotori');
  });

  /*
    The deliberate limit on the widening. An SRT stage direction is real content, and a
    study card that silently loses it is worse than one that keeps a stray brace.
  */
  it('leaves a braced block with no backslash alone', () => {
    expect(stripAssCueText('{laughs} そうですね')).toBe('{laughs} そうですね');
  });

  it('applies subtitle delay only to playback seeks', () => {
    expect(cuePlaybackStartSec(cues[1], 0.25)).toBe(3.25);
    expect(cuePlaybackEndSec(cues[1], -0.5)).toBe(4);
    expect(cues[1].startMs).toBe(3000);
  });

  it('lands a transcript jump before the line, and never before the file', () => {
    // cues[1] starts at 3s: a 1s run-up puts playback at 2s.
    expect(transcriptSeekSec(cues[1], 0, 1)).toBe(2);
    // The run-up is applied after the delay, not instead of it.
    expect(transcriptSeekSec(cues[1], 0.25, 1)).toBe(2.25);
    // A line inside the first second cannot seek negative.
    expect(transcriptSeekSec({ startMs: 400 }, 0, 1)).toBe(0);
    // Cue navigation passes no run-up and must be unaffected.
    expect(transcriptSeekSec(cues[1], 0.25, 0)).toBe(cuePlaybackStartSec(cues[1], 0.25));
  });

  it('clamps the seek step to a range a shortcut can actually use', () => {
    // The user picks this (5s -> 7s, say); the clamp is what stops a hand-edited
    // preferences file producing a shortcut that seeks to the end of the episode.
    expect(normalizeVideoCoreStudyPreferences({ seekStepSec: 7 }).seekStepSec).toBe(7);
    expect(normalizeVideoCoreStudyPreferences({ seekStepSec: 0 }).seekStepSec).toBe(1);
    expect(normalizeVideoCoreStudyPreferences({ seekStepSec: 9999 }).seekStepSec).toBe(60);
    expect(normalizeVideoCoreStudyPreferences({ seekStepSec: 7.4 }).seekStepSec).toBe(7);
    expect(normalizeVideoCoreStudyPreferences({}).seekStepSec).toBe(5);
    expect(normalizeVideoCoreStudyPreferences({ seekStepSec: Number.NaN }).seekStepSec).toBe(5);
  });

  it('resolves a secondary track against the same delayed playback clock', () => {
    expect(activeStudyCuesAtTime(cues, 3.2, 0.25).map((cue) => cue.index)).toEqual([]);
    expect(activeStudyCuesAtTime(cues, 3.3, 0.25).map((cue) => cue.index)).toEqual([1]);
    expect(activeStudyCuesAtTime(cues, 4.75, 0.25).map((cue) => cue.index)).toEqual([]);
  });

  it('bridges the second line across a short gap and never across a long one', () => {
    // DEFECT S3. Gap 0→1 is 1,000 ms, gap 1→2 is 1,500 ms, and the bridge is 1,200 ms.
    // No delay here: the delayed clock is covered by the case above.
    expect(bridgedSecondaryCuesAtTime(cues, 2.5, 0).map((cue) => cue.index)).toEqual([0]);
    // The bridge is bounded by the GAP, not by elapsed time — the whole 1,000 ms is
    // carried, right up to the instant the next cue takes over.
    expect(bridgedSecondaryCuesAtTime(cues, 2.999, 0).map((cue) => cue.index)).toEqual([0]);
    expect(bridgedSecondaryCuesAtTime(cues, 3.0, 0).map((cue) => cue.index)).toEqual([1]);
    // 1,500 ms is longer than the bridge, so nothing is held at ANY point in it —
    // not even at its start, which is what stops the fix becoming a second flicker.
    expect(bridgedSecondaryCuesAtTime(cues, 4.6, 0)).toEqual([]);
    expect(bridgedSecondaryCuesAtTime(cues, 5.9, 0)).toEqual([]);
    // Before the first cue there is nothing to hold, and after the last one there is
    // no successor to bound the gap, so the closing line does not stick to the screen.
    expect(bridgedSecondaryCuesAtTime(cues, 0.5, 0)).toEqual([]);
    expect(bridgedSecondaryCuesAtTime(cues, 7.1, 0)).toEqual([]);
    // An active cue always outranks a bridge, and the delay still applies to both.
    expect(bridgedSecondaryCuesAtTime(cues, 3.3, 0.25).map((cue) => cue.index)).toEqual([1]);
    expect(bridgedSecondaryCuesAtTime(cues, 2.9, 0.25).map((cue) => cue.index)).toEqual([0]);
  });

  it('carries every simultaneous line across a bridged gap, not just one', () => {
    const simultaneous: VideoCoreStudyCue[] = [
      { index: 0, trackNumber: 3, text: 'a', startMs: 0, endMs: 1000 },
      { index: 1, trackNumber: 3, text: 'b', startMs: 200, endMs: 1000 },
      { index: 2, trackNumber: 3, text: 'c', startMs: 1600, endMs: 2000 },
    ];
    expect(bridgedSecondaryCuesAtTime(simultaneous, 1.2, 0).map((cue) => cue.index))
      .toEqual([0, 1]);
  });

  it('holds the gap the measured harvest track actually has', () => {
    // The p50 gap on `harvest-ja-mt7ed4mr-ccxg8f.ass` is 650 ms and its p90 is 3,050 ms
    // (286 merged spans, 285 gaps). The default has to cover the first and refuse the
    // second, or S3's fixture readings do not transfer to a real track.
    const p50: VideoCoreStudyCue[] = [
      { index: 0, trackNumber: 1, text: 'x', startMs: 0, endMs: 1000 },
      { index: 1, trackNumber: 1, text: 'y', startMs: 1650, endMs: 2650 },
    ];
    const p90: VideoCoreStudyCue[] = [
      { index: 0, trackNumber: 1, text: 'x', startMs: 0, endMs: 1000 },
      { index: 1, trackNumber: 1, text: 'y', startMs: 4050, endMs: 5050 },
    ];
    expect(SECONDARY_CUE_BRIDGE_MS).toBe(1200);
    expect(bridgedSecondaryCuesAtTime(p50, 1.3, 0).map((cue) => cue.index)).toEqual([0]);
    expect(bridgedSecondaryCuesAtTime(p90, 1.3, 0)).toEqual([]);
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

  it('counts missing or extra long-vowel marks as dictation mistakes', () => {
    expect(evaluateVideoCoreDictation('ビル', 'ビール')).toMatchObject({ exact: false, score: 67 });
    expect(evaluateVideoCoreDictation('ビール', 'ビル')).toMatchObject({ exact: false, score: 67 });
    expect(evaluateVideoCoreDictation('「ﾋﾞｰﾙ！」', 'ビール')).toMatchObject({
      exact: true, score: 100, answer: 'ビール', expected: 'ビール',
    });
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

describe('subtitle appearance and dual-subtitle language preferences', () => {
  it('defaults the new appearance knobs and keeps the cue readout off', () => {
    const prefs = normalizeVideoCoreStudyPreferences(null);
    expect(prefs.subtitleFontFamily).toBe('default');
    expect(prefs.subtitleFontWeight).toBe(600);
    expect(prefs.subtitleOutline).toBe(true);
    // The readout sits in the middle of the picture; it has to be asked for.
    expect(prefs.cueTimingReadout).toBe(false);
    expect(prefs.secondarySubLang).toBe('en');
  });

  it('keeps stored values it recognises', () => {
    const prefs = normalizeVideoCoreStudyPreferences({
      subtitleFontFamily: 'mincho',
      subtitleFontWeight: 800,
      subtitleOutline: false,
      cueTimingReadout: true,
      secondarySubLang: 'ru',
    });
    expect(prefs).toMatchObject({
      subtitleFontFamily: 'mincho',
      subtitleFontWeight: 800,
      subtitleOutline: false,
      cueTimingReadout: true,
      secondarySubLang: 'ru',
    });
  });

  it('falls back rather than trusting a font or language it does not offer', () => {
    const prefs = normalizeVideoCoreStudyPreferences({
      subtitleFontFamily: 'comic-sans',
      secondarySubLang: 'tlh',
    });
    expect(prefs.subtitleFontFamily).toBe('default');
    expect(prefs.secondarySubLang).toBe('en');
  });

  it('clamps and snaps a hand-edited weight to something a font can select', () => {
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontWeight: 637 }).subtitleFontWeight)
      .toBe(600);
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontWeight: 5000 }).subtitleFontWeight)
      .toBe(800);
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontWeight: 50 }).subtitleFontWeight)
      .toBe(400);
  });

  it('narrows a raw select value the same way the normalizer does', () => {
    expect(toSubtitleFontChoice('mincho')).toBe('mincho');
    expect(toSubtitleFontChoice('nonsense')).toBe('default');
  });

  it('keeps a stored "gothic" choice valid: it is the default Yu Gothic face', () => {
    // Subtitle audit 2: "App font" and "Gothic" painted the same face and were merged.
    expect(SUBTITLE_FONT_CHOICES).toEqual(['default', 'mincho', 'universal']);
    expect(toSubtitleFontChoice('gothic')).toBe('default');
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontFamily: 'gothic' }).subtitleFontFamily)
      .toBe('default');
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontFamily: 'mincho' }).subtitleFontFamily)
      .toBe('mincho');
  });

  it('offers a stack for every font choice, each ending in a generic family', () => {
    for (const choice of SUBTITLE_FONT_CHOICES) {
      const stack = SUBTITLE_FONT_STACKS[choice];
      if (choice === 'default') {
        // Empty on purpose: it means "inherit the stylesheet", not "impose a family".
        expect(stack).toBe('');
        continue;
      }
      expect(stack).toMatch(/(sans-serif|serif)$/);
    }
  });

  it('names every offered language in itself', () => {
    for (const code of SECONDARY_SUB_LANGS) {
      expect(SECONDARY_SUB_LANG_LABELS[code]).toBeTruthy();
    }
  });
});

describe('shortLangTag', () => {
  it('normalizes the three spellings a track can use for one language', () => {
    expect(shortLangTag('ja')).toBe('ja');
    expect(shortLangTag('jpn')).toBe('ja');
    expect(shortLangTag('ja-JP')).toBe('ja');
    expect(shortLangTag('JA_jp')).toBe('ja');
  });

  it('maps the ISO 639-2 codes that truncation would get wrong', () => {
    // `jpn`.slice(0, 2) is `jp`, which is not a language code and matches nothing.
    expect(shortLangTag('jpn')).not.toBe('jp');
    expect(shortLangTag('eng')).toBe('en');
    expect(shortLangTag('rus')).toBe('ru');
    expect(shortLangTag('chi')).toBe('zh');
    expect(shortLangTag('ger')).toBe('de');
  });

  it('returns an empty tag for absent metadata rather than guessing', () => {
    expect(shortLangTag(null)).toBe('');
    expect(shortLangTag(undefined)).toBe('');
    expect(shortLangTag('  ')).toBe('');
  });
});
