import { describe, expect, it } from 'vitest';
import { searchDeckCards, type DeckFlashcard } from '../flashcardDeck';

function card(partial: Partial<DeckFlashcard>): DeckFlashcard {
  return {
    id: partial.word ?? 'id',
    word: '',
    reading: '',
    meaning: '',
    source: 'epub',
    addedAt: 0,
    ...partial,
  };
}

const deck: DeckFlashcard[] = [
  card({ word: '猫', reading: 'ねこ', meaning: 'cat', bookTitle: 'Kokoro' }),
  card({ word: '犬', reading: 'いぬ', meaning: 'Dog', bookTitle: 'Botchan' }),
  card({ word: '走る', reading: 'はしる', meaning: 'to run', sentence: '毎朝走る', bookTitle: 'Kokoro' }),
  card({ word: 'front-only', front: 'Q side', back: 'A side', bookTitle: 'Botchan' }),
];

describe('searchDeckCards is:leech', () => {
  const srs = (lapses: number) =>
    ({ lapses, intervalDays: 1, due: 0 }) as unknown as DeckFlashcard['srs'];
  const cards = [
    card({ word: 'a', srs: srs(8) }),
    card({ word: 'b', srs: srs(7) }),
    card({ word: 'c' }),
  ];

  it('keeps only cards at or past the lapse threshold', () => {
    expect(searchDeckCards(cards, 'is:leech').map((c) => c.word)).toEqual(['a']);
    expect(searchDeckCards(cards, '  IS:Leech ').map((c) => c.word)).toEqual(['a']);
  });
});

describe('searchDeckCards', () => {
  it('returns every card for an empty or whitespace query', () => {
    expect(searchDeckCards(deck, '')).toHaveLength(4);
    expect(searchDeckCards(deck, '   ')).toHaveLength(4);
  });

  it('matches the Japanese word and its reading', () => {
    expect(searchDeckCards(deck, '猫').map((c) => c.word)).toEqual(['猫']);
    expect(searchDeckCards(deck, 'ねこ').map((c) => c.word)).toEqual(['猫']);
  });

  it('matches meanings case-insensitively', () => {
    expect(searchDeckCards(deck, 'dog').map((c) => c.word)).toEqual(['犬']);
  });

  it.each([
    ['ガクセイ', 'ｶﾞｸｾｲ'],
    ['ｶﾞｸｾｲ', 'ガクセイ'],
    ['がくせい', 'か\u3099くせい'],
    ['か\u3099くせい', 'がくせい'],
    ['Ｄｏｇ', 'dog'],
    ['Dog', 'ＤＯＧ'],
  ])('finds %s when searching for the equivalent Unicode text %s', (meaning, query) => {
    const cards = [card({ word: 'entry', meaning }), card({ word: 'unrelated' })];
    expect(searchDeckCards(cards, query)).toEqual([cards[0]]);
    expect(cards[0].meaning).toBe(meaning);
  });

  it('preserves meaningful differences in kana when searching', () => {
    const cards = [card({ word: 'ビル' }), card({ word: 'ビール' })];
    expect(searchDeckCards(cards, 'ﾋﾞｰﾙ')).toEqual([cards[1]]);
    expect(searchDeckCards(cards, 'ヒル')).toEqual([]);
  });

  it('matches sentence and front/back fields', () => {
    expect(searchDeckCards(deck, '毎朝').map((c) => c.word)).toEqual(['走る']);
    expect(searchDeckCards(deck, 'A side').map((c) => c.word)).toEqual(['front-only']);
  });

  it('matches the source book title so a deck name narrows the view', () => {
    expect(searchDeckCards(deck, 'kokoro').map((c) => c.word)).toEqual(['猫', '走る']);
  });

  it('returns nothing when no field contains the query', () => {
    expect(searchDeckCards(deck, 'zzz')).toEqual([]);
  });
});
