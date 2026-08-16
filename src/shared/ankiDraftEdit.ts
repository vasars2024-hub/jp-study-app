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
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftDeck,
  AnkiDraftMediaRef,
  AnkiDraftNote,
  AnkiDraftSource,
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
       * A deck's name — recipe 12's deck half. The only op in the journal that
       * belongs to no note, because a deck rename touches no note and no card:
       * a card names its deck by id, and Anki derives the tree from the name, so
       * writing the old string back is a complete inverse. Ops with no `noteId`
       * are skipped by `editedNoteIds`, which is why the Browser's edited badge
       * does not light up for a deck the user renamed.
       */
      kind: 'deck-name';
      deckId: string;
      before: string;
      after: string;
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
    | 'empty-deck-name';
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
  // Newest first: two ops on one field must be unwound in the order they were
  // written, or the older op's `before` loses to the newer one's.
  const notes = [...draft.notes];
  const cards = [...draft.cards];
  let decks = [...draft.decks];
  const index = createDraftEditIndex(draft);
  for (let i = step.length - 1; i >= 0; i -= 1) {
    applyInverseInto(notes, cards, decks, index, step[i], 'before', normalize);
  }
  if (step.some((op) => op.kind === 'deck-name')) decks = relinkDeckParents(decks);
  return {
    draft: { ...draft, notes, cards, decks },
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
  const notes = [...draft.notes];
  const cards = [...draft.cards];
  let decks = [...draft.decks];
  const index = createDraftEditIndex(draft);
  for (const op of step) applyInverseInto(notes, cards, decks, index, op, 'after', normalize);
  if (step.some((op) => op.kind === 'deck-name')) decks = relinkDeckParents(decks);
  return {
    draft: { ...draft, notes, cards, decks },
    journal: { done: [...journal.done, ...step], undone: journal.undone.slice(0, -step.length) },
    changed: true,
  };
}

/** Notes the journal has touched, for the step's affected count. */
export function editedNoteIds(journal: AnkiDraftEditJournal): string[] {
  const out: string[] = [];
  // A `deck-name` op belongs to no note; counting it against one would mark a
  // note as edited that nothing wrote to.
  for (const op of journal.done) {
    if (op.kind === 'deck-name') continue;
    if (!out.includes(op.noteId)) out.push(op.noteId);
  }
  return out;
}

export function noteIsEdited(journal: AnkiDraftEditJournal, noteId: string): boolean {
  return journal.done.some((op) => op.kind !== 'deck-name' && op.noteId === noteId);
}
