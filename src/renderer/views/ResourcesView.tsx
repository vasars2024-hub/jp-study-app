// Resources catalogue. The state and section renderers live in
// components/resources/ResourcesContent.tsx so Blanc can compose the same
// catalogue into Blanc chrome (BLANC_REFINEMENT_PLAN.md Pillar 0); this file
// keeps only the two Study OS shells — Aero (menu bar + status bar + three-pane
// workbench) and standard.
import Icon from '../components/Icons';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import WorldHeatMap from '../components/resources/WorldHeatMap';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import '../components/resources/resourcesLiquid.css';
import {
  ResourceBundleDetail,
  ResourceBundles,
  ResourceGroups,
  ResourceMyTools,
  ResourceNewSection,
  hostOf,
  openLink,
  useResources,
} from '../components/resources/ResourcesContent';
import { useT } from '../i18n';

export default function ResourcesView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useResources();
  const {
    filter,
    setFilter,
    query,
    setQuery,
    refreshState,
    doRefresh,
    selectedBundle,
    closeBundle,
    allCategories,
    groups,
    total,
    allTotal,
    activeCategory,
    bundles,
    showLanding,
  } = state;

  // `resources.updated` is 'Updated {when}' and there is no {when} here. This
  // used to blank the slot, strip a leftover `{when}` and trim, then fall back
  // to a hardcoded English 'Updated' — three pieces of string surgery and one
  // untranslated literal standing in for a key that simply had to exist.
  const refreshLabel =
    refreshState === 'refreshing'
      ? t('resources.refreshing')
      : refreshState === 'offline'
        ? t('resources.offline')
        : refreshState === 'cached'
          ? t('resources.cached')
        : refreshState === 'updated'
          ? t('resources.updatedRecently')
          : '';

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('resources.aero.menu.file'),
      items: [
        { id: 'refresh', label: t('resources.aero.menu.refresh'), onSelect: () => void doRefresh() },
        { id: 'clear-search', label: t('resources.aero.menu.clearSearch'), disabled: !query, onSelect: () => setQuery('') },
        { id: 'all', label: t('resources.aero.menu.showAll'), onSelect: () => setFilter('All') },
      ],
    },
    {
      id: 'view',
      label: t('resources.aero.menu.view'),
      items: [
        { id: 'all-view', label: t('resources.aero.menu.allCategories'), onSelect: () => setFilter('All') },
        ...allCategories.map((cat) => ({
          id: `cat-${cat.id}`,
          label: cat.title,
          onSelect: () => setFilter(cat.id),
        })),
      ],
    },
  ];

  // -------------------------------- Aero shell --------------------------------

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{t('resources.aero.status.visible', { count: total })}</StatusBarField>
            <StatusBarField>{t('resources.aero.status.indexed', { count: allTotal })}</StatusBarField>
            <StatusBarField>{t('resources.aero.status.bundles', { count: bundles.length })}</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>
              {selectedBundle
                ? selectedBundle.gem
                : activeCategory?.title ?? t('resources.aero.menu.allCategories')}
            </StatusBarField>
          </>
        }
        className="aero-resources-chrome"
      >
        <div className="aero-resources">
          <Toolbar className="aero-resources-toolbar" aria-label={t('resources.aero.toolbar.aria')}>
            <button className={`aero-resource-filter ${filter === 'All' ? 'active' : ''}`} onClick={() => { setFilter('All'); closeBundle(); }}>
              {t('resources.filter.all')}
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat.id}
                className={`aero-resource-filter ${filter === cat.id ? 'active' : ''}`}
                onClick={() => { setFilter(cat.id); closeBundle(); }}
                title={cat.title}
              >
                {cat.title}
              </button>
            ))}
            <ToolbarSpacer />
            <button className="aero-resource-filter" onClick={() => void doRefresh()} disabled={refreshState === 'refreshing'} title={t('resources.aero.menu.refresh')}>
              <Icon name="refresh" size={12} /> {refreshState === 'refreshing' ? t('resources.refreshing') : t('resources.refresh')}
            </button>
            <input
              className="aero-resource-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('resources.aero.search.placeholder')}
              aria-label={t('resources.aero.search.placeholder')}
            />
          </Toolbar>

          {selectedBundle ? (
            <div className="aero-resources-workbench single">
              <ResourceBundleDetail state={state} />
            </div>
          ) : (
            <div className="aero-resources-workbench">
              <aside className="aero-resources-tree" aria-label={t('resources.aero.tree.aria')}>
                <button className={`aero-resources-node ${filter === 'All' ? 'active' : ''}`} onClick={() => setFilter('All')}>
                  <span>{t('resources.aero.allResources')}</span>
                  <b>{allTotal}</b>
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`aero-resources-node ${filter === cat.id ? 'active' : ''}`}
                    onClick={() => setFilter(cat.id)}
                  >
                    <span>{cat.title}</span>
                    <b>{cat.items.length}</b>
                  </button>
                ))}
              </aside>

              <main className="aero-resources-list">
                {showLanding ? <WorldHeatMap /> : null}
                {showLanding ? <ResourceBundles state={state} /> : null}
                {showLanding ? <ResourceMyTools state={state} /> : null}
                {showLanding ? <ResourceNewSection state={state} /> : null}
                {groups.length === 0 ? (
                  <div className="aero-resources-empty">{t('resources.aero.empty')}</div>
                ) : (
                  groups.map((cat) => (
                    <section className="aero-resource-group" key={cat.id}>
                      <div className="aero-resource-group-head">
                        <span>{cat.title}</span>
                        <small>{cat.blurb}</small>
                      </div>
                      <div className="aero-resource-table" role="table" aria-label={cat.title}>
                        <div className="aero-resource-row aero-resource-row-head" role="row">
                          <span>{t('resources.aero.col.name')}</span>
                          <span>{t('resources.aero.col.cost')}</span>
                          <span>{t('resources.aero.col.host')}</span>
                          <span>{t('resources.aero.col.description')}</span>
                        </div>
                        {cat.items.map((r) => (
                          <button key={r.url} className="aero-resource-row" role="row" onClick={() => openLink(r.url)}>
                            <span className="aero-resource-name">{r.name}</span>
                            <span className={`aero-resource-cost cost-${r.cost.toLowerCase()}`}>{r.cost}</span>
                            <span>{hostOf(r.url)}</span>
                            <span>{r.description}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </main>

              <aside className="aero-resources-inspector" aria-label={t('resources.aero.inspector.aria')}>
                <h2>{activeCategory?.title ?? t('resources.aero.inspector.title')}</h2>
                <p>{activeCategory?.blurb ?? t('resources.aero.inspector.blurb')}</p>
                <dl>
                  <div>
                    <dt>{t('resources.aero.inspector.visible')}</dt>
                    <dd>{total}</dd>
                  </div>
                  <div>
                    <dt>{t('resources.aero.inspector.bundles')}</dt>
                    <dd>{bundles.length}</dd>
                  </div>
                  <div>
                    <dt>{t('resources.aero.inspector.mode')}</dt>
                    <dd>{query ? t('resources.aero.mode.filtered') : t('resources.aero.mode.browsing')}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          )}
        </div>
      </AppChrome>
    );
  }

  // ------------------------------ Standard shell ------------------------------

  if (selectedBundle) {
    return (
      <div className="res-view">
        <ResourceBundleDetail state={state} />
      </div>
    );
  }

  return (
    <div className="res-view">
      <ContextualSurface className="res-command-surface">
        <div className="view-head">
          <p className="muted">{t('resources.intro')}</p>
        </div>

        <div className="res-controls">
          <div className="res-filter">
            {/*
              * Register row D6, the resources third. A visual `active` class is
              * paint; `aria-pressed` is the state. Same toggle-set idiom the
              * grammar category row got in `bac1ff77`, so the two announce alike.
              */}
            <button
              className={`gram-level-btn ${filter === 'All' ? 'active' : ''}`}
              aria-pressed={filter === 'All'}
              onClick={() => setFilter('All')}
            >
              {t('resources.filter.all')}
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat.id}
                className={`gram-level-btn ${filter === cat.id ? 'active' : ''}`}
                aria-pressed={filter === cat.id}
                onClick={() => setFilter(cat.id)}
                title={cat.title}
              >
                {cat.title}
              </button>
            ))}
          </div>
          <div className="res-controls-right">
            <button
              className="gram-level-btn res-refresh"
              onClick={() => void doRefresh()}
              disabled={refreshState === 'refreshing'}
            >
              <Icon name="refresh" size={12} />
              {refreshState === 'refreshing' ? t('resources.refreshing') : t('resources.refresh')}
            </button>
            <input
              className="gram-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('resources.search.placeholder')}
              aria-label={t('resources.search.placeholder')}
            />
          </div>
        </div>

        {refreshLabel ? <div className="res-refresh-hint muted">{refreshLabel}</div> : null}
      </ContextualSurface>

      {showLanding ? <WorldHeatMap /> : null}
      {showLanding ? <ResourceBundles state={state} /> : null}
      {showLanding ? <ResourceMyTools state={state} /> : null}
      {showLanding ? <ResourceNewSection state={state} /> : null}

      <div className="gram-count muted">{t('resources.count', { count: total })}</div>

      <ResourceGroups state={state} />
    </div>
  );
}
