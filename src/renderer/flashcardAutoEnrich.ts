/**
 * The one seam every mining flow calls after it has added cards.
 *
 * Automatic narration and automatic readings are separate preferences with
 * separate failure modes, but they answer the same question — "what should
 * happen to a card the moment it exists" — and every mining flow had already
 * grown one call for the first. Adding a second call to each of the five sites
 * would have meant five places to keep in step; this is the single place.
 *
 * Both runs are independent: readings do not wait on the voice device, and a
 * missing voice does not cost a batch its furigana.
 */

import { narrateNewCards, type AutoAudioReport } from './flashcardAutoAudio';
import { annotateNewCards, type AutoReadingReport } from './flashcardAutoReading';
import type { DeckFlashcard } from './flashcardDeck';

export interface AutoEnrichReport {
  audio: AutoAudioReport | null;
  reading: AutoReadingReport | null;
}

/**
 * Fire-and-forget enrichment for a freshly added batch.
 *
 * Readings run first and are awaited before narration starts: they are local and
 * fast, and a card that gains its reading before the sequential voice device
 * gets to it shows up complete in the deck rather than in two visible steps.
 */
export async function enrichNewCards(
  created: readonly DeckFlashcard[],
): Promise<AutoEnrichReport> {
  const reading = await annotateNewCards(created).catch(() => null);
  const audio = await narrateNewCards(created).catch(() => null);
  return { audio, reading };
}
