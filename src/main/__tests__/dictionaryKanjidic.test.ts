import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importKanjidic } from '../dictionary/importers/kanjidic';
import { removeDictionarySource } from '../dictionary/service';

const XML = `<?xml version="1.0"?><kanjidic2><character><literal>猫</literal><misc><grade>8</grade><stroke_count>11</stroke_count><freq>1702</freq><jlpt>2</jlpt></misc><radical><rad_value rad_type="classical">94</rad_value></radical><reading_meaning><rmgroup><reading r_type="ja_on">ビョウ</reading><reading r_type="ja_kun">ねこ</reading><meaning>cat</meaning><meaning m_lang="ru">кошка</meaning></rmgroup></reading_meaning></character></kanjidic2>`;

describe('KANJIDIC2 importer', () => {
  let root: string;
  let db: SqliteDb;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'kanjidic-')); db = openDictionaryDb({ dir: root }); });
  afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('imports character facts with source ownership and deterministic provenance', () => {
    expect(importKanjidic(db, XML, { dictId: 'kanjidic-fixture' })).toEqual({ entries: 1, skipped: 0, characters: 1, cancelled: false });
    expect(db.prepare(`select char, strokes, radical, readings, meanings, jlpt, grade, freq, primary_source_id, source_ids from chars where lang='ja' and char='猫'`).get()).toEqual({
      char: '猫', strokes: 11, radical: '94', readings: '["ビョウ","ねこ"]', meanings: '["cat","кошка"]', jlpt: '2', grade: 8, freq: 1702,
      primary_source_id: 'kanjidic-fixture', source_ids: '["kanjidic-fixture"]',
    });
    expect(db.prepare(`select dict_id, char from char_sources where char='猫'`).get()).toEqual({ dict_id: 'kanjidic-fixture', char: '猫' });
  });

  it('rolls the source and projection back on cancellation', () => {
    expect(importKanjidic(db, XML, { shouldCancel: () => true }).cancelled).toBe(true);
    expect(db.prepare('select count(*) as count from char_sources').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from chars').get()).toEqual({ count: 0 });
  });

  it('removes the compatibility projection with its final source', () => {
    importKanjidic(db, XML, { dictId: 'owned-source' });
    expect(removeDictionarySource('owned-source', db).ok).toBe(true);
    expect(db.prepare(`select count(*) as count from chars where char='猫'`).get()).toEqual({ count: 0 });
  });
});
