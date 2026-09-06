/**
 * Rail / grid / drawer — the media library page.
 *
 * All of the library's own state lives here (scope, sort, view, chip, selection)
 * and nothing else needs to know about it. The file list, the player handle and
 * persistence come in as props from `MediaView`, so this component is pure UI
 * over a list of `MediaItem`s and can be dropped into either shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ContextMenu, confirmDialog, promptDialog, showToast, type MenuItem } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import MediaLibrarySidebar, { scopeKey, type LibraryScope, type LibraryShelfId } from './MediaLibrarySidebar';
import { MediaTrackingDashboard } from '../MediaTrackingDashboard';
import { buildLocalMediaTitleResolver } from '../../../mediaTrackingDashboard';
import { loadMediaProvidersDocument } from '../../../mediaProviderStore';
import MediaLibraryBrowser, { type LibraryViewMode } from './MediaLibraryBrowser';
import MediaDetailPanel from './MediaDetailPanel';
import MediaJobStrip from './MediaJobStrip';
import { invalidateMediaArtwork } from './useMediaArtwork';
import { buildLibraryEntries, isWatched, type LibraryEntry } from '../../../../shared/mediaLibraryEntries';
import { mediaCategory, type MediaCategory } from '../../../../shared/mediaCategories';
import { searchMediaHub } from '../../../../shared/mediaHub';
import { resolveSortForCategory, sortMediaItems, type MediaSortId } from '../../../../shared/mediaSorting';
import type { MediaItem } from '../../../../shared/types';
import './mediaLibrary.css';

const SCOPE_KEY = 'jp-medialib-scope';
const VIEW_KEY = 'jp-medialib-view';

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A library that cannot remember its last tab still works.
  }
}

/** The release kinds a chip row can offer, in display order. */
const CHIP_KINDS = ['episode', 'movie', 'ova', 'special'] as const;
type ChipKind = (typeof CHIP_KINDS)[number] | 'all';

function chipKindOf(entry: LibraryEntry): ChipKind | null {
  if (entry.category === 'movie') return 'movie';
  const kind = entry.primary.episodeKind;
  if (kind === 'movie' || kind === 'ova' || kind === 'special') return kind;
  if (kind === 'episode' || kind === 'season-pack') return 'episode';
  return null;
}

export interface MediaLibraryShellProps {
  items: readonly MediaItem[];
  /**
   * Free-text narrowing for the grid, already debounced by the caller. It filters
   * what the browser shows and deliberately does NOT filter `items`: the sidebar
   * counts and the empty-library branch describe the library, not the search, and
   * a search with no hits must read "no matches" rather than "import something".
   * Omitted by hosts that have no search box of their own.
   */
  query?: string;
  /** Id of whatever the player currently holds, for the active states. */
  currentId: string | null;
  /** Opens an item in the player. The shell never opens a series, only a file. */
  onPlay: (id: string) => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onRemove: (id: string) => Promise<unknown> | unknown;
  /** Persists per-item state; rejects so the optimistic toggle can roll back. */
  onSetItemState: (
    id: string,
    patch: Partial<Pick<MediaItem, 'favorite' | 'studyQueue' | 'note' | 'collections'>>,
  ) => Promise<unknown>;
  /**
   * Loads a stored subtitle track into the player. Omitted when the surface has
   * no player attached, in which case the drawer lists tracks without offering
   * to play them rather than showing a button that cannot work.
   */
  onUseSubtitle?: (mediaId: string, recordId: string) => Promise<void> | void;
  /** Label of the track the player currently has loaded. */
  activeSubtitleName?: string;
}

/** The three shelves that can be legitimately empty while the library is not. */
export type EmptyShelfId = 'favorites' | 'queue' | 'continue';

/**
 * Which shelf is empty *of its own accord*, as opposed to a search or a type chip having
 * emptied it — or `null` when the browser's "nothing matches the current filter" is the
 * honest answer.
 *
 * The distinction is the whole defect. `MediaLibraryBrowser` has one message for every
 * zero-result case, so "you have never favourited anything" and "your search matched none
 * of your favourites" rendered the byte-identical sentence, and the first of them told the
 * user to go and clear a filter they had not set. `scopedCount` is measured BEFORE the
 * search and the chip are applied, which is what separates them.
 *
 * Only these three shelves qualify: categories and collections are listed in the rail only
 * once something is in them, `home` and `recent` show everything, and `tracking` renders a
 * dashboard instead of the grid. An empty LIBRARY keeps its own richer empty state, which
 * offers the two import buttons this one deliberately has no equivalent of.
 */
export function pickEmptyShelf(
  scope: LibraryScope,
  scopedCount: number,
  itemCount: number,
): EmptyShelfId | null {
  if (itemCount === 0 || scopedCount > 0 || scope.kind !== 'shelf') return null;
  return scope.id === 'favorites' || scope.id === 'queue' || scope.id === 'continue'
    ? scope.id
    : null;
}

export default function MediaLibraryShell({
  items,
  query,
  currentId,
  onPlay,
  onImportFiles,
  onImportFolder,
  onRemove,
  onSetItemState,
  onUseSubtitle,
  activeSubtitleName,
}: MediaLibraryShellProps) {
  const { t, lang } = useT();

  const [scope, setScope] = useState<LibraryScope>(() => {
    const stored = readStored(SCOPE_KEY, 'shelf:home');
    const [kind, ...rest] = stored.split(':');
    const id = rest.join(':');
    if (kind === 'category') return { kind: 'category', id: id as MediaCategory };
    if (kind === 'collection' && id) return { kind: 'collection', id };
    return { kind: 'shelf', id: (id as LibraryShelfId) || 'home' };
  });
  const [view, setView] = useState<LibraryViewMode>(
    () => (readStored(VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid'),
  );
  const [chip, setChip] = useState<ChipKind>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortByCategory, setSortByCategory] = useState<Partial<Record<MediaCategory, MediaSortId>>>({});
  const [cardMenu, setCardMenu] = useState<{ entry: LibraryEntry; x: number; y: number } | null>(null);

  useEffect(() => store(SCOPE_KEY, scopeKey(scope)), [scope]);
  useEffect(() => store(VIEW_KEY, view), [view]);
  useEffect(() => setChip('all'), [scope]);

  /** The files this scope covers, before grouping. */
  const scoped = useMemo(() => {
    if (scope.kind === 'category') return items.filter((item) => mediaCategory(item) === scope.id);
    if (scope.kind === 'collection') {
      return items.filter((item) => (item.collections ?? []).includes(scope.id));
    }
    switch (scope.id) {
      case 'favorites':
        return items.filter((item) => item.favorite === true);
      case 'queue':
        return items.filter((item) => item.studyQueue === true);
      case 'continue':
        return items.filter((item) => (item.positionSec ?? 0) > 0 && !isWatched(item));
      case 'recent':
        return sortMediaItems(items, 'recently-added', 'desc');
      default:
        return items;
    }
  }, [items, scope]);

  /**
   * Sorting is per category, so switching from Anime to Music does not carry an
   * anime-only sort into a menu that no longer offers it.
   */
  const category: MediaCategory = useMemo(() => {
    if (scope.kind === 'category') return scope.id;
    const counts = new Map<MediaCategory, number>();
    for (const item of scoped) {
      const c = mediaCategory(item);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: MediaCategory = 'inbox';
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    return best;
  }, [scope, scoped]);

  const sort = resolveSortForCategory(sortByCategory[category], category);

  /**
   * The search narrows the scope, after the shelf and before the grouping, so a
   * hit inside a 26-episode series still surfaces that series as one card.
   * `category: 'all'` because the shelf above already decided the scope; letting
   * the search re-apply a category would silently ignore the rail.
   */
  const searched = useMemo(() => {
    const q = (query ?? '').trim();
    if (!q) return scoped;
    return searchMediaHub(scoped, { query: q, category: 'all' });
  }, [scoped, query]);

  const allEntries = useMemo(() => {
    const grouped = buildLibraryEntries(searched);
    // Sorting the entries means sorting by their representative file, so the
    // shared comparators apply unchanged to a grid of series.
    const order = sortMediaItems(grouped.map((entry) => entry.primary), sort);
    const rank = new Map(order.map((item, index) => [item.id, index]));
    return [...grouped].sort(
      (a, b) => (rank.get(a.primary.id) ?? 0) - (rank.get(b.primary.id) ?? 0),
    );
  }, [searched, sort]);

  const chips = useMemo(() => {
    const present = new Set<ChipKind>();
    for (const entry of allEntries) {
      const kind = chipKindOf(entry);
      if (kind) present.add(kind);
    }
    if (present.size < 2) return [];
    return [
      { id: 'all', label: t('media.chip.all') },
      ...CHIP_KINDS.filter((kind) => present.has(kind)).map((kind) => ({
        id: kind,
        label: t(`media.chip.${kind}`),
      })),
    ];
  }, [allEntries, lang]);

  const entries = useMemo(
    () => (chip === 'all' ? allEntries : allEntries.filter((entry) => chipKindOf(entry) === chip)),
    [allEntries, chip],
  );

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId)
      ?? allEntries.find((entry) => entry.id === selectedId)
      ?? null,
    [entries, allEntries, selectedId],
  );

  const title = useMemo(() => {
    if (scope.kind === 'category') return t(`media.category.${scope.id}`);
    if (scope.kind === 'collection') return scope.id;
    return t(`media.rail.${scope.id === 'recent' ? 'recentlyAdded' : scope.id === 'continue' ? 'continueWatching' : scope.id === 'queue' ? 'studyQueue' : scope.id}`);
  }, [scope, lang]);

  const activate = useCallback((entry: LibraryEntry) => {
    setSelectedId(entry.id);
    // A standalone file is unambiguous, so play it. A series opens its episode
    // list instead — the caller picks the episode from there.
    if (entry.grouping === 'none') onPlay(entry.primary.id);
  }, [onPlay]);

  /** Applies a patch to every file in an entry and reports the outcome once. */
  const patchEntry = useCallback(async (
    entry: LibraryEntry,
    patch: Partial<Pick<MediaItem, 'favorite' | 'studyQueue'>>,
    toastKey: string,
  ): Promise<void> => {
    const targets = [...entry.items, ...entry.extras];
    try {
      await Promise.all(targets.map((item) => onSetItemState(item.id, patch)));
      showToast({ message: t(toastKey, { title: entry.title }), kind: 'success' });
    } catch (error) {
      showToast({
        message: t('media.toast.saveFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
        kind: 'error',
      });
      throw error; // the drawer's optimistic toggle rolls back on this
    }
  }, [onSetItemState, t]);

  /** Applies a collection change to every file behind an entry. */
  const setCollections = useCallback(async (entry: LibraryEntry, name: string, add: boolean): Promise<void> => {
    const targets = [...entry.items, ...entry.extras];
    try {
      await Promise.all(targets.map((item) => {
        const current = item.collections ?? [];
        const next = add
          ? [...new Set([...current, name])]
          : current.filter((entryName) => entryName !== name);
        return onSetItemState(item.id, { collections: next });
      }));
      showToast({
        message: t(add ? 'media.toast.addedToCollection' : 'media.toast.removedFromCollection', { name }),
        kind: 'success',
      });
    } catch (error) {
      showToast({
        message: t('media.toast.saveFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
        kind: 'error',
      });
    }
  }, [onSetItemState, t]);

  const removeEntry = useCallback(async (entry: LibraryEntry): Promise<void> => {
    const targets = [...entry.items, ...entry.extras];
    // Confirmed, always. This used to fire straight off the overflow button,
    // which meant one stray click silently dropped a file from the library.
    const ok = await confirmDialog({
      title: t('media.remove.title'),
      message: t('media.remove.message', { title: entry.title, count: targets.length }),
      confirmLabel: t('media.remove.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      for (const item of targets) await onRemove(item.id);
      if (selectedId === entry.id) setSelectedId(null);
      showToast({ message: t('media.toast.removed', { title: entry.title }), kind: 'success' });
    } catch (error) {
      showToast({
        message: t('media.toast.removeFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
        kind: 'error',
      });
    }
  }, [onRemove, selectedId, t]);

  /** Collection names already in use, so the menu can offer them. */
  const collectionNames = useMemo(
    () => [...new Set(items.flatMap((item) => item.collections ?? []))].sort(),
    [items],
  );

  const menuItems = useMemo((): MenuItem[] => {
    const entry = cardMenu?.entry;
    if (!entry) return [];
    const inCollection = new Set(entry.primary.collections ?? []);
    return [
      {
        id: 'play',
        label: t('media.detail.play'),
        onSelect: () => onPlay(entry.primary.id),
      },
      { id: 'details', label: t('media.card.showDetails'), onSelect: () => setSelectedId(entry.id) },
      { id: 'sep-1', label: '', separator: true },
      ...collectionNames.map((name): MenuItem => ({
        id: `collection:${name}`,
        label: inCollection.has(name)
          ? t('media.collection.remove', { name })
          : t('media.collection.add', { name }),
        onSelect: () => void setCollections(entry, name, !inCollection.has(name)),
      })),
      {
        id: 'collection-new',
        label: t('media.collection.new'),
        onSelect: () => {
          void promptDialog({
            title: t('media.collection.newTitle'),
            message: t('media.collection.newMessage'),
            placeholder: t('media.collection.placeholder'),
          }).then((name) => {
            const trimmed = name?.trim();
            if (trimmed) void setCollections(entry, trimmed, true);
          });
        },
      },
      { id: 'sep-2', label: '', separator: true },
      {
        id: 'remove',
        label: t('media.remove'),
        danger: true,
        onSelect: () => void removeEntry(entry),
      },
    ];
  }, [cardMenu, collectionNames, onPlay, removeEntry, setCollections, t]);

  const menu = useCallback((entry: LibraryEntry, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setCardMenu({ entry, x: Math.round(rect.left), y: Math.round(rect.bottom + 4) });
  }, []);

  const emptyLibrary = items.length === 0;
  const tracking = scope.kind === 'shelf' && scope.id === 'tracking';

  const emptyShelf = pickEmptyShelf(scope, scoped.length, items.length);

  return (
    <div className="medialib-root">
      <MediaJobStrip />
      <div className="medialib-shell" data-drawer={selected && !tracking ? undefined : 'hidden'}>
        <MediaLibrarySidebar
          items={items}
          value={scope}
          onSelect={setScope}
          footer={t('media.rail.itemCount', { count: items.length })}
        />

        {tracking ? (
          // The §7 provider-tracking dashboard. Its own rail entry rather than
          // stacked above the grid, which is where it used to live and where it
          // pushed the actual library below the fold.
          <div className="medialib-browser medialib-browser--scroll">
            <MediaTrackingDashboard titleFor={buildLocalMediaTitleResolver(loadMediaProvidersDocument())} />
          </div>
        ) : (
        <MediaLibraryBrowser
          title={title}
          entries={entries}
          category={category}
          sort={sort}
          onSortChange={(next) => setSortByCategory((prev) => ({ ...prev, [category]: next }))}
          view={view}
          onViewChange={setView}
          chips={chips}
          activeChip={chip}
          onChipChange={(id) => setChip(id as ChipKind)}
          selectedId={selectedId}
          currentId={currentId}
          onActivate={activate}
          onMenu={menu}
          onAdd={onImportFiles}
          empty={emptyLibrary ? (
            <div className="medialib-empty" role="status">
              <Icon name="video" size={40} className="medialib-empty__icon" />
              <span className="medialib-empty__title">{t('media.empty.title')}</span>
              <span className="medialib-empty__hint">{t('media.empty.hint')}</span>
              <div className="medialib-empty__actions">
                <Button variant="primary" onClick={onImportFiles}>{t('media.openFile')}</Button>
                <Button onClick={onImportFolder}>{t('media.openFolder')}</Button>
              </div>
            </div>
          ) : emptyShelf ? (
            <div className="medialib-empty" role="status">
              <Icon name={emptyShelf === 'favorites' ? 'heart' : emptyShelf === 'queue' ? 'library' : 'player'} size={40} className="medialib-empty__icon" />
              <span className="medialib-empty__title">{t(`media.shelfEmpty.${emptyShelf}.title`)}</span>
              <span className="medialib-empty__hint">{t(`media.shelfEmpty.${emptyShelf}.hint`)}</span>
            </div>
          ) : undefined}
        />
        )}

        <ContextMenu
          open={cardMenu !== null}
          x={cardMenu?.x ?? 0}
          y={cardMenu?.y ?? 0}
          items={menuItems}
          onClose={() => setCardMenu(null)}
        />

        {selected && !tracking && (
          <MediaDetailPanel
            entry={selected}
            currentId={currentId}
            onUseSubtitle={onUseSubtitle}
            activeSubtitleName={activeSubtitleName}
            onClose={() => setSelectedId(null)}
            onPlay={onPlay}
            onToggleFavorite={(entry, next) => patchEntry(
              entry,
              { favorite: next },
              next ? 'media.toast.favorited' : 'media.toast.unfavorited',
            )}
            onToggleStudyQueue={(entry, next) => patchEntry(
              entry,
              { studyQueue: next },
              next ? 'media.toast.queued' : 'media.toast.dequeued',
            )}
            onRematch={async (target, hit) => {
              try {
                const result = await window.api.runMediaMetadata({
                  mediaIds: [...target.items, ...target.extras].map((i) => i.id),
                  force: true,
                  override: { provider: hit.provider, id: hit.id },
                });
                if (!result.ok) throw new Error(result.error ?? 'unknown');
                // Cached artwork for these ids is now the previous match's.
                invalidateMediaArtwork();
                showToast({ message: t('media.toast.rematched', { title: hit.title }), kind: 'success' });
              } catch (error) {
                showToast({
                  message: t('media.toast.saveFailed', {
                    reason: error instanceof Error ? error.message : String(error),
                  }),
                  kind: 'error',
                });
              }
            }}
            onNoteChange={async (item, note) => {
              try {
                await onSetItemState(item.id, { note });
                showToast({ message: t('media.toast.noteSaved'), kind: 'success' });
              } catch (error) {
                showToast({
                  message: t('media.toast.saveFailed', {
                    reason: error instanceof Error ? error.message : String(error),
                  }),
                  kind: 'error',
                });
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
