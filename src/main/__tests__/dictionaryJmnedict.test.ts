import { afterEach, describe, expect, it } from 'vitest';
import { openDictionaryDb, closeDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importJmnedict, parseJmnedictEntry } from '../dictionary/importers/jmnedict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const roots: string[] = [];
const databases: SqliteDb[] = [];
function db(): SqliteDb {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jmnedict-test-'));
  roots.push(root);
  const database = openDictionaryDb({ dir: root });
  databases.push(database);
  return database;
}
afterEach(() => {
  for (const database of databases.splice(0)) if (database.open) database.close();
  closeDictionaryDb();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const FIXTURE = `<?xml version="1.0"?><JMnedict>
<entry><ent_seq>1</ent_seq><k_ele><keb>山田</keb></k_ele><r_ele><reb>やまだ</reb></r_ele><trans><name_type>&surname;</name_type><trans_det>Yamada</trans_det></trans></entry>
<entry><ent_seq>2</ent_seq><r_ele><reb>さくら</reb></r_ele><trans><name_type>&fem;</name_type><trans_det xml:lang="ru">Сакура</trans_det></trans></entry>
</JMnedict>`;

describe('JMnedict importer', () => {
  it('parses kanji and reading-only names with entity-backed types', () => {
    expect(parseJmnedictEntry(FIXTURE.match(/<entry>[\s\S]*?<\/entry>/)?.[0] ?? '')).toEqual({
      spellings: ['山田'], readings: ['やまだ'], translations: [{ lang: 'en', text: 'Yamada' }], types: ['surname'],
    });
  });

  it('imports names transactionally with lookup variants and language attribution', () => {
    const database = db();
    const result = importJmnedict(database, FIXTURE, { dictId: 'names-fixture', progressEvery: 1 });
    expect(result).toMatchObject({ entries: 2, skipped: 0, headwords: 3, variants: 1, senses: 2, glosses: 2, cancelled: false });
    expect(database.prepare(`select h.text, h.variant_of, g.lang, g.text as gloss from headwords h
      left join senses s on s.headword_id = coalesce(h.variant_of, h.id)
      left join glosses g on g.sense_id = s.id where h.dict_id = ? order by h.id`).all('names-fixture')).toEqual([
      { text: '山田', variant_of: null, lang: 'en', gloss: 'Yamada' },
      { text: 'やまだ', variant_of: 1, lang: 'en', gloss: 'Yamada' },
      { text: 'さくら', variant_of: null, lang: 'ru', gloss: 'Сакура' },
    ]);
  });

  it('rolls back replacement when cancelled', () => {
    const database = db();
    importJmnedict(database, FIXTURE, { dictId: 'names-fixture' });
    const result = importJmnedict(database, FIXTURE.replace('山田', '田中'), { dictId: 'names-fixture', shouldCancel: () => true });
    expect(result.cancelled).toBe(true);
    expect(database.prepare('select text from headwords where dict_id = ? order by id limit 1').get('names-fixture')).toEqual({ text: '山田' });
  });
});
