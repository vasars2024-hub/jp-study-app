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
// Deliberately *not* here: `char_sources`. Its projection into `chars` is pinned
// to `'ja'` (`importers/kanjidic.ts`), so relabelling a character source needs
// the projection rebuilt for the characters it owned, and that needs the affected
// characters captured *before* the update. The caller that has that context does
// it; step 7 never touches a character source, because only the KANJIDIC
// importer writes `char_sources` rows and it is not a bundled legacy store.

import type { SqliteDb } from './db';

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
