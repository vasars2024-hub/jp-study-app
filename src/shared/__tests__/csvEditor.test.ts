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
