// @vitest-environment node
//
// The claim under test: `freq_corpora` finally has a reader. The table has been
// in the schema since v1 with an index built for exactly this probe, a writer in
// the legacy migration and a relabeller in `sourceLang.ts` — and nothing that
// ever read a row back.
//
// Against the real better-sqlite3 the app ships, like the rest of the dictionary
// database tests: `indexed by idx_freq_norm` is a claim only the real planner can
// falsify, and a stub would answer whatever it was told to.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { closeDictionaryDb, openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  findLexiconFrequency,
  findLexiconFrequencyRanks,
  normalizeForLookup,
} from '../dictionary/dictService';

let db: SqliteDb;

/** One corpus, which is a `dictionaries` row like every other source. */
function seedCorpus(id: string, title: string, opts: { enabled?: number; priority?: number } = {}): void {
  db.prepare(`
    insert into dictionaries (id, title, source_lang, target_langs, enabled, priority)
    values (?, ?, 'ja', 'en', ?, ?)
  `).run(id, title, opts.enabled ?? 1, opts.priority ?? 0);
}

function seedRank(
  corpus: string,
  text: string,
  rank: number,
  opts: { lang?: string; perMillion?: number | null } = {},
): void {
  db.prepare(`
    insert into freq_corpora (lang, norm, corpus, rank, per_million) values (?, ?, ?, ?, ?)
  `).run(opts.lang ?? 'ja', normalizeForLookup(text), corpus, rank, opts.perMillion ?? null);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-frequency-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  if (db && db.open) db.close();
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('reading a word out of the frequency corpora', () => {
  it('answers with the corpus title and rank, not the raw corpus id', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '猫', 1_204, { perMillion: 8.25 });
    const result = findLexiconFrequency(db, { text: '猫' });
    expect(result.entries).toEqual([
      { corpusId: 'bccwj', corpusTitle: 'BCCWJ frequency', rank: 1_204, perMillion: 8.25 },
    ]);
    expect(result.band).toBe('veryCommon');
  });

  it('says nothing at all for a word no installed corpus ranks', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '猫', 12);
    // Not "rare": an absent row means nobody measured, which is a different claim.
    expect(findLexiconFrequency(db, { text: '胼胝' })).toEqual({ query: '胼胝', entries: [] });
  });

  it('finds a word no dictionary defines, which is when a frequency list matters most', () => {
    // Deliberately no `headwords` row anywhere: the probe is on `freq_corpora`
    // alone, and going via headwords would have dropped this entirely.
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', 'ゆゑ', 40_100);
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
    expect(findLexiconFrequency(db, { text: 'ゆゑ' }).band).toBe('rare');
  });

  it('matches the same normalised form the lookup index is built with', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', 'ネコ', 300);
    // Full-width/`NFKC` folding, so the query need not be spelled the same way.
    expect(findLexiconFrequency(db, { text: 'ネコ' }).entries).toHaveLength(1);
  });

  it('keeps a corpus the user switched off out of the answer', () => {
    seedCorpus('on', 'Enabled corpus');
    seedCorpus('off', 'Disabled corpus', { enabled: 0 });
    seedRank('on', '猫', 900);
    seedRank('off', '猫', 3);
    const result = findLexiconFrequency(db, { text: '猫' });
    expect(result.entries.map((row) => row.corpusId)).toEqual(['on']);
    // And the band follows the corpora that actually spoke, not the silenced one.
    expect(result.band).toBe('veryCommon');
  });

  it('narrows to the languages asked for, so a Han word is not answered in both', () => {
    seedCorpus('ja-corpus', 'Japanese corpus');
    seedCorpus('zh-corpus', 'Chinese corpus');
    seedRank('ja-corpus', '生物', 4_000, { lang: 'ja' });
    seedRank('zh-corpus', '生物', 2_000, { lang: 'zh' });
    expect(findLexiconFrequency(db, { text: '生物', sourceLangs: ['ja'] }).entries)
      .toEqual([{ corpusId: 'ja-corpus', corpusTitle: 'Japanese corpus', rank: 4_000 }]);
    // No language filter means every corpus, ordered by rank.
    expect(findLexiconFrequency(db, { text: '生物' }).entries.map((row) => row.rank))
      .toEqual([2_000, 4_000]);
  });

  it('gives one corpus one row when it ranks two spellings that normalise together', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '全て', 800);
    db.prepare(`
      insert into freq_corpora (lang, norm, corpus, rank, per_million) values ('ja', ?, 'bccwj', 120, null)
    `).run(normalizeForLookup('全て'));
    const result = findLexiconFrequency(db, { text: '全て' });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rank).toBe(120);
  });

  it('leaves per-million absent rather than reporting a word as occurring zero times', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '猫', 400, { perMillion: null });
    expect(findLexiconFrequency(db, { text: '猫' }).entries[0]).not.toHaveProperty('perMillion');
  });

  it('falls back to the corpus id when the source row has no usable title', () => {
    db.prepare(`
      insert into dictionaries (id, title, source_lang, target_langs, enabled) values ('raw', '  ', 'ja', 'en', 1)
    `).run();
    seedRank('raw', '猫', 50);
    expect(findLexiconFrequency(db, { text: '猫' }).entries[0].corpusTitle).toBe('raw');
  });

  it('answers an empty query without touching the database', () => {
    expect(findLexiconFrequency(db, { text: '   ' })).toEqual({ query: '', entries: [] });
  });

  it('serves the probe from idx_freq_norm rather than scanning the table', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '猫', 12);
    const plan = db.prepare(`
      explain query plan
      select f.corpus, f.rank, f.per_million, d.title as corpus_title
      from freq_corpora f indexed by idx_freq_norm
      join dictionaries d on d.id = f.corpus
      where f.norm = ? and d.enabled = 1
      order by d.priority desc
      limit ?
    `).all('猫', 64) as Array<{ detail: string }>;
    const detail = plan.map((row) => row.detail).join(' | ');
    expect(detail).toContain('idx_freq_norm');
    expect(detail).not.toContain('SCAN freq_corpora');
  });
});

// The Deck Workbench needs a rank per note before it can filter on one, and one
// statement per word would be thousands of them on the main thread.
describe('ranking a whole page of words in one pass', () => {
  it('returns the best rank per word and omits the words nothing ranks', () => {
    seedCorpus('bccwj', 'BCCWJ frequency', { priority: 5 });
    seedCorpus('novels', 'Novel corpus', { priority: 1 });
    seedRank('bccwj', '猫', 1_204);
    seedRank('novels', '猫', 880);
    seedRank('bccwj', '食べる', 312);
    const ranks = findLexiconFrequencyRanks(db, ['猫', '食べる', '胼胝']);
    // Best rank, not the highest-priority corpus's: this answers "how common",
    // and the most confident answer is the one that ranks the word highest.
    expect(ranks.get('猫')).toBe(880);
    expect(ranks.get('食べる')).toBe(312);
    expect(ranks.has('胼胝')).toBe(false);
  });

  it('does not let a disabled corpus speak, exactly like the single-word read', () => {
    seedCorpus('off', 'Switched off', { enabled: 0 });
    seedRank('off', '猫', 5);
    expect(findLexiconFrequencyRanks(db, ['猫']).size).toBe(0);
  });

  it('keys the answer by the term the caller asked, not by the normalized form', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', 'ネコ', 700);
    // NFKC folds half-width katakana onto full-width, so both spellings hit the
    // same row — and each still comes back under the spelling the caller used,
    // which is the one the note's field actually holds.
    const ranks = findLexiconFrequencyRanks(db, ['ネコ', 'ﾈｺ']);
    expect(ranks.get('ネコ')).toBe(700);
    expect(ranks.get('ﾈｺ')).toBe(700);
  });

  it('drops blanks and prose rather than probing with them', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    seedRank('bccwj', '猫', 12);
    const ranks = findLexiconFrequencyRanks(db, ['', '   ', '猫']);
    expect([...ranks.keys()]).toEqual(['猫']);
  });

  it('answers a batch far larger than one SQL variable chunk', () => {
    seedCorpus('bccwj', 'BCCWJ frequency');
    const terms = Array.from({ length: 950 }, (_, i) => `w${i}`);
    for (const term of terms) seedRank('bccwj', term, terms.indexOf(term) + 1);
    const ranks = findLexiconFrequencyRanks(db, terms);
    expect(ranks.size).toBe(950);
    expect(ranks.get('w0')).toBe(1);
    expect(ranks.get('w949')).toBe(950);
  });
});
