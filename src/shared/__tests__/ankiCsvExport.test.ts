import { describe, expect, it } from 'vitest';
import {
  applyCsvExportChanges,
  buildAnkiCsvHeader,
  CsvExportRefusal,
  quoteCsvCell,
  serializeCsvRows,
} from '../ankiCsvExport';
import { buildAnkiCsvCollection, parseAnkiCsvMeta } from '../ankiCsv';
import { ANKI_FIELD_SEP } from '../ankiDraft';
import type { ApkgExportChangeSet } from '../ankiApkgExport';

/** The user's own export's header, verbatim: three directives and no `#columns:`. */
const HEADER = '#separator:tab\n#html:false\n#tags column:11\n';
const ROW = (a: string, b: string, c: string): string =>
  [a, b, '', c, '', '', '', '', '', '', ''].join('\t');
const FILE = `${HEADER}${ROW('おばさん', 'こんにちは、おばさん。', '阿姨')}\n${ROW('ああ', 'ああ、君だったのか！', '啊')}\n`;

function changeSet(over: Partial<ApkgExportChangeSet> = {}): ApkgExportChangeSet {
  return { notes: [], cardMoves: [], deckRenames: [], ...over };
}

/** Field values as `buildAnkiCsvCollection` reads them back out of a file. */
function fieldsOf(text: string, noteId: string): string[] {
  const note = buildAnkiCsvCollection(text).raw.notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`no ${noteId}`);
  return String(note.flds).split(ANKI_FIELD_SEP);
}

describe('quoteCsvCell', () => {
  it('leaves ordinary text alone, including markup a #html:false file owns', () => {
    expect(quoteCsvCell('ああ', '\t', false)).toBe('ああ');
    expect(quoteCsvCell('a < b', '\t', false)).toBe('a < b');
  });

  it('quotes the separator, quotes and newlines', () => {
    expect(quoteCsvCell('a\tb', '\t', false)).toBe('"a\tb"');
    expect(quoteCsvCell('say "hi"', '\t', false)).toBe('"say ""hi"""');
    expect(quoteCsvCell('two\nlines', '\t', false)).toBe('"two\nlines"');
  });

  it('quotes a leading # only in the first column, where it would re-read as a directive', () => {
    expect(quoteCsvCell('#tag', '\t', true)).toBe('"#tag"');
    expect(quoteCsvCell('#tag', '\t', false)).toBe('#tag');
  });
});

describe('buildAnkiCsvHeader', () => {
  it('round-trips the user file to an identical meta, and re-emits #html:false', () => {
    const before = parseAnkiCsvMeta(FILE);
    const header = buildAnkiCsvHeader(before);
    expect(header).toBe('#separator:tab\n#html:false\n#tags column:11\n');
    const after = parseAnkiCsvMeta(`${header}x\ty\n`);
    expect(after.separator).toBe(before.separator);
    expect(after.html).toBe(false);
    expect(after.tagsColumn).toBe(11);
  });

  it('writes the separator by name and preserves unknown directives and #columns:', () => {
    const source =
      '#separator:comma\n#html:true\n#guid column:1\n#notetype:Basic\n#deck:D\n#tags:core n1\n#futuredirective:7\n#columns:guid,Front,Back\na,b,c\n';
    const meta = parseAnkiCsvMeta(source);
    const header = buildAnkiCsvHeader(meta);
    expect(header).toContain('#separator:comma');
    expect(header).toContain('#guid column:1');
    expect(header).toContain('#notetype:Basic');
    expect(header).toContain('#tags:core n1');
    expect(header).toContain('#futuredirective:7');
    expect(header).toContain('#columns:guid,Front,Back');
    const round = parseAnkiCsvMeta(`${header}a,b,c\n`);
    expect(round.columnNames).toEqual(['guid', 'Front', 'Back']);
    expect(round.globalTags).toEqual(['core', 'n1']);
    expect(round.unknownDirectives).toEqual(['#futuredirective:7']);
  });
});

describe('serializeCsvRows', () => {
  it('ends the last row and starts no empty one', () => {
    expect(serializeCsvRows([['a', 'b']], '\t')).toBe('a\tb\n');
  });
});

describe('applyCsvExportChanges', () => {
  it('rewrites only the addressed row and leaves every other cell byte-identical', () => {
    const out = applyCsvExportChanges(
      FILE,
      changeSet({
        notes: [
          {
            noteId: 'csv-row-1',
            fields: ['おばさん', 'こんにちは、おばさん。', '', 'тётя', '', '', '', '', '', ''],
          },
        ],
      }),
    );
    expect(out.notesUpdated).toBe(1);
    expect(out.rowsWritten).toBe(2);
    expect(out.noteIdentity).toBe('row-order');
    // Read back through the reader an import would use, not by string compare.
    expect(fieldsOf(out.text, 'csv-row-1')[3]).toBe('тётя');
    // The negative control: the note deliberately outside the selection.
    expect(fieldsOf(out.text, 'csv-row-2')).toEqual(fieldsOf(FILE, 'csv-row-2'));
  });

  it('swaps two columns — the text deck’s "reverse cards"', () => {
    const before = fieldsOf(FILE, 'csv-row-1');
    const swapped = [...before];
    [swapped[0], swapped[3]] = [swapped[3], swapped[0]];
    const out = applyCsvExportChanges(
      FILE,
      changeSet({ notes: [{ noteId: 'csv-row-1', fields: swapped }] }),
    );
    const after = fieldsOf(out.text, 'csv-row-1');
    expect(after[0]).toBe(before[3]);
    expect(after[3]).toBe(before[0]);
  });

  it('does not HTML-escape a #html:false field', () => {
    const fields = fieldsOf(FILE, 'csv-row-1');
    fields[3] = 'a < b & c > d';
    const out = applyCsvExportChanges(
      FILE,
      changeSet({ notes: [{ noteId: 'csv-row-1', fields }] }),
    );
    expect(out.text).toContain('a < b & c > d');
    expect(out.text).not.toContain('&amp;');
    expect(fieldsOf(out.text, 'csv-row-1')[3]).toBe('a < b & c > d');
  });

  it('writes tags into the declared column, minus the file-wide #tags: prefix', () => {
    const source = `#separator:tab\n#html:false\n#tags column:3\n#tags:core\na\tb\tcore\n`;
    const out = applyCsvExportChanges(
      source,
      changeSet({ notes: [{ noteId: 'csv-row-1', tags: ['core', 'n1'] }] }),
    );
    expect(out.tagsUpdated).toBe(1);
    expect(out.notesUpdated).toBe(0);
    // Written without the global, and read back WITH it — one `core`, not two.
    expect(out.text).toContain('a\tb\tn1\n');
    expect(buildAnkiCsvCollection(out.text).raw.notes[0].tags).toBe('core n1');
  });

  it('refuses tags when the file declares no tags column', () => {
    const source = '#separator:tab\n#html:false\na\tb\n';
    expect(() =>
      applyCsvExportChanges(source, changeSet({ notes: [{ noteId: 'csv-row-1', tags: ['n1'] }] })),
    ).toThrow(expect.objectContaining({ code: 'no-tags-column' }));
  });

  it('refuses a card-level edit by name instead of dropping it', () => {
    try {
      applyCsvExportChanges(
        FILE,
        changeSet({
          cardMoves: [{ cardId: 'c1', noteId: 'csv-row-1', due: 5 }],
          cardQueues: [{ cardId: 'c1', noteId: 'csv-row-1', queue: 'suspended' }],
        }),
      );
      throw new Error('expected a refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvExportRefusal);
      expect((err as CsvExportRefusal).code).toBe('unsupported-change');
      expect((err as CsvExportRefusal).details).toEqual(['card-repositions:1', 'card-suspends:1']);
    }
  });

  it('refuses an unknown row and a field count that does not fill the row', () => {
    expect(() =>
      applyCsvExportChanges(FILE, changeSet({ notes: [{ noteId: 'csv-row-99', fields: [] }] })),
    ).toThrow(expect.objectContaining({ code: 'note-missing' }));
    expect(() =>
      applyCsvExportChanges(FILE, changeSet({ notes: [{ noteId: 'csv-row-1', fields: ['x'] }] })),
    ).toThrow(expect.objectContaining({ code: 'field-count-mismatch' }));
  });

  it('numbers rows including blank ones, exactly as the reader does', () => {
    // A blank line produces no note but still consumes a row number; resolving
    // ids by counting non-blank rows would edit the wrong row here.
    const source = `#separator:tab\n#html:false\na\tb\n\t\nc\td\n`;
    const ids = buildAnkiCsvCollection(source).raw.notes.map((n) => n.id);
    expect(ids).toEqual(['csv-row-1', 'csv-row-3']);
    const out = applyCsvExportChanges(
      source,
      changeSet({ notes: [{ noteId: 'csv-row-3', fields: ['C', 'D'] }] }),
    );
    expect(fieldsOf(out.text, 'csv-row-1')).toEqual(['a', 'b']);
    expect(fieldsOf(out.text, 'csv-row-3')).toEqual(['C', 'D']);
  });

  it('keeps a quoted multi-line cell quoted so the row count survives', () => {
    const source = '#separator:tab\n#html:false\n"two\nlines"\tb\n';
    expect(buildAnkiCsvCollection(source).raw.notes).toHaveLength(1);
    const out = applyCsvExportChanges(
      source,
      changeSet({ notes: [{ noteId: 'csv-row-1', fields: ['two\nlines', 'B'] }] }),
    );
    expect(buildAnkiCsvCollection(out.text).raw.notes).toHaveLength(1);
    expect(fieldsOf(out.text, 'csv-row-1')).toEqual(['two\nlines', 'B']);
  });

  it('quotes a field the user made start with # so it is not re-read as a directive', () => {
    const out = applyCsvExportChanges(
      FILE,
      changeSet({
        notes: [
          {
            noteId: 'csv-row-1',
            fields: ['#hashtag', 'b', '', 'd', '', '', '', '', '', ''],
          },
        ],
      }),
    );
    const meta = parseAnkiCsvMeta(out.text);
    expect(meta.unknownDirectives).toEqual([]);
    expect(fieldsOf(out.text, 'csv-row-1')[0]).toBe('#hashtag');
  });
});
