export type FlashcardReviewMode = 'mixed' | 'text' | 'audio';
/**
 * `cloze`: the card's own mined sentence with the target word blanked out and
 * the meaning as a hint — production in context, built from what the user
 * already mined rather than a second note to author.
 */
export type FlashcardPromptKind = 'listening' | 'reading' | 'comprehension' | 'recall' | 'cloze';

/**
 * The mined sentence split around its first occurrence of the word, or `null`
 * when there is no usable gap (no sentence, the word is not in it, or the
 * sentence IS the word).
 */
export function clozeParts(
  sentence: string | undefined,
  word: string | undefined,
): { before: string; after: string } | null {
  const text = sentence?.trim();
  const target = word?.trim();
  if (!text || !target || text === target) return null;
  const at = text.indexOf(target);
  if (at < 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + target.length) };
}
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
  /** The target word and its mined sentence, which decide whether a cloze prompt is possible. */
  word?: string;
  sentence?: string;
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
  const textKinds: FlashcardPromptKind[] = ['reading', 'comprehension', 'recall', 'cloze'];
  const mixedKinds: FlashcardPromptKind[] = ['listening', 'reading', 'comprehension', 'recall', 'cloze'];
  let textIndex = Math.floor(random() * textKinds.length);
  let mixedIndex = Math.floor(random() * mixedKinds.length);
  /** The next text kind this card can actually be asked in. */
  const nextTextKind = (card: T): FlashcardPromptKind => {
    for (let tries = 0; tries < textKinds.length; tries += 1) {
      const kind = textKinds[textIndex++ % textKinds.length];
      if (kind !== 'cloze' || clozeParts(card.sentence, card.word)) return kind;
    }
    return 'reading';
  };

  return ordered.map((card) => {
    let promptKind: FlashcardPromptKind;
    if (mode === 'audio') {
      promptKind = 'listening';
    } else if (mode === 'text') {
      promptKind = nextTextKind(card);
    } else {
      let candidate = mixedKinds[mixedIndex++ % mixedKinds.length];
      if ((candidate === 'listening' && !hasAudio(card))
        || (candidate === 'cloze' && !clozeParts(card.sentence, card.word))) {
        candidate = nextTextKind(card);
      }
      promptKind = candidate;
    }
    return { ...card, promptKind };
  });
}

