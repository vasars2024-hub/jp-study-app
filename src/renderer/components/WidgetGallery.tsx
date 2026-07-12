import { useMemo, useState } from 'react';
import type { WidgetSnapshot } from '../../shared/desktop';
import { WIDGETS, getWidgetDef } from '../widgets/registry';
import { WIDGET_CATEGORIES, type WidgetCategory } from '../widgets/types';

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
  const [prefs, setPrefs] = useState<GalleryPrefs>(loadPrefs);
  const [tab, setTab] = useState<Tab>('All');
  const [query, setQuery] = useState('');

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
    if (q) list = list.filter((w) => w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q));
    return list;
  }, [tab, query, prefs]);

  const tabs: Tab[] = ['All', 'Favorites', 'Recent', ...WIDGET_CATEGORIES];

  return (
    <>
      <div className="widget-gallery-backdrop" onClick={onClose} />
      <div className="widget-gallery" role="dialog" aria-label="Widget gallery">
        <div className="widget-gallery-head">
          <span className="widget-gallery-title">Widgets</span>
          <input
            className="widget-gallery-search"
            placeholder="Search widgets…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="widget-b" title="Close" onClick={onClose}>×</button>
        </div>
        <div className="widget-gallery-tabs">
          {tabs.map((t) => (
            <button key={t} className={`widget-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="widget-gallery-grid">
          {visible.length === 0 && <div className="wgt-empty">No widgets match.</div>}
          {visible.map((w) => (
            <div key={w.type} className="widget-card">
              <div className="widget-card-head">
                <span className="widget-card-title">{w.title}</span>
                <button
                  className={`widget-fav ${prefs.favorites.includes(w.type) ? 'on' : ''}`}
                  title={prefs.favorites.includes(w.type) ? 'Unfavorite' : 'Favorite'}
                  onClick={() => toggleFav(w.type)}
                >
                  ★
                </button>
              </div>
              <div className="widget-card-cat">{w.category}</div>
              <div className="widget-card-desc">{w.description}</div>
              <button className="wgt-btn primary widget-card-add" onClick={() => onAdd(w.type)}>Add</button>
            </div>
          ))}
        </div>

        {hiddenWidgets.length > 0 && (
          <div className="widget-gallery-hidden">
            <div className="widget-gallery-subhead">Hidden ({hiddenWidgets.length})</div>
            <div className="widget-hidden-list">
              {hiddenWidgets.map((h) => (
                <button key={h.id} className="wgt-btn" onClick={() => onRestore(h.id)}>
                  Restore {getWidgetDef(h.type)?.title ?? h.type}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="widget-gallery-foot">
          <button className="wgt-btn danger" onClick={onResetLayout}>Reset workspace layout</button>
        </div>
      </div>
    </>
  );
}
