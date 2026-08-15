// @vitest-environment node
//
// The claim under test: `xrefs` — the third v1 table that shipped with an index
// and no traffic in either direction — now has a writer and a reader, and what
// the reader returns is a relation a dictionary actually stated, marked with
// whether this install can navigate to it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { findLexiconXrefs } from '../dictionary/dictService';
import { classifyXrefs, importWiktextract } from '../dictionary/importers/wiktextract';
import {
  normalizeXrefKind,
  normalizeXrefText,
  selectLexiconXrefs,
  type LexiconXref,
} from '../../shared/lexiconXrefs';

let db: SqliteDb;

const INU = {
  word: '犬',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{
    glosses: ['dog'],
    synonyms: [{ word: '狗' }, { word: 'ワンちゃん' }],
    antonyms: [{ word: '猫' }],
    related: [{ word: '子犬' }],
    // Wiktionary lists the page's own headword among its related terms often
    // enough that this is the common case, not a contrived one.
    coordinate_terms: [{ word: '犬' }],
    see_also: ['狼'],
  }],
};

/** The same word under a second part of speech, repeating the same links. */
const INU_AFFIX = {
  word: '犬',
  lang_code: 'ja',
  pos: 'affix',
  senses: [{ glosses: ['dog-'], synonyms: [{ word: '狗' }] }],
};

/** 猫 exists as its own headword, so 犬's antonym resolves; 狗 and 狼 do not. */
const NEKO = { word: '猫', lang_code: 'ja', pos: 'noun', senses: [{ glosses: ['cat'] }] };

/** Carries no cross references at all, which is most of a real dump. */
const MIZU = { word: '水', lang_code: 'ja', pos: 'noun', senses: [{ glosses: ['water'] }] };

/**
 * A spelling stored with its kana reading. JMdict writes a quarter of its own
 * targets this way — `see: みっこくしゃ`, never `see: 密告者` — so the target is a
 * headword's `reading_norm` and never appears in `norm` at all.
 */
const MIKKOKUSHA = {
  word: '密告者',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['informer'] }],
  forms: [{ form: 'みっこくしゃ', tags: ['hiragana'] }],
};

/** Points at that reading rather than at the spelling. */
const TSUUHOUSHA = {
  word: '通報者',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['reporter'], see_also: ['みっこくしゃ'] }],
};

const lines = (...records: unknown[]) => records.map((record) => JSON.stringify(record));

const xref = (over: Partial<LexiconXref> = {}): LexiconXref => ({
  kind: 'syn', text: 'x', lang: 'ja', dictId: 'd', dictTitle: 'D', resolved: false, ...over,
});

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-xrefs-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  db?.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('classifyXrefs', () => {
  it('maps each kaikki link field onto the kind the schema documents', () => {
    expect(classifyXrefs(INU.senses[0], '犬')).toEqual([
      { kind: 'syn', text: '狗' },
      { kind: 'syn', text: 'ワンちゃん' },
      { kind: 'ant', text: '猫' },
      { kind: 'see', text: '狼' },
      { kind: 'cf', text: '子犬' },
    ]);
  });

  it('drops a self reference, so an entry does not point at the page being read', () => {
    const rows = classifyXrefs({ glosses: ['x'], related: [{ word: '犬' }, { word: '子犬' }] }, '犬');
    expect(rows).toEqual([{ kind: 'cf', text: '子犬' }]);
  });

  it('drops a target that is prose rather than a word', () => {
    const long = 'see the usage note at the entry for this word, which is long';
    const rows = classifyXrefs({ glosses: ['x'], synonyms: [{ word: long }, { word: '狗' }] }, '犬');
    expect(rows).toEqual([{ kind: 'syn', text: '狗' }]);
  });

  it('reads see_also whether kaikki emitted objects or bare strings', () => {
    const rows = classifyXrefs({ glosses: ['x'], see_also: ['狼', { word: '狐' }, 7 as never] }, '犬');
    expect(rows).toEqual([{ kind: 'see', text: '狼' }, { kind: 'see', text: '狐' }]);
  });

  it('survives a record whose link fields are missing or the wrong shape', () => {
    expect(classifyXrefs({ glosses: ['x'] }, '犬')).toEqual([]);
    expect(classifyXrefs({ glosses: ['x'], synonyms: 'nope' as never }, '犬')).toEqual([]);
    expect(classifyXrefs({ glosses: ['x'], synonyms: [{}, { word: '  ' }] }, '犬')).toEqual([]);
  });
});

describe('normalizeXrefKind', () => {
  it('accepts the kaikki field names and the stored kinds alike', () => {
    expect(normalizeXrefKind('synonyms')).toBe('syn');
    expect(normalizeXrefKind('Antonyms')).toBe('ant');
    expect(normalizeXrefKind('see_also')).toBe('see');
    expect(normalizeXrefKind('coordinate_terms')).toBe('cf');
    expect(normalizeXrefKind('related')).toBe('cf');
  });

  it('returns null for a relation the schema has no vocabulary for', () => {
    expect(normalizeXrefKind('hypernyms')).toBeNull();
    expect(normalizeXrefKind('')).toBeNull();
  });
});

describe('selectLexiconXrefs', () => {
  it('deduplicates on kind and text together, keeping a word listed under two relations', () => {
    const rows = selectLexiconXrefs([
      xref({ kind: 'syn', text: '狗' }),
      xref({ kind: 'syn', text: ' 狗 ' }),
      xref({ kind: 'ant', text: '狗' }),
    ]);
    expect(rows.map((row) => `${row.kind}:${row.text}`)).toEqual(['syn:狗', 'ant:狗']);
  });

  it('honours the limit and drops empty targets', () => {
    const rows = selectLexiconXrefs(
      [xref({ text: '  ' }), xref({ text: 'a' }), xref({ text: 'b' })],
      1,
    );
    expect(rows).toEqual([xref({ text: 'a' })]);
  });

  it('collapses whitespace inside a target', () => {
    expect(normalizeXrefText(' big  dog\n')).toBe('big dog');
  });
});

describe('the wiktextract importer writes the xrefs table', () => {
  it('writes one row per stated relation, hung off the sense that stated it', () => {
    const counts = importWiktextract(db, lines(INU, INU_AFFIX, NEKO, MIZU), {
      dictId: 'wikt', title: 'Wiktionary (JA)',
    });

    expect(counts.headwords).toBe(4);
    // 犬's five surviving links plus the affix record's one repeat. The self
    // reference is not among them.
    expect(counts.xrefs).toBe(6);

    const rows = db.prepare(`
      select x.to_text, x.kind, s.headword_id
      from xrefs x join senses s on s.id = x.from_sense
      order by x.rowid
    `).all() as Array<{ to_text: string; kind: string; headword_id: number }>;
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ to_text: '狗', kind: 'syn' });
    expect(rows[2]).toMatchObject({ to_text: '猫', kind: 'ant' });
    // The affix record is a different headword, so its repeat is a distinct row
    // in storage and only collapses in the reader.
    expect(rows[5].headword_id).not.toBe(rows[0].headword_id);
  });

  it('rolls the xref rows back with everything else when the import is cancelled', () => {
    const counts = importWiktextract(db, lines(INU, NEKO), {
      dictId: 'wikt', progressEvery: 1, shouldCancel: () => true,
    });
    expect(counts.cancelled).toBe(true);
    expect(counts.xrefs).toBe(0);
    expect((db.prepare('select count(*) as n from xrefs').get() as { n: number }).n).toBe(0);
  });

  it('takes a sense’s references with it when the sense itself is dropped', () => {
    // A record whose only sense has no gloss is a stub page; the importer skips
    // it, and an xref whose from_sense does not exist is unreachable by any read.
    const counts = importWiktextract(
      db,
      lines({ word: '犬', lang_code: 'ja', senses: [{ synonyms: [{ word: '狗' }] }] }),
      { dictId: 'wikt' },
    );
    expect(counts.headwords).toBe(0);
    expect(counts.xrefs).toBe(0);
  });
});

describe('findLexiconXrefs', () => {
  beforeEach(() => {
    importWiktextract(db, lines(INU, INU_AFFIX, NEKO, MIZU), {
      dictId: 'wikt', title: 'Wiktionary (JA)',
    });
  });

  it('returns the relations stated for the word, deduplicated across parts of speech', () => {
    const result = findLexiconXrefs(db, { text: '犬', sourceLangs: ['ja'] });
    expect(result.query).toBe('犬');
    expect(result.xrefs.map((row) => `${row.kind}:${row.text}`)).toEqual([
      'syn:狗', 'syn:ワンちゃん', 'ant:猫', 'see:狼', 'cf:子犬',
    ]);
    expect(result.xrefs[0]).toMatchObject({ lang: 'ja', dictId: 'wikt', dictTitle: 'Wiktionary (JA)' });
  });

  it('marks only the targets this install can actually navigate to', () => {
    const result = findLexiconXrefs(db, { text: '犬', sourceLangs: ['ja'] });
    const resolved = Object.fromEntries(result.xrefs.map((row) => [row.text, row.resolved]));
    // 猫 was imported as its own headword; 狗, ワンちゃん, 狼 and 子犬 were not.
    expect(resolved).toEqual({
      狗: false, ワンちゃん: false, 猫: true, 狼: false, 子犬: false,
    });
  });

  it('carries the part of speech the source filed the sense under', () => {
    const result = findLexiconXrefs(db, { text: '犬', sourceLangs: ['ja'] });
    expect(result.xrefs.every((row) => row.pos === 'noun')).toBe(true);
  });

  it('answers empty for a word with no stated relations, and for one that is absent', () => {
    expect(findLexiconXrefs(db, { text: '水' })).toEqual({ query: '水', xrefs: [] });
    expect(findLexiconXrefs(db, { text: '存在しない' })).toEqual({ query: '存在しない', xrefs: [] });
    expect(findLexiconXrefs(db, { text: '   ' })).toEqual({ query: '', xrefs: [] });
  });

  it('does not attach one word’s relations to another', () => {
    expect(findLexiconXrefs(db, { text: '猫', sourceLangs: ['ja'] }).xrefs).toEqual([]);
  });

  it('honours the source-language filter', () => {
    expect(findLexiconXrefs(db, { text: '犬', sourceLangs: ['ru'] }).xrefs).toEqual([]);
  });

  it('honours the limit', () => {
    expect(findLexiconXrefs(db, { text: '犬', sourceLangs: ['ja'], limit: 2 }).xrefs).toHaveLength(2);
  });

  it('drops a stored kind outside the four the schema documents', () => {
    const sense = db.prepare(`
      select s.id from senses s join headwords h on h.id = s.headword_id where h.text = '水'
    `).get() as { id: number };
    db.prepare('insert into xrefs (from_sense, to_text, kind) values (?, ?, ?)')
      .run(sense.id, '氷', 'hypernym');
    expect(findLexiconXrefs(db, { text: '水', sourceLangs: ['ja'] }).xrefs).toEqual([]);
  });

  it('excludes a disabled dictionary from both the read and the resolution probe', () => {
    db.prepare('update dictionaries set enabled = 0 where id = ?').run('wikt');
    expect(findLexiconXrefs(db, { text: '犬', sourceLangs: ['ja'] }).xrefs).toEqual([]);
  });

  it('resolves a bare-kana target through the headword whose reading it is', () => {
    importWiktextract(db, lines(MIKKOKUSHA, TSUUHOUSHA), { dictId: 'kana', title: 'Kana' });
    const result = findLexiconXrefs(db, { text: '通報者', sourceLangs: ['ja'] });
    // `みっこくしゃ` is nobody's `norm`; without the reading probe this rendered as
    // "not in your dictionaries" while `lookup` navigated to it perfectly well.
    expect(result.xrefs).toMatchObject([{ kind: 'see', text: 'みっこくしゃ', resolved: true }]);
  });

  it('still marks a kana target no dictionary carries as unavailable', () => {
    importWiktextract(db, lines(TSUUHOUSHA), { dictId: 'kana', title: 'Kana' });
    const result = findLexiconXrefs(db, { text: '通報者', sourceLangs: ['ja'] });
    expect(result.xrefs).toMatchObject([{ text: 'みっこくしゃ', resolved: false }]);
  });

  it('does not resolve a reading that belongs to another language’s partition', () => {
    importWiktextract(db, lines(MIKKOKUSHA, TSUUHOUSHA), { dictId: 'kana', title: 'Kana' });
    db.prepare('update headwords set lang = ? where text = ?').run('zh', '密告者');
    const result = findLexiconXrefs(db, { text: '通報者', sourceLangs: ['ja'] });
    expect(result.xrefs).toMatchObject([{ text: 'みっこくしゃ', resolved: false }]);
  });

  it('excludes a disabled dictionary from the reading probe as well', () => {
    importWiktextract(db, lines(MIKKOKUSHA), { dictId: 'kana', title: 'Kana' });
    importWiktextract(db, lines(TSUUHOUSHA), { dictId: 'src', title: 'Src' });
    db.prepare('update dictionaries set enabled = 0 where id = ?').run('kana');
    const result = findLexiconXrefs(db, { text: '通報者', sourceLangs: ['ja'] });
    expect(result.xrefs).toMatchObject([{ text: 'みっこくしゃ', resolved: false }]);
  });
});
