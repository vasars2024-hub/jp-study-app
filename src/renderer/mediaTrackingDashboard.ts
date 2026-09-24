import type { WatchStatus, WatchTitleView } from '../shared/watchLibrary';
import { projectMediaTracking, type MediaTrackingProjectionItem, type MediaTrackingProjectionSection } from '../shared/mediaTrackingProjections';
import type { MediaTrackingDocument } from '../shared/mediaTracking';
import { mergeStoredMediaResults } from '../shared/mediaResultPresentation';
import type { MediaProvidersDocument } from '../shared/mediaProviders';

export interface MediaTrackingDashboardCard extends MediaTrackingProjectionItem {
  title: string;
}

export interface MediaTrackingDashboardSection {
  id: MediaTrackingProjectionSection;
  label: string;
  count: number;
  cards: MediaTrackingDashboardCard[];
}

/** Builds an offline identity → display-title lookup from stored search snapshots. */
export function buildLocalMediaTitleResolver(document: MediaProvidersDocument): (identityId: string) => string {
  const titles = new Map(mergeStoredMediaResults(document).map((result) => [result.identityId, result.title.trim()]));
  return (identityId) => titles.get(identityId) ?? identityId;
}

/** Shared click/keyboard interaction contract for dashboard cards. */
export function selectMediaTrackingCard(
  identityId: string,
  setSelectedId: (value: string) => void,
  onNavigate?: (value: string) => void,
): void {
  setSelectedId(identityId);
  onNavigate?.(identityId);
}

const SECTION_DEFINITIONS: Array<{ id: MediaTrackingProjectionSection; label: string }> = [
  { id: 'watching', label: 'Watching' },
  { id: 'planned', label: 'Watchlist' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'completed', label: 'Completed' },
];

/** Builds deterministic, display-ready shelves from the local tracking snapshot. */
export function buildMediaTrackingDashboard(
  document: MediaTrackingDocument,
  titleFor: (identityId: string) => string = (identityId) => identityId,
): MediaTrackingDashboardSection[] {
  return SECTION_DEFINITIONS.map(({ id, label }) => {
    const cards = projectMediaTracking(document, id).map((item) => ({ ...item, title: titleFor(item.identityId) }));
    return { id, label, count: cards.length, cards };
  });
}

// ---------------------------------------------------------------------------
// The dashboard over the watch library (the one tracking store)
// ---------------------------------------------------------------------------

export type WatchDashboardSectionId = 'watching' | 'plan' | 'on_hold' | 'favorites' | 'completed';

export interface WatchDashboardSection {
  id: WatchDashboardSectionId;
  /** i18n key for the shelf title. */
  labelKey: string;
  count: number;
  /** At most `limit` cards; `count` is the full size. */
  cards: WatchTitleView[];
}

const WATCH_SECTIONS: Array<{ id: WatchDashboardSectionId; labelKey: string; statuses?: WatchStatus[] }> = [
  { id: 'watching', labelKey: 'watchLibrary.status.watching', statuses: ['watching', 'rewatching'] },
  { id: 'plan', labelKey: 'watchLibrary.status.plan', statuses: ['plan'] },
  { id: 'on_hold', labelKey: 'watchLibrary.status.on_hold', statuses: ['on_hold'] },
  { id: 'favorites', labelKey: 'media.tracking.section.favorites' },
  { id: 'completed', labelKey: 'media.tracking.section.recentlyCompleted', statuses: ['completed'] },
];

/**
 * Shelves over the watch library. Watching sorts by the soonest next episode,
 * then the most recently watched; plan-to-watch by what airs soonest, then
 * newest added; completed by most recently watched.
 */
export function buildWatchTrackingDashboard(titles: readonly WatchTitleView[], limit = 24): WatchDashboardSection[] {
  const recent = (a: WatchTitleView, b: WatchTitleView): number => (b.lastWatched ?? 0) - (a.lastWatched ?? 0);
  const airing = (a: WatchTitleView, b: WatchTitleView): number =>
    (a.nextAiring?.at ?? Infinity) - (b.nextAiring?.at ?? Infinity);
  return WATCH_SECTIONS.map(({ id, labelKey, statuses }) => {
    const matched = titles.filter((title) => (statuses ? statuses.includes(title.status) : !!title.favorite));
    const sorted = [...matched].sort((a, b) => {
      if (id === 'watching') return airing(a, b) || recent(a, b) || a.title.localeCompare(b.title);
      if (id === 'plan') return airing(a, b) || b.addedAt - a.addedAt || a.title.localeCompare(b.title);
      return recent(a, b) || a.title.localeCompare(b.title);
    });
    return { id, labelKey, count: matched.length, cards: sorted.slice(0, limit) };
  });
}
