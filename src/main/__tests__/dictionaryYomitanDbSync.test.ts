// @vitest-environment node
//
// Dictionary settings must reach the database lookups actually read.
//
// Lookups ask the unified SQLite database first (dictionary.ts `lookupTerm`) and
// fall back to the Yomitan JSON stores only when it has nothing. The settings
// list's enable / reorder / remove wrote ONLY the JSON registry, so a disabled
// dictionary kept answering; a new import reached the database only at the next
// launch; and kanji banks were never imported at all.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: {},
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
}));

import { closeDictionaryDb, dictionaryDb } from '../dictionary/db';
import {
  importLegacyIndex,
  legacyKindOf,
  migrateLegacyYomitanStores,
  type LegacyDictIndex,
} from '../dictionary/migrate';
import { listDictionarySources, syncDictionarySourceOrder } from '../dictionary/service';
import {
  moveYomitanDict,
  parseKanjiBank,
  removeYomitanDict,
  setYomitanEnabled,
} from '../dictionary/yomitan';

function termStore(id: string, priority: number): LegacyDictIndex {
  return {
    version: 1,
    info: {
      id,
      title: id,
      revision: '1',
      priority,
      hasTerms: true,
      hasPitch: false,
      hasFreq: false,
      importedAt: 1,
      glossLangs: ['en'],
      enabled: true,
    },
    terms: {
      猫: [{ word: '猫', reading: 'ねこ', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: [`cat (${id})`], tags: [] }] }],
    },
  };
}

function writeStore(index: LegacyDictIndex): void {
  const dir = path.join(tempRoot, 'yomitan', index.info.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
}

function writeRegistry(ids: string[]): void {
  fs.mkdirSync(path.join(tempRoot, 'yomitan'), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, 'yomitan', 'registry.json'),
    JSON.stringify({ dicts: ids.map((id, priority) => termStore(id, priority).info) }),
  );
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yomi-db-'));
});

afterEach(() => {
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('settings changes reach the database', () => {
  beforeEach(() => {
    const db = dictionaryDb();
    for (const [i, id] of ['alpha', 'beta'].entries()) {
      writeStore(termStore(id, i));
      importLegacyIndex(db, termStore(id, i));
    }
    // A non-Yomitan source between them, which the Yomitan list never shows.
    db.prepare('insert into dictionaries (id, title, source_lang, priority) values (?, ?, ?, ?)')
      .run('cedict', 'CC-CEDICT', 'zh', 5);
    writeRegistry(['alpha', 'beta']);
  });

  const enabledOf = (id: string) =>
    (dictionaryDb().prepare('select enabled from dictionaries where id = ?').get(id) as { enabled: number } | undefined)?.enabled;

  it('disables and re-enables the database row', () => {
    expect(setYomitanEnabled('beta', false).ok).toBe(true);
    expect(enabledOf('beta')).toBe(0);
    setYomitanEnabled('beta', true);
    expect(enabledOf('beta')).toBe(1);
  });

  it('reorders the database to the settings order and leaves other sources in place', () => {
    const before = listDictionarySources().map((s) => s.id);
    expect(moveYomitanDict('beta', -1).ok).toBe(true);
    const after = listDictionarySources().map((s) => s.id);
    expect(after.indexOf('beta')).toBeLessThan(after.indexOf('alpha'));
    expect(after.indexOf('cedict')).toBe(before.indexOf('cedict'));
  });

  it('removes the database source with the store', () => {
    expect(removeYomitanDict('alpha').ok).toBe(true);
    expect(listDictionarySources().some((s) => s.id === 'alpha')).toBe(false);
  });

  it('keeps every non-listed source in its slot', () => {
    const result = syncDictionarySourceOrder(['beta', 'alpha', 'not-imported']);
    expect(result.ok).toBe(true);
    const ids = listDictionarySources().map((s) => s.id);
    expect(ids.filter((id) => id !== 'cedict')).toEqual(['beta', 'alpha']);
  });
});

describe('a new store is imported on its own', () => {
  it('imports only the named store', () => {
    writeStore(termStore('old', 0));
    writeStore(termStore('new', 1));
    const result = migrateLegacyYomitanStores(dictionaryDb(), path.join(tempRoot, 'yomitan'), undefined, undefined, new Set(['new']));
    expect(result.imported.map((c) => c.dictId)).toEqual(['new']);
    expect(listDictionarySources().map((s) => s.id)).toEqual(['new']);
  });
});

describe('Yomitan kanji dictionaries', () => {
  it('parses kanji_bank rows', () => {
    const out: { kanji?: Record<string, unknown>; info: { hasKanji?: boolean } } = { info: {} };
    parseKanjiBank([
      ['猫', 'ビョウ', 'ねこ', 'jouyou', ['cat'], { strokes: '11', grade: '8', jlpt: '2', freq: '1702' }],
      ['bad'],
    ], out);
    expect(out.info.hasKanji).toBe(true);
    expect(out.kanji).toEqual({
      猫: { onyomi: ['ビョウ'], kunyomi: ['ねこ'], meanings: ['cat'], strokes: 11, grade: 8, jlpt: 'N2', freq: 1702 },
    });
  });

  it('writes the characters to the character table and the lookup projection', () => {
    const db = dictionaryDb();
    const index: LegacyDictIndex = {
      version: 1,
      info: { id: 'kanjidict', title: 'Kanji', revision: '1', priority: 0, hasTerms: false, hasPitch: false, hasFreq: false, hasKanji: true, importedAt: 1 },
      kanji: { 猫: { onyomi: ['ビョウ'], kunyomi: ['ねこ'], meanings: ['cat'], strokes: 11, jlpt: 'N2' } },
    };
    expect(legacyKindOf(index.info)).toBe('character');
    const counts = importLegacyIndex(db, index);
    expect(counts.kanji).toBe(1);
    const row = db.prepare("select readings, meanings, strokes, jlpt, primary_source_id from chars where lang = 'ja' and char = '猫'").get() as Record<string, unknown>;
    expect(JSON.parse(String(row.readings))).toEqual(['ビョウ', 'ねこ']);
    expect(JSON.parse(String(row.meanings))).toEqual(['cat']);
    expect(row).toMatchObject({ strokes: 11, jlpt: 'N2', primary_source_id: 'kanjidict' });
    const source = db.prepare("select kind, entry_count from dictionaries where id = 'kanjidict'").get();
    expect(source).toEqual({ kind: 'character', entry_count: 1 });

    // Re-import without the character: the projection must not keep it.
    importLegacyIndex(db, { ...index, kanji: {} });
    expect(db.prepare("select 1 from chars where char = '猫'").get()).toBeUndefined();
  });
});
