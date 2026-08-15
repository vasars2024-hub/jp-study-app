/**
 * Stages F3/F4 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`.
 *
 * The claim under test is the plan's central policy: **Whisper's text wins.** The
 * reference translation is a referee, and offline it can lower a line's
 * confidence but may never rewrite it. The one case where the reference does
 * supply text is the one where Whisper supplied none.
 *
 * The second claim is that the comparison is fair — that two spellings of the
 * same sentence score as agreement rather than as a dispute, because a scorer
 * that flags correct lines is worse than no scorer at all.
 */
import { describe, expect, it } from 'vitest';
import {
  bigramDice,
  decideFusedWindow,
  decideFusedWindows,
  meanFusionConfidence,
  normalizeForFusionCompare,
  windowSourceText,
  FUSION_AGREE_SCORE,
  type FusionCue,
} from '../subtitleFusionCore';

const cue = (start: number, end: number, text: string): FusionCue => ({ start, end, text });

describe('normalizeForFusionCompare', () => {
  it('folds katakana to hiragana so the two writers agree on a loanword', () => {
    expect(normalizeForFusionCompare('ジュース')).toBe('じゅーす');
    expect(normalizeForFusionCompare('じゅーす')).toBe('じゅーす');
  });

  it('keeps the prolonged sound mark, which is a mora and not punctuation', () => {
    // Dropping ー would make these two different words compare as identical.
    expect(normalizeForFusionCompare('ビール')).not.toBe(normalizeForFusionCompare('ビル'));
    expect(normalizeForFusionCompare('ビール')).toBe('びーる');
  });

  it('strips punctuation and spacing from both scripts, and applies NFKC', () => {
    expect(normalizeForFusionCompare('こんにちは、世界！')).toBe('こんにちは世界');
    expect(normalizeForFusionCompare('  hello, world.  ')).toBe('helloworld');
    // NFKC widens nothing back and folds no case: the full-width forms become
    // their ASCII equivalents and stay upper case.
    expect(normalizeForFusionCompare('ＡＢＣ１２３')).toBe('ABC123');
  });
});

describe('bigramDice', () => {
  it('is 1 for identical text and 0 when either side is empty', () => {
    expect(bigramDice('あいうえお', 'あいうえお')).toBe(1);
    expect(bigramDice('', 'あいうえお')).toBe(0);
    expect(bigramDice('あいうえお', '')).toBe(0);
  });

  it('compares a one-character string as itself rather than scoring it zero', () => {
    // A single character has no bigrams at all, so the naive implementation gives
    // every one-character cue a score of 0 against everything — which would flag
    // every はい and ええ in an episode as disputed.
    expect(bigramDice('猫', '猫')).toBe(1);
    expect(bigramDice('猫', '犬')).toBe(0);
  });

  it('scores partial overlap between and one for full containment of shared bigrams', () => {
    const partial = bigramDice('きょうはいいてんきです', 'きょうはあめです');
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    expect(bigramDice('まったくちがう', 'ぜんぜんべつ')).toBe(0);
  });
});

describe('decideFusedWindow — Whisper wins, the reference referees', () => {
  it('keeps Whisper verbatim and raises confidence when the reference agrees', () => {
    const decision = decideFusedWindow(0, '今日はいい天気ですね', '今日はいい天気ですね');
    expect(decision.text).toBe('今日はいい天気ですね');
    expect(decision.basis).toBe('whisper');
    expect(decision.score).toBe(1);
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it('still keeps Whisper verbatim when the reference disagrees, only flagged', () => {
    const decision = decideFusedWindow(1, '橋を渡った', '完全に無関係な文章です');
    // The policy in one assertion: a disputed line is Whisper's words, not the
    // translator's. The learner hears the audio; a fluent paraphrase would not
    // match it.
    expect(decision.text).toBe('橋を渡った');
    expect(decision.basis).toBe('whisper-unverified');
    expect(decision.score).toBeLessThan(FUSION_AGREE_SCORE);
    expect(decision.confidence).toBeLessThan(0.5);
  });

  it('falls back to the reference only when Whisper produced nothing', () => {
    const decision = decideFusedWindow(2, '   ', '走って行った');
    expect(decision.text).toBe('走って行った');
    expect(decision.basis).toBe('reference');
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.confidence).toBeLessThan(0.35);
  });

  it('marks a window with neither candidate empty, so it drops out of the track', () => {
    const decision = decideFusedWindow(3, '', '');
    expect(decision).toEqual({ windowIndex: 3, text: '', basis: 'empty', score: 0, confidence: 0 });
  });

  it('keeps Whisper unrefereed, not disputed, when no reference was produced', () => {
    const decision = decideFusedWindow(4, '静かな夜だ', '');
    expect(decision.text).toBe('静かな夜だ');
    // Its own basis, not `whisper`. The text is identical to an agreed line's,
    // so the basis is the only thing that can carry "nothing checked this" —
    // and while it read `whisper`, a translator-less run reported itself to the
    // user as fully cross-checked.
    expect(decision.basis).toBe('whisper-unrefereed');
    expect(decision.score).toBe(0);
    expect(decision.confidence).toBeLessThan(0.6);
  });

  it('treats a katakana/hiragana spelling difference as agreement, not a dispute', () => {
    const decision = decideFusedWindow(5, 'ジュースを飲んだ', 'じゅーすを飲んだ');
    expect(decision.basis).toBe('whisper');
    expect(decision.text).toBe('ジュースを飲んだ');
  });
});

describe('decideFusedWindows', () => {
  it('degrades to exactly the F2 output when no reference exists at all', () => {
    const decisions = decideFusedWindows(['あいう', '', 'かきく'], []);
    expect(decisions.map((d) => d.text)).toEqual(['あいう', '', 'かきく']);
    // Exactly the F2 text, and every line says so: this is the whisper-only
    // baseline wearing a fusion filename, which is the one thing the track must
    // not be able to hide.
    expect(decisions.map((d) => d.basis))
      .toEqual(['whisper-unrefereed', 'empty', 'whisper-unrefereed']);
  });

  it('pairs references by window index, tolerating a short or gappy array', () => {
    const decisions = decideFusedWindows(['', '', ''], ['一番目', undefined as unknown as string]);
    expect(decisions.map((d) => d.basis)).toEqual(['reference', 'empty', 'empty']);
    expect(decisions[0].text).toBe('一番目');
  });
});

describe('meanFusionConfidence', () => {
  it('averages only the windows that produced a line', () => {
    const decisions = decideFusedWindows(
      ['今日はいい天気ですね', '', '橋を渡った'],
      ['今日はいい天気ですね', '', '完全に無関係な文章です'],
    );
    const mean = meanFusionConfidence(decisions);
    // Two kept lines: one agreed (high), one disputed (0.35). A dropped window is
    // not a line the track claims badly, so counting it as zero would understate.
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.95);
    expect(meanFusionConfidence(decisions.slice(1, 2))).toBe(0);
  });

  it('is 0 for a track with nothing in it', () => {
    expect(meanFusionConfidence([])).toBe(0);
  });
});

describe('windowSourceText', () => {
  const cues = [cue(0, 1, 'Good morning.'), cue(1, 2, 'Did you sleep well?'), cue(5, 6, 'Later.')];

  it('joins a merged window’s cues into one passage to translate', () => {
    expect(windowSourceText({ startSec: 0, endSec: 2, cueIndices: [0, 1] }, cues))
      .toBe('Good morning. Did you sleep well?');
  });

  it('drops blank cues and survives an index the cue list does not have', () => {
    expect(windowSourceText({ startSec: 0, endSec: 1, cueIndices: [0, 9] }, cues))
      .toBe('Good morning.');
  });
});
