import type { ReadingLensHistoryEntry } from '../../../shared/readingLensHistory';

export interface DeckSentenceCard {
  id: string;
  sentence?: string;
  word: string;
}

export interface DeckSentenceHit {
  id: string;
  sentence: string;
  word: string;
  /** Span of the matched pattern inside `sentence`, for highlighting. */
  matchStart: number;
  matchEnd: number;
}

const U_ROW_ENDING = /[うくぐすつぬぶむる]$/;

/**
 * Fragments to look for, longest first: the pattern itself, then (for a
 * dictionary-form ending such as 〜てしまう) its stem, so conjugated uses
 * like 食べてしまった are still found. The stem must keep two characters.
 */
function needleVariants(needle: string): string[] {
  const stem = needle.slice(0, -1);
  return U_ROW_ENDING.test(needle) && stem.length >= 2 ? [needle, stem] : [needle];
}

/**
 * Sentences from the learner's own flashcard deck that contain a grammar
 * point's search fragment (see `exampleQuery`). A fragment shorter than two
 * characters (a lone particle) would match nearly every card, so it yields
 * nothing. Identical sentences appear once.
 */
export function findDeckSentences(
  cards: readonly DeckSentenceCard[],
  query: string,
  limit = 5,
): DeckSentenceHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const variants = needleVariants(needle);
  const seen = new Set<string>();
  const hits: DeckSentenceHit[] = [];
  for (const card of cards) {
    const sentence = card.sentence?.trim();
    if (!sentence || seen.has(sentence)) continue;
    const lower = sentence.toLowerCase();
    let matchStart = -1;
    let matchEnd = -1;
    for (const variant of variants) {
      const at = lower.indexOf(variant);
      if (at >= 0) {
        matchStart = at;
        matchEnd = at + variant.length;
        break;
      }
    }
    if (matchStart < 0) continue;
    seen.add(sentence);
    hits.push({ id: card.id, sentence, word: card.word, matchStart, matchEnd });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Search captured sentences, rather than displaying an entire OCR passage. */
export function findCaptureSentences(
  captures: readonly Pick<ReadingLensHistoryEntry, 'captureId' | 'text'>[],
  query: string,
  limit = 5,
): DeckSentenceHit[] {
  return findDeckSentences(captures.flatMap((capture) =>
    (capture.text.match(/[^。！？!?\r\n]+[。！？!?]?/g) ?? []).map((sentence, index) => ({
      id: `${capture.captureId}:${index}`,
      sentence,
      word: '',
    })),
  ), query, limit);
}
