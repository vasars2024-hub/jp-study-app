/**
 * The library rail: Library / Media Type / Collections.
 *
 * Three separate `<Sidebar>` primitives rather than one list with group markers.
 * The shared primitive already renders the accent-pill active state and the
 * focus ring, and its `label` is a ReactNode — so the grouped headings and the
 * right-aligned counts come out of composing it, with no change to a component
 * every other view depends on.
 *
 * THE GROUPS ARE DISCLOSURES, and the reason is spatial rather than cosmetic.
 * The Media Center already carries its own 174–222px shell sidebar of ten
 * destinations; on the Library page this rail put a SECOND persistent vertical
 * column of nine rows beside it. At the shell's default 820px box that is close
 * to half the window spent on two stacked navigation columns. Each group is now
 * a real `<details>` with its heading as the `<summary>`: Library open, Media
 * type and Collections closed until asked for, remembered per group.
 *
 * Nothing is obscured — every heading stays on screen with its own chevron, one
 * click and one Enter away, and a group holding the ACTIVE scope is forced open
 * so the rail can never hide where you are.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { Sidebar, type SidebarItem } from '../../ui';
import Icon, { type IconName } from '../../Icons';
import { useT } from '../../../i18n';
import { mediaCategory, MEDIA_CATEGORIES, type MediaCategory } from '../../../../shared/mediaCategories';
import { isContinueWatching } from '../../../../shared/mediaLibraryEntries';
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

/** The three disclosure groups, and which one a scope kind belongs to. */
export type RailGroupId = 'library' | 'mediaType' | 'collections';

const GROUP_OF: Record<LibraryScope['kind'], RailGroupId> = {
  shelf: 'library',
  category: 'mediaType',
  collection: 'collections',
};

/**
 * Open/closed is a preference, so it survives a reload — but it is stored per
 * group and merged over the defaults rather than replacing them, so a stored
 * blob written before a group existed cannot decide that group's first render.
 */
export const RAIL_GROUPS_KEY = 'jp-medialib-rail-groups';
export const RAIL_GROUP_DEFAULTS: Record<RailGroupId, boolean> = {
  library: true,
  mediaType: false,
  collections: false,
};

export function readRailGroupState(): Record<RailGroupId, boolean> {
  try {
    const raw = localStorage.getItem(RAIL_GROUPS_KEY);
    if (!raw) return { ...RAIL_GROUP_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<RailGroupId, unknown>>;
    const next = { ...RAIL_GROUP_DEFAULTS };
    for (const id of Object.keys(RAIL_GROUP_DEFAULTS) as RailGroupId[]) {
      if (typeof parsed?.[id] === 'boolean') next[id] = parsed[id] as boolean;
    }
    return next;
  } catch {
    // A corrupt or unavailable store must not cost the user their rail.
    return { ...RAIL_GROUP_DEFAULTS };
  }
}

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
      // The shelf's own predicate, not a second copy of it. D269: this counted
      // anything short of the last five seconds while the shelf dropped
      // anything past 92%, so an episode watched to 95% was in the badge and
      // absent from the list the badge labels.
      if (isContinueWatching(item)) continueWatching += 1;
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

  const [openGroups, setOpenGroups] = useState<Record<RailGroupId, boolean>>(readRailGroupState);
  const activeGroup = GROUP_OF[value.kind];

  // A collapsed group must never be the thing hiding the current scope. This runs
  // on the group id rather than on the whole scope, so moving between two shelves
  // does not re-open anything the user just closed.
  useEffect(() => {
    setOpenGroups((current) => (current[activeGroup] ? current : { ...current, [activeGroup]: true }));
  }, [activeGroup]);

  const setGroupOpen = useCallback((id: RailGroupId, open: boolean): void => {
    setOpenGroups((current) => {
      if (current[id] === open) return current;
      const next = { ...current, [id]: open };
      try {
        localStorage.setItem(RAIL_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Preference only — a full or blocked store must not break the toggle.
      }
      return next;
    });
  }, []);

  const group = (id: RailGroupId, headingKey: string, groupItems: SidebarItem[]) => (
    <details
      className="medialib-rail__group"
      open={openGroups[id]}
      /*
       * `onToggle`, not `onClick` on the summary: `<details>` is a native control
       * whose state also changes from the keyboard and from `find-in-page`, and a
       * click handler would miss both and leave the stored preference lying.
       */
      onToggle={(event) => setGroupOpen(id, (event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="medialib-rail__heading">
        <span className="medialib-rail__heading-text">{t(headingKey)}</span>
        <Icon name="chevron" size={11} />
      </summary>
      <Sidebar items={groupItems} value={active} onSelect={select} aria-label={t(headingKey)} />
    </details>
  );

  return (
    /*
     * `ContextualSurface`, not a bare `<nav>`, and it is a role declaration rather
     * than a paint. This rail is navigation — the Liquid role §2.3 names first —
     * and it was the ONE Liquid-eligible region of the Video window still painting
     * its own opaque fill: category 3 measured `liquidTreatedEligible` 3 of 4 with
     * `nav.medialib-rail` the miss. The primitive is inert in a conventional
     * window by construction (`liquid-surfaces.css` paints nothing there), so the
     * standard Media Center renders the pixels it always did and only a window
     * explicitly put in Liquid presentation picks up the shared material.
     */
    <ContextualSurface as="nav" className="medialib-rail" aria-label={t('media.rail.label')}>
      {group('library', 'media.rail.library', shelfItems)}
      {categoryItems.length > 0 && group('mediaType', 'media.rail.mediaType', categoryItems)}
      {collectionItems.length > 0 && group('collections', 'media.rail.collections', collectionItems)}

      {footer && <div className="medialib-rail__foot">{footer}</div>}
    </ContextualSurface>
  );
}
