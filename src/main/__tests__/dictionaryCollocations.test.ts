// @vitest-environment node
//
// The claim under test: a collocation row is *parsed*, not merely contained. The
// query has to sit at a phrase edge next to a particle, the other element has to
// be a word the same dictionaries carry, and the row that reaches the surface has
// to have gone through the `collocations` table rather than around it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importLegacyIndex } from '../dictionary/migrate';
import { findLexiconCollocations } from '../dictionary/dictService';
import type { YomitanDictInfo } from '../../shared/types';

let db: SqliteDb;

const INFO = (over: Partial<YomitanDictInfo> = {}): YomitanDictInfo => ({
  id: 'jmdict-en',
  title: 'JMdict (English)',
  revision: '1',
  priority: 0,
  hasTerms: true,
  hasPitch: false,
  hasFreq: false,
  importedAt: 0,
  glossLangs: ['en'],
  ...over,
});

const term = (word: string, reading: string, definitions: string[], score = 0) => ([{
  word,
  reading,
  score,
  senses: [{ partsOfSpeech: ['n'], definitions, tags: [] }],
}]);

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-colloc-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  importLegacyIndex(db, {
    version: 1,
    info: INFO(),
    terms: {
      猫: term('猫', 'ねこ', ['cat'], 1999800),
      小判: term('小判', 'こばん', ['koban coin'], 900000),
      目: term('目', 'め', ['eye'], 1999800),
      被る: term('被る', 'かぶる', ['to wear on the head'], 900000),
      // 猫に小判 and 猫の目 are genuine parses; 猫なで声 is the counterexample the
      // containment test gets wrong — it contains 猫 and it contains で, and it is
      // not a collocation of anything.
      猫に小判: term('猫に小判', 'ねこにこばん', ['pearls before swine'], 1000000),
      猫の目: term('猫の目', 'ねこのめ', ['something changeable'], 800000),
      猫なで声: term('猫なで声', 'ねこなでごえ', ['coaxing voice'], 700000),
      // The partner 蒲鉾 is not imported, so this phrase parses and is then
      // rejected for lack of attestation.
      猫に蒲鉾: term('猫に蒲鉾', 'ねこにかまぼこ', ['temptation'], 600000),
      // Query last: 核 is a word, so this is a real head-last row.
      核: term('核', 'かく', ['nucleus'], 1500000),
      核の傘: term('核の傘', 'かくのかさ', ['nuclear umbrella'], 500000),
      傘: term('傘', 'かさ', ['umbrella'], 1999800),
      犬: term('犬', 'いぬ', ['dog'], 1999800),
    },
  });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const phrases = async (text: string) =>
  (await findLexiconCollocations(db, { text, sourceLangs: ['ja'] }))
    .collocations.map((c) => c.phrase);

describe('findLexiconCollocations', () => {
  it('parses head-first phrases and rejects a merely-containing headword', async () => {
    const result = await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.query).toBe('猫');
    expect(await phrases('猫')).toContain('猫に小判');
    expect(await phrases('猫')).toContain('猫の目');
    // The whole reason this is not a substring search.
    expect(await phrases('猫')).not.toContain('猫なで声');
  });

  it('gives the partner its own first definition, so the row says what the phrase joins', async () => {
    const result = await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.collocations.find((c) => c.phrase === '猫に小判')?.partnerGloss)
      .toBe('koban coin');
    expect(result.collocations.find((c) => c.phrase === '猫の目')?.partnerGloss).toBe('eye');
    // The head is the word already on screen, so it is never the one glossed.
    expect(result.collocations.some((c) => c.partnerGloss === 'cat')).toBe(false);
  });

  it('glosses a partner the dictionaries carry only as a reading', async () => {
    // かぶる is a headword nowhere; it is the reading of 被る. The attestation
    // pass already keeps such a row, and the gloss has to follow it there.
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'extra', title: 'Extra' }),
      terms: { 猫をかぶる: term('猫をかぶる', 'ねこをかぶる', ['to feign innocence'], 500000) },
    });
    const row = (await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] }))
      .collocations.find((c) => c.phrase === '猫をかぶる');
    expect(row?.partner).toBe('かぶる');
    expect(row?.partnerGloss).toBe('to wear on the head');
  });

  it('leaves the gloss off rather than answering in a language that was not asked for', async () => {
    const rows = (await findLexiconCollocations(db, {
      text: '猫', sourceLangs: ['ja'], glossLangs: ['ru'],
    })).collocations;
    // The rows themselves survive: a partner is attested by being a headword,
    // which is not a question about the language its definitions are wanted in.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.partnerGloss === undefined)).toBe(true);
  });

  it('drops a phrase whose other element is not a word in the same dictionaries', async () => {
    expect(await phrases('猫')).not.toContain('猫に蒲鉾');
  });

  it('parses a phrase where the query comes after the particle', async () => {
    const result = await findLexiconCollocations(db, { text: '傘', sourceLangs: ['ja'] });
    const row = result.collocations.find((c) => c.phrase === '核の傘');
    expect(row).toBeTruthy();
    expect(row?.order).toBe('head-last');
    expect(row?.partner).toBe('核');
    expect(row?.particle).toBe('の');
    expect(row?.pattern).toBe('{partner}の{head}');
  });

  it('never returns the query itself and reports nothing for a word with no phrases', async () => {
    expect(await phrases('犬')).toEqual([]);
    expect(await phrases('猫')).not.toContain('猫');
  });

  it('returns nothing for a query that is not a headword at all', async () => {
    expect((await findLexiconCollocations(db, { text: '存在しない語', sourceLangs: ['ja'] }))
      .collocations).toEqual([]);
  });

  it('writes the rows it returns into the collocations table', async () => {
    await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    const rows = db.prepare(
      "select head, partner, pattern, count from collocations where lang = 'ja' and head = '猫' order by partner",
    ).all() as Array<{ head: string; partner: string; pattern: string; count: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.partner).sort()).toEqual(['小判', '目']);
    expect(rows.every((r) => r.pattern.includes('{head}') && r.pattern.includes('{partner}'))).toBe(true);
    expect(rows.every((r) => r.count >= 1)).toBe(true);
  });

  it('replaces this head rows rather than accumulating them across calls', async () => {
    const count = () => (db.prepare(
      "select count(*) c from collocations where lang = 'ja' and head = '猫'",
    ).get() as { c: number }).c;
    await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    const first = count();
    await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    expect(count()).toBe(first);
  });

  it('stores each row under its own language when the scan spans two', async () => {
    // A Han query resolves in both partitions of the real database, so `langs`
    // holds two entries and the call is not scoped to one. Every stored row must
    // carry the language of the headword it came from — keying the whole call on
    // the first language put Japanese phrases in the Chinese partition, where the
    // delete that is supposed to own them could no longer find them.
    // The Chinese entry deliberately outscores the Japanese one so that it sorts
    // FIRST in the resolved language list. Without that this test passes against
    // the very bug it exists for — `langs[0]` was 'ja' by luck, which is exactly
    // how a green test hides a real defect.
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'cedict', title: 'CC-CEDICT', glossLangs: ['en'] }),
      terms: { 猫: term('猫', 'māo', ['cat'], 3000000) },
    });
    db.prepare("update headwords set lang = 'zh' where dict_id = 'cedict'").run();

    const result = await findLexiconCollocations(db, { text: '猫' });
    expect(result.collocations.length).toBeGreaterThan(0);
    const rows = db.prepare(
      "select distinct lang from collocations where head = '猫'",
    ).all() as Array<{ lang: string }>;
    // The phrases are all Japanese headwords, so nothing may be filed under zh.
    expect(rows.map((r) => r.lang)).toEqual(['ja']);
    expect(result.collocations.every((c) => c.lang === 'ja')).toBe(true);
  });

  it('reads its payload back out of the table, so a wiped table yields nothing', async () => {
    await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] });
    // A trigger that deletes the rows straight after they are inserted stands in
    // for a write that silently did not land. If the payload were assembled from
    // the local drafts instead of from the table, this would still return rows.
    db.exec(`
      create trigger colloc_swallow after insert on collocations
      begin delete from collocations where rowid = new.rowid; end;
    `);
    expect((await findLexiconCollocations(db, { text: '猫', sourceLangs: ['ja'] }))
      .collocations).toEqual([]);
    db.exec('drop trigger colloc_swallow');
  });
});
