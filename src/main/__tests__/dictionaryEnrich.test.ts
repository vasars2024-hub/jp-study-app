// @vitest-environment node
//
// The claim under test: the Deck Workbench's enrichment reads the *installed*
// dictionaries, attributes what it read, and says nothing about a word nothing
// answered for.
//
// Against the real better-sqlite3 the app ships, like the rest of the dictionary
// database tests. A stub would answer whatever it was told to, and it would have
// hidden what this found: the database *merges* two dictionaries that agree on
// headword and reading into one entry, so the provenance gate 11 has to prove
// lives in that entry's ordered `sources` list — which the legacy adapter drops.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { closeDictionaryDb, openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { MAX_ENRICH_ENTRIES_PER_TERM, enrichTermsBatch } from '../dictionary/enrichService';

let db: SqliteDb;

function seedDict(id: string, title: string, priority = 0): void {
  db.prepare(`
    insert into dictionaries (id, title, source_lang, target_langs, enabled, priority)
    values (?, ?, 'ja', 'en', 1, ?)
  `).run(id, title, priority);
}

function seedEntry(
  dictId: string,
  text: string,
  gloss: string,
  opts: { pos?: string; reading?: string } = {},
): void {
  const hw = db
    .prepare('insert into headwords (dict_id, lang, text, norm, reading) values (?, ?, ?, ?, ?)')
    .run(dictId, 'ja', text, text, opts.reading ?? '');
  const headwordId = Number(hw.lastInsertRowid);
  const sense = db
    .prepare('insert into senses (headword_id, ord, pos) values (?, 0, ?)')
    .run(headwordId, opts.pos ?? '');
  db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, 0)')
    .run(Number(sense.lastInsertRowid), 'en', gloss);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictenrich-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('enrichTermsBatch', () => {
  it('returns nothing at all for a word no installed dictionary holds', async () => {
    seedDict('d1', 'JMdict (EN)');
    seedEntry('d1', '猫', 'cat');
    const out = await enrichTermsBatch(['猫', '麒麟'], { legacyFallback: false });
    expect(Object.keys(out)).toEqual(['猫']);
    // Not an empty array: absent is the answer the tray reports as "no entry".
    expect(out['麒麟']).toBeUndefined();
  });

  it('attributes each entry to the dictionary that produced it', async () => {
    seedDict('d1', 'JMdict (EN)', 0);
    seedDict('d2', 'Wiktionary', 1);
    seedEntry('d1', '猫', 'cat', { reading: 'ねこ', pos: 'noun' });
    seedEntry('d2', '猫', 'domestic cat', { reading: 'ねこ' });
    const out = await enrichTermsBatch(['猫'], { legacyFallback: false });
    // The database MERGES two dictionaries that agree on headword and reading
    // into one entry, so what has to survive is the source *list*, not two
    // entries. Reading it through `lookupResultToDictResult` would have kept the
    // primary title alone and silently under-credited the merge.
    const [entry] = out['猫'] ?? [];
    expect(entry?.source).toBe('JMdict (EN)');
    expect(entry?.sources).toEqual(['JMdict (EN)', 'Wiktionary']);
    expect(entry?.reading).toBe('ねこ');
    const definitions = entry?.senses.flatMap((s) => [...s.definitions]) ?? [];
    expect(definitions).toContain('cat');
    expect(definitions).toContain('domestic cat');
  });

  it('asks once for a word the selection repeats', async () => {
    seedDict('d1', 'JMdict (EN)');
    seedEntry('d1', '猫', 'cat');
    const out = await enrichTermsBatch(['猫', '猫', ' 猫 '], { legacyFallback: false });
    expect(Object.keys(out)).toEqual(['猫']);
  });

  it('bounds how many entries one word contributes', async () => {
    seedDict('d1', 'JMdict (EN)');
    for (let i = 0; i < MAX_ENRICH_ENTRIES_PER_TERM + 3; i += 1) {
      seedEntry('d1', '猫', `sense ${i}`);
    }
    const out = await enrichTermsBatch(['猫'], { legacyFallback: false });
    expect((out['猫'] ?? []).length).toBeLessThanOrEqual(MAX_ENRICH_ENTRIES_PER_TERM);
  });

  it('answers an empty request without touching the store', async () => {
    expect(await enrichTermsBatch([], { legacyFallback: false })).toEqual({});
    expect(await enrichTermsBatch(['   '], { legacyFallback: false })).toEqual({});
  });
});
