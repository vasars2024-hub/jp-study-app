// Splitting one deck into subdecks — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 13 ("split a deck by JLPT level, frequency band, source, or mastery").
//
// Recipe 12's deck half renames decks and moves nothing. This one is its
// opposite and the reason that module refuses merges by name: **a split moves
// cards**, and every rule below exists because a card that lands in the wrong
// deck takes its scheduling, its deck options and its daily limits with it.
//
//  1. **The card is the unit, the note is the vote.** A bucket is derived per
//     note — a note's forward and reverse cards teach the same word and must not
//     be filed under two levels — but what moves is each card, because a deck is
//     a card's property in Anki and nothing else's.
//  2. **Scope is one deck's subtree, named by the caller.** A selection routinely
//     spans the whole collection; splitting on it would restructure decks the
//     user never looked at. Selected cards outside the parent are refused by name
//     (`outside-parent`), not silently dropped and not silently swept in.
//  3. **A card on loan is never moved.** A card in a filtered deck carries
//     `originalDeckId`, and rewriting its `deckId` would strand it when Anki
//     rebuilds the filtered deck. Refused as `filtered-card`, counted, named.
//  4. **No value on the axis is not a bucket.** A note carrying no JLPT tag has
//     not been judged N-nothing; it has not been judged. `unmatched` is the
//     caller's explicit choice between leaving those cards where they are and
//     collecting them into one named subdeck. There is no default, for the
//     reason `copy-field`'s conflict mode has none.
//  5. **Two answers is not an answer.** A note tagged both `JLPT::N5` and
//     `JLPT::N3` is refused as `ambiguous-jlpt` rather than resolved by taking
//     the lower, the higher or the first. Deck decks get re-tagged by hand all
//     the time and the plan cannot know which tag is the stale one.
//
// Idempotence is a property, not a bonus: a card already sitting in the deck
// this plan would move it to is `unchanged`, so running the same split twice
// moves nothing the second time, and re-splitting by a different axis is a
// normal operation rather than a tree that grows a layer per run.

import type { AnkiDraftCard, AnkiDraftDeck, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import type { MasteryLevel } from './ankiMastery';

export type DeckSplitAxis = 'jlpt' | 'frequency' | 'source' | 'mastery';

export const DECK_SPLIT_AXES: readonly DeckSplitAxis[] = ['jlpt', 'frequency', 'source', 'mastery'];

/** What happens to notes carrying no value on the chosen axis. */
export type DeckSplitUnmatched = 'leave' | 'collect';

/**
 * Anki nests on `::` and on nothing else, so a segment carrying one would create
 * a level the user did not ask for. `A:B` is a legal flat name and is left
 * alone; only a run of two or more colons collapses.
 */
export function sanitizeDeckSegment(value: string): string {
  return value
    .replace(/:{2,}/gu, ':')
    // Control characters, including the 0x1f Anki nests schema-18 deck names on:
    // one inside a note type name would split it into two deck levels.
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Fullwidth ASCII folded to halfwidth, so `ＪＬＰＴ::Ｎ５` reads as a level. */
function foldWidth(value: string): string {
  return value.replace(/[！-～]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * A JLPT level token inside a tag, anywhere a separator puts it on its own:
 * `JLPT::N5`, `jlpt-n5`, `N5`, `2020_N5_list`. The leading boundary is what
 * keeps `LESSON5` from reading as N5 — the `n` has to start a segment.
 */
const JLPT_TOKEN_RE = /(?:^|[:_\-\s])n([1-5])(?:$|[:_\-\s])/giu;

/** Every distinct JLPT level a note's tags name, ascending (`N1` first). */
export function jlptLevelsFromTags(tags: readonly string[]): number[] {
  const found = new Set<number>();
  for (const tag of tags) {
    const folded = foldWidth(tag);
    JLPT_TOKEN_RE.lastIndex = 0;
    for (const match of folded.matchAll(JLPT_TOKEN_RE)) {
      const level = Number(match[1]);
      if (level >= 1 && level <= 5) found.add(level);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Deck names for the four mastery rungs. English literals, because a deck name
 * is stored user data rather than chrome: it survives an export into a
 * collection this app never sees again, so it cannot be a translation key. The
 * caller passes translated segments when it wants the user's language, and the
 * key set is `MASTERY_LEVEL_KEYS`.
 */
export const DEFAULT_MASTERY_SEGMENTS: Readonly<Record<MasteryLevel, string>> = {
  0: 'New',
  1: 'Learning',
  2: 'Familiar',
  3: 'Known',
};

// ----- the plan ------------------------------------------------------------------

/** One subdeck the split fills. */
export interface DeckSplitTarget {
  /** Sort key within the axis; also what the tests and the UI key on. */
  bucket: string;
  /** The name segment appended under the parent. */
  segment: string;
  /** Full deck name, in the parent's own separator. */
  name: string;
  /**
   * The existing deck's id, or a `split:` id this plan mints. A minted id is
   * deliberately not numeric: Anki ids are epoch milliseconds, and a commit has
   * to allocate the real one, so an id that could pass for real is a trap.
   */
  deckId: string;
  created: boolean;
  /**
   * True for the one deck `collect` gathers the axis-less notes into. A flag
   * rather than a reserved bucket name, because the `source` axis's buckets are
   * note type names and a note type may legitimately be called anything.
   */
  unmatchedBucket: boolean;
  noteIds: string[];
  cardIds: string[];
}

export interface DeckSplitMove {
  cardId: string;
  noteId: string;
  fromDeckId: string;
  toDeckId: string;
}

export type DeckSplitRefusalCode =
  /** On loan to a filtered deck; moving it would strand it on rebuild. */
  | 'filtered-card'
  /** Selected, but its card sits outside the deck being split. */
  | 'outside-parent'
  /** Tags name more than one JLPT level. */
  | 'ambiguous-jlpt'
  /** Selected note that generates no card, so there is nothing to file. */
  | 'note-without-cards';

export interface DeckSplitRefusal {
  code: DeckSplitRefusalCode;
  noteIds: string[];
  /** Cards refused, when the refusal is about cards rather than the note. */
  cardIds: string[];
}

/** A split that cannot be computed at all. Everything else in the plan is empty. */
export type DeckSplitProblem =
  | 'empty-selection'
  | 'no-such-parent'
  /** A filtered deck's contents are on loan; it has no cards of its own to split. */
  | 'parent-filtered'
  /** Bands absent, empty, non-ascending, or not positive integers. */
  | 'invalid-bands'
  /** `collect` was chosen without a name for the deck it collects into. */
  | 'empty-unmatched-name';

export interface DeckSplitPlan {
  axis: DeckSplitAxis;
  parentDeckId: string;
  parentName: string;
  targets: DeckSplitTarget[];
  moves: DeckSplitMove[];
  /** Cards already in the deck this plan would move them to. */
  unchanged: number;
  /** Selected notes carrying no value on this axis. */
  unmatchedNoteIds: string[];
  unmatched: DeckSplitUnmatched;
  refusals: DeckSplitRefusal[];
  /** Selected notes, i.e. what the counts above partition. */
  considered: number;
  /** Distinct decks the moved cards came from. */
  fromDeckCount: number;
  problem?: DeckSplitProblem;
}

export interface DeckSplitInput {
  /** The selection, in Browser order. */
  noteIds: readonly string[];
  notes: readonly AnkiDraftNote[];
  cards: readonly AnkiDraftCard[];
  decks: readonly AnkiDraftDeck[];
  noteTypes: readonly AnkiDraftNoteType[];
  axis: DeckSplitAxis;
  /** The deck being split. Its subtree is the whole scope. */
  parentDeckId: string;
  unmatched: DeckSplitUnmatched;
  /** Name of the subdeck `collect` gathers into. Read only for `collect`. */
  unmatchedSegment?: string;
  /**
   * Ascending exclusive upper bounds for the `frequency` axis, e.g.
   * `[1000, 5000]` gives `1-1000`, `1001-5000` and `5001+`. Required there and
   * ignored elsewhere; there is no default, because "top 1,000" is a judgement
   * about the user's corpus and not this module's to make.
   */
  bands?: readonly number[];
  /** Note → best frequency rank, from `ankiVocabContext`. `null` = unranked. */
  rankByNote?: ReadonlyMap<string, number | null>;
  /** Note → stored local level. Absent/`null` = never judged, which is not 0. */
  masteryByNote?: ReadonlyMap<string, MasteryLevel | null>;
  /** Deck names for the mastery rungs; `DEFAULT_MASTERY_SEGMENTS` when omitted. */
  masterySegments?: Readonly<Record<MasteryLevel, string>>;
}

const DECK_UNIT_SEPARATOR = '\x1f';

function toPathForm(name: string): string {
  return name.split(DECK_UNIT_SEPARATOR).join('::');
}

function toStoredForm(pathForm: string, storedLike: string): string {
  return storedLike.includes(DECK_UNIT_SEPARATOR)
    ? pathForm.split('::').join(DECK_UNIT_SEPARATOR)
    : pathForm;
}

function emptyPlan(input: DeckSplitInput, problem: DeckSplitProblem): DeckSplitPlan {
  const parent = input.decks.find((d) => d.id === input.parentDeckId);
  return {
    axis: input.axis,
    parentDeckId: input.parentDeckId,
    parentName: parent?.name ?? '',
    targets: [],
    moves: [],
    unchanged: 0,
    unmatchedNoteIds: [],
    unmatched: input.unmatched,
    refusals: [],
    considered: input.noteIds.length,
    fromDeckCount: 0,
    problem,
  };
}

function validBands(bands: readonly number[] | undefined): bands is readonly number[] {
  if (!bands || bands.length === 0) return false;
  let previous = 0;
  for (const edge of bands) {
    if (!Number.isInteger(edge) || edge <= previous) return false;
    previous = edge;
  }
  return true;
}

/** Which band a rank falls in, as `{ bucket, segment }`. Ranks are 1-based. */
function frequencyBucket(rank: number, bands: readonly number[]): { bucket: string; segment: string } {
  let low = 1;
  for (const [index, edge] of bands.entries()) {
    if (rank <= edge) {
      return { bucket: String(index).padStart(3, '0'), segment: `${low}-${edge}` };
    }
    low = edge + 1;
  }
  return { bucket: String(bands.length).padStart(3, '0'), segment: `${low}+` };
}

interface Bucketed {
  bucket: string;
  segment: string;
}

/**
 * What a split would do, computed once and used for both the preview and the
 * write — the tray's rule that the dry run *is* the apply holds here too.
 */
export function planDeckSplit(input: DeckSplitInput): DeckSplitPlan {
  const { axis, decks, parentDeckId, unmatched } = input;
  if (input.noteIds.length === 0) return emptyPlan(input, 'empty-selection');
  const parent = decks.find((d) => d.id === parentDeckId);
  if (!parent) return emptyPlan(input, 'no-such-parent');
  if (parent.filtered) return emptyPlan(input, 'parent-filtered');
  if (axis === 'frequency' && !validBands(input.bands)) return emptyPlan(input, 'invalid-bands');
  const collectSegment = sanitizeDeckSegment(input.unmatchedSegment ?? '');
  if (unmatched === 'collect' && collectSegment === '') {
    return emptyPlan(input, 'empty-unmatched-name');
  }

  const parentPath = toPathForm(parent.name);
  const filteredDeckIds = new Set(decks.filter((d) => d.filtered).map((d) => d.id));
  // The subtree, by name, exactly as Anki derives it. A deck literally named
  // `Japanese Core` is not inside `Japanese`, so the `::` is part of the prefix.
  const inScopeDeckIds = new Set(
    decks
      .filter((d) => {
        const path = toPathForm(d.name);
        return path === parentPath || path.startsWith(`${parentPath}::`);
      })
      .map((d) => d.id),
  );

  const noteById = new Map(input.notes.map((n) => [n.id, n]));
  const noteTypeById = new Map(input.noteTypes.map((t) => [t.id, t]));
  const cardsByNote = new Map<string, AnkiDraftCard[]>();
  for (const card of input.cards) {
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
  }
  const deckIdByPath = new Map<string, string>();
  for (const deck of decks) deckIdByPath.set(toPathForm(deck.name), deck.id);

  const masterySegments = input.masterySegments ?? DEFAULT_MASTERY_SEGMENTS;
  const refusalOrder: DeckSplitRefusalCode[] = [
    'ambiguous-jlpt',
    'note-without-cards',
    'outside-parent',
    'filtered-card',
  ];
  const refusalsByCode = new Map<DeckSplitRefusalCode, DeckSplitRefusal>();
  const refuse = (code: DeckSplitRefusalCode, noteId: string, cardId?: string): void => {
    let entry = refusalsByCode.get(code);
    if (!entry) {
      entry = { code, noteIds: [], cardIds: [] };
      refusalsByCode.set(code, entry);
    }
    if (!entry.noteIds.includes(noteId)) entry.noteIds.push(noteId);
    if (cardId) entry.cardIds.push(cardId);
  };

  const bucketFor = (note: AnkiDraftNote): Bucketed | null | 'refused' => {
    if (axis === 'jlpt') {
      const levels = jlptLevelsFromTags(note.tags);
      if (levels.length > 1) {
        refuse('ambiguous-jlpt', note.id);
        return 'refused';
      }
      if (levels.length === 0) return null;
      // Sorted N5 first: a learner reads their own tree bottom-up, and `N5`
      // sorting after `N1` alphabetically is why the bucket key is not the name.
      return { bucket: String(6 - levels[0]), segment: `N${levels[0]}` };
    }
    if (axis === 'frequency') {
      const rank = input.rankByNote?.get(note.id) ?? null;
      // `null` is "no corpus ranks this word", which is not rank infinity and
      // not "rare" — `ankiVocabContext` refuses that conflation and so does this.
      if (rank === null || !Number.isFinite(rank) || rank <= 0) return null;
      return frequencyBucket(rank, input.bands as readonly number[]);
    }
    if (axis === 'source') {
      const name = sanitizeDeckSegment(noteTypeById.get(note.noteTypeId)?.name ?? '');
      if (name === '') return null;
      return { bucket: name.toLowerCase(), segment: name };
    }
    const level = input.masteryByNote?.get(note.id) ?? null;
    if (level === null) return null;
    const segment = sanitizeDeckSegment(masterySegments[level] ?? '');
    if (segment === '') return null;
    return { bucket: String(level), segment };
  };

  const targets = new Map<string, DeckSplitTarget>();
  const moves: DeckSplitMove[] = [];
  const unmatchedNoteIds: string[] = [];
  const fromDeckIds = new Set<string>();
  let unchanged = 0;

  const targetFor = (bucket: string, segment: string, isUnmatched: boolean): DeckSplitTarget => {
    const key = `${isUnmatched ? 1 : 0}:${bucket}`;
    const existing = targets.get(key);
    if (existing) return existing;
    const path = `${parentPath}::${segment}`;
    const deckId = deckIdByPath.get(path);
    const target: DeckSplitTarget = {
      bucket,
      segment,
      name: toStoredForm(path, parent.name),
      deckId: deckId ?? `split:${parentDeckId}:${segment}`,
      created: deckId === undefined,
      unmatchedBucket: isUnmatched,
      noteIds: [],
      cardIds: [],
    };
    targets.set(key, target);
    return target;
  };

  for (const noteId of input.noteIds) {
    const note = noteById.get(noteId);
    if (!note) continue;
    const cards = cardsByNote.get(noteId) ?? [];
    if (cards.length === 0) {
      refuse('note-without-cards', noteId);
      continue;
    }
    // Scope before axis: a note outside the deck being split is not a note whose
    // JLPT tag matters, and reporting it as unmatched would blame the data.
    const inScope = cards.filter((c) => inScopeDeckIds.has(c.deckId));
    for (const card of cards) {
      if (!inScopeDeckIds.has(card.deckId)) refuse('outside-parent', noteId, card.id);
    }
    if (inScope.length === 0) continue;

    const movable: AnkiDraftCard[] = [];
    for (const card of inScope) {
      if (filteredDeckIds.has(card.deckId) || card.originalDeckId !== undefined) {
        refuse('filtered-card', noteId, card.id);
      } else movable.push(card);
    }
    if (movable.length === 0) continue;

    const bucketed = bucketFor(note);
    // A refusal outranks `collect`. "This note names two levels" and "this note
    // names none" are different facts, and sweeping the first into the leftovers
    // deck would move exactly the card the refusal exists to protect.
    if (bucketed === 'refused') continue;
    if (!bucketed) {
      unmatchedNoteIds.push(noteId);
      if (unmatched === 'leave') continue;
    }
    const target = bucketed
      ? targetFor(bucketed.bucket, bucketed.segment, false)
      : targetFor(collectSegment, collectSegment, true);
    target.noteIds.push(noteId);
    for (const card of movable) {
      target.cardIds.push(card.id);
      if (card.deckId === target.deckId) {
        unchanged += 1;
        continue;
      }
      fromDeckIds.add(card.deckId);
      moves.push({ cardId: card.id, noteId, fromDeckId: card.deckId, toDeckId: target.deckId });
    }
  }

  // Axis order first, the collected leftovers always last: a user reading the
  // preview wants N5…N1 in order and "everything else" at the bottom, not a
  // deck named `Unsorted` filed between `N3` and `N2` because of its spelling.
  const ordered = [...targets.values()].sort((a, b) => {
    if (a.unmatchedBucket !== b.unmatchedBucket) return a.unmatchedBucket ? 1 : -1;
    return a.bucket < b.bucket ? -1 : 1;
  });
  const refusals = refusalOrder
    .map((code) => refusalsByCode.get(code))
    .filter((entry): entry is DeckSplitRefusal => entry !== undefined);

  return {
    axis,
    parentDeckId,
    parentName: parent.name,
    targets: ordered,
    moves,
    unchanged,
    unmatchedNoteIds,
    unmatched,
    refusals,
    considered: input.noteIds.length,
    fromDeckCount: fromDeckIds.size,
  };
}

/**
 * The decks a plan has to create before its moves can land, parents first —
 * a subdeck whose parent row is missing is a deck Anki shows at the top level.
 */
export function deckSplitNewDecks(plan: DeckSplitPlan): DeckSplitTarget[] {
  return plan.targets.filter((t) => t.created);
}
