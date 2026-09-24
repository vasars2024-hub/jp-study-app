// Deck Workbench: the pieces that let an edit session outlive its component,
// grow past its first page, and land in the local deck.
//
// ANKI_DECK_WORKBENCH_PLAN.md lists the local deck as a source (:42, :70) and an
// edit journal that autosaves (:222, :250). What shipped kept the journal only
// in React state — collapsing the Anki window's section unmounted the workbench
// and threw every edit away — loaded the first 500 notes of a live Anki or CSV
// source with no way to reach the rest, and offered the local deck no
// destination at all. Everything here is pure so it is tested without React,
// IPC or a store.

import type { AnkiDraft } from './ankiDraft';
import {
  redoLastEdit,
  type AnkiDraftEditJournal,
  type AnkiDraftEditOp,
} from './ankiDraftEdit';
import type { ApkgExportChangeSet } from './ankiApkgExport';

// ----- journal replay ------------------------------------------------------------

/**
 * The journal's user-visible steps, oldest first: a whole group, or one
 * ungrouped op — the same unit `trailingStep` undoes and redoes.
 */
export function journalSteps(ops: readonly AnkiDraftEditOp[]): AnkiDraftEditOp[][] {
  const steps: AnkiDraftEditOp[][] = [];
  for (const op of ops) {
    const last = steps[steps.length - 1];
    if (last && op.group && last[0]?.group === op.group) last.push(op);
    else steps.push([op]);
  }
  return steps;
}

export interface ReplayResult {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  /** Steps that re-applied. */
  replayed: number;
  /** Steps that named something the fresh draft no longer has. */
  skipped: number;
}

/**
 * Re-apply a saved journal onto a freshly read copy of the same source.
 *
 * Built on `redoLastEdit` step by step rather than a second implementation, so
 * a replayed edit is byte-for-byte what a redo would have produced. The redo
 * history is carried over unchanged: its ops name notes of the same source.
 */
export function replayJournal(
  draft: AnkiDraft,
  saved: AnkiDraftEditJournal,
  normalize: (raw: string) => string,
): ReplayResult {
  let current = draft;
  let done: AnkiDraftEditOp[] = [];
  let replayed = 0;
  let skipped = 0;
  for (const step of journalSteps(saved.done)) {
    // A paged read may not hold every note the session edited. Ops naming an
    // absent note are left out rather than "redone" into nothing, and a step
    // with nothing left is counted as skipped so the surface can say so.
    const present = new Set(current.notes.map((note) => note.id));
    const runnable = step.filter((op) => {
      const noteId = (op as { noteId?: unknown }).noteId;
      return typeof noteId !== 'string' || present.has(noteId);
    });
    if (!runnable.length) {
      skipped += 1;
      continue;
    }
    const result = redoLastEdit(current, { done, undone: runnable }, normalize);
    if (!result.changed) {
      skipped += 1;
      continue;
    }
    current = result.draft;
    done = result.journal.done;
    replayed += 1;
  }
  return { draft: current, journal: { done, undone: [...saved.undone] }, replayed, skipped };
}

// ----- paging ---------------------------------------------------------------------

/**
 * Append a further page of the same source to a loaded draft.
 *
 * `counts` stays the base's — it describes the whole source, which is why the
 * page carries the same numbers — and only rows the base does not hold are
 * added, so loading a page twice cannot duplicate a note. Note types and decks
 * are unioned because a live Anki page fetches only the ones its notes use.
 */
export function mergeDraftPage(base: AnkiDraft, page: AnkiDraft): AnkiDraft {
  const noteIds = new Set(base.notes.map((note) => note.id));
  const cardIds = new Set(base.cards.map((card) => card.id));
  const typeIds = new Set(base.noteTypes.map((type) => type.id));
  const deckIds = new Set(base.decks.map((deck) => deck.id));
  const diagnosticKeys = new Set(base.diagnostics.map((d) => JSON.stringify(d)));
  return {
    ...base,
    notes: [...base.notes, ...page.notes.filter((note) => !noteIds.has(note.id))],
    cards: [...base.cards, ...page.cards.filter((card) => !cardIds.has(card.id))],
    noteTypes: [...base.noteTypes, ...page.noteTypes.filter((type) => !typeIds.has(type.id))],
    decks: [...base.decks, ...page.decks.filter((deck) => !deckIds.has(deck.id))],
    diagnostics: [
      ...base.diagnostics,
      ...page.diagnostics.filter((d) => !diagnosticKeys.has(JSON.stringify(d))),
    ],
  };
}

// ----- autosave -------------------------------------------------------------------

export const WORKBENCH_AUTOSAVE_VERSION = 1;

/**
 * Everything an edit session needs to come back exactly as it was left. The
 * draft is stored whole (with its edits applied) so a session over a local
 * deck or a live collection resumes without re-reading anything; `journal` is
 * what makes the edits undoable again and what `replayJournal` re-applies when
 * the same file is opened fresh after a restart.
 */
export interface WorkbenchAutosave<Extra = unknown> {
  version: typeof WORKBENCH_AUTOSAVE_VERSION;
  savedAt: number;
  draft: AnkiDraft;
  totalNotes: number | null;
  journal: AnkiDraftEditJournal;
  /** Component-owned state (flow, tray queue…), restored as-is. */
  extra?: Extra;
}

export function isWorkbenchAutosave(value: unknown): value is WorkbenchAutosave {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<WorkbenchAutosave>;
  return (
    saved.version === WORKBENCH_AUTOSAVE_VERSION
    && typeof saved.savedAt === 'number'
    && !!saved.draft
    && typeof saved.draft === 'object'
    && Array.isArray(saved.draft.notes)
    && !!saved.draft.source
    && typeof saved.draft.source.fingerprint === 'string'
    && !!saved.journal
    && Array.isArray(saved.journal.done)
    && Array.isArray(saved.journal.undone)
  );
}

/** Worth keeping: something was edited, or undone and redoable. */
export function autosaveHasEdits(journal: AnkiDraftEditJournal): boolean {
  return journal.done.length > 0 || journal.undone.length > 0;
}

// ----- local deck destination ----------------------------------------------------

/** Deck-card fields in `LOCAL_DECK_FIELD_NAMES` order that a text edit may write. */
export const LOCAL_DECK_WRITABLE_FIELDS = ['word', 'reading', 'meaning', 'sentence', 'front', 'back'] as const;
export type LocalDeckWritableField = (typeof LOCAL_DECK_WRITABLE_FIELDS)[number];
export type LocalDeckFieldPatch = Partial<Record<LocalDeckWritableField, string>>;

export interface LocalDeckApplyPlan {
  patches: Array<{ id: string; patch: LocalDeckFieldPatch }>;
  /**
   * Change kinds the local deck cannot store, by the change set's own name, with
   * how many of each. Said before the button, never dropped silently.
   */
  unsupported: Array<{ kind: string; count: number }>;
}

/**
 * Translate the workbench's change set into field patches on local deck cards.
 *
 * The local deck draft (`ankiLocalDeck.ts`) exposes each card as a note whose id
 * IS the card id and whose fields are Expression, Reading, Meaning, Sentence,
 * Front, Back, Audio, Image. The six text fields map straight back; audio and
 * image markup were generated from managed files and are not written back, nor
 * are tags (generated labels), scheduling (owned by the local SRS) or deck
 * structure. Each of those is reported as unsupported instead.
 */
export function planLocalDeckApply(
  changes: ApkgExportChangeSet,
  current: ReadonlyMap<string, Record<LocalDeckWritableField, string | undefined>>,
): LocalDeckApplyPlan {
  const patches: LocalDeckApplyPlan['patches'] = [];
  const unsupported = new Map<string, number>();
  const note = (kind: string, count: number): void => {
    if (count > 0) unsupported.set(kind, (unsupported.get(kind) ?? 0) + count);
  };
  for (const change of changes.notes ?? []) {
    if (change.tags) note('tags', 1);
    if (!change.fields) continue;
    const before = current.get(change.noteId);
    const patch: LocalDeckFieldPatch = {};
    LOCAL_DECK_WRITABLE_FIELDS.forEach((field, ord) => {
      const value = change.fields?.[ord];
      if (value === undefined) return;
      if ((before?.[field] ?? '') !== value) patch[field] = value;
    });
    // Audio (ord 6) and Image (ord 7) are markup generated from managed files
    // and are never written back: the card keeps its own files.
    if (Object.keys(patch).length) patches.push({ id: change.noteId, patch });
  }
  note('cardMoves', (changes.cardMoves ?? []).length);
  note('deckRenames', (changes.deckRenames ?? []).length);
  note('cardDeckMoves', (changes.cardDeckMoves ?? []).length);
  note('templateRemovals', (changes.templateRemovals ?? []).length);
  note('templateAdds', (changes.templateAdds ?? []).length);
  note('templateFormats', (changes.templateFormats ?? []).length);
  note('cardFlags', (changes.cardFlags ?? []).length);
  note('cardQueues', (changes.cardQueues ?? []).length);
  note('cardScheduling', (changes.cardScheduling ?? []).length);
  return {
    patches,
    unsupported: [...unsupported.entries()].map(([kind, count]) => ({ kind, count })),
  };
}
