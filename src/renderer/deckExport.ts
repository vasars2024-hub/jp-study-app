import { escapeCsvField, type CsvDelimiter } from '../shared/csvEditor';
import type { DeckFlashcard } from './flashcardDeck';

export function deckCardsToCsv(cards: DeckFlashcard[], delimiter: CsvDelimiter = ','): string {
  const headers = ['Expression', 'Reading', 'Meaning', 'Sentence', 'Front', 'Back'];
  const lines = [
    headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter),
    ...cards.map((c) =>
      [c.word, c.reading, c.meaning, c.sentence ?? '', c.front ?? '', c.back ?? '']
        .map((v) => escapeCsvField(v, delimiter))
        .join(delimiter),
    ),
  ];
  return lines.join('\n');
}
