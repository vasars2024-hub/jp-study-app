/**
 * Step 2 of the Deck Workbench: the smart Browser.
 *
 * All of the model — columns, rows, search, sort, selection — is pure and lives
 * in `shared/ankiWorkbenchBrowser.ts`. This file virtualizes it and nothing more,
 * so a 100k-note draft costs the same DOM as a 10-note one (the plan's gate 9).
 *
 * The honesty problem this surface has to solve: the draft in memory is ONE PAGE.
 * "Select all matching" against a filter that could only be evaluated on that
 * page would claim a selection nobody computed, so it is offered only when the
 * filter is empty (where "all matching" means the whole source and is
 * well-defined) or when the whole source is loaded. With a query active on a
 * paged source the user gets the honest alternative: select the rows found here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  EMPTY_SELECTION,
  buildBrowserRows,
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
  type BrowserSelection,
  type BrowserSort,
} from '../../../shared/ankiWorkbenchBrowser';
import type { AnkiDraftEditJournal, AnkiDraftEditResult } from '../../../shared/ankiDraftEdit';
import { editedNoteIds, noteIsEdited } from '../../../shared/ankiDraftEdit';
import VirtualList from '../VirtualList';
import { useT } from '../../i18n';
import DeckWorkbenchInspector from './DeckWorkbenchInspector';
import DeckWorkbenchSamples from './DeckWorkbenchSamples';

const ROW_HEIGHT = 34;
/** How far PageUp/PageDown moves the cursor. */
const PAGE_ROWS = 10;
/** DOM id of a row, so `aria-activedescendant` has something to point at. */
const rowDomId = (noteId: string): string => `wb-row-${noteId}`;

/** The plan's Browser modes. `gallery` is the representative sample set. */
type BrowserView = 'grid' | 'samples';

export default function DeckWorkbenchBrowser({
  draft,
  totalNotes,
  journal,
  onSelection,
  onEdit,
}: {
  draft: AnkiDraft;
  /** Notes in the whole source, which may exceed the page in `draft`. */
  totalNotes: number;
  journal: AnkiDraftEditJournal;
  onSelection: (count: number, wholeSource: boolean) => void;
  onEdit: (result: AnkiDraftEditResult) => void;
}) {
  const { t } = useT();
  const [columns, setColumns] = useState(() => defaultBrowserColumns(draft));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BrowserSort | null>(null);
  const [selection, setSelection] = useState<BrowserSelection>(EMPTY_SELECTION);
  /** The row the inspector is about. Focus is not selection — a user reads one
   *  note while a batch of others stays selected. */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [view, setView] = useState<BrowserView>('grid');
  const anchor = useRef<string | null>(null);

  const rows = useMemo(() => buildBrowserRows(draft, columns), [draft, columns]);
  const shown = useMemo(
    () => sortBrowserRows(searchBrowserRows(rows, query), sort),
    [rows, query, sort],
  );
  const shownCols = useMemo(() => visibleBrowserColumns(columns), [columns]);

  const partial = draft.counts.notes < totalNotes;
  // With a filter on a paged source, "everything matching" is a claim nobody
  // computed. See the file comment.
  const canSelectWholeSource = !partial || query.trim() === '';
  /**
   * How many notes the current filter stands for. With no query that is the
   * whole source; with one it is only what the loaded rows matched. The live
   * run caught the version that always used `totalNotes`: the button offered
   * "select all 3,221" under a filter showing four rows, and then selected
   * four. A count in a button is a promise about what the click will do.
   */
  const matchedTotal = query.trim() === '' ? totalNotes : shown.length;

  const applySelection = useCallback(
    (next: BrowserSelection) => {
      setSelection(next);
      onSelection(selectionCount(next, matchedTotal), selectionIsWholeSource(next));
    },
    [onSelection, matchedTotal],
  );

  const onRowClick = useCallback(
    (noteId: string, shiftKey: boolean) => {
      if (shiftKey && anchor.current) {
        applySelection(selectRowRange(selection, shown, anchor.current, noteId));
      } else {
        anchor.current = noteId;
        applySelection(toggleRowSelection(selection, noteId));
      }
    },
    [applySelection, selection, shown],
  );

  /** Where the keyboard cursor is, or -1 before it has been anywhere. */
  const cursor = focusedId ? shown.findIndex((r) => r.noteId === focusedId) : -1;

  /**
   * The grid is one tab stop with a moving cursor, not N tab stops.
   *
   * A hundred thousand rows cannot be tabbed through, and only a windowful of
   * them exists in the DOM at any moment, so the row controls are taken out of
   * the tab order and every row action is reachable from here instead. The
   * cursor doubles as what the inspector is showing, which is how Anki's own
   * browser behaves: arrowing down walks the notes and the editor follows.
   */
  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (shown.length === 0) return;
      const last = shown.length - 1;
      const move = (to: number): void => {
        e.preventDefault();
        const clamped = Math.max(0, Math.min(last, to));
        const target = shown[clamped];
        if (!target) return;
        if (e.shiftKey && anchor.current) {
          applySelection(selectRowRange(selection, shown, anchor.current, target.noteId));
        } else if (!e.shiftKey) {
          // Plain movement leaves the batch alone; only the anchor follows, so
          // a later Shift+Arrow extends from where the user actually is.
          anchor.current = target.noteId;
        }
        setFocusedId(target.noteId);
      };

      switch (e.key) {
        case 'ArrowDown':
          return move(cursor < 0 ? 0 : cursor + 1);
        case 'ArrowUp':
          return move(cursor < 0 ? last : cursor - 1);
        case 'PageDown':
          return move(cursor < 0 ? 0 : cursor + PAGE_ROWS);
        case 'PageUp':
          return move(cursor < 0 ? last : cursor - PAGE_ROWS);
        case 'Home':
          return move(0);
        case 'End':
          return move(last);
        case ' ':
        case 'Spacebar': {
          if (cursor < 0) return;
          e.preventDefault();
          const row = shown[cursor];
          if (!row) return;
          if (e.shiftKey && anchor.current) {
            applySelection(selectRowRange(selection, shown, anchor.current, row.noteId));
          } else {
            anchor.current = row.noteId;
            applySelection(toggleRowSelection(selection, row.noteId));
          }
          return;
        }
        case 'a':
        case 'A': {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          // Exactly what the footer button does, including its honesty rule:
          // "all matching" is only offered where it is a claim we can keep.
          applySelection(
            canSelectWholeSource
              ? selectAllMatching()
              : { mode: 'explicit', ids: shown.map((r) => r.noteId) },
          );
          return;
        }
        case 'Escape':
          if (!focusedId) return;
          e.preventDefault();
          setFocusedId(null);
          return;
        default:
      }
    },
    [applySelection, canSelectWholeSource, cursor, focusedId, selection, shown],
  );

  const selected = selectionCount(selection, matchedTotal);
  const gridTemplate = shownCols.map((c) => `${c.width}fr`).join(' ');
  // Re-read from the draft every render: an edit replaces the note object, and
  // a stale copy would show the inspector its own pre-edit text.
  const focused = focusedId ? draft.notes.find((n) => n.id === focusedId) : undefined;
  const editedCount = editedNoteIds(journal).length;

  return (
    <div className="wb-browser">
      <div className="wb-browser-tools">
        <input
          type="search"
          className="wb-browser-search"
          value={query}
          placeholder={t('ankiWorkbench.browser.search')}
          aria-label={t('ankiWorkbench.browser.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">
          {t('ankiWorkbench.browser.rows', { shown: shown.length, loaded: draft.counts.notes })}
        </span>
        {/* Switching view never touches the selection — the plan requires a
            batch to survive a look at the sample cards. */}
        <div role="group" aria-label={t('ankiWorkbench.browser.view')}>
          {(['grid', 'samples'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn${view === value ? ' primary' : ''}`}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {t(`ankiWorkbench.browser.view.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {view === 'samples' && (
        <DeckWorkbenchSamples
          draft={draft}
          totalNotes={totalNotes}
          onOpenNote={(noteId) => {
            setFocusedId(noteId);
            setView('grid');
          }}
        />
      )}

      <div
        className="wb-browser-columns"
        role="group"
        aria-label={t('ankiWorkbench.browser.columns')}
        hidden={view !== 'grid'}
      >
        <span className="muted">{t('ankiWorkbench.browser.columns')}</span>
        {columns.map((col) => (
          <label key={col.id} className="wb-browser-column-toggle">
            <input
              type="checkbox"
              checked={col.visible}
              onChange={() => setColumns((prev) => toggleBrowserColumn(prev, col.id))}
            />
            {col.kind === 'field' ? col.fieldName : t(col.labelKey ?? '')}
          </label>
        ))}
      </div>

      {partial && (
        <p className="muted wb-browser-partial">
          {t('ankiWorkbench.browser.pageOnly', { loaded: draft.counts.notes, total: totalNotes })}
        </p>
      )}

      <div
        className="wb-browser-head"
        style={{ gridTemplateColumns: `2.5rem ${gridTemplate}` }}
        hidden={view !== 'grid'}
      >
        <span />
        {shownCols.map((col) => {
          const dir = sort?.columnId === col.id ? sort.dir : undefined;
          return (
            <button
              key={col.id}
              type="button"
              className="wb-browser-sort"
              aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
              onClick={() => setSort((prev) => nextBrowserSort(prev, col.id))}
            >
              {col.kind === 'field' ? col.fieldName : t(col.labelKey ?? '')}
              {dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ''}
            </button>
          );
        })}
      </div>

      <div className="wb-browser-split" hidden={view !== 'grid'}>
        <div
          className="wb-browser-grid"
          role="grid"
          tabIndex={0}
          aria-label={t('ankiWorkbench.browser.grid')}
          aria-rowcount={shown.length}
          aria-multiselectable
          aria-activedescendant={focusedId ? rowDomId(focusedId) : undefined}
          onKeyDown={onGridKeyDown}
        >
          <VirtualList
            className="wb-browser-rows"
            items={shown}
            itemHeight={ROW_HEIGHT}
            getKey={(row) => row.noteId}
            scrollToIndex={cursor >= 0 ? cursor : undefined}
            emptyState={<p className="muted">{t('ankiWorkbench.browser.empty')}</p>}
            renderItem={(row, index) => {
              const checked = isRowSelected(selection, row.noteId);
              return (
                <div
                  id={rowDomId(row.noteId)}
                  role="row"
                  aria-rowindex={index + 1}
                  aria-selected={checked}
                  className={`wb-browser-row${checked ? ' selected' : ''}${
                    focusedId === row.noteId ? ' focused' : ''
                  }${noteIsEdited(journal, row.noteId) ? ' edited' : ''}`}
                  style={{ height: ROW_HEIGHT, gridTemplateColumns: `2.5rem ${gridTemplate}` }}
                >
                  {/* Every control here is `tabIndex={-1}`: the grid is one tab
                      stop with a cursor, because a windowed list of 100k rows
                      has no tabbable order to walk. */}
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    checked={checked}
                    aria-label={t('ankiWorkbench.browser.selectRow', { id: row.noteId })}
                    onClick={(e) => onRowClick(row.noteId, e.shiftKey)}
                    onChange={() => undefined}
                  />
                  {shownCols.map((col) => (
                    // Opening a note is not selecting it: a user reads one row
                    // while a batch of others stays ticked.
                    <button
                      key={col.id}
                      type="button"
                      tabIndex={-1}
                      role="gridcell"
                      className="wb-browser-cell"
                      title={row.cells[col.id]}
                      onClick={() => setFocusedId(row.noteId)}
                    >
                      {row.cells[col.id]}
                    </button>
                  ))}
                </div>
              );
            }}
          />
        </div>
        {focused && (
          <DeckWorkbenchInspector
            draft={draft}
            journal={journal}
            note={focused}
            onEdit={onEdit}
          />
        )}
      </div>

      <div className="wb-browser-foot">
        <span>{t('ankiWorkbench.browser.selected', { count: selected })}</span>
        {canSelectWholeSource ? (
          <button type="button" className="btn" onClick={() => applySelection(selectAllMatching())}>
            {t('ankiWorkbench.browser.selectAll', { count: matchedTotal })}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() =>
              applySelection({ mode: 'explicit', ids: shown.map((r) => r.noteId) })
            }
          >
            {t('ankiWorkbench.browser.selectFound', { count: shown.length })}
          </button>
        )}
        <button type="button" className="btn" onClick={() => applySelection(EMPTY_SELECTION)}>
          {t('ankiWorkbench.browser.clear')}
        </button>
        {selectionIsWholeSource(selection) && partial && (
          <span className="muted">{t('ankiWorkbench.browser.wholeSource')}</span>
        )}
        {editedCount > 0 && (
          <span className="wb-browser-edited">
            {t('ankiWorkbench.browser.edited', { count: editedCount })}
          </span>
        )}
      </div>
    </div>
  );
}
