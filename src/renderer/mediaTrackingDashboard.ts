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
