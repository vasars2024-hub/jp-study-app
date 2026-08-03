// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mutateUnifiedSearchTracking, persistUnifiedSearchTrackingMutation } from '../unifiedSearchTrackingMutation';

const target = { identityId: 'mid-frieren', identityPartition: 'anime', contentType: 'anime' as const };
const empty = { version: 1 as const, records: [] };
const AT = '2026-07-23T14:00:00.000Z';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => vi.unstubAllGlobals());

describe('Unified Search tracking mutation', () => {
  it('plans, pauses, and completes the same resolved identity deterministically', () => {
    const planned = mutateUnifiedSearchTracking(empty, target, { type: 'status/set', status: 'planned' }, AT);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const paused = mutateUnifiedSearchTracking(planned.value, target, { type: 'status/set', status: 'on-hold' }, AT);
    const completed = mutateUnifiedSearchTracking(paused.value, target, { type: 'status/set', status: 'completed' }, AT);
    expect(completed.ok && completed.record).toMatchObject({ identityId: 'mid-frieren', contentType: 'anime', status: 'completed', addedAt: AT, updatedAt: AT });
    expect(mutateUnifiedSearchTracking(paused.value, target, { type: 'status/set', status: 'completed' }, AT)).toEqual(completed);
  });

  it('updates episodic progress and promotes a planned title to watching', () => {
    const result = mutateUnifiedSearchTracking(empty, target, { type: 'progress/update', episode: { season: 1, episode: 2 } }, AT);
    expect(result.ok).toBe(true);
    if (!result.ok || result.record.progress.kind !== 'episodic') return;
    expect(result.record.status).toBe('watching');
    expect(result.record.progress.watchedEpisodes).toEqual([{ season: 1, episode: 2 }]);
  });

  it('completes unit progress without fabricating episodic marks', () => {
    const movie = { identityId: 'mid-movie', identityPartition: 'movie', contentType: 'movie' as const };
    const result = mutateUnifiedSearchTracking(empty, movie, { type: 'progress/update', watched: true }, AT);
    expect(result.ok && result.record).toMatchObject({ status: 'completed', progress: { kind: 'unit', watched: true } });
  });

  it('rejects cross-partition, cross-content-type, and incompatible progress writes', () => {
    expect(mutateUnifiedSearchTracking(empty, { ...target, identityPartition: 'movie' }, { type: 'status/set', status: 'planned' }, AT)).toMatchObject({ ok: false, reason: 'partition-mismatch', value: empty });
    const seeded = mutateUnifiedSearchTracking(empty, target, { type: 'status/set', status: 'planned' }, AT);
    if (!seeded.ok) throw new Error('expected seed');
    expect(mutateUnifiedSearchTracking(seeded.value, { ...target, contentType: 'movie', identityPartition: 'movie' }, { type: 'status/set', status: 'completed' }, AT)).toMatchObject({ ok: false, reason: 'content-type-mismatch' });
    expect(mutateUnifiedSearchTracking(empty, target, { type: 'progress/update', watched: true }, AT)).toMatchObject({ ok: false, reason: 'invalid-progress' });
  });

  it('persists only successful offline mutations', () => {
    const result = persistUnifiedSearchTrackingMutation(empty, target, { type: 'status/set', status: 'planned' }, Date.parse(AT));
    expect(result.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('jp-media-tracking-v1') ?? '{}').records[0].identityId).toBe('mid-frieren');
    const before = localStorage.getItem('jp-media-tracking-v1');
    const rejected = persistUnifiedSearchTrackingMutation(result.value, { ...target, identityPartition: 'movie' }, { type: 'status/set', status: 'completed' }, Date.parse(AT));
    expect(rejected.ok).toBe(false);
    expect(localStorage.getItem('jp-media-tracking-v1')).toBe(before);
  });
});
