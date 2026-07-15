import { useMemo, useState } from 'react';
import Icon from '../components/Icons';
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
