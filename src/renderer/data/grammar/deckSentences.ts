export interface DeckSentenceCard {
  id: string;
  sentence?: string;
  word: string;
}

export interface DeckSentenceHit {
  id: string;
  sentence: string;
  word: string;
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
  const seen = new Set<string>();
  const hits: DeckSentenceHit[] = [];
  for (const card of cards) {
    const sentence = card.sentence?.trim();
    if (!sentence || seen.has(sentence)) continue;
    if (!sentence.toLowerCase().includes(needle)) continue;
    seen.add(sentence);
    hits.push({ id: card.id, sentence, word: card.word });
    if (hits.length >= limit) break;
  }
  return hits;
}
