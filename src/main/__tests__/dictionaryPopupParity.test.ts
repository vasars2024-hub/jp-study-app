// @vitest-environment node
//
// Dictionary / popup round 4, the main-process half (SCORECARD "Dictionary /
// popup" gaps against Yomitan and 10ten):
//  - kana-variant lookup: ネコ finds 猫 (reading ねこ), てれび finds テレビ;
//  - result ordering: among entries reached the same way, the more frequent
//    word first (かみ → 紙 / 神 before a rare homophone), and fewer de-inflection
//    steps first; an install with no frequency corpus orders as before;
//  - the popup's longest-match scan (`dict:scanLongest`): 携帯電話 from a click
//    on 携帯, never a prefix near miss.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const h = vi.hoisted(() => ({ root: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => h.root, isPackaged: false, getAppPath: () => h.root, on: () => undefined },
  ipcMain: { handle: () => undefined, on: () => undefined },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importLegacyIndex, type LegacyDictIndex } from '../dictionary/migrate';
import { compareLookupEntries, kanaScriptVariants, lookup, type LookupEntry } from '../dictionary/dictService';
import type { YomitanDictInfo } from '../../shared/types';

function info(id: string, title: string, priority = 0): YomitanDictInfo {
  return {
    id, title, revision: 'r', priority, hasTerms: true, hasPitch: false, hasFreq: false,
    importedAt: 0, enabled: true, glossLangs: ['en'],
  };
}

const term = (word: string, reading: string, pos: string, gloss: string) =>
  [{ word, reading, score: 0, senses: [{ partsOfSpeech: [pos], definitions: [gloss], tags: [] }] }];

/** Inserted in this order on purpose: by headword id the rare 加味 comes first. */
const JMDICT: LegacyDictIndex = {
  version: 1,
  info: info('jmdict-en', 'JMdict (English)'),
  terms: {
    加味: term('加味', 'かみ', 'n', 'seasoning'),
    紙: term('紙', 'かみ', 'n', 'paper'),
    神: term('神', 'かみ', 'n', 'god'),
    猫: term('猫', 'ねこ', 'n', 'cat'),
    テレビ: term('テレビ', 'テレビ', 'n', 'television'),
    携帯: term('携帯', 'けいたい', 'n', 'carrying'),
    携帯電話: term('携帯電話', 'けいたいでんわ', 'n', 'mobile phone'),
    電話: term('電話', 'でんわ', 'n', 'telephone'),
  },
};

describe('kana-variant lookup', () => {
  let db: SqliteDb;
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-popup-parity-'));
    db = openDictionaryDb({ dir: path.join(dir, 'dictionary') });
    importLegacyIndex(db, JMDICT);
  });
  afterEach(() => {
    if (db?.open) db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names the other kana script of an all-kana query, and nothing else', () => {
    expect(kanaScriptVariants('ネコ')).toEqual(['ねこ']);
    expect(kanaScriptVariants('てれび')).toEqual(['テレビ']);
    expect(kanaScriptVariants('らーめん')).toEqual(['ラーメン']);
    // One kana is a particle far more often than a word; kanji has no kana variant.
    expect(kanaScriptVariants('ね')).toEqual([]);
    expect(kanaScriptVariants('猫')).toEqual([]);
    expect(kanaScriptVariants('ぼくのテレビ')).toEqual(['ぼくのてれび', 'ボクノテレビ']);
  });

  it('finds a kanji word from its reading typed in katakana (ネコ → 猫)', () => {
    const result = lookup(db, { text: 'ネコ', sourceLangs: ['ja'], headwordsOnly: true });
    const cat = result.entries.find((entry) => entry.text === '猫');
    expect(cat?.via).toBe('reading');
  });

  it('finds a katakana word typed in hiragana (てれび → テレビ)', () => {
    const result = lookup(db, { text: 'てれび', sourceLangs: ['ja'], headwordsOnly: true });
    expect(result.entries.map((entry) => entry.text)).toContain('テレビ');
  });

  it('orders homophones by frequency when a corpus ranks them', () => {
    // No corpus: dictionary priority, then id — the rare 加味 first, as before.
    const before = lookup(db, { text: 'かみ', sourceLangs: ['ja'], headwordsOnly: true });
    expect(before.entries.map((entry) => entry.text).slice(0, 3)).toEqual(['加味', '紙', '神']);

    db.prepare(`insert into dictionaries (id, title, source_lang, kind) values ('freq-novels', 'Novels', 'ja', 'freq')`).run();
    const add = db.prepare(`insert into freq_corpora (lang, norm, corpus, rank) values ('ja', ?, 'freq-novels', ?)`);
    add.run('神', 900);
    add.run('紙', 1500);
    add.run('加味', 41000);
    const after = lookup(db, { text: 'かみ', sourceLangs: ['ja'], headwordsOnly: true });
    expect(after.entries.map((entry) => entry.text).slice(0, 3)).toEqual(['神', '紙', '加味']);
    expect(after.entries[0].freqRank).toBe(900);
  });
});

describe('compareLookupEntries', () => {
  const entry = (over: Partial<LookupEntry>): LookupEntry => ({
    headwordId: 1, dictId: 'd', dictTitle: 'D', lang: 'ja', text: 'x', reading: '', readingNorm: '',
    senses: [], via: 'deinflected', score: 0, sources: [], dictionaryPriority: 0, ...over,
  });

  it('puts fewer Japanese de-inflection steps first, as Yomitan does', () => {
    const deep = entry({ headwordId: 1, text: 'a', reasons: ['causative', 'passive', 'past'] });
    const shallow = entry({ headwordId: 2, text: 'b', reasons: ['past'] });
    expect([deep, shallow].sort(compareLookupEntries).map((e) => e.text)).toEqual(['b', 'a']);
  });

  it('leaves a Russian paradigm row in dictionary order whatever its tag count', () => {
    const many = entry({ headwordId: 1, lang: 'ru', text: 'a', reasons: ['genitive', 'singular'] });
    const few = entry({ headwordId: 2, lang: 'ru', text: 'b', reasons: ['nominative'] });
    expect([many, few].sort(compareLookupEntries).map((e) => e.text)).toEqual(['a', 'b']);
  });

  it('never lets frequency lift a looser match over a stricter one', () => {
    const exact = entry({ headwordId: 2, via: 'exact', text: 'rare', freqRank: 50000 });
    const prefix = entry({ headwordId: 1, via: 'prefix', text: 'common', freqRank: 10 });
    expect([prefix, exact].sort(compareLookupEntries).map((e) => e.text)).toEqual(['rare', 'common']);
  });
});

describe('the popup longest-match scan', () => {
  let scanLongestForPopup: typeof import('../dictionary').scanLongestForPopup;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-popup-scan-'));
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as typeof fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { dictionaryDb } = await import('../dictionary/db');
    importLegacyIndex(dictionaryDb(), JMDICT);
    ({ scanLongestForPopup } = await import('../dictionary'));
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    const { closeDictionaryDb } = await import('../dictionary/db');
    closeDictionaryDb();
    vi.restoreAllMocks();
  });

  it('answers a click on 携帯 with the compound 携帯電話', async () => {
    await expect(scanLongestForPopup('携帯電話を使う', 'ja')).resolves.toEqual({ matched: '携帯電話' });
  });

  it('never reports a prefix near miss as the word (猫 is not 猫舌)', async () => {
    await expect(scanLongestForPopup('猫が好き', 'ja')).resolves.toEqual({ matched: '猫' });
  });

  it('is a quiet miss for junk, an empty window or a non-string', async () => {
    await expect(scanLongestForPopup('', 'ja')).resolves.toEqual({ matched: '' });
    await expect(scanLongestForPopup(42 as unknown as string, 'ja')).resolves.toEqual({ matched: '' });
    await expect(scanLongestForPopup('ぬぬぬ', 'ja')).resolves.toEqual({ matched: '' });
  });
});
