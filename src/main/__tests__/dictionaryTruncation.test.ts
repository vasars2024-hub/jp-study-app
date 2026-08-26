// @vitest-environment node
//
// The claim under test: a dictionary result that was cut short says so.
//
// Until `truncated` existed, a `limit: 8` read rendered identically whether
// eight was the whole answer or the first eight of hundreds, and nothing on the
// surface could reach the ninth. The negative control is the load-bearing case
// here — `entries.length === limit` is equally true of a result that is exactly
// complete, so a flag inferred from it would lie on every word with exactly
// eight senses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { lookup, normalizeForLookup } from '../dictionary/dictService';
import { lookupResultToDictResult } from '../dictionary/lexiconAdapter';
import { lookupChineseInDb } from '../dictionary/chineseLookup';

let db: SqliteDb;

/** One term dictionary, so a test can control exactly how many rows match. */
function seedDictionary(dictId: string, lang: string): void {
  db.prepare(`
    insert into dictionaries (id, title, revision, source_lang, target_langs, priority, kind, imported_at)
    values (?, ?, '1', ?, 'en', 0, 'term', 0)
  `).run(dictId, dictId, lang);
}

/** One headword with one glossed sense. `score` decides where it ranks. */
function seedHeadword(
  dictId: string,
  lang: string,
  text: string,
  score: number,
  glossLang = 'en',
): void {
  const headwordId = Number(
    db.prepare(`
      insert into headwords (dict_id, lang, text, norm, reading, reading_norm, score)
      values (?, ?, ?, ?, '', '', ?)
    `).run(dictId, lang, text, normalizeForLookup(text), score).lastInsertRowid,
  );
  const senseId = Number(
    db.prepare("insert into senses (headword_id, ord, pos, tags) values (?, 0, 'n', '')")
      .run(headwordId).lastInsertRowid,
  );
  db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, 0)')
    .run(senseId, glossLang, `meaning of ${text}`);
}

/** `count` headwords sharing `base` as a prefix, so the prefix probe finds them. */
function seedPrefixFamily(dictId: string, lang: string, base: string, count: number): void {
  for (let i = 0; i < count; i += 1) seedHeadword(dictId, lang, `${base}${i}`, 50 - i);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dicttrunc-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('lookup() truncation', () => {
  it('says so when more matches exist than the limit shows', () => {
    seedDictionary('many', 'ja');
    seedPrefixFamily('many', 'ja', 'テスト', 5);

    const result = lookup(db, { text: 'テスト', limit: 3 });

    expect(result.entries).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('NEGATIVE CONTROL: a full page that is the whole answer is not truncated', () => {
    // Three matches, a limit of three. `entries.length === limit` here exactly as
    // it does above, and the flag must still be absent — this is the case an
    // inferred flag gets wrong, and it is the common one.
    seedDictionary('exact', 'ja');
    seedPrefixFamily('exact', 'ja', 'サンプル', 3);

    const result = lookup(db, { text: 'サンプル', limit: 3 });

    expect(result.entries).toHaveLength(3);
    expect(result.truncated).toBeUndefined();
  });

  it('leaves it absent when the limit was never reached', () => {
    seedDictionary('few', 'ja');
    seedPrefixFamily('few', 'ja', 'テスト', 5);

    const result = lookup(db, { text: 'テスト', limit: 8 });

    expect(result.entries).toHaveLength(5);
    expect(result.truncated).toBeUndefined();
  });

  it('says so when a capped probe came back full even though fewer entries survived', () => {
    // The count is not a proof of exhaustion. Rows are dropped AFTER they are
    // fetched — here by the language-pair filter, in the shipped database also by
    // deduplication — so a page shorter than the limit can still be sitting on
    // unread rows. Measured live before this branch existed: 鬱 returned 52
    // entries at `limit: 71` and 71 at `limit: 200`, while claiming completeness.
    seedDictionary('mixed', 'ja');
    // The prefix probe orders by norm length then id, so insertion order decides
    // which four of these six it reads at `gather` = 4.
    seedHeadword('mixed', 'ja', 'テスト0', 50, 'en');
    seedHeadword('mixed', 'ja', 'テスト1', 49, 'ru');
    seedHeadword('mixed', 'ja', 'テスト2', 48, 'ru');
    seedHeadword('mixed', 'ja', 'テスト3', 47, 'en');
    seedHeadword('mixed', 'ja', 'テスト4', 46, 'en');
    seedHeadword('mixed', 'ja', 'テスト5', 45, 'en');

    const result = lookup(db, { text: 'テスト', limit: 3, glossLangs: ['en'] });

    expect(result.entries.length).toBeLessThan(3);
    expect(result.truncated).toBe(true);
  });

  it('does not claim truncation on a query nothing matched', () => {
    seedDictionary('none', 'ja');
    seedPrefixFamily('none', 'ja', 'テスト', 5);

    const result = lookup(db, { text: 'ありえない', limit: 1 });

    expect(result.entries).toHaveLength(0);
    expect(result.truncated).toBeUndefined();
  });
});

describe('lookupResultToDictResult', () => {
  it('carries truncation across the legacy adapter', () => {
    seedDictionary('many', 'ja');
    seedPrefixFamily('many', 'ja', 'テスト', 5);

    const truncated = lookupResultToDictResult(lookup(db, { text: 'テスト', limit: 3 }));
    const whole = lookupResultToDictResult(lookup(db, { text: 'テスト', limit: 8 }));

    expect(truncated.truncated).toBe(true);
    expect(whole.truncated).toBeUndefined();
  });
});

describe('lookupChineseInDb', () => {
  it('reports truncation when the language filter removed nothing', () => {
    seedDictionary('cedict', 'zh');
    seedHeadword('cedict', 'zh', '传统', 60);
    seedPrefixFamily('cedict', 'zh', '传统', 4);

    const result = lookupChineseInDb(db, '传统', 3);

    expect(result?.entries).toHaveLength(3);
    expect(result?.truncated).toBe(true);
  });

  it('drops the claim when the language filter removed a row', () => {
    // `truncated` is measured before the zh filter runs. Once a row is dropped,
    // the rows the limit cut off may have been droppable too, so "there are
    // more" is no longer provable — and an unprovable claim is not made.
    seedDictionary('cedict', 'zh');
    seedHeadword('cedict', 'zh', '传统', 50);
    seedPrefixFamily('cedict', 'zh', '传统', 4);
    // An imported dictionary that cannot declare a source language. Its exact
    // match outranks the Chinese one, so it lands inside the page and is then
    // filtered back out.
    seedDictionary('stardict', 'und');
    seedHeadword('stardict', 'und', '传统', 90);

    const result = lookupChineseInDb(db, '传统', 3);

    expect(result?.entries.every((entry) => entry.word === '传统' || entry.word.startsWith('传统')))
      .toBe(true);
    expect(result?.entries.length).toBeLessThan(3);
    expect(result?.truncated).toBeUndefined();
  });
});
