// @vitest-environment node
//
// De-inflection through the REAL lookup paths, not just the rule engine.
//
// SCORECARD work package #1: 飲んでいた / 眠っていた / 食べてしまった did not
// de-inflect, so every surface built on the shared engine (hover pop-up, Snip,
// reader, extension) missed them. `deinflectForms.test.ts` pins the engine; this
// file pins that the two lookups which consume it — the SQLite `lookup()` and
// the legacy in-memory `lookupOfflineDeinflected()` — actually land on the
// dictionary word, with the chain, and apply Yomitan's part-of-speech check.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
// The legacy store's service hook opens a SQLite database in userData; the
// in-memory half of this file never reads it.
vi.mock('../dictionary/service', () => ({ initDictionaryService: () => undefined }));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importLegacyIndex } from '../dictionary/migrate';
import { lookup } from '../dictionary/dictService';
import { ensureYomitanTerms, lookupOfflineDeinflected, setYomitanLang } from '../dictionary/yomitan';
import type { YomitanDictInfo } from '../../shared/types';

const DICT_ID = 'fixture-jmdict-en';

const INFO: YomitanDictInfo = {
  id: DICT_ID,
  title: 'Fixture JMdict',
  revision: 'fixture',
  priority: 0,
  hasTerms: true,
  hasPitch: false,
  hasFreq: false,
  importedAt: 0,
  glossLangs: ['en'],
};

function term(word: string, reading: string, pos: string[], gloss: string) {
  return [{ word, reading, score: 1, senses: [{ partsOfSpeech: pos, definitions: [gloss], tags: [] }] }];
}

/** A small JMdict-shaped fixture with real part-of-speech codes. */
const TERMS = {
  飲む: term('飲む', 'のむ', ['v5m', 'vt'], 'to drink'),
  眠る: term('眠る', 'ねむる', ['v5r', 'vi'], 'to sleep'),
  食べる: term('食べる', 'たべる', ['v1', 'vt'], 'to eat'),
  帰る: term('帰る', 'かえる', ['v5r', 'vi'], 'to return'),
  来る: term('来る', 'くる', ['vk', 'vi'], 'to come'),
  行く: term('行く', 'いく', ['v5k-s', 'vi'], 'to go'),
  高い: term('高い', 'たかい', ['adj-i'], 'high'),
  いい: term('いい', 'いい', ['adj-ix'], 'good'),
  まず: term('まず', 'まず', ['adv'], 'first of all'),
  まる: term('まる', 'まる', ['n'], 'circle'),
  行ったり来たり: term('行ったり来たり', 'いったりきたり', ['n', 'vs'], 'going back and forth'),
};

let db: SqliteDb;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-deinflect-lookup-'));
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('SQLite lookup() resolves stacked conjugations to the dictionary word', () => {
  beforeEach(() => {
    db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
    importLegacyIndex(db, { version: 1, info: INFO, terms: TERMS });
  });

  it.each([
    ['飲んでいた', '飲む', ['progressive (–ている)', 'past']],
    ['眠っていた', '眠る', ['progressive (–ている)', 'past']],
    ['食べてしまった', '食べる', ['completion (–てしまう)', 'past']],
    ['来ていました', '来る', ['progressive (–ている)', 'polite past']],
    ['行っちゃった', '行く', ['completion (–ちゃう)', 'past']],
    ['帰ってきた', '帰る', ['–てくる', 'past']],
    ['高すぎる', '高い', ['–すぎる']],
    ['よかった', 'いい', ['past']],
  ] as const)('%s → %s', (surface, word, reasons) => {
    const hit = lookup(db, { text: surface }).entries.find((e) => e.text === word);
    expect(hit, `${surface} did not find ${word}`).toBeDefined();
    expect(hit?.via).toBe('deinflected');
    expect(hit?.reasons).toEqual(reasons);
  });

  it('applies the part-of-speech check: まず is not an inflection of the noun まる', () => {
    const texts = lookup(db, { text: 'まず' }).entries.map((e) => e.text);
    expect(texts).toContain('まず');
    expect(texts).not.toContain('まる');
    expect(lookup(db, { text: 'まらない' }).entries.filter((e) => e.via === 'deinflected')).toEqual([]);
  });
});

describe('legacy lookupOfflineDeinflected() resolves the same forms', () => {
  beforeEach(() => {
    const dir = path.join(tempRoot, 'yomitan', DICT_ID);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'yomitan', 'registry.json'),
      JSON.stringify({ dicts: [{ ...INFO, enabled: true }] }),
    );
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ version: 1, info: INFO, terms: TERMS }));
    ensureYomitanTerms();
    setYomitanLang(DICT_ID, '');
  });

  it.each([
    ['飲んでいた', '飲む'],
    ['眠っていた', '眠る'],
    ['食べてしまった', '食べる'],
    ['行っちゃった', '行く'],
  ])('%s → %s, exact-only and with the prefix scan', (surface, word) => {
    for (const exactOnly of [true, false]) {
      const found = lookupOfflineDeinflected(surface, exactOnly);
      expect(found.entries.map((e) => e.word)).toEqual([word]);
      expect(found.entries[0].via).toBe('deinflected');
      expect(found.deinflection).toMatchObject({ source: surface, term: word });
    }
  });

  it('does not let a prefix hit on the surface shadow the word it conjugates', () => {
    // 行った is a prefix of 行ったり来たり; before the fix the prefix scan ran
    // first and the pop-up never reached 行く.
    const found = lookupOfflineDeinflected('行った');
    expect(found.entries.map((e) => e.word)).toEqual(['行く']);
    expect(found.deinflection?.reasons).toEqual(['past']);
  });

  it('still falls back to the prefix scan when nothing de-inflects', () => {
    expect(lookupOfflineDeinflected('行ったり来').entries.map((e) => e.word)).toEqual(['行ったり来たり']);
  });

  it('applies the part-of-speech check: まらない (godan negative) never lands on the noun まる', () => {
    expect(lookupOfflineDeinflected('まらない', true).entries).toEqual([]);
    expect(lookupOfflineDeinflected('まらない').entries.map((e) => e.word)).not.toContain('まる');
  });
});
