// @vitest-environment jsdom
/**
 * One language-aware knowledge key (SCORECARD package 6, bugs 40-42), against the
 * REAL kuromoji the reader uses:
 *  - table-driven keys in ja / zh / ru;
 *  - every writer (review, import, Anki) files a word under the key the reader
 *    looks it up by;
 *  - spelling variants (ネコ / ねこ / 猫) resolve in the reader;
 *  - a store keyed the old way migrates without losing levels, once, with a backup;
 *  - a Chinese Anki sync keys by Chinese words, not by the Japanese tokenizer.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvUpdate: async () => undefined,
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { buildRealKuromoji } from './helpers/realKuromoji';
import { knowledgeKeysFor, migratedKnowledgeKeys } from '../../shared/knowledgeKey';
import type { IntervalEntry, IntervalSnapshot } from '../../shared/anki';
import type { StudyLang } from '../../shared/studyLang';
import { tokenizeSync } from '../tokenizer';
import {
  flushKnowledgeWrites,
  getLevel,
  isManualLevel,
  knowledgeKey,
  KNOWLEDGE_KEY_RULE,
  knowledgeKeyBackupIdbKey,
  knowledgeKeyRuleMark,
  migrateKnowledgeKeys,
  resetKnownWordsCacheForTests,
  setInferredLevel,
  setLevel,
} from '../knownWords';
import { setStudyLang } from '../studyEnvironment';
import { readerKeyForToken, studyTokens, wordKnowledgeKeys } from '../studyTokens';
import { reviewKnowledgeWords } from '../flashcardDeck';

beforeAll(async () => {
  await buildRealKuromoji();
}, 60_000);

let servedSnapshot: IntervalSnapshot;

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  (window as unknown as { api: unknown }).api = {
    setStudyLanguage: () => undefined,
    onAnkiIntervalsChanged: (): (() => void) => () => undefined,
    ankiGetIntervals: async () => servedSnapshot,
    ankiLinkState: async () => ({ state: 'connected', consecutiveFailures: 0 }),
  };
  setStudyLang('ja');
  resetKnownWordsCacheForTests();
});

const ja = (word: string): string[] => knowledgeKeysFor(word, 'ja', { tokenizeJapanese: tokenizeSync });

describe('Japanese keys (kuromoji, the reader segmenter)', () => {
  it.each<[string, string[], string]>([
    ['食べた', ['食べる'], 'one content word + inflection → dictionary form'],
    ['静かな', ['静か'], 'na-adjective stem'],
    ['見ている', ['見る'], 'auxiliary verb is inflection'],
    ['勉強する', ['勉強'], 'trailing する dropped from a suru-noun'],
    ['勉強します', ['勉強'], 'inflected する dropped too'],
    ['勉強をする', ['勉強'], 'object を + する dropped'],
    ['コピーする', ['コピー'], 'katakana suru-noun'],
    ['愛する', ['愛する'], 'a lexical する-verb IPADIC keeps whole stays whole'],
    ['携帯電話', ['携帯', '電話'], 'noun compound → the parts the reader shows'],
    ['大学生活', ['大学', '生活'], 'noun compound'],
    ['日本語', ['日本語'], 'one dictionary word stays one key'],
    ['気をつける', ['気をつける'], 'set phrase kept whole — never marks 気'],
    ['お腹が空く', ['お腹が空く'], 'set phrase with a particle'],
    ['かもしれない', ['かもしれない'], 'grammar phrase, not しれる'],
    ['一石二鳥', ['一石二鳥'], 'idiom with number parts stays whole'],
    ['ｶﾀｶﾅ', ['カタカナ'], 'NFKC: half-width katakana'],
    ['ＡＢＣ', ['ABC'], 'NFKC: full-width Latin'],
    ['ケイタイ', ['ケイタイ'], 'all-kana word IPADIC cuts up stays whole'],
  ])('%s → %j (%s)', (word, keys) => {
    expect(ja(word)).toEqual(keys);
  });

  it('without the tokenizer: the spelling, with する dropped by spelling', () => {
    expect(knowledgeKeysFor('勉強する', 'ja')).toEqual(['勉強']);
    expect(knowledgeKeysFor('愛する', 'ja')).toEqual(['愛する']);
    expect(knowledgeKeysFor('食べた', 'ja')).toEqual(['食べた']);
  });

  it('every key a writer files is a key the reader looks up for the same text', () => {
    for (const word of ['食べた', '勉強する', '携帯電話', '静かな', '大学生活', '見ている']) {
      const readerKeys = studyTokens(word, 'ja').filter((t) => t.content).map((t) => t.lemma);
      for (const key of ja(word)) expect(readerKeys, word).toContain(key);
    }
  });
});

describe('Chinese and Russian keys (ICU words)', () => {
  it.each<[StudyLang, string, string[]]>([
    ['zh', '学习', ['学习']],
    ['zh', '电脑', ['电脑']],
    ['zh', '今天天气', ['今天', '天气']],
    ['zh', '学习。', ['学习']],
    ['ru', 'Книга', ['книг']],
    ['ru', 'кни́ги', ['книг']],
  ])('%s %s → %j', (lang, word, keys) => {
    expect(knowledgeKeysFor(word, lang)).toEqual(keys);
  });

  it('Russian prefers the form already graded', () => {
    expect(knowledgeKeysFor('книги', 'ru', { levelOf: (key) => (key === 'книга' ? 3 : 0) })).toEqual(['книга']);
  });
});

describe('writers agree: review, import, Anki', () => {
  it('a 勉強する review lands on 勉強, the key the reader colours', () => {
    expect(reviewKnowledgeWords({ word: '勉強する', sentence: '', studyKind: 'vocabulary' })).toEqual(['勉強']);
    expect(reviewKnowledgeWords({ word: '携帯電話', sentence: '', studyKind: 'vocabulary' })).toEqual(['携帯', '電話']);
    expect(wordKnowledgeKeys('勉強する', 'ja')).toEqual(['勉強']);
  });

  it('a Japanese Anki sync keys 勉強する as 勉強 and leaves 気 alone for 気をつける', async () => {
    servedSnapshot = snapshotOf([
      entry('勉強する', 40),
      entry('気をつける', 40),
      entry('携帯電話', 5),
    ]);
    const { syncKnowledgeFromAnki } = await import('../ankiSync');
    const result = await syncKnowledgeFromAnki();
    expect(result.ok).toBe(true);
    expect(getLevel('勉強')).toBe(3);
    expect(getLevel('勉強する')).toBe(0);
    expect(getLevel('気')).toBe(0);
    expect(getLevel('気をつける')).toBe(3);
    expect(getLevel('携帯')).toBe(2);
    expect(getLevel('電話')).toBe(2);
  });

  it('a Chinese Anki sync keys by Chinese words (学习 is not 学, 电脑 is not 电)', async () => {
    setStudyLang('zh');
    servedSnapshot = snapshotOf([entry('学习', 40), entry('电脑', 3), entry('今天天气', 30)]);
    const { syncKnowledgeFromAnki } = await import('../ankiSync');
    const result = await syncKnowledgeFromAnki();
    expect(result.ok).toBe(true);
    expect(getLevel('学习')).toBe(3);
    expect(getLevel('电脑')).toBe(2);
    expect(getLevel('学')).toBe(0);
    expect(getLevel('电')).toBe(0);
    expect(getLevel('今天')).toBe(3);
    expect(getLevel('天气')).toBe(3);
    // The reader finds them under the same keys.
    const reader = studyTokens('我在学习电脑。', 'zh').filter((t) => t.content).map((t) => t.lemma);
    expect(reader).toEqual(expect.arrayContaining(['学习', '电脑']));
  });

  it('one suspended card or duplicate note no longer hides a live word', async () => {
    servedSnapshot = snapshotOf([
      entry('飲む', 180, { suspended: true, allSuspended: false }), // one of its cards suspended
      entry('食べる', 200, { suspended: true, allSuspended: true }, 1), // a suspended duplicate…
      entry('食べた', 30, {}, 2), // …beside a live note of the same word
      entry('止まる', 400, { suspended: true, allSuspended: true }),
    ]);
    const { syncKnowledgeFromAnki } = await import('../ankiSync');
    await syncKnowledgeFromAnki();
    expect(getLevel('飲む')).toBe(3);
    expect(getLevel('食べる')).toBe(3);
    expect(getLevel('止まる')).toBe(0);
  });
});

describe('spelling variants in the reader', () => {
  const token = (surface: string, lemma: string, reading?: string) => ({ surface, lemma, reading });

  it('katakana and hiragana meet', () => {
    setLevel('ねこ', 3);
    expect(readerKeyForToken(token('ネコ', 'ネコ', 'ネコ'))).toBe('ねこ');
  });

  it('a kanji word meets the kana of its own dictionary reading', () => {
    setLevel('ねこ', 2);
    expect(readerKeyForToken(token('猫', '猫', 'ネコ'))).toBe('ねこ');
    // An inflected token's reading is not its lemma's: no alias.
    setLevel('たべ', 3);
    expect(readerKeyForToken(token('食べ', '食べる', 'タベ'))).toBe('食べる');
  });

  it('a graded spelling wins over any alias', () => {
    setLevel('猫', 1);
    setLevel('ねこ', 3);
    expect(readerKeyForToken(token('猫', '猫', 'ネコ'))).toBe('猫');
  });

  it('kana → kanji only through the reading index, once it is built', async () => {
    const { knownKeysForReading, resetReadingIndexForTests } = await import('../studyTokens');
    resetReadingIndexForTests();
    setLevel('猫', 3);
    expect(knownKeysForReading('ねこ')).toEqual([]); // starts the build
    await vi.waitFor(() => expect(knownKeysForReading('ねこ')).toEqual(['猫']), { timeout: 5000 });
    expect(readerKeyForToken(token('ねこ', 'ねこ', 'ネコ'))).toBe('猫');
  });
});

describe('migrating a store keyed the old ways', () => {
  function seed(lang: StudyLang, entries: Record<string, { l: number; m?: 1 }>): void {
    flushKnowledgeWrites();
    localStorage.setItem(knowledgeKey(lang), JSON.stringify(entries));
    // A store written by an older build carries no key-rule mark (an idle task
    // of an earlier test may have marked the empty store in between).
    localStorage.removeItem(knowledgeKeyRuleMark(lang));
    resetKnownWordsCacheForTests();
  }

  it('re-keys, keeps the max level, lets a manual level win, and backs up first', async () => {
    seed('ja', {
      勉強する: { l: 3 }, // old SRS key
      勉強: { l: 1 }, // reader / Anki key → max wins
      電話する: { l: 1, m: 1 }, // manual
      電話: { l: 3 }, // automatic: the manual level wins even though it is lower
      携帯電話: { l: 2 }, // old review compound → both parts
      携帯: { l: 1 },
      気をつける: { l: 3 }, // set phrase: stays
      ｶﾀｶﾅ: { l: 2 }, // NFKC
      ねこ: { l: 3 }, // kana: never re-tokenized
    });
    const moved = migrateKnowledgeKeys('ja');
    expect(moved).toBe(4);
    expect(getLevel('勉強')).toBe(3);
    expect(getLevel('勉強する')).toBe(0);
    expect(getLevel('電話')).toBe(1);
    expect(isManualLevel('電話')).toBe(true);
    expect(getLevel('携帯')).toBe(2);
    expect(getLevel('気をつける')).toBe(3);
    expect(getLevel('カタカナ')).toBe(2);
    expect(getLevel('ねこ')).toBe(3);
    flushKnowledgeWrites();
    expect(localStorage.getItem(knowledgeKeyRuleMark('ja'))).toBe(KNOWLEDGE_KEY_RULE);
    const stored = JSON.parse(localStorage.getItem(knowledgeKey('ja')) ?? '{}');
    expect(stored).not.toHaveProperty('勉強する');
    await vi.waitFor(() => expect(idb.get(knowledgeKeyBackupIdbKey('ja'))).toBeTruthy());
    const backup = idb.get(knowledgeKeyBackupIdbKey('ja')) as { entries: Record<string, unknown> };
    expect(backup.entries).toHaveProperty('勉強する');
    expect(backup.entries).toHaveProperty('携帯電話');
  });

  it('is idempotent: a second run moves nothing and the first backup is kept', async () => {
    seed('ja', { 勉強する: { l: 2 }, 食べた: { l: 3 } });
    expect(migrateKnowledgeKeys('ja')).toBe(2);
    await vi.waitFor(() => expect(idb.get(knowledgeKeyBackupIdbKey('ja'))).toBeTruthy());
    const first = JSON.stringify(idb.get(knowledgeKeyBackupIdbKey('ja')));
    expect(migrateKnowledgeKeys('ja')).toBe(0);
    flushKnowledgeWrites();
    // Even with the mark gone, the rule finds nothing left to move.
    localStorage.removeItem(knowledgeKeyRuleMark('ja'));
    resetKnownWordsCacheForTests();
    expect(migrateKnowledgeKeys('ja')).toBe(0);
    expect(getLevel('勉強')).toBe(2);
    expect(getLevel('食べる')).toBe(3);
    expect(JSON.stringify(idb.get(knowledgeKeyBackupIdbKey('ja')))).toBe(first);
  });

  it('runs on first read once kuromoji is built, and in Chinese / Russian without it', () => {
    seed('ja', { 勉強する: { l: 3 } });
    expect(getLevel('勉強')).toBe(3);
    setStudyLang('zh');
    seed('zh', { 'ＡＩ学习': { l: 2 } });
    expect(getLevel('AI学习')).toBe(2);
    setStudyLang('ru');
    seed('ru', { 'Кни́га': { l: 3 } });
    expect(getLevel('книга')).toBe(3);
  });

  it('folds a Chinese store keyed before rule 3: 學習 and 学习 become one entry, once', async () => {
    setStudyLang('zh');
    seed('zh', { 學習: { l: 3 }, 学习: { l: 1, m: 1 }, 電腦: { l: 2 }, 你好: { l: 3 } });
    // A store already marked with the previous rule is re-keyed again.
    localStorage.setItem(knowledgeKeyRuleMark('zh'), '2');
    expect(migrateKnowledgeKeys('zh')).toBe(2);
    expect(getLevel('学习')).toBe(1);
    expect(isManualLevel('学习')).toBe(true);
    expect(getLevel('电脑')).toBe(2);
    expect(getLevel('學習')).toBe(0);
    flushKnowledgeWrites();
    expect(localStorage.getItem(knowledgeKeyRuleMark('zh'))).toBe(KNOWLEDGE_KEY_RULE);
    expect(Object.keys(JSON.parse(localStorage.getItem(knowledgeKey('zh')) ?? '{}')).sort()).toEqual(['你好', '学习', '电脑'].sort());
    await vi.waitFor(() => expect(idb.get(knowledgeKeyBackupIdbKey('zh'))).toBeTruthy());
    expect(migrateKnowledgeKeys('zh')).toBe(0);
    // The reader colours a Traditional token by the Simplified entry.
    expect(wordKnowledgeKeys('學習', 'zh')).toEqual(['学习']);
  });

  it('the conservative rule leaves kana and already-correct keys alone', () => {
    const deps = { tokenizeJapanese: tokenizeSync };
    expect(migratedKnowledgeKeys('けいたい', 'ja', deps)).toBeNull();
    expect(migratedKnowledgeKeys('食べる', 'ja', deps)).toBeNull();
    expect(migratedKnowledgeKeys('気をつける', 'ja', deps)).toBeNull();
    expect(migratedKnowledgeKeys('勉強する', 'ja', deps)).toEqual(['勉強']);
  });
});

describe('writes in one task share one serialisation', () => {
  it('several grades → one localStorage write, landed by the end of the task', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    getLevel('x'); // load + migrate (empty store)
    setItem.mockClear();
    for (const word of ['一', '二', '三', '四', '五']) setInferredLevel(word, 2);
    const storeWrites = () => setItem.mock.calls.filter(([key]) => key === knowledgeKey('ja')).length;
    expect(storeWrites()).toBe(0);
    await Promise.resolve();
    expect(storeWrites()).toBe(1);
    expect(Object.keys(JSON.parse(localStorage.getItem(knowledgeKey('ja')) ?? '{}'))).toHaveLength(5);
    setItem.mockRestore();
  });
});

function entry(expression: string, ivlDays: number, extra: Partial<IntervalEntry> = {}, salt = 0): IntervalEntry {
  return { expression, ivlDays, noteId: expression.length * 7 + salt, modelName: 'Basic', ...extra };
}

function snapshotOf(entries: IntervalEntry[]): IntervalSnapshot {
  return { generatedAt: Date.now() + 60_000, sourceQueries: ['deck:test'], entries, noteCount: entries.length, truncated: false };
}
