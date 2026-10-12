import type { AiEnrichmentResult } from '../shared/mining';
import { deckBookId } from '../shared/deckImport';
import { upsertImportedDeck } from './flashcardDeck';

/**
 * Save a Card Studio batch into its deck group — as an UPDATE, never a
 * replacement.
 *
 * This used to go through `replaceImportedDeck`, which deletes every card in the
 * `(bookId, bookTitle)` group before inserting. Every studio batch for one
 * preset lands under the same `<preset> studio` title, so saving a second batch
 * silently destroyed the first one and every review it had collected. It now
 * goes through `upsertImportedDeck` (`shared/deckUpsert.ts`): a card already in
 * the group for the same word keeps its id and review state and takes the new
 * text, new words are appended, and nothing is ever removed — `removeMissing` is
 * never passed, so deleting earlier cards is left to the deck UI's own,
 * confirmed, controls.
 *
 * @param bookIdOverride Overrides the id derived from the title. A caller that
 * already holds a collision-free id — the one `miningDeckIdentity` derives from
 * the library item id — passes it rather than letting it be re-derived from a
 * title that may change.
 */
export function saveAiResultsToDeck(
  results: AiEnrichmentResult[],
  deckTitle: string,
  bookIdOverride?: string,
): number {
  const title = deckTitle.trim() || 'AI card studio';
  const bookId = bookIdOverride?.trim() || deckBookId(title).replace(/^import-/, 'ai-');
  const entries: Parameters<typeof upsertImportedDeck>[1][number][] = [];

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
  upsertImportedDeck(bookId, entries);
  return entries.length;
}
