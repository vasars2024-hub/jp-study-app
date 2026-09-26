import { describe, expect, it } from 'vitest';
import { MIRROR_TEXTS, RU_MIRROR_TEXTS, ZH_MIRROR_TEXTS, mirrorRotation, mirrorTextsFor } from '../../renderer/data/mirrorTexts';
import { ASSET_CATALOG } from '../assetRegistry';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';
import { evaluateMirrorWriting, validateMirrorEvaluation } from '../../renderer/games/mirrorWriting/evaluator';

describe('Mirror Writing evaluator', () => {
  it('rejects malformed evaluator JSON', () => {
    expect(validateMirrorEvaluation({ axes: { grammar: { score: 90, tips: [] } } })).toBeNull();
  });

  it('grades with the quick check at once: nothing to download first', async () => {
    const result = await evaluateMirrorWriting(DEFAULT_GAME_ARENA_SETTINGS, MIRROR_TEXTS[0], 'こんにちは。私は学生です。');
    expect(result.ok).toBe(true);
    // The 28.9 MB model it used to demand was never run; it is no longer in the catalogue.
    expect(ASSET_CATALOG.some((a) => a.id === 'mirror-writing-evaluator')).toBe(false);
  });

  it('checks Chinese and Russian drafts in their own script', async () => {
    const zh = ZH_MIRROR_TEXTS[0];
    const good = await evaluateMirrorWriting(DEFAULT_GAME_ARENA_SETTINGS, zh, zh.reference);
    const latin = await evaluateMirrorWriting(DEFAULT_GAME_ARENA_SETTINGS, zh, 'Hello, my name is Xiaoming.');
    expect(good.ok && latin.ok).toBe(true);
    if (!good.ok || !latin.ok) return;
    expect(good.evaluation.total).toBeGreaterThan(latin.evaluation.total + 20);
    expect(latin.evaluation.axes.grammar.tips.map((t) => t.messageKey)).toContain('games.mirror.tip.grammar.script.zh');

    const ru = RU_MIRROR_TEXTS[0];
    const ruGood = await evaluateMirrorWriting(DEFAULT_GAME_ARENA_SETTINGS, ru, ru.reference);
    expect(ruGood.ok && ruGood.evaluation.total).toBeGreaterThan(70);
  });

  it('rotates through every text for the language, the level first', () => {
    const ja = mirrorTextsFor('ja');
    expect(ja.length).toBeGreaterThanOrEqual(98);
    const rotation = mirrorRotation(ja, 3);
    expect(rotation.slice(0, 14).every((t) => t.level === 3)).toBe(true);
    expect(new Set(rotation.map((t) => t.id)).size).toBe(ja.length);
    expect(mirrorTextsFor('zh').every((t) => t.lang === 'zh')).toBe(true);
    expect(mirrorTextsFor('ru').length).toBeGreaterThanOrEqual(14);
  });

  it('returns a stable offline rubric score when the local evaluator is installed', async () => {
    const result = await evaluateMirrorWriting(
      DEFAULT_GAME_ARENA_SETTINGS,
      MIRROR_TEXTS[2],
      '駅で傘をなくしてしまいました。黒い傘です。どうすればいいでしょうか。',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evaluation.evaluatorVersion).toBe('quick-check-v2');
    expect(result.evaluation.total).toBeGreaterThan(55);
    expect(result.evaluation.axes.fidelity.tips.length).toBeGreaterThan(0);
  });
});
