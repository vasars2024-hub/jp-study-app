// @vitest-environment node
/**
 * The approved AI extras on a Gum deck card — memory aid, "not to confuse with"
 * note, kept example sentences, accepted answers — leave the app with the card:
 * the deck CSV, the local package's rows (`deckMediaExport`), and the block the
 * AnkiConnect path writes (`ankiCardExtrasMine.test.ts` covers that one against
 * the fake AnkiConnect).
 *
 * The rule that matters most: model-written text is sanitized and marked as
 * generated; the learner's own text and corpus sentences are escaped in full;
 * and a deck without extras exports byte-for-byte what it did before.
 */
import { describe, expect, it } from 'vitest';
import { hasCardAiExtras, pickCardAiExtras } from '../cardAiExtras';
import { cardAiExtrasHtml, placeCardAiExtras, type CardAiExtrasLabels } from '../cardAiExtrasHtml';
import { buildDeckMediaExport, DECK_EXPORT_HEADERS } from '../deckMediaExport';
import { parseCsvRecords } from '../csvEditor';
import { deckCardsToCsv } from '../../renderer/deckExport';
import type { DeckFlashcard } from '../../renderer/flashcardDeck';

const LABELS: CardAiExtrasLabels = { mnemonic: 'Memory aid', distinction: 'Not to confuse with', examples: 'Examples', accepted: 'Also accepted' };

const PLAIN: DeckFlashcard = { id: 'plain', word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import', addedAt: 1 };
const RICH: DeckFlashcard = {
  ...PLAIN,
  id: 'rich',
  word: '食べる',
  reading: 'たべる',
  meaning: 'to eat',
  mnemonic: '<img src=x onerror=alert(1)>Tabe-ru: a <b>table</b>',
  distinction: 'Not 食う',
  exampleSentences: [
    { text: 'パンを食べる。', translation: 'I eat bread.', origin: 'ai' },
    { text: '寿司を<i>食べる</i>', origin: 'corpus' },
  ],
  acceptedAnswers: { meaning: ['eat & drink'], target: ['たべる'] },
};

describe('the extras block', () => {
  it('marks and sanitizes generated text, escapes the learner\'s own', () => {
    const html = cardAiExtrasHtml(RICH, LABELS);
    expect(html.startsWith('<div class="jp-card-extras">')).toBe(true);
    expect(html).not.toMatch(/<img|onerror=alert\(1\)>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Tabe-ru: a <b>table</b>');
    // mnemonic, distinction, the AI sentence and its translation: four marks.
    expect(html.match(/class="jp-ai-gen"/g)).toHaveLength(4);
    // The corpus sentence is quoted, not generated: escaped (its <i> too), unmarked.
    expect(html).toContain('寿司を&lt;i&gt;食べる&lt;/i&gt;');
    expect(html).not.toMatch(/jp-ai-gen[^>]*>寿司/);
    expect(html).toContain('<b>Also accepted</b> eat &amp; drink; たべる');
  });

  it('is empty for a card without extras, and drops what is malformed', () => {
    expect(cardAiExtrasHtml(PLAIN, LABELS)).toBe('');
    expect(hasCardAiExtras(PLAIN)).toBe(false);
    expect(pickCardAiExtras({ mnemonic: '  ', exampleSentences: [{ text: 3 }], acceptedAnswers: { meaning: [null, ''] } })).toBeUndefined();
    expect(pickCardAiExtras({ exampleSentences: [{ text: 'x', origin: 'weird' }] })).toEqual({ exampleSentences: [{ text: 'x', origin: 'ai' }] });
  });

  it('goes to the Notes field, else is appended to the meaning field', () => {
    expect(placeCardAiExtras({ Meaning: 'cat' }, { notes: 'Notes', meaning: 'Meaning' }, '<div>x</div>'))
      .toEqual({ Meaning: 'cat', Notes: '<div>x</div>' });
    expect(placeCardAiExtras({ Back: 'cat' }, { meaning: 'Back' }, '<div>x</div>')).toEqual({ Back: 'cat<br><div>x</div>' });
    expect(placeCardAiExtras({ Back: 'cat' }, {}, '<div>x</div>')).toEqual({ Back: 'cat' });
    expect(placeCardAiExtras({ Back: 'cat' }, { meaning: 'Back' }, '')).toEqual({ Back: 'cat' });
  });
});

describe('the deck CSV', () => {
  it('adds a Notes column only when a card has extras', () => {
    const before = deckCardsToCsv([PLAIN]);
    expect(before.split('\n')[0]).toBe('Expression,Reading,Meaning,Sentence,Front,Back');

    const rows = parseCsvRecords(deckCardsToCsv([PLAIN, RICH], ',', LABELS), ',');
    expect(rows[0]).toEqual(['Expression', 'Reading', 'Meaning', 'Sentence', 'Front', 'Back', 'Notes']);
    expect(rows[1][6]).toBe('');
    expect(rows[2][6]).toBe(cardAiExtrasHtml(RICH, LABELS));
  });
});

describe('the local package rows', () => {
  it('adds a Notes column after Image only when a card has extras', () => {
    expect(buildDeckMediaExport([PLAIN], { includeImages: true }).rows[0]).toEqual([...DECK_EXPORT_HEADERS, 'Image']);

    const built = buildDeckMediaExport([PLAIN, RICH], { includeImages: true, notesLabels: LABELS });
    expect(built.rows[0]).toEqual([...DECK_EXPORT_HEADERS, 'Image', 'Notes']);
    expect(built.rows.every((row) => row.length === built.rows[0].length)).toBe(true);
    expect(built.rows[1].at(-1)).toBe('');
    expect(built.rows[2].at(-1)).toBe(cardAiExtrasHtml(RICH, LABELS));
    // The package writer rebuilds the field from these, never from the row string.
    expect(built.notes).toEqual([null, pickCardAiExtras(RICH)]);
    expect(buildDeckMediaExport([PLAIN]).notes).toBeUndefined();
  });
});
