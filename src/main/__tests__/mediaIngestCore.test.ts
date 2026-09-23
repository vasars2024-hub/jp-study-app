// @vitest-environment node
/**
 * `ingestMediaPaths` against an in-memory library: release identity, the
 * Scraper's hint, joining an already-matched show, one announcement per burst,
 * and the exact-id metadata lookup running before the library's own sweep.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { parseMediaFileName, inferMediaCategory } from '../../shared/mediaFileIdentity';
import type { MediaIngestedEvent } from '../../shared/mediaIngest';
import type { MediaItem } from '../../shared/types';
import { INGEST_COALESCE_MS, createMediaIngestCore, type MediaIngestHost, type MetadataOverride } from '../mediaIngestCore';

const MB = 1024 * 1024;
let clock = 0;
let queue: { fn: () => void; at: number; cancelled: boolean }[] = [];
let library: MediaItem[];
let fsFiles: Map<string, number>;
let events: MediaIngestedEvent[];
let overrides: Array<{ ids: string[]; override: MetadataOverride }>;
let sweeps: number;
let busy: boolean;
let handled: string[];

function schedule(fn: () => void, ms: number) {
  const job = { fn, at: clock + ms, cancelled: false };
  queue.push(job);
  return { cancel: () => { job.cancelled = true; } };
}

async function advance(ms: number): Promise<void> {
  const until = clock + ms;
  for (;;) {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    const due = queue.filter((job) => !job.cancelled && job.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock = Math.max(clock, due.at);
    due.cancelled = true;
    due.fn();
  }
  clock = until;
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** The same shape of work `media.ts`'s `addOrGetItem` does, without the JSON file. */
function addOrGetItem(absPath: string): MediaItem {
  const existing = library.find((entry) => entry.path === absPath);
  if (existing) return existing;
  const fileName = absPath.split(/[\\/]/).pop() ?? absPath;
  const parsed = parseMediaFileName(fileName);
  const item: MediaItem = {
    id: crypto.randomUUID(),
    title: fileName.replace(/\.[^.]+$/, ''),
    path: absPath,
    fileName,
    addedAt: clock,
    kind: /\.(mp3|flac)$/i.test(fileName) ? 'audio' : 'video',
    seriesKey: parsed.titleKey || undefined,
    seriesTitle: parsed.title || undefined,
    season: parsed.season ?? undefined,
    episode: parsed.episode ?? undefined,
    episodeKind: parsed.kind,
  };
  item.category = inferMediaCategory(item, parsed);
  library.unshift(item);
  return item;
}

const host: MediaIngestHost = {
  addOrGetItem: (absPath) => addOrGetItem(absPath),
  listItems: () => library.map((item) => ({ ...item })),
  patchEachItem: (entries) => {
    for (const [id, patch] of entries) {
      const item = library.find((entry) => entry.id === id);
      if (item) Object.assign(item, patch);
    }
  },
  broadcast: () => undefined,
  scheduleMetadataSweep: () => { sweeps += 1; },
  legacyWatchFolder: () => undefined,
};

function core() {
  return createMediaIngestCore(host, {
    now: () => clock,
    schedule,
    stat: (filePath) => {
      const size = fsFiles.get(filePath);
      if (size !== undefined) return { isFile: true, isDirectory: false, size };
      const isDir = [...fsFiles.keys()].some((file) => file.startsWith(`${filePath}/`));
      return isDir ? { isFile: false, isDirectory: true, size: 0 } : null;
    },
    walk: (dir) => [...fsFiles.keys()].filter((file) => file.startsWith(`${dir}/`)),
    emit: (event) => { events.push(event); },
    metadataBusy: () => busy,
    runMetadataOverride: async (ids, override) => { overrides.push({ ids, override }); },
    onFilesHandled: (paths) => { handled.push(...paths); },
    keyOf: (value) => value.toLowerCase(),
  });
}

beforeEach(() => {
  clock = 0;
  queue = [];
  library = [];
  fsFiles = new Map();
  events = [];
  overrides = [];
  sweeps = 0;
  busy = false;
  handled = [];
});

describe('ingestMediaPaths', () => {
  it('sorts a file by its release name and files it under the Scraper’s identity', async () => {
    const file = 'D:/dl/[SubsPlease] Sousou no Frieren - 05 (1080p).mkv';
    fsFiles.set(file, 1_300 * MB);
    const ingest = core();
    const result = await ingest.ingestMediaPaths([file], {
      malId: 52_991, anilistId: 154_587, title: 'Frieren', episodes: [5], category: 'anime',
    }, 'qbittorrent', { auto: true });
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({
      seriesKey: 'sousou no frieren',
      seriesTitle: 'Frieren',
      episode: 5,
      category: 'anime',
      malId: 52_991,
      anilistId: 154_587,
    });
    expect(handled).toEqual([file]);

    await advance(INGEST_COALESCE_MS);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'qbittorrent', summary: { title: 'Frieren', episode: 5, count: 1 } });
    // Exact lookup by AniList id, then the library's sweep (which runs subtitles).
    expect(overrides).toEqual([{ ids: [result.added[0].id], override: { provider: 'anilist', id: 154_587 } }]);
    expect(sweeps).toBe(1);
  });

  it('joins an already-matched show at once instead of asking the provider again', async () => {
    library.push({
      id: 'old',
      title: 'Frieren - 04',
      path: 'D:/lib/Frieren - 04.mkv',
      fileName: 'Frieren - 04.mkv',
      addedAt: 0,
      kind: 'video',
      seriesKey: 'frieren',
      episode: 4,
      anilistId: 154_587,
      malId: 52_991,
      metadataSource: 'anilist',
      metadataUpdatedAt: 1,
      posterPath: 'artwork/p.jpg',
      seriesTitle: 'Frieren: Beyond Journey’s End',
      category: 'anime',
    });
    const file = 'D:/dl/[SubsPlease] Sousou no Frieren - 05 (1080p).mkv';
    fsFiles.set(file, 1_300 * MB);
    const result = await core().ingestMediaPaths([file], { anilistId: 154_587, episodes: [5] }, 'qbittorrent');
    expect(result.added[0]).toMatchObject({
      seriesKey: 'frieren',
      seriesTitle: 'Frieren: Beyond Journey’s End',
      posterPath: 'artwork/p.jpg',
      metadataSource: 'anilist',
      episode: 5,
    });
    await advance(INGEST_COALESCE_MS);
    expect(overrides).toEqual([]);
  });

  it('announces a burst of arrivals as one event per source', async () => {
    const ingest = core();
    for (let episode = 1; episode <= 3; episode += 1) {
      const file = `W:/show/Show - 0${episode}.mkv`;
      fsFiles.set(file, 400 * MB);
      await ingest.ingestMediaPaths([file], undefined, 'watch-folder', { auto: true });
      await advance(300);
    }
    await advance(INGEST_COALESCE_MS);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toMatchObject({ count: 3, episode: 1, episodeEnd: 3 });
    expect(sweeps).toBe(1);
  });

  it('skips samples, partials and junk-sized files from automatic sources', async () => {
    fsFiles.set('W:/rel/Movie.2016.mkv', 4_000 * MB);
    fsFiles.set('W:/rel/Sample/movie.sample.mkv', 30 * MB);
    fsFiles.set('W:/rel/extra.mkv.part', 900 * MB);
    fsFiles.set('W:/rel/tiny.mkv', 10 * 1024);
    const result = await core().ingestMediaPaths(['W:/rel'], undefined, 'qbittorrent', { auto: true });
    expect(result.added.map((item) => item.fileName)).toEqual(['Movie.2016.mkv']);
  });

  it('adds nothing, and announces nothing, for a file already in the library', async () => {
    const file = 'W:/show/Show - 01.mkv';
    fsFiles.set(file, 400 * MB);
    const ingest = core();
    await ingest.ingestMediaPaths([file], undefined, 'watch-folder');
    await advance(INGEST_COALESCE_MS);
    events = [];
    const again = await ingest.ingestMediaPaths([file], undefined, 'watch-folder');
    expect(again.added).toEqual([]);
    expect(again.items).toHaveLength(1);
    await advance(INGEST_COALESCE_MS);
    expect(events).toEqual([]);
  });

  it('waits for a sweep already running before its exact lookup', async () => {
    busy = true;
    const file = 'D:/dl/Show - 01.mkv';
    fsFiles.set(file, 400 * MB);
    await core().ingestMediaPaths([file], { malId: 7 }, 'qbittorrent');
    await advance(INGEST_COALESCE_MS + 10_000);
    expect(overrides).toEqual([]);
    busy = false;
    await advance(5_000);
    expect(overrides).toHaveLength(1);
    expect(overrides[0].override).toEqual({ provider: 'jikan', id: 7 });
  });

  it('announces a download another path already added', async () => {
    const ingest = core();
    ingest.announce([addOrGetItem('D:/yt/Talk [abc].mp4')], 'download');
    await advance(INGEST_COALESCE_MS);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('download');
    // A yt-dlp download never had a metadata sweep; announcing it does not add one.
    expect(sweeps).toBe(0);
  });
});
