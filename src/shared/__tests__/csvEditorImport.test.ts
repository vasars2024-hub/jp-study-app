/**
 * CSV editor import (round-2 audit F, CSV items 1, 4, 5, 8, 9).
 *
 * Each case failed on the code before the fix: the panel forced the grid's
 * delimiter into the parse, an Anki text export's `#separator:tab` header
 * became a data row, a blank grid counted as content, Append kept "Column N"
 * and dropped the file's own headers, and every Japanese deck title got the
 * id `import-deck`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyTable,
  isBlankTable,
  isGeneratedColumnName,
  parseCsvText,
  setCsvColumnLabel,
} from '../csvEditor';
import { appendTables } from '../csvEditorTransforms';
import { deckBookId, legacyDeckBookId } from '../deckImport';
import { planDeckUpsert } from '../deckUpsert';

afterEach(() => setCsvColumnLabel(null));

describe('delimiter and header detection', () => {
  it('reads an Anki "Notes in Plain Text" export: directives dropped, tab separator, no header', () => {
    const raw = '#separator:tab\n#html:true\n猫\tねこ\tcat\n犬\tいぬ\tdog\n';
    const table = parseCsvText(raw);
    expect(table.delimiter).toBe('\t');
    expect(table.hasHeader).toBe(false);
    expect(table.rows).toEqual([
      ['猫', 'ねこ', 'cat'],
      ['犬', 'いぬ', 'dog'],
    ]);
  });

  it('takes column names from an Anki #columns: line', () => {
    const table = parseCsvText('#separator:Semicolon\n#columns:Front;Back\n猫;cat\n');
    expect(table.delimiter).toBe(';');
    expect(table.headers).toEqual(['Front', 'Back']);
    expect(table.rows).toEqual([['猫', 'cat']]);
  });

  it('detects a TSV when no delimiter is forced (the panel used to force the grid comma)', () => {
    const tsv = 'Word\tReading\tMeaning\n猫\tねこ\tcat, a feline';
    expect(parseCsvText(tsv).headers).toEqual(['Word', 'Reading', 'Meaning']);
    // What the panel did before: one column holding the whole line.
    expect(parseCsvText(tsv, { delimiter: ',', hasHeader: true }).rows[0][0]).toBe('猫\tねこ\tcat');
  });
});

describe('blank grid', () => {
  it('treats the fresh 4x8 grid as empty and a grid with one value as content', () => {
    const blank = emptyTable(4, 8);
    expect(isBlankTable(blank)).toBe(true);
    const withValue = { ...blank, rows: blank.rows.map((r, i) => (i === 3 ? ['x', '', '', ''] : r)) };
    expect(isBlankTable(withValue)).toBe(false);
  });
});

describe('append merges headers', () => {
  it('adopts the incoming names over generated ones', () => {
    const base = parseCsvText('1,2\n3,4', { hasHeader: false });
    expect(base.headers).toEqual(['Column 1', 'Column 2']);
    const next = appendTables(base, parseCsvText('Word,Meaning\n猫,cat'));
    expect(next.headers).toEqual(['Word', 'Meaning']);
    expect(next.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
      ['猫', 'cat'],
    ]);
  });

  it('lines named columns up by name and adds the ones the base lacks', () => {
    const base = parseCsvText('Word,Meaning\n犬,dog');
    const next = appendTables(base, parseCsvText('Meaning,Word,Reading\ncat,猫,ねこ'));
    expect(next.headers).toEqual(['Word', 'Meaning', 'Reading']);
    expect(next.rows).toEqual([
      ['犬', 'dog', ''],
      ['猫', 'cat', 'ねこ'],
    ]);
  });
});

describe('generated column names follow the UI language', () => {
  it('uses the template for new grids, parses and inserted columns', () => {
    setCsvColumnLabel('列 {n}');
    expect(emptyTable(2, 1).headers).toEqual(['列 1', '列 2']);
    expect(parseCsvText('a,b', { hasHeader: false }).headers).toEqual(['列 1', '列 2']);
    expect(parseCsvText('a,b', { hasHeader: false, columnLabel: 'Столбец {n}' }).headers).toEqual([
      'Столбец 1',
      'Столбец 2',
    ]);
    expect(isGeneratedColumnName('列 7')).toBe(true);
    expect(isGeneratedColumnName('Column 7')).toBe(true);
    expect(isGeneratedColumnName('Meaning')).toBe(false);
  });
});

describe('deck ids', () => {
  it('keeps two Japanese titles apart, stably', () => {
    expect(legacyDeckBookId('吾輩は猫である')).toBe(legacyDeckBookId('雪国'));
    expect(deckBookId('吾輩は猫である')).not.toBe(deckBookId('雪国'));
    expect(deckBookId('雪国')).toBe(deckBookId('雪国'));
    expect(deckBookId('雪国')).toMatch(/^import-雪国-[0-9a-f]{8}$/);
  });

  it('leaves ASCII titles on the old id, so existing decks still match', () => {
    expect(deckBookId('test-deck')).toBe('import-test-deck');
    expect(deckBookId('My Deck')).toBe(legacyDeckBookId('My Deck'));
  });
});

describe('planDeckUpsert', () => {
  const card = (id: string, word: string, extra: Record<string, unknown> = {}) => ({
    id,
    word,
    reading: '',
    meaning: 'm',
    bookId: 'import-a',
    bookTitle: 'A',
    ...extra,
  });
  const entry = (word: string, meaning = 'm', bookTitle = 'A') => ({
    word,
    reading: '',
    meaning,
    bookId: 'import-a',
    bookTitle,
  });

  it('matches by front, keeps id and review state, and reports new and missing rows', () => {
    const cards = [
      card('1', '猫', { srs: { reps: 4 } }),
      card('2', '犬'),
      card('3', '鳥'),
      card('x', '猫', { bookId: 'other' }),
    ];
    const plan = planDeckUpsert(cards, { bookId: 'import-a' }, [entry('猫', 'cat'), entry('犬'), entry('魚')]);
    expect(plan.updated.map((c) => [c.id, c.meaning, (c as { srs?: unknown }).srs])).toEqual([
      ['1', 'cat', { reps: 4 }],
    ]);
    expect(plan.unchanged.map((c) => c.id)).toEqual(['2']);
    expect(plan.added.map((e) => e.word)).toEqual(['魚']);
    expect(plan.missing.map((c) => c.id)).toEqual(['3']);
  });

  it('carries cards over from the legacy id of the same title', () => {
    const cards = [card('1', '猫', { bookId: 'import-deck', bookTitle: '雪国' })];
    const plan = planDeckUpsert(
      cards,
      { bookId: 'import-new', legacy: { bookId: 'import-deck', bookTitle: '雪国' } },
      [entry('猫', 'm', '雪国')],
    );
    expect(plan.updated.map((c) => [c.id, c.bookId])).toEqual([['1', 'import-new']]);
    expect(plan.added).toEqual([]);
  });
});

describe('other study languages', () => {
  it('maps Chinese and Russian column names in a CSV header', async () => {
    const { guessColumnMapping } = await import('../deckImport');
    expect(guessColumnMapping(['汉字', '拼音', '意思', '例句'])).toEqual({ 0: 'word', 1: 'reading', 2: 'meaning', 3: 'sentence' });
    expect(guessColumnMapping(['Слово', 'Ударение', 'Перевод', 'Пример'])).toEqual({ 0: 'word', 1: 'reading', 2: 'meaning', 3: 'sentence' });
  });

  it('resolves a Chinese Anki note type by name, not by position', async () => {
    const { resolveFieldRoles } = await import('../apkgCards');
    // Pinyin first: the old positional fallback took it as the studied word.
    const model = { name: 'Chinese', flds: [
      { name: 'Pinyin', ord: 0 },
      { name: 'Hanzi', ord: 1 },
      { name: 'English', ord: 2 },
      { name: '例句', ord: 3 },
    ] };
    expect(resolveFieldRoles(model)).toEqual({ word: 1, reading: 0, meaning: 2, sentence: 3 });
  });

  it('gives a Russian deck title its own id', () => {
    expect(deckBookId('Русские глаголы')).not.toBe(deckBookId('Русские существительные'));
    expect(deckBookId('Русские глаголы')).toMatch(/^import-русские-глаголы-[0-9a-f]{8}$/);
  });
});
