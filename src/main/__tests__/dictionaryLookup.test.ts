// @vitest-environment node
//
// Phase 3's claim under test: one code path serves ja / zh / en / ru, in both
// directions. Every case below goes through the same `lookup()` call — if any
// language needed its own entry point, that would show up here as a different
// function name, and there isn't one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importCedict } from '../dictionary/importers/cedict';
import { importLegacyIndex } from '../dictionary/migrate';
import {
  candidateForms,
  detectQueryLangs,
  ftsQuery,
  lookup,
  normalizeForLookup,
} from '../dictionary/dictService';
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

function seed(): void {
  importLegacyIndex(db, {
    version: 1,
    info: INFO(),
    terms: {
      食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] }],
      たべる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] }],
      食べ物: [{ word: '食べ物', reading: 'たべもの', score: 3, senses: [{ partsOfSpeech: ['n'], definitions: ['food'], tags: [] }] }],
      走る: [{ word: '走る', reading: 'はしる', score: 4, senses: [{ partsOfSpeech: ['v5r'], definitions: ['to run'], tags: [] }] }],
    },
  });
  importLegacyIndex(db, {
    version: 1,
    info: INFO({ id: 'jmdict-ru', title: 'JMdict (Russian)', priority: 1, glossLangs: ['ru'] }),
    terms: {
      食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['есть', 'кушать'], tags: [] }] }],
    },
  });
  importCedict(
    db,
    ['傳統 传统 [chuan2 tong3] /tradition/traditional/', '狗 狗 [gou3] /dog/'].join('\n'),
    { dictId: 'cc-cedict', priority: 2 },
  );
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictlookup-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  seed();
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('detectQueryLangs', () => {
  it('treats kana as decisive for Japanese', () => {
    expect(detectQueryLangs('たべる')).toEqual(['ja']);
    expect(detectQueryLangs('食べる')).toEqual(['ja']);
  });

  it('searches BOTH Japanese and Chinese for bare Han', () => {
    // 食 alone is ambiguous. Guessing zh would silently lose every JMdict entry.
    expect(detectQueryLangs('食')).toEqual(['ja', 'zh']);
    expect(detectQueryLangs('传统')).toEqual(['ja', 'zh']);
  });

  it('detects Cyrillic and Latin', () => {
    expect(detectQueryLangs('стол')).toEqual(['ru']);
    expect(detectQueryLangs('table')).toEqual(['en', 'zh']);
  });

  it('returns nothing for empty input', () => {
    expect(detectQueryLangs('   ')).toEqual([]);
  });
});

describe('candidateForms', () => {
  it('uses the real de-inflection table for Japanese, with reasons', () => {
    const forms = candidateForms('ja', '食べた');
    expect(forms.map((f) => f.form)).toContain('食べる');
    expect(forms.find((f) => f.form === '食べる')?.reasons.length).toBeGreaterThan(0);
  });

  it('strips Russian inflectional endings', () => {
    expect(candidateForms('ru', 'столами').map((f) => f.form)).toContain('стол');
  });

  it('strips English plural and participle endings', () => {
    expect(candidateForms('en', 'running').map((f) => f.form)).toContain('runn');
    expect(candidateForms('en', 'tables').map((f) => f.form)).toContain('table');
  });

  it('refuses to strip a stem into nothing', () => {
    // 'is' must not become '' — a two-letter query would otherwise match everything.
    expect(candidateForms('en', 'is').map((f) => f.form)).toEqual(['is']);
  });

  it('leaves Chinese alone — there is nothing to de-inflect', () => {
    expect(candidateForms('zh', '传统')).toEqual([{ form: '传统', reasons: [] }]);
  });

  it('normalizes width and case', () => {
    expect(normalizeForLookup('Ｔａｂｌｅ')).toBe('table');
  });
});

describe('one code path, four languages', () => {
  it('Japanese by kanji', () => {
    const out = lookup(db, { text: '食べる' });
    expect(out.entries[0].text).toBe('食べる');
    expect(out.entries[0].via).toBe('exact');
    expect(out.entries[0].senses[0].glosses[0].text).toBe('to eat');
  });

  it('Japanese by kana reading', () => {
    const out = lookup(db, { text: 'たべる' });
    expect(out.entries.map((e) => e.text)).toContain('食べる');
  });

  it('Japanese conjugated, with the chain reported', () => {
    const out = lookup(db, { text: '食べた' });
    const hit = out.entries.find((e) => e.text === '食べる');
    expect(hit).toBeDefined();
    expect(hit?.via).toBe('deinflected');
    expect(hit?.reasons?.length).toBeGreaterThan(0);
  });

  it('Chinese by simplified headword', () => {
    const out = lookup(db, { text: '传统' });
    expect(out.entries[0].text).toBe('传统');
    expect(out.entries[0].senses[0].glosses.map((g) => g.text)).toEqual(['tradition', 'traditional']);
  });

  it('Chinese by traditional headword, resolving through variant_of', () => {
    // 傳統 carries no senses of its own. Without the variant hop this returns an
    // entry with an empty sense list, which reads to a user as "no definition".
    const out = lookup(db, { text: '傳統' });
    const hit = out.entries.find((e) => e.text === '傳統');
    expect(hit?.via).toBe('variant');
    expect(hit?.senses[0].glosses.map((g) => g.text)).toEqual(['tradition', 'traditional']);
  });

  it('Chinese by toneless pinyin, which is what a learner types', () => {
    expect(lookup(db, { text: 'chuan tong' }).entries.map((e) => e.text)).toContain('传统');
    expect(lookup(db, { text: 'chuantong' }).entries.map((e) => e.text)).toContain('传统');
  });

  it('English → Japanese, the direction the old store could not answer', () => {
    const out = lookup(db, { text: 'to eat' });
    expect(out.entries.map((e) => e.text)).toContain('食べる');
    expect(out.entries.find((e) => e.text === '食べる')?.via).toBe('gloss');
  });

  it('Russian → Japanese, the same query with the languages swapped', () => {
    const out = lookup(db, { text: 'есть' });
    expect(out.entries.map((e) => e.text)).toContain('食べる');
  });

  it('uses imported irregular inflections that the suffix heuristics cannot derive', () => {
    const headword = db.prepare('select id from headwords where dict_id = ? and norm = ?')
      .get('jmdict-en', '走る') as { id: number };
    db.prepare('insert into inflections (headword_id, form, name, tags) values (?, ?, ?, ?)')
      .run(headword.id, 'went', 'past tense', 'irregular');

    const hit = lookup(db, { text: 'went', sourceLangs: ['ja'] }).entries
      .find((entry) => entry.text === '走る');

    expect(hit).toMatchObject({
      via: 'deinflected',
      reasons: ['past tense', 'irregular'],
    });
  });

  it('preserves every imported analysis for an ambiguous inflection', () => {
    const headword = db.prepare('select id from headwords where dict_id = ? and norm = ?')
      .get('jmdict-en', '走る') as { id: number };
    const insert = db.prepare(
      'insert into inflections (headword_id, form, name, tags) values (?, ?, ?, ?)',
    );
    insert.run(headword.id, 'ran', 'simple past', 'finite,irregular');
    insert.run(headword.id, 'ran', 'past participle', 'finite,irregular');

    const hit = lookup(db, { text: 'ran', sourceLangs: ['ja'] }).entries
      .find((entry) => entry.text === '走る');

    expect(hit).toMatchObject({
      via: 'deinflected',
      reasons: ['simple past', 'finite', 'irregular', 'past participle'],
    });
  });

  it('keeps ambiguous imported analyses in importer order', () => {
    const headword = db.prepare('select id from headwords where dict_id = ? and norm = ?')
      .get('jmdict-en', '走る') as { id: number };
    const insert = db.prepare(
      'insert into inflections (headword_id, form, name, tags) values (?, ?, ?, ?)',
    );
    insert.run(headword.id, 'saw', 'simple past', 'finite');
    insert.run(headword.id, 'saw', 'past participle', 'nonstandard');

    const hit = lookup(db, { text: 'saw', sourceLangs: ['ja'] }).entries
      .find((entry) => entry.text === '走る');

    expect(hit?.reasons).toEqual([
      'simple past',
      'finite',
      'past participle',
      'nonstandard',
    ]);
  });

  it('English → Chinese through the same call', () => {
    expect(lookup(db, { text: 'dog' }).entries.map((e) => e.text)).toContain('狗');
  });
});

describe('gloss language selection — study language and gloss language are separate', () => {
  it('returns every gloss language by default', () => {
    const langs = lookup(db, { text: '食べる' }).entries.flatMap((e) => e.senses.flatMap((s) => s.glosses.map((g) => g.lang)));
    expect([...new Set(langs)].sort()).toEqual(['en', 'ru']);
  });

  it('returns English AND Russian when both are asked for — the core any-to-any case', () => {
    const out = lookup(db, { text: '食べる', glossLangs: ['en', 'ru'] });
    const langs = new Set(out.entries.flatMap((e) => e.senses.flatMap((s) => s.glosses.map((g) => g.lang))));
    expect([...langs].sort()).toEqual(['en', 'ru']);
  });

  it('filters to one gloss language when asked', () => {
    const out = lookup(db, { text: '食べる', glossLangs: ['ru'] });
    const langs = new Set(out.entries.flatMap((e) => e.senses.flatMap((s) => s.glosses.map((g) => g.lang))));
    expect([...langs]).toEqual(['ru']);
  });

  it('drops a sense whose every gloss was filtered out, rather than returning an empty bullet', () => {
    const out = lookup(db, { text: '走る', glossLangs: ['ru'] });
    const empty = out.entries.filter((e) => e.senses.some((s) => s.glosses.length === 0));
    expect(empty).toEqual([]);
  });

  it('drops a headword whose every sense was filtered out, rather than returning an empty card', () => {
    const out = lookup(db, { text: '走る', glossLangs: ['ru'] });
    expect(out.entries).toEqual([]);
  });
});

describe('ranking and shape', () => {
  it('ranks the preferred dictionary before a higher-scored lower-priority source', () => {
    db.prepare('update headwords set score = 1 where dict_id = ? and norm = ?')
      .run('jmdict-en', '食べる');
    const out = lookup(db, { text: '食べる' });
    expect(out.entries.slice(0, 2).map((entry) => ({
      source: entry.dictId,
      priority: entry.dictionaryPriority,
      score: entry.score,
    }))).toEqual([
      { source: 'jmdict-en', priority: 0, score: 1 },
      { source: 'jmdict-ru', priority: 1, score: 5 },
    ]);
  });

  it('puts an exact match before a prefix match', () => {
    const out = lookup(db, { text: '食べ' });
    const exactIdx = out.entries.findIndex((e) => e.via === 'exact');
    const prefixIdx = out.entries.findIndex((e) => e.via === 'prefix');
    if (exactIdx >= 0 && prefixIdx >= 0) expect(exactIdx).toBeLessThan(prefixIdx);
    expect(out.entries.map((e) => e.text)).toContain('食べ物');
  });

  it('returns the same order twice — an unstable sort reshuffles the UI per keystroke', () => {
    const a = lookup(db, { text: '食べる' }).entries.map((e) => e.headwordId);
    const b = lookup(db, { text: '食べる' }).entries.map((e) => e.headwordId);
    expect(a).toEqual(b);
  });

  it('never returns the same headword twice', () => {
    const ids = lookup(db, { text: '食べる' }).entries.map((e) => e.headwordId);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('names the dictionary each entry came from, which CC BY-SA requires', () => {
    const out = lookup(db, { text: '食べる' });
    expect(out.entries.map((e) => e.dictTitle)).toContain('JMdict (English)');
    expect(out.entries.map((e) => e.dictTitle)).toContain('JMdict (Russian)');
  });

  it('honours the limit', () => {
    expect(lookup(db, { text: '食', limit: 1 }).entries).toHaveLength(1);
  });

  it('skips the reverse direction when asked', () => {
    expect(lookup(db, { text: 'to eat', headwordsOnly: true }).entries).toEqual([]);
  });

  it('returns an empty result rather than throwing on empty input', () => {
    expect(lookup(db, { text: '   ' })).toEqual({ query: '', detectedLangs: [], entries: [] });
  });

  it('ignores a disabled dictionary', () => {
    db.prepare('update dictionaries set enabled = 0 where id = ?').run('jmdict-ru');
    const langs = lookup(db, { text: '食べる' }).entries.flatMap((e) => e.senses.flatMap((s) => s.glosses.map((g) => g.lang)));
    expect([...new Set(langs)]).toEqual(['en']);
  });
});

describe('FTS query escaping', () => {
  it('quotes a query so punctuation cannot be read as an operator', () => {
    expect(ftsQuery('to run (away)')).toBe('"to run (away)"');
    expect(ftsQuery('say "hi"')).toBe('"say ""hi"""');
  });

  it('survives queries that are bare FTS5 operators', () => {
    // Unescaped, each of these throws `fts5: syntax error` and the lookup 500s.
    for (const text of ['AND', 'OR', 'NOT', 'a - b', 'x:y', '*', '(', '"']) {
      expect(() => lookup(db, { text })).not.toThrow();
    }
  });

  it('finds a gloss containing punctuation', () => {
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'punct', title: 'Punct', priority: 9 }),
      terms: { 逃げる: [{ word: '逃げる', reading: 'にげる', score: 0, senses: [{ partsOfSpeech: [], definitions: ['to run (away)'], tags: [] }] }] },
    });
    expect(lookup(db, { text: 'to run (away)' }).entries.map((e) => e.text)).toContain('逃げる');
  });
});
