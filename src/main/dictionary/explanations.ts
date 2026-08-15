// Read and write the stored explanation of a word.
//
// Pure with respect to Electron: everything takes the `SqliteDb` handle, so the
// tests run against the real engine on a temp file rather than a mock.
//
// The key and the reason for its shape are in `shared/lexiconExplanations.ts`
// and in migration 12. In one line: an explanation is keyed on language +
// normalised written form + normalised reading + prose language + model + prompt
// version, never on `headwords.id`, which a re-import reassigns to another word.

import type { SqliteDb } from './db';
import { normalizeForLookup } from './dictService';
import {
  EXPLANATION_MAX_ROWS,
  explanationIsEmpty,
  normalizeExplanationKey,
  parseStoredExplanation,
  serializeExplanation,
  type LexiconExplanation,
  type LexiconExplanationInput,
  type LexiconExplanationKey,
} from '../../shared/lexiconExplanations';

interface ExplanationRow {
  text: string;
  reading: string | null;
  json: string;
  created_at: number;
}

interface StorageKey {
  lang: string;
  norm: string;
  readingNorm: string;
  glossLang: string;
  model: string;
  promptVersion: number;
}

/**
 * The stored key for one explanation.
 *
 * `normalizeForLookup` for the written form rather than the shared helper, for
 * the reason `noteKey` gives: it is the rule `headwords.norm` is built with, so
 * calling the index's own function here means the two cannot drift apart
 * silently. The reading goes through the shared helper because no headword
 * column is being matched — it is only part of the key.
 */
export function explanationKey(key: LexiconExplanationKey): StorageKey | null {
  const lang = key.lang.trim().toLowerCase();
  const norm = normalizeForLookup(key.text);
  const glossLang = key.glossLang.trim().toLowerCase();
  const model = key.model.trim();
  if (!lang || !norm || !glossLang || !model) return null;
  return {
    lang,
    norm,
    readingNorm: normalizeExplanationKey(key.reading ?? ''),
    glossLang,
    model,
    promptVersion: Math.max(0, Math.floor(key.promptVersion)),
  };
}

const KEY_COLUMNS = `
  lang = ? and norm = ? and reading_norm = ?
  and gloss_lang = ? and model = ? and prompt_version = ?
`;

function keyParams(stored: StorageKey): [string, string, string, string, string, number] {
  return [stored.lang, stored.norm, stored.readingNorm, stored.glossLang, stored.model, stored.promptVersion];
}

/**
 * The stored explanation for this key, or `null` when there is none.
 *
 * A row whose payload does not describe the word it was read for is deleted
 * rather than returned. That cannot happen through this module's own writer, and
 * it is exactly what a database carried across a schema rewind or edited by hand
 * would look like — so the cache heals instead of rendering someone else's word
 * under this one's heading. The same delete covers a payload that no longer
 * parses at all.
 */
export function readStoredExplanation(db: SqliteDb, key: LexiconExplanationKey): LexiconExplanation | null {
  const stored = explanationKey(key);
  if (!stored) return null;
  const row = db
    .prepare(`select text, reading, json, created_at from explanations where ${KEY_COLUMNS}`)
    .get(...keyParams(stored)) as ExplanationRow | undefined;
  if (!row) return null;
  const parsed = parseStoredExplanation(
    { ...key, reading: key.reading ?? '' },
    row.json,
    Number(row.created_at) || 0,
  );
  if (!parsed) {
    db.prepare(`delete from explanations where ${KEY_COLUMNS}`).run(...keyParams(stored));
    return null;
  }
  return parsed;
}

/**
 * Store an answer, or remove the stored one when the answer is empty.
 *
 * Returns the explanation as stored, or `null` when there is now none — the
 * caller renders that return value, so "cached" and "cleared" are the same round
 * trip and the surface can never show an explanation the database does not have.
 *
 * Delete-then-insert rather than an upsert, matching `writeUserNote`: two
 * statements in one transaction state the key once instead of restating it as a
 * conflict target that has to match the index exactly.
 */
export function writeStoredExplanation(
  db: SqliteDb,
  key: LexiconExplanationKey,
  input: LexiconExplanationInput,
  now: number = Date.now(),
): LexiconExplanation | null {
  const stored = explanationKey(key);
  if (!stored) return null;
  const remove = db.prepare(`delete from explanations where ${KEY_COLUMNS}`);
  const insert = db.prepare(`
    insert into explanations
      (lang, text, norm, reading, reading_norm, gloss_lang, model, prompt_version, json, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const empty = explanationIsEmpty(input);
  const identity = {
    lang: stored.lang,
    text: key.text.trim(),
    reading: (key.reading ?? '').trim(),
  };
  const result: LexiconExplanation | null = empty ? null : {
    ...key,
    ...identity,
    glossLang: stored.glossLang,
    model: stored.model,
    promptVersion: stored.promptVersion,
    summary: input.summary,
    sections: [...input.sections],
    createdAt: Math.max(0, Math.floor(now)),
  };

  db.transaction(() => {
    remove.run(...keyParams(stored));
    if (!result) return;
    insert.run(
      stored.lang,
      identity.text,
      stored.norm,
      identity.reading,
      stored.readingNorm,
      stored.glossLang,
      stored.model,
      stored.promptVersion,
      serializeExplanation(identity, input),
      result.createdAt,
    );
    evictOldestExplanations(db);
  })();

  return result;
}

/**
 * Trim the cache back to `EXPLANATION_MAX_ROWS`, oldest first.
 *
 * Called inside the write transaction so the ceiling holds after every insert
 * rather than at some later sweep nothing triggers. `rowid` is the tiebreak, so
 * two rows written in the same millisecond still evict in a defined order — with
 * `created_at` alone the `limit` would pick arbitrarily and the count could come
 * out one short.
 */
function evictOldestExplanations(db: SqliteDb): void {
  const total = Number(
    (db.prepare('select count(*) as n from explanations').get() as { n: number } | undefined)?.n ?? 0,
  );
  const excess = total - EXPLANATION_MAX_ROWS;
  if (excess <= 0) return;
  db.prepare(`
    delete from explanations where rowid in (
      select rowid from explanations order by created_at asc, rowid asc limit ?
    )
  `).run(excess);
}

/**
 * Forget every stored explanation of one word, across prose languages, models
 * and prompt versions.
 *
 * The reversal the surface needs: "this explanation is wrong" is about the word,
 * not about the one model/language pair that happens to be on screen. Returns
 * how many rows went, so the surface can say the cache was already empty rather
 * than claiming a deletion that did nothing.
 */
export function clearStoredExplanations(db: SqliteDb, lang: string, text: string, reading: string): number {
  const langKey = lang.trim().toLowerCase();
  const norm = normalizeForLookup(text);
  if (!langKey || !norm) return 0;
  return db
    .prepare('delete from explanations where lang = ? and norm = ? and reading_norm = ?')
    .run(langKey, norm, normalizeExplanationKey(reading ?? '')).changes;
}

/** How many explanations this installation is holding. Used by the settings surface. */
export function countStoredExplanations(db: SqliteDb): number {
  return Number(
    (db.prepare('select count(*) as n from explanations').get() as { n: number } | undefined)?.n ?? 0,
  );
}
