/**
 * The library rail: Library / Media Type / Collections.
 *
 * Three separate `<Sidebar>` primitives rather than one list with group markers.
 * The shared primitive already renders the accent-pill active state and the
 * focus ring, and its `label` is a ReactNode — so the grouped headings and the
 * right-aligned counts come out of composing it, with no change to a component
 * every other view depends on.
 */

import { useMemo } from 'react';
import { Sidebar, type SidebarItem } from '../../ui';
import Icon, { type IconName } from '../../Icons';
import { useT } from '../../../i18n';
import { mediaCategory, MEDIA_CATEGORIES, type MediaCategory } from '../../../../shared/mediaCategories';
import type { MediaItem } from '../../../../shared/types';

/** What the rail can select. Parsed/serialized as a plain string id. */
export type LibraryShelfId = 'home' | 'recent' | 'continue' | 'queue' | 'favorites' | 'tracking';

export type LibraryScope =
  | { kind: 'shelf'; id: LibraryShelfId }
  | { kind: 'category'; id: MediaCategory }
  | { kind: 'collection'; id: string };

export const LIBRARY_SHELF_IDS: readonly LibraryShelfId[] = [
  'home', 'recent', 'continue', 'queue', 'favorites', 'tracking',
];

export function scopeKey(scope: LibraryScope): string {
  return `${scope.kind}:${scope.id}`;
}

export function parseScopeKey(value: string): LibraryScope {
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  if (kind === 'category' && (MEDIA_CATEGORIES as readonly string[]).includes(id)) {
    return { kind: 'category', id: id as MediaCategory };
  }
  if (kind === 'collection' && id) return { kind: 'collection', id };
  const shelf = LIBRARY_SHELF_IDS.find((s) => s === id);
  return { kind: 'shelf', id: shelf ?? 'home' };
}

const SHELVES: Array<{ id: LibraryShelfId; labelKey: string; icon: IconName }> = [
  { id: 'home', labelKey: 'media.rail.home', icon: 'app' },
  { id: 'recent', labelKey: 'media.rail.recentlyAdded', icon: 'folder' },
  { id: 'continue', labelKey: 'media.rail.continueWatching', icon: 'player' },
  { id: 'queue', labelKey: 'media.rail.studyQueue', icon: 'library' },
  { id: 'favorites', labelKey: 'media.rail.favorites', icon: 'heart' },
  { id: 'tracking', labelKey: 'media.rail.tracking', icon: 'chart-bar' },
];

/** Category order and icon. Categories with nothing in them are not rendered. */
const CATEGORY_ICONS: Record<MediaCategory, IconName> = {
  anime: 'video',
  drama: 'video',
  movie: 'file-video',
  tv: 'monitor',
  music: 'music',
  podcast: 'headphones',
  audiobook: 'file-audio',
  learning: 'library',
  personal: 'folder',
  inbox: 'file',
};

const CATEGORY_ORDER: MediaCategory[] = [
  'anime', 'drama', 'movie', 'tv', 'music', 'podcast', 'audiobook', 'learning', 'personal', 'inbox',
];

export interface MediaLibrarySidebarProps {
  items: readonly MediaItem[];
  value: LibraryScope;
  onSelect: (scope: LibraryScope) => void;
  /** Free-space / storage line shown at the foot of the rail. */
  footer?: string;
}

export default function MediaLibrarySidebar({ items, value, onSelect, footer }: MediaLibrarySidebarProps) {
  const { t, lang } = useT();

  const counts = useMemo(() => {
    const byCategory = new Map<MediaCategory, number>();
    const collections = new Map<string, number>();
    let favorites = 0;
    let queue = 0;
    let continueWatching = 0;

    for (const item of items) {
      const category = mediaCategory(item);
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
      if (item.favorite) favorites += 1;
      if (item.studyQueue) queue += 1;
      const position = item.positionSec ?? 0;
      if (position > 0 && (!item.durationSec || position < item.durationSec - 5)) continueWatching += 1;
      for (const name of item.collections ?? []) {
        collections.set(name, (collections.get(name) ?? 0) + 1);
      }
    }
    return { byCategory, collections, favorites, queue, continueWatching };
  }, [items]);

  // `lang` — not `t` — because t's identity is stable by design, so depending on
  // it would leave these labels in the previous language after a switch.
  const shelfItems: SidebarItem[] = useMemo(() => SHELVES.map((shelf) => {
    // Tracking counts come from the provider store, not the local file list, so
    // the rail leaves that one unlabelled rather than showing a wrong number.
    const count = shelf.id === 'favorites' ? counts.favorites
      : shelf.id === 'queue' ? counts.queue
        : shelf.id === 'continue' ? counts.continueWatching
          : shelf.id === 'recent' ? items.length
            : null;
    return {
      id: scopeKey({ kind: 'shelf', id: shelf.id }),
      icon: <Icon name={shelf.icon} size={15} />,
      label: (
        <>
          <span className="medialib-rail__label">{t(shelf.labelKey)}</span>
          {count !== null && count > 0 && (
            <span className="medialib-rail__count">{count.toLocaleString()}</span>
          )}
        </>
      ),
    };
  }), [counts, items.length, lang]);

  const categoryItems: SidebarItem[] = useMemo(() => CATEGORY_ORDER
    .filter((category) => (counts.byCategory.get(category) ?? 0) > 0)
    .map((category) => ({
      id: scopeKey({ kind: 'category', id: category }),
      icon: <Icon name={CATEGORY_ICONS[category]} size={15} />,
      label: (
        <>
          <span className="medialib-rail__label">{t(`media.category.${category}`)}</span>
          <span className="medialib-rail__count">
            {(counts.byCategory.get(category) ?? 0).toLocaleString()}
          </span>
        </>
      ),
    })), [counts, lang]);

  const collectionItems: SidebarItem[] = useMemo(() => [...counts.collections.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      id: scopeKey({ kind: 'collection', id: name }),
      icon: <Icon name="bookmark" size={15} />,
      label: (
        <>
          <span className="medialib-rail__label">{name}</span>
          <span className="medialib-rail__count">{count.toLocaleString()}</span>
        </>
      ),
    })), [counts]);

  const active = scopeKey(value);
  const select = (id: string): void => onSelect(parseScopeKey(id));

  return (
    <nav className="medialib-rail" aria-label={t('media.rail.label')}>
      <div className="medialib-rail__group">
        <div className="medialib-rail__heading">{t('media.rail.library')}</div>
        <Sidebar items={shelfItems} value={active} onSelect={select} aria-label={t('media.rail.library')} />
      </div>

      {categoryItems.length > 0 && (
        <div className="medialib-rail__group">
          <div className="medialib-rail__heading">{t('media.rail.mediaType')}</div>
          <Sidebar items={categoryItems} value={active} onSelect={select} aria-label={t('media.rail.mediaType')} />
        </div>
      )}

      {collectionItems.length > 0 && (
        <div className="medialib-rail__group">
          <div className="medialib-rail__heading">{t('media.rail.collections')}</div>
          <Sidebar items={collectionItems} value={active} onSelect={select} aria-label={t('media.rail.collections')} />
        </div>
      )}

      {footer && <div className="medialib-rail__foot">{footer}</div>}
    </nav>
  );
}
