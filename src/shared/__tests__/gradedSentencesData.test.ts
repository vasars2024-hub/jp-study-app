import { describe, expect, it } from 'vitest';
import {
  CLOZE_PROMPTS,
  COUNTER_PROMPTS,
  GRADED_SENTENCES,
  KANA_PROMPTS,
  KANJI_READING_PROMPTS,
  PARTICLE_PROMPTS,
  VOCAB_PROMPTS,
} from '../../renderer/data/gradedSentences';
import type { LevelTier } from '../levelScale';
import type { SourceLang } from '../../renderer/games/types';

const LANGS: SourceLang[] = ['en', 'ru', 'zh'];
const LEVELS: LevelTier[] = [1, 2, 3, 4, 5, 6, 7];

// These mirror the authoring rules documented at the top of the data module.
// They exist because a bad entry here is invisible until it silently marks a
// correct answer wrong mid-game — the engine trusts this data completely.

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id);
}

describe('graded sentence data hygiene', () => {
  const withIds = [
    ['GRADED_SENTENCES', GRADED_SENTENCES],
    ['VOCAB_PROMPTS', VOCAB_PROMPTS],
    ['CLOZE_PROMPTS', CLOZE_PROMPTS],
    ['KANJI_READING_PROMPTS', KANJI_READING_PROMPTS],
    ['PARTICLE_PROMPTS', PARTICLE_PROMPTS],
    ['COUNTER_PROMPTS', COUNTER_PROMPTS],
  ] as const;

  it.each(withIds)('%s has unique ids', (_name, items) => {
    const seen = ids(items);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('every Sentence Builder token list joins back to its sentence', () => {
    for (const sentence of GRADED_SENTENCES) {
      expect(sentence.tokens.join(''), `tokens for ${sentence.id}`).toBe(sentence.jp);
    }
  });

  it('every sentence carries all three source-language translations', () => {
    for (const sentence of GRADED_SENTENCES) {
      for (const lang of LANGS) {
        expect(sentence.translations[lang]?.trim(), `${sentence.id}.${lang}`).toBeTruthy();
      }
    }
  });

  it('every sentence reading is kana-only, since Speed Type accepts it as an answer', () => {
    for (const sentence of GRADED_SENTENCES) {
      expect(sentence.reading, `reading for ${sentence.id}`).not.toMatch(/[一-鿿]/);
    }
  });

  it('every multiple-choice prompt lists its own answer among the choices', () => {
    for (const item of CLOZE_PROMPTS) expect(item.choices, item.id).toContain(item.answer);
    for (const item of PARTICLE_PROMPTS) expect(item.choices, item.id).toContain(item.answer);
    for (const item of COUNTER_PROMPTS) expect(item.choices, item.id).toContain(item.answer);
    for (const item of KANJI_READING_PROMPTS) expect(item.choices, item.id).toContain(item.reading);
  });

  it('every multiple-choice prompt offers four distinct choices', () => {
    const all = [
      ...CLOZE_PROMPTS.map((i) => [i.id, i.choices] as const),
      ...PARTICLE_PROMPTS.map((i) => [i.id, i.choices] as const),
      ...COUNTER_PROMPTS.map((i) => [i.id, i.choices] as const),
      ...KANJI_READING_PROMPTS.map((i) => [i.id, i.choices] as const),
    ];
    for (const [id, choices] of all) {
      expect(choices.length, id).toBe(4);
      expect(new Set(choices).size, `${id} has duplicate choices`).toBe(4);
    }
  });

  it('every cloze and particle prompt has exactly one blank to fill', () => {
    for (const item of [...CLOZE_PROMPTS, ...PARTICLE_PROMPTS]) {
      expect(item.prompt.match(/___/g)?.length, `blanks in ${item.id}`).toBe(1);
    }
  });

  it('kana prompts are kana-only with lowercase romaji', () => {
    for (const item of KANA_PROMPTS) {
      expect(item.kana, `kana ${item.kana}`).toMatch(/^[぀-ゟ゠-ヿ]+$/);
      expect(item.romaji, `romaji for ${item.kana}`).toMatch(/^[a-z]+$/);
    }
    const pairs = KANA_PROMPTS.map((k) => `${k.kana}:${k.romaji}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  // The round picker filters to level +/-1 and indexes by seed % pool.length,
  // so a level band this thin repeats prompts inside a single session.
  it.each(LEVELS)('has a usable level-%i pool for the level-driven games', (level) => {
    const near = <T extends { level: LevelTier }>(items: readonly T[]): number =>
      items.filter((item) => Math.abs(item.level - level) <= 1).length;

    expect(near(GRADED_SENTENCES), 'sentences').toBeGreaterThanOrEqual(8);
    expect(near(CLOZE_PROMPTS), 'cloze').toBeGreaterThanOrEqual(6);
    expect(near(KANJI_READING_PROMPTS), 'kanji').toBeGreaterThanOrEqual(6);
    expect(near(PARTICLE_PROMPTS), 'particles').toBeGreaterThanOrEqual(4);
  });

  it('word match can fill a four-pair grid at every level', () => {
    for (const level of LEVELS) {
      const pool = VOCAB_PROMPTS.filter((v) => Math.abs(v.level - level) <= 2);
      expect(pool.length, `vocab pool at level ${level}`).toBeGreaterThanOrEqual(4);
      const meanings = pool.map((v) => v.meanings.en);
      expect(new Set(meanings).size, `duplicate meanings at level ${level}`).toBe(meanings.length);
    }
  });
});
