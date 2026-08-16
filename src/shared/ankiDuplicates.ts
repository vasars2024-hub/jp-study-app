// Duplicate notes and the note that should survive them —
// ANKI_DECK_WORKBENCH_PLAN.md smart recipe 9, "find exact/normalized/near
// duplicates and propose a canonical note".
//
// This module finds and *proposes*. It never deletes: the change tray's
// reversible ops are tags and field text, and "delete these 40 notes" is neither
// reversible from a draft nor something a batch should do on a guess. So the
// deliverable is a group with a named survivor and a stated reason, and the
// action built on it tags the rest.
//
// Three rules the rest of the slice depends on:
//
// **A blank comparison value is never a duplicate of another blank one.** Four
// notes with an empty `Reading` are four notes missing a reading, not a group of
// duplicates with a canonical member. They are returned separately so a caller
// can say so.
//
// **The survivor is chosen by a rule the user can read**, and a tie is reported
// rather than hidden. Note id breaks it so the result is deterministic across
// runs, but `tied: true` says the choice was arbitrary.
//
// **Near mode refuses rather than truncating.** It is quadratic in the worst
// case; the bigram index below keeps real decks near-linear, but a selection
// that would blow past `NEAR_MAX_COMPARISONS` returns `capped: true` and no
// groups. A partial duplicate scan silently missing half the deck is worse than
// no scan, for the same reason a filter that quietly matches everything is.

import type { AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';

/**
 * `exact` compares the field as stored, HTML and all — two notes pasted from the
 * same source. `normalized` compares the search text with case, width and
 * punctuation folded — the same word typed twice. `near` adds a similarity
 * threshold for a rewritten sentence.
 */
export type DuplicateMatchMode = 'exact' | 'normalized' | 'near';

/** Why one note in a group was proposed as the one to keep. */
export type DuplicateCanonicalReason = 'most-filled-fields' | 'longest-content' | 'first-seen';

export interface DuplicateGroup {
  /** The comparison value, for display. Empty for `near`, whose members differ. */
  key: string;
  canonicalNoteId: string;
  /** Every other member, in the order the notes were given. */
  duplicateNoteIds: string[];
  reason: DuplicateCanonicalReason;
  /**
   * The canonical note tied with at least one other on every rule and note id
   * broke it. The group is still returned — the user is told the pick was
   * arbitrary, not denied the finding.
   */
  tied: boolean;
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  /** Notes whose note type has no such field. Not a duplicate, not a blank. */
  fieldAbsentNoteIds: string[];
  /** Notes whose comparison value was empty. Never grouped — see the header. */
  emptyNoteIds: string[];
  /** Pair comparisons `near` actually made. Zero for the two exact modes. */
  comparisons: number;
  /** `near` would have exceeded `NEAR_MAX_COMPARISONS`; `groups` is empty. */
  capped: boolean;
}

export interface DuplicateScanRequest {
  notes: readonly AnkiDraftNote[];
  noteTypes: readonly AnkiDraftNoteType[];
  /** The field compared. There is no "all fields" mode: a duplicate of what? */
  fieldName: string;
  mode: DuplicateMatchMode;
  /**
   * Dice coefficient over character bigrams, `0 < threshold <= 1`. Required for
   * `near` and ignored otherwise — no default, because the threshold *is* the
   * finding and a hidden one would make the same scan mean different things.
   */
  threshold?: number;
  /** Restrict to a selection. Absent = every note given. */
  noteIds?: readonly string[];
}

/** Above this many pair comparisons `near` refuses; see the header. */
export const NEAR_MAX_COMPARISONS = 4_000_000;

// ----- comparison values --------------------------------------------------------

/**
 * Case, width and combining marks folded, every space removed, and the
 * punctuation both scripts use for the same job stripped. Japanese has no word
 * spaces, so collapsing rather than removing whitespace would make `食べ る` and
 * `食べる` different notes.
 */
export function normalizeDuplicateKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    // `\s` already covers U+3000, the ideographic space, which NFKC has folded
    // to a plain space by this line anyway.
    .replace(/\s+/gu, '')
    .replace(/[.,;:!?、。・「」『』（）()[\]{}"'“”‘’…—–\-~〜]/gu, '');
}

function fieldValue(
  note: AnkiDraftNote,
  fieldName: string,
  mode: DuplicateMatchMode,
): string | null {
  const lower = fieldName.toLowerCase();
  const field = note.fields.find((f) => f.name.toLowerCase() === lower);
  if (!field) return null;
  return mode === 'exact' ? field.raw : normalizeDuplicateKey(field.normalized);
}

/** True when the note's own note type declares the field, however it is filled. */
function noteTypeHasField(
  note: AnkiDraftNote,
  byId: ReadonlyMap<string, AnkiDraftNoteType>,
  fieldName: string,
): boolean {
  const lower = fieldName.toLowerCase();
  const type = byId.get(note.noteTypeId);
  return !!type && type.fields.some((f) => f.name.toLowerCase() === lower);
}

// ----- the canonical proposal ---------------------------------------------------

function filledFields(note: AnkiDraftNote): number {
  return note.fields.reduce((n, f) => n + (f.normalized.trim() === '' ? 0 : 1), 0);
}

function contentLength(note: AnkiDraftNote): number {
  return note.fields.reduce((n, f) => n + f.normalized.trim().length, 0);
}

/**
 * The note that would lose the least if the others went away: most non-empty
 * fields first, then the most text, then the first one seen. Every rule is
 * about *retained information*, never about which note is newer — a note edited
 * yesterday can be the emptier of the two.
 */
export function proposeCanonical(
  members: readonly AnkiDraftNote[],
): { note: AnkiDraftNote; reason: DuplicateCanonicalReason; tied: boolean } {
  const scored = members.map((note) => ({
    note,
    fields: filledFields(note),
    length: contentLength(note),
  }));
  // The winner stays the earliest of the equals so the result is stable across
  // runs; the tie is then reported rather than smoothed over.
  const best = scored.reduce((a, b) =>
    b.fields > a.fields || (b.fields === a.fields && b.length > a.length) ? b : a,
  );
  const others = scored.filter((s) => s.note !== best.note);

  // The reason is the rule that actually separated the winner from the field,
  // not the last branch that happened to run.
  const reason: DuplicateCanonicalReason = others.length === 0
    ? 'first-seen'
    : others.every((s) => s.fields < best.fields)
      ? 'most-filled-fields'
    : others.every((s) => s.fields < best.fields || s.length < best.length)
      ? 'longest-content'
      : 'first-seen';
  const tied = others.some((s) => s.fields === best.fields && s.length === best.length);
  return { note: best.note, reason, tied };
}

function groupOf(
  key: string,
  members: readonly AnkiDraftNote[],
): DuplicateGroup {
  const { note, reason, tied } = proposeCanonical(members);
  return {
    key,
    canonicalNoteId: note.id,
    duplicateNoteIds: members.filter((m) => m.id !== note.id).map((m) => m.id),
    reason,
    tied,
  };
}

// ----- near mode ----------------------------------------------------------------

function bigrams(text: string): string[] {
  if (text.length < 2) return text === '' ? [] : [text];
  const out: string[] = [];
  for (let i = 0; i + 1 < text.length; i += 1) out.push(text.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams — no word boundaries, so it reads Japanese. */
export function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of left) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of right) {
    const have = counts.get(g) ?? 0;
    if (have > 0) {
      counts.set(g, have - 1);
      shared += 1;
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * Union-find over the candidate pairs, so `a≈b` and `b≈c` land in one group even
 * when `a` and `c` fall under the threshold. Transitivity is the behaviour a
 * user expects from "these are the same note three times"; the alternative is
 * reporting the middle note twice.
 */
function nearGroups(
  entries: readonly { note: AnkiDraftNote; key: string }[],
  threshold: number,
): { groups: DuplicateGroup[]; comparisons: number; capped: boolean } {
  const index = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    for (const g of new Set(bigrams(entry.key))) {
      const bucket = index.get(g);
      if (bucket) bucket.push(i);
      else index.set(g, [i]);
    }
  });

  const parent = entries.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    for (let cur = i; parent[cur] !== root; ) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  let comparisons = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const seen = new Set<number>();
    for (const g of new Set(bigrams(entries[i].key))) {
      for (const j of index.get(g) ?? []) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        comparisons += 1;
        if (comparisons > NEAR_MAX_COMPARISONS) {
          return { groups: [], comparisons, capped: true };
        }
        if (bigramDice(entries[i].key, entries[j].key) >= threshold) {
          const a = find(i);
          const b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
    }
  }

  const byRoot = new Map<number, AnkiDraftNote[]>();
  entries.forEach((entry, i) => {
    const root = find(i);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(entry.note);
    else byRoot.set(root, [entry.note]);
  });

  const groups: DuplicateGroup[] = [];
  for (const members of byRoot.values()) {
    // A near group's members differ by construction, so no single value names
    // it — `key` is empty rather than one member's text passed off as the group's.
    if (members.length > 1) groups.push(groupOf('', members));
  }
  return { groups, comparisons, capped: false };
}

// ----- the scan -----------------------------------------------------------------

export function findDuplicateNotes(request: DuplicateScanRequest): DuplicateScanResult {
  const { notes, noteTypes, fieldName, mode } = request;
  const typesById = new Map(noteTypes.map((t) => [t.id, t]));
  const selected = request.noteIds ? new Set(request.noteIds) : null;

  const fieldAbsentNoteIds: string[] = [];
  const emptyNoteIds: string[] = [];
  const entries: { note: AnkiDraftNote; key: string }[] = [];

  for (const note of notes) {
    if (selected && !selected.has(note.id)) continue;
    if (!noteTypeHasField(note, typesById, fieldName)) {
      fieldAbsentNoteIds.push(note.id);
      continue;
    }
    const value = fieldValue(note, fieldName, mode);
    // The note type declares the field but this note has no value for it — an
    // apkg can carry that. Same answer as absent for grouping, but the caller
    // is told which of the two it was.
    if (value === null) {
      fieldAbsentNoteIds.push(note.id);
      continue;
    }
    if (value.trim() === '') {
      emptyNoteIds.push(note.id);
      continue;
    }
    entries.push({ note, key: value });
  }

  if (mode === 'near') {
    const threshold = request.threshold;
    // An unstated threshold is not 1.0 and not 0.8 — it is a missing answer, and
    // `near` with a made-up one would return findings nobody asked for.
    if (threshold === undefined || !(threshold > 0) || threshold > 1) {
      return { groups: [], fieldAbsentNoteIds, emptyNoteIds, comparisons: 0, capped: false };
    }
    const near = nearGroups(entries, threshold);
    return { ...near, fieldAbsentNoteIds, emptyNoteIds };
  }

  const byKey = new Map<string, AnkiDraftNote[]>();
  for (const entry of entries) {
    const bucket = byKey.get(entry.key);
    if (bucket) bucket.push(entry.note);
    else byKey.set(entry.key, [entry.note]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length > 1) groups.push(groupOf(key, members));
  }
  return { groups, fieldAbsentNoteIds, emptyNoteIds, comparisons: 0, capped: false };
}

/** Every non-canonical note across the groups, deduplicated, in group order. */
export function duplicateNoteIds(result: DuplicateScanResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of result.groups) {
    for (const id of group.duplicateNoteIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
