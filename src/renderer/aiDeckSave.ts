import type { AiEnrichmentResult } from '../shared/mining';
import { deckBookId } from '../shared/deckImport';
import { replaceImportedDeck } from './flashcardDeck';

export function saveAiResultsToDeck(
  results: AiEnrichmentResult[],
  deckTitle: string,
): number {
  const title = deckTitle.trim() || 'AI card studio';
  const bookId = deckBookId(title).replace(/^import-/, 'ai-');
  const entries: Parameters<typeof replaceImportedDeck>[2] = [];

  for (const result of results) {
    for (const card of result.cards) {
      entries.push({
        word: result.expression,
        reading: result.reading || '',
        meaning: result.meaning || card.back?.split('\n')[0] || '',
        sentence: result.sentence || undefined,
        front: card.front,
        back: card.back,
        source: 'epub-ai',
        bookId,
        bookTitle: title,
      });
    }
  }

  if (!entries.length) return 0;
  replaceImportedDeck(bookId, title, entries);
  return entries.length;
}
