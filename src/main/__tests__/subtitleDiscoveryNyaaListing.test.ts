// @vitest-environment node
//
// What `subtitleDiscovery:nyaaList` asks the index — MAL pipeline gate 31.
//
// The harvest listing and this one run over the same index with the same
// predicates, and every difference between the two questions they ask has so far
// been a defect rather than a design: the alias reach (`ad142237`), the search
// text (`b7207748`), the `malId` that unlocks both (`f7c118c1`). This file owns
// the last one — `episodeCount`, the constraint that decides whether a
// whole-season subtitle pack is a `sub-pack` or invisible.
//
// The negative control is the point of the test, not a garnish: with an episode
// pinned the count must stay absent, or a 39-episode pack becomes a legal answer
// to "episode 7".

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/types';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaalist-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

/** Every search the listing made, in order — the alias walk needs the sequence. */
const searchCalls: Record<string, unknown>[] = [];
const handlers = new Map<string, (...args: unknown[]) => unknown>();
/** Per-title candidates, so a walk can be steered. Falls back to nothing. */
const candidatesByTitle = new Map<string, unknown[]>();

vi.mock('../subtitleNyaaSource', () => ({
  emptyRankDrops: () => ({ titleMatched: 0, seeders: 0, title: 0, muxed: 0, shape: 0, language: 0 }),
  nyaaAvailability: async () => ({ ok: true }),
  nyaaSearch: async () => [],
  nyaaSearchDetailed: async (input: Record<string, unknown>) => {
    searchCalls.push(input);
    return {
      candidates: candidatesByTitle.get(String(input.title)) ?? [],
      dropped: { titleMatched: 0, seeders: 0, title: 0, muxed: 0, shape: 0, language: 0 },
    };
  },
  nyaaFetch: async () => ({ ok: false, reason: 'not in this test' }),
  rememberNyaaCandidates: () => undefined,
  takeRememberedNyaaCandidate: () => null,
}));

const { registerSubtitleDiscoveryIpc } = await import('../subtitleDiscovery');
const { __setMalLibraryPathForTests } = await import('../malLibrary');

const ACQUISITION = { qbitUrl: 'http://127.0.0.1:8080', qbitUsername: 'u', qbitPassword: 'p' };

const mediaItem = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 'm1',
  title: 'JoJo no Kimyou na Bouken - Ougon no Kaze',
  seriesTitle: "JoJo's Bizarre Adventure: Golden Wind",
  path: 'C:/media/jojo.mkv',
  fileName: 'jojo.mkv',
  addedAt: 1,
  ...over,
} as MediaItem);

/** Writes a MAL library holding one anime row, and points the reader at it. */
function malLibraryWith(entry: Record<string, unknown>): void {
  const file = path.join(tmpRoot, `mal-library-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [entry] }), 'utf-8');
  __setMalLibraryPathForTests(() => file);
}

async function listFor(item: MediaItem): Promise<unknown> {
  registerSubtitleDiscoveryIpc({
    listItems: () => [item],
    patchItems: () => undefined,
  });
  const handler = handlers.get('subtitleDiscovery:nyaaList');
  if (typeof handler !== 'function') throw new Error('subtitleDiscovery:nyaaList was never registered');
  return handler({}, item.id, ACQUISITION, ['ja']);
}

beforeEach(() => {
  searchCalls.length = 0;
  candidatesByTitle.clear();
  handlers.clear();
  malLibraryWith({
    malId: 37991,
    media: 'anime',
    title: "JoJo's Bizarre Adventure: Golden Wind",
    altTitles: ['ジョジョの奇妙な冒険 黄金の風'],
    totalEpisodes: 39,
    episodesWatched: 39,
    score: 0,
    rewatching: false,
    origin: 'list',
  });
});

describe('subtitleDiscovery:nyaaList episodeCount', () => {
  it('asks the index for the whole work when the row names no episode', async () => {
    await listFor(mediaItem({ malId: 37991 }));

    expect(searchCalls.length).toBeGreaterThan(0);
    // Every alias in the walk carries it, not just the first: an alias-only hit
    // is exactly the case the JoJo pack lives in.
    for (const call of searchCalls) {
      expect(call.episode).toBeNull();
      expect(call.episodeCount).toBe(39);
    }
  });

  it('NEGATIVE CONTROL — a pinned episode gets no count, so a season pack cannot answer it', async () => {
    await listFor(mediaItem({ malId: 37991, episode: 7 }));

    expect(searchCalls.length).toBeGreaterThan(0);
    for (const call of searchCalls) {
      expect(call.episode).toBe(7);
      expect(call.episodeCount).toBeNull();
    }
  });

  it('an item with no MAL row asks with no count at all, and asks once', async () => {
    await listFor(mediaItem({ malId: undefined, seriesTitle: 'The Big O' }));

    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].episodeCount).toBeNull();
  });

  it('a still-airing show (MAL totalEpisodes 0) imposes no floor', async () => {
    malLibraryWith({
      malId: 37991,
      media: 'anime',
      title: "JoJo's Bizarre Adventure: Golden Wind",
      totalEpisodes: 0,
      episodesWatched: 0,
      score: 0,
      rewatching: false,
      origin: 'list',
    });
    await listFor(mediaItem({ malId: 37991 }));

    expect(searchCalls.length).toBeGreaterThan(0);
    expect(searchCalls[0].episodeCount).toBeNull();
  });

  it('still walks the aliases, and still stops on the first name carrying a pack', async () => {
    candidatesByTitle.set('ジョジョの奇妙な冒険 黄金の風', [
      {
        providerItemId: 'n1',
        releaseName: '[DBD-Raws] JOJO 黄金之风 [01-39] 简繁外挂字幕',
        route: 'sub-pack',
        sizeBytes: 92_069_272,
        seeders: 9,
        language: 'ja',
        score: 100,
        reasons: ['route:sub-pack'],
      },
    ]);
    const result = await listFor(mediaItem({ malId: 37991 })) as { candidates: unknown[] };

    expect(result.candidates).toHaveLength(1);
    // Two names asked, the alias found the pack, and the walk stopped there.
    expect(searchCalls.map((call) => call.title)).toEqual([
      "JoJo's Bizarre Adventure: Golden Wind",
      'ジョジョの奇妙な冒険 黄金の風',
    ]);
  });
});
