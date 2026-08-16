// Glossary data carried over from a second deck —
// ANKI_DECK_WORKBENCH_PLAN.md smart recipe 14, "merge glossary data from a
// secondary deck without overwriting stronger fields".
//
// The recipe's whole weight is on the last five words. A merge that simply
// copies the secondary deck over the primary one is `copy-field` across two
// drafts and needs no module; what makes this a recipe is that the destination
// may already hold something *better* than what arrives, and the batch has to
// know the difference without asking a human 3,000 times.
//
// Four rules the rest of the slice depends on:
//
// **Strength is a stated order, not a score.** Attributed beats unattributed,
// then more senses, then more text — compared in that order, first difference
// wins, and the component that decided is returned so the surface can say
// *why* a value was kept. A single opaque number would let two incomparable
// things ("has provenance" and "is 4 characters longer") cancel out silently.
//
// **A tie keeps the destination.** Equal strength is not a reason to write:
// churning 3,000 fields to the same-strength text costs a re-export and a sync
// and buys nothing. `kept-equal` is reported so the run does not look like it
// skipped those notes for an unknown reason.
//
// **A key that maps to two disagreeing entries is refused, never resolved.**
// If the secondary deck holds 猫 twice with different meanings, no rule here
// knows which the user meant; recipe 9 exists precisely because that deck needs
// deduplicating first. Two entries that *agree* on every merged field are not
// ambiguous — they are the same fact written twice — so they collapse.
//
// **Sense merging refuses markup rather than splitting it.** `merge-senses`
// splits on `;`, and `&nbsp;` ends in a semicolon that is not a sense boundary
// while `<span style="a;b">` holds one inside an attribute. Both would corrupt
// the field, so a value carrying `<` or `&` is refused by name and the other
// two modes still work on it.

import type { AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import { normalizeDuplicateKey } from './ankiDuplicates';
import { readEnrichProvenance } from './ankiEnrich';

/**
 * `fill-empty` writes only where the destination is blank — the conservative
 * default, and the only mode that cannot lose text. `prefer-stronger` may
 * overwrite, but only when the incoming value wins the strength order outright.
 * `merge-senses` keeps both, appending the senses the destination lacks.
 */
export type GlossaryMergeMode = 'fill-empty' | 'prefer-stronger' | 'merge-senses';

/** Which component of the strength order decided. See the header. */
export type GlossaryStrengthReason = 'provenance' | 'senses' | 'length';

/** What one destination field pair resolved to. */
export type GlossaryFieldOutcome =
  /** The incoming value (or the merged union) goes in. */
  | 'write'
  /** `fill-empty`: the destination already holds text, so nothing was tried. */
  | 'kept-occupied'
  /** `prefer-stronger`: the destination won the order. `strongerBy` says where. */
  | 'kept-stronger'
  /** `prefer-stronger`: neither won. The destination stays — see the header. */
  | 'kept-equal'
  /** The secondary deck has this field but it is blank on the matched entry. */
  | 'source-empty'
  /** `merge-senses`: every incoming sense is already present. */
  | 'nothing-to-add'
  /** `merge-senses`: a value carries markup or an entity. See the header. */
  | 'html-refused';

export interface GlossaryFieldDecision {
  outcome: GlossaryFieldOutcome;
  /** The raw value to write. Present only for `write`. */
  value?: string;
  /** Present only for `kept-stronger`. */
  strongerBy?: GlossaryStrengthReason;
}

/** One row of the secondary deck, reduced to what a merge reads. */
export interface GlossaryEntry {
  /** `normalizeDuplicateKey` of the key field. Never empty. */
  key: string;
  /** Lower-cased source field name -> raw value, for the requested fields only. */
  values: Record<string, string>;
}

export interface GlossarySource {
  /**
   * Proof that the tray action and this payload are the same merge, the device
   * `apply-ai-additions` uses for its batch. Re-picking the secondary deck
   * mints a new id, so a stale tray refuses instead of merging the old file.
   */
  id: string;
  /** The secondary deck's name. Display and provenance only. */
  label: string;
  /** The field its rows are keyed by. */
  keyField: string;
  /** Keyed by `GlossaryEntry.key`. Ambiguous keys are absent — see below. */
  entries: Map<string, GlossaryEntry>;
  /**
   * Keys two or more secondary rows disagreed on. They are **removed** from
   * `entries`: a merge that silently picked one would be a guess, and the count
   * is what tells the user their glossary needs recipe 9 first.
   */
  ambiguousKeys: string[];
  /** Secondary rows whose key field was blank or absent. Never matchable. */
  keylessRows: number;
  /** Rows read, before collapsing duplicates. `entries.size` is what survived. */
  rowsRead: number;
}

export interface BuildGlossarySourceRequest {
  id: string;
  label: string;
  notes: readonly AnkiDraftNote[];
  noteTypes: readonly AnkiDraftNoteType[];
  /** The field the two decks are matched on. */
  keyField: string;
  /** Source-side field names to carry over. Anything else is not read. */
  fieldNames: readonly string[];
}

// ----- strength -----------------------------------------------------------------

/** HTML markup or an entity, either of which makes `;` an unsafe split point. */
const MARKUP = /[<&]/u;

/** The provenance wrapper stripped, tags dropped, whitespace collapsed. */
export function glossaryPlainText(raw: string): string {
  const unwrapped = readEnrichProvenance(raw)?.value ?? raw;
  return unwrapped
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Senses in order, blanks dropped. Splitting on `;` only: a comma separates
 * words *inside* one gloss ("cat, feline") far more often than it separates two
 * senses, so treating it as a boundary would shred every dictionary value.
 */
export function glossarySenses(raw: string): string[] {
  return glossaryPlainText(raw)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export interface GlossaryStrength {
  /** Carries a dictionary provenance wrapper — a fact with a named source. */
  attributed: boolean;
  senses: number;
  length: number;
}

export function glossaryStrength(raw: string): GlossaryStrength {
  const senses = glossarySenses(raw);
  return {
    attributed: readEnrichProvenance(raw) !== null,
    senses: senses.length,
    length: glossaryPlainText(raw).length,
  };
}

/**
 * The component `a` beats `b` on, or `null` when `a` does not win. Not a
 * comparator: the caller needs the reason, and "b wins" is asked by swapping
 * the arguments. See the header for why the order is fixed rather than scored.
 */
export function glossaryStrengthWinner(
  a: GlossaryStrength,
  b: GlossaryStrength,
): GlossaryStrengthReason | null {
  if (a.attributed !== b.attributed) return a.attributed ? 'provenance' : null;
  if (a.senses !== b.senses) return a.senses > b.senses ? 'senses' : null;
  if (a.length !== b.length) return a.length > b.length ? 'length' : null;
  return null;
}

// ----- the per-field decision ---------------------------------------------------

/**
 * What one field pair does, given what the destination holds and what the
 * secondary deck offers. Pure and total: every mode answers for every pair of
 * values, and the outcomes partition.
 */
export function decideGlossaryField(
  current: string,
  incoming: string,
  mode: GlossaryMergeMode,
): GlossaryFieldDecision {
  const incomingText = glossaryPlainText(incoming);
  if (incomingText === '') return { outcome: 'source-empty' };
  const currentText = glossaryPlainText(current);

  if (mode === 'fill-empty') {
    return currentText === '' ? { outcome: 'write', value: incoming } : { outcome: 'kept-occupied' };
  }

  if (mode === 'merge-senses') {
    // A blank destination is a plain write in every mode: there are no senses to
    // preserve and no markup of the destination's to protect.
    if (currentText === '') return { outcome: 'write', value: incoming };
    if (MARKUP.test(current) || MARKUP.test(incoming)) return { outcome: 'html-refused' };
    const kept = glossarySenses(current);
    const seen = new Set(kept.map((s) => normalizeDuplicateKey(s)));
    const added = glossarySenses(incoming).filter((s) => {
      const key = normalizeDuplicateKey(s);
      if (key === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (added.length === 0) return { outcome: 'nothing-to-add' };
    return { outcome: 'write', value: [...kept, ...added].join('; ') };
  }

  if (currentText === '') return { outcome: 'write', value: incoming };
  const mine = glossaryStrength(current);
  const theirs = glossaryStrength(incoming);
  const theirsWins = glossaryStrengthWinner(theirs, mine);
  if (theirsWins) return { outcome: 'write', value: incoming };
  const mineWins = glossaryStrengthWinner(mine, theirs);
  return mineWins
    ? { outcome: 'kept-stronger', strongerBy: mineWins }
    : { outcome: 'kept-equal' };
}

// ----- building the source ------------------------------------------------------

function fieldRaw(
  note: AnkiDraftNote,
  fieldName: string,
  declared: ReadonlySet<string> | undefined,
): string | null {
  const lower = fieldName.toLowerCase();
  // The note type is what decides the field exists; a value row missing from
  // this note is an empty field, not an absent one.
  if (declared && !declared.has(lower)) return null;
  const value = note.fields.find((f) => f.name.toLowerCase() === lower);
  if (value) return value.raw;
  return declared ? '' : null;
}

/**
 * Reduce a secondary draft to the rows a merge can match against. Duplicate
 * keys collapse when they agree on every requested field and are refused when
 * they do not — see the header.
 */
export function buildGlossarySource(request: BuildGlossarySourceRequest): GlossarySource {
  const declaredByType = new Map<string, Set<string>>(
    request.noteTypes.map((nt) => [nt.id, new Set(nt.fields.map((f) => f.name.toLowerCase()))]),
  );
  const wanted = request.fieldNames.map((name) => name.toLowerCase());
  const entries = new Map<string, GlossaryEntry>();
  const ambiguous = new Set<string>();
  let keylessRows = 0;

  for (const note of request.notes) {
    const declared = declaredByType.get(note.noteTypeId);
    const keyRaw = fieldRaw(note, request.keyField, declared);
    const key = keyRaw === null ? '' : normalizeDuplicateKey(glossaryPlainText(keyRaw));
    if (key === '') {
      keylessRows += 1;
      continue;
    }
    const values: Record<string, string> = {};
    for (const name of wanted) {
      const raw = fieldRaw(note, name, declared);
      if (raw !== null && raw !== '') values[name] = raw;
    }
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, { key, values });
      continue;
    }
    if (ambiguous.has(key)) continue;
    const names = new Set([...Object.keys(existing.values), ...Object.keys(values)]);
    // Agreement is compared on the plain text, not the raw: the same gloss
    // wrapped in provenance by one deck and bare in the other is one fact.
    const agrees = [...names].every(
      (name) => glossaryPlainText(existing.values[name] ?? '') === glossaryPlainText(values[name] ?? ''),
    );
    if (agrees) {
      // Keep the stronger raw of the two, per field, so a collapse never drops
      // the attributed copy in favour of the bare one.
      for (const name of names) {
        const mine = existing.values[name] ?? '';
        const other = values[name] ?? '';
        if (other !== '' && glossaryStrengthWinner(glossaryStrength(other), glossaryStrength(mine))) {
          existing.values[name] = other;
        }
      }
      continue;
    }
    ambiguous.add(key);
    entries.delete(key);
  }

  return {
    id: request.id,
    label: request.label,
    keyField: request.keyField,
    entries,
    ambiguousKeys: [...ambiguous],
    keylessRows,
    rowsRead: request.notes.length,
  };
}

/** The entry a destination note matches, or why it matched nothing. */
export type GlossaryMatch =
  | { matched: true; entry: GlossaryEntry }
  | { matched: false; reason: 'key-empty' | 'key-ambiguous' | 'unmatched'; key: string };

export function matchGlossaryEntry(source: GlossarySource, keyValue: string | null): GlossaryMatch {
  const key = keyValue === null ? '' : normalizeDuplicateKey(glossaryPlainText(keyValue));
  if (key === '') return { matched: false, reason: 'key-empty', key: '' };
  const entry = source.entries.get(key);
  if (entry) return { matched: true, entry };
  return {
    matched: false,
    reason: source.ambiguousKeys.includes(key) ? 'key-ambiguous' : 'unmatched',
    key,
  };
}
