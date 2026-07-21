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
}

export default function WidgetGallery({ onAdd, onResetLayout, hiddenWidgets, onRestore, onClose }: WidgetGalleryProps) {
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
        <div className="widget-gallery-grid">
          {visible.length === 0 && <div className="wgt-empty">{t('widgetGallery.noMatch')}</div>}
          {visible.map((w) => (
            <div key={w.type} className="widget-card">
              <div className="widget-card-head">
                <span className="widget-card-title">{wired ? wiredWidgetTitle(w.type, t(w.titleKey)) : t(w.titleKey)}</span>
                <button
                  className={`widget-fav ${prefs.favorites.includes(w.type) ? 'on' : ''}`}
                  title={prefs.favorites.includes(w.type) ? t('widgetGallery.unfavorite') : t('widgetGallery.favorite')}
                  onClick={() => toggleFav(w.type)}
                >
                  <Icon name="star" size={14} fill />
                </button>
              </div>
              <div className="widget-card-cat">{t(`widgets.category.${w.category}`)}</div>
              <div className="widget-card-desc">{wired ? wiredWidgetDesc(w.type, t(w.descKey)) : t(w.descKey)}</div>
              <button className="wgt-btn primary widget-card-add" onClick={() => onAdd(w.type)}>{t('widgetGallery.add')}</button>
            </div>
          ))}
        </div>

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
