// @vitest-environment node
//
// The claims under test: an imported example corpus is reachable *as sentences*
// and unreachable as words. Both halves matter — before this slice the Tatoeba
// importer stored sentences as headwords, so 200k sentences were simultaneously
// invisible to any example surface and visible as definitions of the words they
// happened to start with.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importTatoeba } from '../dictionary/importers/tatoeba';
import { findExampleSentences, lookup } from '../dictionary/dictService';
import { DICT_SCHEMA_VERSION, MIGRATIONS } from '../dictionary/schema';

let root = '';
let db: SqliteDb;

const SENTENCES = [
  '1\tjpn\t猫が好きです。',
  '2\teng\tI like cats.',
  '3\tjpn\t猫。',
  '4\teng\tCat.',
  '5\tjpn\tその大きな黒い猫はとても静かに眠っています。',
  '6\teng\tThat big black cat is sleeping very quietly.',
  '7\trus\tЯ люблю кошек.',
  '8\tjpn\t犬が走る。',
  '9\teng\tThe dog runs.',
].join('\n');
const LINKS = ['1\t2', '1\t7', '3\t4', '5\t6', '8\t9'].join('\n');

function importCorpus(): void {
  const sentences = path.join(root, 'sentences.tsv');
  const links = path.join(root, 'links.tsv');
  fs.writeFileSync(sentences, `${SENTENCES}\n`);
  fs.writeFileSync(links, `${LINKS}\n`);
  importTatoeba(db, sentences, links, { title: 'Tatoeba' });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-examples-'));
  db = openDictionaryDb({ dir: path.join(root, 'dictionary') });
});

afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('example sentence reader', () => {
  it('returns sentences containing the word, shortest first, with their translations', () => {
    importCorpus();
    const result = findExampleSentences(db, { text: '猫', sourceLangs: ['jpn'] });
    expect(result.query).toBe('猫');
    expect(result.examples.map((example) => example.text)).toEqual([
      '猫が好きです。',
      'その大きな黒い猫はとても静かに眠っています。',
    ]);
    expect(result.examples[0]).toMatchObject({
      lang: 'jpn',
      dictId: 'tatoeba',
      dictTitle: 'Tatoeba',
      sourceId: '1',
      licence: 'CC BY 2.0 FR',
    });
    expect(result.examples[0].translations).toEqual([
      { lang: 'eng', text: 'I like cats.' },
      { lang: 'rus', text: 'Я люблю кошек.' },
    ]);
  });

  // `猫。` contains 猫 and is not an example of it.
  it('drops a sentence that is only the word itself', () => {
    importCorpus();
    const texts = findExampleSentences(db, { text: '猫', sourceLangs: ['jpn'] })
      .examples.map((example) => example.text);
    expect(texts).not.toContain('猫。');
  });

  it('filters translations to the requested languages', () => {
    importCorpus();
    const result = findExampleSentences(db, { text: '猫', sourceLangs: ['jpn'], glossLangs: ['rus'] });
    expect(result.examples[0].translations).toEqual([{ lang: 'rus', text: 'Я люблю кошек.' }]);
    expect(result.examples[1].translations).toEqual([]);
  });

  it('reads nothing from a disabled corpus', () => {
    importCorpus();
    db.prepare(`update dictionaries set enabled = 0 where id = 'tatoeba'`).run();
    expect(findExampleSentences(db, { text: '猫', sourceLangs: ['jpn'] }).examples).toEqual([]);
  });

  it('answers empty for a blank query and for a pasted sentence', () => {
    importCorpus();
    expect(findExampleSentences(db, { text: '   ' }).examples).toEqual([]);
    expect(findExampleSentences(db, { text: 'その大きな黒い猫はとても静かに眠っています。' }).examples).toEqual([]);
  });

  it('does not throw on a database that has no example corpus at all', () => {
    expect(findExampleSentences(db, { text: '猫', sourceLangs: ['jpn'] })).toEqual({
      query: '猫',
      examples: [],
    });
  });
});

describe('word lookups and example corpora', () => {
  it('never answers a word lookup with a sentence', () => {
    importCorpus();
    // Belt: the importer no longer writes headwords at all.
    expect(db.prepare('select count(*) as count from headwords').get()).toEqual({ count: 0 });

    // Braces: even when an example store does hold headwords — which is what
    // every pre-step-10 install looked like — its kind keeps it out.
    db.prepare(`insert into headwords (dict_id,lang,text,norm,reading,reading_norm,variant_of,score)
      values ('tatoeba','jpn','猫が好きです。','猫が好きです。','','',null,0)`).run();
    const senseId = Number(db.prepare(`insert into senses (headword_id,ord,pos,tags)
      values ((select id from headwords where dict_id='tatoeba'),0,'example','')`).run().lastInsertRowid);
    db.prepare(`insert into glosses (sense_id,lang,text,ord) values (?,'eng','I like cats.',0)`).run(senseId);

    expect(lookup(db, { text: '猫', sourceLangs: ['jpn'] }).entries).toEqual([]);
    expect(lookup(db, { text: 'I like cats.', sourceLangs: ['eng'] }).entries).toEqual([]);
  });
});

describe('schema step 10', () => {
  it('is the current schema version', () => {
    expect(MIGRATIONS.at(-1)?.version).toBe(DICT_SCHEMA_VERSION);
    expect(DICT_SCHEMA_VERSION).toBe(10);
  });

  // Reproduces exactly what an install that imported Tatoeba before this slice
  // holds, then re-runs the step over it.
  it('moves sentences an old import left in the headword index', () => {
    db.prepare(`insert into dictionaries (id,title,source_lang,target_langs,kind,licence)
      values ('tatoeba','Tatoeba','*','*','examples','CC BY 2.0 FR')`).run();
    const headwordId = Number(db.prepare(`insert into headwords (dict_id,lang,text,norm,reading,reading_norm,variant_of,score)
      values ('tatoeba','jpn','猫が好きです。','猫が好きです。','','',null,0)`).run().lastInsertRowid);
    const senseId = Number(db.prepare(`insert into senses (headword_id,ord,pos,tags) values (?,0,'example','')`)
      .run(headwordId).lastInsertRowid);
    db.prepare(`insert into glosses (sense_id,lang,text,ord) values (?,'eng','I like cats.',0)`).run(senseId);
    db.prepare(`insert into glosses (sense_id,lang,text,ord) values (?,'rus','Я люблю кошек.',1)`).run(senseId);

    const step = MIGRATIONS.find((migration) => migration.version === 10);
    expect(step).toBeDefined();
    step?.up(db);

    expect(db.prepare('select lang,text,licence,dict_id from examples').all()).toEqual([
      { lang: 'jpn', text: '猫が好きです。', licence: 'CC BY 2.0 FR', dict_id: 'tatoeba' },
    ]);
    expect(db.prepare('select lang,text from example_translations order by rowid').all()).toEqual([
      { lang: 'eng', text: 'I like cats.' },
      { lang: 'rus', text: 'Я люблю кошек.' },
    ]);
    expect(db.prepare('select count(*) as count from headwords').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from senses').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from glosses').get()).toEqual({ count: 0 });

    // Every step in this ladder must survive being applied twice.
    step?.up(db);
    expect(db.prepare('select count(*) as count from examples').get()).toEqual({ count: 1 });
    expect(db.prepare('select count(*) as count from example_translations').get()).toEqual({ count: 2 });
  });
});
