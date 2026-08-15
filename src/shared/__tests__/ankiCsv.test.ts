import { describe, it, expect } from 'vitest';
import {
  ANKI_CSV_SEPARATORS,
  buildAnkiCsvCollection,
  parseAnkiCsvMeta,
  parseDelimitedRows,
} from '../ankiCsv';
import {
  ANKI_FIELD_SEP as SEP,
  buildAnkiDraft,
  draftIsBlocked,
  type AnkiDraftDiagnosticCode,
  type AnkiDraftSource,
  type RawAnkiCollection,
} from '../ankiDraft';
import { stripFieldHtml } from '../apkgParse';

const source: AnkiDraftSource = {
  kind: 'csv',
  label: 'HSK4_deck.txt',
  fingerprint: 'sha1:test',
};

const draftOf = (raw: RawAnkiCollection) =>
  buildAnkiDraft(raw, { source, normalize: stripFieldHtml });

const codes = (raw: RawAnkiCollection): AnkiDraftDiagnosticCode[] =>
  draftOf(raw).diagnostics.map((d) => d.code);

/**
 * The header block of a real Anki export on this machine (`HSK4_deck.txt`),
 * with two of its 42 rows. Reproduced rather than read from disk so the test
 * runs anywhere.
 */
const HSK4 = [
  '#separator:tab',
  '#html:true',
  '#columns:Hanzi\tPinyin\tEnglish\tExample_ZH\tExample_PY\tExample_EN\tPOS\tTags',
  '#tags column:8',
  '遍\tbiàn\ttime (occurrence)\t请再说一遍。\tQǐng zài shuō yī biàn.\tPlease say it again.\tm.w.\tHSK4',
  '标准\tbiāozhǔn\tstandard\t你的发音很标准。\tNǐ de fāyīn hěn biāozhǔn.\tYour pronunciation is very standard.\tn./adj.\tHSK4',
  '',
].join('\n');

describe('parseAnkiCsvMeta', () => {
  it('reads the directive block of a real Anki export', () => {
    const meta = parseAnkiCsvMeta(HSK4);
    expect(meta.separator).toBe('\t');
    expect(meta.separatorSource).toBe('header');
    expect(meta.html).toBe(true);
    expect(meta.tagsColumn).toBe(8);
    expect(meta.columnNames).toEqual([
      'Hanzi',
      'Pinyin',
      'English',
      'Example_ZH',
      'Example_PY',
      'Example_EN',
      'POS',
      'Tags',
    ]);
    expect(HSK4.slice(meta.bodyOffset).startsWith('遍\t')).toBe(true);
  });

  it('trims the padding a real writer puts after a directive value', () => {
    // `FORMATME.txt` on this machine writes `#html:false` followed by nine tabs,
    // because the writer pads the header out to the column count. Reading the
    // value untrimmed gives `false\t\t\t…`, which is not `false`.
    const text = '#separator:tab\n#html:false\t\t\t\t\t\t\t\t\t\na\tb\n';
    const meta = parseAnkiCsvMeta(text);
    expect(meta.html).toBe(false);
    expect(text.slice(meta.bodyOffset)).toBe('a\tb\n');
  });

  it('drops the trailing empty column names a padded #columns: line produces', () => {
    const meta = parseAnkiCsvMeta('#separator:tab\n#columns:Front\tBack\t\t\nx\ty\n');
    expect(meta.columnNames).toEqual(['Front', 'Back']);
  });

  it('accepts every named separator and a bare literal one', () => {
    for (const [name, char] of Object.entries(ANKI_CSV_SEPARATORS)) {
      expect(parseAnkiCsvMeta(`#separator:${name}\na${char}b\n`).separator).toBe(char);
    }
    expect(parseAnkiCsvMeta('#separator:~\na~b\n').separator).toBe('~');
  });

  it('reads the column directives and the file-wide defaults', () => {
    const meta = parseAnkiCsvMeta(
      [
        '#separator:comma',
        '#guid column:1',
        '#notetype column:2',
        '#deck column:3',
        '#tags column:9',
        '#notetype:Basic',
        '#deck:Japanese::Core',
        '#tags:imported bulk',
        'a,b,c',
      ].join('\n'),
    );
    expect(meta.guidColumn).toBe(1);
    expect(meta.noteTypeColumn).toBe(2);
    expect(meta.deckColumn).toBe(3);
    expect(meta.tagsColumn).toBe(9);
    expect(meta.noteTypeName).toBe('Basic');
    expect(meta.deckName).toBe('Japanese::Core');
    expect(meta.globalTags).toEqual(['imported', 'bulk']);
  });

  it('keeps a directive it does not understand instead of dropping it', () => {
    const meta = parseAnkiCsvMeta('#separator:tab\n#futurething:7\na\tb\n');
    expect(meta.unknownDirectives).toEqual(['#futurething:7']);
  });

  it('stops the header block at the first data line, so a # in the data is data', () => {
    const meta = parseAnkiCsvMeta('#separator:tab\nfront\tback\n#hash\tstill data\n');
    expect(meta.unknownDirectives).toEqual([]);
    const rows = parseDelimitedRows(
      '#separator:tab\nfront\tback\n#hash\tstill data\n'.slice(meta.bodyOffset),
      '\t',
    );
    expect(rows).toEqual([
      ['front', 'back'],
      ['#hash', 'still data'],
    ]);
  });

  it('sniffs a separator when the file carries no header, and says it guessed', () => {
    const tsv = parseAnkiCsvMeta('a\tb\tc\nd\te\tf\n');
    expect(tsv.separator).toBe('\t');
    expect(tsv.separatorSource).toBe('sniffed');
    expect(parseAnkiCsvMeta('a,b,c\nd,e,f\n').separator).toBe(',');
    expect(parseAnkiCsvMeta('a;b;c\n').separator).toBe(';');
  });

  it('does not sniff a colon or a space out of ordinary prose', () => {
    const meta = parseAnkiCsvMeta('to eat: 食べる is a verb\n');
    expect(meta.separatorSource).toBe('default');
    expect(meta.separator).toBe('\t');
  });

  it('skips a byte-order mark without shifting the body offset off by one', () => {
    const text = '\uFEFF#separator:tab\nfront\tback\n';
    const meta = parseAnkiCsvMeta(text);
    expect(meta.separator).toBe('\t');
    expect(text.slice(meta.bodyOffset)).toBe('front\tback\n');
  });
});

describe('parseDelimitedRows', () => {
  it('unwraps a quoted field and its doubled inner quotes', () => {
    // The shape a real yomitan-glossary export writes: `""` inside `"`.
    expect(parseDelimitedRows('"<div class=""x"">hi</div>"\tback\n', '\t')).toEqual([
      ['<div class="x">hi</div>', 'back'],
    ]);
  });

  it('keeps a separator and a newline that live inside a quoted field', () => {
    expect(parseDelimitedRows('"a,b"\t"line1\nline2"\tc\n', '\t')).toEqual([
      ['a,b', 'line1\nline2', 'c'],
    ]);
  });

  it('treats CRLF and a lone CR as row ends', () => {
    expect(parseDelimitedRows('a\tb\r\nc\td\rE\tf', '\t')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['E', 'f'],
    ]);
  });

  it('does not turn a trailing newline into an extra empty row', () => {
    expect(parseDelimitedRows('a\tb\n', '\t')).toEqual([['a', 'b']]);
    expect(parseDelimitedRows('a\tb', '\t')).toEqual([['a', 'b']]);
  });

  it('reads a quote that does not open a field as literal text', () => {
    expect(parseDelimitedRows('say "hi"\tb\n', '\t')).toEqual([['say "hi"', 'b']]);
  });

  it('flushes an unterminated quote rather than throwing on a truncated file', () => {
    expect(parseDelimitedRows('a\t"unfinished', '\t')).toEqual([['a', 'unfinished']]);
  });

  it('keeps empty cells, which are what a padded row is made of', () => {
    expect(parseDelimitedRows('a\t\t\tb\n', '\t')).toEqual([['a', '', '', 'b']]);
  });
});

describe('buildAnkiCsvCollection', () => {
  it('turns a real export into notes whose fields skip the tags column', () => {
    const { raw, meta, rowCount, blankRows } = buildAnkiCsvCollection(HSK4);
    expect(meta.tagsColumn).toBe(8);
    expect(rowCount).toBe(2);
    expect(blankRows).toBe(0);
    expect(raw.notes).toHaveLength(2);

    const [first] = raw.notes;
    expect(first.flds.split(SEP)).toEqual([
      '遍',
      'biàn',
      'time (occurrence)',
      '请再说一遍。',
      'Qǐng zài shuō yī biàn.',
      'Please say it again.',
      'm.w.',
    ]);
    expect(first.tags).toBe('HSK4');
    expect(raw.noteTypes[0].fields.map((f) => f.name)).toEqual([
      'Hanzi',
      'Pinyin',
      'English',
      'Example_ZH',
      'Example_PY',
      'Example_EN',
      'POS',
    ]);
  });

  it('names the fields positionally when the file carries no #columns:', () => {
    const { raw } = buildAnkiCsvCollection('#separator:tab\nfront\tback\n');
    expect(raw.noteTypes[0].fields.map((f) => f.name)).toEqual(['Field 1', 'Field 2']);
  });

  it('emits no cards, because the file does not say how many a row becomes', () => {
    const { raw } = buildAnkiCsvCollection(HSK4);
    expect(raw.cards).toEqual([]);
    expect(raw.revlog).toBeUndefined();
    expect(raw.mediaFiles).toBeUndefined();
  });

  it('routes the guid, note type and deck columns out of the fields', () => {
    const text = [
      '#separator:tab',
      '#guid column:1',
      '#notetype column:2',
      '#deck column:3',
      '#tags column:6',
      'aBcD\tBasic\tJapanese::Core\t食べる\tto eat\tverb n5',
      'eFgH\tCloze\tJapanese::Grammar\t{{c1::を}}\tobject marker\tgrammar',
    ].join('\n');
    const { raw } = buildAnkiCsvCollection(text);

    expect(raw.notes[0].guid).toBe('aBcD');
    expect(raw.notes[0].flds.split(SEP)).toEqual(['食べる', 'to eat']);
    expect(raw.notes[0].tags).toBe('verb n5');
    // Two distinct note-type names in the file become two placeholder note types.
    expect(raw.noteTypes).toHaveLength(2);
    expect(raw.noteTypes.map((nt) => nt.name)).toEqual(['Basic', 'Cloze']);
    expect(raw.notes[0].mid).not.toBe(raw.notes[1].mid);
    // The decks are real information the file carried, and they land on the note
    // as an intent rather than on a card that does not exist.
    expect(raw.decks.map((d) => d.name)).toEqual(['Japanese::Core', 'Japanese::Grammar']);
    expect(raw.notes[0].targetDid).toBe(raw.decks[0].id);
    expect(raw.notes[1].targetDid).toBe(raw.decks[1].id);
  });

  it('adds the file-wide #tags: to every row and merges the per-row ones', () => {
    const text = ['#separator:tab', '#tags:imported', '#tags column:3', 'a\tb\town'].join('\n');
    const { raw } = buildAnkiCsvCollection(text);
    expect(raw.notes[0].tags).toBe('imported own');
  });

  it('applies #deck: to rows when there is no deck column', () => {
    const text = ['#separator:tab', '#deck:Japanese::Core', 'a\tb', 'c\td'].join('\n');
    const { raw } = buildAnkiCsvCollection(text);
    expect(raw.decks).toEqual([{ id: 'csv-deck-1', name: 'Japanese::Core' }]);
    expect(raw.notes.map((n) => n.targetDid)).toEqual(['csv-deck-1', 'csv-deck-1']);
  });

  it('skips a blank row and counts it, and keeps row ids pointing at the file', () => {
    const { raw, rowCount, blankRows } = buildAnkiCsvCollection(
      '#separator:tab\na\tb\n\t\nc\td\n',
    );
    expect(rowCount).toBe(3);
    expect(blankRows).toBe(1);
    expect(raw.notes.map((n) => n.id)).toEqual(['csv-row-1', 'csv-row-3']);
  });

  it('leaves guid empty rather than inventing one Anki would collide with', () => {
    const { raw } = buildAnkiCsvCollection('#separator:tab\na\tb\n');
    expect(raw.notes[0].guid).toBe('');
  });

  it('names the placeholder note type from the caller when the file names none', () => {
    const { raw } = buildAnkiCsvCollection('#separator:tab\na\tb\n', {
      defaultNoteTypeName: 'HSK4_deck.txt',
    });
    expect(raw.noteTypes[0].name).toBe('HSK4_deck.txt');
    expect(raw.noteTypes[0].unassigned).toBe(true);
    expect(raw.noteTypes[0].templates).toEqual([]);
  });
});

describe('the draft a CSV builds', () => {
  it('opens, and blocks, because a CSV carries no card design', () => {
    const { raw } = buildAnkiCsvCollection(HSK4);
    const draft = draftOf(raw);

    expect(draft.counts).toMatchObject({ notes: 2, cards: 0, noteTypes: 1, mediaReferences: 0 });
    expect(draftIsBlocked(draft)).toBe(true);
    const blocking = draft.diagnostics.find((d) => d.code === 'note-type-unassigned');
    expect(blocking?.severity).toBe('blocking');
    expect(blocking?.count).toBe(1);
    // Not this one: the formats were not unreadable, the source has none at all.
    expect(codes(raw)).not.toContain('template-format-unavailable');
  });

  it('reports the missing cards and review log without accusing the file of missing media', () => {
    const { raw } = buildAnkiCsvCollection(HSK4);
    const found = codes(raw);
    expect(found).toContain('note-without-cards');
    expect(found).toContain('review-history-absent');
    expect(found).not.toContain('missing-media');
    expect(found).not.toContain('orphan-card');
    expect(found).not.toContain('missing-deck');
    expect(draftOf(raw).diagnostics.find((d) => d.code === 'note-without-cards')?.severity).toBe(
      'info',
    );
  });

  it('flags a row whose column count disagrees with the first row of its note type', () => {
    const { raw } = buildAnkiCsvCollection('#separator:tab\na\tb\tc\nd\te\n');
    expect(codes(raw)).toContain('field-count-mismatch');
  });

  it('carries the deck intent through to the draft note', () => {
    const { raw } = buildAnkiCsvCollection(
      ['#separator:tab', '#deck:Japanese', 'a\tb'].join('\n'),
    );
    const draft = draftOf(raw);
    expect(draft.notes[0].targetDeckId).toBe('csv-deck-1');
    expect(draft.decks[0]).toMatchObject({ name: 'Japanese', path: ['Japanese'] });
  });

  it('leaves targetDeckId undefined when the file named no deck', () => {
    const { raw } = buildAnkiCsvCollection('#separator:tab\na\tb\n');
    expect(draftOf(raw).notes[0].targetDeckId).toBeUndefined();
    expect(draftOf(raw).decks).toEqual([]);
  });

  it('keeps a quoted HTML field verbatim and still normalizes it for search', () => {
    const { raw } = buildAnkiCsvCollection(
      '#separator:tab\n#html:true\n"<div class=""g"">食べる</div>"\tto eat\n',
    );
    const draft = draftOf(raw);
    expect(draft.notes[0].fields[0].raw).toBe('<div class="g">食べる</div>');
    expect(draft.notes[0].fields[0].normalized).toBe('食べる');
  });
});
