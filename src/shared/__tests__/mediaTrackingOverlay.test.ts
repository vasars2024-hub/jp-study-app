import { describe, expect, it } from 'vitest';
import { normalizeMediaProvidersDocument } from '../mediaProviders';
import { mergeStoredMediaResults } from '../mediaResultPresentation';
import { overlayMediaTracking } from '../mediaTrackingOverlay';

const merged = () => mergeStoredMediaResults(normalizeMediaProvidersDocument({
  providers: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  descriptors: [
    { id: 'a-f', providerId: 'a', providerItemId: 'frieren-a', title: 'Frieren', contentType: 'anime', identifiers: [{ namespace: 'mal', value: '52991' }] },
    { id: 'b-f', providerId: 'b', providerItemId: 'frieren-b', title: 'Sousou no Frieren', contentType: 'anime', identifiers: [{ namespace: 'mal', value: '52991' }] },
    { id: 'movie', providerId: 'a', providerItemId: 'frieren-movie', title: 'Frieren', contentType: 'movie' },
  ],
}).value);

describe('media tracking identity overlay', () => {
  it('attaches one tracking record and progress summary to the merged identity', () => {
    const results = merged();
    const anime = results.find((result) => result.contentType === 'anime');
    if (!anime) throw new Error('expected anime identity');
    const overlaid = overlayMediaTracking(results, { records: [{
      identityId: anime.identityId,
      contentType: 'anime',
      status: 'watching',
      progress: { totalEpisodes: 28, watchedEpisodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] },
    }] });
    expect(overlaid.find((result) => result.identityId === anime.identityId)?.tracking).toMatchObject({
      record: { status: 'watching' },
      progress: { watchedCount: 2, totalCount: 28, completionRatio: 2 / 28 },
    });
    expect(anime.sources).toHaveLength(2);
  });

  it('does not leak a colliding identity record across content-type partitions', () => {
    const movie = merged().find((result) => result.contentType === 'movie');
    if (!movie) throw new Error('expected movie identity');
    const [result] = overlayMediaTracking([movie], { records: [{
      identityId: movie.identityId, contentType: 'anime', status: 'completed',
    }] });
    expect(result.tracking).toEqual({ record: null, progress: null });
  });

  it('is deterministic and leaves untracked identities explicit', () => {
    const results = merged();
    expect(overlayMediaTracking(results, { records: [] })).toEqual(overlayMediaTracking(results, { records: [] }));
    expect(overlayMediaTracking(results, { records: [] }).every((result) => result.tracking.record === null)).toBe(true);
  });
});
