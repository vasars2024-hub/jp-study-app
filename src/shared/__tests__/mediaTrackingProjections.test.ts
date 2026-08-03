import { describe, expect, it } from 'vitest';
import { normalizeMediaTrackingDocument } from '../mediaTracking';
import { projectMediaTracking, projectMediaTrackingLibrary, projectMediaTrackingWatchlist } from '../mediaTrackingProjections';

const document = normalizeMediaTrackingDocument({ records: [
  { identityId: 'zeta', contentType: 'anime', status: 'watching', updatedAt: '2026-07-02T00:00:00Z', progress: { totalEpisodes: 12, watchedEpisodes: [{ season: 1, episode: 2 }] } },
  { identityId: 'alpha', contentType: 'anime', status: 'planned', favorite: true },
  { identityId: 'beta', contentType: 'movie', status: 'completed', progress: { watched: true } },
] }).value;

describe('media tracking projections', () => {
  it('projects the full local library in stable identity order', () => {
    expect(projectMediaTrackingLibrary(document).map((item) => item.identityId)).toEqual(['alpha', 'beta', 'zeta']);
    expect(projectMediaTrackingLibrary(document).find((item) => item.identityId === 'zeta')?.progress.watchedCount).toBe(1);
  });

  it('projects the watchlist from planned status and favorites independently', () => {
    expect(projectMediaTrackingWatchlist(document).map((item) => item.identityId)).toEqual(['alpha']);
    expect(projectMediaTracking(document, 'favorites').map((item) => item.identityId)).toEqual(['alpha']);
  });

  it('does not depend on source record order', () => {
    const reversed = { ...document, records: [...document.records].reverse() };
    expect(projectMediaTrackingLibrary(reversed)).toEqual(projectMediaTrackingLibrary(document));
  });
});
