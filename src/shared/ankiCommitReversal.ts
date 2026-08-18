// Reversing a commit — acceptance gate 8's second clause ("reverse a supported
// committed action, and clearly explain any adapter operation that cannot be
// reversed").
//
// Undo already exists and is a DRAFT operation: `undoLastEdit` walks
// `journal.done` backwards inside the renderer's copy. Once step 7 has written,
// undo is powerless — the bytes are in a package or in the user's collection,
// and nothing in the workbench could put them back. This module is the other
// half.
//
// The load-bearing decision: **a reversal is an ordinary change set, built from
// the before-images the journal already carries.** Every op in
// `AnkiDraftEditOp` records `before` verbatim precisely so an inverse is a
// lookup rather than a re-derivation, so the reversal needs no new transport, no
// new writer and no new verifier — it goes back out through the same
// `apkg:export` / `anki:commitConnectDraft` the commit used, against the same
// fingerprint guard. A destination that moved since the commit refuses the
// reversal exactly as it refuses a commit, for free.
//
// Second decision: **the record is a snapshot, not a pointer at the live
// draft.** A user who commits and then keeps editing must still be able to
// reverse the commit, and the draft's current field values are by then the wrong
// answer — so the record carries the exact rows that were written. The reversal
// is therefore a function of what landed, never of what the renderer happens to
// hold now.
//
// Third decision, and the one the gate actually asks about: **anything whose
// inverse would be a lie is refused by name and never half-written.** A
// committed template removal is the case: restoring the template is easy, but
// the cards it deleted carried interval, ease, reps and lapses, and
// `ApkgExportTemplateAdd` can only bring back `{noteId, deckId, due}` — so the
// "reversal" would return every card as new and silently discard its review
// history. That is not a reversal, and this module says so instead of doing it.
//
// Nothing here holds user-visible English: a refusal carries a code and its
// subject, and the surface resolves the sentence.

import type { AnkiCardFlag, AnkiCardQueue, AnkiDraft } from './ankiDraft';
import type { AnkiCardScheduling, AnkiDraftEditJournal, AnkiDraftEditOp } from './ankiDraftEdit';
import { isNoteTypeOp } from './ankiDraftEdit';
import type {
  ApkgExportCardDeckMove,
  ApkgExportCardFlag,
  ApkgExportCardMove,
  ApkgExportCardQueue,
  ApkgExportCardScheduling,
  ApkgExportChangeSet,
  ApkgExportDeckRename,
  ApkgExportNoteChange,
  ApkgExportTemplateFormat,
  ApkgExportTemplateRemoval,
} from './ankiApkgExport';

/** Where a commit landed. Decides which transport a reversal goes back out on. */
export type AnkiCommitDestination = 'package' | 'live' | 'text';

export interface AnkiCommitRecord {
  /** Identity for the surface's list. Never an index — records outlive re-renders. */
  id: string;
  /** ISO timestamp of the commit that produced this record. */
  at: string;
  destination: AnkiCommitDestination;
  /** The written file's name, or the live profile. Display only; never a path to write. */
  label: string;
  /**
   * The fingerprint a reversal must be committed against — the package the
   * commit PRODUCED (`ApkgExportResult.fingerprint`), or the live source's own.
   * Reversing against the pre-commit fingerprint would target the file the user
   * still has unchanged on disk, which is the one destination that must not be
   * touched.
   */
  fingerprint: string;
  /**
   * The ops the commit shipped, oldest first — `journal.done` as it stood. Every
   * before-image the reversal needs is in here; nothing else is.
   */
  ops: AnkiDraftEditOp[];
  /**
   * Exactly what was written. The reversal composes its complete field rows from
   * these rather than from the draft, so a later edit cannot leak into a
   * reversal of an earlier commit.
   */
  committed: ApkgExportChangeSet;
  /**
   * Field ords per note in `committed.notes`, in the same order as that note's
   * `fields` array. `fields` is positional — the writer zips it against the
   * destination's own ord-sorted field list — so reverting one field by ord
   * needs this map and cannot assume `ord === index`.
   */
  fieldOrds: Record<string, number[]>;
}

/**
 * Why one committed operation cannot go back. Each code names a real obstacle in
 * the adapter, never a generic failure, and each is stated BEFORE the button.
 */
export type ReversalRefusalCode =
  /**
   * A committed template removal. The template itself could be restored, but the
   * cards it deleted carried scheduling state that no add can carry — they would
   * come back as new cards, and the user's review history for them would be gone
   * for a second time. Refused whole rather than restoring the template alone,
   * which would leave a note type whose cards do not exist.
   */
  | 'template-restore-loses-scheduling'
  /**
   * A committed design that also added a FIELD to the note type. Taking the
   * template back is a removal, but taking the field back rewrites every note's
   * row in the destination — including notes the draft never paged in, whose
   * values are not in the record. The package writer refuses the forward
   * direction by name for the same reason (`template-field-unsupported`).
   */
  | 'template-unadd-field-unsupported'
  /**
   * A field revert whose note is not in the committed change set. The record and
   * the ops disagreed, which can only happen if a record was assembled by hand;
   * refused rather than guessing a row.
   */
  | 'note-not-in-commit'
  /**
   * The commit went to a CSV/TSV file. A text export writes a NEW file and never
   * the original, so the pre-commit state is still on disk under its own name —
   * there is nothing to put back, and writing a third file would not be a
   * reversal of anything.
   */
  | 'text-export-not-reversible';

export interface ReversalRefusal {
  code: ReversalRefusalCode;
  /** The note type, note or deck it is about, so the sentence can name it. */
  subject: string;
  /** How much the refusal covers — cards a removal deleted, notes a row spans. */
  count?: number;
}

export interface CommitReversal {
  /** The inverse, ready for the same transport the commit used. */
  changes: ApkgExportChangeSet;
  /** Everything that cannot go back, by name. Empty is the common case. */
  refusals: ReversalRefusal[];
  /** What will actually be written, stated before the button rather than after. */
  counts: { notes: number; cards: number; decks: number; templates: number };
  /** Nothing to reverse. The surface must not offer a button that writes nothing. */
  empty: boolean;
}

/** One journal-touched value: where it started and where the commit left it. */
interface Folded {
  noteId: string;
  kind: 'field' | 'tags' | 'card-due' | 'card-deck' | 'card-flag' | 'card-queue' | 'card-scheduling';
  fieldOrd?: number;
  cardId?: string;
  firstBefore: string | string[] | number | AnkiCardScheduling;
  lastAfter: string | string[] | number | AnkiCardScheduling;
}

function sameScheduling(a: AnkiCardScheduling, b: AnkiCardScheduling): boolean {
  return a.interval === b.interval && a.easeFactor === b.easeFactor;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/**
 * Captured at the moment of a successful commit, from the same three inputs the
 * commit itself used — so the record cannot describe a change set other than the
 * one that was sent.
 */
export function buildCommitRecord(params: {
  id: string;
  at: string;
  destination: AnkiCommitDestination;
  label: string;
  fingerprint: string;
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  committed: ApkgExportChangeSet;
}): AnkiCommitRecord {
  const noteById = new Map(params.draft.notes.map((note) => [note.id, note]));
  const fieldOrds: Record<string, number[]> = {};
  for (const change of params.committed.notes ?? []) {
    if (!change.fields) continue;
    const note = noteById.get(change.noteId);
    if (!note) continue;
    fieldOrds[change.noteId] = [...note.fields].sort((a, b) => a.ord - b.ord).map((f) => f.ord);
  }
  return {
    id: params.id,
    at: params.at,
    destination: params.destination,
    label: params.label,
    fingerprint: params.fingerprint,
    ops: [...params.journal.done],
    committed: params.committed,
    fieldOrds,
  };
}

/**
 * Fold the committed ops into per-value first-before / last-after pairs.
 *
 * Mirrors `buildApkgExportChanges`' key scheme exactly — `card-due` and
 * `card-deck` name the same card and must not collapse into one another — so the
 * reversal covers precisely the set the commit wrote and no more.
 */
function foldOps(ops: readonly AnkiDraftEditOp[]): Map<string, Folded> {
  const tracked = new Map<string, Folded>();
  for (const op of ops) {
    if (op.kind === 'deck-name' || isNoteTypeOp(op)) continue;
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          : `c:${op.kind}:${op.cardId}`;
    const existing = tracked.get(key);
    if (existing) {
      existing.lastAfter = op.after;
      continue;
    }
    tracked.set(key, {
      noteId: op.noteId,
      kind: op.kind,
      fieldOrd: op.kind === 'field' ? op.fieldOrd : undefined,
      cardId: op.kind === 'field' || op.kind === 'tags' ? undefined : op.cardId,
      firstBefore: op.before,
      lastAfter: op.after,
    });
  }
  return tracked;
}

/**
 * The inverse change set, plus everything that cannot be inverted.
 *
 * A value is reverted only when the commit actually moved it: a field taken
 * A → B → A folded out of the commit, so putting A back would be a write with no
 * cause. The comparison is against the op chain's own last `after` rather than
 * against a draft, for the reason in this file's header — the draft may have
 * moved on, the record has not.
 */
export function buildCommitReversal(record: AnkiCommitRecord): CommitReversal {
  const refusals: ReversalRefusal[] = [];

  // A text export never overwrote anything, so there is no earlier state to
  // restore — refused whole, before any of the folding below can suggest
  // otherwise.
  if (record.destination === 'text') {
    return {
      changes: { notes: [], cardMoves: [], deckRenames: [] },
      refusals: [{ code: 'text-export-not-reversible', subject: record.label }],
      counts: { notes: 0, cards: 0, decks: 0, templates: 0 },
      empty: true,
    };
  }

  const tracked = foldOps(record.ops);

  // ord → the value the commit started from, per note.
  const fieldReverts = new Map<string, Map<number, string>>();
  const tagReverts = new Map<string, string[]>();
  const cardMoves: ApkgExportCardMove[] = [];
  const cardDeckMoves: ApkgExportCardDeckMove[] = [];
  const cardFlags: ApkgExportCardFlag[] = [];
  const cardQueues: ApkgExportCardQueue[] = [];
  const cardScheduling: ApkgExportCardScheduling[] = [];

  for (const entry of tracked.values()) {
    if (entry.kind === 'field') {
      if (entry.firstBefore === entry.lastAfter) continue;
      let ords = fieldReverts.get(entry.noteId);
      if (!ords) {
        ords = new Map<number, string>();
        fieldReverts.set(entry.noteId, ords);
      }
      ords.set(entry.fieldOrd ?? 0, entry.firstBefore as string);
    } else if (entry.kind === 'tags') {
      const before = entry.firstBefore as string[];
      if (sameTags(before, entry.lastAfter as string[])) continue;
      tagReverts.set(entry.noteId, [...before]);
    } else if (entry.kind === 'card-deck') {
      if (entry.firstBefore === entry.lastAfter) continue;
      cardDeckMoves.push({
        cardId: entry.cardId ?? '',
        noteId: entry.noteId,
        deckId: entry.firstBefore as string,
      });
    } else if (entry.kind === 'card-flag') {
      if (entry.firstBefore === entry.lastAfter) continue;
      cardFlags.push({
        cardId: entry.cardId ?? '',
        noteId: entry.noteId,
        flag: entry.firstBefore as AnkiCardFlag,
      });
    } else if (entry.kind === 'card-queue') {
      if (entry.firstBefore === entry.lastAfter) continue;
      cardQueues.push({
        cardId: entry.cardId ?? '',
        noteId: entry.noteId,
        queue: entry.firstBefore as AnkiCardQueue,
      });
    } else if (entry.kind === 'card-scheduling') {
      const before = entry.firstBefore as AnkiCardScheduling;
      if (sameScheduling(before, entry.lastAfter as AnkiCardScheduling)) continue;
      cardScheduling.push({
        cardId: entry.cardId ?? '',
        noteId: entry.noteId,
        interval: before.interval,
        easeFactor: before.easeFactor,
      });
    } else {
      if (entry.firstBefore === entry.lastAfter) continue;
      cardMoves.push({
        cardId: entry.cardId ?? '',
        noteId: entry.noteId,
        due: entry.firstBefore as number,
      });
    }
  }

  // A field change is written as the WHOLE row, so the reversal starts from the
  // row that was committed and puts back only the ords this commit moved. Fields
  // the commit did not touch keep the committed value, which for them is also
  // the pre-commit value — reverting them would be a claim about state this
  // record never observed.
  const committedNotes = new Map(
    (record.committed.notes ?? []).map((change) => [change.noteId, change]),
  );
  const notes: ApkgExportNoteChange[] = [];
  for (const noteId of new Set([...fieldReverts.keys(), ...tagReverts.keys()])) {
    const wants = fieldReverts.get(noteId);
    let fields: string[] | undefined;
    if (wants) {
      const committed = committedNotes.get(noteId);
      const ords = record.fieldOrds[noteId];
      if (!committed?.fields || !ords || ords.length !== committed.fields.length) {
        refusals.push({ code: 'note-not-in-commit', subject: noteId, count: wants.size });
        continue;
      }
      fields = committed.fields.map((raw, index) => {
        const ord = ords[index];
        const revert = ord === undefined ? undefined : wants.get(ord);
        return revert === undefined ? raw : revert;
      });
    }
    notes.push({ noteId, fields, tags: tagReverts.get(noteId) });
  }

  // A rename's inverse is a rename the other way. `from` is what the destination
  // holds NOW — the committed name — or the writer's own "the deck moved
  // underneath us" guard would fire on a reversal that is perfectly valid.
  const renames = new Map<string, { before: string; after: string }>();
  for (const op of record.ops) {
    if (op.kind !== 'deck-name') continue;
    const first = renames.get(op.deckId);
    if (first) first.after = op.after;
    else renames.set(op.deckId, { before: op.before, after: op.after });
  }
  const deckRenames: ApkgExportDeckRename[] = [];
  for (const [deckId, rename] of renames) {
    if (rename.before === rename.after) continue;
    deckRenames.push({ deckId, from: rename.after, to: rename.before });
  }

  // A design's inverse is a removal of the ord it added: the cards it created go
  // with it, and they had no history before it created them, so nothing is lost.
  // A design that also added a FIELD is the exception — see the code's comment.
  const templateRemovals: ApkgExportTemplateRemoval[] = [];
  const removedByType = new Map<string, Set<number>>();
  for (const add of record.committed.templateAdds ?? []) {
    if (add.addedFieldName) {
      refusals.push({
        code: 'template-unadd-field-unsupported',
        subject: add.addedFieldName,
        count: add.cards.length,
      });
      continue;
    }
    let ords = removedByType.get(add.noteTypeId);
    if (!ords) {
      ords = new Set<number>();
      removedByType.set(add.noteTypeId, ords);
    }
    ords.add(add.ord);
  }
  for (const [noteTypeId, ords] of removedByType) {
    templateRemovals.push({ noteTypeId, removedOrds: [...ords].sort((a, b) => a - b) });
  }

  // A swap's inverse is the swap back, and it is fully reversible — no card row
  // was created or destroyed and no ord moved, so there is nothing to refuse.
  // Read off the COMMITTED rows rather than `record.ops` because these ords are
  // already in the source numbering, which is what the reversal writes against.
  const templateFormats: ApkgExportTemplateFormat[] = [];
  for (const format of record.committed.templateFormats ?? []) {
    if (format.qfmt === format.beforeQfmt && format.afmt === format.beforeAfmt) continue;
    templateFormats.push({
      noteTypeId: format.noteTypeId,
      ord: format.ord,
      qfmt: format.beforeQfmt,
      afmt: format.beforeAfmt,
      // Pointed the other way, so reversing the reversal is the original edit.
      beforeQfmt: format.qfmt,
      beforeAfmt: format.afmt,
    });
  }

  // The one refusal the gate is really about. Counted per removal op rather than
  // per note type, because two removals on one note type deleted two sets of
  // cards and reporting one number would understate what cannot come back.
  for (const op of record.ops) {
    if (op.kind !== 'template-remove') continue;
    refusals.push({
      code: 'template-restore-loses-scheduling',
      subject: op.template.name,
      count: op.cards.length,
    });
  }

  const changes: ApkgExportChangeSet = {
    notes,
    cardMoves,
    deckRenames,
    cardDeckMoves,
    deckCreates: [],
    templateRemovals,
    templateAdds: [],
    templateFormats,
    cardFlags,
    cardQueues,
    cardScheduling,
  };

  const cards =
    cardMoves.length +
    cardDeckMoves.length +
    cardFlags.length +
    cardQueues.length +
    cardScheduling.length;
  const templates = templateRemovals.reduce((sum, r) => sum + r.removedOrds.length, 0);

  return {
    changes,
    refusals,
    counts: { notes: notes.length, cards, decks: deckRenames.length, templates },
    empty: notes.length === 0 && cards === 0 && deckRenames.length === 0 && templates === 0,
  };
}
