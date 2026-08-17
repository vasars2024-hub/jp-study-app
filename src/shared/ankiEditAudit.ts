// The Deck Workbench's audit journal — ANKI_DECK_WORKBENCH_PLAN.md Phase 3
// ("… diff previews, undo/redo, and audit journal").
//
// Undo/redo already exist, but a step count is not a record: "3 changes" does
// not tell a user what the third one did, and by the time they want to know,
// the only way to find out is to press Undo and watch. This turns the raw op
// journal into something readable.
//
// The load-bearing decision: **a journal entry is exactly what one Undo takes
// back.** Ops are grouped the way `trailingStep` groups them, so the list a
// user reads and the button they press can never disagree about what a step is.
// The obvious alternative — one entry per op — would show 3,000 lines for one
// tray run and claim 3,000 undos that do not exist.
//
// Second decision: an undone step stays listed, marked as taken back, until a
// new edit clears the redo stack. Dropping it the moment it is undone erases
// the fact that it ever happened, which is the one thing an audit journal is
// for.
//
// Fields are named, never numbered: an ord means nothing to a user and means
// different things in two note types. Nothing here holds user-visible English —
// a step carries data and the surface resolves the sentence.

import type { AnkiDraft } from './ankiDraft';
import type { AnkiDraftEditJournal, AnkiDraftEditOp } from './ankiDraftEdit';

export interface JournalEntry {
  /** 1-based, oldest first, counting applied and undone steps in one sequence. */
  index: number;
  /** The tray group id, or the op's own identity for a single edit. */
  id: string;
  /** A batch (the change tray) rather than one hand edit. */
  batch: boolean;
  /** Distinct notes the step touched. */
  noteCount: number;
  /** Field names the step wrote, in first-touched order. Empty for a tag-only step. */
  fieldNames: string[];
  /** The step changed tags on at least one note. */
  tagsChanged: boolean;
  /**
   * Decks the step renamed. Separate from `noteCount` because a deck rename
   * belongs to no note: a step that renamed 12 decks touches 0 notes, and
   * reporting it as an empty step would hide the largest change in the journal.
   */
  decksRenamed: number;
  /**
   * Card templates the step removed. Separate from `noteCount` for
   * `decksRenamed`' reason — a removal belongs to no single note, it spans every
   * note of its note type — and present at all so the journal list cannot show
   * the workbench's one destructive step as an empty row.
   */
  templatesRemoved: number;
  /** Ops in the step — what the batch actually cost, not what a user counts. */
  opCount: number;
  /** In the redo stack: it happened, and it has since been taken back. */
  undone: boolean;
}

/** Splits a flat op list into the steps `trailingStep`/`undoLastEdit` move. */
function stepsOf(ops: readonly AnkiDraftEditOp[]): AnkiDraftEditOp[][] {
  const steps: AnkiDraftEditOp[][] = [];
  let previous: string | undefined;
  for (const op of ops) {
    if (op.group && op.group === previous) steps[steps.length - 1]?.push(op);
    else steps.push([op]);
    previous = op.group;
  }
  return steps;
}

/** noteId → (ord → field name), for the note types actually in the draft. */
function fieldNameLookup(draft: AnkiDraft): Map<string, Map<number, string>> {
  const byNoteType = new Map<string, Map<number, string>>();
  for (const nt of draft.noteTypes) {
    byNoteType.set(nt.id, new Map(nt.fields.map((f) => [f.ord, f.name])));
  }
  const byNote = new Map<string, Map<number, string>>();
  for (const note of draft.notes) {
    const names = byNoteType.get(note.noteTypeId);
    if (names) byNote.set(note.id, names);
  }
  return byNote;
}

function entryFor(
  step: AnkiDraftEditOp[],
  index: number,
  undone: boolean,
  names: Map<string, Map<number, string>>,
): JournalEntry {
  const notes = new Set<string>();
  const fieldNames: string[] = [];
  let tagsChanged = false;
  let decksRenamed = 0;
  let templatesRemoved = 0;
  for (const op of step) {
    if (op.kind === 'deck-name') {
      decksRenamed += 1;
      continue;
    }
    if (op.kind === 'template-remove') {
      templatesRemoved += 1;
      continue;
    }
    notes.add(op.noteId);
    if (op.kind === 'tags') {
      tagsChanged = true;
      continue;
    }
    // Fall back to the op's own note fields when the draft no longer holds the
    // note — a step recorded against a page that has since been replaced still
    // has to be readable rather than blank.
    const name = names.get(op.noteId)?.get(op.fieldOrd);
    if (name && !fieldNames.includes(name)) fieldNames.push(name);
  }
  const first = step[0];
  // Neither `deck-name` nor `template-remove` has a note, so the fallback id
  // names the deck or the note type instead.
  const firstTarget =
    first === undefined
      ? ''
      : first.kind === 'deck-name'
        ? first.deckId
        : first.kind === 'template-remove'
          ? `${first.noteTypeId}:${first.template.ord}`
          : first.noteId;
  return {
    index,
    id: first?.group ?? `${first?.kind ?? 'op'}:${firstTarget}:${index}`,
    batch: Boolean(first?.group),
    noteCount: notes.size,
    fieldNames,
    tagsChanged,
    decksRenamed,
    templatesRemoved,
    opCount: step.length,
    undone,
  };
}

/**
 * The whole journal as steps, oldest first: everything applied, then everything
 * taken back. `undone` grows by appending the step just undone, so its step
 * order is newest-first and is reversed here — after grouping, not before, or
 * the reversal would also turn each batch's ops inside out.
 */
export function summarizeJournal(journal: AnkiDraftEditJournal, draft: AnkiDraft): JournalEntry[] {
  const names = fieldNameLookup(draft);
  const done = stepsOf(journal.done);
  const undone = stepsOf(journal.undone).reverse();
  return [
    ...done.map((step, i) => entryFor(step, i + 1, false, names)),
    ...undone.map((step, i) => entryFor(step, done.length + i + 1, true, names)),
  ];
}

/** Applied steps only — what the draft currently reflects. */
export function appliedStepCount(entries: readonly JournalEntry[]): number {
  return entries.filter((e) => !e.undone).length;
}

/** Distinct notes the applied steps touched. A note edited twice counts once. */
export function auditedNoteCount(journal: AnkiDraftEditJournal): number {
  const notes = new Set<string>();
  // The two note-less op kinds are skipped, matching `editedNoteIds`.
  for (const op of journal.done) {
    if (op.kind === 'deck-name' || op.kind === 'template-remove') continue;
    notes.add(op.noteId);
  }
  return notes.size;
}
