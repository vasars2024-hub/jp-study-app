// The .apkg export contract — Phase 6 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// The workbench's dry run already happened in the renderer: the draft holds the
// "after" of every edit and the journal holds every before-image. What export
// ships to the main process is therefore the **net** change set — folded the
// same way step 6's review folds it (`ankiWorkbenchReview.ts`), so a field
// taken A → B → A is not exported and what the user read in the review is
// byte-for-byte what lands in the package.
//
// The main process applies these changes to a fresh read of the SOURCE package
// (never to the renderer's copy), which is why the request carries the draft's
// fingerprint: a source that moved since the read is refused, not clobbered.
// Notes the renderer never loaded ride through the export untouched, so the
// change set being journal-bounded is a correctness property, not a limit.

import type { AnkiDraft } from './ankiDraft';
import type { AnkiDraftEditJournal } from './ankiDraftEdit';

export interface ApkgExportNoteChange {
  noteId: string;
  /**
   * Complete replacement field values (raw, in ord order) — the whole row, not
   * a patch, so the writer can refuse on a field-count mismatch instead of
   * guessing which field a patch meant. Absent when only tags changed.
   */
  fields?: string[];
  /**
   * Complete replacement tags, in draft space: the `marked` tag is carried as
   * `AnkiDraftNote.marked`, never here, and the journal has no op that changes
   * it — so the writer preserves the source's own marked token verbatim.
   */
  tags?: string[];
}

export interface ApkgExportCardMove {
  cardId: string;
  /** For labelling refusals and verification failures; the write keys on cardId. */
  noteId: string;
  due: number;
}

/**
 * Recipe 12's deck half. A rename is the whole change: a card names its deck by
 * id, so nothing moves and the writer only rewrites the name Anki stores.
 */
export interface ApkgExportDeckRename {
  deckId: string;
  /** The source's name, so the writer can refuse a deck that moved underneath it. */
  from: string;
  to: string;
}

export interface ApkgExportChangeSet {
  notes: ApkgExportNoteChange[];
  cardMoves: ApkgExportCardMove[];
  deckRenames: ApkgExportDeckRename[];
}

// ----- IPC contract -------------------------------------------------------------

export type ApkgExportErrorCode =
  | 'cancelled'
  | 'nothing-to-export'
  | 'no-source'
  | 'source-changed'
  | 'overwrite-source'
  | 'note-missing'
  | 'field-count-mismatch'
  | 'card-missing'
  | 'compressed-unsupported'
  | 'verify-failed'
  | 'io';

export interface ApkgExportRequest {
  /** `AnkiDraftSource.fingerprint` of the draft these changes were computed on. */
  fingerprint: string;
  changes: ApkgExportChangeSet;
  /** Skip the save dialog when set (tests and bridge probes). */
  outPath?: string;
  /**
   * Skip the "locate the original deck" dialog when the main process no longer
   * remembers the fingerprint's path (tests and bridge probes). The fingerprint
   * is still enforced against whatever this names.
   */
  sourcePath?: string;
}

export interface ApkgExportResult {
  ok: boolean;
  /** Where the new package was written. The user chose it in the save dialog. */
  filePath?: string;
  fileName?: string;
  notesUpdated?: number;
  cardsUpdated?: number;
  /** The written file was re-read FROM DISK and every change was found in it. */
  verified?: boolean;
  /** Fingerprint of the new package's collection, for a later commit against it. */
  fingerprint?: string;
  errorCode?: ApkgExportErrorCode;
  error?: string;
}

// ----- net change-set builder ---------------------------------------------------

/** One journal-touched value, with the first before-image — the source's state. */
interface Tracked {
  noteId: string;
  kind: 'field' | 'tags' | 'card-due';
  fieldOrd?: number;
  cardId?: string;
  firstBefore: string | string[] | number;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/**
 * Fold the journal into the net change set against the draft's current state.
 *
 * Mirrors `buildWorkbenchReview`'s folding on purpose: export must ship exactly
 * the set the review described, or the review was not a dry run of the export.
 * A note the draft no longer holds is skipped here exactly as it is there.
 */
export function buildApkgExportChanges(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
): ApkgExportChangeSet {
  const tracked = new Map<string, Tracked>();
  const deckRenames = new Map<string, { deckId: string; before: string; after: string }>();
  for (const op of journal.done) {
    if (op.kind === 'deck-name') {
      // Folded like every other op: a deck renamed twice exports once, and one
      // renamed back to its source name exports not at all.
      const first = deckRenames.get(op.deckId);
      if (first) first.after = op.after;
      else deckRenames.set(op.deckId, { deckId: op.deckId, before: op.before, after: op.after });
      continue;
    }
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          : `c:${op.cardId}`;
    if (tracked.has(key)) continue;
    tracked.set(key, {
      noteId: op.noteId,
      kind: op.kind,
      fieldOrd: op.kind === 'field' ? op.fieldOrd : undefined,
      cardId: op.kind === 'card-due' ? op.cardId : undefined,
      firstBefore: op.before,
    });
  }

  const noteById = new Map(draft.notes.map((n) => [n.id, n]));
  const cardById = new Map(draft.cards.map((c) => [c.id, c]));

  const fieldNotes = new Set<string>();
  const tagNotes = new Set<string>();
  const cardMoves: ApkgExportCardMove[] = [];

  for (const entry of tracked.values()) {
    if (entry.kind === 'field') {
      const field = noteById
        .get(entry.noteId)
        ?.fields.find((f) => f.ord === entry.fieldOrd);
      if (field && field.raw !== entry.firstBefore) fieldNotes.add(entry.noteId);
    } else if (entry.kind === 'tags') {
      const note = noteById.get(entry.noteId);
      if (note && !sameTags(entry.firstBefore as string[], note.tags)) tagNotes.add(entry.noteId);
    } else {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.due !== entry.firstBefore) {
        cardMoves.push({ cardId: card.id, noteId: entry.noteId, due: card.due });
      }
    }
  }

  const notes: ApkgExportNoteChange[] = [];
  for (const noteId of new Set([...fieldNotes, ...tagNotes])) {
    const note = noteById.get(noteId);
    if (!note) continue;
    notes.push({
      noteId,
      fields: fieldNotes.has(noteId)
        ? [...note.fields].sort((a, b) => a.ord - b.ord).map((f) => f.raw)
        : undefined,
      tags: tagNotes.has(noteId) ? [...note.tags] : undefined,
    });
  }

  const deckRenamed: ApkgExportDeckRename[] = [];
  for (const rename of deckRenames.values()) {
    // The deck's *current* draft name, not the op's, for the same reason a field
    // is re-read above: an undone rename must not export.
    const deck = draft.decks.find((d) => d.id === rename.deckId);
    if (!deck || deck.name === rename.before) continue;
    deckRenamed.push({ deckId: rename.deckId, from: rename.before, to: deck.name });
  }

  return { notes, cardMoves, deckRenames: deckRenamed };
}

/** True when the change set carries nothing to write. */
export function exportChangesEmpty(changes: ApkgExportChangeSet): boolean {
  // `deckRenames` is read tolerantly: this runs on a payload that crossed IPC,
  // and a request written before the field existed must read as "no renames"
  // rather than throw on the way to the writer.
  return (
    changes.notes.length === 0 &&
    changes.cardMoves.length === 0 &&
    (changes.deckRenames ?? []).length === 0
  );
}
