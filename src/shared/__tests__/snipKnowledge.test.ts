/**
 * Snip to cards asks "known?" and "already a card?" by the reader's key
 * (`shared/knowledgeKey`), not the raw lemma — so a word the reader shows as
 * known is never carded from a snip, and a card filed under its dictionary
 * key counts for every form of the word.
 */
import { describe, expect, it } from 'vitest';
import { indexDeckForSnip, snipKnowledge, snipWordKey } from '../snipKnowledge';
import type { KnowledgeKeyToken } from '../knowledgeKey';

function store(levels: Record<string, number>) {
  return { levelOf: (key: string) => levels[key] ?? 0, isManual: () => false };
}

/** IPADIC as far as these cases need it. */
function tokenizeJapanese(text: string): KnowledgeKeyToken[] {
  const table: Record<string, KnowledgeKeyToken[]> = {
    勉強する: [
      { surface: '勉強', lemma: '勉強', content: true, pos: '名詞', posDetail: 'サ変接続' },
      { surface: 'する', lemma: 'する', content: true, pos: '動詞', posDetail: '自立' },
    ],
    食べた: [
      { surface: '食べ', lemma: '食べる', content: true, pos: '動詞', posDetail: '自立' },
      { surface: 'た', lemma: 'た', content: false, pos: '助動詞', posDetail: '*' },
    ],
  };
  return table[text] ?? [{ surface: text, lemma: text, content: true, pos: '名詞', posDetail: '一般' }];
}

describe('known, by the reader key', () => {
  it('Japanese: a word graded in the other kana, or under its own reading, is known', () => {
    const words = [{ surface: '猫', lemma: '猫', reading: 'ネコ' }, { surface: 'ネコ', lemma: 'ネコ' }];
    const k = snipKnowledge(words, 'ja', store({ ねこ: 3 }), []);
    // The old lookup asked the store for 猫 and ネコ only, and carded both.
    expect(k.isKnown('猫', '猫')).toBe(true);
    expect(k.isKnown('ネコ', 'ネコ')).toBe(true);
  });

  it('Japanese: half-width and compatibility forms meet their ordinary spelling (NFKC)', () => {
    const words = [{ surface: 'ｶﾒﾗ', lemma: 'ｶﾒﾗ' }];
    expect(snipKnowledge(words, 'ja', store({ カメラ: 3 }), []).isKnown('ｶﾒﾗ', 'ｶﾒﾗ')).toBe(true);
  });

  it('only level 3 is known: a word being learned is still carded', () => {
    const words = [{ surface: '猫', lemma: '猫' }];
    expect(snipKnowledge(words, 'ja', store({ 猫: 2 }), []).isKnown('猫', '猫')).toBe(false);
  });

  it('Russian: any case form is known once its dictionary form is graded', () => {
    const words = [{ surface: 'книгу', lemma: 'книгу' }];
    expect(snipKnowledge(words, 'ru', store({ книга: 3 }), []).isKnown('книгу', 'книгу')).toBe(true);
  });

  it('Chinese: the word itself, NFKC', () => {
    expect(snipWordKey({ surface: '学习', lemma: '学习' }, 'zh')).toBe('学习');
    expect(snipKnowledge([{ surface: '学习', lemma: '学习' }], 'zh', store({ 学习: 3 }), []).isKnown('学习', '学习')).toBe(true);
  });
});

describe('already a card, by the reader key', () => {
  it('a 勉強する card counts for the snip word 勉強, and 食べた for 食べる', () => {
    const cards = [{ id: 'c-study', word: '勉強する' }, { id: 'c-eat', word: '食べた' }];
    const words = [{ surface: '勉強', lemma: '勉強' }, { surface: '食べ', lemma: '食べる' }];
    const k = snipKnowledge(words, 'ja', store({}), cards, { tokenizeJapanese });
    expect(k.inDeck('勉強', '勉強')).toBe(true);
    expect(k.cardFor({ surface: '勉強', lemma: '勉強' })).toBe('c-study');
    expect(k.cardFor({ surface: '食べ', lemma: '食べる' })).toBe('c-eat');
  });

  it('a kana card counts for the kanji word read that way', () => {
    const k = snipKnowledge([{ surface: '猫', lemma: '猫', reading: 'ネコ' }], 'ja', store({}), [{ id: 'c1', word: 'ねこ' }]);
    expect(k.cardFor({ surface: '猫', lemma: '猫', reading: 'ネコ' })).toBe('c1');
  });

  it('Russian: a card for one form counts for the others', () => {
    const k = snipKnowledge([{ surface: 'книгой', lemma: 'книгой' }], 'ru', store({}), [{ id: 'r1', word: 'книга', studyLang: 'ru' }]);
    expect(k.inDeck('книгой', 'книгой')).toBe(true);
  });

  it('cards of another study language never match', () => {
    const k = snipKnowledge([{ surface: '学习', lemma: '学习' }], 'zh', store({}), [{ id: 'j1', word: '学习' }]);
    expect(k.inDeck('学习', '学习')).toBe(false);
  });

  it('only cards sharing a character with the snip are keyed (a big deck costs no tokenizer pass per card)', () => {
    let calls = 0;
    const counting = (text: string) => {
      calls += 1;
      return tokenizeJapanese(text);
    };
    const cards = Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, word: `犬${i}` }));
    cards.push({ id: 'hit', word: '勉強する' });
    const deck = indexDeckForSnip(cards, 'ja', ['勉強'], { tokenizeJapanese: counting });
    expect(deck.get('勉強')).toBe('hit');
    expect(calls).toBe(1);
  });
});
