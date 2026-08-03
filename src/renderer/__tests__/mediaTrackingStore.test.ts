// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const ADDED = Date.parse('2026-07-23T10:00:00.000Z');
const UPDATED = Date.parse('2026-07-23T12:30:00.000Z');

describe('media tracking store', () => {
  it('stamps addedAt once and bumps updatedAt on every write', async () => {
    const store = await import('../mediaTrackingStore');
    const created = store.upsertMediaTrackingEntry('mid-1', 'anime', { status: 'watching' }, ADDED);
    const first = created.records[0];
    expect(first.addedAt).toBe(new Date(ADDED).toISOString());
    expect(first.updatedAt).toBe(new Date(ADDED).toISOString());
    expect(first.status).toBe('watching');

    const updated = store.upsertMediaTrackingEntry('mid-1', 'anime', { favorite: true }, UPDATED);
    const second = updated.records[0];
    expect(second.addedAt).toBe(new Date(ADDED).toISOString());
    expect(second.updatedAt).toBe(new Date(UPDATED).toISOString());
    expect(second.status).toBe('watching');
    expect(second.favorite).toBe(true);
  });

  it('marks episodic progress and keeps marks sorted and de-duplicated', async () => {
    const store = await import('../mediaTrackingStore');
    store.upsertMediaTrackingEntry('mid-2', 'anime', {}, ADDED);
    const next = store.markMediaTrackingEpisodesWatched('mid-2', 'anime', [
      { season: 1, episode: 3 },
      { season: 1, episode: 1 },
      { season: 1, episode: 3 },
    ], UPDATED);
    const record = next.records[0];
    expect(record.progress.kind).toBe('episodic');
    if (record.progress.kind === 'episodic') {
      expect(record.progress.watchedEpisodes).toEqual([{ season: 1, episode: 1 }, { season: 1, episode: 3 }]);
    }
    expect(record.updatedAt).toBe(new Date(UPDATED).toISOString());
  });

  it('sets the watched flag on a unit content type', async () => {
    const store = await import('../mediaTrackingStore');
    const next = store.setMediaTrackingWatched('mid-3', 'movie', true, ADDED);
    const record = next.records[0];
    expect(record.progress.kind).toBe('unit');
    if (record.progress.kind === 'unit') expect(record.progress.watched).toBe(true);
    expect(record.addedAt).toBe(new Date(ADDED).toISOString());
  });

  it('removes a tracking entry and persists the empty document', async () => {
    const store = await import('../mediaTrackingStore');
    store.upsertMediaTrackingEntry('mid-4', 'anime', { status: 'planned' }, ADDED);
    const removed = store.removeMediaTrackingEntry('mid-4');
    expect(removed.records).toHaveLength(0);
    expect(store.loadMediaTrackingDocument().records).toHaveLength(0);
  });

  it('retains valid memory state when persisted JSON becomes corrupt', async () => {
    const store = await import('../mediaTrackingStore');
    store.upsertMediaTrackingEntry('mid-5', 'anime', { status: 'completed' }, ADDED);
    localStorage.setItem(store.MEDIA_TRACKING_STORAGE_KEY, '{bad');
    expect(store.loadMediaTrackingDocument().records.map((item) => item.identityId)).toEqual(['mid-5']);
  });

  it('persists partition-aware management corrections with an injected timestamp', async () => {
    const store = await import('../mediaTrackingStore');
    store.upsertMediaTrackingEntry('mid-6', 'anime', { rating: 70 }, ADDED);
    const result = store.manageMediaTrackingEntry(
      { identityId: 'mid-6', identityPartition: 'anime', contentType: 'anime' },
      { type: 'details/set', rating: 95, notes: 'Corrected' },
      UPDATED,
    );
    expect(result.ok && result.record).toMatchObject({ rating: 95, notes: 'Corrected', updatedAt: new Date(UPDATED).toISOString() });
    const before = localStorage.getItem(store.MEDIA_TRACKING_STORAGE_KEY);
    const rejected = store.manageMediaTrackingEntry(
      { identityId: 'mid-6', identityPartition: 'movie', contentType: 'anime' },
      { type: 'details/set', rating: 1 },
      UPDATED,
    );
    expect(rejected.ok).toBe(false);
    expect(localStorage.getItem(store.MEDIA_TRACKING_STORAGE_KEY)).toBe(before);
  });
});
