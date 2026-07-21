import { describe, expect, it } from 'vitest';
import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';
import { evaluateMirrorWriting, validateMirrorEvaluation } from '../../renderer/games/mirrorWriting/evaluator';

describe('Mirror Writing evaluator', () => {
  it('rejects malformed evaluator JSON', () => {
    expect(validateMirrorEvaluation({ axes: { grammar: { score: 90, tips: [] } } })).toBeNull();
  });

  it('offers model download instead of grading when local model is missing', async () => {
    const result = await evaluateMirrorWriting(
      DEFAULT_GAME_ARENA_SETTINGS,
      MIRROR_TEXTS[0],
      'こんにちは。私は学生です。',
      false,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('model-missing');
  });

  it('returns a stable offline rubric score when the local evaluator is installed', async () => {
    const result = await evaluateMirrorWriting(
      DEFAULT_GAME_ARENA_SETTINGS,
      MIRROR_TEXTS[2],
      '駅で傘をなくしてしまいました。黒い傘です。どうすればいいでしょうか。',
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evaluation.evaluatorVersion).toBe('local-rubric-v1');
    expect(result.evaluation.total).toBeGreaterThan(55);
    expect(result.evaluation.axes.fidelity.tips.length).toBeGreaterThan(0);
  });
});
