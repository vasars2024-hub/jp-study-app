import { describe, expect, it } from 'vitest';
import { buildGameRound, evaluateRound } from '../../renderer/games/engine';
import {
  CLOZE_BLANK,
  buildClozePool,
  buildSentencePool,
  buildVocabPool,
  clozeFromCard,
  isUsableCard,
  maskSentence,
  type SourceCard,
} from '../../renderer/games/contentSource';

const card = (over: Partial<SourceCard> = {}): SourceCard => ({
  word: '食べる',
  reading: 'たべる',
  meaning: 'to eat',
  sentence: '毎日パンを食べる。',
  ...over,
});

describe('vocab pool', () => {
  it('keeps only words the level list claims, joined to the deck for meaning', () => {
    const deck = [card({ word: '猫', meaning: 'cat' }), card({ word: '量子', meaning: 'quantum' })];
    const pool = buildVocabPool(deck, ['猫'], 2);
    expect(pool.map((v) => v.word)).toEqual(['猫']);
    expect(pool[0].meaning).toBe('cat');
    expect(pool[0].level).toBe(2);
  });

  // The list stores dictionary forms; the deck stores whatever was mined.
  it('matches list to deck by lemma, not raw string', () => {
    const deck = [card({ word: '食べた' })];
    const lemma = (s: string) => (s === '食べた' ? '食べる' : s);
    expect(buildVocabPool(deck, ['食べる'], 3)).toHaveLength(0);
    expect(buildVocabPool(deck, ['食べる'], 3, lemma)).toHaveLength(1);
  });

  it('falls back to the whole deck when no list is bound to the slot', () => {
    const deck = [card({ word: '猫' }), card({ word: '犬' })];
    expect(buildVocabPool(deck, null, 2)).toHaveLength(2);
  });

  it('drops unusable cards and duplicates', () => {
    const deck = [
      card({ word: '猫', meaning: 'cat' }),
      card({ word: '猫', meaning: 'cat' }),
      card({ word: '', meaning: 'nothing' }),
      card({ word: '本', meaning: '' }),
      card({ word: 'ねこ', meaning: 'ねこ' }), // meaning === word teaches nothing
    ];
    expect(buildVocabPool(deck, null, 2).map((v) => v.word)).toEqual(['猫']);
  });

  it('rejects cards with no word or no meaning', () => {
    expect(isUsableCard(card())).toBe(true);
    expect(isUsableCard(card({ word: '  ' }))).toBe(false);
    expect(isUsableCard(card({ meaning: '' }))).toBe(false);
  });
});

describe('cloze generation', () => {
  it('blanks the word and offers its translation as the only clue', () => {
    const item = clozeFromCard(card());
    expect(item).not.toBeNull();
    expect(item!.masked).toBe(`毎日パンを${CLOZE_BLANK}。`);
    expect(item!.answer).toBe('食べる');
    expect(item!.hint).toBe('to eat');
    expect(item!.reading).toBe('たべる');
    // The blank must actually remove the answer.
    expect(item!.masked).not.toContain('食べる');
  });

  // The trap: mined cards store the dictionary form but the sentence has it
  // conjugated, so exact substring matching silently drops most real cards.
  it('needs a resolver to blank a conjugated form, and skips the card without one', () => {
    const mined = card({ word: '食べる', sentence: '昨日パンを食べました。' });
    expect(clozeFromCard(mined)).toBeNull();
    const resolve = (s: string, w: string) => (w === '食べる' && s.includes('食べました') ? '食べました' : null);
    const item = clozeFromCard(mined, resolve);
    expect(item!.masked).toBe(`昨日パンを${CLOZE_BLANK}。`);
    expect(item!.answer).toBe('食べました');
  });

  it('grades the reading of the blanked surface instead of the dictionary form', () => {
    const mined = card({ sentence: '昨日パンを食べました。' });
    const surfaceIn = () => '食べ'; // The tokenizer leaves auxiliaries in context.
    const cloze = buildClozePool([mined], surfaceIn, (surface) => surface === '食べ' ? 'タベ' : '');
    expect(cloze[0].masked).toBe(`昨日パンを${CLOZE_BLANK}ました。`);
    for (const game of ['cloze-blitz', 'listening-flash'] as const) {
      const round = buildGameRound(game, 2, 'en', 0, { vocab: [], cloze, sentences: [] });
      expect(evaluateRound(round, 'たべ').correct).toBe(true);
      expect(evaluateRound(round, '食べ').correct).toBe(true);
      expect(evaluateRound(round, 'たべる').correct).toBe(false);
    }
  });

  it('does not offer a stale reading when a surface reading is unavailable', () => {
    const mined = card({ sentence: '昨日パンを食べました。' });
    expect(clozeFromCard(mined, () => '食べ')!.reading).toBe('');
    expect(clozeFromCard(card(), undefined, () => 'unneeded')!.reading).toBe('たべる');
  });

  it('blanks only the first occurrence, keeping the rest as context', () => {
    expect(maskSentence('猫と猫が遊ぶ。', '猫')).toBe(`${CLOZE_BLANK}と猫が遊ぶ。`);
  });

  it('returns null when the word is not in the sentence', () => {
    expect(maskSentence('犬が走る。', '猫')).toBeNull();
    expect(clozeFromCard(card({ sentence: '犬が走る。' }))).toBeNull();
  });

  it('skips cards with no sentence, or whose sentence is just the word', () => {
    expect(clozeFromCard(card({ sentence: undefined }))).toBeNull();
    expect(clozeFromCard(card({ sentence: '食べる' }))).toBeNull();
  });

  it('pools clozes, dropping unusable cards and duplicate sentences', () => {
    const deck = [
      card(),
      card(), // duplicate sentence
      card({ word: '猫', meaning: 'cat', sentence: '猫がいる。' }),
      card({ sentence: '関係ない文。' }), // word absent
    ];
    const pool = buildClozePool(deck);
    expect(pool.map((c) => c.answer)).toEqual(['食べる', '猫']);
  });
});

describe('sentence pool', () => {
  it('keeps mined cards that captured a real sentence', () => {
    const deck = [
      card(),
      card({ sentence: undefined }),
      card({ word: '猫', sentence: '猫' }),
      card({ word: '犬', meaning: 'dog', sentence: '犬が走る。' }),
    ];
    expect(buildSentencePool(deck).map((c) => c.sentence)).toEqual(['毎日パンを食べる。', '犬が走る。']);
  });
});
