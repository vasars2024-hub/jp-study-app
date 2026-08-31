/**
 * The Files app — the surface.
 *
 * Built on `LiquidAppScaffold` from the first line rather than retrofitted:
 * this is a NEW surface, and the plan is explicit that building it in the old
 * language and converting it later is twice the work. The five slots map onto
 * the Explorer shape the plan asks for without inventing new geometry —
 *
 *   rail      the derived category tree, with a live count per node
 *   toolbar   search, sort column, sort direction, refresh
 *   canvas    the item list (the only slot that is not chrome)
 *   inspector the selected item's details and its actions
 *   dock      the status bar: item count and total size
 *
 * Three behaviours the plan pins and this component must not soften:
 *
 * 1. **A count of 0 is shown, not hidden.** An empty category stays in the tree
 *    reading 0. Gate 1 is "a category reading 0 while items exist is a
 *    FINDING", and a tree that drops its empty nodes cannot be checked for it.
 * 2. **Reveal is offered only where it can work.** A dictionary is a SQLite
 *    row; it has no folder. The action is absent for it rather than present and
 *    failing (gate 12), and the inspector says why in words.
 * 3. **Scope is a filter, not a mode.** Selecting a category narrows the list;
 *    the root node clears it. Same window either way (gate 5's shape).
 */
import { useCallback, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LiquidAppScaffold } from '../liquid/LiquidAppScaffold';
import VirtualList from '../VirtualList';
import {
  FILES_SORT_COLUMNS,
  FILES_TREE,
  categoryContains,
  countByCategory,
  deleteModeFor,
  isMachineDerived,
  matchesQuery,
  revealTargetFor,
  sortItems,
  type FilesCategoryId,
  type FilesItem,
  type FilesSortColumn,
  type FilesSortDirection,
} from '../../../shared/filesApp/catalog';
import { useFilesIndex } from './useFilesIndex';
import './filesApp.css';

const ROW_HEIGHT = 32;

/** Bytes, rendered with the unit the number actually deserves. */
function formatSize(bytes: number | null, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (bytes === null) return '—';
  const units = ['filesApp.unit.b', 'filesApp.unit.kb', 'filesApp.unit.mb', 'filesApp.unit.gb'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // toFixed opts out of locale digit formatting; toLocaleString does not.
  const shown = unit === 0 ? value : Number(value.toFixed(1));
  return t(units[unit], { n: shown.toLocaleString() });
}

function formatDate(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleString();
}

export interface FilesAppProps {
  /**
   * Context entry: the category the caller came from. A filter, never a mode —
   * the tree's root clears it and the same window shows everything.
   */
  initialScope?: FilesCategoryId | null;
  /** Highlight this item on open, when the caller knows which one it means. */
  initialFocusItemId?: string | null;
}

export function FilesApp({ initialScope = null, initialFocusItemId = null }: FilesAppProps) {
  const { t, lang } = useT();
  const { state, refresh, refreshing } = useFilesIndex();

  const [scope, setScope] = useState<FilesCategoryId | null>(initialScope);
  const [query, setQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<FilesSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<FilesSortDirection>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(initialFocusItemId);
  const [revealNote, setRevealNote] = useState<string | null>(null);

  const allItems = state.snapshot?.items ?? [];

  /**
   * Counts come from the snapshot when nothing is filtered, and are recomputed
   * against the search when something is — so the tree shows how many hits are
   * in each category rather than a total the visible list contradicts.
   */
  const counts = useMemo(() => {
    if (!query.trim()) return state.snapshot?.counts ?? countByCategory([]);
    return countByCategory(allItems.filter((i) => matchesQuery(i, query)));
    // `lang` is not read here; counts are numbers, not translated strings.
  }, [state.snapshot, allItems, query]);

  const countFor = useCallback(
    (id: FilesCategoryId) => counts.find((c) => c.categoryId === id)?.total ?? 0,
    [counts],
  );

  const visible = useMemo(() => {
    const filtered = allItems.filter(
      (item) =>
        (scope === null || categoryContains(scope, item.categoryId)) && matchesQuery(item, query),
    );
    return sortItems(filtered, sortColumn, sortDirection);
  }, [allItems, scope, query, sortColumn, sortDirection]);

  const selected = useMemo(
    () => visible.find((i) => i.id === selectedId) ?? null,
    [visible, selectedId],
  );

  const totalSize = useMemo(
    () => visible.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
    [visible],
  );

  const toggleSort = useCallback(
    (column: FilesSortColumn) => {
      setSortColumn((prev) => {
        if (prev === column) {
          setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
          return prev;
        }
        setSortDirection('asc');
        return column;
      });
    },
    [],
  );

  const onReveal = useCallback(async () => {
    if (!selected) return;
    const result = await window.api?.filesReveal?.(selected.location);
    if (!result || result.ok) {
      setRevealNote(null);
      return;
    }
    setRevealNote(t(result.reasonKey ?? 'filesApp.reveal.notFileBacked'));
  }, [selected, t]);

  /* ---------------------------- rail ---------------------------- */

  const rail = (
    <div className="fa-tree">
      <button
        type="button"
        className="fa-tree-node fa-tree-root"
        data-selected={scope === null ? 'true' : undefined}
        aria-pressed={scope === null}
        onClick={() => setScope(null)}
      >
        <span className="fa-tree-label">{t('filesApp.tree.everything')}</span>
        <span className="fa-tree-count">{allItems.length.toLocaleString()}</span>
      </button>
      {FILES_TREE.map((node) => (
        <button
          key={node.id}
          type="button"
          className="fa-tree-node"
          data-leaf={node.isLeaf ? 'true' : undefined}
          data-selected={scope === node.id ? 'true' : undefined}
          aria-pressed={scope === node.id}
          onClick={() => setScope(node.id)}
        >
          <span className="fa-tree-label">{t(node.labelKey)}</span>
          {/* Shown even at 0: a category that reads 0 while items exist is a
              finding, and a hidden node cannot be seen to be wrong. */}
          <span className="fa-tree-count">{countFor(node.id).toLocaleString()}</span>
        </button>
      ))}
    </div>
  );

  /* -------------------------- toolbar --------------------------- */

  const toolbar = (
    <div className="fa-toolbar">
      <label className="fa-search">
        <span className="fa-visually-hidden">{t('filesApp.search.label')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('filesApp.search.placeholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="fa-sort">
        <span className="fa-visually-hidden">{t('filesApp.sort.label')}</span>
        <select
          value={sortColumn}
          onChange={(e) => setSortColumn(e.target.value as FilesSortColumn)}
        >
          {FILES_SORT_COLUMNS.map((column) => (
            <option key={column} value={column}>
              {t(`filesApp.column.${column}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="fa-sort-dir"
        onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
        aria-label={t(sortDirection === 'asc' ? 'filesApp.sort.asc' : 'filesApp.sort.desc')}
      >
        {sortDirection === 'asc' ? '↑' : '↓'}
      </button>
      <button type="button" className="fa-refresh" onClick={refresh} disabled={refreshing}>
        {t(refreshing ? 'filesApp.action.refreshing' : 'filesApp.action.refresh')}
      </button>
    </div>
  );

  /* --------------------------- canvas --------------------------- */

  const header = (
    <div className="fa-row fa-head" role="row" aria-rowindex={1}>
      {(['name', 'kind', 'provenance', 'size', 'modified'] as const).map((column) => (
        <button
          key={column}
          type="button"
          role="columnheader"
          className={`fa-cell fa-cell-${column}`}
          aria-sort={
            sortColumn === column
              ? sortDirection === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
          }
          onClick={() => toggleSort(column)}
        >
          {t(`filesApp.column.${column}`)}
        </button>
      ))}
    </div>
  );

  const renderRow = useCallback(
    (item: FilesItem, index: number) => (
      <div
        role="row"
        className="fa-row"
        // VirtualList marks its own slots `presentation` in grid mode, so the
        // real row count CANNOT come from it — a 4,000-row list windowed to 20
        // announces twenty rows unless the caller supplies these. Row 1 is the
        // header, so the body starts at 2.
        aria-rowindex={index + 2}
        data-selected={item.id === selectedId ? 'true' : undefined}
        data-broken={item.flags.brokenLink ? 'true' : undefined}
        aria-selected={item.id === selectedId}
        tabIndex={0}
        onClick={() => setSelectedId(item.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedId(item.id);
          }
        }}
      >
        <span role="gridcell" className="fa-cell fa-cell-name">
          {item.name}
          {item.flags.brokenLink ? (
            <span className="fa-badge fa-badge-broken">{t('filesApp.flag.brokenLink')}</span>
          ) : null}
        </span>
        <span role="gridcell" className="fa-cell fa-cell-kind">
          {t(`filesApp.kind.${item.kind}`)}
        </span>
        <span
          role="gridcell"
          className="fa-cell fa-cell-provenance"
          data-machine={isMachineDerived(item.provenance) ? 'true' : undefined}
        >
          {t(`filesApp.provenance.${item.provenance}`)}
        </span>
        <span role="gridcell" className="fa-cell fa-cell-size">
          {formatSize(item.sizeBytes, t)}
        </span>
        <span role="gridcell" className="fa-cell fa-cell-modified">
          {formatDate(item.modifiedAt)}
        </span>
      </div>
    ),
    // `lang` is here on purpose: every cell above is a `t()` call, and `t`'s
    // identity is stable by design, so depending on it would go stale on a
    // language switch instead of erroring.
    [selectedId, t, lang],
  );

  const canvas = (() => {
    if (state.status === 'loading') {
      return <p className="fa-state">{t('filesApp.state.loading')}</p>;
    }
    if (state.status === 'unavailable') {
      return <p className="fa-state fa-state-error">{t('filesApp.state.unavailable')}</p>;
    }
    if (state.status === 'error') {
      return (
        <div className="fa-state fa-state-error">
          <p>{t('filesApp.state.error')}</p>
          <p className="fa-state-detail">{state.error}</p>
          <button type="button" onClick={refresh}>
            {t('filesApp.action.retry')}
          </button>
        </div>
      );
    }
    const failed = state.snapshot.enumerators.filter((r) => r.error);
    return (
      <div
        className="fa-list"
        role="grid"
        aria-label={t('filesApp.list.label')}
        aria-rowcount={visible.length + 1}
      >
        {header}
        {failed.length > 0 ? (
          // A store that could not be read is named, so a category at 0 is
          // never mistaken for an honest zero.
          <p className="fa-state-warning" role="status">
            {t('filesApp.state.partial', { sources: failed.map((f) => f.source).join(', ') })}
          </p>
        ) : null}
        <VirtualList
          items={visible}
          itemHeight={ROW_HEIGHT}
          className="fa-rows"
          getKey={(item) => item.id}
          renderItem={renderRow}
          gridRole="rowgroup"
          emptyState={
            <p className="fa-state">
              {t(query.trim() ? 'filesApp.state.noMatches' : 'filesApp.state.empty')}
            </p>
          }
        />
      </div>
    );
  })();

  /* ------------------------- inspector -------------------------- */

  const inspector = selected ? (
    <div className="fa-details">
      <h2 className="fa-details-title">{selected.name}</h2>
      <dl className="fa-details-list">
        <dt>{t('filesApp.column.kind')}</dt>
        <dd>{t(`filesApp.kind.${selected.kind}`)}</dd>
        <dt>{t('filesApp.column.provenance')}</dt>
        <dd data-machine={isMachineDerived(selected.provenance) ? 'true' : undefined}>
          {t(`filesApp.provenance.${selected.provenance}`)}
        </dd>
        <dt>{t('filesApp.column.size')}</dt>
        <dd>{formatSize(selected.sizeBytes, t)}</dd>
        <dt>{t('filesApp.column.created')}</dt>
        <dd>{formatDate(selected.createdAt)}</dd>
        <dt>{t('filesApp.column.modified')}</dt>
        <dd>{formatDate(selected.modifiedAt)}</dd>
        <dt>{t('filesApp.details.location')}</dt>
        <dd className="fa-details-location">{describeLocation(selected, t)}</dd>
        <dt>{t('filesApp.details.source')}</dt>
        <dd>{selected.source}</dd>
      </dl>
      {revealTargetFor(selected.location) ? (
        <button type="button" className="fa-action" onClick={onReveal}>
          {t('filesApp.action.reveal')}
        </button>
      ) : (
        // Absent rather than present-and-failing: this store has no folder.
        <p className="fa-details-note">{t('filesApp.reveal.notFileBacked')}</p>
      )}
      <p className="fa-details-note">
        {t(`filesApp.delete.mode.${deleteModeFor(selected.location)}`)}
      </p>
      {revealNote ? (
        <p className="fa-details-note" role="status">
          {revealNote}
        </p>
      ) : null}
    </div>
  ) : (
    <p className="fa-state">{t('filesApp.state.noSelection')}</p>
  );

  /* ---------------------------- dock ---------------------------- */

  const dock = (
    <div className="fa-status" role="status">
      <span>{t('filesApp.status.items', { count: visible.length })}</span>
      <span>{t('filesApp.status.size', { size: formatSize(totalSize, t) })}</span>
      {selected ? <span>{t('filesApp.status.selected', { name: selected.name })}</span> : null}
    </div>
  );

  return (
    <LiquidAppScaffold
      className="fa-shell"
      rail={rail}
      railLabel={t('filesApp.tree.label')}
      toolbar={toolbar}
      inspector={inspector}
      inspectorLabel={t('filesApp.details.label')}
      dock={dock}
    >
      {canvas}
    </LiquidAppScaffold>
  );
}

/** Human wording for a location, per store. Never a raw JSON dump. */
function describeLocation(item: FilesItem, t: (k: string, v?: Record<string, string | number>) => string): string {
  const loc = item.location;
  switch (loc.store) {
    case 'file':
      return loc.path;
    case 'sqlite':
      return t('filesApp.location.sqlite', { table: loc.table, database: loc.database });
    case 'json':
      return t('filesApp.location.json', { file: loc.file });
    case 'localStorage':
      return t('filesApp.location.localStorage', { key: loc.key });
    case 'derived':
      return t('filesApp.location.derived');
  }
}

export default FilesApp;
