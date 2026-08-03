import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectMediaTrackingSources } from '../../shared/mediaTrackingSources';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: () => undefined,
    clear: () => values.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
});

describe('tracking source projections and controls', () => {
  it('orders rows and derives enabled/new episode signals', () => {
    const rows = projectMediaTrackingSources({
      version: 1,
      sourceOrder: ['site-b', 'site-a'],
      disabledSourceIds: ['site-a'],
      rows: [
        { identityId: 'anime-1', sourceId: 'site-a', sourceName: 'A', enabled: true, status: 'working', reliabilityScore: 90, lastCheckedAt: '2026-07-23', newEpisodeDetected: true, nextEpisodeNumber: 4 },
        { identityId: 'anime-1', sourceId: 'site-b', sourceName: 'B', enabled: true, status: 'slow', reliabilityScore: 60, lastCheckedAt: null, newEpisodeDetected: false, nextEpisodeNumber: null },
      ],
    });
    expect(rows.map((row) => row.sourceId)).toEqual(['site-b', 'site-a']);
    expect(rows[1].enabled).toBe(false);
    expect(rows[1].newEpisodeDetected).toBe(true);
  });

  it('persists enable, order, health edits, and a local audit trail', async () => {
    const store = await import('../mediaTrackingSourcesStore');
    store.saveMediaTrackingSourcesDocument({ version: 1, sourceOrder: ['a', 'b'], rows: [{ identityId: 'x', sourceId: 'a', sourceName: 'A' }] });
    expect(store.setTrackingSourceEnabled('a', false).disabledSourceIds).toEqual(['a']);
    expect(store.setTrackingSourceOrder(['b', 'a']).sourceOrder).toEqual(['b', 'a']);
    expect(store.updateTrackingSource('x', 'a', { status: 'working', reliabilityScore: 91, newEpisodeDetected: true, nextEpisodeNumber: 3 }).rows[0]).toMatchObject({ status: 'working', reliabilityScore: 91, newEpisodeDetected: true, nextEpisodeNumber: 3 });
    expect(store.loadTrackingSourceAudit()).toHaveLength(1);
    expect(store.loadTrackingSourceAudit()[0]).toMatchObject({ identityId: 'x', sourceId: 'a', sourceName: 'A', patch: { status: 'working', reliabilityScore: 91, newEpisodeDetected: true, nextEpisodeNumber: 3 } });
  });
});
