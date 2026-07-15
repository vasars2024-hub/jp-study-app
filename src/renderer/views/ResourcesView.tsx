import { useMemo, useState } from 'react';
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
import { RESOURCES, type Resource, type ResourceCategory } from '../data/resources';
import { useT } from '../i18n';

type Filter = 'All' | string;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function openLink(url: string): void {
  // Opens in the system browser via the safe main-process bridge.
  void window.api.openExternal(url);
}

function matchesResource(r: Resource, q: string): boolean {
  return `${r.name} ${r.description}`.toLowerCase().includes(q);
}

export default function ResourcesView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const groups: ResourceCategory[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES
      .filter((cat) => filter === 'All' || cat.id === filter)
      .map((cat) => ({
        ...cat,
        items: q ? cat.items.filter((r) => matchesResource(r, q)) : cat.items,
      }))
      .filter((cat) => cat.items.length > 0);
  }, [filter, query]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const allTotal = RESOURCES.reduce((n, g) => n + g.items.length, 0);
  const activeCategory = filter === 'All' ? null : RESOURCES.find((cat) => cat.id === filter) ?? null;

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'clear-search', label: 'Clear search', disabled: !query, onSelect: () => setQuery('') },
        { id: 'all', label: 'Show all resources', onSelect: () => setFilter('All') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'all-view', label: 'All categories', onSelect: () => setFilter('All') },
        ...RESOURCES.map((cat) => ({
          id: `cat-${cat.id}`,
          label: cat.title,
          onSelect: () => setFilter(cat.id),
        })),
      ],
    },
  ];

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{total} visible</StatusBarField>
            <StatusBarField>{allTotal} indexed</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{activeCategory?.title ?? 'All categories'}</StatusBarField>
          </>
        }
        className="aero-resources-chrome"
      >
        <div className="aero-resources">
          <Toolbar className="aero-resources-toolbar" aria-label="Resource catalogue commands">
            <button className={`aero-resource-filter ${filter === 'All' ? 'active' : ''}`} onClick={() => setFilter('All')}>
              All
            </button>
            {RESOURCES.map((cat) => (
              <button
                key={cat.id}
                className={`aero-resource-filter ${filter === cat.id ? 'active' : ''}`}
                onClick={() => setFilter(cat.id)}
                title={cat.title}
              >
                {cat.title}
              </button>
            ))}
            <ToolbarSpacer />
            <input
              className="aero-resource-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find resource..."
            />
          </Toolbar>

          <div className="aero-resources-workbench">
            <aside className="aero-resources-tree" aria-label="Resource categories">
              <button className={`aero-resources-node ${filter === 'All' ? 'active' : ''}`} onClick={() => setFilter('All')}>
                <span>All resources</span>
                <b>{allTotal}</b>
              </button>
              {RESOURCES.map((cat) => (
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
              {groups.length === 0 ? (
                <div className="aero-resources-empty">No resources match the current search.</div>
              ) : (
                groups.map((cat) => (
                  <section className="aero-resource-group" key={cat.id}>
                    <div className="aero-resource-group-head">
                      <span>{cat.title}</span>
                      <small>{cat.blurb}</small>
                    </div>
                    <div className="aero-resource-table" role="table" aria-label={cat.title}>
                      <div className="aero-resource-row aero-resource-row-head" role="row">
                        <span>Name</span>
                        <span>Cost</span>
                        <span>Host</span>
                        <span>Description</span>
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

            <aside className="aero-resources-inspector" aria-label="Resource details">
              <h2>{activeCategory?.title ?? 'Study directory'}</h2>
              <p>{activeCategory?.blurb ?? 'A compact catalogue of Japanese study links grouped by purpose.'}</p>
              <dl>
                <div>
                  <dt>Visible</dt>
                  <dd>{total}</dd>
                </div>
                <div>
                  <dt>Categories</dt>
                  <dd>{RESOURCES.length}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{query ? 'Filtered' : 'Browsing'}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      </AppChrome>
    );
  }

  return (
    <div className="res-view">
      <div className="view-head">
        <p className="muted">{t('resources.intro')}</p>
      </div>

      <div className="res-controls">
        <div className="res-filter">
          <button
            className={`gram-level-btn ${filter === 'All' ? 'active' : ''}`}
            onClick={() => setFilter('All')}
          >
            {t('resources.filter.all')}
          </button>
          {RESOURCES.map((cat) => (
            <button
              key={cat.id}
              className={`gram-level-btn ${filter === cat.id ? 'active' : ''}`}
              onClick={() => setFilter(cat.id)}
              title={cat.title}
            >
              {cat.title}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('resources.search.placeholder')}
        />
      </div>

      <div className="gram-count muted">{t('resources.count', { count: total })}</div>

      {groups.length === 0 ? (
        <div className="res-empty muted">{t('resources.noMatches')}</div>
      ) : (
        groups.map((cat) => (
          <section className="res-group" key={cat.id}>
            <div className="res-group-head">
              <h2>{cat.title}</h2>
              <p className="muted">{cat.blurb}</p>
            </div>

            <div className="res-grid">
              {cat.items.map((r) => (
                <button key={r.url} className="res-card" onClick={() => openLink(r.url)}>
                  <span className="res-card-top">
                    <span className="res-name">{r.name}</span>
                    <span className={`res-cost cost-${r.cost.toLowerCase()}`}>{r.cost}</span>
                  </span>
                  <span className="res-desc">{r.description}</span>
                  <span className="res-host">
                    {hostOf(r.url)}
                    <span className="res-open" aria-hidden="true">
                      <Icon name="external" size={11} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
