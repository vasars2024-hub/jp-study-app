// @vitest-environment node
//
// IPA dictionaries (Yomitan term_meta mode `ipa`) used to import as nothing:
// the parser knew only `pitch` and `freq`, an IPA-only archive was refused as
// having "no usable banks", and the database had nowhere to put the rows.
//
// Covered end to end: the zip import keeps the rows, the legacy-store
// migration writes them to the `ipa` table added by schema step 13, the unified
// lookup returns them on the entry, and the adapter carries them to the popup's
// DictEntry. Step 13 itself is exercised on an old-schema (v12) file with data
// in it, which must come through untouched and without a re-import.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
vi.mock('../dictionary/service', () => ({ initDictionaryService: () => undefined }));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { DICT_SCHEMA_VERSION, MIGRATIONS } from '../dictionary/schema';
import { importLegacyIndex, legacyKindOf, type LegacyDictIndex } from '../dictionary/migrate';
import { lookup } from '../dictionary/dictService';
import { enrichLexiconResultMetadata, lookupResultToDictResult } from '../dictionary/lexiconAdapter';
import { getIpa, importYomitanZip, parseTermMetaBank } from '../dictionary/yomitan';

const SEP = '\u0001';

function termStore(): LegacyDictIndex {
  return {
    version: 1,
    info: {
      id: 'terms', title: 'Terms', revision: '1', priority: 0,
      hasTerms: true, hasPitch: false, hasFreq: false, importedAt: 1, glossLangs: ['en'], enabled: true,
    },
    terms: {
      猫: [{ word: '猫', reading: 'ねこ', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }] }],
      犬: [{ word: '犬', reading: 'いぬ', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: ['dog'], tags: [] }] }],
      日本: [
        { word: '日本', reading: 'にほん', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: ['Japan'], tags: [] }] },
        { word: '日本', reading: 'にっぽん', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: ['Japan (formal)'], tags: [] }] },
      ],
    },
  };
}

function ipaStore(id = 'ipa-dict', priority = 1): LegacyDictIndex {
  return {
    version: 1,
    info: {
      id, title: 'IPA Fixture', revision: '1', priority,
      hasTerms: false, hasPitch: false, hasFreq: false, hasIpa: true, importedAt: 2, enabled: true,
    },
    ipa: {
      [`猫${SEP}ねこ`]: { reading: 'ねこ', transcriptions: ['[ne̞ko̞]'] },
      [`日本${SEP}にほん`]: { reading: 'にほん', transcriptions: ['[ɲ̟iho̞ɴ]'] },
      [`日本${SEP}にっぽん`]: { reading: 'にっぽん', transcriptions: ['[ɲ̟ippo̞ɴ]'] },
    },
  };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa-ipa-'));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('parsing Yomitan ipa term_meta rows', () => {
  it('keeps every transcription, in order, without duplicates', () => {
    const out: Parameters<typeof parseTermMetaBank>[1] = { info: { hasPitch: false, hasFreq: false } };
    parseTermMetaBank([
      ['猫', 'ipa', { reading: 'ねこ', transcriptions: [{ ipa: '[ne̞ko̞]', tags: ['東京'] }, { ipa: '[neko]' }] }],
      ['猫', 'ipa', { reading: 'ねこ', transcriptions: [{ ipa: '[neko]' }, { ipa: '[nekɔ]' }] }],
      ['空', 'ipa', { reading: 'そら', transcriptions: [] }],
      ['bad', 'ipa', 'not an object'],
    ], out);
    expect(out.info.hasIpa).toBe(true);
    expect(out.ipa).toEqual({ [`猫${SEP}ねこ`]: { reading: 'ねこ', transcriptions: ['[ne̞ko̞]', '[neko]', '[nekɔ]'] } });
  });

  it('does not mark a store as IPA when no row carried a transcription', () => {
    const out: Parameters<typeof parseTermMetaBank>[1] = { info: { hasPitch: false, hasFreq: false } };
    parseTermMetaBank([['空', 'ipa', { reading: 'そら', transcriptions: [{ ipa: '  ' }] }]], out);
    expect(out.info.hasIpa).toBeUndefined();
    expect(out.ipa).toBeUndefined();
  });

  it('imports an IPA-only archive instead of refusing it, and answers lookups', async () => {
    const zipPath = path.join(tempRoot, 'ipa.zip');
    const zip = new AdmZip();
    zip.addFile('index.json', Buffer.from(JSON.stringify({ title: 'IPA Zip', revision: 'r1', format: 3 })));
    zip.addFile('term_meta_bank_1.json', Buffer.from(JSON.stringify([
      ['猫', 'ipa', { reading: 'ねこ', transcriptions: [{ ipa: '[ne̞ko̞]', tags: [] }] }],
    ])));
    zip.writeZip(zipPath);

    const res = await importYomitanZip(zipPath);
    expect(res.ok).toBe(true);
    expect(getIpa('猫', 'ねこ')).toEqual(['[ne̞ko̞]']);
    expect(getIpa('犬', 'いぬ')).toEqual([]);
  });
});

describe('IPA in the database and the unified lookup', () => {
  let db: SqliteDb;
  beforeEach(() => {
    db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
    importLegacyIndex(db, termStore());
  });
  afterEach(() => db.close());

  const ipaRowCount = () => (db.prepare('select count(*) as c from ipa').get() as { c: number }).c;

  it('writes IPA rows keyed like pitch, as an ipa-kind source', () => {
    const counts = importLegacyIndex(db, ipaStore());
    expect(counts.ipa).toBe(3);
    expect(legacyKindOf(ipaStore().info)).toBe('ipa');
    const row = db.prepare('select kind, entry_count from dictionaries where id = ?').get('ipa-dict');
    expect(row).toEqual({ kind: 'ipa', entry_count: 3 });
    expect(db.prepare('select lang, norm, reading, transcriptions from ipa where norm = ?').get('猫')).toEqual({
      lang: 'ja', norm: '猫', reading: 'ねこ', transcriptions: '["[ne̞ko̞]"]',
    });
  });

  it('re-importing replaces the rows rather than doubling them, and removal takes them away', () => {
    importLegacyIndex(db, ipaStore());
    importLegacyIndex(db, ipaStore());
    expect(ipaRowCount()).toBe(3);
    db.pragma('foreign_keys = ON');
    db.prepare('delete from dictionaries where id = ?').run('ipa-dict');
    expect(ipaRowCount()).toBe(0);
  });

  it('returns IPA on the matching entry, per reading, and nothing where there is none', () => {
    importLegacyIndex(db, ipaStore());
    const cat = lookup(db, { text: '猫', sourceLangs: ['ja'] }).entries.find((e) => e.text === '猫');
    expect(cat?.ipa).toEqual(['[ne̞ko̞]']);

    const japan = lookup(db, { text: '日本', sourceLangs: ['ja'] }).entries.filter((e) => e.text === '日本');
    expect(Object.fromEntries(japan.map((e) => [e.reading, e.ipa]))).toEqual({
      にほん: ['[ɲ̟iho̞ɴ]'],
      にっぽん: ['[ɲ̟ippo̞ɴ]'],
    });

    const dog = lookup(db, { text: '犬', sourceLangs: ['ja'] }).entries.find((e) => e.text === '犬');
    expect(dog).toBeDefined();
    expect(dog && 'ipa' in dog).toBe(false);
  });

  it('ignores a disabled IPA source', () => {
    importLegacyIndex(db, ipaStore());
    db.prepare('update dictionaries set enabled = 0 where id = ?').run('ipa-dict');
    const cat = lookup(db, { text: '猫', sourceLangs: ['ja'] }).entries.find((e) => e.text === '猫');
    expect(cat?.ipa).toBeUndefined();
  });

  it('carries IPA to the popup entry, and falls back to the legacy store only when the row has none', () => {
    importLegacyIndex(db, ipaStore());
    const converted = lookupResultToDictResult(lookup(db, { text: '猫', sourceLangs: ['ja'] }));
    const cat = converted.entries.find((e) => e.word === '猫');
    expect(cat?.ipa).toEqual(['[ne̞ko̞]']);

    const enriched = enrichLexiconResultMetadata(converted, {
      pitchHtml: () => '',
      frequency: () => undefined,
      ipa: (word) => (word === '猫' ? ['[legacy]'] : []),
    });
    expect(enriched.entries.find((e) => e.word === '猫')?.ipa).toEqual(['[ne̞ko̞]']);

    const dogResult = lookupResultToDictResult(lookup(db, { text: '犬', sourceLangs: ['ja'] }));
    expect(dogResult.entries[0].ipa).toBeUndefined();
    const dogEnriched = enrichLexiconResultMetadata(dogResult, {
      pitchHtml: () => '',
      frequency: () => undefined,
      ipa: (word) => (word === '犬' ? ['[inɯ]'] : []),
    });
    expect(dogEnriched.entries[0].ipa).toEqual(['[inɯ]']);
  });
});

describe('schema step 13 on an existing database', () => {
  /** A v12 file with real rows in it, built the way an installed copy was. */
  function buildV12(dir: string): { headwordIds: number[]; pitchRows: number } {
    const old = openDictionaryDb({ dir, skipMigrations: true });
    try {
      for (const step of MIGRATIONS) {
        if (step.version > 12) break;
        step.up(old);
      }
      old.pragma('user_version = 12');
      importLegacyIndex(old, termStore());
      old.prepare('insert into dictionaries (id, title, source_lang, kind, imported_at) values (?, ?, ?, ?, ?)')
        .run('pitch-dict', 'Pitch', 'ja', 'pitch', 42);
      old.prepare('insert into pitch (dict_id, lang, norm, reading, positions) values (?, ?, ?, ?, ?)')
        .run('pitch-dict', 'ja', '猫', 'ねこ', '1');
      expect(old.prepare("select name from sqlite_master where name = 'ipa'").get()).toBeUndefined();
      const headwordIds = (old.prepare('select id from headwords order by id').all() as { id: number }[]).map((r) => r.id);
      return { headwordIds, pitchRows: 1 };
    } finally {
      old.close();
    }
  }

  it('adds the ipa table and leaves every existing row exactly where it was', () => {
    const dir = path.join(tempRoot, 'v12');
    const before = buildV12(dir);

    const db = openDictionaryDb({ dir });
    try {
      expect(Number(db.pragma('user_version', { simple: true }))).toBe(DICT_SCHEMA_VERSION);
      const columns = (db.pragma('table_info(ipa)') as { name: string; pk: number }[]);
      expect(columns.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(['dict_id', 'lang', 'norm', 'reading']);
      // No re-import: same headword ids, same import stamps, pitch untouched.
      expect((db.prepare('select id from headwords order by id').all() as { id: number }[]).map((r) => r.id))
        .toEqual(before.headwordIds);
      expect(db.prepare('select id, imported_at from dictionaries order by id').all()).toEqual([
        { id: 'pitch-dict', imported_at: 42 },
        { id: 'terms', imported_at: 1 },
      ]);
      expect((db.prepare('select count(*) as c from pitch').get() as { c: number }).c).toBe(before.pitchRows);
      expect((db.prepare('select count(*) as c from ipa').get() as { c: number }).c).toBe(0);
      // The lookup works on the migrated file and simply has no IPA yet.
      const cat = lookup(db, { text: '猫', sourceLangs: ['ja'] }).entries.find((e) => e.text === '猫');
      expect(cat?.senses.length).toBeGreaterThan(0);
      expect(cat?.ipa).toBeUndefined();
      // And the next IPA import lands in it.
      importLegacyIndex(db, ipaStore());
      expect(lookup(db, { text: '猫', sourceLangs: ['ja'] }).entries.find((e) => e.text === '猫')?.ipa).toEqual(['[ne̞ko̞]']);
    } finally {
      db.close();
    }
  });

  it('survives being applied twice without losing IPA rows', () => {
    const dir = path.join(tempRoot, 'twice');
    const db = openDictionaryDb({ dir });
    importLegacyIndex(db, termStore());
    importLegacyIndex(db, ipaStore());
    db.pragma('user_version = 12');
    db.close();

    const reopened = openDictionaryDb({ dir });
    try {
      expect(Number(reopened.pragma('user_version', { simple: true }))).toBe(DICT_SCHEMA_VERSION);
      expect((reopened.prepare('select count(*) as c from ipa').get() as { c: number }).c).toBe(3);
    } finally {
      reopened.close();
    }
  });

  it('a readonly handle on an unmigrated file still answers lookups, without IPA', () => {
    const dir = path.join(tempRoot, 'ro');
    buildV12(dir);
    const ro = openDictionaryDb({ dir, readonly: true });
    try {
      const cat = lookup(ro, { text: '猫', sourceLangs: ['ja'] }).entries.find((e) => e.text === '猫');
      expect(cat?.senses.length).toBeGreaterThan(0);
      expect(cat?.ipa).toBeUndefined();
    } finally {
      ro.close();
    }
  });
});
