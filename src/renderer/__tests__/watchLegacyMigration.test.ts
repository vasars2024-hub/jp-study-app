import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WATCH_LEGACY_MIGRATION_KEY,
  migrateLegacyWatchStores,
  planWatchLegacyMigration,
  readWatchLegacyMark,
} from '../watchLegacyMigration';
import { DISCOVERY_SHORTLIST_KEY } from '../discoveryShortlistStore';
import { MEDIA_TRACKING_STORAGE_KEY } from '../mediaTrackingStore';

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
  };
}

const sent: unknown[][] = [];

beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  sent.length = 0;
  vi.stubGlobal('window', {
    api: { watchImportLegacy: async (rows: unknown[]) => { sent.push(rows); return { ok: true, added: rows.length, updated: 0, unchanged: 0, alreadyTracked: 0 }; } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  });
  localStorage.setItem(DISCOVERY_SHORTLIST_KEY, JSON.stringify([
    { id: 'jikan:52991', addedAt: 2000, candidate: { provider: 'jikan', id: 52991, title: 'Sousou no Frieren', genres: [] } },
    { id: 'manga:anilist:1', addedAt: 3000, candidate: { provider: 'anilist', id: 1, mediaType: 'manga', title: 'Some Manga', genres: [] } },
  ]));
  localStorage.setItem(MEDIA_TRACKING_STORAGE_KEY, JSON.stringify({
    version: 1,
    records: [{ identityId: 'no-catalogue-entry', contentType: 'anime', status: 'watching', updatedAt: '2026-05-01T00:00:00.000Z' }],
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('legacy list migration (renderer)', () => {
  it('plans the anime shortlist as Plan to watch, skips manga, and holds back unnamed tracking records', () => {
    const plan = planWatchLegacyMigration();
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ origin: 'shortlist', status: 'plan', malId: 52991 });
    expect(plan.unresolved).toBe(1);
    expect(plan.next.shortlist).toBe(3000);
    expect(plan.next.tracking).toBeLessThan(Date.parse('2026-05-01T00:00:00.000Z'));
  });

  it('sends once, records the mark, keeps the old keys, and sends nothing on a repeat', async () => {
    expect(await migrateLegacyWatchStores(() => 42)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(readWatchLegacyMark()).toMatchObject({ shortlist: 3000, at: 42 });
    expect(localStorage.getItem(DISCOVERY_SHORTLIST_KEY)).toContain('Frieren');
    expect(localStorage.getItem(MEDIA_TRACKING_STORAGE_KEY)).toContain('no-catalogue-entry');
    expect(await migrateLegacyWatchStores(() => 43)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(localStorage.getItem(WATCH_LEGACY_MIGRATION_KEY)).toBeTruthy();
  });
});
