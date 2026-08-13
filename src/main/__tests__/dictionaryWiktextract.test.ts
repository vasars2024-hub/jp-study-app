// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { lookup } from '../dictionary/dictService';
import {
  WIKTEXTRACT_LICENCE,
  classifyForms,
  importWiktextract,
  inflectionKey,
  pinyinReadingKey,
  readJsonlLines,
} from '../dictionary/importers/wiktextract';

let db: SqliteDb;

const RUSSIAN = {
  word: 'собака',
  lang_code: 'ru',
  pos: 'noun',
  senses: [{ glosses: ['dog'], tags: ['animate'] }, { glosses: ['scoundrel'], tags: ['figuratively'] }],
  forms: [
    { form: 'соба́ки', tags: ['genitive', 'singular'] },
    { form: 'соба́ке', tags: ['dative', 'singular'] },
    { form: 'ru-noun-table', source: 'declension', tags: ['inflection-template'] },
    { form: 'no-table-tags', source: 'declension', tags: ['table-tags'] },
    { form: 'sobáka', tags: ['romanization'] },
  ],
};

const JAPANESE = {
  word: '食べる',
  lang_code: 'ja',
  pos: 'verb',
  senses: [{ glosses: ['to eat'] }],
  forms: [
    { form: 'たべる', tags: ['hiragana'] },
    { form: '食べた', tags: ['past'] },
    { form: 'taberu', tags: ['romaji'] },
  ],
};

const CHINESE = {
  word: '狗',
  lang_code: 'zh',
  pos: 'noun',
  senses: [{ glosses: ['dog'] }],
  forms: [{ form: 'gǒu', tags: ['pinyin'] }],
};

/** A language the default filter must drop, and a stub page with no definition. */
const FILTERED = [
  { word: 'Hund', lang_code: 'de', pos: 'noun', senses: [{ glosses: ['dog'] }] },
  { word: 'ghostword', lang_code: 'en', pos: 'noun', senses: [{ tags: ['obsolete'] }] },
];

const FIXTURE = [
  '',
  JSON.stringify(RUSSIAN),
  JSON.stringify(JAPANESE),
  '{ this is not json',
  JSON.stringify(CHINESE),
  ...FILTERED.map((record) => JSON.stringify(record)),
].join('\n');

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-wiktextract-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('importWiktextract', () => {
  it('imports the study languages and skips junk, other languages and stubs', () => {
    const counts = importWiktextract(db, FIXTURE.split('\n'));

    expect(counts.entries).toBe(3);
    expect(counts.headwords).toBe(3);
    expect(counts.senses).toBe(4);
    expect(counts.glosses).toBe(4);
    // blank line, unparseable line, the German record, and the definition-less stub
    expect(counts.skipped).toBe(4);
    expect(counts.cancelled).toBe(false);

    const row = db.prepare('select licence, entry_count, enabled from dictionaries where id = ?')
      .get('wiktextract') as { licence: string; entry_count: number; enabled: number };
    expect(row.licence).toBe(WIKTEXTRACT_LICENCE);
    expect(row.entry_count).toBe(3);
    expect(row.enabled).toBe(1);
  });

  it('stores each headword under its own language rather than the dump language', () => {
    importWiktextract(db, FIXTURE.split('\n'));
    const langs = (db.prepare('select lang, text from headwords order by lang').all() as
      { lang: string; text: string }[]);
    expect(langs).toEqual([
      { lang: 'ja', text: '食べる' },
      { lang: 'ru', text: 'собака' },
      { lang: 'zh', text: '狗' },
    ]);
  });

  it('reads a kana form as a reading and a pinyin form as a toneless search key', () => {
    importWiktextract(db, FIXTURE.split('\n'));
    const japanese = db.prepare('select reading, reading_norm from headwords where text = ?')
      .get('食べる') as { reading: string; reading_norm: string };
    expect(japanese.reading).toBe('たべる');
    expect(japanese.reading_norm).toBe('たべる');

    const chinese = db.prepare('select reading, reading_norm from headwords where text = ?')
      .get('狗') as { reading: string; reading_norm: string };
    expect(chinese.reading).toBe('gǒu');
    expect(chinese.reading_norm).toBe('gou');
  });

  it('writes only real inflected forms, with the paradigm in tags', () => {
    importWiktextract(db, FIXTURE.split('\n'));
    const forms = (db.prepare('select form, name, tags from inflections order by form').all() as
      { form: string; name: string | null; tags: string }[]);

    expect(forms.map((f) => f.form)).toEqual(['собаке', 'собаки', '食べた']);
    // The stress accents the source writes and no user types are gone from the key.
    expect(forms.every((f) => !/[̀́]/.test(f.form.normalize('NFD')))).toBe(true);
    // `name` stays null so the displayed reason chain does not repeat every tag.
    expect(forms.every((f) => f.name === null)).toBe(true);
    expect(forms.find((f) => f.form === 'собаки')?.tags).toBe('genitive,singular');
  });

  it('makes an imported declension reachable through the unified lookup', () => {
    importWiktextract(db, FIXTURE.split('\n'));
    // Neither the Russian suffix heuristic nor the Japanese de-inflector produces
    // this: `собаки` -> `собак`, which is not the headword. Only the imported table
    // can answer it, so this is the assertion that proves the writer feeds the reader.
    const result = lookup(db, { text: 'собаки', headwordsOnly: true });
    const entry = result.entries.find((candidate) => candidate.text === 'собака');
    expect(entry).toBeDefined();
    expect(entry?.via).toBe('deinflected');
    expect(entry?.reasons).toEqual(['genitive', 'singular']);
    expect(entry?.senses[0].glosses[0].text).toBe('dog');
  });

  it('re-importing replaces the previous copy instead of duplicating it', () => {
    importWiktextract(db, FIXTURE.split('\n'));
    importWiktextract(db, FIXTURE.split('\n'));
    const headwords = (db.prepare('select count(*) c from headwords').get() as { c: number }).c;
    const inflections = (db.prepare('select count(*) c from inflections').get() as { c: number }).c;
    expect(headwords).toBe(3);
    expect(inflections).toBe(3);
  });

  it('a cancelled import leaves the database exactly as it was', () => {
    const lines = FIXTURE.split('\n');
    const counts = importWiktextract(db, lines, { progressEvery: 1, shouldCancel: () => true });

    expect(counts.cancelled).toBe(true);
    expect(counts.headwords).toBe(0);
    // The rollback has to take the dictionary row with it, or the next status call
    // reports a dictionary that holds nothing.
    const dictionaries = (db.prepare('select count(*) c from dictionaries').get() as { c: number }).c;
    const headwords = (db.prepare('select count(*) c from headwords').get() as { c: number }).c;
    expect(dictionaries).toBe(0);
    expect(headwords).toBe(0);
  });

  it('honours an explicit language filter', () => {
    const counts = importWiktextract(db, FIXTURE.split('\n'), { langs: ['de'], dictId: 'de-only' });
    expect(counts.entries).toBe(1);
    const row = db.prepare('select lang, text from headwords').get() as { lang: string; text: string };
    expect(row).toEqual({ lang: 'de', text: 'Hund' });
  });
});

describe('classifyForms', () => {
  it('drops template scaffolding, transliterations and untagged forms', () => {
    const classified = classifyForms(RUSSIAN);
    expect(classified.reading).toBe('');
    expect(classified.inflections.map((form) => form.form)).toEqual(['собаки', 'собаке']);
  });

  it('never treats the headword itself as one of its own inflections', () => {
    const classified = classifyForms({
      word: 'dog', lang_code: 'en', forms: [{ form: 'dog', tags: ['plural'] }, { form: 'dogs', tags: ['plural'] }],
    });
    expect(classified.inflections.map((form) => form.form)).toEqual(['dogs']);
  });
});

describe('inflectionKey', () => {
  it('strips stress marks but keeps letters that a diacritic distinguishes', () => {
    // Escapes, not pasted characters: a combining mark is invisible in an editor,
    // so an assertion written with one proves nothing about what it meant to assert.
    expect(inflectionKey('\u0441\u043e\u0431\u0430\u0301\u043a\u0438')).toBe('\u0441\u043e\u0431\u0430\u043a\u0438');
    // \u0451 is a different Russian letter from \u0435 and must survive, composed or not.
    expect(inflectionKey('\u0451\u043b\u043a\u0438')).toBe('\u0451\u043b\u043a\u0438');
    expect(inflectionKey('\u0435\u0308\u043b\u043a\u0438')).toBe('\u0451\u043b\u043a\u0438');
  });
});

describe('pinyinReadingKey', () => {
  it('removes the tone marks and the spaces but keeps \u00fc', () => {
    expect(pinyinReadingKey('g\u01d2u')).toBe('gou');
    expect(pinyinReadingKey('chu\u00e1n t\u01d2ng')).toBe('chuantong');
    // One syllable in all four tones collapses onto one key, which is the point:
    // a learner who cannot hear the tone still has to be able to find the word.
    expect(pinyinReadingKey('m\u0101 m\u00e1 m\u01ce m\u00e0')).toBe('mamamama');
    expect(pinyinReadingKey('l\u01dc')).toBe('l\u00fc');
  });
});

describe('readJsonlLines', () => {
  it('decodes multi-byte characters split across a chunk boundary', () => {
    const file = path.join(tempRoot, 'dump.jsonl');
    const records = Array.from({ length: 40 }, (_, index) =>
      JSON.stringify({ word: `日本語${index}`, lang_code: 'ja', senses: [{ glosses: ['test'] }] }));
    fs.writeFileSync(file, `${records.join('\n')}\n`, 'utf8');

    // A chunk size that is not a multiple of any line length guarantees the reads
    // land inside multi-byte characters; a per-chunk decode would yield U+FFFD here.
    const lines = [...readJsonlLines(file, 7)];
    expect(lines).toEqual(records);
    expect(lines.join('')).not.toContain('�');
  });

  it('yields a final line that has no trailing newline', () => {
    const file = path.join(tempRoot, 'tail.jsonl');
    fs.writeFileSync(file, 'a\nb', 'utf8');
    expect([...readJsonlLines(file, 4)]).toEqual(['a', 'b']);
  });
});
