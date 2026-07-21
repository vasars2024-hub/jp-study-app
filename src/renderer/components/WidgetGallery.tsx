import { useMemo, useState } from 'react';
import type { WidgetSnapshot } from '../../shared/desktop';
import { WIDGETS, getWidgetDef } from '../widgets/registry';
import { WIDGET_CATEGORIES, type WidgetCategory } from '../widgets/types';
import Icon from './Icons';
import { useT } from '../i18n';
import { useWiredMaterials } from './ui';
import { wiredWidgetDesc, wiredWidgetTitle } from '../widgets/wiredLabels';

// Persist favorites + recently-used across sessions (small UI state → localStorage).
const GKEY = 'jp-widget-gallery';
interface GalleryPrefs {
  favorites: string[];
  recent: string[];
}
function loadPrefs(): GalleryPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(GKEY) ?? '{}') as Partial<GalleryPrefs>;
    return { favorites: raw.favorites ?? [], recent: raw.recent ?? [] };
  } catch {
    return { favorites: [], recent: [] };
  }
}
function savePrefs(p: GalleryPrefs): void {
  try {
    localStorage.setItem(GKEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
export function noteWidgetUsed(type: string): void {
  const p = loadPrefs();
  p.recent = [type, ...p.recent.filter((t) => t !== type)].slice(0, 12);
  savePrefs(p);
}

type Tab = 'All' | 'Favorites' | 'Recent' | WidgetCategory;

export interface WidgetGalleryProps {
  onAdd: (type: string) => void;
  onResetLayout: () => void;
  hiddenWidgets: WidgetSnapshot[];
  onRestore: (id: string) => void;
  onClose: () => void;
  /**
   * Types currently placed on the workspace, so the gallery can distinguish
   * installed from available. This is the desktop's existing widget state
   * passed down — NOT a new persistence or tracking system.
   */
  installedTypes?: string[];
}

export default function WidgetGallery({
  onAdd,
  onResetLayout,
  hiddenWidgets,
  onRestore,
  onClose,
  installedTypes = [],
}: WidgetGalleryProps) {
  const { t, lang } = useT();
  const wired = useWiredMaterials();
  const [prefs, setPrefs] = useState<GalleryPrefs>(loadPrefs);
  const [tab, setTab] = useState<Tab>('All');
  const [query, setQuery] = useState('');

  const tabLabel = (tb: Tab): string => {
    if (tb === 'All') return t('widgetGallery.tab.all');
    if (tb === 'Favorites') return t('widgetGallery.tab.favorites');
    if (tb === 'Recent') return t('widgetGallery.tab.recent');
    return t(`widgets.category.${tb}`);
  };

  const toggleFav = (type: string) => {
    const favorites = prefs.favorites.includes(type)
      ? prefs.favorites.filter((t) => t !== type)
      : [...prefs.favorites, type];
    const next = { ...prefs, favorites };
    setPrefs(next);
    savePrefs(next);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = WIDGETS;
    if (tab === 'Favorites') list = list.filter((w) => prefs.favorites.includes(w.type));
    else if (tab === 'Recent') {
      const order = new Map(prefs.recent.map((t, i) => [t, i]));
      list = list
        .filter((w) => order.has(w.type))
        .sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0));
    } else if (tab !== 'All') list = list.filter((w) => w.category === tab);
    if (q) {
      list = list.filter((w) => {
        const title = wired ? wiredWidgetTitle(w.type, t(w.titleKey)) : t(w.titleKey);
        const desc = wired ? wiredWidgetDesc(w.type, t(w.descKey)) : t(w.descKey);
        return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      });
    }
    return list;
    // `t` is intentionally left out of the deps: its identity is stable, `lang`
    // is what actually needs to trigger a redo of the filtered/translated list.
  }, [tab, query, prefs, lang, wired]);

  const tabs: Tab[] = ['All', 'Favorites', 'Recent', ...WIDGET_CATEGORIES];

  const installed = useMemo(() => new Set(installedTypes), [installedTypes]);

  /**
   * Group the visible widgets by category for the browsing tabs. Recent is
   * deliberately left flat — its whole point is the recency order, which
   * grouping would destroy. A single-category tab needs no headers either.
   */
  const grouped = useMemo(() => {
    if (tab === 'Recent' || (tab !== 'All' && tab !== 'Favorites')) return null;
    const buckets = WIDGET_CATEGORIES.map((c) => ({
      category: c,
      items: visible.filter((w) => w.category === c),
    })).filter((b) => b.items.length > 0);
    return buckets.length > 1 ? buckets : null;
  }, [visible, tab]);

  const renderCard = (w: (typeof WIDGETS)[number]) => {
    const fav = prefs.favorites.includes(w.type);
    const isInstalled = installed.has(w.type);
    return (
      <div key={w.type} className={`widget-card${isInstalled ? ' installed' : ''}`}>
        <div className="widget-card-head">
          <span className="widget-card-title">
            {wired ? wiredWidgetTitle(w.type, t(w.titleKey)) : t(w.titleKey)}
          </span>
          <button
            className={`widget-fav ${fav ? 'on' : ''}`}
            title={fav ? t('widgetGallery.unfavorite') : t('widgetGallery.favorite')}
            aria-pressed={fav}
            onClick={() => toggleFav(w.type)}
          >
            <Icon name="star" size={14} fill={fav} />
          </button>
        </div>
        <div className="widget-card-desc">
          {wired ? wiredWidgetDesc(w.type, t(w.descKey)) : t(w.descKey)}
        </div>
        <div className="widget-card-foot">
          {isInstalled && <span className="widget-card-badge">{t('widgetGallery.onWorkspace')}</span>}
          <button
            className="wgt-btn widget-card-add"
            onClick={() => onAdd(w.type)}
            title={isInstalled ? t('widgetGallery.addAnother') : t('widgetGallery.add')}
          >
            {isInstalled ? t('widgetGallery.addAnother') : t('widgetGallery.add')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="widget-gallery-backdrop" onClick={onClose} />
      <div className="widget-gallery" role="dialog" aria-label={t('widgetGallery.dialogLabel')}>
        <div className="widget-gallery-head">
          <span className="widget-gallery-title">{t('widgetGallery.title')}</span>
          <input
            className="widget-gallery-search"
            placeholder={t('widgetGallery.searchPlaceholder')}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="widget-b" title={t('common.close')} onClick={onClose}>×</button>
        </div>
        <div className="widget-gallery-tabs">
          {tabs.map((tb) => (
            <button key={tb} className={`widget-tab ${tab === tb ? 'active' : ''}`} onClick={() => setTab(tb)}>{tabLabel(tb)}</button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="widget-gallery-empty">
            <Icon name="widgets" size={28} />
            <p className="widget-gallery-empty-title">{t('widgetGallery.noMatch')}</p>
            {query.trim() !== '' && (
              <button className="wgt-btn" onClick={() => setQuery('')}>
                {t('widgetGallery.clearSearch')}
              </button>
            )}
          </div>
        ) : grouped ? (
          <div className="widget-gallery-groups">
            {grouped.map((b) => (
              <section key={b.category} className="widget-gallery-group" aria-label={t(`widgets.category.${b.category}`)}>
                <h3 className="widget-gallery-group-label">{t(`widgets.category.${b.category}`)}</h3>
                <div className="widget-gallery-grid">
                  {b.items.map((w) => renderCard(w))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="widget-gallery-groups">
            <div className="widget-gallery-grid">{visible.map((w) => renderCard(w))}</div>
          </div>
        )}

        {hiddenWidgets.length > 0 && (
          <div className="widget-gallery-hidden">
            <div className="widget-gallery-subhead">{t('widgetGallery.hiddenCount', { count: hiddenWidgets.length })}</div>
            <div className="widget-hidden-list">
              {hiddenWidgets.map((h) => {
                const def = getWidgetDef(h.type);
                return (
                  <button key={h.id} className="wgt-btn" onClick={() => onRestore(h.id)}>
                    {t('widgetGallery.restore', { title: def ? t(def.titleKey) : h.type })}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="widget-gallery-foot">
          <button className="wgt-btn danger" onClick={onResetLayout}>{t('widgetGallery.resetLayout')}</button>
        </div>
      </div>
    </>
  );
}
