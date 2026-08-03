import { describe, expect, it } from 'vitest';
import { normalizeMediaTrackingDocument } from '../mediaTracking';
import { manageMediaTracking } from '../mediaTrackingManagement';

const episodic = normalizeMediaTrackingDocument({ records: [{
  identityId: 'mid-anime', contentType: 'anime', status: 'watching',
  progress: { kind: 'episodic', watchedEpisodes: [{ season: 1, episode: 2 }], totalEpisodes: 12, totalSeasons: 1 },
}] }).value;
const target = { identityId: 'mid-anime', identityPartition: 'anime', contentType: 'anime' as const };

describe('media tracking management', () => {
  it('edits user details and preferences without changing identity fields', () => {
    const result = manageMediaTracking(episodic, target, { type: 'details/set', favorite: true, rating: 88, notes: 'Rewatch', preferences: { audioLanguage: 'ja' } });
    expect(result.ok && result.record).toMatchObject({ identityId: 'mid-anime', contentType: 'anime', favorite: true, rating: 88, notes: 'Rewatch', preferences: { audioLanguage: 'ja' } });
  });

  it('sets totals and deterministically adds, corrects, and removes episode marks', () => {
    const totals = manageMediaTracking(episodic, target, { type: 'totals/set', totalEpisodes: 24, totalSeasons: 2 });
    if (!totals.ok) throw new Error('totals update failed');
    const added = manageMediaTracking(totals.value, target, { type: 'episode/add', mark: { season: 2, episode: 3 } });
    if (!added.ok) throw new Error('mark add failed');
    const corrected = manageMediaTracking(added.value, target, { type: 'episode/replace', from: { season: 2, episode: 3 }, to: { season: 2, episode: 1 } });
    if (!corrected.ok) throw new Error('mark correction failed');
    const removed = manageMediaTracking(corrected.value, target, { type: 'episode/remove', mark: { season: 1, episode: 2 } });
    expect(removed.ok && removed.record.progress).toEqual({ kind: 'episodic', watchedEpisodes: [{ season: 2, episode: 1 }], totalEpisodes: 24, totalSeasons: 2 });
    expect(manageMediaTracking(added.value, target, { type: 'episode/replace', from: { season: 2, episode: 3 }, to: { season: 2, episode: 1 } })).toEqual(corrected);
  });

  it('rejects partition, content-type, missing-record, and progress-shape violations', () => {
    expect(manageMediaTracking(episodic, { ...target, identityPartition: 'movie' }, { type: 'details/set', favorite: true })).toMatchObject({ ok: false, reason: 'partition-mismatch' });
    expect(manageMediaTracking(episodic, { ...target, identityPartition: 'movie', contentType: 'movie' }, { type: 'details/set', favorite: true })).toMatchObject({ ok: false, reason: 'content-type-mismatch' });
    expect(manageMediaTracking(episodic, { ...target, identityId: 'missing' }, { type: 'details/set', favorite: true })).toMatchObject({ ok: false, reason: 'not-found' });
    expect(manageMediaTracking(episodic, target, { type: 'unit/set', watched: true })).toMatchObject({ ok: false, reason: 'invalid-progress' });
  });
});
