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
import { isMintedDeckId } from './ankiDeckSplit';

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

/**
 * Recipe 13's split. Named apart from `ApkgExportCardMove`, which is a *queue
 * position* despite its name: one changes `cards.due`, the other `cards.did`,
 * and folding them together is how a reposition would silently refile a card.
 */
export interface ApkgExportCardDeckMove {
  cardId: string;
  noteId: string;
  /** The draft's deck id, which for a deck the split created is a `split:` id. */
  deckId: string;
}

/**
 * A subdeck recipe 13's split invented, which the writer has to bring into
 * existence before any `cardDeckMoves` targeting it can land. The id here is the
 * planner's minted one; the real Anki id (epoch milliseconds) is allocated by
 * whichever writer creates the row, because only it knows which ids are free.
 *
 * `sanitizeDeckSegment` strips `::` and control characters from every segment a
 * split appends, and a split's parent always exists in the source — so a created
 * deck is always a direct child of a deck that is already there, and no writer
 * has to invent intermediate levels.
 */
export interface ApkgExportDeckCreate {
  /** The planner's minted id, e.g. `split:1:N5`. Never a real Anki id. */
  deckId: string;
  /** Full name in the SOURCE's own separator, exactly as the draft holds it. */
  name: string;
  /** Options preset (`conf`) the split chose — the parent's, so study limits carry. */
  configId?: string;
}

export interface ApkgExportChangeSet {
  notes: ApkgExportNoteChange[];
  cardMoves: ApkgExportCardMove[];
  deckRenames: ApkgExportDeckRename[];
  /** Absent on a payload written before recipe 13; read tolerantly downstream. */
  cardDeckMoves?: ApkgExportCardDeckMove[];
  /** Decks a `cardDeckMoves` entry targets that the source does not have yet. */
  deckCreates?: ApkgExportDeckCreate[];
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
  /** A renamed deck is not in the source package, or it stores no deck list. */
  | 'deck-missing'
  /** The source's deck name is not the one the rename was computed against. */
  | 'deck-changed'
  /** Another deck in the source holds the new name — writing it would merge two decks. */
  | 'deck-name-taken'
  /**
   * The package stores deck names under Anki's own `unicase` collation, which
   * this build's SQLite cannot register — so the name column cannot be written
   * at all. Measured on a real ver-18 package: note fields and tags write fine
   * and only the deck name refuses.
   */
  | 'deck-collation-unsupported'
  /**
   * Recipe 13's split moved a card that is on loan to a filtered deck: its `did`
   * is the filtered deck and its real one lives in `odid`. Writing `did` there
   * would strand it on the next rebuild. `planDeckSplit` refuses these while
   * planning (`filtered-card`), so this is the writer's own backstop against a
   * change set assembled some other way.
   *
   * There is deliberately no `deck-move-unsupported` here: the package writer
   * creates the deck rows and rewrites `cards.did` for real. The live
   * AnkiConnect commit still refuses by that name — see `ankiConnectCommit.ts`.
   */
  | 'card-filtered'
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
  /** Deck rows written — renamed, or created by a split. Reported apart: no note moves. */
  decksUpdated?: number;
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
    // The kind is part of the key: `card-due` and `card-deck` both name a card,
    // and one key for both would let a split swallow a reposition of the same
    // card — the second op would fold into the first and never export.
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          : `c:${op.kind}:${op.cardId}`;
    if (tracked.has(key)) continue;
    tracked.set(key, {
      noteId: op.noteId,
      kind: op.kind,
      fieldOrd: op.kind === 'field' ? op.fieldOrd : undefined,
      cardId: op.kind === 'card-due' || op.kind === 'card-deck' ? op.cardId : undefined,
      firstBefore: op.before,
    });
  }

  const noteById = new Map(draft.notes.map((n) => [n.id, n]));
  const cardById = new Map(draft.cards.map((c) => [c.id, c]));

  const fieldNotes = new Set<string>();
  const tagNotes = new Set<string>();
  const cardMoves: ApkgExportCardMove[] = [];
  const cardDeckMoves: ApkgExportCardDeckMove[] = [];

  for (const entry of tracked.values()) {
    if (entry.kind === 'field') {
      const field = noteById
        .get(entry.noteId)
        ?.fields.find((f) => f.ord === entry.fieldOrd);
      if (field && field.raw !== entry.firstBefore) fieldNotes.add(entry.noteId);
    } else if (entry.kind === 'tags') {
      const note = noteById.get(entry.noteId);
      if (note && !sameTags(entry.firstBefore as string[], note.tags)) tagNotes.add(entry.noteId);
    } else if (entry.kind === 'card-deck') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.deckId !== entry.firstBefore) {
        cardDeckMoves.push({ cardId: card.id, noteId: entry.noteId, deckId: card.deckId });
      }
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

  // Only the decks the surviving moves actually target: a split whose moves were
  // all undone folds to nothing above, and shipping its invented decks anyway
  // would write empty subdecks into the package for an edit the user took back.
  const deckCreates: ApkgExportDeckCreate[] = [];
  const creating = new Set<string>();
  for (const move of cardDeckMoves) {
    if (!isMintedDeckId(move.deckId) || creating.has(move.deckId)) continue;
    const deck = draft.decks.find((d) => d.id === move.deckId);
    if (!deck) continue; // The writer refuses the move by name; do not invent one here.
    creating.add(move.deckId);
    deckCreates.push({ deckId: deck.id, name: deck.name, configId: deck.configId });
  }

  return { notes, cardMoves, deckRenames: deckRenamed, cardDeckMoves, deckCreates };
}

/** True when the change set carries nothing to write. */
export function exportChangesEmpty(changes: ApkgExportChangeSet): boolean {
  // `deckRenames` is read tolerantly: this runs on a payload that crossed IPC,
  // and a request written before the field existed must read as "no renames"
  // rather than throw on the way to the writer.
  return (
    changes.notes.length === 0 &&
    changes.cardMoves.length === 0 &&
    (changes.deckRenames ?? []).length === 0 &&
    (changes.cardDeckMoves ?? []).length === 0
  );
}
