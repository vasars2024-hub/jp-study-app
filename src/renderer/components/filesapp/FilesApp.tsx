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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import { LiquidAppScaffold } from '../liquid/LiquidAppScaffold';
import VirtualList from '../VirtualList';
import {
  FILES_SORT_COLUMNS,
  FILES_TREE,
  categoryContains,
  categoryNode,
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
import {
  FILES_MINE_MAX_CARDS,
  buildFilesMineDrafts,
  existingDeckKeys,
  mineabilityOf,
} from '../../../shared/filesApp/mining';
import { addDeckCardsTracked, loadDeck, removeDeckCards } from '../../flashcardDeck';
import {
  FILES_SCOPE_EVENT,
  clearPendingFilesScope,
  peekPendingFilesScope,
  type FilesScopeRequest,
} from './filesAppScope';
import { useFilesIndex } from './useFilesIndex';
import './filesApp.css';

const ROW_HEIGHT = 32;

type Translate = (k: string, v?: Record<string, string | number>) => string;

/**
 * Bytes, rendered with the unit the number actually deserves.
 *
 * `lang` is threaded in rather than read from the OS: a bare `toLocaleString()`
 * formats digits and separators in the SYSTEM locale, which is independent of
 * the UI-language setting, so a Japanese UI on a German machine renders
 * `1.234,5`. `LANG_TAGS[lang]` is the same mapping `core.ts` uses for plural
 * rules and number formatting, so all three agree.
 */
function formatSize(bytes: number | null, t: Translate, lang: UiLang): string {
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
  return t(units[unit], { n: shown.toLocaleString(LANG_TAGS[lang]) });
}

function formatDate(ms: number | null, lang: UiLang): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleString(LANG_TAGS[lang]);
}

/**
 * The one-click mine's outcome, as a state rather than a string.
 *
 * A refusal and a zero-card success are DIFFERENT states and the plan calls
 * conflating them a finding, so `refused` carries a reason key while `done`
 * carries the four counts. Both render; neither is silent.
 */
type MineState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'refused'; reasonKey: string; detail?: string; values?: Record<string, number> }
  | {
      status: 'done';
      added: number;
      passagesRead: number;
      skippedNotJapanese: number;
      skippedDuplicate: number;
      skippedOverCap: number;
      machineDerived: boolean;
      addedIds: string[];
    }
  | { status: 'undone'; count: number };

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

  /**
   * Gate 5's entry. An explicit prop wins — a caller that mounted this
   * component with a scope means it — and otherwise the scope a `openFilesApp*`
   * gesture parked on its way here applies.
   *
   * `peekPendingFilesScope` is PURE, which is what makes it safe in a lazy
   * initialiser: React double-invokes those in StrictMode, and a consuming read
   * would hand the second call `null` and lose the scope. The clearing happens
   * in the effect below, where running twice is harmless.
   */
  const [entryScope] = useState<FilesScopeRequest | null>(peekPendingFilesScope);
  const [scope, setScope] = useState<FilesCategoryId | null>(
    initialScope ?? entryScope?.categoryId ?? null,
  );
  const [query, setQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<FilesSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<FilesSortDirection>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusItemId ?? entryScope?.focusItemId ?? null,
  );
  const [revealNote, setRevealNote] = useState<string | null>(null);
  /**
   * The last mine's outcome. `addedIds` is what makes it reversible — the plan
   * requires a reversible action, and `addDeckCardsTracked` hands back exactly
   * the new rows so undo removes those and nothing that happened to match.
   */
  const [mineState, setMineState] = useState<MineState>({ status: 'idle' });

  /**
   * The scope was read above; taking it is this effect's job, so the next plain
   * open of the Files app does not silently inherit the last caller's filter.
   *
   * The listener is the other half of gate 5: a scoped-open gesture aimed at a
   * window that is ALREADY on screen re-renders nothing, so without it the same
   * button works once and then appears dead.
   */
  useEffect(() => {
    clearPendingFilesScope();
    const onScope = (event: Event) => {
      const detail = (event as CustomEvent<FilesScopeRequest | null>).detail;
      if (!detail) return;
      clearPendingFilesScope();
      setScope(detail.categoryId);
      setSelectedId(detail.focusItemId ?? null);
      // A scope arriving on an open window must not land inside a stale search:
      // the caller asked for a folder, not for a folder minus whatever was typed.
      setQuery('');
    };
    window.addEventListener(FILES_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(FILES_SCOPE_EVENT, onScope);
  }, []);

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

  /**
   * Gate 3, the whole round trip: main reads the file into passages, `shared/`
   * turns passages into drafts, and the renderer — the only owner of the deck —
   * writes them. No card is invented here that the source did not carry.
   */
  const onMine = useCallback(async () => {
    if (!selected) return;
    const mineable = mineabilityOf(selected);
    if (!mineable.mineable) {
      setMineState({ status: 'refused', reasonKey: mineable.reasonKey });
      return;
    }
    setMineState({ status: 'reading' });
    const kind = selected.kind as 'transcript' | 'subtitle' | 'book';
    const read = await window.api?.filesMineSource?.(selected.location, kind);
    if (!read) {
      setMineState({ status: 'refused', reasonKey: 'filesApp.mine.refuse.unreadable' });
      return;
    }
    if (!read.ok) {
      setMineState({ status: 'refused', reasonKey: read.reasonKey, detail: read.detail });
      return;
    }
    const plan = buildFilesMineDrafts(selected, read.passages, {
      existingWords: existingDeckKeys(loadDeck().map((card) => card.sentence || card.word)),
    });
    if (plan.drafts.length === 0) {
      // Two different empty results, told apart rather than merged: nothing was
      // Japanese, or everything was already mined. They need opposite actions.
      setMineState({
        status: 'refused',
        reasonKey:
          plan.skippedDuplicate > 0
            ? 'filesApp.mine.refuse.allDuplicates'
            : 'filesApp.mine.refuse.noJapanese',
        values: { read: plan.passagesRead },
      });
      return;
    }
    const created = addDeckCardsTracked(plan.drafts);
    setMineState({
      status: 'done',
      added: created.length,
      passagesRead: plan.passagesRead,
      skippedNotJapanese: plan.skippedNotJapanese,
      skippedDuplicate: plan.skippedDuplicate,
      skippedOverCap: plan.skippedOverCap,
      machineDerived: isMachineDerived(selected.provenance),
      addedIds: created.map((card) => card.id),
    });
  }, [selected]);

  // Read outside the updater deliberately: React double-invokes state updaters
  // in StrictMode, and a deck write is not something to run twice.
  const onUndoMine = useCallback(() => {
    if (mineState.status !== 'done') return;
    removeDeckCards(mineState.addedIds);
    setMineState({ status: 'undone', count: mineState.addedIds.length });
  }, [mineState]);

  /** A new selection invalidates the previous item's result, never carries it over. */
  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
    setMineState({ status: 'idle' });
    setRevealNote(null);
  }, []);

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
        <span className="fa-tree-count">{allItems.length.toLocaleString(LANG_TAGS[lang])}</span>
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
          <span className="fa-tree-count">{countFor(node.id).toLocaleString(LANG_TAGS[lang])}</span>
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
      {/* Gate 5: a narrowed list has to say it is narrowed. Without this the
          same window shows a fraction of the tree and reads as a broken index
          rather than as a filter someone asked for — and the way out is stated
          in the same sentence rather than left to be discovered in the rail. */}
      {scope ? (
        <button
          type="button"
          className="fa-scope-clear"
          onClick={() => setScope(null)}
          title={t('filesApp.entry.scoped', {
            category: t(categoryNode(scope)?.labelKey ?? 'filesApp.tree.everything'),
          })}
        >
          {t('filesApp.entry.scoped', {
            category: t(categoryNode(scope)?.labelKey ?? 'filesApp.tree.everything'),
          })}
        </button>
      ) : null}
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
          // Written inline, like every other VirtualList call site in this
          // tree. `virtualListSemantics` reads the OPENING TAG to check that a
          // windowed collection declares itself, so a role hidden in an
          // extracted callback is invisible to it -- and a useCallback bought
          // nothing here anyway: VirtualList calls renderItem during its own
          // render and memoises on items, not on this.
          renderItem={(item: FilesItem, index: number) => (
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
            onClick={() => selectItem(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectItem(item.id);
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
              {formatSize(item.sizeBytes, t, lang)}
            </span>
            <span role="gridcell" className="fa-cell fa-cell-modified">
              {formatDate(item.modifiedAt, lang)}
            </span>
          </div>
          )}
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

  const mineability = selected ? mineabilityOf(selected) : null;

  /**
   * The mine's receipt. Every state reports NUMBERS — the plan's rule is
   * numbers, never adjectives — and each skip bucket is named separately so a
   * small `added` is explained rather than merely small.
   */
  const mineResult = (() => {
    if (mineState.status === 'refused') {
      return (
        <p className="fa-details-note fa-mine-refusal" role="status">
          {t(mineState.reasonKey, mineState.values)}
          {mineState.detail ? <span className="fa-state-detail"> {mineState.detail}</span> : null}
        </p>
      );
    }
    if (mineState.status === 'undone') {
      return (
        <p className="fa-details-note" role="status">
          {t('filesApp.mine.undone', { count: mineState.count })}
        </p>
      );
    }
    if (mineState.status !== 'done') return null;
    const skipped = mineState.skippedNotJapanese + mineState.skippedDuplicate;
    return (
      <div className="fa-mine-result" role="status">
        <p>
          {t('filesApp.mine.added', {
            count: mineState.added,
            read: mineState.passagesRead,
          })}
        </p>
        {skipped > 0 ? (
          <p className="fa-details-note">
            {t('filesApp.mine.skipped', {
              notJapanese: mineState.skippedNotJapanese,
              duplicate: mineState.skippedDuplicate,
            })}
          </p>
        ) : null}
        {mineState.skippedOverCap > 0 ? (
          <p className="fa-details-note">
            {t('filesApp.mine.capped', {
              max: FILES_MINE_MAX_CARDS,
              overCap: mineState.skippedOverCap,
            })}
          </p>
        ) : null}
        {/* The binding constraint, visible where the cards were made — not only
            on the card itself, where a user who never opens the deck never sees it. */}
        {mineState.machineDerived ? (
          <p className="fa-details-note" data-machine="true">
            {t('filesApp.mine.machineMark')}
          </p>
        ) : null}
        <button type="button" className="fa-action fa-action-undo" onClick={onUndoMine}>
          {t('filesApp.action.undoMine')}
        </button>
      </div>
    );
  })();

  const inspector = selected && mineability ? (
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
        <dd>{formatSize(selected.sizeBytes, t, lang)}</dd>
        <dt>{t('filesApp.column.created')}</dt>
        <dd>{formatDate(selected.createdAt, lang)}</dd>
        <dt>{t('filesApp.column.modified')}</dt>
        <dd>{formatDate(selected.modifiedAt, lang)}</dd>
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
      {/* Gate 3. Offered only where text can actually be read; where it cannot,
          the reason is stated rather than the button being present and failing. */}
      {mineability.mineable ? (
        <button
          type="button"
          className="fa-action fa-action-mine"
          onClick={onMine}
          disabled={mineState.status === 'reading'}
        >
          {t(mineState.status === 'reading' ? 'filesApp.action.mining' : 'filesApp.action.mine')}
        </button>
      ) : (
        <p className="fa-details-note fa-mine-refusal">{t(mineability.reasonKey)}</p>
      )}
      {mineResult}
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
      <span>{t('filesApp.status.size', { size: formatSize(totalSize, t, lang) })}</span>
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
