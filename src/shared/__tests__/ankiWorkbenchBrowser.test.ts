import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';
import {
  EMPTY_SELECTION,
  buildBrowserRows,
  browserFieldNames,
  defaultBrowserColumns,
  isRowSelected,
  nextBrowserSort,
  searchBrowserRows,
  selectAllMatching,
  selectRowRange,
  selectionCount,
  selectionIsWholeSource,
  sortBrowserRows,
  toggleBrowserColumn,
  toggleRowSelection,
  visibleBrowserColumns,
} from '../ankiWorkbenchBrowser';

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
    ...over,
  };
}

function card(id: string, noteId: string, deckId: string): AnkiDraftCard {
  return {
    id, noteId, deckId, ord: 0, type: 'new', queue: 'new', due: 0, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, left: 0, flag: 'none', modifiedAtSec: 0,
  };
}

function field(ord: number, name: string, text: string) {
  return { ord, name, raw: text, normalized: text };
}

const draft: AnkiDraft = {
  version: 1,
  source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
  decks: [
    { id: 'd1', name: 'Japanese::Core', path: ['Japanese', 'Core'], filtered: false },
    { id: 'd2', name: 'Japanese::Verbs', path: ['Japanese', 'Verbs'], filtered: false },
  ],
  noteTypes: [
    {
      id: 'nt1', name: 'Basic', kind: 'standard', css: '',
      // sortFieldOrd points at Expression, which is NOT ord 0 — the column order
      // must follow the note type's own sort field, not the raw ordinal.
      fields: [field(0, 'Meaning', ''), field(1, 'Expression', '')].map((f) => ({
        ord: f.ord, name: f.name, sticky: false, rtl: false,
      })),
      templates: [], sortFieldOrd: 1, latexPre: '', latexPost: '',
    },
    {
      id: 'nt2', name: 'Cloze', kind: 'cloze', css: '',
      fields: [{ ord: 0, name: 'Text', sticky: false, rtl: false }],
      templates: [], sortFieldOrd: 0, latexPre: '', latexPost: '',
    },
  ] as AnkiDraft['noteTypes'],
  notes: [
    note({
      id: 'n1', tags: ['core', 'verb'], cardIds: ['c1', 'c2'],
      fields: [field(0, 'Meaning', 'to eat'), field(1, 'Expression', '食べる')],
    }),
    note({
      id: 'n2', noteTypeId: 'nt2', tags: [], cardIds: ['c3'],
      fields: [field(0, 'Text', 'a {{c1::cloze}} note')],
    }),
    note({
      id: 'n3', tags: ['core'], cardIds: ['c4'],
      fields: [field(0, 'Meaning', 'to drink'), field(1, 'Expression', '飲む')],
    }),
  ],
  cards: [card('c1', 'n1', 'd1'), card('c2', 'n1', 'd2'), card('c3', 'n2', 'd1'), card('c4', 'n3', 'd1')],
  diagnostics: [],
  counts: { notes: 3, cards: 4, decks: 2, noteTypes: 2, reviews: 0, mediaReferences: 0 },
};

const columns = defaultBrowserColumns(draft);
const rows = buildBrowserRows(draft, columns);

describe('columns', () => {
  it('puts each note type’s sort field first and dedupes across note types', () => {
    expect(browserFieldNames(draft)).toEqual(['Expression', 'Meaning', 'Text']);
  });

  it('starts with two fields visible and every other field present but hidden', () => {
    const fields = columns.filter((c) => c.kind === 'field');
    expect(fields.map((c) => c.fieldName)).toEqual(['Expression', 'Meaning', 'Text']);
    expect(fields.filter((c) => c.visible).map((c) => c.fieldName)).toEqual(['Expression', 'Meaning']);
  });

  it('labels meta columns with keys, never English', () => {
    for (const col of columns.filter((c) => c.kind === 'meta')) {
      expect(col.labelKey).toMatch(/^ankiWorkbench\.browser\.column\./);
    }
  });

  it('refuses to hide the last visible column', () => {
    let cols = columns;
    for (const c of columns) cols = toggleBrowserColumn(cols, c.id);
    expect(visibleBrowserColumns(cols).length).toBeGreaterThan(0);
  });

  it('toggling a hidden column shows it without touching the note type', () => {
    const shown = toggleBrowserColumn(columns, 'field:Text');
    expect(shown.find((c) => c.id === 'field:Text')?.visible).toBe(true);
    // The note type is untouched: column visibility is not a field edit.
    expect(draft.noteTypes[1]!.fields).toHaveLength(1);
  });
});

describe('rows', () => {
  it('joins each note to its decks, note type and card count', () => {
    expect(rows.map((r) => r.noteId)).toEqual(['n1', 'n2', 'n3']);
    expect(rows[0]!.deckNames).toEqual(['Japanese::Core', 'Japanese::Verbs']);
    expect(rows[0]!.cardCount).toBe(2);
    expect(rows[1]!.noteTypeName).toBe('Cloze');
    expect(rows[0]!.cells['meta:decks']).toBe('Japanese::Core, Japanese::Verbs');
    expect(rows[0]!.cells['meta:tags']).toBe('core verb');
  });

  it('leaves a field a note type does not have empty rather than inventing one', () => {
    expect(rows[1]!.cells['field:Expression']).toBe('');
    expect(rows[1]!.cells['field:Text']).toBe('a {{c1::cloze}} note');
  });
});

describe('search', () => {
  it('requires every term and searches fields, tags, decks and note type', () => {
    expect(searchBrowserRows(rows, '').map((r) => r.noteId)).toEqual(['n1', 'n2', 'n3']);
    expect(searchBrowserRows(rows, 'core').map((r) => r.noteId)).toEqual(['n1', 'n2', 'n3']);
    expect(searchBrowserRows(rows, 'core verb').map((r) => r.noteId)).toEqual(['n1']);
    expect(searchBrowserRows(rows, '飲む').map((r) => r.noteId)).toEqual(['n3']);
    expect(searchBrowserRows(rows, 'cloze').map((r) => r.noteId)).toEqual(['n2']);
  });

  it('does not pretend to understand Anki query syntax', () => {
    // `deck:Japanese::Verbs` matches nothing rather than silently returning all
    // three, which is the failure mode that would look like a working filter.
    expect(searchBrowserRows(rows, 'deck:Japanese::Verbs')).toHaveLength(0);
  });
});

describe('sort', () => {
  it('cycles asc → desc → source order', () => {
    const a = nextBrowserSort(null, 'field:Expression');
    expect(a).toEqual({ columnId: 'field:Expression', dir: 'asc' });
    const b = nextBrowserSort(a, 'field:Expression');
    expect(b).toEqual({ columnId: 'field:Expression', dir: 'desc' });
    expect(nextBrowserSort(b, 'field:Expression')).toBeNull();
    expect(nextBrowserSort(b, 'meta:tags')).toEqual({ columnId: 'meta:tags', dir: 'asc' });
  });

  it('is stable, so ties keep source order in both directions', () => {
    const byType = sortBrowserRows(rows, { columnId: 'meta:noteType', dir: 'asc' });
    expect(byType.map((r) => r.noteId)).toEqual(['n1', 'n3', 'n2']);
    const desc = sortBrowserRows(rows, { columnId: 'meta:noteType', dir: 'desc' });
    expect(desc.map((r) => r.noteId)).toEqual(['n2', 'n1', 'n3']);
  });

  it('returns the source order untouched with no sort', () => {
    expect(sortBrowserRows(rows, null)).toBe(rows);
  });
});

describe('selection', () => {
  it('toggles explicit ids', () => {
    let sel = toggleRowSelection(EMPTY_SELECTION, 'n1');
    expect(isRowSelected(sel, 'n1')).toBe(true);
    expect(selectionCount(sel, 155383)).toBe(1);
    sel = toggleRowSelection(sel, 'n1');
    expect(isRowSelected(sel, 'n1')).toBe(false);
    expect(selectionCount(sel, 155383)).toBe(0);
  });

  it('counts all-matching against the whole filter result, not the loaded page', () => {
    const sel = selectAllMatching();
    expect(selectionIsWholeSource(sel)).toBe(true);
    // Three rows are in memory; 155,383 notes match. The count is the truth.
    expect(selectionCount(sel, 155383)).toBe(155383);
    expect(isRowSelected(sel, 'never-loaded-note')).toBe(true);
  });

  it('deselects out of all-matching without collapsing to an id list', () => {
    const sel = toggleRowSelection(selectAllMatching(), 'n2');
    expect(sel.mode).toBe('all-matching');
    expect(isRowSelected(sel, 'n2')).toBe(false);
    expect(isRowSelected(sel, 'n1')).toBe(true);
    expect(selectionCount(sel, 155383)).toBe(155382);
  });

  it('never reports a negative count', () => {
    const sel = { mode: 'all-matching', except: ['a', 'b', 'c'] } as const;
    expect(selectionCount(sel, 1)).toBe(0);
  });

  it('selects an inclusive range in either direction', () => {
    const down = selectRowRange(EMPTY_SELECTION, rows, 'n1', 'n3');
    expect(down).toEqual({ mode: 'explicit', ids: ['n1', 'n2', 'n3'] });
    const up = selectRowRange(EMPTY_SELECTION, rows, 'n3', 'n1');
    expect(up).toEqual({ mode: 'explicit', ids: ['n1', 'n2', 'n3'] });
  });

  it('re-includes a range inside all-matching instead of switching modes', () => {
    const sel = selectRowRange(
      { mode: 'all-matching', except: ['n1', 'n2', 'zz'] },
      rows,
      'n1',
      'n2',
    );
    expect(sel).toEqual({ mode: 'all-matching', except: ['zz'] });
  });

  it('ignores a range whose anchor is not in the visible rows', () => {
    expect(selectRowRange(EMPTY_SELECTION, rows, 'gone', 'n1')).toBe(EMPTY_SELECTION);
  });
});
