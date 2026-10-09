// @vitest-environment jsdom
/** gram2 — review prompts built from a point's own examples, and typed-answer checking. */
import { describe, expect, it } from 'vitest';
import type { LocalSrsState } from '../../shared/localSrs';
import {
  checkClozeAnswer,
  clozeForExample,
  grammarReviewPrompt,
  japaneseClozeNeedles,
  type GrammarPointLike,
} from '../grammarReviewPrompt';

const state = (repetitions: number, lastRating: LocalSrsState['lastRating'] = 'good'): LocalSrsState => ({
  version: 2,
  dueAt: 0,
  intervalDays: repetitions,
  ease: 2.5,
  repetitions,
  lapses: 0,
  lastReviewedAt: 0,
  lastRating,
});

const TEIRU: GrammarPointLike = {
  id: 'n5-teiru',
  title: '〜ている',
  lang: 'ja',
  meaning: 'ongoing action',
  examples: [
    { jp: '今、雨が降っている。', en: 'It is raining now.' },
    { jp: '彼は本を持っています。', en: 'He has a book.' },
  ],
};

describe('japaneseClozeNeedles', () => {
  it('strips placeholders and notes, keeps short literal patterns, adds the stem', () => {
    expect(japaneseClozeNeedles('〜ている')).toEqual(['ている', 'てい']);
    expect(japaneseClozeNeedles('〜てしまう / 〜ちゃう')).toEqual(['てしまう', 'てしま', 'ちゃう', 'ちゃ']);
    expect(japaneseClozeNeedles('に (particle)')).toEqual([]);
  });
});

describe('clozeForExample', () => {
  it('blanks the pattern in a Japanese example and keeps the translation as the hint', () => {
    const cloze = clozeForExample(TEIRU, TEIRU.examples[0]);
    expect(cloze?.answers).toEqual(['ている']);
    expect(cloze?.segments).toEqual([
      { text: '今、雨が降っ', blank: false },
      { text: 'ている', blank: true },
      { text: '。', blank: false },
    ]);
    expect(cloze?.translation).toBe('It is raining now.');
  });

  it('matches a conjugated use through the stem, and refuses an example without the pattern', () => {
    expect(clozeForExample(TEIRU, TEIRU.examples[1])?.answers).toEqual(['てい']);
    expect(clozeForExample(TEIRU, { jp: '雨が降る。', en: 'It rains.' })).toBeNull();
  });

  it('blanks every part of a Chinese frame, and a Russian one word by word', () => {
    const zh: GrammarPointLike = { id: 'zh', title: '虽然…但是…', lang: 'zh', examples: [] };
    const cloze = clozeForExample(zh, { jp: '虽然下雨，但是我们去了。', en: 'Although it rained, we went.' });
    expect(cloze?.answers).toEqual(['虽然', '但是']);
    const ru: GrammarPointLike = { id: 'ru', title: 'если бы … бы', lang: 'ru', examples: [] };
    const ruCloze = clozeForExample(ru, { jp: 'Если бы я знал, я бы пришёл.', en: 'Had I known, I would have come.' });
    expect(ruCloze?.answers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('grammarReviewPrompt', () => {
  it('asks a new or just-failed point for its meaning', () => {
    expect(grammarReviewPrompt(TEIRU).kind).toBe('recognition');
    expect(grammarReviewPrompt(TEIRU, state(4, 'again')).kind).toBe('recognition');
  });

  it('moves to a cloze once learned, and alternates production in for a mature point', () => {
    expect(grammarReviewPrompt(TEIRU, state(1)).kind).toBe('cloze');
    expect(grammarReviewPrompt(TEIRU, state(2)).kind).toBe('cloze');
    const mature = grammarReviewPrompt(TEIRU, state(3));
    expect(mature.kind).toBe('production');
    expect(mature.cloze?.translation).toBeTruthy();
    expect(grammarReviewPrompt(TEIRU, state(4)).kind).toBe('cloze');
  });

  it('falls back to recognition when no example literally contains the pattern', () => {
    const bare: GrammarPointLike = { ...TEIRU, examples: [{ jp: '雨が降る。', en: '' }] };
    expect(grammarReviewPrompt(bare, state(2)).kind).toBe('recognition');
  });
});

describe('checkClozeAnswer', () => {
  it('ignores width, spaces and punctuation, and needs every part in order', () => {
    expect(checkClozeAnswer(' ている ', ['ている'])).toBe(true);
    expect(checkClozeAnswer('ていた', ['ている'])).toBe(false);
    expect(checkClozeAnswer('虽然 … 但是', ['虽然', '但是'])).toBe(true);
    expect(checkClozeAnswer('但是虽然', ['虽然', '但是'])).toBe(false);
    expect(checkClozeAnswer('', ['ている'])).toBe(false);
  });
});
