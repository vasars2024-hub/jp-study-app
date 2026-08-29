/**
 * Match: pair each Japanese card with its meaning, from any local deck.
 *
 * The first of the four deck-agnostic practice modes. It is pure here for one
 * reason above the others — the ambiguity rule. A round holding two cards that
 * both mean "to eat" has a correct answer the user cannot pick, because either
 * tile is right and only one is accepted. That is the kind of defect a person
 * blames themselves for, and it is invisible to any test that only checks the
 * round is the requested size.
 */

export interface MatchSourceCard {
  id: string;
  word?: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
}

/** Which half of a pair a tile shows. */
export type MatchSide = 'prompt' | 'answer';

export interface MatchTile {
  /** Unique within the round; two tiles of a pair share `pairId`, not this. */
  id: string;
  pairId: string;
  side: MatchSide;
  text: string;
}

export interface MatchRound {
  tiles: MatchTile[];
  /** How many pairs the round holds. `tiles.length` is twice this. */
  pairs: number;
  /** Cards left out: no Japanese side, no meaning, or an ambiguous duplicate. */
  skipped: number;
  /**
   * Why an unusable deck produced no round. `null` when the round is playable —
   * so a caller can tell "too few cards" from "every meaning was a duplicate",
   * which need different things from the user.
   */
  refusal: MatchRefusal | null;
}

export type MatchRefusal = 'too-few-cards' | 'no-usable-pairs';

/** The smallest round worth playing: one pair is not a matching exercise. */
export const MIN_MATCH_PAIRS = 2;
export const DEFAULT_MATCH_PAIRS = 6;

/** The Japanese side. The word is the unit being learned; a sentence is the fallback. */
export function matchPromptText(card: MatchSourceCard): string {
  return (card.word || card.sentence || '').trim();
}

/** The meaning side. Nothing is invented: a card with no meaning is not usable. */
export function matchAnswerText(card: MatchSourceCard): string {
  return (card.meaning || '').trim();
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * Build one round.
 *
 * Both sides are deduplicated, not just the answers: two cards reading 食べる
 * are as unplayable as two meaning "to eat". The comparison is
 * case-insensitive and whitespace-folded, because "To Eat" and "to eat" are the
 * same tile to a person looking at the board.
 */
export function buildMatchRound(
  cards: readonly MatchSourceCard[],
  options: { size?: number; random?: () => number } = {},
): MatchRound {
  const size = Math.max(MIN_MATCH_PAIRS, Math.floor(options.size ?? DEFAULT_MATCH_PAIRS));
  const random = options.random ?? Math.random;

  const seenPrompt = new Set<string>();
  const seenAnswer = new Set<string>();
  const usable: MatchSourceCard[] = [];
  let skipped = 0;

  for (const card of shuffle(cards, random)) {
    const prompt = matchPromptText(card);
    const answer = matchAnswerText(card);
    const promptKey = prompt.toLowerCase().replace(/\s+/g, ' ');
    const answerKey = answer.toLowerCase().replace(/\s+/g, ' ');
    if (!prompt || !answer || seenPrompt.has(promptKey) || seenAnswer.has(answerKey)) {
      skipped += 1;
      continue;
    }
    seenPrompt.add(promptKey);
    seenAnswer.add(answerKey);
    usable.push(card);
  }

  const chosen = usable.slice(0, size);
  // Cards beyond the round size are not "skipped" — they are simply the rest of
  // the deck, and counting them as excluded would read as a fault.
  if (chosen.length < MIN_MATCH_PAIRS) {
    return {
      tiles: [],
      pairs: 0,
      skipped,
      refusal: usable.length ? 'too-few-cards' : 'no-usable-pairs',
    };
  }

  const tiles: MatchTile[] = [];
  for (const card of chosen) {
    tiles.push({ id: `${card.id}:prompt`, pairId: card.id, side: 'prompt', text: matchPromptText(card) });
    tiles.push({ id: `${card.id}:answer`, pairId: card.id, side: 'answer', text: matchAnswerText(card) });
  }

  return { tiles: shuffle(tiles, random), pairs: chosen.length, skipped, refusal: null };
}

/**
 * Whether two tiles are a pair.
 *
 * A tile is never its own match, and two prompts are never a match even when
 * they share a `pairId` — which they always do, so the side check is what makes
 * this correct rather than a formality.
 */
export function tilesMatch(a: MatchTile, b: MatchTile): boolean {
  return a.id !== b.id && a.pairId === b.pairId && a.side !== b.side;
}

export interface MatchScore {
  pairs: number;
  matched: number;
  /** Selections that were not a pair. Shown as-is; there is no hidden penalty. */
  misses: number;
  elapsedMs: number;
  done: boolean;
}

export function matchScore(
  pairs: number,
  matched: number,
  misses: number,
  elapsedMs: number,
): MatchScore {
  return {
    pairs,
    matched,
    misses,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    done: pairs > 0 && matched >= pairs,
  };
}
