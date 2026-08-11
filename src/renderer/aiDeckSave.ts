import type { AiEnrichmentResult } from '../shared/mining';
import { deckBookId } from '../shared/deckImport';
import { replaceImportedDeck } from './flashcardDeck';

/**
 * @param bookId Overrides the id derived from the title.
 *
 * `deckBookId` slugs on `[^\w]+` and `\w` is ASCII-only, so every Japanese title
 * collapses to the same id — `chapterRange.test.ts` asserts the collision. That
 * has never bitten this function because its only caller passed an English
 * preset label, but an Agent-generated `book` batch is named after the book, and
 * `replaceImportedDeck` DELETES the matched `(bookId, bookTitle)` group before
 * inserting. So a caller that already holds a collision-free id — the one
 * `miningDeckIdentity` derives from the library item id — passes it rather than
 * letting it be re-derived from the title and lost.
 */
export function saveAiResultsToDeck(
  results: AiEnrichmentResult[],
  deckTitle: string,
  bookIdOverride?: string,
): number {
  const title = deckTitle.trim() || 'AI card studio';
  const bookId = bookIdOverride?.trim() || deckBookId(title).replace(/^import-/, 'ai-');
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
