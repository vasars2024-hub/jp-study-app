import { describe, expect, it } from 'vitest';
import { parseCsvText, serializeCsvTable, setCell } from '../csvEditor';
import { guessColumnMapping, rowsToDeckEntries } from '../deckImport';

describe('csvEditor', () => {
  it('round-trips quoted fields with newlines', () => {
    const raw = 'a,b\n"line\nbreak",two';
    const table = parseCsvText(raw);
    expect(table.rows[1][0]).toBe('line\nbreak');
    expect(serializeCsvTable(table)).toContain('"line\nbreak"');
  });

  it('setCell updates a single cell', () => {
    const table = parseCsvText('w,r\n本,ほん');
    const next = setCell(table, 0, 0, '人');
    expect(next.rows[0][0]).toBe('人');
  });

  // The shape a Windows clipboard actually delivers: CRLF line endings, tab
  // delimiters, and a trailing newline. DeckImportPanel's onPaste branches on
  // tab and hands the raw text straight to parseCsvText.
  // Two data rows on purpose: header cells are trimmed on the way in, so a
  // stray \r only survives where it can be observed — at the end of a row.
  it('detects a tab delimiter and normalizes CRLF from a spreadsheet paste', () => {
    const table = parseCsvText('word\treading\tmeaning\r\n本\tほん\tbook\r\n人\tひと\tperson\r\n');
    expect(table.delimiter).toBe('\t');
    expect(table.headers).toEqual(['word', 'reading', 'meaning']);
    expect(table.rows).toEqual([
      ['本', 'ほん', 'book'],
      ['人', 'ひと', 'person'],
    ]);
  });

  it('honors quoting inside tab-delimited fields', () => {
    const table = parseCsvText('a\tb\n"one\ttwo"\tthree', { hasHeader: true });
    expect(table.rows[0]).toEqual(['one\ttwo', 'three']);
  });
});

describe('deckImport', () => {
  it('maps expression and reading columns', () => {
    const table = parseCsvText('Expression,Reading,Meaning\n人間,にんげん,human');
    const mapping = guessColumnMapping(table.headers);
    const entries = rowsToDeckEntries(table, mapping, 'test-deck');
    expect(entries).toHaveLength(1);
    expect(entries[0].word).toBe('人間');
    expect(entries[0].reading).toBe('にんげん');
    expect(entries[0].meaning).toBe('human');
    expect(entries[0].bookId).toBe('import-test-deck');
  });
});
