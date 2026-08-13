// @vitest-environment node
//
// The migration-parity test the source plan calls for, written before the migration
// ships rather than after. Its shape is deliberate: a fixture in the exact legacy
// `index.json` format goes in, and the assertion is that reading it back out of the
// database produces **the same objects**. A test that instead described what the
// migration happens to write would agree with any bug the migration contains.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  LEGACY_KEY_SEP,
  glossLangOf,
  importLegacyIndex,
  migrateLegacyYomitanStores,
  readMigratedEntries,
  type LegacyDictIndex,
  type LegacyGlossaryEntry,
} from '../dictionary/migrate';

let db: SqliteDb;

function entry(word: string, reading: string, definitions: string[], extra: Partial<LegacyGlossaryEntry> = {}) {
  return {
    word,
    reading,
    score: 0,
    senses: [{ partsOfSpeech: ['v1'], definitions, tags: ['common'] }],
    ...extra,
  } as LegacyGlossaryEntry;
}

function fixture(overrides: Partial<LegacyDictIndex> = {}): LegacyDictIndex {
  return {
    version: 1,
    info: {
      id: 'jmdict-en',
      title: 'JMdict (English)',
      revision: '2026-01-01',
      priority: 0,
      hasTerms: true,
      hasPitch: false,
      hasFreq: false,
      importedAt: 1_700_000_000_000,
      glossLangs: ['en'],
    },
    terms: {
      食べる: [entry('食べる', 'たべる', ['to eat', 'to live on'])],
      たべる: [entry('食べる', 'たべる', ['to eat', 'to live on'])],
      走る: [entry('走る', 'はしる', ['to run'])],
    },
    ...overrides,
  };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictmig-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('migration parity — every term the old Map could answer, the database answers', () => {
  it('returns each entry unchanged, term for term', () => {
    const index = fixture();
    importLegacyIndex(db, index);

    for (const [norm, expected] of Object.entries(index.terms ?? {})) {
      expect(readMigratedEntries(db, 'jmdict-en', norm)).toEqual(expected);
    }
  });

  it('preserves multiple entries under one term, in order', () => {
    const index = fixture({
      terms: {
        はし: [
          entry('橋', 'はし', ['bridge']),
          entry('箸', 'はし', ['chopsticks']),
          entry('端', 'はし', ['edge', 'tip']),
        ],
      },
    });
    importLegacyIndex(db, index);
    const back = readMigratedEntries(db, 'jmdict-en', 'はし');
    expect(back.map((row) => row.word)).toEqual(['橋', '箸', '端']);
    expect(back).toEqual(index.terms?.はし);
  });

  it('preserves sense order and multi-sense definitions', () => {
    const multi: LegacyGlossaryEntry = {
      word: '掛ける',
      reading: 'かける',
      score: 3,
      senses: [
        { partsOfSpeech: ['v1', 'vt'], definitions: ['to hang'], tags: [] },
        { partsOfSpeech: ['v1'], definitions: ['to spend (money)', 'to expend'], tags: ['uk'] },
        { partsOfSpeech: [], definitions: ['to multiply'], tags: [] },
      ],
    };
    importLegacyIndex(db, fixture({ terms: { 掛ける: [multi] } }));
    expect(readMigratedEntries(db, 'jmdict-en', '掛ける')).toEqual([multi]);
  });

  it('keeps the structured glossary HTML', () => {
    const withHtml = entry('食べる', 'たべる', ['to eat'], { glossaryHtml: '<div class="y">to eat</div>' });
    importLegacyIndex(db, fixture({ terms: { 食べる: [withHtml] } }));
    expect(readMigratedEntries(db, 'jmdict-en', '食べる')).toEqual([withHtml]);
  });

  it('counts what it wrote', () => {
    const counts = importLegacyIndex(db, fixture());
    expect(counts).toMatchObject({ dictId: 'jmdict-en', headwords: 3, senses: 3, glosses: 5 });
    expect(db.prepare('select entry_count c from dictionaries where id = ?').get('jmdict-en')).toEqual({ c: 3 });
  });

  it('restores provenance only for app-provisioned legacy source ids', () => {
    importLegacyIndex(db, fixture({ info: { ...fixture().info, id: 'bundled-jmdict-en' } }));
    importLegacyIndex(db, fixture({ info: { ...fixture().info, id: 'user-jmdict-copy' } }));

    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('bundled-jmdict-en')).toEqual({
      licence: 'CC BY-SA 4.0',
      attribution: expect.stringContaining('Electronic Dictionary Research and Development Group'),
    });
    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('user-jmdict-copy')).toEqual({
      licence: null,
      attribution: null,
    });
  });

  it('records the distinct bundled Moedict and Kanjium obligations', () => {
    importLegacyIndex(db, fixture({ info: { ...fixture().info, id: 'bundled-moedict-zh' } }));
    importLegacyIndex(db, fixture({
      info: { ...fixture().info, id: 'bundled-kanjium-pitch', hasTerms: false, hasPitch: true },
      terms: {},
    }));

    expect(db.prepare('select licence from dictionaries where id = ?').get('bundled-moedict-zh')).toEqual({
      licence: 'CC BY-ND 3.0 TW',
    });
    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('bundled-kanjium-pitch')).toEqual({
      licence: 'CC BY-SA 4.0',
      attribution: expect.stringContaining('Uros O.'),
    });
  });

  it('makes migrated terms searchable through FTS, which the JSON store never was', () => {
    importLegacyIndex(db, fixture());
    const hits = db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる');
    expect(hits.length).toBeGreaterThan(0);
    // And the reverse direction, which is the whole point of the rebuild: the old
    // store could not answer "which Japanese word means 'to run'" at all.
    const reverse = db
      .prepare(`
        select h.text as text from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        where glosses_fts match ?
      `)
      .all('run') as { text: string }[];
    expect(reverse.map((row) => row.text)).toContain('走る');
  });
});

describe('re-import safety', () => {
  it('replaces the previous import instead of doubling it', () => {
    importLegacyIndex(db, fixture());
    importLegacyIndex(db, fixture());
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 3 });
    expect(db.prepare('select count(*) c from dictionaries').get()).toEqual({ c: 1 });
    // The FTS index must have been retracted and rebuilt with it — a stale index
    // here would still match the first import's rowids.
    expect(db.prepare('select count(*) c from headwords_fts').get()).toEqual({ c: 3 });
  });

  it('a re-import with fewer terms leaves nothing behind', () => {
    importLegacyIndex(db, fixture());
    importLegacyIndex(db, fixture({ terms: { 走る: [entry('走る', 'はしる', ['to run'])] } }));
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 1 });
    expect(readMigratedEntries(db, 'jmdict-en', '食べる')).toEqual([]);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる')).toHaveLength(0);
  });

  it('does not disturb another dictionary', () => {
    importLegacyIndex(db, fixture());
    importLegacyIndex(db, fixture({ info: { ...fixture().info, id: 'moedict', title: 'Moedict' } }));
    importLegacyIndex(db, fixture());
    expect(db.prepare('select count(*) c from dictionaries').get()).toEqual({ c: 2 });
    expect(readMigratedEntries(db, 'moedict', '走る')).toHaveLength(1);
  });
});

describe('pitch and frequency — the parts §3.1 had nowhere to put', () => {
  it('migrates pitch positions, splitting the legacy composite key', () => {
    importLegacyIndex(
      db,
      fixture({
        info: { ...fixture().info, id: 'kanjium', hasTerms: false, hasPitch: true },
        terms: {},
        pitch: {
          [`橋${LEGACY_KEY_SEP}はし`]: { reading: 'はし', positions: [2] },
          [`箸${LEGACY_KEY_SEP}はし`]: { reading: 'はし', positions: [1] },
          [`端${LEGACY_KEY_SEP}はし`]: { reading: 'はし', positions: [0] },
        },
      }),
    );
    const rows = db.prepare('select norm, reading, positions from pitch order by norm').all() as {
      norm: string; reading: string; positions: string;
    }[];
    // The term half of the key, not the first character of it: a naive split would
    // give three rows all keyed on one character.
    expect(rows.map((row) => row.norm).sort()).toEqual(['橋', '端', '箸'].sort());
    expect(rows.find((row) => row.norm === '箸')?.positions).toBe('1');
    expect(rows.find((row) => row.norm === '端')?.positions).toBe('0');
  });

  it('migrates frequency ranks under the dictionary that supplied them', () => {
    importLegacyIndex(
      db,
      fixture({
        info: { ...fixture().info, id: 'freq-narou', hasTerms: false, hasFreq: true },
        terms: {},
        freq: { [`食べる${LEGACY_KEY_SEP}たべる`]: 42, [`走る${LEGACY_KEY_SEP}はしる`]: 517 },
      }),
    );
    const rows = db.prepare('select norm, corpus, rank from freq_corpora order by rank').all();
    expect(rows).toEqual([
      { norm: '食べる', corpus: 'freq-narou', rank: 42 },
      { norm: '走る', corpus: 'freq-narou', rank: 517 },
    ]);
  });

  it('classifies a pitch-only store as kind=pitch rather than term', () => {
    importLegacyIndex(db, fixture({ info: { ...fixture().info, id: 'k', hasTerms: false, hasPitch: true }, terms: {} }));
    expect(db.prepare('select kind from dictionaries where id = ?').get('k')).toEqual({ kind: 'pitch' });
  });
});

describe('gloss language', () => {
  it('prefers the manual override over detection', () => {
    expect(glossLangOf({ ...fixture().info, glossLangs: ['en'], glossLangOverride: 'ru' })).toBe('ru');
  });

  it('falls back to English when nothing is known', () => {
    expect(glossLangOf({ ...fixture().info, glossLangs: undefined })).toBe('en');
  });

  it('writes glosses under the dictionary language, so a RU dict is queryable as RU', () => {
    importLegacyIndex(
      db,
      fixture({
        info: { ...fixture().info, id: 'jmdict-ru', glossLangs: ['ru'] },
        terms: { 食べる: [entry('食べる', 'たべる', ['есть', 'кушать'])] },
      }),
    );
    const langs = db.prepare('select distinct lang from glosses').all();
    expect(langs).toEqual([{ lang: 'ru' }]);
  });
});

describe('scanning userData/yomitan', () => {
  function writeStore(dir: string, index: unknown): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index), 'utf8');
  }

  it('migrates every store it finds and reports progress', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'jmdict-en'), fixture());
    writeStore(path.join(root, 'moedict'), fixture({ info: { ...fixture().info, id: 'moedict', title: 'Moedict' } }));

    const seen: string[] = [];
    const result = migrateLegacyYomitanStores(db, root, (progress) => {
      seen.push(`${progress.current}/${progress.total} ${progress.dictId}`);
    });

    expect(result.imported.map((row) => row.dictId).sort()).toEqual(['jmdict-en', 'moedict']);
    expect(result.skipped).toEqual([]);
    expect(seen).toEqual(['1/2 jmdict-en', '2/2 moedict']);
    expect(db.prepare('select count(*) c from dictionaries').get()).toEqual({ c: 2 });
  });

  it('records the file size it read', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'jmdict-en'), fixture());
    migrateLegacyYomitanStores(db, root);
    const row = db.prepare('select bytes from dictionaries where id = ?').get('jmdict-en') as { bytes: number };
    expect(row.bytes).toBeGreaterThan(0);
  });

  it('skips a corrupt store without losing the healthy ones', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'good'), fixture());
    fs.mkdirSync(path.join(root, 'broken'), { recursive: true });
    fs.writeFileSync(path.join(root, 'broken', 'index.json'), '{ not json', 'utf8');
    fs.mkdirSync(path.join(root, 'empty'), { recursive: true });

    const result = migrateLegacyYomitanStores(db, root);

    expect(result.imported.map((row) => row.dictId)).toEqual(['jmdict-en']);
    expect(result.skipped.map((row) => row.dictId).sort()).toEqual(['broken', 'empty']);
    expect(result.skipped.find((row) => row.dictId === 'empty')?.reason).toBe('no index.json');
    expect(result.skipped.find((row) => row.dictId === 'broken')?.reason).toMatch(/unreadable index\.json/);
  });

  it('is a no-op when the legacy directory does not exist', () => {
    const result = migrateLegacyYomitanStores(db, path.join(tempRoot, 'nothing-here'));
    expect(result).toEqual({ imported: [], skipped: [] });
  });

  it('leaves the source JSON on disk — the migration is additive', () => {
    const root = path.join(tempRoot, 'yomitan');
    const file = path.join(root, 'jmdict-en', 'index.json');
    writeStore(path.join(root, 'jmdict-en'), fixture());
    migrateLegacyYomitanStores(db, root);
    expect(fs.existsSync(file)).toBe(true);
  });

  // Cancellation exists so a user can stop a migration that takes minutes. It is
  // per store, not per row: each store is its own transaction, so the honest
  // stopping point is a whole-dictionary boundary and the stores already written
  // stay written. `imported` has to say which, or the next run looks idle.
  it('stops at the next store boundary when asked, and reports what did land', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'a-first'), fixture({ info: { ...fixture().info, id: 'a-first', title: 'First' } }));
    writeStore(path.join(root, 'b-second'), fixture({ info: { ...fixture().info, id: 'b-second', title: 'Second' } }));

    let polls = 0;
    const result = migrateLegacyYomitanStores(db, root, undefined, () => (polls += 1) >= 5);

    expect(result.cancelled).toBe(true);
    expect(result.imported.map((row) => row.dictId)).toEqual(['a-first']);
    // The store that was never started must not appear as skipped-with-a-reason:
    // it was not broken, it simply was not reached.
    expect(result.skipped).toEqual([]);
    const rows = db.prepare('select id from dictionaries').all() as { id: string }[];
    expect(rows.map((row) => row.id)).toEqual(['a-first']);
  });

  it('rolls back the active store when cancellation arrives between its rows', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'large'), fixture({
      info: { ...fixture().info, id: 'large', title: 'Large' },
      terms: {
        一: [entry('一', 'いち', ['one'])],
        二: [entry('二', 'に', ['two'])],
      },
    }));

    let polls = 0;
    const result = migrateLegacyYomitanStores(db, root, undefined, () => (polls += 1) >= 3);

    expect(result).toEqual({ imported: [], skipped: [], cancelled: true });
    expect(db.prepare('select count(*) c from dictionaries where id = ?').get('large')).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
  });

  it('can cancel while replacing a large existing source and rolls every delete batch back', () => {
    const original = fixture({
      info: { ...fixture().info, id: 'large', title: 'Original' },
      terms: Object.fromEntries(
        Array.from({ length: 2_100 }, (_, index) => [
          `語${index}`,
          [entry(`語${index}`, `ご${index}`, [`meaning ${index}`])],
        ]),
      ),
    });
    importLegacyIndex(db, original);

    let polls = 0;
    expect(() => importLegacyIndex(
      db,
      fixture({ info: { ...fixture().info, id: 'large', title: 'Replacement' } }),
      () => (polls += 1) >= 3,
    )).toThrow();

    expect(polls).toBe(3);
    expect(db.prepare('select title, entry_count from dictionaries where id = ?').get('large')).toEqual({
      title: 'Original',
      entry_count: 2_100,
    });
    expect(db.prepare('select count(*) c from headwords where dict_id = ?').get('large')).toEqual({ c: 2_100 });
  });

  it('does not set cancelled when nothing asked it to stop', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(path.join(root, 'jmdict-en'), fixture());
    const result = migrateLegacyYomitanStores(db, root, undefined, () => false);
    expect(result.cancelled).toBeUndefined();
    expect(result.imported.map((row) => row.dictId)).toEqual(['jmdict-en']);
  });
});
