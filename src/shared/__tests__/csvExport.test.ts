import { describe, expect, it } from 'vitest';
import { buildEpubDeckExport, deckRowsToCsv } from '../epubDeck';
import type { EpubMiningAnalysis } from '../mining';
import { makeCandidate, makeConfig } from './testUtils';

const ROWS = [
  { expression: '人間', front: '人間', back: 'human "being"\nперевод' },
  { expression: '葦', front: '葦', back: 'reed; rush' },
];

describe('deckRowsToCsv', () => {
  it('escapes quotes and embedded newlines for the comma delimiter', () => {
    const csv = deckRowsToCsv(ROWS);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Expression","Front","Back"');
    expect(csv).toContain('"human ""being""');
    // Embedded newline stays inside the quoted field.
    expect(csv).toContain('human ""being""\nперевод');
  });

  it('supports semicolon and tab delimiters', () => {
    expect(deckRowsToCsv(ROWS, { delimiter: ';' }).split('\r\n')[0]).toBe(
      '"Expression";"Front";"Back"',
    );
    expect(deckRowsToCsv(ROWS, { delimiter: 'tab' }).split('\r\n')[0]).toBe(
      '"Expression"\t"Front"\t"Back"',
    );
  });

  it('header toggle removes the header row', () => {
    const csv = deckRowsToCsv(ROWS, { header: false });
    expect(csv.split('\r\n')[0]).toContain('人間');
  });
});

function makeAnalysis(candidates = [makeCandidate()]): EpubMiningAnalysis {
  return {
    itemId: 'book-1',
    title: 'Test Book',
    totalCharacters: 1000,
    analyzer: 'kuromoji',
    candidates,
    generatedAt: Date.now(),
  };
}

describe('buildEpubDeckExport', () => {
  it('custom token separator is applied between template tokens', () => {
    const config = makeConfig('{expression:ja}{reading:ja}', '{meaning:en}', {
      tokenSeparator: ' | ',
    });
    const analysis = makeAnalysis([makeCandidate({ glosses: { en: 'human being' } })]);
    const deck = buildEpubDeckExport(analysis, config, undefined, { skipFilter: true });
    expect(deck.rows[0].front).toBe('人間 | にんげん');
  });

  it('unfilled tokens leave no blank line in rendered sides', () => {
    const config = makeConfig('{expression:ja}', '{meaning:en}\n{expression:de}\n{reading:ja}');
    const analysis = makeAnalysis([makeCandidate({ glosses: { en: 'human being' } })]);
    const deck = buildEpubDeckExport(analysis, config, undefined, { skipFilter: true });
    expect(deck.rows[0].back).toBe('human being\nにんげん');
  });

  it('excludeIncomplete drops cards with missing template fields', () => {
    const config = makeConfig('{expression:ja}', '{meaning:en}', { excludeIncomplete: true });
    const full = makeCandidate({ glosses: { en: 'human being' } });
    const empty = makeCandidate({ expression: '朧月', reading: 'おぼろづき', glosses: {} });
    const deck = buildEpubDeckExport(makeAnalysis([full, empty]), config, undefined, {
      skipFilter: true,
    });
    expect(deck.cardCount).toBe(1);
    expect(deck.rows[0].expression).toBe('人間');
  });

  it('FS marker toggle controls the [FS] tag on Qwen-filled values', () => {
    const qwenFilled = makeCandidate({
      glosses: {},
      translations: { 'expression:ru': 'человек' },
      fieldSources: { 'expression:ru': 'qwen' },
    });
    const withMarker = buildEpubDeckExport(
      makeAnalysis([qwenFilled]),
      makeConfig('{expression:ja}', '{expression:ru}', { fsMarker: true }),
      undefined,
      { skipFilter: true },
    );
    expect(withMarker.rows[0].back).toBe('человек [FS]');
    const withoutMarker = buildEpubDeckExport(
      makeAnalysis([qwenFilled]),
      makeConfig('{expression:ja}', '{expression:ru}', { fsMarker: false }),
      undefined,
      { skipFilter: true },
    );
    expect(withoutMarker.rows[0].back).toBe('человек');
  });

  it('CSV options flow through the deck export', () => {
    const config = makeConfig('{expression:ja}', '{meaning:en}', {
      csvDelimiter: ';',
      csvHeader: false,
    });
    const analysis = makeAnalysis([makeCandidate({ glosses: { en: 'human being' } })]);
    const deck = buildEpubDeckExport(analysis, config, undefined, { skipFilter: true });
    expect(deck.csv).not.toContain('Expression');
    expect(deck.csv.split('\r\n')[0]).toContain('";"');
  });
});
