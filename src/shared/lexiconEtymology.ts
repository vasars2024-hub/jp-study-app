/**
 * Where a word came from, as the installed dictionaries themselves state it.
 *
 * The professional-dictionary plan lists etymology among the facts the Lexicon
 * Workbench must show, and the schema has carried an `etymology` table since v1
 * with **no writer and no reader**. The Wiktextract importer's own header says
 * why it declined to fill it: "writing rows no query consults is how a database
 * grows data that is never wrong because it is never used. Those land with their
 * readers." This module is that reader's contract, and the importer now writes it.
 *
 * Nothing here is generated. Every string shown is a dictionary's own sentence,
 * attributed to the source that supplied it, which is the whole difference
 * between an etymology and a mnemonic.
 */

/** Distinct etymologies shown for one word. Beyond this it is a reading list. */
export const MAX_ETYMOLOGY_RESULTS = 6;

/**
 * A pasted sentence is not a headword, and the probe below is an indexed equality
 * on `headwords.norm` — so a long query can only ever miss. Same bound as the
 * compound expansion, for the same reason.
 */
export const MAX_ETYMOLOGY_QUERY_CHARS = 16;

export interface LexiconEtymology {
  /** The language of the headword this etymology belongs to, not of the prose. */
  lang: string;
  /** The dictionary's own text, verbatim. */
  text: string;
  dictId: string;
  dictTitle: string;
  /**
   * The part of speech the source filed this etymology under, when it has one.
   *
   * Wiktionary routinely gives a word two unrelated origins under two parts of
   * speech, and collapsing those into one paragraph would assert a shared origin
   * the source never claimed.
   */
  pos?: string;
}

export interface LexiconEtymologyResult {
  query: string;
  etymologies: LexiconEtymology[];
}

/**
 * Collapse whitespace so two spellings of the same paragraph compare equal.
 *
 * Not `normalizeForLookup`: this is prose, and case-folding it would merge an
 * etymology that opens on a proper noun with one that does not. Only layout
 * differences are erased.
 */
export function normalizeEtymologyText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Choose the etymologies worth showing, in the order the rows arrived.
 *
 * A Wiktextract dump emits one record per word *per part of speech*, and the
 * etymology paragraph is repeated on every one of them — 犬 comes back with the
 * identical sentence under noun and under affix. Showing it twice would read as
 * two independent attestations of the same claim. Deduplication is on the text
 * alone rather than on text+pos, because the first row keeps its `pos` and the
 * duplicate that a second part of speech contributes carries no new information.
 *
 * Row order is the caller's: dictionary priority, then insertion. That is the
 * same precedence every other lookup surface uses, so the source a user ranked
 * first speaks first here too.
 */
export function selectLexiconEtymologies(
  rows: LexiconEtymology[],
  limit = MAX_ETYMOLOGY_RESULTS,
): LexiconEtymology[] {
  const seen = new Set<string>();
  const chosen: LexiconEtymology[] = [];
  for (const row of rows) {
    const text = normalizeEtymologyText(row.text);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    chosen.push({ ...row, text });
    if (chosen.length >= limit) break;
  }
  return chosen;
}
