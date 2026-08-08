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
import { CEDICT_LICENCE, importCedict, resolveVariant } from '../dictionary/importers/cedict';

let db: SqliteDb;

const FIXTURE = [
  '# CC-CEDICT',
  '# a comment line the parser must survive',
  '傳統 传统 [chuan2 tong3] /tradition/traditional/',
  '一 一 [yi1] /one/a (article)/CL:個|个[ge4]/',
  '女 女 [nu:3] /female/woman/',
  'this line is malformed',
  '狗 狗 [gou3] /dog/CL:隻|只[zhi1],條|条[tiao2]/',
  '',
].join('\n');

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-cedict-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('importCedict', () => {
  it('imports the entries and skips comments and junk without failing', () => {
    const counts = importCedict(db, FIXTURE);
    expect(counts.entries).toBe(4);
    // two comments, one malformed line, one trailing blank
    expect(counts.skipped).toBe(4);
    expect(counts.senses).toBe(4);
  });

  it('stores tone-marked pinyin for display and toneless for search', () => {
    importCedict(db, FIXTURE);
    const row = db.prepare('select reading, reading_norm from headwords where text = ?').get('传统');
    expect(row).toEqual({ reading: 'chuán tǒng', reading_norm: 'chuantong' });
  });

  it('handles the u: digraph end to end', () => {
    importCedict(db, FIXTURE);
    const row = db.prepare('select reading, reading_norm from headwords where text = ?').get('女');
    expect(row).toEqual({ reading: 'nǚ', reading_norm: 'nü' });
  });

  it('links the traditional form to the simplified one rather than duplicating senses', () => {
    importCedict(db, FIXTURE);
    const simp = db.prepare('select id, variant_of from headwords where text = ?').get('传统') as
      { id: number; variant_of: number | null };
    const trad = db.prepare('select id, variant_of from headwords where text = ?').get('傳統') as
      { id: number; variant_of: number | null };

    expect(simp.variant_of).toBeNull();
    expect(trad.variant_of).toBe(simp.id);
    // The variant carries no senses of its own — that is the point of the link.
    expect(db.prepare('select count(*) c from senses where headword_id = ?').get(trad.id)).toEqual({ c: 0 });
    expect(resolveVariant(db, trad.id)).toBe(simp.id);
    expect(resolveVariant(db, simp.id)).toBe(simp.id);
  });

  it('creates one headword when both scripts agree', () => {
    importCedict(db, FIXTURE);
    expect(db.prepare('select count(*) c from headwords where text = ?').get('一')).toEqual({ c: 1 });
  });

  it('counts variants separately from sense-carrying headwords', () => {
    const counts = importCedict(db, FIXTURE);
    // Only 传统/傳統 differs between the scripts in this fixture — 一, 女 and 狗
    // are written identically in both, which is the common case and the reason
    // a naive "two headwords per entry" import would inflate the entry count.
    expect(counts.variants).toBe(1);
    expect(counts.headwords).toBe(counts.entries + counts.variants);
  });

  it('keeps every gloss in order, in one sense', () => {
    importCedict(db, FIXTURE);
    const defs = db
      .prepare(`
        select g.text as text from glosses g
        join senses s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        where h.text = ? order by g.ord
      `)
      .all('一') as { text: string }[];
    // CEDICT has no sense divisions, so inventing them would be inventing structure.
    expect(defs.map((row) => row.text)).toEqual(['one', 'a (article)', 'CL:個|个[ge4]']);
  });

  it('records the licence, which CC BY-SA obliges the UI to surface', () => {
    importCedict(db, FIXTURE);
    const row = db.prepare('select licence, attribution, source_lang from dictionaries where id = ?').get('cc-cedict') as
      { licence: string; attribution: string; source_lang: string };
    expect(row.licence).toBe(CEDICT_LICENCE);
    expect(row.attribution).toMatch(/cc-cedict\.org/);
    expect(row.source_lang).toBe('zh');
  });

  it('is searchable by headword and by gloss', () => {
    importCedict(db, FIXTURE);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('传统')).toHaveLength(1);
    const reverse = db
      .prepare(`
        select h.text as text from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        where glosses_fts match ?
      `)
      .all('dog') as { text: string }[];
    expect(reverse.map((row) => row.text)).toEqual(['狗']);
  });

  it('finds an entry by toneless pinyin, which is what a learner types', () => {
    importCedict(db, FIXTURE);
    const row = db.prepare('select text from headwords where lang = ? and reading_norm = ?').get('zh', 'chuantong');
    expect(row).toEqual({ text: '传统' });
  });

  it('replaces a previous import instead of doubling it', () => {
    importCedict(db, FIXTURE);
    importCedict(db, FIXTURE);
    expect(db.prepare('select count(*) c from dictionaries').get()).toEqual({ c: 1 });
    expect(db.prepare('select count(*) c from headwords where text = ?').get('传统')).toEqual({ c: 1 });
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('传统')).toHaveLength(1);
  });

  it('survives CRLF line endings', () => {
    const counts = importCedict(db, FIXTURE.split('\n').join('\r\n'));
    expect(counts.entries).toBe(4);
    expect(db.prepare('select reading from headwords where text = ?').get('传统')).toEqual({ reading: 'chuán tǒng' });
  });

  it('reports progress on a long file', () => {
    const long = Array.from({ length: 50 }, (_, i) => `詞${i} 词${i} [ci2] /word ${i}/`).join('\n');
    const seen: number[] = [];
    importCedict(db, long, { progressEvery: 10, onProgress: (lines) => seen.push(lines) });
    expect(seen).toEqual([10, 20, 30, 40, 50]);
  });

  it('accepts an alternative gloss language, so a ZH→RU file is not mislabelled', () => {
    importCedict(db, '传统 传统 [chuan2 tong3] /традиция/', { dictId: 'zh-ru', glossLang: 'ru' });
    expect(db.prepare('select distinct lang from glosses').all()).toEqual([{ lang: 'ru' }]);
  });
});
