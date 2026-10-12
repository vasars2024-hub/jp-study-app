import { useMemo, useRef, useState } from 'react';
import type { WidgetSnapshot } from '../../shared/desktop';
import { WIDGETS, getWidgetDef } from '../widgets/registry';
import { WIDGET_CATEGORIES, type WidgetCategory } from '../widgets/types';
import Icon from './Icons';
import { useT } from '../i18n';
import { useAeroMaterials, useWiredMaterials } from './ui';
import { useModalKeyboard } from './ui/useModalKeyboard';
import { wiredWidgetDesc, wiredWidgetTitle } from '../widgets/wiredLabels';
import { aeroGadgetTitle } from '../widgets/aeroLabels';
import WidgetPreview from '../widgets/WidgetPreview';
import '../widgets/wid6.css';
import { writeLocalStorageJson } from '../localStorageWrite';

// Persist favorites + recently-used across sessions (small UI state → localStorage).
const GKEY = 'jp-widget-gallery';
interface GalleryPrefs {
  favorites: string[];
  recent: string[];
}
/** A stored list that is not a list of strings (hand-edited, older build) reads as empty. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function loadPrefs(): GalleryPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(GKEY) ?? '{}') as Partial<Record<keyof GalleryPrefs, unknown>> | null;
    return { favorites: stringList(raw?.favorites), recent: stringList(raw?.recent) };
  } catch {
    return { favorites: [], recent: [] };
  }
}
function savePrefs(p: GalleryPrefs): void {
  writeLocalStorageJson(GKEY, p);
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
  const aero = useAeroMaterials();
  const [prefs, setPrefs] = useState<GalleryPrefs>(loadPrefs);
  /** wid6: the card the preview pane shows — the last one pointed at or focused. */
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('All');
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * The gallery is modal to the mouse — `.widget-gallery-backdrop` is
   * `position: fixed`, `inset: 0`, `rgba(0, 0, 0, 0.45)` at z 900 with
   * `pointer-events: auto`, so the whole desk is dimmed and unclickable
   * behind it. Until 2026-09-08 it was not modal to the keyboard at all
   * (register row D411). Measured live on a 1904x993 desk: Escape left it
   * open, and ONE Shift+Tab out of the search box landed on a Flashcards
   * card's **Remove** button under the scrim.
   *
   * `initialFocusRef` keeps the search box focused — the gallery is a
   * type-to-filter picker, and `autoFocus` alone loses the race against this
   * hook's own focus move.
   */
  useModalKeyboard({ panelRef, onEscape: onClose, initialFocusRef: searchRef });

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
        // Matched by the name the theme shows, and by the plain title (an Aero gadget is still a clock).
        const plain = t(w.titleKey);
        const title = `${wired ? wiredWidgetTitle(w.type, plain) : aero ? aeroGadgetTitle(w.type, plain) : plain} ${plain}`;
        const desc = wired ? wiredWidgetDesc(w.type, t(w.descKey)) : t(w.descKey);
        return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      });
    }
    return list;
    // `t` is intentionally left out of the deps: its identity is stable, `lang`
    // is what actually needs to trigger a redo of the filtered/translated list.
  }, [tab, query, prefs, lang, wired, aero]);

  const tabs: Tab[] = ['All', 'Favorites', 'Recent', ...WIDGET_CATEGORIES];

  /** The name a widget goes by in this theme (an Aero gadget, a Wired module, or its plain title). */
  const titleOf = (w: (typeof WIDGETS)[number]): string =>
    wired ? wiredWidgetTitle(w.type, t(w.titleKey)) : aero ? aeroGadgetTitle(w.type, t(w.titleKey)) : t(w.titleKey);
  const descOf = (w: (typeof WIDGETS)[number]): string => (wired ? wiredWidgetDesc(w.type, t(w.descKey)) : t(w.descKey));

  // The preview follows the pointer and the keyboard; with neither yet, the first card shows.
  const previewDef = (previewType ? visible.find((w) => w.type === previewType) : undefined) ?? visible[0];

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
      <div
        key={w.type}
        className={`widget-card${isInstalled ? ' installed' : ''}${previewDef?.type === w.type ? ' is-previewed' : ''}`}
        data-widget-card={w.type}
        onPointerEnter={() => setPreviewType(w.type)}
        onFocus={() => setPreviewType(w.type)}
      >
        <div className="widget-card-head">
          <span className="widget-card-title">{titleOf(w)}</span>
          <button
            className={`widget-fav ${fav ? 'on' : ''}`}
            title={fav ? t('widgetGallery.unfavorite') : t('widgetGallery.favorite')}
            aria-label={fav ? t('wid6.gallery.unfavoriteNamed', { name: titleOf(w) }) : t('wid6.gallery.favoriteNamed', { name: titleOf(w) })}
            aria-pressed={fav}
            onClick={() => toggleFav(w.type)}
          >
            <Icon name="star" size={14} fill={fav} />
          </button>
        </div>
        <div className="widget-card-desc">{descOf(w)}</div>
        <div className="widget-card-foot">
          {isInstalled && <span className="widget-card-badge">{t('widgetGallery.onWorkspace')}</span>}
          <button
            className="wgt-btn widget-card-add"
            onClick={() => onAdd(w.type)}
            title={isInstalled ? t('widgetGallery.addAnother') : t('widgetGallery.add')}
            aria-label={isInstalled ? t('wid6.gallery.addAnotherNamed', { name: titleOf(w) }) : t('wid6.gallery.addNamed', { name: titleOf(w) })}
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
      <div
        className="widget-gallery"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        aria-label={t('widgetGallery.dialogLabel')}
      >
        <div className="widget-gallery-head">
          <span className="widget-gallery-title">{t('widgetGallery.title')}</span>
          <input
            className="widget-gallery-search"
            aria-label={t('widgetGallery.searchPlaceholder')}
            placeholder={t('widgetGallery.searchPlaceholder')}
            value={query}
            ref={searchRef}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="widget-b" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>×</button>
        </div>
        <div className="widget-gallery-tabs">
          {tabs.map((tb) => (
            <button key={tb} className={`widget-tab ${tab === tb ? 'active' : ''}`} onClick={() => setTab(tb)}>{tabLabel(tb)}</button>
          ))}
        </div>
        <div className="widget-gallery-body">
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
          {previewDef && (
            <aside className="widget-gallery-preview" aria-label={t('wid6.gallery.previewOf', { name: titleOf(previewDef) })}>
              <div className="widget-gallery-preview-head">{t('wid6.gallery.preview')}</div>
              <WidgetPreview
                key={previewDef.type}
                def={previewDef}
                title={titleOf(previewDef)}
                description={descOf(previewDef)}
                aero={aero}
                wired={wired}
              />
              <div className="widget-gallery-preview-name">{titleOf(previewDef)}</div>
              <p className="widget-gallery-preview-desc">{descOf(previewDef)}</p>
              <p className="widget-gallery-preview-meta">
                {t('wid6.gallery.defaultSize', { w: previewDef.defaultSize.w, h: previewDef.defaultSize.h })}
              </p>
              <button
                type="button"
                className="wgt-btn primary widget-gallery-preview-add"
                aria-label={installed.has(previewDef.type) ? t('wid6.gallery.addAnotherNamed', { name: titleOf(previewDef) }) : t('wid6.gallery.addNamed', { name: titleOf(previewDef) })}
                onClick={() => onAdd(previewDef.type)}
              >
                {installed.has(previewDef.type) ? t('widgetGallery.addAnother') : t('widgetGallery.add')}
              </button>
            </aside>
          )}
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
