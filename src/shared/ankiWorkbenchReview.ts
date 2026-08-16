// Step 6's dry-run summary — ANKI_DECK_WORKBENCH_PLAN.md's "Review examples —
// inspect representative cards, edge cases, diffs, conflicts, costs, and a
// complete dry run".
//
// In this workbench the dry run has already happened: every tray and every
// hand edit was applied to the draft, and nothing has touched Anki or a file.
// What review owes the user is therefore the **net** of the whole session,
// measured against the journal's own before-images — not the per-step counts,
// which describe what each tray did at the time and quietly go stale when a
// later step or an undo rewrites the same value. A field taken A → B → A is
// not a change, and this module refuses to count it as one.
//
// The other honesty rule: a value written by two different steps is a
// conflict the user resolved by ordering, possibly without noticing. It is
// reported, not hidden, because "the later step wins" is only fine when the
// user knows it happened.

import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from './ankiDraft';
import { countJournalSteps, type AnkiDraftEditJournal } from './ankiDraftEdit';

export interface ReviewDiffLine {
  noteId: string;
  /** What the user calls the note: its first non-empty field, normalized. */
  noteLabel: string;
  kind: 'field' | 'tags' | 'card-due';
  /** Set for `field` lines. Named, never numbered. */
  fieldName?: string;
  /** Display strings: raw bytes for a field, joined tags, a queue position. */
  before: string;
  after: string;
  /** Written by more than one step — the later step's value is what lands. */
  overwritten: boolean;
}

export interface WorkbenchReviewSummary {
  /** Steps currently applied, in the Undo button's own units. */
  appliedSteps: number;
  /** Distinct notes whose current bytes differ from before their first edit. */
  changedNotes: number;
  /** Notes that were edited and are byte-identical to their original again. */
  revertedNotes: number;
  /** Notes with a net tag change. */
  tagNotes: number;
  /** New cards whose queue position netted out different. */
  cardMoves: number;
  /** Field name → notes with a net change on it, in first-touched order. */
  fieldCounts: { name: string; notes: number }[];
  /** Net changes that two or more steps wrote to the same value. */
  overwrites: number;
  /** One line per net change, in first-touched order, capped at `diffLimit`. */
  diffs: ReviewDiffLine[];
  /** Net changes in total, so a capped list can say what it is showing. */
  totalDiffs: number;
}

/** How many diff lines the summary carries by default. The count is complete
 *  either way; only the rendered lines are capped. */
export const REVIEW_DIFF_LIMIT = 50;

const LABEL_MAX = 40;

function noteLabel(note: AnkiDraftNote | undefined, noteId: string): string {
  const text = note?.fields.find((f) => f.normalized.trim() !== '')?.normalized.trim();
  if (!text) return noteId;
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX)}…` : text;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/** One value the journal touched, with the original it started from. */
interface Tracked {
  noteId: string;
  kind: 'field' | 'tags' | 'card-due';
  fieldOrd?: number;
  cardId?: string;
  firstBefore: string | string[] | number;
  /** Distinct steps that wrote this value. */
  writers: Set<string>;
}

export function buildWorkbenchReview(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  options: { diffLimit?: number } = {},
): WorkbenchReviewSummary {
  const diffLimit = options.diffLimit ?? REVIEW_DIFF_LIMIT;

  // First pass: fold the applied ops into one entry per value, keeping the
  // *first* before-image — that is the state the source actually held.
  const tracked = new Map<string, Tracked>();
  journal.done.forEach((op, i) => {
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          : `c:${op.cardId}`;
    // An ungrouped op is its own step, exactly as `trailingStep` counts it.
    const writer = op.group ?? `single:${i}`;
    const entry = tracked.get(key);
    if (entry) {
      entry.writers.add(writer);
      return;
    }
    tracked.set(key, {
      noteId: op.noteId,
      kind: op.kind,
      fieldOrd: op.kind === 'field' ? op.fieldOrd : undefined,
      cardId: op.kind === 'card-due' ? op.cardId : undefined,
      firstBefore: op.before,
      writers: new Set([writer]),
    });
  });

  const noteById = new Map<string, AnkiDraftNote>(draft.notes.map((n) => [n.id, n]));
  const cardById = new Map<string, AnkiDraftCard>(draft.cards.map((c) => [c.id, c]));

  const changedNoteIds = new Set<string>();
  const touchedNoteIds = new Set<string>();
  const tagNoteIds = new Set<string>();
  const fieldNotes = new Map<string, Set<string>>();
  const diffs: ReviewDiffLine[] = [];
  let cardMoves = 0;
  let overwrites = 0;
  let totalDiffs = 0;

  for (const entry of tracked.values()) {
    touchedNoteIds.add(entry.noteId);
    const note = noteById.get(entry.noteId);
    let line: ReviewDiffLine | null = null;

    if (entry.kind === 'field') {
      const field = note?.fields.find((f) => f.ord === entry.fieldOrd);
      // A note the draft no longer holds cannot be diffed honestly; the
      // journal entry still names it, which is the audit journal's job.
      if (!field || field.raw === entry.firstBefore) continue;
      const bag = fieldNotes.get(field.name) ?? new Set<string>();
      bag.add(entry.noteId);
      fieldNotes.set(field.name, bag);
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'field',
        fieldName: field.name,
        before: entry.firstBefore as string,
        after: field.raw,
        overwritten: entry.writers.size > 1,
      };
    } else if (entry.kind === 'tags') {
      if (!note || sameTags(entry.firstBefore as string[], note.tags)) continue;
      tagNoteIds.add(entry.noteId);
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'tags',
        before: (entry.firstBefore as string[]).join(' '),
        after: note.tags.join(' '),
        overwritten: entry.writers.size > 1,
      };
    } else {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (!card || card.due === entry.firstBefore) continue;
      cardMoves += 1;
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'card-due',
        before: String(entry.firstBefore),
        after: String(card.due),
        overwritten: entry.writers.size > 1,
      };
    }

    changedNoteIds.add(entry.noteId);
    if (line.overwritten) overwrites += 1;
    totalDiffs += 1;
    if (diffs.length < diffLimit) diffs.push(line);
  }

  return {
    appliedSteps: countJournalSteps(journal.done),
    changedNotes: changedNoteIds.size,
    revertedNotes: [...touchedNoteIds].filter((id) => !changedNoteIds.has(id)).length,
    tagNotes: tagNoteIds.size,
    cardMoves,
    fieldCounts: [...fieldNotes.entries()].map(([name, ids]) => ({ name, notes: ids.size })),
    overwrites,
    diffs,
    totalDiffs,
  };
}
