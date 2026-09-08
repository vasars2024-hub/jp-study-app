/**
 * D332, measured live 2026-09-08 (pid 4652, window 2, real local evaluator):
 * Mirror Writing graded the draft **82**, printed `Grammar Accuracy 96/100`
 * from a catalog key — and then printed
 * `Sentence endings and script balance look stable for this level.`
 * as a hardcoded English literal. Every label around the verdict was
 * translated; the verdict itself, which is the whole feature, was not.
 *
 * The evaluator is a plain module and cannot call `useT()`, so it carries a
 * key beside each sentence and the renderer resolves it. That contract is only
 * worth anything if EVERY branch carries one and every key really exists, so
 * this suite drives the rubric through drafts chosen to reach each branch and
 * checks both halves against the English catalog.
 */
import { describe, expect, it } from 'vitest';
import { GAME_ARENA_CHROME_EN } from '../i18n/gameArena/en';
import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';
import { evaluateMirrorWriting, type MirrorAxis } from '../../renderer/games/mirrorWriting/evaluator';

const AXES: MirrorAxis[] = ['grammar', 'vocabulary', 'flow', 'fidelity'];
const local = { ...DEFAULT_GAME_ARENA_SETTINGS, mirrorBackend: 'local' as const };
const text = MIRROR_TEXTS[0];

/** Drafts picked to walk opposite sides of each branch in the rubric. */
const DRAFTS = [
  '',
  'hello I am a student',
  'こんにちは。',
  'こんにちは。私はアレックスです。学生です。毎日日本語を勉強しています。',
  'こんにちは。私はアレックスです。そして学生です。毎日日本語を勉強しています。ので楽しいです。',
  'あ。い。う。え。お。か。き。く。',
];

const evaluateAll = async () => {
  const out = [];
  for (const draft of DRAFTS) {
    for (const t of MIRROR_TEXTS.slice(0, 4)) {
      const result = await evaluateMirrorWriting(local, t, draft, true);
      expect(result.ok, `local rubric refused a draft of ${draft.length} chars`).toBe(true);
      if (result.ok) out.push(result.evaluation);
    }
  }
  return out;
};

describe('Mirror Writing explains itself in the UI language', () => {
  // Mutation control: delete `messageKey` from any one tip in
  // `localRubricEvaluate` and this case goes red naming that sentence.
  it('gives every rubric tip a catalog key that exists', async () => {
    const seen = new Set<string>();
    for (const evaluation of await evaluateAll()) {
      for (const axis of AXES) {
        for (const tip of evaluation.axes[axis].tips) {
          expect(tip.messageKey, `${axis} tip without a key: ${tip.message}`).toBeTruthy();
          expect(GAME_ARENA_CHROME_EN, `missing catalog entry ${tip.messageKey}`).toHaveProperty(
            tip.messageKey!,
          );
          seen.add(tip.messageKey!);
        }
      }
    }
    // Guard against a vacuous pass: the drafts above must actually reach a
    // spread of branches, not just the four "looks fine" ones.
    expect(seen.size, `only reached ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(10);
  });

  // Mutation control: drop `summaryKey` from the returned evaluation and this
  // case alone goes red; the tips case above stays green.
  it('gives the one-line verdict a catalog key that exists', async () => {
    const seen = new Set<string>();
    for (const evaluation of await evaluateAll()) {
      expect(evaluation.summaryKey, `no summary key for total ${evaluation.total}`).toBeTruthy();
      expect(GAME_ARENA_CHROME_EN).toHaveProperty(evaluation.summaryKey!);
      seen.add(evaluation.summaryKey!);
    }
    // At least two of the three bands, or the check proves nothing about the
    // branch it did not take.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('keys the refusals it writes itself, and leaves a platform exception alone', async () => {
    const noModel = await evaluateMirrorWriting(local, text, 'こんにちは。', false);
    expect(noModel.ok).toBe(false);
    if (!noModel.ok) {
      expect(noModel.reason).toBe('model-missing');
      expect(noModel.messageKey).toBe('games.mirror.error.modelMissing');
      expect(GAME_ARENA_CHROME_EN).toHaveProperty('games.mirror.error.modelMissing');
    }

    const api = { ...DEFAULT_GAME_ARENA_SETTINGS, mirrorBackend: 'api' as const, mirrorApiUrl: '', mirrorApiKey: '' };
    const noKey = await evaluateMirrorWriting(api, text, 'こんにちは。', true);
    expect(noKey.ok).toBe(false);
    if (!noKey.ok) {
      expect(noKey.reason).toBe('api-missing');
      expect(noKey.messageKey).toBe('games.mirror.error.apiMissing');
      expect(GAME_ARENA_CHROME_EN).toHaveProperty('games.mirror.error.apiMissing');
    }
  });

  it('keeps the English fallback beside every key, so a stale renderer still says something', async () => {
    for (const evaluation of await evaluateAll()) {
      expect(evaluation.summary.length).toBeGreaterThan(0);
      for (const axis of AXES) {
        for (const tip of evaluation.axes[axis].tips) {
          expect(tip.message.length, `${tip.messageKey} has no fallback text`).toBeGreaterThan(0);
        }
      }
    }
  });
});
