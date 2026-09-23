import { describe, expect, it } from 'vitest';
import { csvTable, isBlankCsvRow, parseCsv, stripBom } from '../imports/csv';

describe('parseCsv', () => {
  it('splits plain rows and drops only the trailing newline', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('Name,Year\n"Crouching Tiger, Hidden Dragon",2000\n')).toEqual([
      ['Name', 'Year'],
      ['Crouching Tiger, Hidden Dragon', '2000'],
    ]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('"the ""real"" Mima",x')).toEqual([['the "real" Mima', 'x']]);
  });

  it('keeps newlines inside quoted fields (CRLF and LF)', () => {
    expect(parseCsv('a,"line one\r\nline two\nline three",b\r\n')).toEqual([
      ['a', 'line one\r\nline two\nline three', 'b'],
    ]);
  });

  it('accepts CRLF, LF and lone CR record separators', () => {
    expect(parseCsv('a,b\r\n1,2\r3,4\n5,6')).toEqual([['a', 'b'], ['1', '2'], ['3', '4'], ['5', '6']]);
  });

  it('strips a UTF-8 BOM so the first header is not "\\uFEFFDate"', () => {
    const rows = parseCsv('\uFEFFDate,Name\n2024-01-01,X\n');
    expect(rows[0][0]).toBe('Date');
    expect(stripBom('\uFEFFx')).toBe('x');
    expect(stripBom('x')).toBe('x');
  });

  it('keeps empty fields, including a trailing one', () => {
    expect(parseCsv('a,,c,\n')).toEqual([['a', '', 'c', '']]);
    expect(parseCsv(',\n')).toEqual([['', '']]);
  });

  it('returns blank lines as a single empty cell so section breaks are visible', () => {
    const rows = parseCsv('header\n\nPosition,Name\n1,X\n');
    expect(rows).toEqual([['header'], [''], ['Position', 'Name'], ['1', 'X']]);
    expect(isBlankCsvRow(rows[1])).toBe(true);
    expect(isBlankCsvRow(['', ' '])).toBe(true);
    expect(isBlankCsvRow(['x'])).toBe(false);
  });

  it('keeps a stray quote inside an unquoted field literally', () => {
    expect(parseCsv('5" Floppy,1999\n')).toEqual([['5" Floppy', '1999']]);
  });

  it('does not lose the final field of an unterminated quote', () => {
    expect(parseCsv('a,"unterminated')).toEqual([['a', 'unterminated']]);
  });

  it('parses empty input to no rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\uFEFF')).toEqual([]);
  });
});

describe('csvTable', () => {
  it('keys records by the trimmed header and pads short rows', () => {
    const table = csvTable(parseCsv(' Date , Name ,Year\n2024-01-01,X\n'));
    expect(table.header).toEqual(['Date', 'Name', 'Year']);
    expect(table.records).toEqual([{ Date: '2024-01-01', Name: 'X', Year: '' }]);
  });

  it('skips leading and interior blank lines', () => {
    const table = csvTable(parseCsv('\n\nA,B\n1,2\n\n3,4\n'));
    expect(table.records).toEqual([{ A: '1', B: '2' }, { A: '3', B: '4' }]);
  });

  it('answers an empty table for no rows', () => {
    expect(csvTable([])).toEqual({ header: [], records: [] });
  });
});
