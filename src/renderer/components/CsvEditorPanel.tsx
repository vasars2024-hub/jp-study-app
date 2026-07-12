import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  deleteColumn,
  deleteRow,
  emptyTable,
  insertColumn,
  insertRow,
  parseCsvText,
  serializeCsvTable,
  setCell,
  setHeader,
  tableStats,
  type CsvDelimiter,
  type CsvTable,
} from '../../shared/csvEditor';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type CsvEditorHistory,
  type CsvEditorSnapshot,
} from '../../shared/csvEditorHistory';
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
  type CaseMode,
} from '../../shared/csvEditorTransforms';
import {
  DECK_FIELD_OPTIONS,
  deckBookId,
  guessColumnMapping,
  rowsToDeckEntries,
  type DeckColumnMapping,
  type DeckFieldKey,
} from '../../shared/deckImport';
import { importDeckFromEntries } from '../flashcardDeck';
import { parseCsvTextAsync } from '../csvParseAsync';
import { clampToViewport, toLayoutPoint } from '../zoomCoords';
import Icon from './Icons';
import CardPreviewPanel from './csv-editor/CardPreviewPanel';
import CsvGridRow from './csv-editor/CsvGridRow';
import FindReplaceModal from './csv-editor/FindReplaceModal';
import ImportMergeModal from './csv-editor/ImportMergeModal';
import {
  defaultEditorSnapshot,
  loadStoredEditor,
  saveStoredEditor,
} from './csv-editor/csvEditorStorage';
import {
  refreshMapping,
  remapMappingOnDelete,
  remapMappingOnInsert,
  remapMappingOnReorder,
  remapMappingOnSplit,
} from './csv-editor/columnMappingUtils';

type Props = {
  onDeckImported?: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  rowIndex: number | null;
  colIndex: number | null;
};

type PendingImport = {
  table: CsvTable;
  title?: string;
};

// 36px textarea + 1px collapsed border. Rows are fixed-height so scroll
// offsets map to row indices without measuring the DOM.
const ROW_HEIGHT = 37;
// Extra rows rendered above/below the viewport so fast scrolling never shows
// a blank gap while the next frame catches up.
const OVERSCAN = 8;
// Estimated context-menu box for clamping it inside the viewport.
const MENU_W = 190;
const MENU_H = 200;

/** Zoom-corrected, viewport-clamped position for the grid context menu. */
function menuPosition(e: React.MouseEvent): { x: number; y: number } {
  return clampToViewport(toLayoutPoint(e.clientX, e.clientY), MENU_W, MENU_H);
}

export default function CsvEditorPanel({ onDeckImported }: Props) {
  const initial = useMemo(() => loadStoredEditor() ?? defaultEditorSnapshot(), []);
  const [history, setHistory] = useState<CsvEditorHistory>(() => createHistory(initial));
  const [mapping, setMapping] = useState<DeckColumnMapping>(() =>
    guessColumnMapping(initial.table.headers),
  );
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [persistState, setPersistState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<number>>(() => new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(
    () => new Set(initial.hiddenColumns),
  );
  const [globalSearch, setGlobalSearch] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<number, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragCol, setDragCol] = useState<number | null>(null);
  // Dirty tracking by reference, not JSON.stringify: snapshots are immutable,
  // so identity comparison is exact and O(1). Stringifying a 15k-row table on
  // every render was a major source of typing lag.
  const [baseline, setBaseline] = useState<CsvEditorSnapshot>(() => history.present);

  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtualization: only the rows inside the scroll viewport (+ overscan) are
  // mounted. scrollTop updates are RAF-coalesced so scrolling never forces
  // more than one React render per frame.
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollRaf = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(520);
  const [theadH, setTheadH] = useState(100);

  const snap = history.present;
  const table = snap.table;
  const title = snap.title;

  const stats = useMemo(() => tableStats(table), [table]);
  const dirty = snap.table !== baseline.table || snap.title !== baseline.title;
  const globalPattern = useMemo(
    () => buildSearchPattern(globalSearch, useRegex),
    [globalSearch, useRegex],
  );

  const visibleColIndices = useMemo(
    () => table.headers.map((_, i) => i).filter((i) => !hiddenColumns.has(i)),
    [table.headers, hiddenColumns],
  );

  const filteredRowIndices = useMemo(() => {
    const indices: number[] = [];
    table.rows.forEach((row, ri) => {
      if (rowMatchesFilters(row, globalPattern, columnFilters, useRegex)) indices.push(ri);
    });
    return indices;
  }, [table.rows, globalPattern, columnFilters, useRegex]);

  // Row window: scrollTop is measured from the top of the scroll container,
  // which includes the sticky thead, so subtract its height before mapping to
  // row indices. Spacer rows keep the scrollbar geometry identical to a fully
  // rendered table.
  const totalRows = filteredRowIndices.length;
  const windowStart = Math.max(
    0,
    Math.floor(Math.max(0, scrollTop - theadH) / ROW_HEIGHT) - OVERSCAN,
  );
  const windowEnd = Math.min(
    totalRows,
    windowStart + Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2,
  );
  const windowIndices = useMemo(
    () => filteredRowIndices.slice(windowStart, windowEnd),
    [filteredRowIndices, windowStart, windowEnd],
  );
  const topPad = windowStart * ROW_HEIGHT;
  const bottomPad = Math.max(0, (totalRows - windowEnd) * ROW_HEIGHT);

  const commit = useCallback((next: CsvEditorSnapshot, msg?: string) => {
    setHistory((h) => pushHistory(h, next));
    if (msg) setStatus(msg);
  }, []);

  const updateSnap = useCallback(
    (patch: Partial<CsvEditorSnapshot>, msg?: string) => {
      commit({ ...history.present, ...patch }, msg);
    },
    [commit, history.present],
  );

  const updateTable = useCallback(
    (nextTable: CsvTable, msg?: string) => {
      updateSnap({ table: nextTable }, msg);
    },
    [updateSnap],
  );

  // Stable handlers (empty dep lists, functional state updates) so the
  // memoized CsvGridRow components never re-render just because the parent
  // re-created a callback.
  const handleCellChange = useCallback((rowIndex: number, colIndex: number, value: string) => {
    setHistory((h) =>
      pushHistory(h, { ...h.present, table: setCell(h.present.table, rowIndex, colIndex, value) }),
    );
  }, []);

  const handleSelectRow = useCallback((rowIndex: number) => setSelectedRow(rowIndex), []);

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, rowIndex: number, colIndex: number | null) => {
      e.preventDefault();
      setContextMenu({ ...menuPosition(e), rowIndex, colIndex });
      setSelectedRow(rowIndex);
      if (colIndex !== null) {
        const multi = e.ctrlKey || e.metaKey;
        setSelectedCols((prev) => {
          if (!multi) return new Set([colIndex]);
          const next = new Set(prev);
          if (next.has(colIndex)) next.delete(colIndex);
          else next.add(colIndex);
          return next;
        });
      }
    },
    [],
  );

  const onGridScroll = useCallback(() => {
    // RAF throttle: coalesce scroll events into one state update per frame to
    // avoid layout thrashing while dragging the scrollbar.
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      setScrollTop(gridWrapRef.current?.scrollTop ?? 0);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  useEffect(() => {
    const wrap = gridWrapRef.current;
    const thead = theadRef.current;
    if (!wrap) return;
    // ResizeObserver instead of reading offsetHeight during render: keeps
    // layout reads out of the render path and tracks window/zoom changes.
    const ro = new ResizeObserver(() => {
      setViewportH(wrap.clientHeight);
      if (theadRef.current) setTheadH(theadRef.current.offsetHeight);
    });
    ro.observe(wrap);
    if (thead) ro.observe(thead);
    setViewportH(wrap.clientHeight);
    if (thead) setTheadH(thead.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setMapping((prev) => refreshMapping(table.headers, prev));
  }, [table.headers.length]);

  useEffect(() => {
    // Debounced auto-save: every edit schedules a write 600ms out; further
    // edits inside the window push it back so bursts of typing serialize the
    // table once, not per keystroke.
    setPersistState('saving');
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveStoredEditor({
        table,
        title,
        hiddenColumns: [...hiddenColumns],
      });
      setPersistState('saved');
    }, 600);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [table, title, hiddenColumns]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        setHistory((h) => undoHistory(h) ?? h);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        setHistory((h) => redoHistory(h) ?? h);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    // Close on resize/zoom too — a fixed-position menu would otherwise be
    // left floating at stale (and zoom-mismatched) coordinates.
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('app-zoom-changed', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('app-zoom-changed', close);
    };
  }, [contextMenu]);

  const syncToDeck = useCallback(
    (t: CsvTable, m: DeckColumnMapping, deckTitle: string): number => {
      const safeTitle = deckTitle.trim() || 'Imported deck';
      const entries = rowsToDeckEntries(t, m, safeTitle, 'csv');
      if (!entries.length) return 0;
      importDeckFromEntries(entries);
      onDeckImported?.();
      return entries.length;
    },
    [onDeckImported],
  );

  function applyImported(nextTable: CsvTable, deckTitle?: string, mode: 'append' | 'overwrite' = 'overwrite'): void {
    const merged =
      mode === 'append' && table.rows.length
        ? appendTables(table, nextTable)
        : nextTable;
    const nextTitle = deckTitle ?? title;
    const nextSnap: CsvEditorSnapshot = {
      table: merged,
      title: nextTitle,
      hiddenColumns: mode === 'overwrite' ? [] : [...hiddenColumns],
    };
    commit(nextSnap, `Loaded ${merged.rows.length} rows.`);
    setMapping(guessColumnMapping(merged.headers));
    if (mode === 'overwrite') setHiddenColumns(new Set());
    setBaseline(nextSnap);
    const count = syncToDeck(merged, guessColumnMapping(merged.headers), nextTitle);
    if (count) setStatus(`Imported ${count} cards into flashcards.`);
  }

  async function loadText(raw: string, deckTitle?: string): Promise<void> {
    if (!raw.trim()) return;
    setStatus('Parsing…');
    // Parse in a Web Worker so a large file never freezes the grid.
    const parsed = await parseCsvTextAsync(raw, {
      delimiter: table.delimiter,
      hasHeader: table.hasHeader,
    });
    setStatus('');
    if (table.rows.length && raw.trim()) {
      setPendingImport({ table: parsed, title: deckTitle });
      return;
    }
    applyImported(parsed, deckTitle, 'overwrite');
  }

  function handleFile(file: File): void {
    const base = file.name.replace(/\.[^.]+$/, '');
    void file.text().then((text) => loadText(text, base || undefined));
  }

  function handlePasteArea(): void {
    const raw = pasteRef.current?.value ?? '';
    if (!raw.trim()) return;
    void loadText(raw);
    if (pasteRef.current) pasteRef.current.value = '';
  }

  function updateMapping(col: number, field: DeckFieldKey): void {
    const next = { ...mapping, [col]: field };
    setMapping(next);
    const count = syncToDeck(table, next, title);
    if (count) setStatus(`Re-imported ${count} cards with new column mapping.`);
  }

  function manualImport(): void {
    const count = syncToDeck(table, mapping, title);
    setStatus(count ? `Imported ${count} cards.` : 'Nothing to import — map a column to Expression / Word.');
    setBaseline(snap);
  }

  async function downloadCsv(): Promise<void> {
    setSaving(true);
    setStatus('');
    try {
      const csv = serializeCsvTable(table);
      const safe = (title.trim() || 'deck').replace(/[^\w -]+/g, '').trim() || 'deck';
      const ext = table.delimiter === '\t' ? 'tsv' : 'csv';
      const res = await window.api.miningSaveEpubDeckFile(csv, safe, ext);
      if (res.ok && res.path) {
        setStatus(`Saved file → ${res.path}`);
        setBaseline(snap);
      } else if (res.error !== 'cancelled') setStatus(res.error ?? 'Could not save CSV.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function changeDelimiter(delim: CsvDelimiter): void {
    const serialized = serializeCsvTable({ ...table, delimiter: table.delimiter });
    const next = parseCsvText(serialized, { delimiter: delim, hasHeader: table.hasHeader });
    updateTable({ ...next, delimiter: delim });
  }

  function toggleColumnVisibility(col: number): void {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function toggleColSelection(col: number, multi: boolean): void {
    setSelectedCols((prev) => {
      if (!multi) return new Set([col]);
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function onColDragStart(e: DragEvent, col: number): void {
    setDragCol(col);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(col));
  }

  function onColDrop(e: DragEvent, targetCol: number): void {
    e.preventDefault();
    const from = dragCol ?? Number(e.dataTransfer.getData('text/plain'));
    setDragCol(null);
    if (Number.isNaN(from) || from === targetCol) return;
    const nextTable = reorderColumns(table, from, targetCol);
    updateTable(nextTable);
    setMapping((m) => remapMappingOnReorder(m, from, targetCol));
    setHiddenColumns((prev) => {
      const arr = [...prev];
      const remap = (i: number): number => {
        if (from < targetCol) {
          if (i === from) return targetCol;
          if (i > from && i <= targetCol) return i - 1;
          return i;
        }
        if (i === from) return targetCol;
        if (i >= targetCol && i < from) return i + 1;
        return i;
      };
      return new Set(arr.map(remap));
    });
  }

  function handleSplitColumn(): void {
    const col = selectedCols.size === 1 ? [...selectedCols][0] : null;
    if (col === null || col === undefined) {
      setStatus('Select exactly one column to split.');
      return;
    }
    const delim = window.prompt('Split delimiter (e.g. : or ;)', ':');
    if (delim === null) return;
    updateTable(splitColumn(table, col, delim));
    setMapping((m) => remapMappingOnSplit(m, col));
  }

  function handleMergeColumns(): void {
    if (selectedCols.size < 2) {
      setStatus('Select two or more columns to merge.');
      return;
    }
    const sep = window.prompt('Merge separator', ' ');
    if (sep === null) return;
    const cols = [...selectedCols].sort((a, b) => a - b);
    const header = window.prompt('Merged column header (optional)') ?? undefined;
    const next = mergeColumns(table, cols, sep, header);
    updateTable(next);
    setMapping((prev) => refreshMapping(next.headers, prev));
    setSelectedCols(new Set());
  }

  function handleDeduplicate(): void {
    const col = selectedCols.size === 1 ? [...selectedCols][0] : 0;
    const before = table.rows.length;
    const next = deduplicateRows(table, col);
    updateTable(next, `Removed ${before - next.rows.length} duplicate row(s).`);
  }

  function handleTagColumn(): void {
    const header = window.prompt('Tag column header', 'Tag') ?? 'Tag';
    const value = window.prompt('Tag value for all rows', 'Vocabulary Set 1') ?? '';
    updateTable(addTagColumn(table, header, value));
    setMapping((prev) => refreshMapping(table.headers, prev));
  }

  function handleAutoNumber(): void {
    const header = window.prompt('ID column header', 'ID') ?? 'ID';
    updateTable(addAutoNumberColumn(table, header));
    setMapping((m) => remapMappingOnInsert(m, 0));
  }

  function handleCaseChange(mode: CaseMode): void {
    const colIndices = selectedCols.size ? [...selectedCols] : undefined;
    const rowIndices = selectedRow !== null ? [selectedRow] : undefined;
    updateTable(changeCase(table, mode, { colIndices, rowIndices }));
    setContextMenu(null);
  }

  function handleFindReplace(
    find: string,
    replace: string,
    cols: number[] | null,
    regex: boolean,
  ): void {
    updateTable(findAndReplace(table, find, replace, cols ?? undefined, regex));
  }

  function openContextMenu(e: React.MouseEvent, rowIndex: number | null, colIndex: number | null): void {
    e.preventDefault();
    setContextMenu({ ...menuPosition(e), rowIndex, colIndex });
    if (rowIndex !== null) setSelectedRow(rowIndex);
    if (colIndex !== null) toggleColSelection(colIndex, e.ctrlKey || e.metaKey);
  }

  return (
    <section className="anki-card csv-editor">
      <p className="muted csv-editor-lead">
        Spreadsheet editor for CSV / TSV decks. Paste or open a file, edit with power tools, then import to flashcards.
      </p>

      <div className="csv-editor-toolbar">
        <label className="csv-editor-field compact">
          <span>Deck name{dirty ? ' *' : ''}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => updateSnap({ title: e.target.value })}
            placeholder="deck"
          />
        </label>
        <label className="csv-editor-field compact">
          <span>Delimiter</span>
          <select value={table.delimiter} onChange={(e) => changeDelimiter(e.target.value as CsvDelimiter)}>
            <option value=",">Comma</option>
            <option value="\t">Tab</option>
            <option value=";">Semicolon</option>
          </select>
        </label>
        <label className="csv-editor-check">
          <input
            type="checkbox"
            checked={table.hasHeader}
            onChange={(e) => updateTable({ ...table, hasHeader: e.target.checked })}
          />
          Header row
        </label>
        <button type="button" className="btn" disabled={!canUndo(history)} onClick={() => setHistory((h) => undoHistory(h) ?? h)} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" className="btn" disabled={!canRedo(history)} onClick={() => setHistory((h) => redoHistory(h) ?? h)} title="Redo (Ctrl+Y)">
          Redo
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.tab,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn primary" onClick={manualImport}>
          Import to flashcards
        </button>
        <button type="button" className="btn" disabled={saving} onClick={() => void downloadCsv()}>
          <Icon name="download" size={16} />
          {saving ? 'Saving…' : table.delimiter === '\t' ? 'Download TSV' : 'Download CSV'}
        </button>
        <button type="button" className={`btn${showPreview ? ' active' : ''}`} onClick={() => setShowPreview((v) => !v)}>
          Preview
        </button>
      </div>

      <div className="csv-editor-search-row">
        <label className="csv-editor-field compact csv-editor-search-field">
          <span>Search</span>
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Filter rows across all columns…"
          />
        </label>
        <label className="csv-editor-check">
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          Regex
        </label>
        <button type="button" className="btn small" onClick={() => setShowFindReplace(true)}>
          Find / replace
        </button>
        <button type="button" className="btn small" onClick={() => updateTable(trimWhitespace(table), 'Trimmed whitespace.')}>
          Trim spaces
        </button>
        <button type="button" className="btn small" onClick={handleDeduplicate}>
          Deduplicate
        </button>
        <button type="button" className="btn small" onClick={handleTagColumn}>
          Add tag column
        </button>
        <button type="button" className="btn small" onClick={handleAutoNumber}>
          Auto-number
        </button>
      </div>

      <div className="csv-editor-paste-row">
        <textarea
          ref={pasteRef}
          className="csv-editor-paste"
          placeholder="Paste CSV / TSV here and click Load"
          rows={2}
          spellCheck={false}
        />
        <button type="button" className="btn" onClick={handlePasteArea}>
          Load paste
        </button>
      </div>

      <div className="csv-editor-col-tools">
        <span className="muted csv-editor-col-tools-label">Columns:</span>
        <button type="button" className="btn small" onClick={handleSplitColumn}>
          Split
        </button>
        <button type="button" className="btn small" onClick={handleMergeColumns}>
          Merge
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const next = insertColumn(table, table.headers.length);
            updateTable(next);
            setMapping((m) => remapMappingOnInsert(m, next.headers.length - 1));
          }}
        >
          + Column
        </button>
        <button
          type="button"
          className="btn small"
          disabled={table.headers.length <= 1}
          onClick={() => {
            const idx = table.headers.length - 1;
            updateTable(deleteColumn(table, idx));
            setMapping((m) => remapMappingOnDelete(m, idx));
          }}
        >
          Delete column
        </button>
      </div>

      <p className="muted csv-editor-stats">
        {filteredRowIndices.length} / {stats.rows} row{stats.rows === 1 ? '' : 's'} shown · {stats.columns} column
        {stats.columns === 1 ? '' : 's'} · deck id {deckBookId(title)}
        {dirty && ' · unsaved changes'}
        {persistState !== 'idle' && (
          <span className={`csv-editor-autosave ${persistState}`}>
            <span className="csv-editor-autosave-dot" aria-hidden />
            {persistState === 'saving' ? 'Saving…' : 'Saved'}
          </span>
        )}
      </p>

      <div className={`csv-editor-body${showPreview ? ' with-preview' : ''}`}>
        <div className="csv-editor-grid-wrap" ref={gridWrapRef} onScroll={onGridScroll}>
          {/* table-layout: fixed (in CSS) + explicit min-width: column widths
              are computed once from the header row instead of re-measuring
              every rendered cell, so scrolling can't trigger full-table
              reflows or column jitter as different rows enter the window. */}
          <table
            className="csv-editor-grid"
            style={{ minWidth: visibleColIndices.length * 140 }}
          >
            <thead ref={theadRef}>
              <tr className="csv-editor-map-row">
                {visibleColIndices.map((col) => (
                  <th key={`map-${col}`}>
                    <select
                      value={mapping[col] ?? 'skip'}
                      onChange={(e) => updateMapping(col, e.target.value as DeckFieldKey)}
                      aria-label={`Map ${table.headers[col]}`}
                    >
                      {DECK_FIELD_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
              <tr className="csv-editor-filter-row">
                {visibleColIndices.map((col) => (
                  <th key={`filter-${col}`}>
                    <input
                      className="csv-editor-filter-input"
                      value={columnFilters[col] ?? ''}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))
                      }
                      placeholder="Filter…"
                      aria-label={`Filter ${table.headers[col]}`}
                    />
                  </th>
                ))}
              </tr>
              <tr>
                {visibleColIndices.map((col) => (
                  <th
                    key={`h-${col}`}
                    className={`csv-editor-col-head${selectedCols.has(col) ? ' col-selected' : ''}${hiddenColumns.has(col) ? ' col-hidden' : ''}`}
                    draggable
                    onDragStart={(e) => onColDragStart(e, col)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onColDrop(e, col)}
                    onClick={(e) => toggleColSelection(col, e.ctrlKey || e.metaKey)}
                    onContextMenu={(e) => openContextMenu(e, null, col)}
                  >
                    <div className="csv-editor-col-head-inner">
                      <span className="csv-editor-drag-handle" title="Drag to reorder" aria-hidden>
                        ::
                      </span>
                      <input
                        className="csv-editor-header-input"
                        value={table.headers[col]}
                        onChange={(e) => updateTable(setHeader(table, col, e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        className="csv-editor-vis-btn"
                        title={hiddenColumns.has(col) ? 'Show column' : 'Hide column'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumnVisibility(col);
                        }}
                      >
                        {hiddenColumns.has(col) ? 'Show' : 'Hide'}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPad > 0 && (
                <tr aria-hidden>
                  <td
                    colSpan={visibleColIndices.length}
                    style={{ height: topPad, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
              {windowIndices.map((rowIndex) => (
                <CsvGridRow
                  key={rowIndex}
                  row={table.rows[rowIndex]}
                  rowIndex={rowIndex}
                  visibleCols={visibleColIndices}
                  selected={selectedRow === rowIndex}
                  globalPattern={globalPattern}
                  onCellChange={handleCellChange}
                  onSelectRow={handleSelectRow}
                  onContextMenu={handleRowContextMenu}
                />
              ))}
              {bottomPad > 0 && (
                <tr aria-hidden>
                  <td
                    colSpan={visibleColIndices.length}
                    style={{ height: bottomPad, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showPreview && (
          <CardPreviewPanel
            table={table}
            mapping={mapping}
            rowIndex={selectedRow}
            onClose={() => setShowPreview(false)}
          />
        )}
      </div>

      {hiddenColumns.size > 0 && (
        <div className="csv-editor-hidden-cols">
          <span className="muted">Hidden columns:</span>
          {[...hiddenColumns].sort((a, b) => a - b).map((col) => (
            <button key={col} type="button" className="btn small subtle" onClick={() => toggleColumnVisibility(col)}>
              {table.headers[col] || `Column ${col + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="csv-editor-row-actions">
        <button type="button" className="btn small" onClick={() => updateTable(insertRow(table, table.rows.length))}>
          + Row
        </button>
        <button
          type="button"
          className="btn small"
          disabled={selectedRow === null}
          onClick={() => {
            if (selectedRow === null) return;
            updateTable(deleteRow(table, selectedRow));
            setSelectedRow(null);
          }}
        >
          Delete row
        </button>
        <button
          type="button"
          className="btn small subtle"
          onClick={() => {
            const empty = emptyTable(4, 8);
            commit({ table: empty, title, hiddenColumns: [] });
            setHiddenColumns(new Set());
            setStatus('');
          }}
        >
          Clear grid
        </button>
      </div>

      {status && (
        <p className={`csv-editor-status${status.includes('Imported') || status.startsWith('Saved') ? ' ok' : ''}`}>
          {status}
        </p>
      )}

      {showFindReplace && (
        <FindReplaceModal
          columnHeaders={table.headers}
          onClose={() => setShowFindReplace(false)}
          onApply={handleFindReplace}
        />
      )}

      {pendingImport && (
        <ImportMergeModal
          rowCount={pendingImport.table.rows.length}
          onClose={() => setPendingImport(null)}
          onChoose={(mode) => {
            applyImported(pendingImport.table, pendingImport.title, mode);
            setPendingImport(null);
          }}
        />
      )}

      {contextMenu && (
        <div
          className="csv-editor-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => handleCaseChange('upper')}>
            UPPERCASE
          </button>
          <button type="button" role="menuitem" onClick={() => handleCaseChange('lower')}>
            lowercase
          </button>
          <button type="button" role="menuitem" onClick={() => handleCaseChange('title')}>
            Title Case
          </button>
          {contextMenu.colIndex !== null && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                updateTable(splitColumn(table, contextMenu.colIndex!, ':'));
                setMapping((m) => remapMappingOnSplit(m, contextMenu.colIndex!));
                setContextMenu(null);
              }}
            >
              Split column…
            </button>
          )}
        </div>
      )}
    </section>
  );
}
