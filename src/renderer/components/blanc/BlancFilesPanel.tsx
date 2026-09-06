/**
 * Pillar 2 port of the Files app — Study OS section `files` (`AppSection.tsx`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `file-search`. Blanc already ships a `file-search` tool and
 * the coverage manifest is explicit that it is NOT coverage for this section:
 * it is a filename search over a folder the user picks with
 * `toolboxPickSearchFolder`, i.e. a DISK browser. `FILES_APP_PLAN.md`'s
 * Decision 2 is the opposite — the tree is what the APP owns, over
 * heterogeneous stores (real files, SQLite rows, localStorage, main-process
 * JSON, derived readings), never real directories. This panel is that tree.
 *
 * WHAT IT SHARES WITH STUDY OS, AND WHY. Every derivation comes from
 * `shared/filesApp/catalog.ts` and the index from `useFilesIndex` — the same
 * pure core and the same one data hook the Study OS surface uses. A second
 * implementation of "which category is this item in" is how two surfaces come
 * to disagree about the same library. Pillar 0 forbids mounting a Study OS
 * `*View` or importing `AppChrome`/`MenuBar`/`StatusBar`; it does not ask for
 * the domain logic to be rewritten, and rewriting it would be the defect.
 *
 * THE THREE BEHAVIOURS THE PLAN PINS, kept here too:
 *
 * 1. A count of 0 is SHOWN, not hidden. Gate 1 is "a category reading 0 while
 *    items exist is a FINDING", and a tree that drops its empty nodes cannot be
 *    checked for it.
 * 2. Reveal is offered only where it can work. A dictionary is a SQLite row and
 *    has no folder, so the button is absent and the inspector says why in
 *    words, rather than present and failing.
 * 3. A store that failed to load is NAMED. An index that could not be read and
 *    an index that is genuinely empty are different facts; showing the same
 *    empty list for both is the dishonest state rubric category 8 is about.
 *
 * NOT A GATEKEEPER, in the other direction too. Opening is routed through
 * Blanc's own `toolbox:open-tool` bus first — which is cancelable, so this can
 * tell whether Blanc actually claimed the section — and falls back to
 * `openSectionSurface`, the host-agnostic route that pops the section out as a
 * real window. Blanc does not own `os:open`, so the fallback is a working route
 * here and not a dead button. Nothing about the Study OS Files app changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useMemo, useState } from 'react';
import Icon from '../Icons';
import { useT } from '../../i18n';
import { openSectionSurface } from '../../sectionSurface';
import { useFilesIndex } from '../filesapp/useFilesIndex';
import { formatDate, formatSize } from '../filesapp/format';
import {
  FILES_SORT_COLUMNS,
  FILES_TREE,
  categoryContains,
  categoryNode,
  countByCategory,
  isFilesPanelCategory,
  matchesQuery,
  revealTargetFor,
  sortItems,
  type FilesCategoryId,
  type FilesItem,
  type FilesSortColumn,
  type FilesSortDirection,
} from '../../../shared/filesApp/catalog';
import {
  filesOpenDecision,
  isRoutableLocation,
  type FilesOpenDecision,
} from '../../../shared/filesApp/openPlan';

/** What the inspector is currently saying about an Open the user asked for. */
type OpenState =
  | { status: 'idle' }
  | { status: 'routing' }
  | { status: 'settled'; decision: FilesOpenDecision };

/**
 * Route a section to Blanc first, then to the app-wide pop-out.
 *
 * `toolbox:open-tool` is dispatched cancelable and `BlancShell` cancels it at
 * the point it actually acts, which is the DOM's own answer to "did a host take
 * this". A section id that is also a Blanc tool id — `dictionary`, `grammar`,
 * `novels`, `translate`, `games`, `visualizer`, `music`, `immersion`,
 * `calendar`, `resources`, `files` — is claimed and stays inside Blanc. The
 * rest fall through to `openSectionSurface`, which opens a real window. No
 * second routing table: the two id spaces already coincide where they can, and
 * a table would be a copy that drifts.
 */
function routeSectionFromBlanc(section: string): void {
  const claimed = !window.dispatchEvent(
    new CustomEvent('toolbox:open-tool', { detail: section, cancelable: true }),
  );
  if (!claimed) openSectionSurface(section);
}

export function BlancFilesPanel() {
  const { t, lang } = useT();
  const { state, refresh, refreshing } = useFilesIndex();
  const [scope, setScope] = useState<FilesCategoryId | null>(null);
  const [query, setQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<FilesSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<FilesSortDirection>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealNote, setRevealNote] = useState<string | null>(null);
  const [openState, setOpenState] = useState<OpenState>({ status: 'idle' });

  const items = state.status === 'ready' ? state.snapshot.items : [];

  // Counted from the items rather than read off the snapshot so the rail cannot
  // disagree with the list beside it, and so every node is present including
  // the empty ones.
  const counts = useMemo(() => countByCategory(items), [items]);
  const countOf = useCallback(
    (id: FilesCategoryId): number => counts.find((c) => c.categoryId === id)?.total ?? 0,
    [counts],
  );

  const visible = useMemo(() => {
    const scoped = scope
      ? items.filter((item) => categoryContains(scope, item.categoryId))
      : items;
    const searched = query.trim() ? scoped.filter((item) => matchesQuery(item, query)) : scoped;
    return sortItems(searched, sortColumn, sortDirection);
  }, [items, scope, query, sortColumn, sortDirection]);

  const selected = visible.find((item) => item.id === selectedId) ?? null;

  const choose = useCallback((item: FilesItem) => {
    setSelectedId(item.id);
    setRevealNote(null);
    setOpenState({ status: 'idle' });
  }, []);

  const onReveal = useCallback(async () => {
    if (!selected) return;
    const result = await window.api?.filesReveal?.(selected.location);
    setRevealNote(!result || result.ok ? null : t(result.reasonKey ?? 'filesApp.reveal.notFileBacked'));
  }, [selected, t]);

  /**
   * Both open paths settle HERE and nowhere else.
   *
   * They did not, at first, and driving the surface caught it: the
   * non-routable branch computed its decision and only rendered it, so opening
   * a SQLite dictionary row printed "Opened by what this item is" and opened
   * nothing. A row with no file is exactly the row whose only route is the
   * kind table, so that branch was the one that most needed to act.
   */
  const settle = useCallback((decision: FilesOpenDecision) => {
    setOpenState({ status: 'settled', decision });
    if (decision.mode === 'open') routeSectionFromBlanc(decision.section);
  }, []);

  const onOpen = useCallback(async () => {
    if (!selected) return;
    if (!isRoutableLocation(selected.location)) {
      settle(filesOpenDecision(selected, null));
      return;
    }
    setOpenState({ status: 'routing' });
    const plans = await window.api?.fileDropClassify?.([selected.location.path]);
    // A missing plan is NOT downgraded to the kind table: for a file the router
    // is the authority, and guessing from the extension is what sniffing exists
    // to avoid. `filesOpenDecision(item, null)` refuses here.
    settle(filesOpenDecision(selected, plans?.[0] ?? null));
  }, [selected, settle]);

  const railNode = (id: FilesCategoryId): JSX.Element | null => {
    const node = categoryNode(id);
    if (!node) return null;
    return (
      <button
        key={id}
        type="button"
        className={`blanc-files-node${node.isLeaf ? ' is-leaf' : ''}${scope === id ? ' active' : ''}`}
        aria-pressed={scope === id}
        onClick={() => setScope(scope === id ? null : id)}
      >
        <span>{t(node.labelKey)}</span>
        {/* The two panel categories hold no enumerable rows, so a count of 0
            would be an honest number answering the wrong question. Every other
            node keeps its count, zero included — that is gate 1's instrument. */}
        {isFilesPanelCategory(id) ? null : <em>{countOf(id)}</em>}
      </button>
    );
  };

  const body = (): JSX.Element => {
    if (state.status === 'loading') return <p className="blanc-note">{t('filesApp.state.loading')}</p>;
    if (state.status === 'unavailable') {
      return <p className="blanc-note blanc-files-error">{t('filesApp.state.unavailable')}</p>;
    }
    if (state.status === 'error') {
      return (
        <div className="blanc-files-error">
          <p>{t('filesApp.state.error')}</p>
          <p className="blanc-note">{state.error}</p>
          <button type="button" onClick={refresh}>
            {t('filesApp.action.retry')}
          </button>
        </div>
      );
    }
    const failed = state.snapshot.enumerators.filter((r) => r.error);
    return (
      <>
        {failed.length > 0 && (
          // A store that could not be read is named, so a category at 0 is
          // never mistaken for an honest zero.
          <p className="blanc-note blanc-files-warning" role="status">
            {t('filesApp.state.partial', { sources: failed.map((f) => f.source).join(', ') })}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="blanc-note">
            {t(query.trim() ? 'filesApp.state.noMatches' : 'filesApp.state.empty')}
          </p>
        ) : (
          <ul className="blanc-files-list" aria-label={t('filesApp.list.label')}>
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`blanc-files-row${selectedId === item.id ? ' active' : ''}`}
                  aria-current={selectedId === item.id}
                  onClick={() => choose(item)}
                >
                  <span className="blanc-files-name">{item.name}</span>
                  <span className="blanc-files-kind">{t(`filesApp.kind.${item.kind}`)}</span>
                  <span className="blanc-files-size">{formatSize(item.sizeBytes, t, lang)}</span>
                  <span className="blanc-files-date">{formatDate(item.modifiedAt, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const openResult = (): JSX.Element | null => {
    if (openState.status === 'idle') return null;
    if (openState.status === 'routing') return <p className="blanc-note">{t('filesApp.action.opening')}</p>;
    const { decision } = openState;
    if (decision.mode === 'refuse') return <p className="blanc-note">{t(decision.reasonKey)}</p>;
    if (decision.mode === 'choose') return <p className="blanc-note">{t('filesApp.open.choose')}</p>;
    return (
      <p className="blanc-note">
        {t(decision.reasonKey)}
        {decision.sniffed ? ` ${t('filesApp.open.sniffed')}` : ''}
      </p>
    );
  };

  return (
    <div className="blanc-tool-detail blanc-files">
      <fieldset>
        <legend>{t('filesApp.search.label')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('filesApp.search.placeholder')}
            aria-label={t('filesApp.search.label')}
          />
          <select
            value={sortColumn}
            aria-label={t('filesApp.sort.label')}
            onChange={(event) => setSortColumn(event.target.value as FilesSortColumn)}
          >
            {FILES_SORT_COLUMNS.map((column) => (
              <option key={column} value={column}>
                {t(`filesApp.column.${column}`)}
              </option>
            ))}
          </select>
          {/* Same convention as the Study OS surface: the label names the
              CURRENT order, not the action, so the two never describe the same
              state in opposite words. */}
          <button
            type="button"
            className="blanc-files-sort-dir"
            aria-label={t(sortDirection === 'asc' ? 'filesApp.sort.asc' : 'filesApp.sort.desc')}
            onClick={() => setSortDirection((d: FilesSortDirection) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
          <button type="button" disabled={refreshing} onClick={refresh}>
            <Icon name="refresh" size={12} />
            {t(refreshing ? 'filesApp.action.refreshing' : 'filesApp.action.refresh')}
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{t('filesApp.status.items', { count: visible.length })}</span>
          {selected && <span>{t('filesApp.status.selected', { name: selected.name })}</span>}
        </div>
      </fieldset>

      <div className="blanc-files-workbench">
        <aside className="blanc-files-rail" aria-label={t('filesApp.tree.label')}>
          <button
            type="button"
            className={`blanc-files-node${scope === null ? ' active' : ''}`}
            aria-pressed={scope === null}
            onClick={() => setScope(null)}
          >
            <span>{t('filesApp.tree.everything')}</span>
            <em>{items.length}</em>
          </button>
          {FILES_TREE.map((node) => railNode(node.id))}
        </aside>

        <main className="blanc-files-main">{body()}</main>

        <aside className="blanc-files-inspector" aria-label={t('filesApp.details.label')}>
          {!selected ? (
            <p className="blanc-note">{t('filesApp.state.noSelection')}</p>
          ) : (
            <>
              <h4>{selected.name}</h4>
              <dl>
                <dt>{t('filesApp.column.kind')}</dt>
                <dd>{t(`filesApp.kind.${selected.kind}`)}</dd>
                <dt>{t('filesApp.column.provenance')}</dt>
                <dd>{t(`filesApp.provenance.${selected.provenance}`)}</dd>
                <dt>{t('filesApp.column.size')}</dt>
                <dd>{formatSize(selected.sizeBytes, t, lang)}</dd>
                <dt>{t('filesApp.column.modified')}</dt>
                <dd>{formatDate(selected.modifiedAt, lang)}</dd>
                <dt>{t('filesApp.details.location')}</dt>
                <dd>{describeLocation(selected, t)}</dd>
                <dt>{t('filesApp.details.source')}</dt>
                <dd>{selected.source}</dd>
              </dl>
              <div className="blanc-row-actions">
                <button type="button" onClick={onOpen} disabled={openState.status === 'routing'}>
                  {t(openState.status === 'routing' ? 'filesApp.action.opening' : 'filesApp.action.open')}
                </button>
                {revealTargetFor(selected.location) ? (
                  <button type="button" onClick={() => void onReveal()}>
                    {t('filesApp.action.reveal')}
                  </button>
                ) : null}
              </div>
              {/* Absent rather than present-and-failing: this store has no
                  folder, and the inspector says so instead of the button
                  opening the wrong one. */}
              {revealTargetFor(selected.location) ? null : (
                <p className="blanc-note">{t('filesApp.reveal.notFileBacked')}</p>
              )}
              {revealNote && <p className="blanc-note">{revealNote}</p>}
              {openResult()}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The item's real home, in the words its store deserves. */
function describeLocation(item: FilesItem, t: (k: string, v?: Record<string, string | number>) => string): string {
  const location = item.location;
  switch (location.store) {
    case 'file':
      return location.path;
    case 'sqlite':
      return t('filesApp.location.sqlite', { table: location.table, database: location.database });
    case 'json':
      return t('filesApp.location.json', { file: location.file });
    case 'localStorage':
      return t('filesApp.location.localStorage', { key: location.key });
    case 'derived':
      return t('filesApp.location.derived');
  }
}
