import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importTatoeba } from '../dictionary/importers/tatoeba';

describe('Tatoeba importer', () => {
  let root: string; let db: SqliteDb;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'tatoeba-')); db = openDictionaryDb({ dir: path.join(root, 'db') }); });
  afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('imports linked multilingual sentences with attribution', () => {
    const sentences = path.join(root, 'sentences.tsv'); const links = path.join(root, 'links.tsv');
    fs.writeFileSync(sentences, '1\tjpn\t猫です。\n2\teng\tIt is a cat.\n3\trus\tЭто кошка.\n');
    fs.writeFileSync(links, '1\t2\n1\t3\n');
    expect(importTatoeba(db, sentences, links)).toMatchObject({ entries: 1, translations: 2, cancelled: false });
    expect(db.prepare(`select lang,text from example_translations order by rowid`).all()).toEqual([
      { lang: 'en', text: 'It is a cat.' }, { lang: 'ru', text: 'Это кошка.' },
    ]);
    expect(db.prepare(`select licence,attribution from dictionaries where id='tatoeba'`).get()).toEqual({
      licence: 'CC BY 2.0 FR', attribution: 'Tatoeba — https://tatoeba.org/',
    });
  });

  // The whole point of the storage move: a sentence is not a headword. Before
  // this, `select count(*) from headwords` was 1 here and the sentence answered
  // ordinary word lookups.
  it('stores sentences in the examples tables, not the headword index', () => {
    const sentences = path.join(root, 'sentences.tsv'); const links = path.join(root, 'links.tsv');
    fs.writeFileSync(sentences, '1\tjpn\t猫です。\n2\teng\tIt is a cat.\n');
    fs.writeFileSync(links, '1\t2\n');
    importTatoeba(db, sentences, links);
    expect(db.prepare('select count(*) as count from headwords').get()).toEqual({ count: 0 });
    expect(db.prepare('select lang,text,source,licence,dict_id from examples').all()).toEqual([
      { lang: 'ja', text: '猫です。', source: '1', licence: 'CC BY 2.0 FR', dict_id: 'tatoeba' },
    ]);
  });

  // `examples` had no owner column until schema step 10, so nothing could have
  // cleaned up after a re-import or a removed source.
  it('cascades its sentences off the dictionary row', () => {
    const sentences = path.join(root, 'sentences.tsv'); const links = path.join(root, 'links.tsv');
    fs.writeFileSync(sentences, '1\tjpn\t猫です。\n2\teng\tIt is a cat.\n');
    fs.writeFileSync(links, '1\t2\n');
    importTatoeba(db, sentences, links);
    db.prepare(`delete from dictionaries where id='tatoeba'`).run();
    expect(db.prepare('select count(*) as count from examples').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from example_translations').get()).toEqual({ count: 0 });
  });

  it('rolls replacement back when cancelled', () => {
    const sentences = path.join(root, 'sentences.tsv'); const links = path.join(root, 'links.tsv');
    fs.writeFileSync(sentences, '1\tjpn\t猫です。\n2\teng\tIt is a cat.\n'); fs.writeFileSync(links, '1\t2\n');
    importTatoeba(db, sentences, links);
    const result = importTatoeba(db, sentences, links, { progressEvery: 1, shouldCancel: () => true });
    expect(result.cancelled).toBe(true);
    expect(db.prepare(`select count(*) as count from examples where dict_id='tatoeba'`).get()).toEqual({ count: 1 });
  });
});
