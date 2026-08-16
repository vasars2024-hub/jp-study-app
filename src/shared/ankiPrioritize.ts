// Prioritizing high-frequency unknown words — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4, recipe 6 ("prioritize high-frequency unknown words without changing
// known cards").
//
// "Prioritize" in Anki has exactly one honest meaning: the order the *new*
// queue hands cards out, which is the card's `due` position while `type` is
// `new`. Everything else a surface might call prioritizing — a tag, a flag, a
// deck move — changes what the deck looks like without changing what the user
// studies next, and this recipe exists precisely to change what they study next.
//
// Two guarantees, and both are the recipe's title rather than nice-to-haves:
//
//  1. **Known cards are not touched.** Not repositioned to the back, not
//     renumbered around, not written at all. A user who already knows 食べる
//     must find its card byte-identical afterwards, which is what makes this
//     safe to run on a deck in daily use. It is also the negative control: if a
//     known word appears in the ops, the recipe is broken.
//  2. **Only new cards move.** A review card's `due` is a day number and a
//     learning card's is an epoch second; writing a queue position into either
//     would reschedule it by years. Cards that have left the new queue are
//     refused by name, not silently skipped.
//
// Ranks come from the Browser's `VocabContext`, the same resolution `freq:`
// reads, so the ordering a user filtered by and the ordering this writes cannot
// disagree.

import type { AnkiDraftCard, AnkiDraftNote } from './ankiDraft';
import { resolveVocabKnown, type VocabContext } from './ankiVocabContext';

/** Why a selected note contributed no reposition. One reason, the first that applies. */
export type PrioritizeRefusal =
  /** The note's word is already known under the context's precedence. */
  | 'known'
  /** No installed corpus ranks the word, so there is no "high frequency" to act on. */
  | 'no-rank'
  /** The note type declares no vocabulary field, or the field holds prose. */
  | 'no-word'
  /** The note has cards, but none is still in the new queue. */
  | 'not-new'
  /** The note has no cards at all in this draft. */
  | 'no-cards';

export interface PrioritizeMove {
  noteId: string;
  cardId: string;
  term: string;
  rank: number;
  /** Template ordinal, so siblings keep card-1-then-card-2 order. */
  ord: number;
  /** The card's `due` before the move. */
  before: number;
  /** The position it receives. */
  after: number;
}

export interface PrioritizeSkip {
  noteId: string;
  refusal: PrioritizeRefusal;
  /** The word, when one was resolved — the user needs to see which note this was. */
  term: string | null;
}

export interface PrioritizePlan {
  /** In the order positions were handed out: most frequent first. */
  moves: PrioritizeMove[];
  skips: PrioritizeSkip[];
  /** Moves whose `after` equals `before` are still moves; this counts the rest. */
  changedCards: number;
}

/** Where a reposition starts when the caller names no position. Anki's own default. */
export const DEFAULT_PRIORITIZE_START = 0;

/**
 * Sort key for one candidate. Rank first, then template ordinal (siblings of a
 * new note share one `due`, so this is what actually keeps card 1 ahead of card
 * 2), then the position it already had, then the card id. The last three exist
 * only to make the result deterministic: two words can share a rank across
 * corpora, and an unstable order would make the same tray produce a different
 * deck on every preview.
 */
function compareCandidates(a: PrioritizeMove, b: PrioritizeMove): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  // Note before ordinal: two different words can share a rank, and ordering by
  // ordinal first would interleave their siblings — card 1 of both, then card 2
  // of both — which is exactly the sibling split Anki's burying exists to avoid.
  if (a.noteId !== b.noteId) return a.noteId < b.noteId ? -1 : 1;
  if (a.ord !== b.ord) return a.ord - b.ord;
  if (a.before !== b.before) return a.before - b.before;
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

export interface PrioritizeInput {
  notes: readonly AnkiDraftNote[];
  cards: readonly AnkiDraftCard[];
  vocab: VocabContext;
  /** First position handed out. Defaults to `DEFAULT_PRIORITIZE_START`. */
  startPosition?: number;
}

/**
 * The repositions recipe 6 would make, and every note it refused with the reason.
 *
 * Pure: it reads a draft and returns a description. Nothing is written here — the
 * change tray turns `moves` into `card-due` ops so the whole thing is one
 * undoable step.
 */
export function planPrioritizeNew(input: PrioritizeInput): PrioritizePlan {
  const { notes, cards, vocab } = input;
  const start = Number.isFinite(input.startPosition)
    ? Math.trunc(input.startPosition as number)
    : DEFAULT_PRIORITIZE_START;

  const cardsByNote = new Map<string, AnkiDraftCard[]>();
  for (const card of cards) {
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
  }

  const candidates: PrioritizeMove[] = [];
  const skips: PrioritizeSkip[] = [];

  for (const note of notes) {
    const facts = vocab.byNote.get(note.id);
    const term = facts?.term ?? null;
    if (!facts || !term) {
      skips.push({ noteId: note.id, refusal: 'no-word', term: null });
      continue;
    }
    // Known is checked before rank on purpose: "you already know this" is the
    // more useful thing to tell a user than "and nothing ranks it either", and
    // it is the guarantee the recipe is named after.
    if (resolveVocabKnown(facts.known, vocab.precedence) === 'known') {
      skips.push({ noteId: note.id, refusal: 'known', term });
      continue;
    }
    if (facts.rank === null) {
      skips.push({ noteId: note.id, refusal: 'no-rank', term });
      continue;
    }
    const own = cardsByNote.get(note.id) ?? [];
    if (own.length === 0) {
      skips.push({ noteId: note.id, refusal: 'no-cards', term });
      continue;
    }
    const newCards = own.filter((c) => c.type === 'new');
    if (newCards.length === 0) {
      skips.push({ noteId: note.id, refusal: 'not-new', term });
      continue;
    }
    // Siblings take consecutive positions in template order, which is what Anki's
    // own reposition does and what keeps a card and its reverse together.
    for (const card of [...newCards].sort((a, b) => a.ord - b.ord)) {
      candidates.push({
        noteId: note.id,
        cardId: card.id,
        term,
        rank: facts.rank,
        ord: card.ord,
        before: card.due,
        after: 0,
      });
    }
  }

  candidates.sort(compareCandidates);
  let next = start;
  let changedCards = 0;
  for (const move of candidates) {
    move.after = next;
    next += 1;
    if (move.after !== move.before) changedCards += 1;
  }

  return { moves: candidates, skips, changedCards };
}
