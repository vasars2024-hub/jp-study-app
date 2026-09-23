/**
 * The Library: status tabs, type switch, combinable filters, sort, grid or list,
 * over every title — tracked, on disk, or both.
 *
 * Sort and filters are remembered per status tab (Watching opens on "last
 * watched", Completed on "date finished", each with its own filters), and any
 * combination can be saved as a named view that can also live on Home. The grid
 * virtualizes, so a 1,400-title MyAnimeList import scrolls like a 40-title one.
 */
import { useCallback, useMemo, type KeyboardEvent } from 'react';
import VirtualGrid from '../../VirtualGrid';
import { promptDialog, showToast } from '../../ui';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { LiquidLoading } from '../../liquid/LiquidLoading';
import { useT } from '../../../i18n';
import GumIcon from './GumIcons';
import GumPopover from './GumPopover';
import GumFilterBar from './GumFilters';
import { GumPosterCard } from './GumCards';
import {
  GUM_BADGES,
  POSTER_SIZE_MAX,
  POSTER_SIZE_MIN,
  newSavedViewId,
  pickSort,
  setViewOnHome,
  type GumHomeLayout,
  type GumLibraryPrefs,
  type GumSavedView,
  type GumTabPrefs,
} from './gumLayout';
import {
  GUM_SORT_KEYS,
  GUM_SOURCES,
  GUM_STATUS_TABS,
  GUM_TYPES,
  activeFilterChips,
  countByStatus,
  filterGumTitles,
  gumFacets,
  hasGumFilters,
  removeFilterChip,
  sortGumTitles,
  type GumFilters,
  type GumSource,
  type GumTitle,
} from './gumModel';

const GRID_GAP = 20;
const CAPTION_HEIGHT = 50;
const LIST_ROW = 76;

export interface GumLibraryProps {
  titles: GumTitle[];
  loading: boolean;
  /** The top bar's search, already committed. Filters instantly. */
  search: string;
  prefs: GumLibraryPrefs;
  setPrefs: (next: GumLibraryPrefs | ((current: GumLibraryPrefs) => GumLibraryPrefs)) => void;
  savedViews: GumSavedView[];
  setSavedViews: (next: GumSavedView[] | ((current: GumSavedView[]) => GumSavedView[])) => void;
  homeLayout: GumHomeLayout;
  setHomeLayout: (next: GumHomeLayout | ((current: GumHomeLayout) => GumHomeLayout)) => void;
  onOpenTitle: (title: GumTitle) => void;
  onPlayTitle: (title: GumTitle) => void;
  onClearSearch: () => void;
  onImport: () => void;
  onAddFolder: () => void;
}

export default function GumLibrary({
  titles,
  loading,
  search,
  prefs,
  setPrefs,
  savedViews,
  setSavedViews,
  homeLayout,
  setHomeLayout,
  onOpenTitle,
  onPlayTitle,
  onClearSearch,
  onImport,
  onAddFolder,
}: GumLibraryProps) {
  const { t, lang } = useT();
  const tab = prefs.byStatus[prefs.status];
  const setTab = useCallback((next: (current: GumTabPrefs) => GumTabPrefs) => {
    setPrefs((current) => ({
      ...current,
      byStatus: { ...current.byStatus, [current.status]: next(current.byStatus[current.status]) },
    }));
  }, [setPrefs]);
  const setFilters = useCallback((filters: GumFilters) => setTab((current) => ({ ...current, filters })), [setTab]);

  const counts = useMemo(() => countByStatus(titles, prefs.type, search), [titles, prefs.type, search]);
  const facets = useMemo(() => gumFacets(titles), [titles]);
  const sourceCounts = useMemo(() => {
    const out: Partial<Record<GumSource, number>> = {};
    for (const title of titles) for (const source of title.sources) out[source] = (out[source] ?? 0) + 1;
    return out;
  }, [titles]);
  const presentSources = GUM_SOURCES.filter((source) => (sourceCounts[source] ?? 0) > 0);

  const visible = useMemo(() => {
    const matched = filterGumTitles(titles, { status: prefs.status, type: prefs.type, search, filters: tab.filters }, Date.now());
    return sortGumTitles(matched, tab.sort, tab.dir);
  }, [titles, prefs.status, prefs.type, search, tab]);

  const summary = useMemo(() => {
    const onDiskEpisodes = titles.reduce((sum, title) => sum + title.items.length, 0);
    const sources = new Set<string>();
    for (const title of titles) {
      for (const source of title.sources) {
        if (source === 'mal-export' || source === 'mal-sync') sources.add('mal');
        else if (source === 'letterboxd') sources.add('letterboxd');
        else sources.add('files');
      }
    }
    // Product names are not translated; "your files" is.
    const names = ['files', 'mal', 'letterboxd'].filter((source) => sources.has(source))
      .map((source) => (source === 'files' ? t('gum.library.from.files') : source === 'mal' ? 'MyAnimeList' : 'Letterboxd'));
    return [
      t('gum.library.titleCount', { count: titles.length }),
      t('gum.library.onDiskCount', { count: onDiskEpisodes }),
      names.length ? t('gum.library.from', { sources: names.join(', ') }) : null,
    ].filter(Boolean).join(' · ');
  }, [titles, lang]);

  const chips = activeFilterChips(tab.filters);
  const chipLabel = (chip: ReturnType<typeof activeFilterChips>[number]): string => {
    if (!chip.key) return chip.label ?? chip.id;
    const vars = chip.vars?.period ? { ...chip.vars, period: t(`gum.filter.period.${chip.vars.period}`) } : chip.vars;
    return t(chip.key, vars);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const last = GUM_STATUS_TABS.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + GUM_STATUS_TABS.length) % GUM_STATUS_TABS.length;
    setPrefs((current) => ({ ...current, status: GUM_STATUS_TABS[next] }));
    const tabs = (event.currentTarget.parentElement?.querySelectorAll('[role="tab"]') ?? []) as NodeListOf<HTMLElement>;
    tabs[next]?.focus();
  };

  const saveView = async (): Promise<void> => {
    const name = (await promptDialog({
      title: t('gum.views.saveTitle'),
      message: t('gum.views.saveMessage'),
      placeholder: t('gum.views.placeholder'),
      okLabel: t('gum.views.save'),
    }))?.trim();
    if (!name) return;
    const view: GumSavedView = {
      id: newSavedViewId(savedViews, Date.now()),
      name,
      status: prefs.status,
      type: prefs.type,
      sort: tab.sort,
      dir: tab.dir,
      filters: tab.filters,
      createdAt: Date.now(),
    };
    setSavedViews((current) => [...current, view]);
    showToast({ message: t('gum.views.saved', { name }), kind: 'success' });
  };

  const applyView = (view: GumSavedView): void => {
    setPrefs((current) => ({
      ...current,
      status: view.status,
      type: view.type,
      byStatus: { ...current.byStatus, [view.status]: { sort: view.sort, dir: view.dir, filters: view.filters } },
    }));
  };

  const removeView = (view: GumSavedView): void => {
    setSavedViews((current) => current.filter((entry) => entry.id !== view.id));
    setHomeLayout((current) => setViewOnHome(current, view.id, false));
  };

  const renderCard = useCallback((title: GumTitle) => (
    <GumPosterCard
      title={title}
      badges={prefs.badges}
      layout={prefs.view === 'list' ? 'row' : 'card'}
      onOpen={onOpenTitle}
      onPlay={onPlayTitle}
    />
  ), [prefs.badges, prefs.view, onOpenTitle, onPlayTitle]);

  const filtered = hasGumFilters(tab.filters) || search.trim() !== '';

  return (
    <div className="gum-page gum-library" style={{ '--gum-poster-w': `${prefs.posterSize}px` } as React.CSSProperties}>
      <header className="gum-library__head">
        <div>
          <h1>{t('gum.library.title')}</h1>
          <p className="gum-muted">{summary}</p>
        </div>
        <div className="gum-seg gum-seg--solid" role="radiogroup" aria-label={t('gum.library.type')}>
          {GUM_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              role="radio"
              aria-checked={prefs.type === type}
              onClick={() => setPrefs((current) => ({ ...current, type }))}
            >
              {t(`gum.typeTab.${type}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="gum-tabs" role="tablist" aria-label={t('gum.library.status')}>
        {GUM_STATUS_TABS.map((status, index) => (
          <button
            type="button"
            key={status}
            role="tab"
            id={`gum-tab-${status}`}
            aria-selected={prefs.status === status}
            aria-controls="gum-library-results"
            tabIndex={prefs.status === status ? 0 : -1}
            onKeyDown={(event) => onTabKey(event, index)}
            onClick={() => setPrefs((current) => ({ ...current, status }))}
          >
            {status === 'all' ? t('gum.status.all') : t(`watchLibrary.status.${status}`)}
            <span className="gum-tabs__count">{counts[status]}</span>
          </button>
        ))}
      </div>

      <ContextualSurface className="gum-toolbar">
        <GumFilterBar
          filters={tab.filters}
          facets={facets}
          sources={presentSources.length ? presentSources : ['files']}
          sourceCounts={sourceCounts}
          onChange={setFilters}
        />
        <div className="gum-toolbar__spacer" />
        {savedViews.length > 0 && (
          <GumPopover label={<span>{t('gum.views.label')}</span>} align="end" wide>
            {(close) => (
              <ul className="gum-menu" aria-label={t('gum.views.label')}>
                {savedViews.map((view) => {
                  const onHome = homeLayout.order.includes(`view:${view.id}`);
                  return (
                    <li key={view.id} className="gum-menu__row">
                      <button type="button" className="gum-menu__item" onClick={() => { applyView(view); close(); }}>{view.name}</button>
                      <label className="gum-menu__check">
                        <input
                          type="checkbox"
                          checked={onHome}
                          onChange={(event) => setHomeLayout((current) => setViewOnHome(current, view.id, event.target.checked))}
                        />
                        <span>{t('gum.views.onHome')}</span>
                      </label>
                      <button type="button" className="gum-icon-btn" onClick={() => removeView(view)} aria-label={t('gum.views.delete', { name: view.name })}>
                        <GumIcon name="close" size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </GumPopover>
        )}
        <GumPopover
          label={<span><GumIcon name="sort" size={14} /> {t('gum.sort.label', { key: t(`gum.sort.${tab.sort}`) })}</span>}
          ariaLabel={t('gum.sort.aria', { key: t(`gum.sort.${tab.sort}`), dir: t(`gum.sort.dir.${tab.dir}`) })}
          align="end"
        >
          {(close) => (
            <div className="gum-menu" role="group" aria-label={t('gum.sort.menu')}>
              {GUM_SORT_KEYS.map((key) => (
                <button
                  type="button"
                  key={key}
                  className="gum-menu__item"
                  aria-pressed={tab.sort === key}
                  onClick={() => setTab((current) => pickSort(current, key))}
                >
                  <span>{t(`gum.sort.${key}`)}</span>
                  {tab.sort === key && (
                    <em>
                      <GumIcon name={tab.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />
                      <span className="gum-sr">{t(`gum.sort.dir.${tab.dir}`)}</span>
                    </em>
                  )}
                </button>
              ))}
              <div className="gum-menu__foot">
                <button type="button" className="gum-btn gum-btn--quiet" onClick={() => { setTab((current) => ({ ...current, dir: current.dir === 'asc' ? 'desc' : 'asc' })); close(); }}>
                  {t('gum.sort.flip')}
                </button>
              </div>
            </div>
          )}
        </GumPopover>
        <div className="gum-seg gum-seg--icons" role="radiogroup" aria-label={t('gum.library.view')}>
          <button type="button" role="radio" aria-checked={prefs.view === 'grid'} aria-label={t('gum.library.viewGrid')} onClick={() => setPrefs((current) => ({ ...current, view: 'grid' }))}>
            <GumIcon name="grid" size={14} />
          </button>
          <button type="button" role="radio" aria-checked={prefs.view === 'list'} aria-label={t('gum.library.viewList')} onClick={() => setPrefs((current) => ({ ...current, view: 'list' }))}>
            <GumIcon name="list" size={14} />
          </button>
        </div>
        <GumPopover label={<span><GumIcon name="sliders" size={14} /> {t('gum.customise.open')}</span>} align="end">
          {() => (
            <div className="gum-fpanel">
              <label className="gum-slider">
                <span>{t('gum.library.posterSize')}</span>
                <input
                  type="range"
                  min={POSTER_SIZE_MIN}
                  max={POSTER_SIZE_MAX}
                  step={4}
                  value={prefs.posterSize}
                  onChange={(event) => setPrefs((current) => ({ ...current, posterSize: Number(event.target.value) }))}
                />
              </label>
              <fieldset className="gum-fgroup">
                <legend>{t('gum.library.badges')}</legend>
                <div className="gum-fgroup__choices">
                  {GUM_BADGES.map((badge) => (
                    <label key={badge} className="gum-check">
                      <input
                        type="checkbox"
                        checked={prefs.badges[badge]}
                        onChange={(event) => setPrefs((current) => ({ ...current, badges: { ...current.badges, [badge]: event.target.checked } }))}
                      />
                      <span>{t(`gum.badgeToggle.${badge}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </GumPopover>
      </ContextualSurface>

      <div className="gum-active" aria-live="polite">
        <span className="gum-active__count">{t('gum.library.resultCount', { count: visible.length })}</span>
        {search.trim() && (
          <button type="button" className="gum-chip" onClick={onClearSearch}>
            {t('gum.chip.search', { query: search.trim() })}
            <GumIcon name="close" size={11} />
            <span className="gum-sr">{t('gum.chip.remove')}</span>
          </button>
        )}
        {chips.map((chip) => (
          <button type="button" key={chip.id} className="gum-chip" onClick={() => setFilters(removeFilterChip(tab.filters, chip.id))}>
            {chipLabel(chip)}
            <GumIcon name="close" size={11} />
            <span className="gum-sr">{t('gum.chip.remove')}</span>
          </button>
        ))}
        {chips.length > 0 && (
          <>
            <button type="button" className="gum-link" onClick={() => setFilters({})}>{t('gum.chip.clearAll')}</button>
            <button type="button" className="gum-link" onClick={() => void saveView()}>{t('gum.views.saveButton')}</button>
          </>
        )}
      </div>

      <div id="gum-library-results" role="tabpanel" aria-labelledby={`gum-tab-${prefs.status}`} className="gum-library__results">
        {loading && titles.length === 0 ? (
          <LiquidLoading layout="library" />
        ) : visible.length === 0 ? (
          <div className="gum-empty" role="status">
            {titles.length === 0 ? (
              <>
                <strong>{t('gum.empty.title')}</strong>
                <p>{t('gum.empty.detail')}</p>
                <div className="gum-empty__actions">
                  <button type="button" className="gum-btn gum-btn--primary" onClick={onAddFolder}>{t('gum.empty.addFolder')}</button>
                  <button type="button" className="gum-btn gum-btn--ghost" onClick={onImport}>{t('gum.empty.import')}</button>
                </div>
              </>
            ) : filtered ? (
              <>
                <strong>{t('gum.library.noMatch')}</strong>
                <div className="gum-empty__actions">
                  <button type="button" className="gum-btn gum-btn--ghost" onClick={() => { setFilters({}); onClearSearch(); }}>{t('gum.chip.clearAll')}</button>
                </div>
              </>
            ) : (
              <strong>{t(`gum.library.emptyTab.${prefs.status}`)}</strong>
            )}
          </div>
        ) : (
          <VirtualGrid
            items={visible}
            className={`gum-grid gum-grid--${prefs.view}`}
            minColWidth={prefs.view === 'list' ? 520 : prefs.posterSize}
            maxColWidth={prefs.view === 'list' ? undefined : Math.round(prefs.posterSize * 1.3)}
            gap={prefs.view === 'list' ? 8 : GRID_GAP}
            rowHeight={prefs.view === 'list' ? LIST_ROW : (width) => Math.round(width * 1.5) + CAPTION_HEIGHT + GRID_GAP + 6}
            getKey={(title) => title.id}
            renderItem={renderCard}
          />
        )}
      </div>
    </div>
  );
}
