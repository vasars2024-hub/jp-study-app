// Safe single-note edits on a draft — ANKI_DECK_WORKBENCH_PLAN.md Phase 2
// ("safe single-note/card field, tag, deck, and local-mastery edits").
//
// Everything here edits the *draft*, never a collection. Nothing is committed
// to Anki or to a file by this module; Phase 6 owns that. What Phase 2 owes the
// user is that an edit is honest about its consequences and that it can be taken
// back, so every edit is recorded as a reversible op with its own before-image
// and the journal is the single source of "what changed".
//
// Three consequences the plan explicitly refuses to hide:
//
//  1. `normalized` is what search, dedupe and the Browser read. An edit that
//     updated `raw` alone would leave the row showing its old text and the
//     search index quietly wrong, so the normalizer is required, not optional.
//  2. A field can carry media. Editing it can orphan a reference or introduce
//     one the package does not contain, so the note's `media` is recomputed and
//     the caller is told when a reference went missing.
//  3. **Cloze fields generate cards.** Adding `{{c3::…}}` to a cloze note means
//     Anki would generate a third card, and nothing in a draft can generate it.
//     Rather than pretend, the edit reports `clozeOrdinalsAdded` /
//     `clozeOrdinalsRemoved` so the surface can say a card would appear or
//     disappear on commit. Refusing the edit would be worse: the text change is
//     legitimate and it is the *card* consequence that is out of scope here.

import type {
  AnkiCardFlag,
  AnkiCardQueue,
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftDeck,
  AnkiDraftMediaRef,
  AnkiDraftNote,
  AnkiDraftSource,
  AnkiDraftTemplate,
} from './ankiDraft';
import { deckPath, mediaRefsInField } from './ankiDraft';
import { stripFieldHtml } from './apkgParse';

/** Anki's "marked" flag is a tag; the model surfaces it separately. */
export const MARKED_TAG = 'marked';

/** Whitespace-collapse only, for a source that declared its fields plain text. */
export function collapsePlainText(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The normalizer the source itself was read with. An edit must reuse it, or the
 * edited row's `normalized` text stops meaning the same thing as every other
 * row's and search starts disagreeing with itself.
 */
export function draftFieldNormalizer(source: AnkiDraftSource): (raw: string) => string {
  return source.plainText ? collapsePlainText : stripFieldHtml;
}

/**
 * Ops produced together by one batch (the Phase 3 change tray) share a `group`,
 * and undo/redo move a whole group at a time. A tray run over 3,000 notes that
 * needed 3,000 undos would be reversible only in the arithmetic sense.
 * A single edit has no group and is therefore its own step.
 */
/**
 * The two scheduling columns gate 5 names, carried as one value.
 *
 * A pair rather than two ops: Anki answers a review by writing both, and a
 * journal that could hold one without the other would let an undo restore half
 * a card's schedule.
 */
export interface AnkiCardScheduling {
  /** Days, in `AnkiDraftCard.interval`'s own units — negatives preserved. */
  interval: number;
  /** Permille, as `AnkiDraftCard.easeFactor`: 2500 is 250%. */
  easeFactor: number;
}

/** Anki's own floor and a sane ceiling; below 1300 the scheduler clamps anyway. */
export const MIN_EASE_FACTOR = 1300;
export const MAX_EASE_FACTOR = 10_000;

export type AnkiDraftEditOp =
  | {
      kind: 'field';
      noteId: string;
      fieldOrd: number;
      /** Verbatim previous value, so undo restores bytes rather than a re-render. */
      before: string;
      after: string;
      group?: string;
    }
  | { kind: 'tags'; noteId: string; before: string[]; after: string[]; group?: string }
  | {
      /**
       * A **new** card's queue position (Anki's `due` for `type: 'new'`). The
       * only card-level op the journal carries, and deliberately the narrowest
       * one: repositioning is reversible by writing a number back, whereas a
       * queue or type change would have to reconstruct `left`, `originalDue` and
       * a review history the draft never held. `noteId` rides along so
       * `editedNoteIds` and the Browser's edited badge keep working unchanged.
       */
      kind: 'card-due';
      noteId: string;
      cardId: string;
      before: number;
      after: number;
      group?: string;
    }
  | {
      /**
       * The deck a card sits in — recipe 13's split. Reversible by writing the
       * old id back, because that is the whole of what a move is: Anki stores a
       * card's deck as one id on the card and nothing else changes. The decks a
       * split *creates* are not journalled; undoing the moves empties them
       * rather than deleting them, which is the reversal a user can see and
       * finish by hand, and is far safer than a delete this op could not undo.
       */
      kind: 'card-deck';
      noteId: string;
      cardId: string;
      before: string;
      after: string;
      group?: string;
    }
  | {
      /**
       * A deck's name — recipe 12's deck half. One of the two ops in the journal
       * that belong to no note, because a deck rename touches no note and no
       * card: a card names its deck by id, and Anki derives the tree from the
       * name, so writing the old string back is a complete inverse. Ops with no
       * `noteId` are skipped by `editedNoteIds`, which is why the Browser's
       * edited badge does not light up for a deck the user renamed.
       */
      kind: 'deck-name';
      deckId: string;
      before: string;
      after: string;
      group?: string;
    }
  | {
      /**
       * A card's browser flag — acceptance gate 5's flag third.
       *
       * The narrowest of the three card-state ops added for that gate, and the
       * only one with no derived state at all: Anki keeps the colour in the low
       * three bits of `cards.flags`, nothing is computed from it, so writing the
       * old colour back is a complete inverse. The op carries the DECODED colour
       * rather than the raw column, because the reserved upper bits are not the
       * workbench's to model — the package writer preserves them by rewriting
       * only the low three, which is also why this capability is refused live
       * (`ankiConnectCommit.ts`).
       */
      kind: 'card-flag';
      noteId: string;
      cardId: string;
      before: AnkiCardFlag;
      after: AnkiCardFlag;
      group?: string;
    }
  | {
      /**
       * Suspension — gate 5's suspend third, and **only** suspension even though
       * the column it writes is the whole queue. Burying is Anki's own
       * until-tomorrow state, unburied by its scheduler at the next day rollover;
       * a workbench that wrote `buried-user` would be staging a change Anki
       * undoes by itself. So `after` is either `suspended` or the queue the card
       * returns to, and never `buried-sibling`/`buried-user`.
       *
       * Unsuspending a card the SOURCE already held suspended has no recorded
       * queue to return to. Anki stores none either — it recomputes from `type`
       * — so `restoredQueue` mirrors that computation, and a card whose type did
       * not decode is refused (`unknown-card-state`) rather than guessed into a
       * queue its scheduler would then misread.
       */
      kind: 'card-queue';
      noteId: string;
      cardId: string;
      before: AnkiCardQueue;
      after: AnkiCardQueue;
      group?: string;
    }
  | {
      /**
       * Interval and ease — gate 5's interval/ease third. The two columns move
       * together because they are one decision: an interval written without the
       * ease that produced it is a card whose next answer jumps back.
       *
       * `reps`, `lapses` and `left` are deliberately NOT here and stay read-only
       * (`card-review-counters` in the parity matrix). They are counters the
       * revlog still holds the rows for, so writing one would put the card's
       * summary and its own review history into disagreement — a falsified log,
       * not an edit. Interval and ease carry no such second copy.
       */
      kind: 'card-scheduling';
      noteId: string;
      cardId: string;
      before: AnkiCardScheduling;
      after: AnkiCardScheduling;
      group?: string;
    }
  | {
      /**
       * One removed card template — recipe 17's remove half. The journal's rule
       * is that every op is a complete inverse (see `card-due` above, which is
       * deliberately the narrowest card op for exactly that reason), and a
       * template removal is the most destructive thing the workbench can do: it
       * drops a template AND deletes every card that template generated AND
       * renumbers the survivors on both sides.
       *
       * So the op carries all three verbatim rather than recomputing them. That
       * is legitimate here, unlike the review history `card-due` refuses to
       * reconstruct, because the draft genuinely holds these rows at the moment
       * the removal runs — `applyTemplateRemoval` reads them out of it. Bounded
       * by cards-per-template, 2,000 on the largest real package measured.
       *
       * The second op with no `noteId`: a removal spans every note of the note
       * type, so attributing it to one of them would be false about the rest.
       */
      kind: 'template-remove';
      noteTypeId: string;
      /** The removed template exactly as it stood, at its SOURCE ord. */
      template: AnkiDraftTemplate;
      /**
       * Every card row the removal deleted, verbatim and with their source
       * `ord`. Undo re-inserts these; nothing else can, because a deleted card
       * carries scheduling state that cannot be derived from the note.
       */
      cards: AnkiDraftCard[];
      /**
       * Where each `cards[i]` sat in `draft.cards` before the removal.
       *
       * This is the first op in the journal that changes an array's LENGTH, so
       * it is also the first that can put rows back in a different order than it
       * found them. Appending them instead would make undo set-equal but not
       * position-equal, and the Browser renders that array in order — the user
       * would see their undo shuffle the card table. Carrying the index makes
       * the inverse exact for the same reason `field` carries `before` verbatim
       * rather than re-deriving it.
       */
      cardIndexes: number[];
      /**
       * Survivors this removal moved: `from` is the source ord, `to` the ord
       * after it. Undo maps `to` back to `from` on both the templates and the
       * cards. Empty when the removed template was last in the list.
       */
      renumbered: { from: number; to: number }[];
      group?: string;
    };

export interface AnkiDraftEditJournal {
  /** Applied ops, oldest first. */
  done: AnkiDraftEditOp[];
  /** Ops taken back, most recently undone last. Cleared by any new edit. */
  undone: AnkiDraftEditOp[];
}

export function createEditJournal(): AnkiDraftEditJournal {
  return { done: [], undone: [] };
}

export interface AnkiDraftEditResult {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  /** False when the edit was a no-op or the target did not exist. */
  changed: boolean;
  /** Set when the edit could not run, so a caller never sees a silent no-op. */
  reason?:
    | 'no-such-note'
    | 'no-such-field'
    | 'unchanged'
    | 'no-such-deck'
    /** Another deck already holds that name. Renaming onto it would be a merge. */
    | 'duplicate-deck-name'
    /** A deck cannot be nameless, and a blank name would vanish from the tree. */
    | 'empty-deck-name'
    /** The draft holds no card with that id. */
    | 'no-such-card'
    /**
     * Unsuspending a card whose `type` did not decode. Anki recomputes the
     * restored queue from the type, so there is nothing to restore it to and a
     * guess would file the card into a queue its scheduler reads differently.
     */
    | 'unknown-card-state'
    /**
     * Interval/ease on a card that has never graduated. A new card's schedule is
     * `ivl 0, factor 0` by definition, and writing days onto one without also
     * moving `type`/`queue` — which this journal deliberately does not do — makes
     * a card Anki shows as new and schedules as a review.
     */
    | 'card-not-scheduled'
    /** An interval or ease outside what Anki's own scheduler can store. */
    | 'invalid-scheduling';
  /** Media file names the edit removed the last reference to, within this note. */
  mediaDropped?: string[];
  /** Media references the edit introduced that the source does not contain. */
  mediaMissing?: string[];
  /** Cloze numbers the edit added — each would generate a card on commit. */
  clozeOrdinalsAdded?: number[];
  /** Cloze numbers the edit removed — each would orphan a card on commit. */
  clozeOrdinalsRemoved?: number[];
}

const CLOZE_RE = /\{\{c(\d+)::/g;

export function clozeOrdinals(raw: string): number[] {
  const out = new Set<number>();
  for (const m of raw.matchAll(CLOZE_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Anki tags are whitespace-separated, so a tag containing a space cannot exist.
 * Empties are dropped and duplicates collapse, keeping first-seen order —
 * sorting would reorder a user's tags for no reason.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    for (const part of String(tag).split(/\s+/)) {
      if (part && !out.includes(part)) out.push(part);
    }
  }
  return out;
}

function findNote(draft: AnkiDraft, noteId: string): AnkiDraftNote | undefined {
  return draft.notes.find((n) => n.id === noteId);
}

function replaceNote(draft: AnkiDraft, next: AnkiDraftNote): AnkiDraft {
  return { ...draft, notes: draft.notes.map((n) => (n.id === next.id ? next : n)) };
}

/** Every media file name the source actually holds, from the notes as read. */
export function presentMediaNames(draft: AnkiDraft): Set<string> {
  const names = new Set<string>();
  for (const note of draft.notes) {
    for (const ref of note.media) if (ref.present) names.add(ref.fileName);
  }
  return names;
}

/**
 * Lookups a batch computes once and reuses across thousands of edits. Both are
 * whole-draft scans, and doing either per edit is what makes a tray quadratic:
 * at 8,000 notes that was 3.0 s of frame time for a preview that is recomputed
 * on every render.
 */
export interface DraftEditIndex {
  /** Note id to its position in `draft.notes`. */
  position: Map<string, number>;
  present: Set<string>;
  clozeTypeIds: Set<string>;
  /** Card id to its position in `draft.cards`, for the `card-due` op. */
  cardPosition: Map<string, number>;
  /** Deck id to its position in `draft.decks`, for the `deck-name` op. */
  deckPosition: Map<string, number>;
}

export function createDraftEditIndex(draft: AnkiDraft): DraftEditIndex {
  const position = new Map<string, number>();
  draft.notes.forEach((note, i) => position.set(note.id, i));
  const cardPosition = new Map<string, number>();
  draft.cards.forEach((card, i) => cardPosition.set(card.id, i));
  const deckPosition = new Map<string, number>();
  draft.decks.forEach((deck, i) => deckPosition.set(deck.id, i));
  return {
    position,
    present: presentMediaNames(draft),
    clozeTypeIds: new Set(draft.noteTypes.filter((nt) => nt.kind === 'cloze').map((nt) => nt.id)),
    cardPosition,
    deckPosition,
  };
}

/**
 * Rewrite every deck's `path` and `parentId` from its current name. Anki stores
 * the tree in the names alone, so a rename can create a parent link (`JLPT ::N5`
 * trimmed to `JLPT::N5` now has a parent) or break one, and leaving the old
 * links in place would show the user a tree that disagrees with the names beside
 * it. Whole-array because one rename can change another deck's parentage.
 */
export function relinkDeckParents(decks: readonly AnkiDraftDeck[]): AnkiDraftDeck[] {
  const byName = new Map<string, string>();
  for (const deck of decks) byName.set(deck.name, deck.id);
  return decks.map((deck) => {
    const path = deckPath(deck.name);
    const parentPath = path.slice(0, -1);
    // Both separators, exactly as `buildAnkiDraft` looks a parent up: the two
    // Anki schemas disagree and a draft may have been built from either, so a
    // relink that knew only `::` would drop links the read had found.
    const parentId = parentPath.length
      ? byName.get(parentPath.join('::')) ?? byName.get(parentPath.join('\x1f'))
      : undefined;
    return { ...deck, path, parentId };
  });
}

/**
 * Rename one deck. Reversible by writing the old name back, and that is the
 * whole operation: no card moves, because a card names its deck by id.
 *
 * Refused rather than merged when another deck already holds the name —
 * combining two decks means moving cards and rewriting their scheduling, which
 * is not what a rename says it does.
 */
export function renameDraftDeck(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  deckId: string,
  name: string,
): AnkiDraftEditResult {
  const deck = draft.decks.find((d) => d.id === deckId);
  if (!deck) return { draft, journal, changed: false, reason: 'no-such-deck' };
  if (name.trim() === '') return { draft, journal, changed: false, reason: 'empty-deck-name' };
  if (name === deck.name) return { draft, journal, changed: false, reason: 'unchanged' };
  if (draft.decks.some((d) => d.id !== deckId && d.name === name)) {
    return { draft, journal, changed: false, reason: 'duplicate-deck-name' };
  }
  const decks = relinkDeckParents(
    draft.decks.map((d) => (d.id === deckId ? { ...d, name } : d)),
  );
  return {
    draft: { ...draft, decks },
    journal: {
      done: [...journal.done, { kind: 'deck-name', deckId, before: deck.name, after: name }],
      undone: [],
    },
    changed: true,
  };
}

// ----- card state: gate 5's flag, suspension and interval/ease -------------------

function findCard(draft: AnkiDraft, cardId: string): AnkiDraftCard | undefined {
  return draft.cards.find((c) => c.id === cardId);
}

function replaceCard(draft: AnkiDraft, next: AnkiDraftCard): AnkiDraft {
  return { ...draft, cards: draft.cards.map((c) => (c.id === next.id ? next : c)) };
}

/**
 * The queue an unsuspended card returns to, or `null` when it cannot be known.
 *
 * Anki stores no "queue before suspension" either — it recomputes from `type` —
 * so this mirrors that computation rather than inventing a memory the collection
 * does not have. The learning split is on `due`, which for an intraday learning
 * card is an epoch second and for a day-learn card a day number: the boundary is
 * not arbitrary, because a day number reaching 10^9 would be a collection 2.7
 * million years old and an epoch second has not been below it since 2001.
 */
export function restoredQueue(card: AnkiDraftCard): AnkiCardQueue | null {
  switch (card.type) {
    case 'new':
      return 'new';
    case 'review':
      return 'review';
    case 'learning':
    case 'relearning':
      return card.due >= 1_000_000_000 ? 'learning' : 'day-learn';
    default:
      return null;
  }
}

/** Set (or clear) a card's browser flag. */
export function setCardFlag(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  cardId: string,
  flag: AnkiCardFlag,
): AnkiDraftEditResult {
  const card = findCard(draft, cardId);
  if (!card) return { draft, journal, changed: false, reason: 'no-such-card' };
  if (card.flag === flag) return { draft, journal, changed: false, reason: 'unchanged' };
  return {
    draft: replaceCard(draft, { ...card, flag }),
    journal: {
      done: [
        ...journal.done,
        { kind: 'card-flag', noteId: card.noteId, cardId, before: card.flag, after: flag },
      ],
      undone: [],
    },
    changed: true,
  };
}

/**
 * Suspend or unsuspend one card.
 *
 * A card already buried is left alone rather than "unsuspended" into its normal
 * queue: burying is the scheduler's own until-tomorrow state and lifting it here
 * would undo something the user did in Anki, which is not what this asks for.
 */
export function setCardSuspended(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  cardId: string,
  suspended: boolean,
): AnkiDraftEditResult {
  const card = findCard(draft, cardId);
  if (!card) return { draft, journal, changed: false, reason: 'no-such-card' };
  // Suspending a buried card is legitimate — suspension outranks a bury — so
  // only the suspended state itself, not any "not normal" state, is the no-op.
  if ((card.queue === 'suspended') === suspended) {
    return { draft, journal, changed: false, reason: 'unchanged' };
  }
  const after = suspended ? 'suspended' : restoredQueue(card);
  if (after === null) return { draft, journal, changed: false, reason: 'unknown-card-state' };
  return {
    draft: replaceCard(draft, { ...card, queue: after }),
    journal: {
      done: [
        ...journal.done,
        { kind: 'card-queue', noteId: card.noteId, cardId, before: card.queue, after },
      ],
      undone: [],
    },
    changed: true,
  };
}

/** Write a card's interval and ease together. */
export function setCardScheduling(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  cardId: string,
  next: AnkiCardScheduling,
): AnkiDraftEditResult {
  const card = findCard(draft, cardId);
  if (!card) return { draft, journal, changed: false, reason: 'no-such-card' };
  if (card.type === 'new' || card.type === 'unknown') {
    return { draft, journal, changed: false, reason: 'card-not-scheduled' };
  }
  if (
    !Number.isSafeInteger(next.interval) ||
    !Number.isSafeInteger(next.easeFactor) ||
    next.easeFactor < MIN_EASE_FACTOR ||
    next.easeFactor > MAX_EASE_FACTOR
  ) {
    return { draft, journal, changed: false, reason: 'invalid-scheduling' };
  }
  if (card.interval === next.interval && card.easeFactor === next.easeFactor) {
    return { draft, journal, changed: false, reason: 'unchanged' };
  }
  return {
    draft: replaceCard(draft, { ...card, interval: next.interval, easeFactor: next.easeFactor }),
    journal: {
      done: [
        ...journal.done,
        {
          kind: 'card-scheduling',
          noteId: card.noteId,
          cardId,
          before: { interval: card.interval, easeFactor: card.easeFactor },
          after: { ...next },
        },
      ],
      undone: [],
    },
    changed: true,
  };
}

export interface FieldWriteOutcome {
  note: AnkiDraftNote;
  mediaDropped: string[];
  mediaMissing: string[];
  clozeOrdinalsAdded: number[];
  clozeOrdinalsRemoved: number[];
}

/**
 * The whole consequence calculation, shared by a single edit, a batch and every
 * undo. `present` is injected rather than derived so a batch can compute it once:
 * the set describes what the *source package* holds, which no draft edit changes,
 * so freezing it for the duration of a batch is also the more correct reading.
 */
export function writeNoteField(
  note: AnkiDraftNote,
  fieldOrd: number,
  raw: string,
  normalize: (raw: string) => string,
  isCloze: boolean,
  present: Set<string>,
): FieldWriteOutcome {
  const before = note.fields.find((f) => f.ord === fieldOrd)?.raw ?? '';
  const fields = note.fields.map((f) =>
    f.ord === fieldOrd ? { ...f, raw, normalized: normalize(raw) } : f,
  );

  const kept = note.media.filter((m) => m.fieldOrd !== fieldOrd);
  const fresh = mediaRefsInField(raw, fieldOrd, (name) => present.has(name));
  const media: AnkiDraftMediaRef[] = [...kept, ...fresh].sort(
    (a, b) => a.fieldOrd - b.fieldOrd || a.reference.localeCompare(b.reference),
  );

  const wasInField = new Set(
    note.media.filter((m) => m.fieldOrd === fieldOrd).map((m) => m.fileName),
  );
  const nowInField = new Set(fresh.map((m) => m.fileName));
  const stillElsewhere = new Set(kept.map((m) => m.fileName));

  return {
    note: { ...note, fields, media },
    mediaDropped: [...wasInField].filter((n) => !nowInField.has(n) && !stillElsewhere.has(n)),
    mediaMissing: fresh.filter((m) => !m.present).map((m) => m.fileName),
    clozeOrdinalsAdded: isCloze
      ? clozeOrdinals(raw).filter((n) => !clozeOrdinals(before).includes(n))
      : [],
    clozeOrdinalsRemoved: isCloze
      ? clozeOrdinals(before).filter((n) => !clozeOrdinals(raw).includes(n))
      : [],
  };
}

export function setNoteField(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  noteId: string,
  fieldOrd: number,
  raw: string,
  normalize: (raw: string) => string,
): AnkiDraftEditResult {
  const note = findNote(draft, noteId);
  if (!note) return { draft, journal, changed: false, reason: 'no-such-note' };
  const field = note.fields.find((f) => f.ord === fieldOrd);
  if (!field) return { draft, journal, changed: false, reason: 'no-such-field' };
  // A no-op must not enter the journal: an undo that restores nothing is a lie
  // about what the user did.
  if (field.raw === raw) return { draft, journal, changed: false, reason: 'unchanged' };

  const isCloze = draft.noteTypes.find((nt) => nt.id === note.noteTypeId)?.kind === 'cloze';
  const out = writeNoteField(note, fieldOrd, raw, normalize, isCloze, presentMediaNames(draft));
  return {
    draft: replaceNote(draft, out.note),
    journal: {
      done: [...journal.done, { kind: 'field', noteId, fieldOrd, before: field.raw, after: raw }],
      // A fresh edit forks the history; a redo past it would reapply an op
      // computed against a draft that no longer exists.
      undone: [],
    },
    changed: true,
    mediaDropped: out.mediaDropped,
    mediaMissing: out.mediaMissing,
    clozeOrdinalsAdded: out.clozeOrdinalsAdded,
    clozeOrdinalsRemoved: out.clozeOrdinalsRemoved,
  };
}

export function setNoteTags(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  noteId: string,
  tags: readonly string[],
): AnkiDraftEditResult {
  const note = findNote(draft, noteId);
  if (!note) return { draft, journal, changed: false, reason: 'no-such-note' };
  const after = normalizeTags(tags);
  if (after.length === note.tags.length && after.every((t, i) => t === note.tags[i])) {
    return { draft, journal, changed: false, reason: 'unchanged' };
  }
  // `marked` is a tag in the data and a flag in the model; letting them disagree
  // would make the Browser's marked column contradict the tag column.
  const next = { ...note, tags: after, marked: after.includes(MARKED_TAG) };
  return {
    draft: replaceNote(draft, next),
    journal: {
      done: [...journal.done, { kind: 'tags', noteId, before: note.tags, after }],
      undone: [],
    },
    changed: true,
  };
}

/**
 * Undo one op into a working array. Mutating `notes` here is safe and is the
 * point: it is a copy the caller made for this step, and rebuilding the whole
 * array per op is what made undoing a 3,000-note batch quadratic.
 */
function applyInverseInto(
  notes: AnkiDraftNote[],
  cards: AnkiDraftCard[],
  decks: AnkiDraftDeck[],
  index: DraftEditIndex,
  op: AnkiDraftEditOp,
  toValue: 'before' | 'after',
  normalize: (raw: string) => string,
): void {
  if (op.kind === 'deck-name') {
    const deckAt = index.deckPosition.get(op.deckId);
    if (deckAt === undefined) return;
    const deck = decks[deckAt];
    if (!deck) return;
    // `path`/`parentId` are relinked once for the whole step by the caller: one
    // undo of a 40-deck group would otherwise rebuild the tree 40 times, and an
    // intermediate relink can see a name collision the finished step does not.
    decks[deckAt] = { ...deck, name: op[toValue] };
    return;
  }
  if (op.kind === 'card-due') {
    const cardAt = index.cardPosition.get(op.cardId);
    if (cardAt === undefined) return;
    const card = cards[cardAt];
    if (!card) return;
    cards[cardAt] = { ...card, due: op[toValue] };
    return;
  }
  if (op.kind === 'card-deck') {
    const cardAt = index.cardPosition.get(op.cardId);
    if (cardAt === undefined) return;
    const card = cards[cardAt];
    if (!card) return;
    cards[cardAt] = { ...card, deckId: op[toValue] };
    return;
  }
  // Gate 5's three card-state ops. Each restores a stored value verbatim, so
  // none of them re-derives anything on the way back — an unsuspend that
  // recomputed `restoredQueue` here would put the card in a queue the op's own
  // `before` says it was not in.
  if (op.kind === 'card-flag') {
    const cardAt = index.cardPosition.get(op.cardId);
    if (cardAt === undefined) return;
    const card = cards[cardAt];
    if (!card) return;
    cards[cardAt] = { ...card, flag: op[toValue] };
    return;
  }
  if (op.kind === 'card-queue') {
    const cardAt = index.cardPosition.get(op.cardId);
    if (cardAt === undefined) return;
    const card = cards[cardAt];
    if (!card) return;
    cards[cardAt] = { ...card, queue: op[toValue] };
    return;
  }
  if (op.kind === 'card-scheduling') {
    const cardAt = index.cardPosition.get(op.cardId);
    if (cardAt === undefined) return;
    const card = cards[cardAt];
    if (!card) return;
    const state = op[toValue];
    cards[cardAt] = { ...card, interval: state.interval, easeFactor: state.easeFactor };
    return;
  }
  // Already handled by `applyTemplateRemovalOps`, whose work cannot be expressed
  // through the positional index this function writes through. Returning rather
  // than falling into the note branch below, which would read a `noteId` this op
  // deliberately does not have.
  if (op.kind === 'template-remove') return;
  const at = index.position.get(op.noteId);
  if (at === undefined) return;
  const note = notes[at];
  if (!note) return;
  if (op.kind === 'tags') {
    const tags = op[toValue];
    notes[at] = { ...note, tags, marked: tags.includes(MARKED_TAG) };
    return;
  }
  const isCloze = index.clozeTypeIds.has(note.noteTypeId);
  notes[at] = writeNoteField(
    note,
    op.fieldOrd,
    op[toValue],
    normalize,
    isCloze,
    index.present,
  ).note;
}

/**
 * Undo or redo the `template-remove` ops of one step, as a whole-step pass.
 *
 * Structural on purpose, and kept out of `applyInverseInto` for a reason that is
 * not stylistic: that function writes through `DraftEditIndex`, which maps an id
 * to a **fixed position** in an array built once per step. Re-inserting deleted
 * card rows changes the array's length and therefore every position after the
 * insert, so a positional index cannot survive it. Running the structural ops
 * first and building the index from the result keeps the fast path exactly as it
 * was — this is gated by `step.some(...)` the way `relinkDeckParents` already is,
 * so a step with no removal in it pays nothing.
 *
 * `direction: 'before'` undoes (restore template, un-renumber, re-insert cards);
 * `'after'` redoes (drop template, renumber, delete cards). Both are derived from
 * the op alone, never recomputed against the audit, so an undo cannot disagree
 * with the removal it reverses.
 */
function applyTemplateRemovalOps(
  draft: AnkiDraft,
  ops: readonly AnkiDraftEditOp[],
  direction: 'before' | 'after',
): { noteTypes: AnkiDraft['noteTypes']; cards: AnkiDraftCard[] } {
  let noteTypes = draft.noteTypes;
  let cards = draft.cards;

  for (const op of ops) {
    if (op.kind !== 'template-remove') continue;
    // `from` is always the SOURCE ord, so undo reads the map backwards.
    const ordMap = new Map(
      direction === 'before'
        ? op.renumbered.map((r) => [r.to, r.from])
        : op.renumbered.map((r) => [r.from, r.to]),
    );
    const noteIds = new Set(
      draft.notes.filter((n) => n.noteTypeId === op.noteTypeId).map((n) => n.id),
    );

    noteTypes = noteTypes.map((noteType) => {
      if (noteType.id !== op.noteTypeId) return noteType;
      const kept =
        direction === 'before'
          ? // Restore at the source ord, then re-sort: the template's own ord is
            // the authority, not its position in the array as it stands now.
            [...noteType.templates.map((t) => ({ ...t, ord: ordMap.get(t.ord) ?? t.ord })), op.template]
          : noteType.templates
              .filter((t) => t.ord !== op.template.ord)
              .map((t) => ({ ...t, ord: ordMap.get(t.ord) ?? t.ord }));
      return { ...noteType, templates: kept.sort((a, b) => a.ord - b.ord) };
    });

    const renumber = (card: AnkiDraftCard): AnkiDraftCard => {
      if (!noteIds.has(card.noteId)) return card;
      const next = ordMap.get(card.ord);
      return next === undefined || next === card.ord ? card : { ...card, ord: next };
    };

    if (direction === 'before') {
      // Renumber the survivors back first, THEN splice — the restored rows
      // already carry their source ords and must not be renumbered again.
      const survivors = cards.map(renumber);
      // Ascending by source index, so each splice lands in an array that already
      // holds every earlier restored row and the index still means what it did.
      const restores = op.cards
        .map((card, i) => ({ card, at: op.cardIndexes[i] ?? survivors.length }))
        .sort((a, b) => a.at - b.at);
      const next = [...survivors];
      for (const { card, at } of restores) {
        next.splice(Math.min(Math.max(at, 0), next.length), 0, card);
      }
      cards = next;
    } else {
      const doomed = new Set(op.cards.map((c) => c.id));
      cards = cards.filter((c) => !doomed.has(c.id)).map(renumber);
    }
  }

  return { noteTypes, cards };
}

/**
 * The trailing ops that form one user-visible step: a whole group, or the single
 * ungrouped op. Returned in the order they were applied, so an inverse pass has
 * to walk it backwards and a redo pass forwards.
 */
export function trailingStep(ops: readonly AnkiDraftEditOp[]): AnkiDraftEditOp[] {
  const last = ops[ops.length - 1];
  if (!last) return [];
  if (!last.group) return [last];
  let start = ops.length - 1;
  while (start > 0 && ops[start - 1].group === last.group) start -= 1;
  return ops.slice(start);
}

/** Steps a user would count, with each batch counting once. */
export function countJournalSteps(ops: readonly AnkiDraftEditOp[]): number {
  let steps = 0;
  let previous: string | undefined;
  for (const op of ops) {
    if (!op.group || op.group !== previous) steps += 1;
    previous = op.group;
  }
  return steps;
}

export function undoLastEdit(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  normalize: (raw: string) => string,
): AnkiDraftEditResult {
  const step = trailingStep(journal.done);
  if (step.length === 0) return { draft, journal, changed: false, reason: 'unchanged' };
  // Structural first, and the index is built from its result: re-inserting card
  // rows moves every position after the insert, so an index built before this
  // would address the wrong rows for the rest of the step.
  const structural = step.some((op) => op.kind === 'template-remove')
    ? applyTemplateRemovalOps(draft, [...step].reverse(), 'before')
    : null;
  const base = structural ? { ...draft, ...structural } : draft;
  // Newest first: two ops on one field must be unwound in the order they were
  // written, or the older op's `before` loses to the newer one's.
  const notes = [...base.notes];
  const cards = [...base.cards];
  let decks = [...base.decks];
  const index = createDraftEditIndex(base);
  for (let i = step.length - 1; i >= 0; i -= 1) {
    applyInverseInto(notes, cards, decks, index, step[i], 'before', normalize);
  }
  if (step.some((op) => op.kind === 'deck-name')) decks = relinkDeckParents(decks);
  return {
    draft: { ...base, notes, cards, decks },
    // `undone` keeps applied order, so redo can replay the group forwards.
    journal: { done: journal.done.slice(0, -step.length), undone: [...journal.undone, ...step] },
    changed: true,
  };
}

export function redoLastEdit(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  normalize: (raw: string) => string,
): AnkiDraftEditResult {
  const step = trailingStep(journal.undone);
  if (step.length === 0) return { draft, journal, changed: false, reason: 'unchanged' };
  // Structural first, for `undoLastEdit`'s reason — here the deletes shorten the
  // array instead of lengthening it, which invalidates a prebuilt index just as
  // thoroughly. Forwards, since a redo replays the step in applied order.
  const structural = step.some((op) => op.kind === 'template-remove')
    ? applyTemplateRemovalOps(draft, step, 'after')
    : null;
  const base = structural ? { ...draft, ...structural } : draft;
  const notes = [...base.notes];
  const cards = [...base.cards];
  let decks = [...base.decks];
  const index = createDraftEditIndex(base);
  for (const op of step) applyInverseInto(notes, cards, decks, index, op, 'after', normalize);
  if (step.some((op) => op.kind === 'deck-name')) decks = relinkDeckParents(decks);
  return {
    draft: { ...base, notes, cards, decks },
    journal: { done: [...journal.done, ...step], undone: journal.undone.slice(0, -step.length) },
    changed: true,
  };
}

/** Notes the journal has touched, for the step's affected count. */
export function editedNoteIds(journal: AnkiDraftEditJournal): string[] {
  const out: string[] = [];
  // `deck-name` and `template-remove` belong to no note; counting either against
  // one would mark a note as edited that nothing wrote to. A removal in
  // particular spans every note of its note type, so any single attribution is
  // false about the rest — and badging thousands of notes as edited would be
  // worse than badging none.
  for (const op of journal.done) {
    if (op.kind === 'deck-name' || op.kind === 'template-remove') continue;
    if (!out.includes(op.noteId)) out.push(op.noteId);
  }
  return out;
}

export function noteIsEdited(journal: AnkiDraftEditJournal, noteId: string): boolean {
  return journal.done.some(
    (op) => op.kind !== 'deck-name' && op.kind !== 'template-remove' && op.noteId === noteId,
  );
}
