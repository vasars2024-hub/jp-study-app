// Commit a workbench change set to a LIVE Anki collection over AnkiConnect —
// the second half of Phase 6 (ANKI_DECK_WORKBENCH_PLAN.md). The .apkg half
// writes a new file; this one writes the user's own open collection, so every
// rule here is stricter than its package counterpart.
//
// Same net change set: `buildApkgExportChanges` folds the journal once and both
// destinations consume its output, so what step 6's review described is what
// commits. Nothing in this module talks to a socket — the transport lives in
// `main/anki/connectCommit.ts`, exactly as `ankiConnectDraft.ts` is the pure
// half of `connectDraftRead.ts`.
//
// Three things this does differently from the package writer, all deliberate:
//
//  1. **Tags are committed as a diff, not as a replacement.** `updateNoteTags`
//     would replace the whole tag string, and the draft models `marked` as a
//     flag rather than a tag — so a replacement would silently drop it, along
//     with anything else a future Anki version stores there. Emitting only the
//     added and removed tags leaves every token the draft does not model
//     untouched. Consequence, and it is the correct one: reordering tags alone
//     commits nothing, because Anki's tag set is unordered.
//  2. **A card on loan to a filtered deck is refused, not moved.** Its `due` is
//     the filtered deck's own position and its real one lives in `odue`;
//     writing `due` there would be a scheduling change the user did not ask for.
//  3. **The collection is re-read before the first write and again after the
//     last one.** A live collection can move under the workbench — the draft's
//     fingerprint is `connect:<matched>:<max mod>` for exactly this check.

import type { ApkgExportChangeSet } from './ankiApkgExport';
import type { AnkiDraft } from './ankiDraft';
import type { ConnectDraftRequest } from './ankiConnectDraft';

// ----- IPC contract -------------------------------------------------------------

export type ConnectCommitErrorCode =
  /** The change set carries nothing to write. */
  | 'nothing-to-commit'
  /** The main process no longer remembers how this draft was read. */
  | 'no-source'
  /** The collection moved since the draft was read. */
  | 'source-changed'
  | 'note-missing'
  | 'field-count-mismatch'
  /** A changed card is on loan to a filtered deck; its scheduling is not ours. */
  | 'card-filtered'
  | 'card-missing'
  /**
   * The change set carries a deck rename and AnkiConnect has no rename action.
   * It could be *emulated* as createDeck + changeDeck + deleteDecks, but that
   * moves every card to a new deck id and drops the old deck's options preset —
   * a different operation with a much larger blast radius than the word rename
   * promises. Refused by name; exporting a package writes the rename for real.
   */
  | 'deck-rename-unsupported'
  /**
   * Recipe 13's split. AnkiConnect *does* have `createDeck` and `changeDeck`,
   * but committing a split live also has to preserve each card's scheduling and
   * survive a partial failure across two actions — so it is refused by name
   * until that path is built rather than half-committed here.
   */
  | 'deck-move-unsupported'
  /** Anki or the add-on is not answering. */
  | 'unreachable'
  /** AnkiConnect answered but no collection is loaded. */
  | 'collection-unavailable'
  /** Some writes landed and some did not; `failures` names every one. */
  | 'partial'
  /** Everything reported success but the re-read disagrees. */
  | 'verify-failed'
  | 'io';

export interface ConnectCommitRequest {
  /** `AnkiDraft.source.fingerprint` of the draft these changes were computed on. */
  fingerprint: string;
  changes: ApkgExportChangeSet;
  /**
   * How to re-read the collection. Normally omitted: the main process remembers
   * the request that produced each fingerprint, so the renderer holds no
   * transport detail — the same rule the .apkg exporter's `sourcePath` follows.
   */
  read?: ConnectDraftRequest;
}

export interface ConnectCommitFailure {
  kind: 'note' | 'card';
  id: string;
  /** AnkiConnect's own words. A partial commit names each one, never a total. */
  reason: string;
}

export interface ConnectCommitResult {
  ok: boolean;
  notesUpdated?: number;
  cardsUpdated?: number;
  /** The collection was RE-READ after the commit and every change found in it. */
  verified?: boolean;
  /** Fingerprint after the commit — it must differ from the request's. */
  fingerprint?: string;
  /** Profile the write landed in, echoed so the surface can name it. */
  profile?: string;
  failures?: ConnectCommitFailure[];
  errorCode?: ConnectCommitErrorCode;
  error?: string;
}

// ----- pure planner -------------------------------------------------------------

/** A refusal that names what it refused, so the IPC result can carry a code. */
export class ConnectCommitRefusal extends Error {
  readonly code: ConnectCommitErrorCode;
  constructor(code: ConnectCommitErrorCode, message: string) {
    super(message);
    this.name = 'ConnectCommitRefusal';
    this.code = code;
  }
}

export interface ConnectNoteWrite {
  noteId: number;
  /** Field name → complete replacement value, only when fields changed. */
  fields?: Record<string, string>;
  /** Tags to add and to remove. Either may be empty; both empty means no tag call. */
  addTags: string[];
  removeTags: string[];
}

export interface ConnectCardWrite {
  cardId: number;
  noteId: string;
  due: number;
}

export interface ConnectCommitPlan {
  noteWrites: ConnectNoteWrite[];
  cardWrites: ConnectCardWrite[];
}

/** Anki ids are integers; AnkiConnect rejects them as strings. */
function numericId(id: string, kind: 'note' | 'card'): number {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConnectCommitRefusal(
      kind === 'note' ? 'note-missing' : 'card-missing',
      `${kind === 'note' ? 'Note' : 'Card'} id ${id} is not an Anki id.`,
    );
  }
  return n;
}

function diffTags(
  live: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const liveSet = new Set(live);
  const nextSet = new Set(next);
  return {
    add: [...nextSet].filter((tag) => !liveSet.has(tag)),
    remove: [...liveSet].filter((tag) => !nextSet.has(tag)),
  };
}

/**
 * Turn the change set into AnkiConnect writes against a FRESH read of the live
 * collection. Throws `ConnectCommitRefusal` before returning anything, so a
 * refusal has provably issued no write.
 */
export function planConnectCommit(
  changes: ApkgExportChangeSet,
  live: AnkiDraft,
): ConnectCommitPlan {
  const noteById = new Map(live.notes.map((note) => [note.id, note]));
  const cardById = new Map(live.cards.map((card) => [card.id, card]));
  const filteredDeckIds = new Set(
    live.decks.filter((deck) => deck.filtered).map((deck) => deck.id),
  );

  const noteWrites: ConnectNoteWrite[] = [];
  for (const change of changes.notes) {
    const note = noteById.get(change.noteId);
    if (!note) {
      throw new ConnectCommitRefusal(
        'note-missing',
        `Note ${change.noteId} is no longer in the collection.`,
      );
    }
    const write: ConnectNoteWrite = {
      noteId: numericId(change.noteId, 'note'),
      addTags: [],
      removeTags: [],
    };
    if (change.fields) {
      // Names come from the LIVE note, never from the renderer's copy: a note
      // type whose fields were renamed in Anki since the read must refuse here
      // rather than write into a field that no longer exists.
      const ordered = [...note.fields].sort((a, b) => a.ord - b.ord);
      if (ordered.length !== change.fields.length) {
        throw new ConnectCommitRefusal(
          'field-count-mismatch',
          `Note ${change.noteId} has ${ordered.length} fields in Anki but the edit carries ${change.fields.length}.`,
        );
      }
      const fields: Record<string, string> = {};
      ordered.forEach((field, index) => {
        fields[field.name] = change.fields?.[index] ?? '';
      });
      if (Object.keys(fields).length !== ordered.length) {
        throw new ConnectCommitRefusal(
          'field-count-mismatch',
          `Note ${change.noteId} has two fields with the same name; AnkiConnect keys writes by name.`,
        );
      }
      write.fields = fields;
    }
    if (change.tags) {
      const { add, remove } = diffTags(note.tags, change.tags);
      write.addTags = add;
      write.removeTags = remove;
    }
    // A change that folds to nothing against the live state is not a write.
    if (write.fields || write.addTags.length || write.removeTags.length) noteWrites.push(write);
  }

  if ((changes.cardDeckMoves ?? []).length > 0) {
    throw new ConnectCommitRefusal(
      'deck-move-unsupported',
      `This change set moves ${(changes.cardDeckMoves ?? []).length} card(s) between decks, `
        + 'which a live commit cannot yet do. Undo the split before committing.',
    );
  }

  const cardWrites: ConnectCardWrite[] = [];
  for (const move of changes.cardMoves) {
    const card = cardById.get(move.cardId);
    if (!card) {
      throw new ConnectCommitRefusal(
        'card-missing',
        `Card ${move.cardId} (note ${move.noteId}) is no longer in the collection.`,
      );
    }
    if (filteredDeckIds.has(card.deckId)) {
      throw new ConnectCommitRefusal(
        'card-filtered',
        `Card ${move.cardId} is in a filtered deck, where its position belongs to that deck's build.`,
      );
    }
    cardWrites.push({ cardId: numericId(move.cardId, 'card'), noteId: move.noteId, due: move.due });
  }

  // Refused before the first write, like every other refusal here: committing
  // the note half and dropping the deck half would be a partial success the
  // user was never told about.
  const renames = changes.deckRenames ?? [];
  if (renames.length > 0) {
    throw new ConnectCommitRefusal(
      'deck-rename-unsupported',
      renames.length === 1
        ? `Renaming "${renames[0].from}" to "${renames[0].to}" cannot be committed to a live collection.`
        : `${renames.length} deck renames cannot be committed to a live collection.`,
    );
  }

  return { noteWrites, cardWrites };
}

/**
 * Confirm every change is present in a collection RE-READ after the commit.
 *
 * Fields compare on `raw`, which is what was written. Tags compare as sets
 * because Anki's tag storage is unordered — and `marked` is excluded on both
 * sides for the reason the module header gives: the draft models it as a flag,
 * so it is never in a change set and the commit never touches it.
 */
export function verifyConnectCommit(
  changes: ApkgExportChangeSet,
  after: AnkiDraft,
): { ok: boolean; mismatches: string[] } {
  const noteById = new Map(after.notes.map((note) => [note.id, note]));
  const cardById = new Map(after.cards.map((card) => [card.id, card]));
  const mismatches: string[] = [];

  for (const change of changes.notes) {
    const note = noteById.get(change.noteId);
    if (!note) {
      mismatches.push(`note ${change.noteId}: missing`);
      continue;
    }
    if (change.fields) {
      const ordered = [...note.fields].sort((a, b) => a.ord - b.ord);
      const differs =
        ordered.length !== change.fields.length ||
        ordered.some((field, index) => field.raw !== change.fields?.[index]);
      if (differs) mismatches.push(`note ${change.noteId}: fields differ`);
    }
    if (change.tags) {
      const stored = new Set(note.tags.filter((tag) => tag.toLowerCase() !== 'marked'));
      const expected = change.tags.filter((tag) => tag.toLowerCase() !== 'marked');
      const same =
        stored.size === expected.length && expected.every((tag) => stored.has(tag));
      if (!same) mismatches.push(`note ${change.noteId}: tags differ`);
    }
  }

  for (const move of changes.cardMoves) {
    const card = cardById.get(move.cardId);
    if (!card) mismatches.push(`card ${move.cardId}: missing`);
    else if (card.due !== move.due) mismatches.push(`card ${move.cardId}: due differs`);
  }

  return { ok: mismatches.length === 0, mismatches };
}
