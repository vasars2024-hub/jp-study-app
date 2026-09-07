import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importKanjidic } from '../dictionary/importers/kanjidic';
import { removeDictionarySource } from '../dictionary/service';
import { japaneseCharacterReadings, lookup } from '../dictionary/dictService';

// A real KANJIDIC2 `<rmgroup>`: on-yomi and kun-yomi sit beside this character's
// pinyin, Korean and Vietnamese readings, and the English gloss beside its
// French/Russian translations. Only the Japanese half belongs to a `ja` row.
const XML = `<?xml version="1.0"?><kanjidic2><character><literal>猫</literal><misc><grade>8</grade><stroke_count>11</stroke_count><freq>1702</freq><jlpt>2</jlpt></misc><radical><rad_value rad_type="classical">94</rad_value></radical><reading_meaning><rmgroup><reading r_type="pinyin">mao1</reading><reading r_type="korean_r">myo</reading><reading r_type="korean_h">묘</reading><reading r_type="vietnam">Miêu</reading><reading r_type="ja_on">ビョウ</reading><reading r_type="ja_kun">ねこ</reading><meaning>cat</meaning><meaning m_lang="fr">chat</meaning><meaning m_lang="ru">кошка</meaning></rmgroup></reading_meaning></character></kanjidic2>`;

describe('KANJIDIC2 importer', () => {
  let root: string;
  let db: SqliteDb;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'kanjidic-')); db = openDictionaryDb({ dir: root }); });
  afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('imports character facts with source ownership and deterministic provenance', () => {
    expect(importKanjidic(db, XML, { dictId: 'kanjidic-fixture' })).toEqual({ entries: 1, skipped: 0, characters: 1, cancelled: false });
    expect(db.prepare(`select char, strokes, radical, readings, meanings, jlpt, grade, freq, primary_source_id, source_ids from chars where lang='ja' and char='猫'`).get()).toEqual({
      char: '猫', strokes: 11, radical: '94', readings: '["ビョウ","ねこ"]', meanings: '["cat"]', jlpt: '2', grade: 8, freq: 1702,
      primary_source_id: 'kanjidic-fixture', source_ids: '["kanjidic-fixture"]',
    });
    expect(db.prepare(`select dict_id, char from char_sources where char='猫'`).get()).toEqual({ dict_id: 'kanjidic-fixture', char: '猫' });
  });

  it('returns grounded character metadata only while its source is enabled', () => {
    importKanjidic(db, XML, { dictId: 'kanjidic-fixture' });

    expect(lookup(db, { text: '猫', sourceLangs: ['ja'], glossLangs: ['en'] }).character).toEqual({
      lang: 'ja',
      char: '猫',
      strokes: 11,
      radical: '94',
      components: [],
      readings: ['ビョウ', 'ねこ'],
      meanings: ['cat'],
      jlpt: '2',
      grade: 8,
      frequency: 1702,
      sources: [{
        dictId: 'kanjidic-fixture',
        dictTitle: 'KANJIDIC2',
        licence: 'CC BY-SA 4.0',
        attribution: 'KANJIDIC2 — EDRDG',
      }],
    });

    db.prepare(`update dictionaries set enabled = 0 where id = 'kanjidic-fixture'`).run();
    expect(lookup(db, { text: '猫', sourceLangs: ['ja'] }).character).toBeUndefined();
    expect(lookup(db, { text: '猫語', sourceLangs: ['ja'] }).character).toBeUndefined();
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

  /**
   * The named non-Japanese readings and glosses, asserted one at a time rather
   * than only through the whole-array equality above: an importer that dropped
   * the wrong half would still satisfy a length check.
   */
  it('stores no pinyin, Korean, Vietnamese reading or translated gloss on a ja row', () => {
    importKanjidic(db, XML, { dictId: 'kanjidic-fixture' });
    const row = db.prepare(`select readings, meanings from chars where lang='ja' and char='猫'`)
      .get() as { readings: string; meanings: string };
    for (const foreign of ['mao1', 'myo', '묘', 'Miêu']) {
      expect(JSON.parse(row.readings)).not.toContain(foreign);
    }
    for (const translated of ['chat', 'кошка']) {
      expect(JSON.parse(row.meanings)).not.toContain(translated);
    }
    expect(JSON.parse(row.readings)).toEqual(['ビョウ', 'ねこ']);
    expect(JSON.parse(row.meanings)).toEqual(['cat']);
  });

  /**
   * The repair half. Databases imported before the `r_type` filter still hold the
   * mix — 49,450 of 86,498 stored `ja` readings on the machine this was measured
   * on — so the read path drops them too. Written straight into `chars` because
   * that is exactly the state such a database is in.
   */
  it('drops non-Japanese readings a database imported before the fix already holds', () => {
    importKanjidic(db, XML, { dictId: 'kanjidic-fixture' });
    db.prepare(`update chars set readings = ? where lang='ja' and char='猫'`)
      .run(JSON.stringify(['mao1', 'myo', '묘', 'Miêu', 'ビョウ', 'ねこ']));

    expect(lookup(db, { text: '猫', sourceLangs: ['ja'] }).character?.readings).toEqual(['ビョウ', 'ねこ']);
  });

  it('keeps a Chinese row whole — its readings are pinyin and are correct', () => {
    expect(japaneseCharacterReadings('zh', ['mao1', 'māo'])).toEqual(['mao1', 'māo']);
  });

  /**
   * 403 real rows are in exactly this state — CJK-extension characters KANJIDIC2
   * carries with only Chinese readings. Empty is what a clean re-import stores
   * and what the panel hides its Readings line for; returning them whole would
   * put `yin3` under a Japanese heading.
   */
  it('returns nothing for a ja row whose only readings are foreign', () => {
    expect(japaneseCharacterReadings('ja', ['yin3'])).toEqual([]);
  });
});
