// The Deck Workbench's smart Browser, as pure data — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 2 ("smart virtualized Browser … column manager, search, selection").
//
// The plan makes the Browser "both a fast editor and the selection engine for
// all recipes", and asks for Browser columns the user configures *independently
// from adding fields to an Anki note type*. Both are decidable from the draft
// alone, so all of it is here and the surface only virtualizes and paints it.
//
// Nothing here is user-visible English: a meta column carries a `labelKey` the
// surface resolves, and a field column carries the note type's own field name,
// which is the user's data and is never translated.

import type { AnkiDraft, AnkiDraftNote } from './ankiDraft';

// ----- columns ----------------------------------------------------------------

export type BrowserColumnKind = 'field' | 'meta';

export type BrowserMetaKey = 'noteType' | 'decks' | 'tags' | 'cards' | 'created';

export interface BrowserColumn {
  id: string;
  kind: BrowserColumnKind;
  /** For `field`: the note type's field name, shown verbatim. */
  fieldName?: string;
  /** For `meta`: an i18n key. A shared module never holds the English itself. */
  labelKey?: string;
  metaKey?: BrowserMetaKey;
  visible: boolean;
  /** Relative width unit, so the surface can lay out without a pixel contract. */
  width: number;
}

/** Every distinct field name across the draft's note types, in sort-field-first order. */
export function browserFieldNames(draft: AnkiDraft): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const nt of draft.noteTypes) {
    const sortFirst = [...nt.fields].sort((a, b) => {
      if (a.ord === nt.sortFieldOrd) return -1;
      if (b.ord === nt.sortFieldOrd) return 1;
      return a.ord - b.ord;
    });
    for (const f of sortFirst) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      out.push(f.name);
    }
  }
  return out;
}

/**
 * The starting column set: the first two fields visible, every other field
 * present but hidden, then the meta columns. Hidden-but-present is the point —
 * the column manager is a visibility toggle over a known set, not a place where
 * adding a column can accidentally add a field to a note type.
 */
export function defaultBrowserColumns(draft: AnkiDraft): BrowserColumn[] {
  const fields = browserFieldNames(draft).map((name, i) => ({
    id: `field:${name}`,
    kind: 'field' as const,
    fieldName: name,
    visible: i < 2,
    width: 3,
  }));
  const meta: BrowserColumn[] = (
    [
      ['noteType', 2],
      ['decks', 2],
      ['tags', 2],
      ['cards', 1],
    ] as const
  ).map(([metaKey, width]) => ({
    id: `meta:${metaKey}`,
    kind: 'meta' as const,
    metaKey,
    labelKey: `ankiWorkbench.browser.column.${metaKey}`,
    visible: metaKey !== 'cards',
    width,
  }));
  return [...fields, ...meta];
}

export function toggleBrowserColumn(columns: BrowserColumn[], id: string): BrowserColumn[] {
  const next = columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
  // A Browser with no columns is unreadable, not a valid configuration.
  return next.some((c) => c.visible) ? next : columns;
}

export function visibleBrowserColumns(columns: BrowserColumn[]): BrowserColumn[] {
  return columns.filter((c) => c.visible);
}

// ----- rows -------------------------------------------------------------------

export interface BrowserRow {
  noteId: string;
  guid: string;
  noteTypeName: string;
  /** Distinct deck names across this note's cards, in first-card order. */
  deckNames: string[];
  tags: string[];
  marked: boolean;
  cardCount: number;
  modifiedAtSec: number;
  /** Column id → the text that column shows for this row. */
  cells: Record<string, string>;
  /**
   * Field name → normalized text, for every field this note actually has.
   * Separate from `cells` on purpose: a filter must read the note, not the
   * column configuration, or hiding a column would silently change what a
   * query matches. Absent (not empty) when the note type has no such field.
   */
  fields: Record<string, string>;
  /** Lower-cased haystack: every field's normalized text plus tags and deck names. */
  search: string;
}

function noteCells(
  note: AnkiDraftNote,
  columns: BrowserColumn[],
  noteTypeName: string,
  deckNames: string[],
  cardCount: number,
): Record<string, string> {
  const byName = new Map(note.fields.map((f) => [f.name, f.normalized]));
  const cells: Record<string, string> = {};
  for (const col of columns) {
    if (col.kind === 'field') {
      // Absent rather than empty: a note of another note type genuinely has no
      // such field, and blanking it would look like an empty field instead.
      cells[col.id] = byName.get(col.fieldName ?? '') ?? '';
    } else if (col.metaKey === 'noteType') cells[col.id] = noteTypeName;
    else if (col.metaKey === 'decks') cells[col.id] = deckNames.join(', ');
    else if (col.metaKey === 'tags') cells[col.id] = note.tags.join(' ');
    else if (col.metaKey === 'cards') cells[col.id] = String(cardCount);
    else if (col.metaKey === 'created') cells[col.id] = String(note.modifiedAtSec);
  }
  return cells;
}

export function buildBrowserRows(draft: AnkiDraft, columns: BrowserColumn[]): BrowserRow[] {
  const noteTypeName = new Map(draft.noteTypes.map((nt) => [nt.id, nt.name]));
  const deckName = new Map(draft.decks.map((d) => [d.id, d.name]));
  const cardsByNote = new Map<string, string[]>();
  for (const card of draft.cards) {
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card.deckId);
    else cardsByNote.set(card.noteId, [card.deckId]);
  }

  return draft.notes.map((note) => {
    const deckIds = cardsByNote.get(note.id) ?? (note.targetDeckId ? [note.targetDeckId] : []);
    const decks: string[] = [];
    for (const id of deckIds) {
      const name = deckName.get(id);
      if (name && !decks.includes(name)) decks.push(name);
    }
    const type = noteTypeName.get(note.noteTypeId) ?? '';
    const cardCount = note.cardIds.length;
    return {
      noteId: note.id,
      guid: note.guid,
      noteTypeName: type,
      deckNames: decks,
      tags: note.tags,
      marked: note.marked,
      cardCount,
      modifiedAtSec: note.modifiedAtSec,
      cells: noteCells(note, columns, type, decks, cardCount),
      fields: Object.fromEntries(note.fields.map((f) => [f.name, f.normalized])),
      search: [
        ...note.fields.map((f) => f.normalized),
        ...note.tags,
        ...decks,
        type,
      ]
        .join(' ')
        .toLowerCase(),
    };
  });
}

// ----- search and sort ---------------------------------------------------------

// Search moved to `ankiBrowserQuery.ts` in Phase 3: the flat all-terms-required
// substring filter this file used to hold is now the bare-word case of that
// module's grammar, so every Phase 2 query still means exactly what it meant.
// One filter path, not two — the same reason the change tray's dry run *is* its
// apply.

export type BrowserSortDir = 'asc' | 'desc';

export interface BrowserSort {
  columnId: string;
  dir: BrowserSortDir;
}

export function nextBrowserSort(current: BrowserSort | null, columnId: string): BrowserSort | null {
  if (!current || current.columnId !== columnId) return { columnId, dir: 'asc' };
  if (current.dir === 'asc') return { columnId, dir: 'desc' };
  return null; // third click returns to the source's own order
}

/**
 * One collator for every comparison. `localeCompare` with options builds (or
 * looks up) a collator per call, and a 100,000-row sort makes ~1.7 million
 * calls; the ordering is identical, the setup is paid once.
 */
let sortCollator: Intl.Collator | null = null;
function browserCollator(): Intl.Collator {
  sortCollator ??= new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return sortCollator;
}

export function sortBrowserRows(rows: BrowserRow[], sort: BrowserSort | null): BrowserRow[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const collator = browserCollator();
  // Stable by construction: index breaks every tie, so re-sorting never shuffles
  // rows the user is looking at.
  return rows
    .map((row, i) => ({ row, i, key: row.cells[sort.columnId] ?? '' }))
    .sort((a, b) => {
      const cmp = collator.compare(a.key, b.key);
      return cmp !== 0 ? cmp * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

// ----- selection ---------------------------------------------------------------

/**
 * Two modes, because they answer different questions. `explicit` is the set of
 * ids the user picked. `all-matching` is "everything the current filter matches,
 * minus these" — it survives scrolling, paging and virtualization, which is
 * exactly what the plan requires and what an id list cannot do once the source
 * is larger than the page in memory.
 */
export type BrowserSelection =
  | { mode: 'explicit'; ids: string[] }
  | { mode: 'all-matching'; except: string[] };

export const EMPTY_SELECTION: BrowserSelection = { mode: 'explicit', ids: [] };

/**
 * A Set view of a selection's id list, built once per list. Selections are
 * immutable values (every change makes a new array), so caching by array
 * identity is safe — and it turns "is this row selected" from a scan of the
 * whole list into a lookup. With 50,000 rows selected the grid asked that
 * question for every visible row, and the bulk tray for every loaded one.
 */
const idSets = new WeakMap<readonly string[], Set<string>>();
function idSet(ids: readonly string[]): Set<string> {
  let set = idSets.get(ids);
  if (!set) {
    set = new Set(ids);
    idSets.set(ids, set);
  }
  return set;
}

export function isRowSelected(selection: BrowserSelection, noteId: string): boolean {
  return selection.mode === 'explicit'
    ? idSet(selection.ids).has(noteId)
    : !idSet(selection.except).has(noteId);
}

export function toggleRowSelection(selection: BrowserSelection, noteId: string): BrowserSelection {
  if (selection.mode === 'explicit') {
    return idSet(selection.ids).has(noteId)
      ? { mode: 'explicit', ids: selection.ids.filter((id) => id !== noteId) }
      : { mode: 'explicit', ids: [...selection.ids, noteId] };
  }
  return idSet(selection.except).has(noteId)
    ? { mode: 'all-matching', except: selection.except.filter((id) => id !== noteId) }
    : { mode: 'all-matching', except: [...selection.except, noteId] };
}

/** Shift-click: add the inclusive span between two visible rows. */
export function selectRowRange(
  selection: BrowserSelection,
  rows: BrowserRow[],
  anchorId: string,
  toId: string,
): BrowserSelection {
  const a = rows.findIndex((r) => r.noteId === anchorId);
  const b = rows.findIndex((r) => r.noteId === toId);
  if (a < 0 || b < 0) return selection;
  const span = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.noteId);
  // Sets, not `includes`: a shift-click across 20,000 rows was 400 million comparisons.
  if (selection.mode === 'all-matching') {
    const inSpan = new Set(span);
    return { mode: 'all-matching', except: selection.except.filter((id) => !inSpan.has(id)) };
  }
  const ids = [...selection.ids];
  const have = new Set(ids);
  for (const id of span) {
    if (have.has(id)) continue;
    have.add(id);
    ids.push(id);
  }
  return { mode: 'explicit', ids };
}

export function selectAllMatching(): BrowserSelection {
  return { mode: 'all-matching', except: [] };
}

/**
 * How many notes the selection stands for. `matchedTotal` is the filter's whole
 * result — not the loaded page — so `all-matching` reports the truth even when
 * most matching notes have never been in memory.
 */
export function selectionCount(selection: BrowserSelection, matchedTotal: number): number {
  return selection.mode === 'explicit'
    ? selection.ids.length
    : Math.max(0, matchedTotal - selection.except.length);
}

/** True when the selection can only be described against the whole source. */
export function selectionIsWholeSource(selection: BrowserSelection): boolean {
  return selection.mode === 'all-matching';
}
