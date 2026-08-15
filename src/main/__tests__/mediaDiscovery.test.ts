// @vitest-environment node
/**
 * The one thing this file exists to hold down: a catalogue outage must not
 * reach the user as "nothing matched".
 *
 * Measured live 2026-08-16 — Jikan answered 504 ("Jikan failed to connect to
 * MyAnimeList") and AniList answered 403 ("temporarily disabled") — and a
 * Discover search for a 1,100-episode series rendered as an ordinary empty
 * result. Both provider clients swallow transport failures into `null`, so the
 * only place the difference can survive is the provenance returned here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderWork } from '../mediaProviderClients';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: () => undefined },
  net: { request: () => undefined },
}));

const providers = vi.hoisted(() => ({
  jikan: null as ProviderWork[] | null,
  anilist: null as ProviderWork[] | null,
}));

vi.mock('../mediaProviderClients', () => ({
  jikanSearch: async () => providers.jikan,
  anilistSearch: async () => providers.anilist,
  jikanBrowse: async () => [],
  anilistBrowse: async () => ({ works: [] }),
  jikanById: async () => null,
  seasonForMonth: () => 'WINTER',
}));

const { searchDiscovery } = await import('../mediaDiscovery');

const work = (provider: 'jikan' | 'anilist', id: number, title: string): ProviderWork => ({
  provider,
  id,
  titles: [title],
  displayTitle: title,
  genres: [],
} as unknown as ProviderWork);

describe('searchDiscovery provenance', () => {
  beforeEach(() => {
    providers.jikan = [];
    providers.anilist = [];
  });

  it('names both catalogues when neither answered', async () => {
    providers.jikan = null;
    providers.anilist = null;
    const result = await searchDiscovery('One Piece');
    expect(result.candidates).toEqual([]);
    expect(result.provenance.failures).toEqual(['jikan', 'anilist']);
    expect(result.provenance.servedBy).toBeNull();
  });

  it('does NOT report a failure when both answered with nothing', async () => {
    // The negative control for the case above. An empty answer is a real
    // answer; blaming a provider for it would make the outage message
    // meaningless the moment a user searches for a typo.
    const result = await searchDiscovery('zzzzzzzz');
    expect(result.candidates).toEqual([]);
    expect(result.provenance.failures).toEqual([]);
  });

  it('serves a one-provider list and still records the other as failed', async () => {
    providers.anilist = null;
    providers.jikan = [work('jikan', 21, 'One Piece')];
    const result = await searchDiscovery('One Piece');
    expect(result.candidates).toHaveLength(1);
    expect(result.provenance.servedBy).toBe('jikan');
    expect(result.provenance.failures).toEqual(['anilist']);
  });

  it('credits AniList when Jikan is the one that is down', async () => {
    providers.jikan = null;
    providers.anilist = [work('anilist', 21, 'One Piece')];
    const result = await searchDiscovery('One Piece');
    expect(result.provenance.servedBy).toBe('anilist');
    expect(result.provenance.failures).toEqual(['jikan']);
  });

  it('never calls a provider for an empty query', async () => {
    providers.jikan = null;
    providers.anilist = null;
    const result = await searchDiscovery('   ');
    expect(result.candidates).toEqual([]);
    // No request was made, so no provider can be blamed — an empty box is not
    // an outage.
    expect(result.provenance.failures).toEqual([]);
    expect(result.provenance.servedBy).toBeNull();
  });
});
