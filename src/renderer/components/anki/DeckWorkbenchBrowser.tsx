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

const ROW_HEIGHT = 34;

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
      </div>

      <div className="wb-browser-columns" role="group" aria-label={t('ankiWorkbench.browser.columns')}>
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

      <div className="wb-browser-head" style={{ gridTemplateColumns: `2.5rem ${gridTemplate}` }}>
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

      <div className="wb-browser-split">
        <VirtualList
          className="wb-browser-rows"
          items={shown}
          itemHeight={ROW_HEIGHT}
          getKey={(row) => row.noteId}
          emptyState={<p className="muted">{t('ankiWorkbench.browser.empty')}</p>}
          renderItem={(row) => {
            const checked = isRowSelected(selection, row.noteId);
            return (
              <div
                className={`wb-browser-row${checked ? ' selected' : ''}${
                  focusedId === row.noteId ? ' focused' : ''
                }${noteIsEdited(journal, row.noteId) ? ' edited' : ''}`}
                style={{ height: ROW_HEIGHT, gridTemplateColumns: `2.5rem ${gridTemplate}` }}
              >
                <input
                  type="checkbox"
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
