/**
 * The living Anki parity matrix — acceptance gate 14.
 *
 * The gate asks to "exercise every `supported` row and prove every `read-only`
 * or `blocked` row has an honest explanation and no active Apply path". That is
 * only checkable if the table is derived from the code rather than written
 * beside it, so both axes are anchored to real vocabularies:
 *
 * - the **rows** are keyed to `AnkiDraftEditOp['kind']`, the edit journal's op
 *   kinds. The journal is the *only* thing that reaches a destination —
 *   `buildApkgExportChanges` folds `journal.done` and nothing else — so a
 *   capability with no op kind cannot be written **by construction**. That is
 *   what makes a `read-only` row provable instead of merely asserted, and it is
 *   why `journalOp` is `null` on exactly those rows.
 * - the **cells** are keyed to the two destinations' own error unions, so a
 *   `blocked` cell names the code its destination actually throws. The matrix
 *   and the error banner cannot drift apart: they read the same literal.
 *
 * Two guards keep it living rather than a snapshot. `JOURNAL_OP_COVERAGE` is a
 * total `Record` over the op-kind union, so a further op kind stops this file
 * compiling until it is classified; `CHANGE_SET_COVERAGE` does the same for
 * `ApkgExportChangeSet`'s fields. The test then re-derives both at runtime,
 * because `tsc` is not a gate in this repo and a compile-time-only guard here
 * would be a guard nobody runs.
 *
 * Read-only is not a synonym for unimportant. Every row below is *preserved* in
 * the draft — the plan's fidelity contract requires it — and several are shown
 * in the Browser. Read-only means the collection keeps its own value: the
 * workbench will not write one back.
 */

import type { ApkgExportChangeSet, ApkgExportErrorCode } from './ankiApkgExport';
import type { ConnectCommitErrorCode } from './ankiConnectCommit';
import type { AnkiDraftEditOp } from './ankiDraftEdit';

/** Where a change lands. A package is a new file; connect writes the live collection. */
export type AnkiParityDestination = 'package' | 'connect';

/**
 * Gate 14's three words, and no fourth.
 *
 * `read-only` and `blocked` are deliberately distinct. Read-only means no write
 * path exists on either side — the draft carries the value so nothing is lost,
 * and no button offers to change it. Blocked means the capability *is* written
 * by the other destination and this one refuses it by name, before write #1.
 */
export type AnkiParitySupport = 'supported' | 'read-only' | 'blocked';

export interface AnkiParityCell {
  support: AnkiParitySupport;
  /**
   * The code this destination answers with. Non-null iff `support` is
   * `blocked`, and typed as the destination's own union so a code that is not
   * a real refusal cannot be written here.
   */
  refusal: ApkgExportErrorCode | ConnectCommitErrorCode | null;
  /**
   * A refusal this destination may still raise on a `supported` cell, for a
   * package feature this build cannot re-encode. It is a property of the source
   * file, not of the capability, so it does not downgrade the cell — a ver-11
   * package renames its decks for real. Named so the matrix does not read as a
   * promise the user's own file may not keep.
   */
  conditional?: ApkgExportErrorCode;
}

export interface AnkiParityRow {
  /** Stable id; also the i18n suffix (`ankiWorkbench.parity.row.<id>`). */
  id: string;
  /**
   * The journal op that carries this capability, or `null` when none does —
   * which is the proof that the row is read-only rather than the claim.
   */
  journalOp: AnkiDraftEditOp['kind'] | null;
  /** The change-set field the op exports through. `null` alongside `journalOp`. */
  changeSetField: keyof ApkgExportChangeSet | null;
  package: AnkiParityCell;
  connect: AnkiParityCell;
}

const WRITES: AnkiParityCell = { support: 'supported', refusal: null };
const READ_ONLY: AnkiParityCell = { support: 'read-only', refusal: null };

/**
 * Every capability the workbench presents, writable or not.
 *
 * Order is deliberate: the journal-backed rows first, in the order a user
 * meets them, then the preserved-but-unwritable ones. A surface may group them
 * by support level, but the source order is the one the gate reads.
 */
export const ANKI_PARITY_ROWS: readonly AnkiParityRow[] = [
  {
    id: 'note-fields',
    journalOp: 'field',
    changeSetField: 'notes',
    package: WRITES,
    connect: WRITES,
  },
  {
    id: 'note-tags',
    journalOp: 'tags',
    changeSetField: 'notes',
    package: WRITES,
    connect: WRITES,
  },
  {
    id: 'card-due',
    journalOp: 'card-due',
    changeSetField: 'cardMoves',
    package: WRITES,
    connect: WRITES,
  },
  {
    id: 'card-deck',
    journalOp: 'card-deck',
    changeSetField: 'cardDeckMoves',
    package: WRITES,
    connect: WRITES,
  },
  {
    // Gate 5's suspend third. `suspend`/`unsuspend` are first-class AnkiConnect
    // actions, so this is the one card-state capability both destinations write
    // — and the two do it differently on purpose: the package restores the exact
    // queue the draft holds, while live the restored queue is Anki's own to
    // recompute, so the commit verifies suspension rather than a queue number.
    id: 'card-queue',
    journalOp: 'card-queue',
    changeSetField: 'cardQueues',
    package: WRITES,
    connect: WRITES,
  },
  {
    // Gate 5's interval/ease third. Live it rides the same
    // `setSpecificValueOfCard` route `card-due` already uses; `ivl` and `factor`
    // are plain integer columns the draft holds exactly, so unlike `flags` below
    // there is nothing unread that a whole-column write could clear.
    id: 'card-scheduling',
    journalOp: 'card-scheduling',
    changeSetField: 'cardScheduling',
    package: WRITES,
    connect: WRITES,
  },
  {
    // Gate 5's flag third, and the one cell that differs by destination.
    // AnkiConnect exposes no flag action; the only route is
    // `setSpecificValueOfCard` on `flags`, which assigns the WHOLE column —
    // whose upper bits are reserved and are not in the draft. Writing it live
    // could clear state the workbench never read, so it refuses by name. The
    // package writer has the stored value in front of it and rewrites the low
    // three bits alone, which is why the same capability is supported there.
    id: 'card-flag',
    journalOp: 'card-flag',
    changeSetField: 'cardFlags',
    package: WRITES,
    connect: { support: 'blocked', refusal: 'card-flag-unsupported' },
  },
  {
    // Recipe 12's deck half. The package rewrites the stored name; AnkiConnect
    // has no rename action and the create+move+delete emulation is a different
    // operation with a much larger blast radius, so it refuses by name.
    id: 'deck-name',
    journalOp: 'deck-name',
    changeSetField: 'deckRenames',
    package: { support: 'supported', refusal: null, conditional: 'deck-collation-unsupported' },
    connect: { support: 'blocked', refusal: 'deck-rename-unsupported' },
  },
  {
    // Recipe 17's remove half. Worse than the rename live: the only AnkiConnect
    // route blanks a template instead of dropping it, leaving every card it
    // generated rendering empty — the exact `orphan` state recipe 17 clears.
    id: 'template-remove',
    journalOp: 'template-remove',
    changeSetField: 'templateRemovals',
    package: { support: 'supported', refusal: null, conditional: 'template-storage-unsupported' },
    connect: { support: 'blocked', refusal: 'template-remove-unsupported' },
  },
  {
    // The card designer. Read-only on both sides until `applyCardDesign` gained
    // a journal op; the package now writes the template AND the exact card rows
    // the draft counted, and reads them back. Live stays blocked — not for want
    // of an AnkiConnect action but because Anki would generate the cards itself,
    // so the panel's count would stop being this workbench's to guarantee.
    id: 'template-add',
    journalOp: 'template-add',
    changeSetField: 'templateAdds',
    package: { support: 'supported', refusal: null, conditional: 'template-storage-unsupported' },
    connect: { support: 'blocked', refusal: 'template-add-unsupported' },
  },
  { id: 'note-marked', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
  {
    // `reps`, `lapses` and `left` — what is LEFT of the old `card-scheduling`
    // row once gate 5 made interval and ease writable. They stay read-only for a
    // reason interval and ease do not share: the revlog still holds a row per
    // review, so writing a counter would put a card's summary and its own
    // history into disagreement. That is a falsified log, not an edit.
    id: 'card-review-counters',
    journalOp: null,
    changeSetField: null,
    package: READ_ONLY,
    connect: READ_ONLY,
  },
  { id: 'review-history', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
  { id: 'media', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
  { id: 'note-type-fields', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
  { id: 'note-type-css', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
  { id: 'deck-config', journalOp: null, changeSetField: null, package: READ_ONLY, connect: READ_ONLY },
];

/**
 * Which row each journal op kind belongs to.
 *
 * Total over the union on purpose: adding a seventh op kind without giving it a
 * row is a compile error here, and the test re-derives the same mapping from
 * `ANKI_PARITY_ROWS` so the two cannot disagree.
 */
export const JOURNAL_OP_COVERAGE: Record<AnkiDraftEditOp['kind'], string> = {
  field: 'note-fields',
  tags: 'note-tags',
  'card-due': 'card-due',
  'card-deck': 'card-deck',
  'card-queue': 'card-queue',
  'card-scheduling': 'card-scheduling',
  'card-flag': 'card-flag',
  'deck-name': 'deck-name',
  'template-remove': 'template-remove',
  'template-add': 'template-add',
};

/**
 * Which row each change-set field belongs to.
 *
 * `Required` so an optional field still has to be classified — every optional
 * field on the change set is optional for wire-compatibility with payloads
 * written before its recipe, not because it is unimportant. `deckCreates` rides
 * with `card-deck`: a split creates a deck only in order to file cards into it,
 * and there is no way to create an empty one.
 */
export const CHANGE_SET_COVERAGE: Record<keyof Required<ApkgExportChangeSet>, string> = {
  notes: 'note-fields',
  cardMoves: 'card-due',
  deckRenames: 'deck-name',
  cardDeckMoves: 'card-deck',
  deckCreates: 'card-deck',
  templateRemovals: 'template-remove',
  templateAdds: 'template-add',
  cardFlags: 'card-flag',
  cardQueues: 'card-queue',
  cardScheduling: 'card-scheduling',
};

/** The row for a capability id, or undefined. */
export function parityRow(id: string): AnkiParityRow | undefined {
  return ANKI_PARITY_ROWS.find((row) => row.id === id);
}

/** How a destination answers for a capability. */
export function parityCell(row: AnkiParityRow, destination: AnkiParityDestination): AnkiParityCell {
  return destination === 'package' ? row.package : row.connect;
}

/**
 * Rows a destination will not write, worst first.
 *
 * `blocked` before `read-only` because a blocked capability is the one the user
 * is most likely to have already staged: it is writable on the other side, so
 * the tray accepted it and the refusal arrives at Apply.
 */
export function parityRefusedRows(destination: AnkiParityDestination): AnkiParityRow[] {
  const rank: Record<AnkiParitySupport, number> = { blocked: 0, 'read-only': 1, supported: 2 };
  return ANKI_PARITY_ROWS.filter((row) => parityCell(row, destination).support !== 'supported').sort(
    (a, b) => rank[parityCell(a, destination).support] - rank[parityCell(b, destination).support],
  );
}

/** i18n key for a row's name. */
export function parityRowKey(row: AnkiParityRow): string {
  return `ankiWorkbench.parity.row.${row.id}`;
}

/**
 * i18n key for why a destination will not write a row.
 *
 * Per destination, not per row: a deck rename is refused live for a reason that
 * has nothing to do with why it is unavailable anywhere else, and one shared
 * sentence would have to be vague enough to cover both.
 */
export function parityWhyKey(row: AnkiParityRow, destination: AnkiParityDestination): string {
  return `ankiWorkbench.parity.why.${destination}.${row.id}`;
}
