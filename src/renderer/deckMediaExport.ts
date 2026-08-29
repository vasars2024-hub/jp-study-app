/**
 * Turn a local deck into something Anki can import, audio and all.
 *
 * The decision is in `shared/deckMediaExport`; this is the run. It reuses the
 * CSV escaping the plain export already uses rather than a second quoting
 * routine, so a sentence with a comma behaves the same either way.
 */

import { escapeCsvField, type CsvDelimiter } from '../shared/csvEditor';
import { buildDeckMediaExport, type DeckMediaExportCard } from '../shared/deckMediaExport';

export interface DeckMediaExportOutcome {
  ok: boolean;
  directory?: string;
  /** Cards written to the text file. */
  cards: number;
  /** Media files written beside it. */
  written: number;
  /** Media a card pointed at that could not be exported — gone, or not managed. */
  failed: number;
  /** Cards with no audio at all. Not a failure; the row is still exported. */
  withoutAudio: number;
  error?: string;
}

/**
 * Export `cards` with their audio.
 *
 * Returns rather than throws: every count the caller shows has to come from
 * what actually reached disk, and a partial export — some clips gone, the rest
 * written — is a real outcome that must be reported as one instead of being
 * rounded to success or to failure.
 */
export async function runDeckAudioExport(
  cards: readonly DeckMediaExportCard[],
  fileName = 'deck.csv',
  delimiter: CsvDelimiter = ',',
): Promise<DeckMediaExportOutcome> {
  const built = buildDeckMediaExport(cards);
  const text = built.rows
    .map((row) => row.map((field) => escapeCsvField(field, delimiter)).join(delimiter))
    .join('\n');

  const result = await window.api.flashcardExportDeck({ text, fileName, media: built.media });
  return {
    ok: result.ok === true,
    directory: result.directory,
    cards: built.rows.length - 1,
    written: result.written ?? 0,
    failed: result.failed ?? 0,
    withoutAudio: built.withoutAudio,
    error: result.error,
  };
}
