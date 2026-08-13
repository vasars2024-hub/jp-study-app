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
    expect(importTatoeba(db, sentences, links)).toMatchObject({ entries: 1, glosses: 2, cancelled: false });
    expect(db.prepare(`select lang,text from glosses order by ord`).all()).toEqual([
      { lang: 'eng', text: 'It is a cat.' }, { lang: 'rus', text: 'Это кошка.' },
    ]);
    expect(db.prepare(`select licence,attribution from dictionaries where id='tatoeba'`).get()).toEqual({
      licence: 'CC BY 2.0 FR', attribution: 'Tatoeba — https://tatoeba.org/',
    });
  });

  it('rolls replacement back when cancelled', () => {
    const sentences = path.join(root, 'sentences.tsv'); const links = path.join(root, 'links.tsv');
    fs.writeFileSync(sentences, '1\tjpn\t猫です。\n2\teng\tIt is a cat.\n'); fs.writeFileSync(links, '1\t2\n');
    importTatoeba(db, sentences, links);
    const result = importTatoeba(db, sentences, links, { progressEvery: 1, shouldCancel: () => true });
    expect(result.cancelled).toBe(true);
    expect(db.prepare(`select count(*) as count from headwords where dict_id='tatoeba'`).get()).toEqual({ count: 1 });
  });
});
