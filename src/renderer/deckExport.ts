import { hasCardAiExtras } from '../shared/cardAiExtras';
import { cardAiExtrasHtml, type CardAiExtrasLabels } from '../shared/cardAiExtrasHtml';
import { escapeCsvField, type CsvDelimiter } from '../shared/csvEditor';
import type { DeckFlashcard } from './flashcardDeck';

/**
 * The deck as CSV. A `Notes` column is added only when some card carries saved
 * extras (memory aid, "not to confuse with" note, kept examples, accepted
 * answers — `shared/cardAiExtras.ts`), as the same HTML the Anki paths write,
 * so a deck without them exports exactly the six columns it always did.
 */
export function deckCardsToCsv(
  cards: DeckFlashcard[],
  delimiter: CsvDelimiter = ',',
  notesLabels?: CardAiExtrasLabels,
): string {
  const withNotes = cards.some(hasCardAiExtras);
  const headers = ['Expression', 'Reading', 'Meaning', 'Sentence', 'Front', 'Back', ...(withNotes ? ['Notes'] : [])];
  const lines = [
    headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter),
    ...cards.map((c) =>
      [
        c.word,
        c.reading,
        c.meaning,
        c.sentence ?? '',
        c.front ?? '',
        c.back ?? '',
        ...(withNotes ? [cardAiExtrasHtml(c, notesLabels)] : []),
      ]
        .map((v) => escapeCsvField(v, delimiter))
        .join(delimiter),
    ),
  ];
  return lines.join('\n');
}
