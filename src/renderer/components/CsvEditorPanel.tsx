import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  deleteColumn,
  deleteRow,
  emptyTable,
  csvColumnLabel,
  insertColumn,
  insertRow,
  isBlankTable,
  parseCsvText,
  serializeCsvTable,
  setCell,
  setCsvColumnLabel,
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
import { confirmDialog, promptDialog, AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from './ui';
import { importDeckFromEntries, previewDeckUpsert } from '../flashcardDeck';
import { useT } from '../i18n';
import { getActiveProfile } from '../profileState';
import { parseCsvTextAsync } from '../csvParseAsync';
import { clampToViewport, toLayoutPoint } from '../zoomCoords';
import Icon from './Icons';
import CardPreviewPanel from './csv-editor/CardPreviewPanel';
import CsvGridRow from './csv-editor/CsvGridRow';
import FindReplaceModal from './csv-editor/FindReplaceModal';
import ImportMergeModal from './csv-editor/ImportMergeModal';
import {
  defaultEditorSnapshot,
  loadNewestStoredEditor,
  loadStoredEditor,
  saveStoredEditor,
  storedEditorSavedAt,
} from './csv-editor/csvEditorStorage';
import { editorUndoAction } from './csv-editor/editorUndoKeys';
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
  const { t } = useT();
  // Generated column names follow the UI language (see `setCsvColumnLabel`).
  setCsvColumnLabel(t('csv.columnN', { n: '{n}' }));
  const initial = useMemo(
    // Read once on mount; the default title is only a starting value.
    () => loadStoredEditor() ?? defaultEditorSnapshot(t('csv.default.deckTitle')),
    [],
  );
  // When the localStorage copy `initial` came from was written; the IndexedDB
  // mirror is compared against it once it has been read.
  const initialSavedAt = useMemo(() => storedEditorSavedAt(), []);
  const [history, setHistory] = useState<CsvEditorHistory>(() => createHistory(initial));
  const [mapping, setMapping] = useState<DeckColumnMapping>(() =>
    guessColumnMapping(initial.table.headers),
  );
  const [status, setStatus] = useState('');
  const [statusOk, setStatusOk] = useState(false);
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
  // Autosave waits for the IndexedDB read: saving the (possibly stale)
  // localStorage copy first would stamp it newer than the mirror it lost to.
  const [hydrated, setHydrated] = useState(false);
  const [removeMissing, setRemoveMissing] = useState(false);
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
  // The deck this grid imports into. Pinned when a file is loaded, so editing
  // the title renames that deck rather than starting a new one.
  const deckId = snap.deckId ?? deckBookId(title);

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

  const setStatusMsg = useCallback((msg: string, ok = false) => {
    setStatus(msg);
    setStatusOk(ok);
  }, []);

  const commit = useCallback(
    (next: CsvEditorSnapshot, msg?: string, ok = false) => {
      setHistory((h) => pushHistory(h, next));
      if (msg) setStatusMsg(msg, ok);
    },
    [setStatusMsg],
  );

  const updateSnap = useCallback(
    (patch: Partial<CsvEditorSnapshot>, msg?: string, ok = false) => {
      commit({ ...history.present, ...patch }, msg, ok);
    },
    [commit, history.present],
  );

  const updateTable = useCallback(
    (nextTable: CsvTable, msg?: string, ok = false) => {
      updateSnap({ table: nextTable }, msg, ok);
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
    let cancelled = false;
    void loadNewestStoredEditor().then((newest) => {
      if (cancelled) return;
      if (newest && newest.savedAt > initialSavedAt) {
        // The mirror is newer than the cache: a grid too big for localStorage.
        const next = newest.snapshot;
        setHistory(createHistory(next));
        setBaseline(next);
        setHiddenColumns(new Set(next.hiddenColumns));
        setMapping(guessColumnMapping(next.table.headers));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSavedAt]);

  useEffect(() => {
    if (!hydrated) return undefined;
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
        deckId,
      });
      setPersistState('saved');
    }, 600);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [table, title, hiddenColumns, deckId, hydrated]);

  // Undo/redo is scoped to the editor, and leaves text fields outside the grid
  // (deck name, search, paste box) their own native undo.
  const onEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    const action = editorUndoAction(e.nativeEvent, gridWrapRef.current);
    if (!action) return;
    e.preventDefault();
    setHistory((h) => (action === 'undo' ? undoHistory(h) : redoHistory(h)) ?? h);
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

  function applyImported(nextTable: CsvTable, deckTitle?: string, mode: 'append' | 'overwrite' = 'overwrite'): void {
    const merged =
      mode === 'append' && !isBlankTable(table)
        ? appendTables(table, nextTable)
        : nextTable;
    const nextTitle = deckTitle ?? title;
    // Loading loads the grid and nothing else. Cards change only when the user
    // presses Import: this used to import on every load and on every mapping
    // change, and each import reset the deck's review progress.
    const nextSnap: CsvEditorSnapshot = {
      table: merged,
      title: nextTitle,
      hiddenColumns: mode === 'overwrite' ? [] : [...hiddenColumns],
      deckId: mode === 'overwrite' ? deckBookId(nextTitle) : deckId,
    };
    commit(nextSnap, t('csv.status.loadedRows', { count: merged.rows.length }), true);
    setMapping(guessColumnMapping(merged.headers));
    if (mode === 'overwrite') setHiddenColumns(new Set());
    setBaseline(nextSnap);
  }

  async function loadText(raw: string, deckTitle?: string): Promise<void> {
    if (!raw.trim()) return;
    setStatusMsg(t('csv.status.parsing'));
    // Parse in a Web Worker so a large file never freezes the grid. No
    // delimiter or header flag is passed: the file's own are detected (a TSV,
    // an Anki export), and the toolbar controls then show what was found.
    const parsed = await parseCsvTextAsync(raw, { columnLabel: csvColumnLabel() });
    setStatusMsg('');
    if (!isBlankTable(table)) {
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
    setMapping({ ...mapping, [col]: field });
  }

  async function manualImport(): Promise<void> {
    const deckTitle = title.trim() || t('csv.default.deckTitle');
    const entries = rowsToDeckEntries(table, mapping, deckTitle, 'csv').map((entry) => ({
      ...entry,
      bookId: deckId,
    }));
    if (!entries.length) {
      setStatusMsg(t('csv.status.nothingToImport'));
      return;
    }
    let prune = removeMissing;
    if (prune) {
      const preview = previewDeckUpsert(deckId, entries);
      if (preview.missing > 0) {
        prune = await confirmDialog({
          title: t('csv.removeMissing.confirmTitle'),
          message: t('csv.removeMissing.confirmMsg', { count: preview.missing }),
          confirmLabel: t('csv.removeMissing.confirm'),
          danger: true,
        });
        if (!prune) return;
      }
    }
    const result = importDeckFromEntries(entries, { removeMissing: prune });
    onDeckImported?.();
    const parts = [
      t('csv.status.upserted', {
        added: result.added.length,
        updated: result.updated,
        unchanged: result.unchanged,
      }),
    ];
    if (result.removed) parts.push(t('csv.status.removedMissing', { count: result.removed }));
    else if (result.missing) parts.push(t('csv.status.keptMissing', { count: result.missing }));
    setStatusMsg(parts.join(' '), true);
    setBaseline(snap);
  }

  async function downloadCsv(): Promise<void> {
    setSaving(true);
    setStatusMsg('');
    try {
      const csv = serializeCsvTable(table);
      const safe = (title.trim() || 'deck').replace(/[^\w -]+/g, '').trim() || 'deck';
      const ext = table.delimiter === '\t' ? 'tsv' : 'csv';
      const res = await window.api.miningSaveEpubDeckFile(csv, safe, ext);
      if (res.ok && res.path) {
        setStatusMsg(t('csv.status.savedFile', { path: res.path }), true);
        setBaseline(snap);
      } else if (res.error !== 'cancelled') {
        setStatusMsg(res.error ?? t('csv.status.saveFailed'));
      }
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : String(error));
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

  async function handleSplitColumn(): Promise<void> {
    const col = selectedCols.size === 1 ? [...selectedCols][0] : null;
    if (col === null || col === undefined) {
      setStatusMsg(t('csv.status.selectOneToSplit'));
      return;
    }
    const delim = await promptDialog({
      title: t('csv.prompt.splitTitle'),
      message: t('csv.prompt.splitMsg'),
      defaultValue: ':',
    });
    if (delim === null) return;
    updateTable(splitColumn(table, col, delim));
    setMapping((m) => remapMappingOnSplit(m, col));
  }

  async function handleMergeColumns(): Promise<void> {
    if (selectedCols.size < 2) {
      setStatusMsg(t('csv.status.selectTwoToMerge'));
      return;
    }
    const sep = await promptDialog({
      title: t('csv.prompt.mergeTitle'),
      message: t('csv.prompt.mergeSep'),
      defaultValue: ' ',
    });
    if (sep === null) return;
    const cols = [...selectedCols].sort((a, b) => a - b);
    const header = await promptDialog({
      title: t('csv.prompt.mergeTitle'),
      message: t('csv.prompt.mergeHeader'),
    });
    // Cancel means cancel; an empty answer means "use the default header".
    if (header === null) return;
    const next = mergeColumns(table, cols, sep, header || undefined);
    updateTable(next);
    setMapping((prev) => refreshMapping(next.headers, prev));
    setSelectedCols(new Set());
  }

  function handleDeduplicate(): void {
    const col = selectedCols.size === 1 ? [...selectedCols][0] : 0;
    const before = table.rows.length;
    const next = deduplicateRows(table, col);
    updateTable(next, t('csv.status.removedDupes', { count: before - next.rows.length }), true);
  }

  async function handleTagColumn(): Promise<void> {
    const defaultHeader = t('csv.default.tagHeader');
    const header = await promptDialog({
      title: t('csv.prompt.tagTitle'),
      message: t('csv.prompt.tagHeader'),
      defaultValue: defaultHeader,
    });
    if (header === null) return;
    const value = await promptDialog({
      title: t('csv.prompt.tagTitle'),
      message: t('csv.prompt.tagValue'),
      defaultValue: t('csv.default.tagValue'),
    });
    if (value === null) return;
    const next = addTagColumn(table, header.trim() || defaultHeader, value);
    updateTable(next);
    setMapping((prev) => refreshMapping(next.headers, prev));
  }

  async function handleAutoNumber(): Promise<void> {
    const defaultHeader = t('csv.default.idHeader');
    const header = await promptDialog({
      title: t('csv.prompt.autoTitle'),
      message: t('csv.prompt.autoHeader'),
      defaultValue: defaultHeader,
    });
    if (header === null) return;
    updateTable(addAutoNumberColumn(table, header.trim() || defaultHeader));
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

  // Native menu bar + status bar (Future Spreadsheet). AppChrome renders them
  // only under Aero; pass-through in the default theme. Items drive existing
  // handlers only — no ribbon, no behavior forked by theme.
  const csvMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('csv.menu.file'),
      items: [
        { id: 'open', label: t('csv.menu.open'), onSelect: () => fileRef.current?.click() },
        {
          id: 'download',
          label: table.delimiter === '\t' ? t('csv.downloadTsv') : t('csv.downloadCsv'),
          disabled: saving,
          onSelect: () => void downloadCsv(),
        },
        { separator: true, label: '' },
        { id: 'import', label: t('csv.importFlashcards'), onSelect: () => void manualImport() },
      ],
    },
    {
      id: 'edit',
      label: t('csv.menu.edit'),
      items: [
        {
          id: 'undo',
          label: t('csv.undo'),
          disabled: !canUndo(history),
          onSelect: () => setHistory((h) => undoHistory(h) ?? h),
        },
        {
          id: 'redo',
          label: t('csv.redo'),
          disabled: !canRedo(history),
          onSelect: () => setHistory((h) => redoHistory(h) ?? h),
        },
        { separator: true, label: '' },
        { id: 'find', label: t('csv.menu.find'), onSelect: () => setShowFindReplace(true) },
      ],
    },
    {
      id: 'data',
      label: t('csv.menu.data'),
      items: [
        {
          id: 'split',
          label: t('csv.menu.split'),
          disabled: selectedCols.size !== 1,
          onSelect: () => void handleSplitColumn(),
        },
        {
          id: 'merge',
          label: t('csv.menu.merge'),
          disabled: selectedCols.size < 2,
          onSelect: () => void handleMergeColumns(),
        },
        { id: 'dedup', label: t('csv.menu.dedup'), onSelect: handleDeduplicate },
        { separator: true, label: '' },
        { id: 'tag', label: t('csv.menu.tag'), onSelect: () => void handleTagColumn() },
        { id: 'autonum', label: t('csv.menu.autonum'), onSelect: () => void handleAutoNumber() },
      ],
    },
    {
      id: 'view',
      label: t('csv.menu.view'),
      items: [
        {
          id: 'preview',
          label: showPreview ? t('csv.menu.hidePreview') : t('csv.menu.showPreview'),
          onSelect: () => setShowPreview((v) => !v),
        },
      ],
    },
  ];

  const csvStatus = (
    <>
      <StatusBarField>{t('csv.status.rows', { count: table.rows.length })}</StatusBarField>
      <StatusBarField>{t('csv.status.cols', { count: table.headers.length })}</StatusBarField>
      {selectedCols.size > 0 && (
        <StatusBarField>{t('clipboard.selectedCount', { count: selectedCols.size })}</StatusBarField>
      )}
      <StatusBarSpacer />
      {dirty && <StatusBarField live>{t('csv.status.unsaved')}</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={csvMenus} status={csvStatus} className="aero-csv-chrome">
    <section className="anki-card csv-editor" tabIndex={-1} onKeyDown={onEditorKeyDown}>
      <p className="muted csv-editor-lead">{t('csv.lead')}</p>

      <div className="csv-editor-toolbar">
        <label className="csv-editor-field compact">
          <span>
            {t('csv.deckName')}
            {dirty ? ' *' : ''}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => updateSnap({ title: e.target.value, deckId })}
            placeholder={t('csv.deckNamePlaceholder')}
          />
        </label>
        <label className="csv-editor-field compact">
          <span>{t('csv.delimiter')}</span>
          <select value={table.delimiter} onChange={(e) => changeDelimiter(e.target.value as CsvDelimiter)}>
            <option value=",">{t('csv.delimiter.comma')}</option>
            {/* An expression, not value="\t": JSX attribute strings keep the
                backslash, so the control could never show a detected tab. */}
            <option value={'\t'}>{t('csv.delimiter.tab')}</option>
            <option value=";">{t('csv.delimiter.semicolon')}</option>
          </select>
        </label>
        <label className="csv-editor-check">
          <input
            type="checkbox"
            checked={table.hasHeader}
            onChange={(e) => updateTable({ ...table, hasHeader: e.target.checked })}
          />
          {t('csv.headerRow')}
        </label>
        <button
          type="button"
          className="btn"
          disabled={!canUndo(history)}
          onClick={() => setHistory((h) => undoHistory(h) ?? h)}
          title={t('csv.undoTitle')}
        >
          {t('csv.undo')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canRedo(history)}
          onClick={() => setHistory((h) => redoHistory(h) ?? h)}
          title={t('csv.redoTitle')}
        >
          {t('csv.redo')}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t('csv.openFile')}
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
        <button type="button" className="btn primary" onClick={() => void manualImport()}>
          {t('csv.importFlashcards')}
        </button>
        <label className="csv-editor-check" title={t('csv.removeMissing.hint')}>
          <input
            type="checkbox"
            checked={removeMissing}
            onChange={(e) => setRemoveMissing(e.target.checked)}
          />
          {t('csv.removeMissing')}
        </label>
        <button type="button" className="btn" disabled={saving} onClick={() => void downloadCsv()}>
          <Icon name="download" size={16} />
          {saving
            ? t('csv.saving')
            : table.delimiter === '\t'
              ? t('csv.downloadTsv')
              : t('csv.downloadCsv')}
        </button>
        <button
          type="button"
          className={`btn${showPreview ? ' active' : ''}`}
          onClick={() => setShowPreview((v) => !v)}
        >
          {t('csv.preview')}
        </button>
      </div>

      <div className="csv-editor-search-row">
        <label className="csv-editor-field compact csv-editor-search-field">
          <span>{t('csv.search')}</span>
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder={t('csv.searchPlaceholder')}
          />
        </label>
        <label className="csv-editor-check">
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          {t('csv.regex')}
        </label>
        <button type="button" className="btn small" onClick={() => setShowFindReplace(true)}>
          {t('csv.findReplace')}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => updateTable(trimWhitespace(table), t('csv.status.trimmed'), true)}
        >
          {t('csv.trimSpaces')}
        </button>
        <button type="button" className="btn small" onClick={handleDeduplicate}>
          {t('csv.deduplicate')}
        </button>
        <button type="button" className="btn small" onClick={handleTagColumn}>
          {t('csv.addTagColumn')}
        </button>
        <button type="button" className="btn small" onClick={handleAutoNumber}>
          {t('csv.autoNumber')}
        </button>
      </div>

      <div className="csv-editor-paste-row">
        <textarea
          ref={pasteRef}
          className="csv-editor-paste"
          placeholder={t('csv.pastePlaceholder')}
          rows={2}
          spellCheck={false}
          lang={getActiveProfile().targetLang}
        />
        <button type="button" className="btn" onClick={handlePasteArea}>
          {t('csv.loadPaste')}
        </button>
      </div>

      <div className="csv-editor-col-tools">
        <span className="muted csv-editor-col-tools-label">{t('csv.columns')}</span>
        <button type="button" className="btn small" onClick={handleSplitColumn}>
          {t('csv.split')}
        </button>
        <button type="button" className="btn small" onClick={handleMergeColumns}>
          {t('csv.merge')}
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
          {t('csv.addColumn')}
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
          {t('csv.deleteColumn')}
        </button>
      </div>

      <p className="muted csv-editor-stats">
        {t('csv.stats.rowsShown', { shown: filteredRowIndices.length, count: stats.rows })}
        {' · '}
        {t('csv.stats.cols', { count: stats.columns })}
        {' · '}
        {t('csv.stats.deckId', { id: deckId })}
        {dirty && t('csv.unsavedSuffix')}
        {persistState !== 'idle' && (
          <span className={`csv-editor-autosave ${persistState}`}>
            <span className="csv-editor-autosave-dot" aria-hidden />
            {persistState === 'saving' ? t('csv.autosave.saving') : t('csv.autosave.saved')}
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
                      aria-label={t('csv.mapAria', { header: table.headers[col] })}
                    >
                      {DECK_FIELD_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {t(`csv.field.${opt.id}`)}
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
                      placeholder={t('csv.filterPlaceholder')}
                      aria-label={t('csv.filterAria', { header: table.headers[col] })}
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
                      <span className="csv-editor-drag-handle" title={t('csv.dragReorder')} aria-hidden>
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
                        title={hiddenColumns.has(col) ? t('csv.showColumn') : t('csv.hideColumn')}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumnVisibility(col);
                        }}
                      >
                        {hiddenColumns.has(col) ? t('csv.show') : t('csv.hide')}
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
          <span className="muted">{t('csv.hiddenColumns')}</span>
          {[...hiddenColumns].sort((a, b) => a - b).map((col) => (
            <button key={col} type="button" className="btn small subtle" onClick={() => toggleColumnVisibility(col)}>
              {table.headers[col] || t('csv.columnN', { n: col + 1 })}
            </button>
          ))}
        </div>
      )}

      <div className="csv-editor-row-actions">
        <button type="button" className="btn small" onClick={() => updateTable(insertRow(table, table.rows.length))}>
          {t('csv.addRow')}
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
          {t('csv.deleteRow')}
        </button>
        <button
          type="button"
          className="btn small subtle"
          onClick={() => {
            const empty = emptyTable(4, 8);
            commit({ table: empty, title, hiddenColumns: [], deckId });
            setHiddenColumns(new Set());
            setStatusMsg('');
          }}
        >
          {t('csv.clearGrid')}
        </button>
      </div>

      {status && (
        <p className={`csv-editor-status${statusOk ? ' ok' : ''}`}>
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
            {t('csv.ctx.upper')}
          </button>
          <button type="button" role="menuitem" onClick={() => handleCaseChange('lower')}>
            {t('csv.ctx.lower')}
          </button>
          <button type="button" role="menuitem" onClick={() => handleCaseChange('title')}>
            {t('csv.ctx.title')}
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
              {t('csv.ctx.split')}
            </button>
          )}
        </div>
      )}
    </section>
    </AppChrome>
  );
}
