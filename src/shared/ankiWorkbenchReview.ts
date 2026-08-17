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
import {
  countJournalSteps,
  type AnkiCardScheduling,
  type AnkiDraftEditJournal,
} from './ankiDraftEdit';

export interface ReviewDiffLine {
  noteId: string;
  /** What the user calls the note: its first non-empty field, normalized. */
  noteLabel: string;
  kind:
    | 'field'
    | 'tags'
    | 'card-due'
    | 'card-deck'
    | 'card-flag'
    | 'card-queue'
    | 'card-scheduling';
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
  /**
   * Cards recipe 13's split refiled into another deck. Counted apart from
   * `cardMoves`, which is a *queue position* despite its name: one changes
   * `cards.due` and the other `cards.did`, and one number for both would let a
   * split read as a reposition in the only place the user reviews it.
   */
  cardDeckMoves: number;
  /**
   * Gate 5's three card-state capabilities, counted apart from each other and
   * from `cardMoves` for that count's own reason: they write three different
   * columns, and one number covering them would let a suspension read as a
   * reposition in the only place the user reviews it before committing.
   */
  cardFlags: number;
  /** Cards whose suspension netted out different, either direction. */
  cardSuspensions: number;
  /** Cards whose interval or ease netted out different. */
  cardScheduling: number;
  /**
   * Decks whose name netted out different. Counted apart from `changedNotes`
   * because a rename touches no note: a deck-only session would otherwise
   * review as an empty one, and step 6 would tell the user nothing happened.
   */
  deckRenames: number;
  /**
   * Card templates recipe 17's remove half dropped. Counted apart from
   * `changedNotes` for `deckRenames`' reason — a removal touches no note's
   * bytes — and surfaced at all because this summary is the dry run of the
   * export: a removal that shipped without appearing here would be the one
   * destructive change the user approved without being shown it.
   */
  templatesRemoved: number;
  /**
   * Cards those removals delete. Reported apart from `templatesRemoved` and
   * from every other count in this summary because it is the only number here
   * that describes destruction — the same reason the package writer keeps
   * `cardsDeleted` apart from `cardsUpdated`.
   */
  cardsDeleted: number;
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
  kind:
    | 'field'
    | 'tags'
    | 'card-due'
    | 'card-deck'
    | 'card-flag'
    | 'card-queue'
    | 'card-scheduling';
  fieldOrd?: number;
  cardId?: string;
  firstBefore: string | string[] | number | AnkiCardScheduling;
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
  // Deck id → the name it held before the session's first rename of it.
  const deckFirstBefore = new Map<string, string>();
  let templatesRemoved = 0;
  let cardsDeleted = 0;
  journal.done.forEach((op, i) => {
    if (op.kind === 'deck-name') {
      if (!deckFirstBefore.has(op.deckId)) deckFirstBefore.set(op.deckId, op.before);
      return;
    }
    if (op.kind === 'template-remove') {
      // Not folded and not re-read against the draft, unlike a rename: two
      // removals on one note type are two templates gone, and an undone one is
      // already absent from `journal.done`. Both numbers come straight off the
      // op, which is the only place the deleted rows still exist.
      templatesRemoved += 1;
      cardsDeleted += op.cards.length;
      return;
    }
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          // The kind is part of the key: a split and a reposition of the same
          // card are two net changes, not one folding into the other.
          : `c:${op.kind}:${op.cardId}`;
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
      cardId: op.kind === 'field' || op.kind === 'tags' ? undefined : op.cardId,
      firstBefore: op.before,
      writers: new Set([writer]),
    });
  });

  const noteById = new Map<string, AnkiDraftNote>(draft.notes.map((n) => [n.id, n]));
  const cardById = new Map<string, AnkiDraftCard>(draft.cards.map((c) => [c.id, c]));
  const deckNameById = new Map<string, string>(draft.decks.map((d) => [d.id, d.name]));

  const changedNoteIds = new Set<string>();
  const touchedNoteIds = new Set<string>();
  const tagNoteIds = new Set<string>();
  const fieldNotes = new Map<string, Set<string>>();
  const diffs: ReviewDiffLine[] = [];
  let cardMoves = 0;
  let cardDeckMoves = 0;
  let cardFlags = 0;
  let cardSuspensions = 0;
  let cardScheduling = 0;
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
    } else if (entry.kind === 'card-deck') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (!card || card.deckId === entry.firstBefore) continue;
      cardDeckMoves += 1;
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'card-deck',
        // Deck *names*, not ids: an id is not a thing the user can check.
        before: deckNameById.get(String(entry.firstBefore)) ?? String(entry.firstBefore),
        after: deckNameById.get(card.deckId) ?? card.deckId,
        overwritten: entry.writers.size > 1,
      };
    } else if (entry.kind === 'card-flag') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (!card || card.flag === entry.firstBefore) continue;
      cardFlags += 1;
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'card-flag',
        // The colour names, which are what Anki's own browser calls them.
        before: String(entry.firstBefore),
        after: card.flag,
        overwritten: entry.writers.size > 1,
      };
    } else if (entry.kind === 'card-queue') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (!card || card.queue === entry.firstBefore) continue;
      cardSuspensions += 1;
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'card-queue',
        before: String(entry.firstBefore),
        after: card.queue,
        overwritten: entry.writers.size > 1,
      };
    } else if (entry.kind === 'card-scheduling') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      const was = entry.firstBefore as AnkiCardScheduling;
      if (!card || (card.interval === was.interval && card.easeFactor === was.easeFactor)) continue;
      cardScheduling += 1;
      line = {
        noteId: entry.noteId,
        noteLabel: noteLabel(note, entry.noteId),
        kind: 'card-scheduling',
        // `interval` in days and `easeFactor` in permille, exactly as stored —
        // the plan forbids relabelling Anki's own units in this workbench.
        before: `${was.interval}/${was.easeFactor}`,
        after: `${card.interval}/${card.easeFactor}`,
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

  // Net, like every other count here: a deck renamed and renamed back is not a
  // change, and one whose deck has since left the draft is not counted at all.
  let deckRenames = 0;
  for (const [deckId, before] of deckFirstBefore) {
    const deck = draft.decks.find((d) => d.id === deckId);
    if (deck && deck.name !== before) deckRenames += 1;
  }

  return {
    appliedSteps: countJournalSteps(journal.done),
    changedNotes: changedNoteIds.size,
    revertedNotes: [...touchedNoteIds].filter((id) => !changedNoteIds.has(id)).length,
    tagNotes: tagNoteIds.size,
    cardMoves,
    cardDeckMoves,
    cardFlags,
    cardSuspensions,
    cardScheduling,
    deckRenames,
    templatesRemoved,
    cardsDeleted,
    fieldCounts: [...fieldNotes.entries()].map(([name, ids]) => ({ name, notes: ids.size })),
    overwrites,
    diffs,
    totalDiffs,
  };
}
