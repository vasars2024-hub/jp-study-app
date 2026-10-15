/**
 * The pure halves of the one-key package (SCORECARD package 6): how two
 * entries that now share a key merge, the store re-key, and the suspended rule
 * — a word is out of rotation only when every card behind it is suspended.
 * Chinese Traditional ↔ Simplified folding (`zhVariants`) and its migration.
 * The kuromoji-backed key table lives in renderer/__tests__/knowledgeKeyRule.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  ankiEntryIsOutOfRotation,
  ankiEntryKnowledgeLevel,
  ankiSuspensionFlags,
  foldIntervalEntriesByKey,
  mergeIntervalEntries,
  type IntervalEntry,
} from '../anki';
import {
  japaneseAliasKeys,
  knowledgeKeyFor,
  knowledgeKeysFor,
  mergeKnowledgeEntries,
  migratedKnowledgeKeys,
  rekeyKnowledgeStore,
  segmentKnowledgeKey,
  toKatakana,
} from '../knowledgeKey';
import { hasTraditionalChinese, toSimplifiedChinese, zhVariantPairCount } from '../zhVariants';
import { toHiragana } from '../furigana';

const thresholds = { familiar: 1, known: 21 };
const entry = (expression: string, ivlDays: number, extra: Partial<IntervalEntry> = {}, noteId = 1): IntervalEntry => ({
  expression, ivlDays, noteId, modelName: 'Basic', ...extra,
});

describe('merging two entries that now share one key', () => {
  it.each([
    [{ l: 1 }, { l: 3 }, { l: 3 }, 'two automatic → the higher'],
    [{ l: 3 }, { l: 1 }, { l: 3 }, 'order does not matter'],
    [{ l: 1, m: 1 }, { l: 3 }, { l: 1, m: 1 }, 'a manual level wins over a higher automatic one'],
    [{ l: 3 }, { l: 0, m: 1 }, { l: 0, m: 1 }, 'a hand-pinned New wins too'],
    [{ l: 2, m: 1 }, { l: 3, m: 1 }, { l: 3, m: 1 }, 'two manual → the higher, still manual'],
  ] as const)('%j + %j → %j (%s)', (a, b, out) => {
    expect(mergeKnowledgeEntries(a, b)).toEqual(out);
  });

  it('re-keys a store, counting moved keys, and is idempotent', () => {
    const rekey = (key: string) => (key === '勉強する' ? ['勉強'] : key === '携帯電話' ? ['携帯', '電話'] : null);
    const first = rekeyKnowledgeStore({ 勉強する: { l: 3 }, 勉強: { l: 1, m: 1 }, 携帯電話: { l: 2 }, 電話: { l: 3 } }, rekey);
    expect(first.moved).toBe(2);
    expect(first.entries).toEqual({ 勉強: { l: 1, m: 1 }, 携帯: { l: 2 }, 電話: { l: 3 } });
    const second = rekeyKnowledgeStore(first.entries, rekey);
    expect(second.moved).toBe(0);
    expect(second.entries).toEqual(first.entries);
  });
});

describe('the suspended rule', () => {
  it('a note is out of rotation only when every card is suspended', () => {
    expect(ankiSuspensionFlags(2, 0)).toEqual({});
    expect(ankiSuspensionFlags(2, 1)).toEqual({ suspended: true, allSuspended: false });
    expect(ankiSuspensionFlags(2, 2)).toEqual({ suspended: true, allSuspended: true });
  });

  it('one suspended card beside a live one keeps the level; all suspended → 0', () => {
    expect(ankiEntryKnowledgeLevel({ ivlDays: 180, suspended: true, allSuspended: false }, thresholds)).toBe(3);
    expect(ankiEntryKnowledgeLevel({ ivlDays: 180, suspended: true, allSuspended: true }, thresholds)).toBe(0);
    // A snapshot written before `allSuspended` existed is read the old way.
    expect(ankiEntryIsOutOfRotation({ suspended: true })).toBe(true);
  });

  it('a suspended duplicate note no longer hides a live one (same expression)', () => {
    const merged = mergeIntervalEntries(
      entry('飲む', 180, { suspended: true, allSuspended: true }, 1),
      entry('飲む', 30, {}, 2),
    );
    expect(merged.suspended).toBe(true); // the problem-state flag is still visible
    expect(merged.allSuspended).toBe(false);
    expect(merged.ivlDays).toBe(180);
    expect(ankiEntryKnowledgeLevel(merged, thresholds)).toBe(3);
    const both = mergeIntervalEntries(
      entry('止む', 9, { suspended: true, allSuspended: true }, 1),
      entry('止む', 30, { suspended: true }, 2),
    );
    expect(ankiEntryKnowledgeLevel(both, thresholds)).toBe(0);
  });

  it('folds by word key: a live note of the same word keeps it in rotation', () => {
    const keysOf = (expression: string) => [expression.replace(/する$/, '')];
    const levels = foldIntervalEntriesByKey([
      entry('勉強する', 200, { suspended: true, allSuspended: true }, 1),
      entry('勉強', 2, {}, 2),
      entry('止まる', 400, { suspended: true, allSuspended: true }, 3),
      entry('新しい', 0, {}, 4),
    ], keysOf, thresholds);
    expect(levels).toEqual({ 勉強: 3 });
  });
});

describe('spelling variants', () => {
  it('folds kana scripts', () => {
    expect(toHiragana('ネコー')).toBe('ねこー');
    expect(toKatakana('ねこ')).toBe('ネコ');
  });

  it('names aliases conservatively', () => {
    expect(japaneseAliasKeys('ネコ')).toEqual(['ねこ']);
    expect(japaneseAliasKeys('猫', { reading: 'ネコ' })).toEqual(['ねこ', 'ネコ']);
    expect(japaneseAliasKeys('ねこ', { keysForReading: () => ['猫'] })).toEqual(['ネコ', '猫']);
    // Two known kanji share the reading (橋 / 箸): no guess.
    expect(japaneseAliasKeys('はし', { keysForReading: () => ['橋', '箸'] })).toEqual(['ハシ']);
    // One kana is a particle or a fragment, not a word.
    expect(japaneseAliasKeys('ね')).toEqual([]);
  });

  it('a compound graded as a unit keeps its whole spelling as its one key', () => {
    const tokens = [
      { surface: '携帯', lemma: '携帯', content: true, pos: '名詞' },
      { surface: '電話', lemma: '電話', content: true, pos: '名詞' },
    ];
    expect(knowledgeKeyFor('携帯電話', 'ja', { tokenizeJapanese: () => tokens })).toBe('携帯電話');
  });
});

describe('Traditional and Simplified Chinese share one key', () => {
  it.each([
    ['學習', '学习'],
    ['電腦', '电脑'],
    ['漢語', '汉语'],
    ['頭髮', '头发'],
    ['發現', '发现'],
    ['臺灣', '台湾'],
    ['後來', '后来'],
    ['圖書館', '图书馆'],
    ['學习', '学习'],
  ])('%s and its Simplified spelling are one word (%s)', (traditional, simplified) => {
    expect(knowledgeKeyFor(traditional, 'zh')).toBe(simplified);
    expect(knowledgeKeyFor(simplified, 'zh')).toBe(simplified);
    expect(segmentKnowledgeKey(traditional, 'zh')).toBe(simplified);
  });

  it('a phrase the reader splits folds word by word', () => {
    const keys = knowledgeKeysFor('我們學習漢語', 'zh');
    expect(keys).toEqual(knowledgeKeysFor('我们学习汉语', 'zh'));
    expect(keys.some((key) => hasTraditionalChinese(key))).toBe(false);
  });

  it('Japanese and Russian keys are never folded', () => {
    expect(knowledgeKeyFor('學習', 'ja')).toBe('學習');
    expect(knowledgeKeyFor('國語', 'ja')).toBe('國語');
    expect(migratedKnowledgeKeys('學習', 'ja')).toBeNull();
  });

  it('leaves alone characters whose Traditional form is also a Simplified word', () => {
    // 乾坤 is still 乾 in Simplified, 著名 still 著: folding them would merge words.
    expect(toSimplifiedChinese('乾坤')).toBe('乾坤');
    expect(toSimplifiedChinese('著名')).toBe('著名');
    expect(toSimplifiedChinese('abc 123')).toBe('abc 123');
  });

  it('the table is idempotent, one character to one, and covers the common characters', () => {
    expect(zhVariantPairCount()).toBeGreaterThanOrEqual(1500);
    // The 200 most frequent Traditional-only characters of everyday text: all folded.
    const common = '們個這來說時國會後對學過還發現當經動開長為點種實問樣進電頭從體關麼機與將業產無話聽讀寫買賣錢書東車門見號錯飯館間題師幫歡謝請認識氣熱網線';
    for (const ch of common) expect(toSimplifiedChinese(ch), ch).not.toBe(ch);
    const folded = toSimplifiedChinese(common);
    expect(toSimplifiedChinese(folded)).toBe(folded);
    expect([...folded]).toHaveLength([...common].length);
  });

  it('re-keys a store that holds both spellings into one entry (the migration)', () => {
    const store = {
      學習: { l: 3 as const },
      学习: { l: 1 as const },
      電腦: { l: 2 as const, m: 1 as const },
      你好: { l: 3 as const },
    };
    const first = rekeyKnowledgeStore(store, (key) => migratedKnowledgeKeys(key, 'zh'));
    expect(first.moved).toBe(2);
    expect(first.entries).toEqual({ 学习: { l: 3 }, 电脑: { l: 2, m: 1 }, 你好: { l: 3 } });
    // A second run moves nothing.
    const second = rekeyKnowledgeStore(first.entries, (key) => migratedKnowledgeKeys(key, 'zh'));
    expect(second.moved).toBe(0);
    expect(second.entries).toEqual(first.entries);
  });
});
