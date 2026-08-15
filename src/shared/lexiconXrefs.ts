/**
 * The words a dictionary points at from a sense: synonyms, antonyms, "see also".
 *
 * `xrefs` is the third of the v1 tables that shipped with a schema, an index and
 * neither a writer nor a reader — the Wiktextract importer's header names it
 * explicitly and declines to fill it, on the rule that "writing rows no query
 * consults is how a database grows data that is never wrong because it is never
 * used. Those land with their readers." This module is that reader's contract.
 *
 * Nothing here is inferred. A cross reference is shown only because a dictionary
 * stated it, which is the difference between a synonym and a guess at one.
 */

/**
 * The four relations the schema's `xrefs.kind` column documents.
 *
 * Kept as one exported list rather than four literals so the importer's mapping,
 * the reader's validation and the surface's grouping cannot drift apart.
 */
export const LEXICON_XREF_KINDS = ['syn', 'ant', 'see', 'cf'] as const;

export type LexiconXrefKind = (typeof LEXICON_XREF_KINDS)[number];

/** Cross references shown for one word. Past this it is a thesaurus dump. */
export const MAX_XREF_RESULTS = 24;

/**
 * A pasted sentence is not a headword, and the probe is an indexed equality on
 * `headwords.norm` — so a long query can only ever miss. Same bound as the
 * etymology and compound expansions, for the same reason.
 */
export const MAX_XREF_QUERY_CHARS = 16;

/**
 * An xref target longer than this is a sentence, not a word.
 *
 * Link lists routinely carry a parenthetical or a whole usage note where a word
 * belongs. Such a row could never resolve against `headwords.norm`, so it would
 * render as permanently unresolvable text under a "synonyms" heading — worse than
 * being absent, because the surface would look broken rather than empty.
 *
 * Shared rather than per-importer: two writers now produce these rows, and a
 * target one of them accepts and the other rejects is a difference the reader has
 * no way to explain.
 */
export const MAX_XREF_TARGET_CHARS = 32;

export interface LexiconXref {
  kind: LexiconXrefKind;
  /** The target word, verbatim as the dictionary wrote it. */
  text: string;
  /** The language of the sense the reference departs from, not of the target. */
  lang: string;
  dictId: string;
  dictTitle: string;
  /** The part of speech of the sense that stated it, when the source filed one. */
  pos?: string;
  /**
   * Whether `text` is itself a headword in some enabled dictionary.
   *
   * A cross reference is a string, not a foreign key — Wiktionary points at words
   * a given install may simply not have. The surface uses this to decide whether
   * the target is a link or plain text, so that a reference is never dressed as
   * navigable when following it would land on an empty result.
   */
  resolved: boolean;
}

export interface LexiconXrefResult {
  query: string;
  xrefs: LexiconXref[];
}

/**
 * Map a source's own relation word onto one of the four stored kinds.
 *
 * Returns null rather than a default for anything unrecognised. `kind` is what
 * the surface groups and labels by, so filing an unknown relation under `see`
 * would assert a relation the dictionary never claimed — and the schema's four
 * values are the whole vocabulary a reader can render.
 */
export function normalizeXrefKind(raw: string): LexiconXrefKind | null {
  const key = raw.trim().toLowerCase();
  switch (key) {
    case 'syn':
    case 'synonym':
    case 'synonyms':
      return 'syn';
    case 'ant':
    case 'antonym':
    case 'antonyms':
      return 'ant';
    case 'see':
    case 'see_also':
    case 'see also':
      return 'see';
    case 'cf':
    case 'related':
    case 'coordinate_terms':
      return 'cf';
    default:
      return null;
  }
}

/**
 * Collapse whitespace on a target word so two spellings of it compare equal.
 *
 * Deliberately not `normalizeForLookup`: the stored text is displayed verbatim and
 * is also what the resolution probe is built from, so case-folding it here would
 * make the displayed word differ from the word the dictionary wrote.
 */
export function normalizeXrefText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Choose the cross references worth showing, in the order the rows arrived.
 *
 * Deduplication is on **kind + text**, not on text alone. Wiktextract emits one
 * record per part of speech and repeats a sense's synonym list on each, so the
 * same pair arrives several times; but a word genuinely can be listed both as a
 * synonym of one sense and as an antonym of another, and merging those would
 * delete a real distinction rather than a repeat.
 *
 * Row order is the caller's — dictionary priority, then insertion — the same
 * precedence every other lookup surface uses.
 */
export function selectLexiconXrefs(
  rows: LexiconXref[],
  limit = MAX_XREF_RESULTS,
): LexiconXref[] {
  const seen = new Set<string>();
  const chosen: LexiconXref[] = [];
  for (const row of rows) {
    const text = normalizeXrefText(row.text);
    if (!text) continue;
    const key = `${row.kind} ${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push({ ...row, text });
    if (chosen.length >= limit) break;
  }
  return chosen;
}
