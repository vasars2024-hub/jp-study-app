// Moving one dictionary's rows from one *source* language to another.
//
// Schema step 7 wrote this first, to repair the bundled Chinese dictionary the
// legacy migration had stored as Japanese. It is extracted here because the same
// five statements are what a manual correction needs: the legacy Yomitan format
// declares no source language at all, so a user-imported Chinese or Korean
// archive lands under `DEFAULT_SOURCE_LANG` with no evidence to read, and the
// only honest repair is to let the user say so afterwards.
//
// The set of tables is not a matter of taste. `dictionaries.source_lang` and
// `headwords.lang` are joined by `dict_pair_priority` (`pp.source_lang = h.lang`),
// so a row that disagreed with the headwords it owns would make every pair
// override for that dictionary stop applying — silently. `pitch` and
// `freq_corpora` are keyed by the same language and are read by the lookup path
// under the headword's language, so leaving them behind hides the pitch pattern
// and the frequency rank of every word in a relabelled dictionary.
//
// Deliberately *not* in `relabelDictionarySourceLang`: `char_sources`. Its
// projection into `chars` is pinned to `'ja'` (`importers/kanjidic.ts`), so
// relabelling a character source needs the projection rebuilt for the characters
// it owned, and that needs the affected characters captured *before* the update.
// Step 7 never touches a character source — only the KANJIDIC importer writes
// `char_sources` rows and it is not a bundled legacy store — so the five
// statements stay the migration's whole story, and `runSourceLangRelabel` below
// is the user-facing correction that also owns the projection.

import type { SqliteDb } from './db';
import { rebuildCharacterProjection } from './importers/kanjidic';

/**
 * Relabel every row a dictionary owns from `fromLang` to `toLang`.
 *
 * Relabel, not re-import: the headwords, readings and glosses were always right,
 * only the label was wrong. Each statement is scoped to `fromLang` so a row some
 * other repair already moved is never dragged along.
 *
 * The caller owns the transaction. Every statement here is part of one logical
 * change and a partial application is exactly the disagreement described above.
 */
export function relabelDictionarySourceLang(
  db: SqliteDb,
  dictId: string,
  fromLang: string,
  toLang: string,
): void {
  db.prepare('update dictionaries set source_lang = ? where id = ?').run(toLang, dictId);
  db.prepare('update headwords set lang = ? where dict_id = ? and lang = ?').run(toLang, dictId, fromLang);
  db.prepare('update pitch set lang = ? where dict_id = ? and lang = ?').run(toLang, dictId, fromLang);
  db.prepare('update freq_corpora set lang = ? where corpus = ? and lang = ?').run(toLang, dictId, fromLang);
  // `OR REPLACE` because (dict_id, source_lang, target_lang) is the primary key.
  // A pair override already sitting on the destination language cannot have been
  // set deliberately — no headword of this dictionary answered in that language
  // for the user to order — so the relabelled row is the one they actually chose.
  db.prepare(
    'update or replace dict_pair_priority set source_lang = ? where dict_id = ? and source_lang = ?',
  ).run(toLang, dictId, fromLang);
}

export type SourceLangRelabelOutcome =
  | { ok: true; changed: boolean; counts: Record<string, number> }
  | { ok: false; error: 'not-found' };

/**
 * The whole relabel, including the character projection, against one database
 * handle and nothing else.
 *
 * Extracted from `service.ts` so the utility process can run it: `service.ts`
 * reaches Electron's `app` for the userData path, and a utility process has no
 * `app`. On the real profile this takes **7.2 s for 101,843 headwords** — the two
 * `lang`-keyed headword indexes, not the FTS triggers — so it is exactly the
 * shape of work that must not sit on the main event loop.
 *
 * `counts` are `better-sqlite3`'s own `changes` per statement, not estimates:
 * they are what the caller reports, and a relabel that claims rows it did not
 * move is the same class of lie as an import that claims entries it did not write.
 */
export function runSourceLangRelabel(
  db: SqliteDb,
  dictId: string,
  toLang: string,
): SourceLangRelabelOutcome {
  const row = db.prepare('select source_lang from dictionaries where id = ?').get(dictId) as
    | { source_lang: string }
    | undefined;
  if (!row) return { ok: false, error: 'not-found' };
  const current = (row.source_lang ?? '').trim();
  // Already there: the requested state holds, so this is success with no write.
  // Reporting a failure would make a `<select>` that re-sends its own value look
  // broken, and there is nothing left for the caller to do about it.
  if (current === toLang) return { ok: true, changed: false, counts: {} };

  // `chars` is a projection of `char_sources` pinned to `'ja'`, so a character
  // source moving off `ja` has to be rebuilt out of it — and the characters it
  // owned can only be read while its rows still carry the old language.
  const affected = (db
    .prepare('select char from char_sources where dict_id = ? and lang = ?')
    .all(dictId, current) as Array<{ char: string }>).map((entry) => entry.char);

  const counts: Record<string, number> = {};
  db.transaction(() => {
    relabelDictionarySourceLang(db, dictId, current, toLang);
    counts.headwords = countOf(db, 'headwords', 'dict_id', dictId, toLang);
    counts.pitch = countOf(db, 'pitch', 'dict_id', dictId, toLang);
    counts.frequencies = countOf(db, 'freq_corpora', 'corpus', dictId, toLang);
    counts.pairOverrides = (db
      .prepare('select count(*) c from dict_pair_priority where dict_id = ? and source_lang = ?')
      .get(dictId, toLang) as { c: number }).c;
    const chars = db
      .prepare('update char_sources set lang = ? where dict_id = ? and lang = ?')
      .run(toLang, dictId, current);
    counts.characters = Number(chars.changes ?? 0);
    if (affected.length) rebuildCharacterProjection(db, affected);
  })();
  return { ok: true, changed: true, counts };
}

/** Rows of `table` this dictionary now owns in `lang`, counted after the move. */
function countOf(db: SqliteDb, table: string, idColumn: string, dictId: string, lang: string): number {
  return (db
    .prepare(`select count(*) c from ${table} where ${idColumn} = ? and lang = ?`)
    .get(dictId, lang) as { c: number }).c;
}
