// @vitest-environment node
//
// The claim under test: the `etymology` table finally has a writer *and* a
// reader, and what the reader returns is verbatim source prose attributed to the
// dictionary that supplied it — never a paragraph belonging to another word, and
// never the same paragraph twice because a dump repeated it per part of speech.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { findLexiconEtymology } from '../dictionary/dictService';
import {
  MAX_ETYMOLOGY_CHARS,
  etymologyText,
  importWiktextract,
} from '../dictionary/importers/wiktextract';
import {
  normalizeEtymologyText,
  selectLexiconEtymologies,
  type LexiconEtymology,
} from '../../shared/lexiconEtymology';

let db: SqliteDb;

const INU_NOUN = {
  word: '犬',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['dog'] }],
  etymology_text: 'From Old Japanese, of unclear ultimate origin.',
};

/** The same word under a second part of speech, repeating the same paragraph. */
const INU_AFFIX = {
  word: '犬',
  lang_code: 'ja',
  pos: 'affix',
  senses: [{ glosses: ['dog-'] }],
  etymology_text: 'From Old Japanese,  of unclear ultimate origin.',
};

/** A different word entirely, so a cross-attached paragraph would be visible. */
const NEKO = {
  word: '猫',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['cat'] }],
  etymology_text: 'Attested in the Man’yōshū; origin debated.',
};

/** Carries no origin at all, which is the common case in a real dump. */
const MIZU = {
  word: '水',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['water'] }],
};

const lines = (...records: unknown[]) => records.map((record) => JSON.stringify(record));

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-etymology-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  db?.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('the wiktextract importer writes the etymology table', () => {
  it('stores one row per record that carries an origin, filed under its part of speech', () => {
    const counts = importWiktextract(db, lines(INU_NOUN, INU_AFFIX, NEKO, MIZU), {
      dictId: 'wikt', title: 'Wiktionary (JA)',
    });

    expect(counts.headwords).toBe(4);
    // 水 has no origin, so three of the four records wrote a row.
    expect(counts.etymologies).toBe(3);

    const rows = db.prepare(
      'select lang, text, source from etymology order by rowid',
    ).all() as Array<{ lang: string; text: string; source: string | null }>;
    expect(rows).toHaveLength(3);
    expect(rows[0].lang).toBe('ja');
    expect(rows[0].source).toBe('noun');
    expect(rows[1].source).toBe('affix');
    expect(rows[2].text).toContain('Man');
  });

  it('reads etymology_texts only when the joined etymology_text is absent', () => {
    expect(etymologyText({ etymology_text: 'joined', etymology_texts: ['a', 'b'] })).toBe('joined');
    expect(etymologyText({ etymology_texts: ['a', 'b'] })).toBe('a\n\nb');
    expect(etymologyText({})).toBe('');
  });

  it('drops a runaway paragraph rather than truncating it into a claim the source never made', () => {
    const long = 'x'.repeat(MAX_ETYMOLOGY_CHARS + 1);
    expect(etymologyText({ etymology_text: long })).toBe('');
    expect(etymologyText({ etymology_text: 'x'.repeat(MAX_ETYMOLOGY_CHARS) })).toHaveLength(
      MAX_ETYMOLOGY_CHARS,
    );
  });

  it('rolls the etymology rows back with everything else when the import is cancelled', () => {
    const counts = importWiktextract(db, lines(INU_NOUN, NEKO), {
      dictId: 'wikt', progressEvery: 1, shouldCancel: () => true,
    });
    expect(counts.cancelled).toBe(true);
    expect(counts.etymologies).toBe(0);
    expect((db.prepare('select count(*) as n from etymology').get() as { n: number }).n).toBe(0);
  });
});

describe('findLexiconEtymology', () => {
  beforeEach(() => {
    importWiktextract(db, lines(INU_NOUN, INU_AFFIX, NEKO, MIZU), {
      dictId: 'wikt', title: 'Wiktionary (JA)',
    });
  });

  it('returns the word’s own paragraph, attributed, and collapses the per-POS repeat', () => {
    const result = findLexiconEtymology(db, { text: '犬' });
    expect(result.query).toBe('犬');
    expect(result.etymologies).toHaveLength(1);
    expect(result.etymologies[0].text).toBe('From Old Japanese, of unclear ultimate origin.');
    expect(result.etymologies[0].dictTitle).toBe('Wiktionary (JA)');
    expect(result.etymologies[0].dictId).toBe('wikt');
    expect(result.etymologies[0].lang).toBe('ja');
    // The surviving row is the first one, so it keeps the first record's POS.
    expect(result.etymologies[0].pos).toBe('noun');
    // The other word's paragraph is not attached to this one.
    expect(result.etymologies[0].text).not.toContain('Man');
  });

  it('returns nothing for a word the dictionaries carry but state no origin for', () => {
    expect(findLexiconEtymology(db, { text: '水' }).etymologies).toEqual([]);
  });

  it('returns nothing for a word that is not in any dictionary', () => {
    expect(findLexiconEtymology(db, { text: '存在しない語' }).etymologies).toEqual([]);
    expect(findLexiconEtymology(db, { text: '   ' }).etymologies).toEqual([]);
  });

  it('honours the source-language filter rather than answering across languages', () => {
    expect(findLexiconEtymology(db, { text: '犬', sourceLangs: ['ja'] }).etymologies).toHaveLength(1);
    expect(findLexiconEtymology(db, { text: '犬', sourceLangs: ['ru'] }).etymologies).toEqual([]);
  });

  it('skips a disabled dictionary, the same as every other lookup surface', () => {
    db.prepare('update dictionaries set enabled = 0 where id = ?').run('wikt');
    expect(findLexiconEtymology(db, { text: '犬' }).etymologies).toEqual([]);
  });

  it('loses the rows with the dictionary, through the foreign key cascade', () => {
    db.prepare('delete from dictionaries where id = ?').run('wikt');
    expect((db.prepare('select count(*) as n from etymology').get() as { n: number }).n).toBe(0);
  });

  it('orders sources by dictionary priority, so the one a user ranked first speaks first', () => {
    importWiktextract(db, lines({ ...INU_NOUN, etymology_text: 'A rival account.' }), {
      dictId: 'wikt-2', title: 'Second source', priority: 5,
    });
    const result = findLexiconEtymology(db, { text: '犬' });
    expect(result.etymologies.map((row) => row.dictTitle)).toEqual([
      'Second source', 'Wiktionary (JA)',
    ]);
  });
});

describe('selectLexiconEtymologies', () => {
  const row = (over: Partial<LexiconEtymology> = {}): LexiconEtymology => ({
    lang: 'ja', text: 'origin', dictId: 'd', dictTitle: 'D', ...over,
  });

  it('compares on layout-normalised text but keeps the source’s own casing', () => {
    expect(normalizeEtymologyText('  From   Old\nJapanese ')).toBe('From Old Japanese');
    const chosen = selectLexiconEtymologies([
      row({ text: 'From Old Japanese' }),
      row({ text: 'From  Old\n Japanese' }),
      row({ text: 'from old japanese' }),
    ]);
    // The first two are one paragraph laid out twice; the third differs in case
    // and a case fold here would merge a proper noun with a common one.
    expect(chosen.map((item) => item.text)).toEqual(['From Old Japanese', 'from old japanese']);
  });

  it('drops empty prose and honours the limit', () => {
    const chosen = selectLexiconEtymologies(
      [row({ text: '   ' }), row({ text: 'a' }), row({ text: 'b' }), row({ text: 'c' })],
      2,
    );
    expect(chosen.map((item) => item.text)).toEqual(['a', 'b']);
  });
});
