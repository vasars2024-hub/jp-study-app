import { describe, expect, it } from 'vitest';
import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import type { LevelTier } from '../levelScale';
import type { SourceLang } from '../../renderer/games/types';

const LANGS: SourceLang[] = ['en', 'ru', 'zh'];
const LEVELS: LevelTier[] = [1, 2, 3, 4, 5, 6, 7];
const KANA = /[぀-ゟ゠-ヿ]/;

describe('mirror text data hygiene', () => {
  it('has unique text ids and unique idea ids within each text', () => {
    const textIds = MIRROR_TEXTS.map((t) => t.id);
    expect(new Set(textIds).size).toBe(textIds.length);
    for (const text of MIRROR_TEXTS) {
      const ideaIds = text.ideaMap.map((i) => i.id);
      expect(new Set(ideaIds).size, `${text.id} idea ids`).toBe(ideaIds.length);
    }
  });

  // The whole exercise is recall: an idea map that leaks Japanese turns the
  // game into transcription. zh concepts legitimately use Han characters, so
  // only kana can betray a leak there; en/ru must have no CJK at all.
  it('never leaks Japanese into the idea map', () => {
    for (const text of MIRROR_TEXTS) {
      for (const idea of text.ideaMap) {
        expect(idea.concepts.en, `${idea.id}.en`).not.toMatch(/[぀-ヿ一-鿿]/);
        expect(idea.concepts.ru, `${idea.id}.ru`).not.toMatch(/[぀-ヿ一-鿿]/);
        expect(idea.concepts.zh, `${idea.id}.zh`).not.toMatch(KANA);
      }
    }
  });

  it('gives every idea all three source-language concepts', () => {
    for (const text of MIRROR_TEXTS) {
      for (const idea of text.ideaMap) {
        for (const lang of LANGS) {
          expect(idea.concepts[lang]?.trim(), `${idea.id}.${lang}`).toBeTruthy();
        }
      }
    }
  });

  // The reference is the model answer, so it must itself score well under the
  // local rubric evaluator: that flags a draft as fragmented above
  // ideaMap.length + 2 sentences, and expects at least one sentence per idea.
  // An idea may still take two sentences to express (a greeting plus a name),
  // which is why this is a window rather than a 1:1 count.
  it('has a Japanese reference that would pass its own rubric', () => {
    for (const text of MIRROR_TEXTS) {
      expect(text.reference, `${text.id} reference`).toMatch(/[぀-ヿ一-鿿]/);
      const sentences = (text.reference.match(/[。！？]/g) ?? []).length;
      expect(sentences, `${text.id} sentence count`).toBeGreaterThanOrEqual(text.ideaMap.length);
      expect(sentences, `${text.id} would score as fragmented`).toBeLessThanOrEqual(text.ideaMap.length + 2);
    }
  });

  it('gives every text a title and at least three ideas', () => {
    for (const text of MIRROR_TEXTS) {
      expect(text.title.trim(), `${text.id} title`).toBeTruthy();
      expect(text.ideaMap.length, `${text.id} idea count`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(LEVELS)('offers more than one level-%i text so prompts do not repeat', (level) => {
    const near = MIRROR_TEXTS.filter((t) => Math.abs(t.level - level) <= 1);
    expect(near.length).toBeGreaterThanOrEqual(4);
    expect(MIRROR_TEXTS.filter((t) => t.level === level).length).toBeGreaterThanOrEqual(2);
  });
});
