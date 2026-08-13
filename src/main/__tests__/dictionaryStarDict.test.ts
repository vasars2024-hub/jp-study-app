// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importStarDict, parseStarDictIfo } from '../dictionary/importers/stardict';
import { lookup } from '../dictionary/dictService';

let root = ''; let db: SqliteDb;
function fixture(name = 'fixture') {
  const base = path.join(root, name);
  const definitions = Buffer.from('cat\ndog', 'utf8');
  const record = (word: string, offset: number, size: number) => {
    const wordBytes = Buffer.from(word); const tail = Buffer.alloc(8);
    tail.writeUInt32BE(offset, 0); tail.writeUInt32BE(size, 4);
    return Buffer.concat([wordBytes, Buffer.from([0]), tail]);
  };
  fs.writeFileSync(`${base}.ifo`, "StarDict's dict ifo file\nversion=3.0.0\nbookname=Fixture StarDict\nwordcount=2\nsametypesequence=m\n");
  fs.writeFileSync(`${base}.idx`, Buffer.concat([record('猫', 0, 3), record('犬', 4, 3)]));
  fs.writeFileSync(`${base}.dict`, definitions);
  return `${base}.ifo`;
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'stardict-')); db = openDictionaryDb({ dir: path.join(root, 'db') }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe('StarDict importer', () => {
  it('validates the format contract', () => {
    expect(parseStarDictIfo("StarDict's dict ifo file\nversion=3.0.0\nwordcount=0\nsametypesequence=m\n").wordcount).toBe(0);
    expect(() => parseStarDictIfo("StarDict's dict ifo file\nversion=2.4.2\nwordcount=0\nsametypesequence=m\n")).toThrow(/3\.0\.0/);
  });
  it('imports sibling idx/dict files atomically', () => {
    expect(importStarDict(db, fixture(), { dictId: 'fixture' })).toEqual({ entries: 2, skipped: 0, headwords: 2, senses: 2, glosses: 2, cancelled: false });
    expect(db.prepare("select h.text, g.text definition from headwords h join senses s on s.headword_id=h.id join glosses g on g.sense_id=s.id order by h.id").all())
      .toEqual([{ text: '猫', definition: 'cat' }, { text: '犬', definition: 'dog' }]);
    expect(lookup(db, { text: '猫' }).entries[0]?.senses[0]?.glosses[0]?.text).toBe('cat');
  });
  it('rolls back on cancellation', () => {
    expect(importStarDict(db, fixture(), { shouldCancel: () => true }).cancelled).toBe(true);
    expect((db.prepare('select count(*) count from dictionaries').get() as { count: number }).count).toBe(0);
  });
});
