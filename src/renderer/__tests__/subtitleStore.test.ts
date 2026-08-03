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

type Store = typeof import('../subtitleStore');

/** A provider plus two Japanese tracks, both stamped at ADDED. */
async function seed(): Promise<Store> {
  const store = await import('../subtitleStore');
  store.upsertSubtitleProviderEntry({ id: 'alpha', name: 'Alpha', languages: ['ja', 'en'] });
  store.upsertSubtitleTrackEntry({ id: 'trk-a', providerId: 'alpha', identityId: 'mid-1', language: 'ja', quality: { accuracy: 90 } }, ADDED);
  store.upsertSubtitleTrackEntry({ id: 'trk-b', providerId: 'alpha', identityId: 'mid-1', language: 'ja', releaseGroup: 'B' }, ADDED);
  return store;
}

describe('subtitle catalogue store', () => {
  it('starts empty and persists a provider through a reload', async () => {
    const store = await import('../subtitleStore');
    expect(store.loadSubtitleProvidersDocument().providers).toEqual([]);
    store.upsertSubtitleProviderEntry({ id: 'alpha', name: 'Alpha' });
    expect(JSON.parse(localStorage.getItem(store.SUBTITLE_PROVIDERS_STORAGE_KEY) as string).providers).toHaveLength(1);
    expect(store.loadSubtitleProvidersDocument().providers[0].name).toBe('Alpha');
  });

  it('stamps addedAt once on insert and preserves it on later writes', async () => {
    const store = await seed();
    const first = store.loadSubtitleProvidersDocument().tracks.find((track) => track.id === 'trk-a');
    expect(first?.addedAt).toBe(new Date(ADDED).toISOString());

    const next = store.upsertSubtitleTrackEntry(
      { id: 'trk-a', providerId: 'alpha', identityId: 'mid-1', language: 'ja', translator: 'Yuki' },
      UPDATED,
    );
    const updated = next.tracks.find((track) => track.id === 'trk-a');
    expect(updated?.translator).toBe('Yuki');
    expect(updated?.addedAt).toBe(new Date(ADDED).toISOString());
  });

  it('ignores a track whose provider is unknown', async () => {
    const store = await seed();
    const next = store.upsertSubtitleTrackEntry({ id: 'ghost', providerId: 'nope', identityId: 'mid-1', language: 'ja' }, UPDATED);
    expect(next.tracks.map((track) => track.id).sort()).toEqual(['trk-a', 'trk-b']);
  });

  it('cascades a provider removal to its tracks and to any pin those tracks held', async () => {
    const store = await seed();
    store.selectSubtitleVersionEntry('mid-1', 'trk-a', UPDATED);
    expect(store.loadSubtitleManagementDocument().selections).toHaveLength(1);

    const next = store.removeSubtitleProviderEntry('alpha');
    expect(next.tracks).toEqual([]);
    expect(store.loadSubtitleManagementDocument().selections).toEqual([]);
  });

  it('un-pins a single removed track but leaves other selections alone', async () => {
    const store = await seed();
    store.upsertSubtitleTrackEntry({ id: 'trk-en', providerId: 'alpha', identityId: 'mid-1', language: 'en' }, ADDED);
    store.selectSubtitleVersionEntry('mid-1', 'trk-a', UPDATED);
    store.selectSubtitleVersionEntry('mid-1', 'trk-en', UPDATED);
    expect(store.loadSubtitleManagementDocument().selections).toHaveLength(2);

    store.removeSubtitleTrackEntry('trk-a');
    const selections = store.loadSubtitleManagementDocument().selections;
    expect(selections.map((selection) => selection.trackId)).toEqual(['trk-en']);
  });
});

describe('subtitle management store', () => {
  it('persists preference patches through validation', async () => {
    const store = await import('../subtitleStore');
    const next = store.updateSubtitlePreferences({ primaryLanguage: 'JA', secondaryLanguage: 'en', style: 'forced' });
    expect(next.preferences.primaryLanguage).toBe('ja');
    expect(next.preferences.style).toBe('forced');
    expect(store.loadSubtitleManagementDocument().preferences.secondaryLanguage).toBe('en');
  });

  it('stamps updatedAt when a pin is created or re-pointed, and leaves it alone otherwise', async () => {
    const store = await seed();
    const created = store.selectSubtitleVersionEntry('mid-1', 'trk-a', ADDED);
    expect(created.selections[0].updatedAt).toBe(new Date(ADDED).toISOString());

    const repeated = store.selectSubtitleVersionEntry('mid-1', 'trk-a', UPDATED);
    expect(repeated.selections[0].updatedAt).toBe(new Date(ADDED).toISOString());

    const moved = store.selectSubtitleVersionEntry('mid-1', 'trk-b', UPDATED);
    expect(moved.selections[0].trackId).toBe('trk-b');
    expect(moved.selections[0].updatedAt).toBe(new Date(UPDATED).toISOString());
  });

  it('refuses a pin for a track that is not on the shelf', async () => {
    const store = await seed();
    expect(store.selectSubtitleVersionEntry('mid-2', 'trk-a', UPDATED).selections).toEqual([]);
  });

  it('clears a pin by identity and language', async () => {
    const store = await seed();
    store.selectSubtitleVersionEntry('mid-1', 'trk-a', ADDED);
    expect(store.clearSubtitleVersionEntry('mid-1', 'ja').selections).toEqual([]);
  });

  it('stamps a saved offset and re-stamps only when the value changes', async () => {
    const store = await import('../subtitleStore');
    const saved = store.saveSubtitleOffsetEntry({ identityId: 'mid-1' }, 500, ADDED);
    expect(saved.adjustments[0]).toMatchObject({ offsetMs: 500, updatedAt: new Date(ADDED).toISOString() });

    const same = store.saveSubtitleOffsetEntry({ identityId: 'mid-1' }, 500, UPDATED);
    expect(same.adjustments[0].updatedAt).toBe(new Date(ADDED).toISOString());

    const changed = store.saveSubtitleOffsetEntry({ identityId: 'mid-1' }, 750, UPDATED);
    expect(changed.adjustments[0]).toMatchObject({ offsetMs: 750, updatedAt: new Date(UPDATED).toISOString() });
  });

  it('shifts relative to the inherited offset and clears by scope', async () => {
    const store = await import('../subtitleStore');
    store.saveSubtitleOffsetEntry({ identityId: 'mid-1' }, 1_000, ADDED);
    const shifted = store.shiftSubtitleOffsetEntry({ identityId: 'mid-1', season: 1, episode: 2 }, -250, UPDATED);
    const episodeEntry = shifted.adjustments.find((entry) => entry.episode === 2);
    expect(episodeEntry?.offsetMs).toBe(750);
    expect(episodeEntry?.updatedAt).toBe(new Date(UPDATED).toISOString());

    const cleared = store.clearSubtitleOffsetEntry({ identityId: 'mid-1', season: 1, episode: 2 });
    expect(cleared.adjustments.map((entry) => entry.offsetMs)).toEqual([1_000]);
  });

  it('falls back to the last good snapshot when storage holds garbage', async () => {
    const store = await import('../subtitleStore');
    store.updateSubtitlePreferences({ primaryLanguage: 'ja' });
    localStorage.setItem(store.SUBTITLE_MANAGEMENT_STORAGE_KEY, '{ not json');
    expect(store.loadSubtitleManagementDocument().preferences.primaryLanguage).toBe('ja');
  });

  it('refuses a document written by a newer app version', async () => {
    const store = await import('../subtitleStore');
    localStorage.setItem(store.SUBTITLE_PROVIDERS_STORAGE_KEY, JSON.stringify({ version: 99, providers: [{ id: 'x', name: 'X' }] }));
    expect(store.loadSubtitleProvidersDocument().providers).toEqual([]);
  });
});
