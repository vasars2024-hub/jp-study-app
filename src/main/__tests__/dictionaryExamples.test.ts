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
import { EXAMPLE_SCAN_CHUNK_ROWS, EXAMPLE_SCAN_ROWS } from '../../shared/lexiconExamples';

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
  it('returns sentences containing the word, shortest first, with their translations', async () => {
    importCorpus();
    const result = await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.query).toBe('猫');
    expect(result.examples.map((example) => example.text)).toEqual([
      '猫が好きです。',
      'その大きな黒い猫はとても静かに眠っています。',
    ]);
    expect(result.examples[0]).toMatchObject({
      lang: 'ja',
      dictId: 'tatoeba',
      dictTitle: 'Tatoeba',
      sourceId: '1',
      licence: 'CC BY 2.0 FR',
    });
    expect(result.examples[0].translations).toEqual([
      { lang: 'en', text: 'I like cats.' },
      { lang: 'ru', text: 'Я люблю кошек.' },
    ]);
  });

  // `猫。` contains 猫 and is not an example of it.
  it('drops a sentence that is only the word itself', async () => {
    importCorpus();
    const texts = (await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] }))
      .examples.map((example) => example.text);
    expect(texts).not.toContain('猫。');
  });

  it('filters translations to the requested languages', async () => {
    importCorpus();
    const result = await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'], glossLangs: ['ru'] });
    expect(result.examples[0].translations).toEqual([{ lang: 'ru', text: 'Я люблю кошек.' }]);
    expect(result.examples[1].translations).toEqual([]);
  });

  it('reads nothing from a disabled corpus', async () => {
    importCorpus();
    db.prepare(`update dictionaries set enabled = 0 where id = 'tatoeba'`).run();
    expect((await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] })).examples).toEqual([]);
  });

  it('answers empty for a blank query and for a pasted sentence', async () => {
    importCorpus();
    expect((await findExampleSentences(db, { text: '   ' })).examples).toEqual([]);
    expect((await findExampleSentences(db, { text: 'その大きな黒い猫はとても静かに眠っています。' })).examples).toEqual([]);
  });

  it('does not throw on a database that has no example corpus at all', async () => {
    expect(await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] })).toEqual({
      query: '猫',
      examples: [],
    });
  });
});

// The scan cannot be indexed away — `instr` over a text column is a table visit —
// so what is under test here is that the visit is spent in event-loop-sized
// windows rather than in one synchronous block, and that windowing it changed
// nothing about which sentences come back.
describe('the example scan is walked in chunks', () => {
  const CORPUS_ROWS = EXAMPLE_SCAN_CHUNK_ROWS * 3 + 17;

  // A corpus big enough to need four windows, with every match deliberately in
  // the LAST one: an implementation that reads a single chunk and stops returns
  // nothing here, which is the correctness half of the control.
  function importLargeCorpus(): void {
    db.prepare(`insert into dictionaries (id,title,source_lang,target_langs,kind,licence)
      values ('big','Big Corpus','*','*','examples','CC BY 2.0 FR')`).run();
    const insert = db.prepare(`insert into examples (id,lang,text,source,licence,dict_id)
      values (?,'ja',?,?,'CC BY 2.0 FR','big')`);
    db.transaction(() => {
      for (let id = 1; id <= CORPUS_ROWS; id += 1) {
        const tail = CORPUS_ROWS - id;
        // Only the final 5 rows contain 猫, and they are ordered so shortest-first
        // has something to do.
        const text = tail < 5
          ? `${'あ'.repeat(tail)}猫が好きです。`
          : `犬が走る${id}。`;
        insert.run(id, text, String(id));
      }
    })();
  }

  it('finds matches that live past the first window', async () => {
    importLargeCorpus();
    const result = await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] });
    expect(db.prepare('select count(*) as count from examples').get())
      .toEqual({ count: CORPUS_ROWS });
    expect(result.examples).toHaveLength(5);
    expect(result.examples[0].text).toBe('猫が好きです。');
    expect(result.examples.at(-1)?.text).toBe('ああああ猫が好きです。');
  });

  it('returns exactly what one unwindowed scan of the same corpus returns', async () => {
    importLargeCorpus();
    const windowed = await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] });
    // The statement this replaced, run verbatim as the reference.
    const reference = db.prepare(`
      select e.text from examples e join dictionaries d on d.id = e.dict_id
      where d.enabled = 1 and d.kind = 'examples' and e.lang in ('ja')
        and instr(e.text, ?) > 0
      limit ?
    `).all('猫', EXAMPLE_SCAN_ROWS) as { text: string }[];
    // Both lengths asserted before the comparison: `slice(0, windowed.length)`
    // on an empty result would otherwise make this pass vacuously, which is
    // exactly what a scan that stops after one window produces.
    expect(reference).toHaveLength(5);
    expect(windowed.examples).toHaveLength(5);
    expect(windowed.examples.map((example) => example.text)).toEqual(
      [...reference.map((row) => row.text)].sort((a, b) => [...a].length - [...b].length),
    );
  });

  // The load-bearing one. A ticker that only advances when the event loop turns
  // counts the windows: chunked, it sees at least one turn per window boundary;
  // one synchronous scan starves it completely. Delete the `await new Promise`
  // yield in `findExampleSentences` and this goes red at 0.
  it('gives the event loop a turn between windows', async () => {
    importLargeCorpus();
    let turns = 0;
    let running = true;
    const tick = (): void => {
      if (!running) return;
      turns += 1;
      setImmediate(tick);
    };
    setImmediate(tick);
    // Let the ticker arm before the scan starts, so its first turn is not the
    // one the scan itself would have yielded.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    const armed = turns;

    await findExampleSentences(db, { text: '猫', sourceLangs: ['ja'] });
    running = false;

    const windows = Math.ceil(CORPUS_ROWS / EXAMPLE_SCAN_CHUNK_ROWS);
    expect(windows).toBe(4);
    expect(turns - armed).toBeGreaterThanOrEqual(windows - 1);
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

    expect(lookup(db, { text: '猫', sourceLangs: ['ja'] }).entries).toEqual([]);
    expect(lookup(db, { text: 'I like cats.', sourceLangs: ['en'] }).entries).toEqual([]);
  });
});

describe('schema step 10', () => {
  it('is a shipped schema step, and the version has moved past it', () => {
    // Step 10 is no longer the last one; 11 lifts JMdict's `see:` definitions into
    // `xrefs` and 12 rebuilds `explanations`. What still matters here is that 10
    // shipped and was not edited. Stated as "past 10" rather than pinned to a
    // literal: the literal made every later migration break this assertion, which
    // says nothing about step 10 and trains the next author to edit the number.
    expect(MIGRATIONS.at(-1)?.version).toBe(DICT_SCHEMA_VERSION);
    expect(MIGRATIONS.some((step) => step.version === 10)).toBe(true);
    expect(DICT_SCHEMA_VERSION).toBeGreaterThan(10);
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

    // `jpn`/`eng`/`rus` in, `ja`/`en`/`ru` out: the old importer stored Tatoeba's
    // ISO 639-3 codes verbatim, and every language filter in this app says `ja`.
    expect(db.prepare('select lang,text,licence,dict_id from examples').all()).toEqual([
      { lang: 'ja', text: '猫が好きです。', licence: 'CC BY 2.0 FR', dict_id: 'tatoeba' },
    ]);
    expect(db.prepare('select lang,text from example_translations order by rowid').all()).toEqual([
      { lang: 'en', text: 'I like cats.' },
      { lang: 'ru', text: 'Я люблю кошек.' },
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
