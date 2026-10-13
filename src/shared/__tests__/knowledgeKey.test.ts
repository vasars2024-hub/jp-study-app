/**
 * The pure halves of the one-key package (SCORECARD package 6): how two
 * entries that now share a key merge, the store re-key, and the suspended rule
 * — a word is out of rotation only when every card behind it is suspended.
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
  mergeKnowledgeEntries,
  rekeyKnowledgeStore,
  toKatakana,
} from '../knowledgeKey';
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
