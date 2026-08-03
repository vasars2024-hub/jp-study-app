import { normalizeMediaTrackingDocument, type MediaTrackingDocument } from '../../shared/mediaTracking';

/** Offline-only fixture used by renderer presentation tests and local previews. */
export const mediaTrackingDashboardFixture: MediaTrackingDocument = normalizeMediaTrackingDocument({ records: [
  { identityId: 'fixture-blue-period', contentType: 'anime', status: 'watching', progress: { totalEpisodes: 12, watchedEpisodes: [{ season: 1, episode: 4 }] }, schedule: { nextEpisodeNumber: 5, status: 'airing' } },
  { identityId: 'fixture-planetes', contentType: 'anime', status: 'planned', favorite: true },
  { identityId: 'fixture-movie', contentType: 'movie', status: 'completed', progress: { watched: true } },
] }).value;
