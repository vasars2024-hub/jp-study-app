// Normalising inconsistent deck paths — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 12 ("normalize inconsistent tags and deck paths"), deck half.
//
// The tag half of this recipe lives in `ankiTagNormalize.ts` and states the
// three rules both halves obey: casing comes from a draft-wide census rather
// than from `toLowerCase()`, the census is draft-wide while the write is scoped,
// and a `::` path is normalised segment by segment. Decks use the same grammar,
// so this module reuses those primitives instead of restating them.
//
// What is *not* the same, and is the whole reason this is a separate module:
//
//  1. **A parent deck is a real deck.** The tag half drops a tag that a child
//     tag already implies; doing that to decks would delete a deck holding
//     cards. There is no `drop-redundant-parents` here and there must not be.
//  2. **Two decks that normalise to one name is a merge, and a merge moves
//     cards.** This module refuses it by name — the rename is skipped, listed
//     as a collision naming the deck that already holds the name, and the other
//     renames still run. Moving cards between decks is a different recipe with
//     a far larger blast radius, and doing it silently under the word "normalize"
//     is exactly the surprise the tag half's closing comment warned about.
//  3. **A filtered deck is not renamed.** Its cards are on loan from their real
//     decks and Anki rebuilds and empties it as a matter of course, so its name
//     is transient. It keeps its name, is counted in `filteredSkipped`, and is
//     kept out of the census so a "Custom Study Session" cannot vote on how the
//     user's real tree is spelled.
//
// Renames are per deck and the tree follows the names, because that is how Anki
// stores it: a deck's parent is whatever the prefix of its name says. So
// unifying `jlpt::n5` onto `JLPT::n5` re-nests that subdeck under the existing
// `JLPT` without moving a single card, which is the point of the recipe.

import { applyPathOps, buildTagCaseCensus } from './ankiTagNormalize';

/** One normalisation. The tag half's three path ops, minus the one decks cannot have. */
export type DeckNormalizeOp = 'trim-separators' | 'ascii-width' | 'unify-case';

/** Forced order, for the reason `TAG_NORMALIZE_ORDER` gives: each op feeds the next. */
export const DECK_NORMALIZE_ORDER: readonly DeckNormalizeOp[] = [
  'trim-separators',
  'ascii-width',
  'unify-case',
];

export interface DeckRename {
  deckId: string;
  from: string;
  to: string;
}

/** A rename that would have landed on a name another deck already holds. */
export interface DeckNormalizeCollision extends DeckRename {
  /** The deck keeping that name — the one a merge would have had to move cards into. */
  heldByDeckId: string;
}

export interface DeckNormalizePlan {
  renames: DeckRename[];
  collisions: DeckNormalizeCollision[];
  /** Renameable decks whose name is byte-identical afterwards. */
  unchanged: number;
  /** Decks left alone because they are filtered. */
  filteredSkipped: number;
  /** Decks this plan could rename: everything that is not filtered. */
  considered: number;
}

export interface DeckNormalizeInput {
  decks: ReadonlyArray<{ id: string; name: string; filtered?: boolean }>;
  ops: readonly DeckNormalizeOp[];
}

export function planDeckNormalize(input: DeckNormalizeInput): DeckNormalizePlan {
  const chosen = new Set(DECK_NORMALIZE_ORDER.filter((op) => input.ops.includes(op)));
  const ops = {
    trimSeparators: chosen.has('trim-separators'),
    asciiWidth: chosen.has('ascii-width'),
    unifyCase: chosen.has('unify-case'),
  };
  const renameable = input.decks.filter((d) => !d.filtered);
  const census = ops.unifyCase
    ? // One iterable holding every renameable deck name: the census is keyed by
      // path prefix, so it does not care whether the names arrived as one list
      // or as one list per note the way tags do.
      buildTagCaseCensus([renameable.map((d) => d.name)])
    : new Map<string, string>();

  const renames: DeckRename[] = [];
  const collisions: DeckNormalizeCollision[] = [];
  let unchanged = 0;

  // Seeded with every name that is *not* moving — filtered decks and, further
  // down, each deck that turns out to be already canonical. A rename may only
  // claim a name nothing else ends up holding.
  const heldBy = new Map<string, string>();
  for (const deck of input.decks) {
    if (deck.filtered) heldBy.set(deck.name, deck.id);
  }
  const targets = renameable.map((deck) => ({ deck, to: applyPathOps(deck.name, ops, census) }));
  for (const { deck, to } of targets) {
    if (to === deck.name || to === '') heldBy.set(deck.name, deck.id);
  }

  for (const { deck, to } of targets) {
    if (to === '') {
      // Nothing but separators. A deck cannot be nameless, so this is left alone
      // rather than renamed to the empty string — and it is not a collision.
      unchanged += 1;
      continue;
    }
    if (to === deck.name) {
      unchanged += 1;
      continue;
    }
    const holder = heldBy.get(to);
    if (holder !== undefined && holder !== deck.id) {
      collisions.push({ deckId: deck.id, from: deck.name, to, heldByDeckId: holder });
      continue;
    }
    heldBy.set(to, deck.id);
    renames.push({ deckId: deck.id, from: deck.name, to });
  }

  return {
    renames,
    collisions,
    unchanged,
    filteredSkipped: input.decks.length - renameable.length,
    considered: renameable.length,
  };
}
