export type FlashcardReviewMode = 'mixed' | 'text' | 'audio';
export type FlashcardPromptKind = 'listening' | 'reading' | 'comprehension' | 'recall';
/**
 * The order of a sitting.
 *
 * - `spread`   shuffled, never two cards from one deck in a row when another
 *              deck has cards left — the "mix it up" default;
 * - `by-deck`  deck after deck (in random deck order), shuffled inside each;
 * - `source`   deck after deck, each in its own order (a sentence deck plays
 *              in episode order, a mined book in reading order).
 */
export type ReviewOrder = 'spread' | 'by-deck' | 'source';

export interface ReviewPlanCard {
  id: string;
  audioDataUrl?: string;
  audioPath?: string;
  /** Book/source grouping used to avoid adjacent cards from one sentence set. */
  reviewGroup?: string;
  /** Position within its group for `source` order (a cue's start, else when it was added). */
  sourceOrder?: number;
}

export type PlannedReviewCard<T extends ReviewPlanCard> = T & {
  promptKind: FlashcardPromptKind;
};

export interface ReviewPlanOptions {
  mode?: FlashcardReviewMode;
  order?: ReviewOrder;
  random?: () => number;
}

/**
 * What an audio-only sitting can actually do with the current selection.
 *
 * `planFlashcardReview` drops every card without audio in `audio` mode, which
 * is correct and was invisible: a 40-card selection with 5 clips silently
 * became a 5-card sitting, and a selection with none silently became a
 * disabled button with no stated reason. The host renders one line from this.
 */
export type AudioReviewPoolStatus =
  | { kind: 'empty' }
  | { kind: 'none'; total: number }
  | { kind: 'partial'; usable: number; dropped: number }
  | { kind: 'all'; usable: number };

export function audioReviewPoolStatus(total: number, withAudio: number): AudioReviewPoolStatus {
  const usable = Math.max(0, Math.min(withAudio, total));
  if (total <= 0) return { kind: 'empty' };
  if (usable === 0) return { kind: 'none', total };
  if (usable < total) return { kind: 'partial', usable, dropped: total - usable };
  return { kind: 'all', usable };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function hasAudio(card: ReviewPlanCard): boolean {
  return Boolean(card.audioDataUrl || card.audioPath);
}

/** Prefer a different source group without making the order predictable. */
function spreadGroups<T extends ReviewPlanCard>(cards: readonly T[], random: () => number): T[] {
  const remaining = shuffle(cards, random);
  const ordered: T[] = [];
  let previous = '';
  while (remaining.length) {
    let index = remaining.findIndex((card) => (card.reviewGroup ?? '') !== previous);
    if (index < 0) index = 0;
    const [picked] = remaining.splice(index, 1);
    ordered.push(picked);
    previous = picked.reviewGroup ?? '';
  }
  return ordered;
}

/** Deck after deck; the decks in random order, their cards shuffled or in source order. */
function byGroup<T extends ReviewPlanCard>(cards: readonly T[], random: () => number, keepOrder: boolean): T[] {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const key = card.reviewGroup ?? '';
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  }
  const lists = [...groups.values()].map((list) => (
    keepOrder
      ? [...list].sort((a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0))
      : shuffle(list, random)
  ));
  return (keepOrder ? lists : shuffle(lists, random)).flat();
}

/** Put a sitting's cards in `order`. Exported so a re-shuffle mid-sitting uses the same rules. */
export function orderReviewPlan<T extends ReviewPlanCard>(
  cards: readonly T[],
  order: ReviewOrder = 'spread',
  random: () => number = Math.random,
): T[] {
  if (order === 'by-deck') return byGroup(cards, random, false);
  if (order === 'source') return byGroup(cards, random, true);
  return spreadGroups(cards, random);
}

/**
 * The listen-only playlist: every card with a clip, in `order`. A card without
 * audio has nothing to play and is left out rather than played as silence.
 */
export function planListenQueue<T extends ReviewPlanCard>(
  cards: readonly T[],
  order: ReviewOrder = 'spread',
  random: () => number = Math.random,
): T[] {
  return orderReviewPlan(cards.filter(hasAudio), order, random);
}

/**
 * Build one sitting from any local deck. Each persisted card appears once, but
 * its prompt changes between sittings so the user practises several retrieval
 * directions without duplicate SRS writes for the same note.
 */
export function planFlashcardReview<T extends ReviewPlanCard>(
  cards: readonly T[],
  options: ReviewPlanOptions = {},
): Array<PlannedReviewCard<T>> {
  const mode = options.mode ?? 'mixed';
  const random = options.random ?? Math.random;
  const eligible = mode === 'audio' ? cards.filter(hasAudio) : cards;
  const ordered = orderReviewPlan(eligible, options.order ?? 'spread', random);
  const textKinds: FlashcardPromptKind[] = ['reading', 'comprehension', 'recall'];
  const mixedKinds: FlashcardPromptKind[] = ['listening', 'reading', 'comprehension', 'recall'];
  let textIndex = Math.floor(random() * textKinds.length);
  let mixedIndex = Math.floor(random() * mixedKinds.length);

  return ordered.map((card) => {
    let promptKind: FlashcardPromptKind;
    if (mode === 'audio') {
      promptKind = 'listening';
    } else if (mode === 'text') {
      promptKind = textKinds[textIndex++ % textKinds.length];
    } else {
      let candidate = mixedKinds[mixedIndex++ % mixedKinds.length];
      if (candidate === 'listening' && !hasAudio(card)) {
        candidate = textKinds[textIndex++ % textKinds.length];
      }
      promptKind = candidate;
    }
    return { ...card, promptKind };
  });
}

