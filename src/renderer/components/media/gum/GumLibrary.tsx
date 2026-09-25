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
  GUM_RATING_DISPLAYS,
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

/** Module-level so the grid's row memo is not defeated by a new function each render. */
const titleKey = (title: GumTitle): string => title.id;

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
  // "1,418" / "1 418" in the UI language, not a bare number.
  const countFormat = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const facets = useMemo(() => gumFacets(titles), [titles]);
  const sourceCounts = useMemo(() => {
    const out: Partial<Record<GumSource, number>> = {};
    for (const title of titles) for (const source of title.sources) out[source] = (out[source] ?? 0) + 1;
    return out;
  }, [titles]);
  const presentSources = GUM_SOURCES.filter((source) => (sourceCounts[source] ?? 0) > 0);

  // Sorted once per (library, sort, direction) and then filtered — filtering keeps the
  // order — so switching status tab or typing a search does not re-sort 1,400 titles
  // with a collator every time. The cache is dropped with the library it sorted.
  const sortCache = useMemo(() => new Map<string, GumTitle[]>(), [titles]);
  const sorted = useMemo(() => {
    const key = `${tab.sort}:${tab.dir}`;
    let list = sortCache.get(key);
    if (!list) {
      list = sortGumTitles(titles, tab.sort, tab.dir);
      sortCache.set(key, list);
    }
    return list;
  }, [sortCache, titles, tab.sort, tab.dir]);
  const visible = useMemo(
    () => filterGumTitles(sorted, { status: prefs.status, type: prefs.type, search, filters: tab.filters }, Date.now()),
    [sorted, prefs.status, prefs.type, search, tab.filters],
  );

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
    let value: string;
    if (!chip.key) value = chip.label ?? chip.id;
    else {
      const vars = chip.vars?.period ? { ...chip.vars, period: t(`gum.filter.period.${chip.vars.period}`) } : chip.vars;
      value = t(chip.key, vars);
    }
    // "14–26" and "In progress" do not say what they filter; the field template does.
    return chip.field ? t(chip.field, { value }) : value;
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
      ratingDisplay={prefs.ratingDisplay}
      onOpen={onOpenTitle}
      onPlay={onPlayTitle}
    />
  ), [prefs.badges, prefs.view, prefs.ratingDisplay, onOpenTitle, onPlayTitle]);
  const rowHeight = useCallback((width: number) => Math.round(width * 1.5) + CAPTION_HEIGHT + GRID_GAP + 6, []);

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
            <span className="gum-tabs__count">{countFormat.format(counts[status])}</span>
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
        <div className="gum-toolbar__end">
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
        {/* Layout and card options in ONE disclosure, so the toolbar is one row: the grid /
            list toggle and a separate Customise used to wrap onto a second row that the
            collapsed toolbar box could not hold, and it overlapped the result count. */}
        <GumPopover
          className="gum-pop--view"
          label={(
            <span>
              <GumIcon name={prefs.view === 'list' ? 'list' : 'grid'} size={14} />
              <span className="gum-pop__label-text">{t('gum.library.viewOptions')}</span>
            </span>
          )}
          ariaLabel={t('gum.library.viewOptionsAria', { layout: t(prefs.view === 'list' ? 'gum.library.viewList' : 'gum.library.viewGrid') })}
          align="end"
        >
          {() => (
            <div className="gum-fpanel gum-fpanel--view">
              <fieldset className="gum-fgroup">
                <legend>{t('gum.library.view')}</legend>
                <div className="gum-seg" role="radiogroup" aria-label={t('gum.library.view')}>
                  {(['grid', 'list'] as const).map((view) => (
                    <button
                      type="button"
                      key={view}
                      role="radio"
                      aria-checked={prefs.view === view}
                      onClick={() => setPrefs((current) => ({ ...current, view }))}
                    >
                      <GumIcon name={view} size={14} />
                      <span>{t(view === 'list' ? 'gum.library.viewList' : 'gum.library.viewGrid')}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {prefs.view === 'grid' && (
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
              )}
              <fieldset className="gum-fgroup">
                <legend>{t('gum.library.ratingDisplay')}</legend>
                <div className="gum-seg" role="radiogroup" aria-label={t('gum.library.ratingDisplay')}>
                  {GUM_RATING_DISPLAYS.map((display) => (
                    <button
                      type="button"
                      key={display}
                      role="radio"
                      aria-checked={prefs.ratingDisplay === display}
                      onClick={() => setPrefs((current) => ({ ...current, ratingDisplay: display }))}
                    >
                      {t(`gum.library.rating.${display}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
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
        </div>
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
            ) : search.trim() && prefs.status !== 'all' && counts.all > 0 ? (
              // A search inside a status tab said "Nothing matches" while All held the
              // matches: say where they are, one click away.
              <>
                <strong>{t('gum.library.matchesInAll', { count: counts.all })}</strong>
                <div className="gum-empty__actions">
                  <button type="button" className="gum-btn gum-btn--primary" onClick={() => setPrefs((current) => ({ ...current, status: 'all' }))}>
                    {t('gum.library.showInAll')}
                  </button>
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
          // No `maxColWidth`: the column count always comes from the pane width and cards
          // start at the left. The capped mode drops tracks to the item count and centres
          // them, which blew three search results up into huge centred posters.
          // Keyed by the tab, so a new tab starts at the top instead of mid-list.
          <VirtualGrid
            key={`${prefs.status}:${prefs.type}:${prefs.view}`}
            items={visible}
            className={`gum-grid gum-grid--${prefs.view}`}
            minColWidth={prefs.view === 'list' ? 520 : prefs.posterSize}
            gap={prefs.view === 'list' ? 8 : GRID_GAP}
            rowHeight={prefs.view === 'list' ? LIST_ROW : rowHeight}
            getKey={titleKey}
            renderItem={renderCard}
            // One Tab stop and arrow keys between posters, announced as a grid (K12).
            grid={{ label: t('gum.library.title') }}
          />
        )}
      </div>
    </div>
  );
}
