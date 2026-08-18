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
   * Recipe 13's split names a target deck the live collection does not have and
   * the change set does not describe, so the cards have nowhere to go.
   */
  | 'deck-missing'
  /**
   * The split's target is a filtered deck. Cards in one are on loan and Anki
   * rebuilds its contents from a search, so a card filed there by hand would be
   * evicted on the next rebuild — a move that silently undoes itself.
   */
  | 'deck-filtered'
  /**
   * Recipe 17's remove half. AnkiConnect exposes no action that removes a card
   * template, and the emulation is far worse than the deck-rename one: the only
   * route is `updateModelTemplates`, which rewrites formats and cannot drop a
   * template, so the template would have to be blanked instead — leaving every
   * card it generated in the collection, rendering empty, which is precisely the
   * `orphan` state recipe 17 exists to clear. Deleting the cards without
   * removing the template does not work either: Anki regenerates them. Refused
   * by name; exporting a package removes it for real.
   */
  | 'template-remove-unsupported'
  /**
   * The card designer's add, live. AnkiConnect does have `modelTemplateAdd`, so
   * this is refused for a reason the two above do not share: it would probably
   * WORK, and that is the problem. Anki generates the cards itself from the new
   * template's own front-side render, so which notes get a card is Anki's
   * decision — while the draft has already told the user a number
   * ("adds 3,180 cards") computed from its own paged view of the collection,
   * which for an optional-reverse is a different rule applied to a different set
   * of notes. Committing that live would make the panel's count a claim this
   * workbench did not control and could not verify afterwards. Refused by name;
   * exporting a package writes the template AND the exact card rows the draft
   * counted, and reads them back.
   */
  | 'template-add-unsupported'
  /**
   * Gate 5's flag third, live. AnkiConnect has no flag action; the only route is
   * `setSpecificValueOfCard` on `flags`, and that assigns the WHOLE column while
   * Anki keeps the colour in its low three bits and reserves the rest. The draft
   * carries the decoded colour and nothing else, so a live write would have to
   * send a bare 0-7 and clear whatever the upper bits held — state this
   * workbench never read. Refused by name; exporting a package sets the flag for
   * real, because the writer has the stored column in front of it.
   */
  | 'card-flag-unsupported'
  /** Anki or the add-on is not answering. */
  | 'unreachable'
  /** AnkiConnect answered but no collection is loaded. */
  | 'collection-unavailable'
  /** Some writes landed and some did not; `failures` names every one. */
  | 'partial'
  /**
   * Gate 7's live-commit quarter. The user stopped the batch part-way, so some
   * writes are in their collection and the rest were never sent. Deliberately
   * NOT folded into `partial`: a partial is the transport failing, which the
   * user did not choose and may want to retry as-is, while a cancel is a
   * decision — and the two need different words on screen. Never `ok`, because
   * the change set the user approved is not what the collection now holds.
   */
  | 'cancelled'
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
  /**
   * Token a cancel names to stop this commit part-way. Same shape as the package
   * reader's `readId`: the renderer mints it, the main process registers it
   * before the first write and forgets it in a `finally`, and a cancel naming an
   * unknown token answers `false` rather than failing. Omitted means the commit
   * cannot be interrupted — which is what every caller before gate 7 did.
   */
  commitId?: string;
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
  /**
   * Changes the re-read could NOT find in the collection afterwards. Read back
   * from Anki rather than derived from how far the write loop got, because after
   * a cancel those are two different numbers: a call can be sent and still not
   * land. Only set when the commit stopped early, which is the one case where
   * "how much of my change set is actually in there" has no obvious answer.
   */
  unwritten?: number;
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

/**
 * Gate 5's suspend third, as two id lists rather than one call per card:
 * `suspend`/`unsuspend` both take a card array, and a batch suspension is
 * thousands of cards.
 */
export interface ConnectSuspendWrite {
  suspend: number[];
  unsuspend: number[];
}

/**
 * Gate 5's interval/ease third. One entry per card, because
 * `setSpecificValueOfCard` addresses a single card — the same shape and the same
 * route `card-due` already commits through.
 */
export interface ConnectSchedulingWrite {
  cardId: number;
  noteId: string;
  interval: number;
  easeFactor: number;
}

/**
 * Recipe 13's split, as one call per target deck rather than one per card:
 * `changeDeck` takes a card array, and a split of a large deck is thousands of
 * cards across a handful of subdecks.
 */
export interface ConnectDeckWrite {
  /** Full `::` name. AnkiConnect addresses decks by name here, never by id. */
  deck: string;
  /** No live deck holds this name yet, so the commit creates it first. */
  create: boolean;
  /** Preset to apply after creating — the parent's, so study limits carry. */
  configId?: number;
  cardIds: number[];
}

export interface ConnectCommitPlan {
  noteWrites: ConnectNoteWrite[];
  cardWrites: ConnectCardWrite[];
  /** Absent-as-empty on a plan carrying no split. */
  deckWrites: ConnectDeckWrite[];
  /** Gate 5's suspend third. Both lists empty on a plan that suspends nothing. */
  suspendWrites: ConnectSuspendWrite;
  /** Gate 5's interval/ease third. */
  schedulingWrites: ConnectSchedulingWrite[];
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

  // Recipe 13's split. Resolved to deck NAMES against this fresh read, because
  // that is how AnkiConnect addresses a deck — and because a name is stable
  // across the create, whereas the new deck's id does not exist until Anki
  // allocates it.
  const deckWrites: ConnectDeckWrite[] = [];
  const deckMoves = changes.cardDeckMoves ?? [];
  if (deckMoves.length > 0) {
    const deckById = new Map(live.decks.map((deck) => [deck.id, deck]));
    const deckByName = new Map(live.decks.map((deck) => [deck.name, deck]));
    const described = new Map(
      (changes.deckCreates ?? []).map((create) => [create.deckId, create]),
    );
    const byName = new Map<string, ConnectDeckWrite>();
    for (const move of deckMoves) {
      const card = cardById.get(move.cardId);
      if (!card) {
        throw new ConnectCommitRefusal(
          'card-missing',
          `Card ${move.cardId} (note ${move.noteId}) is no longer in the collection.`,
        );
      }
      // On loan to a filtered deck: its real deck lives in `originalDeckId`, so
      // `changeDeck` would rewrite the loan rather than the card's actual home.
      if (card.originalDeckId !== undefined || filteredDeckIds.has(card.deckId)) {
        throw new ConnectCommitRefusal(
          'card-filtered',
          `Card ${move.cardId} is on loan to a filtered deck, so its deck is not this commit's to `
            + 'change. Empty the filtered deck in Anki first.',
        );
      }

      const liveDeck = deckById.get(move.deckId);
      const spec = described.get(move.deckId);
      // A deck the split invented may already exist live — created in Anki since
      // the draft was read. Refiling into it is what the user asked for, so this
      // is a create that turns into a plain move, not a refusal.
      const existing = liveDeck ?? (spec ? deckByName.get(spec.name) : undefined);
      if (!existing && !spec) {
        throw new ConnectCommitRefusal(
          'deck-missing',
          `Deck ${move.deckId} is not in the collection and the change set carries no name for it, `
            + 'so the cards moved into it have nowhere to go.',
        );
      }
      // Measured hole, deliberately left: `probeFilteredDecks` only probes deck
      // names the cards reference, so an EMPTY filtered deck reads as normal and
      // this check cannot see it. Closing it needs a per-target probe in the
      // transport; `planDeckSplit` already refuses a filtered parent, so the only
      // way through is a minted name colliding with an empty filtered deck.
      if (existing?.filtered) {
        throw new ConnectCommitRefusal(
          'deck-filtered',
          `"${existing.name}" is a filtered deck, which rebuilds its own contents — a card filed `
            + 'there would be evicted on the next rebuild.',
        );
      }
      const name = existing ? existing.name : (spec as { name: string }).name;
      // Already there against the LIVE state: not a write, same rule the note
      // half follows.
      if (existing && card.deckId === existing.id) continue;

      let write = byName.get(name);
      if (!write) {
        write = { deck: name, create: !existing, cardIds: [] };
        if (!existing && spec?.configId !== undefined) {
          const preset = Number(spec.configId);
          if (Number.isSafeInteger(preset) && preset > 0) write.configId = preset;
        }
        byName.set(name, write);
        deckWrites.push(write);
      }
      write.cardIds.push(numericId(move.cardId, 'card'));
    }
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

  // Gate 5's suspend third. Cards on loan to a filtered deck are refused for the
  // reposition's reason and then some: `unsuspend` restores a queue Anki derives
  // from the card's type, which for a card whose real state lives in `odid`/`odue`
  // is not the state it would return to once the filtered deck is emptied.
  const suspendWrites: ConnectSuspendWrite = { suspend: [], unsuspend: [] };
  for (const change of changes.cardQueues ?? []) {
    const card = cardById.get(change.cardId);
    if (!card) {
      throw new ConnectCommitRefusal(
        'card-missing',
        `Card ${change.cardId} (note ${change.noteId}) is no longer in the collection.`,
      );
    }
    if (card.originalDeckId !== undefined || filteredDeckIds.has(card.deckId)) {
      throw new ConnectCommitRefusal(
        'card-filtered',
        `Card ${change.cardId} is on loan to a filtered deck, so its suspension is not this `
          + "commit's to change. Empty the filtered deck in Anki first.",
      );
    }
    const wantSuspended = change.queue === 'suspended';
    // Already in that state live: not a write, the rule every other change here
    // follows against the fresh read.
    if ((card.queue === 'suspended') === wantSuspended) continue;
    const id = numericId(change.cardId, 'card');
    if (wantSuspended) suspendWrites.suspend.push(id);
    else suspendWrites.unsuspend.push(id);
  }

  // Gate 5's interval/ease third, through the same `setSpecificValueOfCard`
  // route `card-due` uses. Both are plain integer columns, so unlike `flags`
  // there is nothing packed alongside them that a whole-column write would lose.
  const schedulingWrites: ConnectSchedulingWrite[] = [];
  for (const change of changes.cardScheduling ?? []) {
    const card = cardById.get(change.cardId);
    if (!card) {
      throw new ConnectCommitRefusal(
        'card-missing',
        `Card ${change.cardId} (note ${change.noteId}) is no longer in the collection.`,
      );
    }
    if (filteredDeckIds.has(card.deckId) || card.originalDeckId !== undefined) {
      throw new ConnectCommitRefusal(
        'card-filtered',
        `Card ${change.cardId} is in a filtered deck, where its schedule belongs to that deck's build.`,
      );
    }
    if (card.interval === change.interval && card.easeFactor === change.easeFactor) continue;
    schedulingWrites.push({
      cardId: numericId(change.cardId, 'card'),
      noteId: change.noteId,
      interval: change.interval,
      easeFactor: change.easeFactor,
    });
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

  // Same position and same reason as the rename above: before write #1, so a
  // tray that also edits fields cannot land the field half and report the
  // template removal as done.
  const removals = changes.templateRemovals ?? [];
  const removedOrds = removals.reduce((sum, r) => sum + r.removedOrds.length, 0);
  if (removedOrds > 0) {
    throw new ConnectCommitRefusal(
      'template-remove-unsupported',
      removedOrds === 1
        ? 'Removing a card template cannot be committed to a live collection. Export a package instead.'
        : `Removing ${removedOrds} card templates cannot be committed to a live collection. Export a package instead.`,
    );
  }

  // The designer's add, refused in the same place and for the same structural
  // reason: before write #1, so a tray that also edits fields cannot land the
  // field half and report the design as committed.
  const adds = changes.templateAdds ?? [];
  if (adds.length > 0) {
    const cards = adds.reduce((sum, a) => sum + a.cards.length, 0);
    throw new ConnectCommitRefusal(
      'template-add-unsupported',
      `Adding a card template cannot be committed to a live collection: Anki would generate the `
        + `cards itself, so the ${cards} this design counted is not a number this workbench could `
        + 'guarantee live. Export a package instead.',
    );
  }

  // Gate 5's flag third, refused in the same place and for the same structural
  // reason as the two above: before write #1, so a batch that also suspends
  // cards cannot land the suspension and report the flags as done.
  const flags = changes.cardFlags ?? [];
  if (flags.length > 0) {
    throw new ConnectCommitRefusal(
      'card-flag-unsupported',
      flags.length === 1
        ? `Setting card ${flags[0].cardId}'s flag cannot be committed to a live collection. `
          + 'Export a package instead.'
        : `${flags.length} card flags cannot be committed to a live collection. Export a package instead.`,
    );
  }

  return { noteWrites, cardWrites, deckWrites, suspendWrites, schedulingWrites };
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

  // Gate 5's suspend third, verified as SUSPENDEDNESS rather than as the exact
  // queue number. That is not a weaker check, it is the correct one: live,
  // `unsuspend` restores a queue Anki recomputes from the card's type, so
  // demanding the draft's own restored value would fail a commit that did
  // exactly what it said. The package writer, which chooses the number itself,
  // is verified against the number (`verifyExportChanges`).
  for (const change of changes.cardQueues ?? []) {
    const card = cardById.get(change.cardId);
    if (!card) {
      mismatches.push(`card ${change.cardId}: missing`);
      continue;
    }
    const want = change.queue === 'suspended';
    if ((card.queue === 'suspended') !== want) {
      mismatches.push(`card ${change.cardId}: ${want ? 'not suspended' : 'still suspended'}`);
    }
  }

  for (const change of changes.cardScheduling ?? []) {
    const card = cardById.get(change.cardId);
    if (!card) {
      mismatches.push(`card ${change.cardId}: missing`);
      continue;
    }
    if (card.interval !== change.interval) mismatches.push(`card ${change.cardId}: interval differs`);
    if (card.easeFactor !== change.easeFactor) mismatches.push(`card ${change.cardId}: ease differs`);
  }

  // The split. A deck the commit created is resolved by NAME out of the re-read
  // collection, never from the id the commit happened to receive, so this
  // confirms both that the deck exists and that the card is in it.
  const deckMoves = changes.cardDeckMoves ?? [];
  if (deckMoves.length > 0) {
    const deckById = new Map(after.decks.map((deck) => [deck.id, deck]));
    const idByName = new Map(after.decks.map((deck) => [deck.name, deck.id]));
    const describedName = new Map(
      (changes.deckCreates ?? []).map((create) => [create.deckId, create.name]),
    );
    for (const move of deckMoves) {
      const name = deckById.get(move.deckId)?.name ?? describedName.get(move.deckId);
      const expected = name === undefined ? undefined : idByName.get(name);
      if (expected === undefined) {
        mismatches.push(`deck ${move.deckId}: missing`);
        continue;
      }
      const card = cardById.get(move.cardId);
      if (!card) mismatches.push(`card ${move.cardId}: missing`);
      else if (card.deckId !== expected) mismatches.push(`card ${move.cardId}: deck differs`);
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
