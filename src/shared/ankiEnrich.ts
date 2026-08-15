// Dictionary enrichment for the Deck Workbench — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4 ("dictionary enrichment ... require explicit ... conflicting ...
// choices") and its gate 11.
//
// This is the pure half: given the entries a lookup returned for one word, what
// string should go into a field, who said it, and when must the workbench refuse
// rather than choose for the user. Nothing here performs a lookup, reads a
// draft, or writes anything — `ankiChangeTray.ts` owns all three.
//
// Three rules gate 11 turns on:
//
// **A disagreement between dictionaries is a fact, not noise.** Two installed
// dictionaries routinely gloss the same headword differently, and picking the
// first one silently is how a deck ends up asserting a meaning no source it
// names actually gave. `EnrichSenseRule` makes the caller say what a
// disagreement means: take the highest-priority source, take all of them, or
// refuse the note and leave it for a human.
//
// **Provenance is field-level and survives the round trip.** Anki has no
// per-field metadata, so a note-level tag cannot say *which* field came from
// *which* dictionary. Inline provenance is a `<span data-jp-dict="…">` wrapper:
// it is ordinary field HTML, so an APKG export and reimport carries it back
// verbatim, and `readEnrichProvenance` reads it out again. That is the only
// representation here that satisfies "prove field-level provenance after
// export/reimport"; a tag would not.
//
// **An absent gloss is an absence.** A term no dictionary answered writes
// nothing at all. Writing an empty string would erase whatever a previous pass
// put there and report the note as enriched.

/** What an enrichment writes into the destination field. */
export type EnrichAspect = 'reading' | 'meaning' | 'partOfSpeech';

/**
 * What to do when the installed dictionaries disagree about the aspect.
 *
 * There is deliberately no default, for the same reason `FieldCopyConflict` has
 * none: the safe answer depends on whether the user trusts their first
 * dictionary or wants to see the spread, and guessing writes the wrong one into
 * thousands of notes at once.
 */
export type EnrichSenseRule = 'first-source' | 'all-sources' | 'refuse';

/** Whether the written value records who produced it, inside the field itself. */
export type EnrichProvenanceMode = 'inline' | 'none';

/**
 * How many definitions of one sense-set are joined into a field. A JMdict entry
 * for a common verb carries a dozen glosses; a flashcard field holding all of
 * them is unreadable, and a card the user deletes is worse than a shorter one.
 */
export const MAX_ENRICH_DEFINITIONS = 3;

/** What joins several definitions from one source. */
export const ENRICH_DEFINITION_SEPARATOR = '; ';

/** What joins the contributions of several sources under `all-sources`. */
export const ENRICH_SOURCE_SEPARATOR = ' / ';

/**
 * The narrowed view of a dictionary hit this module needs. Deliberately not
 * `DictEntry`: enrichment must not grow a dependency on pitch HTML, JLPT tags or
 * frequency, and a smaller shape is what lets a test state a disagreement in
 * three lines.
 */
export interface EnrichEntry {
  /** The dictionary that produced this entry, or `null` when it cannot be attributed. */
  source: string | null;
  reading: string;
  senses: ReadonlyArray<{
    partsOfSpeech: readonly string[];
    definitions: readonly string[];
  }>;
}

/** Term → the entries a lookup returned for it, in installed-dictionary order. */
export type EnrichLookup = ReadonlyMap<string, readonly EnrichEntry[]>;

export type EnrichRefusal = 'no-entry' | 'no-value' | 'sense-conflict';

export interface EnrichResolution {
  /** The text to write. Never empty — an empty answer is a refusal instead. */
  value: string;
  /**
   * Every dictionary that contributed, ordered and deduplicated, primary first.
   * An entry that could not be attributed contributes nothing here rather than a
   * placeholder name, so a caller can tell "unattributed" from "no source".
   */
  sources: string[];
  /** The sources disagreed and `all-sources` merged them anyway. */
  merged: boolean;
}

/** One value per source, in source order, with duplicates of *value* collapsed. */
interface SourceValue {
  source: string | null;
  value: string;
}

function aspectValue(entry: EnrichEntry, aspect: EnrichAspect): string {
  if (aspect === 'reading') return entry.reading.trim();
  const parts: string[] = [];
  for (const sense of entry.senses) {
    if (aspect === 'partOfSpeech') {
      for (const pos of sense.partsOfSpeech) {
        const clean = pos.trim();
        if (clean && !parts.includes(clean)) parts.push(clean);
      }
    } else {
      for (const definition of sense.definitions) {
        const clean = definition.trim();
        if (clean && !parts.includes(clean)) parts.push(clean);
        if (parts.length >= MAX_ENRICH_DEFINITIONS) break;
      }
    }
    if (aspect === 'meaning' && parts.length >= MAX_ENRICH_DEFINITIONS) break;
  }
  return parts.join(ENRICH_DEFINITION_SEPARATOR);
}

/**
 * Collapse the entries to one value per contributing source.
 *
 * Several entries from one dictionary (homographs, or a de-inflected match
 * alongside the exact one) are one source's answer, so their values are joined
 * rather than treated as a disagreement — a dictionary does not disagree with
 * itself. Sources whose value is identical collapse to one, which is why two
 * dictionaries agreeing is not reported as a conflict.
 */
function valuesBySource(entries: readonly EnrichEntry[], aspect: EnrichAspect): SourceValue[] {
  const order: Array<string | null> = [];
  const bySource = new Map<string | null, string[]>();
  for (const entry of entries) {
    const value = aspectValue(entry, aspect);
    if (!value) continue;
    const bucket = bySource.get(entry.source);
    if (bucket) {
      if (!bucket.includes(value)) bucket.push(value);
    } else {
      order.push(entry.source);
      bySource.set(entry.source, [value]);
    }
  }
  const out: SourceValue[] = [];
  for (const source of order) {
    const value = (bySource.get(source) ?? []).join(ENRICH_DEFINITION_SEPARATOR);
    if (!value) continue;
    // Identical text from two dictionaries is agreement, not a conflict; keep
    // the first source's attribution and drop the duplicate value.
    if (out.some((existing) => existing.value === value)) continue;
    out.push({ source, value });
  }
  return out;
}

/**
 * The value one note's field should receive, or why it should receive nothing.
 *
 * `refuse` returns `sense-conflict` only when the sources genuinely produced
 * different text — a single source, or several that agree, is never a conflict,
 * so the strictest rule still enriches the notes it can and names exactly the
 * ones it cannot.
 */
export function resolveEnrichValue(
  entries: readonly EnrichEntry[] | undefined,
  aspect: EnrichAspect,
  rule: EnrichSenseRule,
): EnrichResolution | { refused: EnrichRefusal } {
  if (!entries || entries.length === 0) return { refused: 'no-entry' };
  const values = valuesBySource(entries, aspect);
  if (values.length === 0) return { refused: 'no-value' };
  if (values.length === 1) {
    const only = values[0];
    return { value: only.value, sources: only.source ? [only.source] : [], merged: false };
  }
  if (rule === 'refuse') return { refused: 'sense-conflict' };
  if (rule === 'first-source') {
    const first = values[0];
    return { value: first.value, sources: first.source ? [first.source] : [], merged: false };
  }
  const sources: string[] = [];
  for (const { source } of values) if (source && !sources.includes(source)) sources.push(source);
  return {
    value: values.map((v) => v.value).join(ENRICH_SOURCE_SEPARATOR),
    sources,
    merged: true,
  };
}

// ----- inline provenance ----------------------------------------------------

/** The attribute the wrapper carries. Read by `readEnrichProvenance`. */
export const ENRICH_PROVENANCE_ATTR = 'data-jp-dict';

/** The class the wrapper carries, so a card template can style or hide it. */
export const ENRICH_PROVENANCE_CLASS = 'jp-dict-src';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Wrap a written value so the field itself records which dictionaries produced
 * it. An unattributed value is returned unwrapped: a wrapper naming nobody is
 * noise in every field of the deck and reads back as a source called "".
 */
export function wrapEnrichProvenance(
  value: string,
  sources: readonly string[],
  mode: EnrichProvenanceMode,
): string {
  if (mode !== 'inline' || sources.length === 0 || !value) return value;
  const attr = escapeAttr(sources.join('|'));
  return (
    `<span class="${ENRICH_PROVENANCE_CLASS}" ${ENRICH_PROVENANCE_ATTR}="${attr}">`
    + `${value}</span>`
  );
}

export interface EnrichProvenanceRead {
  /** The sources named by the outermost wrapper, in written order. */
  sources: string[];
  /** The wrapped text, with the wrapper removed. */
  value: string;
}

/**
 * Read inline provenance back out of a field. Returns `null` when the field
 * carries none, which is the honest answer for hand-typed text and for anything
 * written before enrichment existed.
 *
 * Deliberately a regex over the wrapper this module writes, not an HTML parse:
 * the value may be any markup the dictionary produced, and the round trip that
 * gate 11 has to prove is exactly "what `wrapEnrichProvenance` wrote survives an
 * export and reimport", not "any span anywhere is provenance".
 */
export function readEnrichProvenance(raw: string): EnrichProvenanceRead | null {
  const open = new RegExp(
    `<span class="${ENRICH_PROVENANCE_CLASS}" ${ENRICH_PROVENANCE_ATTR}="([^"]*)">`,
    'u',
  );
  const match = open.exec(raw);
  if (!match) return null;
  const rest = raw.slice(match.index + match[0].length);
  const close = rest.lastIndexOf('</span>');
  if (close < 0) return null;
  const sources = unescapeAttr(match[1])
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  return { sources, value: rest.slice(0, close) };
}
