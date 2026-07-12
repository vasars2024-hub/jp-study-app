import { describe, expect, it } from 'vitest';
import { parseCsvText } from '../csvEditor';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../csvEditorHistory';
import {
  addAutoNumberColumn,
  addTagColumn,
  appendTables,
  buildSearchPattern,
  changeCase,
  deduplicateRows,
  findAndReplace,
  mergeColumns,
  reorderColumns,
  rowMatchesFilters,
  splitColumn,
  trimWhitespace,
} from '../csvEditorTransforms';

describe('csvEditorTransforms', () => {
  const sample = parseCsvText('Word,Reading,Meaning\n人間,にんげん,human\n人間,にんげん,person');

  it('reorders columns', () => {
    const next = reorderColumns(sample, 0, 2);
    expect(next.headers).toEqual(['Reading', 'Meaning', 'Word']);
    expect(next.rows[0]).toEqual(['にんげん', 'human', '人間']);
  });

  it('splits a column on delimiter', () => {
    const t = parseCsvText('Pair\n猫:cat', { hasHeader: true });
    const next = splitColumn(t, 0, ':');
    expect(next.headers).toEqual(['Pair (1)', 'Pair (2)']);
    expect(next.rows[0]).toEqual(['猫', 'cat']);
  });

  it('merges columns with separator', () => {
    const next = mergeColumns(sample, [0, 1], ' (');
    expect(next.headers[0]).toContain('Word');
    expect(next.rows[0][0]).toBe('人間 (にんげん');
    expect(next.headers).toHaveLength(2);
  });

  it('find and replace in selected columns', () => {
    const next = findAndReplace(sample, 'human', 'mortal', [2]);
    expect(next.rows[0][2]).toBe('mortal');
    expect(next.rows[1][2]).toBe('person');
  });

  it('changes case for a column', () => {
    const next = changeCase(sample, 'upper', { colIndices: [2] });
    expect(next.rows[0][2]).toBe('HUMAN');
  });

  it('trims whitespace', () => {
    const t = parseCsvText('Col\n  spaced  ', { hasHeader: true });
    const next = trimWhitespace(t);
    expect(next.rows[0][0]).toBe('spaced');
  });

  it('deduplicates by column', () => {
    const next = deduplicateRows(sample, 0);
    expect(next.rows).toHaveLength(1);
  });

  it('adds tag column with value', () => {
    const next = addTagColumn(sample, 'Set', 'Vocab 1');
    expect(next.headers.at(-1)).toBe('Set');
    expect(next.rows[0].at(-1)).toBe('Vocab 1');
  });

  it('adds auto-number column', () => {
    const next = addAutoNumberColumn(sample, 'ID');
    expect(next.headers[0]).toBe('ID');
    expect(next.rows[0][0]).toBe('1');
    expect(next.rows[1][0]).toBe('2');
  });

  it('appends tables', () => {
    const a = parseCsvText('A,B\n1,2');
    const b = parseCsvText('A,B\n3,4');
    const next = appendTables(a, b);
    expect(next.rows).toHaveLength(2);
    expect(next.rows[1][0]).toBe('3');
  });

  it('filters rows with global and column filters', () => {
    const pattern = buildSearchPattern('human', false);
    expect(rowMatchesFilters(sample.rows[0], pattern, {}, false)).toBe(true);
    expect(rowMatchesFilters(sample.rows[1], pattern, {}, false)).toBe(false);
    expect(rowMatchesFilters(sample.rows[0], null, { 0: '人間' }, false)).toBe(true);
  });
});

describe('csvEditorHistory', () => {
  const snap = {
    title: 'deck',
    hiddenColumns: [],
    table: parseCsvText('A\n1'),
  };

  it('supports undo and redo', () => {
    let h = createHistory(snap);
    const next = {
      ...snap,
      title: 'renamed',
      table: parseCsvText('A\n2'),
    };
    h = pushHistory(h, next);
    expect(canUndo(h)).toBe(true);
    expect(h.present.title).toBe('renamed');

    const undone = undoHistory(h);
    expect(undone?.present.title).toBe('deck');
    expect(canRedo(undone!)).toBe(true);

    const redone = redoHistory(undone!);
    expect(redone?.present.title).toBe('renamed');
  });
});
