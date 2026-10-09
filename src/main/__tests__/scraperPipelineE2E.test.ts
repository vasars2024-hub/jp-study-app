// @vitest-environment node
//
// The scraper pipeline, end to end, against a simulated world.
//
// Owner's brief: "make sure a simulated thing works — a simulated website that
// scrapes and then goes through the whole pipeline." Everything below runs for
// real except the world it talks to:
//
//   fixture site (127.0.0.1)  ->  scrape: a site rule over the site's own
//   episode page, and the catalogue path whose torrent-index search reads the
//   fixture's Nyaa-shaped RSS  ->  qbitSend to a fake qBittorrent WebUI  ->  the
//   real media-ingest service (registerMediaIngest: completion poller, handoff
//   ledger, file resolution, watch folders)  ->  sidecar subtitles beside the
//   finished download  ->  study cues  ->  a sentence clip cut by the bundled
//   ffmpeg.
//
// The renderer half (cue + clip -> mineToStudy -> deck) is
// src/renderer/__tests__/scraperPipelineMiningE2E.test.ts.
//
// Seams, and only these: `electron` is stubbed with userData in a temp dir; the
// catalogue (a public HTTPS API) answers with an invented work; every politeness
// delay is zero in the run's settings. Nothing leaves 127.0.0.1 — magnets carry
// no trackers, and the qBittorrent password is generated per run.
//
// Each `probe:` block pins one audited bug. A probe written `it.fails` is a bug
// still open; the package that fixes it flips it to `it`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ScrapeJobEvent, ScrapeResult, TorrentRow } from '../../shared/scraperResults';
import type { MediaItem } from '../../shared/types';
import type { MediaIngestState } from '../../shared/mediaIngest';
import { MEDIA_INGEST_CHANNELS } from '../../shared/mediaIngest';
import { parseMediaFileName } from '../../shared/mediaFileIdentity';
import { createDefaultScraperSettingsDocument, resolveScraperSettings, type ScraperSettings } from '../../shared/scraperSettings';
import { DEFAULT_SITE_RULE, type ScraperSiteRule } from '../../shared/scraperSiteRules';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  type ScraperQbittorrentSettings,
  type ScraperSourceEntry,
} from '../../shared/scraperSourceSettings';
import { parseStudySubtitles, parseSubtitles } from '../../shared/subtitleCues';
import { cancelScrape, jobResult, pageFailuresNote, resetScrapeJobs, startScrape } from '../scraper/engine';
import { onAcquisitionHandoff, type AcquisitionHandoff } from '../scraper/handoffs';
import { probeHttp, scraperRequest } from '../scraper/http';
import { resetScraperHttpCache } from '../scraper/httpCache';
import { resetScraperLogs } from '../scraper/logBus';
import { qbitAddTorrentFiles, qbitPollTorrents, qbitSend, resetQbitSessions } from '../scraper/qbittorrent';
import { makeTorrent } from './e2eFixtures/torrentFixture';
import { resetRobotsCache } from '../scraper/robots';
import { setScraperSecret } from '../scraper/credentials';
import { setScraperStoreRoot } from '../scraper/store';
import { magnetFor, parseTorrentFeed } from '../scraper/torrents';
import { __resetMediaIngestForTests, registerMediaIngest, type MediaIngestHost } from '../mediaIngest';
import { extractSentenceClip } from '../sentenceAudioBatch';
import { findSidecarSubtitles } from '../subtitleLocalSources';
import { pickSidecarSubtitleForLanguage } from '../subtitleSidecar';
import { startFakeQbit, type FakeQbit } from './e2eFixtures/fakeQbit';
import { startFixtureSite, type FixtureSite } from './e2eFixtures/fixtureSite';
import { HAVE_FFMPEG, ensureTestMedia, placeMedia } from './e2eFixtures/media';
import {
  ASS_JA,
  CUE_LINES,
  EPISODES,
  NUMBERED_SHOW,
  SHOW,
  SRT_JA,
  SRT_JA_PLAIN,
  encodeLegacy,
  encodeUtf16Le,
} from './e2eFixtures/texts';

// ------------------------------------------------------------------ seams ---

const h = vi.hoisted(() => {
  const tmp = (process.env.TEMP ?? process.env.TMPDIR ?? '/tmp').replace(/\\/g, '/');
  return {
    userData: `${tmp}/gum-e2e/main-${process.pid}-${Date.now().toString(36)}`,
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    appListeners: [] as Array<[string, () => void]>,
    catalogueQueries: [] as string[],
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => h.userData,
    getAppPath: () => process.cwd(),
    getAppMetrics: () => [],
    getVersion: () => '0.0.0-e2e',
    isPackaged: false,
    on: (event: string, listener: () => void) => { h.appListeners.push([event, listener]); },
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => { h.handlers.set(channel, fn); },
    on: () => undefined,
    removeHandler: (channel: string) => { h.handlers.delete(channel); },
  },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null, fromWebContents: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  // Test-only "encryption": reversible, so the real credential vault round-trips.
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`e2e:${plain}`, 'utf8'),
    decryptString: (sealed: Buffer) => sealed.toString('utf8').replace(/^e2e:/, ''),
  },
  shell: { openPath: async () => '', showItemInFolder: () => undefined },
}));

// The catalogue is a public HTTPS API; it answers here with an invented work.
vi.mock('../scraper/catalogue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scraper/catalogue')>();
  const work = (title: string, id: number): import('../scraper/catalogue').CatalogueWork => ({
    provider: 'anilist',
    id,
    titleEn: title,
    titleJa: 'ガムテストショー',
    titleRomaji: title,
    synopsis: '',
    genres: [],
    studios: [],
    format: 'TV',
    status: 'FINISHED',
    season: '',
    episodeCount: 4,
    averageDurationSec: 4,
    contentRating: '',
    communityRating: 0,
    malId: null,
    aniListId: null,
    officialSite: '',
    posterUrl: '',
    posterVariants: {},
    bannerUrl: '',
    year: 2024,
  });
  return {
    ...actual,
    searchCatalogue: async (query: string) => {
      h.catalogueQueries.push(query);
      return [query.includes('100') ? work('Gum Test Show 100', 990_002) : work('Gum Test Show', 990_001)];
    },
    catalogueDetail: async (w: import('../scraper/catalogue').CatalogueWork) => w,
    catalogueEpisodes: async (
      _w: unknown,
      _correlationId: string,
      onPage?: (page: number, count: number) => void,
    ) => {
      onPage?.(1, 4);
      return [
        { n: 1, title: 'はじめての朝' },
        { n: 2, title: '雨の日の約束' },
        { n: 3, title: '第三の扉' },
        { n: 4, title: '夜明け前' },
      ].map(({ n, title }) => ({
        number: n,
        titleEn: title,
        titleJa: title,
        titleRomaji: title,
        airDate: null,
        filler: false,
        recap: false,
        url: '',
        thumbnailUrl: '',
      }));
    },
  };
});

// ------------------------------------------------------------------ world ---

const USER_DATA = h.userData;
// Not `downloads`: that is the app's own download folder (MEDIA_DOWNLOAD_DIRECTORY).
const DOWNLOADS = path.join(USER_DATA, 'qbit-downloads');
const REMOTE_DOWNLOADS = path.join(USER_DATA, 'remote-downloads');
const MINED = path.join(USER_DATA, 'mined');
const SCRATCH = path.join(USER_DATA, 'scratch');
const PASSWORD = crypto.randomBytes(12).toString('hex');
const CREDENTIAL_REF = 'e2e-qbit';

let media = '';
let site: FixtureSite;
let qbit: FakeQbit;
const library: MediaItem[] = [];
const handoffs: AcquisitionHandoff[] = [];

/** The library the ingest writes into — what media.ts's addOrGetItem does, minus the JSON file. */
const host: MediaIngestHost = {
  addOrGetItem(absPath) {
    const existing = library.find((item) => item.path === absPath);
    if (existing) return existing;
    const fileName = path.basename(absPath);
    const parsed = parseMediaFileName(fileName);
    const item = {
      id: crypto.randomUUID(),
      title: fileName.replace(/\.[^.]+$/, ''),
      path: absPath,
      fileName,
      addedAt: Date.now(),
      kind: 'video',
      seriesKey: parsed.titleKey || undefined,
      seriesTitle: parsed.title || undefined,
      season: parsed.season ?? undefined,
      episode: parsed.episode ?? undefined,
      episodeKind: parsed.kind,
    } as MediaItem;
    library.push(item);
    return item;
  },
  listItems: () => library.map((item) => ({ ...item })),
  patchEachItem(entries) {
    for (const [id, patch] of entries) {
      const item = library.find((row) => row.id === id);
      if (item) Object.assign(item, patch);
    }
  },
  broadcast: () => undefined,
  scheduleMetadataSweep: () => undefined,
  legacyWatchFolder: () => undefined,
};

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`No IPC handler for ${channel}`);
  return Promise.resolve(handler({ sender: null }, ...args) as T);
}

function siteRule(): ScraperSiteRule {
  return {
    ...DEFAULT_SITE_RULE,
    id: 'fixture',
    host: '127.0.0.1',
    sampleUrl: `${site.base}/shows/gum-test-show`,
    enabled: true,
    episodeSelector: 'table.eps tr.ep',
    titleSelector: '.title',
    linkSelector: 'a.mag',
    numberSelector: 'th.no',
    // P8: follow the site's own "next page" link, at most five pages.
    nextPageSelector: 'a[rel=next]', maxPages: 5,
  };
}

function indexEntry(): ScraperSourceEntry {
  return {
    id: 'fixture-index',
    label: 'Fixture index',
    // A scheme and port: the index is a local service over plain http.
    host: site.base,
    kind: 'torrent',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: false,
    supportsSubtitles: true,
    health: 'ok',
    lastCheckedAt: null,
    notes: '',
  };
}

/** The run's profile: real defaults with every politeness delay at zero. */
function e2eSettings(): ScraperSettings {
  const s = resolveScraperSettings(createDefaultScraperSettingsDocument());
  s.network = {
    ...s.network,
    retryAttempts: 2,
    retryDelayMs: 0,
    randomDelayMinMs: 0,
    randomDelayMaxMs: 0,
    requestTimeoutMs: 4_000,
  };
  s.safety = { ...s.safety, crawlDelayMs: 0, maxRequestsPerMinute: 6_000, respectRobotsTxt: true };
  // P8: the private-address guard is on by default; this run targets 127.0.0.1
  // on purpose, so it says so through the setting — not through a code path.
  s.safety.allowPrivateNetwork = true;
  s.cache = { ...s.cache, htmlEnabled: false, metadataEnabled: false, thumbnailsEnabled: false };
  s.extraction = { ...s.extraction, siteRules: [siteRule()] };
  s.sources = { ...s.sources, mode: 'torrent', entries: [indexEntry()], order: ['fixture-index'] };
  return s;
}

interface Run {
  jobId: string;
  events: ScrapeJobEvent[];
  result: ScrapeResult | null;
  error: string;
}

function isTerminal(event: ScrapeJobEvent): boolean {
  return event.kind === 'done'
    || event.kind === 'error'
    || (event.kind === 'stage' && (event.stage === 'cancelled' || event.stage === 'failed'));
}

async function scrape(target: string, settings = e2eSettings()): Promise<Run> {
  const events: ScrapeJobEvent[] = [];
  const jobId = startScrape(
    { request: { targetUrl: target, profileId: 'e2e' }, settings },
    (_id, event) => events.push(event),
  );
  await vi.waitFor(() => {
    if (!events.some(isTerminal)) throw new Error('scrape still running');
  }, { timeout: 10_000, interval: 10 });
  // An error event follows its failed stage on the same tick.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const error = events.find((e): e is Extract<ScrapeJobEvent, { kind: 'error' }> => e.kind === 'error')?.message ?? '';
  return { jobId, events, result: jobResult(jobId), error };
}

function qbitConfig(port: number, extra: Partial<ScraperQbittorrentSettings> = {}): ScraperQbittorrentSettings {
  return {
    ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    enabled: true,
    scheme: 'http',
    host: '127.0.0.1',
    port,
    username: 'admin',
    passwordRef: CREDENTIAL_REF,
    category: 'gum-e2e',
    ...extra,
  };
}

/** Index rows with their trackers removed: nothing may announce to a real tracker. */
function withoutTrackers(rows: readonly TorrentRow[]): TorrentRow[] {
  return rows.map((row) => ({ ...row, magnet: magnetFor(row.infoHash, row.name, []) }));
}

function rowEpisodes(rows: readonly TorrentRow[]): Record<string, number[]> {
  return Object.fromEntries(rows.map((row) => [row.id, [parseMediaFileName(`${row.name}.mkv`).episode ?? 0]]));
}

async function waitForLibrary(count: number, timeout = 8_000): Promise<void> {
  await vi.waitFor(async () => {
    await invoke(MEDIA_INGEST_CHANNELS.rescan).catch(() => undefined);
    if (library.length < count) throw new Error(`library has ${library.length} of ${count}`);
  }, { timeout, interval: 50 });
}

// ------------------------------------------------------------------ setup ---

beforeAll(async () => {
  if (!HAVE_FFMPEG) return;
  fs.mkdirSync(USER_DATA, { recursive: true });
  media = (await ensureTestMedia()) ?? '';
  setScraperStoreRoot(path.join(USER_DATA, 'scraper'));
  resetScraperLogs();
  resetScraperHttpCache();
  resetRobotsCache();
  resetScrapeJobs();
  resetQbitSessions();
  site = await startFixtureSite({ mediaPath: media });
  qbit = await startFakeQbit({
    password: PASSWORD,
    mediaPath: media,
    defaultSavePath: DOWNLOADS,
    version: '5',
    completeAfterPolls: 1,
    sidecars: { '.ja.srt': SRT_JA, '.ja.ass': ASS_JA },
  });
  const stored = await setScraperSecret(CREDENTIAL_REF, PASSWORD);
  if (!stored.ok) throw new Error(stored.message);
  onAcquisitionHandoff((handoff) => handoffs.push(handoff));
}, 30_000);

afterAll(async () => {
  for (const [event, listener] of h.appListeners) {
    if (event === 'will-quit') {
      try {
        listener();
      } catch {
        /* best effort */
      }
    }
  }
  __resetMediaIngestForTests();
  await site?.close();
  await qbit?.close();
  setScraperStoreRoot(null);
  // Give fs.watch handles a moment to release before the tree goes.
  await new Promise((resolve) => setTimeout(resolve, 50));
  fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// --------------------------------------------------------------- pipeline ---

describe.skipIf(!HAVE_FFMPEG)('scraper pipeline E2E: site -> scrape -> qBittorrent -> ingest -> subtitles -> clip', () => {
  let releases: TorrentRow[] = [];

  it('scrapes the fixture episode page with a site rule (Japanese titles, 第N話 numbers)', async () => {
    const run = await scrape(`${site.base}/shows/gum-test-show`);
    expect(run.error).toBe('');
    const rows = run.result?.episodes ?? [];
    expect(rows.slice(0, 2).map((row) => [row.number, row.titleEn])).toEqual([
      [1, 'はじめての朝'],
      [2, '雨の日の約束'],
    ]);
    expect(rows[0].url).toMatch(/^magnet:\?xt=urn:btih:a1a1/);
    // robots.txt was consulted before the page.
    expect(site.hits.findIndex((hit) => hit.startsWith('GET /robots.txt')))
      .toBeLessThan(site.hits.findIndex((hit) => hit.startsWith('GET /shows/gum-test-show')));
  });

  it('runs the catalogue path, whose torrent-index search reads the fixture feed over http', async () => {
    const run = await scrape(SHOW);
    expect(run.error).toBe('');
    const result = run.result!;
    expect(result.episodes.map((row) => row.number)).toEqual([1, 2, 3, 4]);
    expect(result.torrents.map((row) => row.infoHash).sort()).toEqual(EPISODES.map((e) => e.hash).sort());
    expect(site.hits.some((hit) => hit.startsWith('GET /?page=rss'))).toBe(true);
    // Every episode row found its own release.
    expect(result.episodes.every((row) => row.sourceId === 'index')).toBe(true);
    releases = withoutTrackers(result.torrents);
    expect(releases.every((row) => !row.magnet.includes('tr='))).toBe(true);
  });

  it('starts the real media-ingest service against the fake qBittorrent', async () => {
    registerMediaIngest(host);
    await invoke(MEDIA_INGEST_CHANNELS.syncQbit, qbitConfig(qbit.port));
    await vi.waitFor(async () => {
      const state = await invoke<MediaIngestState>(MEDIA_INGEST_CHANNELS.getState);
      if (state.qbit.status !== 'watching') throw new Error(`qbit status ${state.qbit.status}`);
    }, { timeout: 5_000, interval: 25 });
  });

  it('sends the releases to qBittorrent with their identity, and the ledger hears about it', async () => {
    const report = await qbitSend({
      config: qbitConfig(qbit.port),
      rows: releases,
      ingest: { hint: { title: SHOW, provider: 'scraper', season: 1 }, rowEpisodes: rowEpisodes(releases), via: 'e2e' },
    });
    expect(report).toMatchObject({ sent: 4, failed: 0, skipped: 0 });
    expect(handoffs).toHaveLength(1);
    expect(qbit.torrents.size).toBe(4);
    expect([...qbit.torrents.values()].every((t) => t.category === 'gum-e2e')).toBe(true);
  });

  it('imports every finished download into the library, filed under the show and episode', async () => {
    await waitForLibrary(4);
    const items = [...library].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    expect(items.map((item) => item.episode)).toEqual([1, 2, 3, 4]);
    expect(new Set(items.map((item) => item.seriesTitle))).toEqual(new Set([SHOW]));
    for (const item of items) {
      expect(path.dirname(item.path)).toBe(DOWNLOADS);
      expect(fs.statSync(item.path).size).toBeGreaterThan(2 * 1024 * 1024);
    }
  });

  it('re-logs in when the qBittorrent session expires', async () => {
    const before = qbit.logins();
    qbit.expireSessions();
    const polled = await qbitPollTorrents({ config: qbitConfig(qbit.port) });
    expect(polled.ok).toBe(true);
    expect(qbit.logins()).toBe(before + 1);
  });

  it('finds the sidecar subtitles beside the download and parses Japanese study cues', () => {
    const episode1 = library.find((item) => item.episode === 1)!;
    const sidecars = findSidecarSubtitles(episode1.path);
    expect(sidecars.map((s) => [s.format, s.language]).sort()).toEqual([['ass', 'ja'], ['srt', 'ja']]);
    const pick = pickSidecarSubtitleForLanguage(episode1.path, 'ja');
    expect(pick?.name.endsWith('.ja.srt')).toBe(true);
    const cues = parseStudySubtitles(pick!.text).cues;
    expect(cues.map((cue) => cue.text)).toEqual([...CUE_LINES]);
    expect(cues[1]).toMatchObject({ start: 1.5, end: 2.8 });
  });

  it('cuts the sentence audio for a cue with the bundled ffmpeg', async () => {
    const episode1 = library.find((item) => item.episode === 1)!;
    const pick = pickSidecarSubtitleForLanguage(episode1.path, 'ja')!;
    const cue = parseStudySubtitles(pick.text).cues[1];
    fs.mkdirSync(MINED, { recursive: true });
    const clip = await extractSentenceClip(
      { filePath: episode1.path },
      { id: 'e2e-cue-2', startMs: cue.start * 1000, endMs: cue.end * 1000 },
      MINED,
    );
    expect(clip.ok).toBe(true);
    expect(fs.statSync(clip.audioPath!).size).toBeGreaterThan(1_000);
  });
});

// ----------------------------------------------------------------- probes ---
//
// One block per work package. A package edits only its own block.

describe.skipIf(!HAVE_FFMPEG)('probe: P1 encoding', () => {
  it('decodes Shift_JIS when the charset is in the Content-Type header', async () => {
    const run = await scrape(`${site.base}/sjis/header`);
    expect(run.result?.episodes[0]?.titleEn).toBe('はじめての朝');
  });

  it('decodes Shift_JIS declared only by <meta http-equiv>', async () => {
    const run = await scrape(`${site.base}/sjis/meta`);
    expect(run.result?.episodes[0]?.titleEn).toBe('はじめての朝');
  });

  it('decodes Shift_JIS declared only by <meta charset>', async () => {
    const run = await scrape(`${site.base}/sjis/meta-charset`);
    expect(run.result?.episodes[0]?.titleEn).toBe('はじめての朝');
  });

  it('decodes an EUC-JP feed declared only by <?xml encoding?>', async () => {
    const response = await scraperRequest(`${site.base}/rss-eucjp`, { correlationId: 'e2e' });
    const rows = parseTorrentFeed(response.body, { tracker: 'fixture', trackers: [] });
    expect(rows[0]?.name).toContain('日本語');
  });

  it('reads a Shift_JIS sidecar subtitle', () => {
    const dir = path.join(SCRATCH, 'sjis');
    placeMedia(media, path.join(dir, `${SHOW} - 02.mkv`));
    fs.writeFileSync(path.join(dir, `${SHOW} - 02.ja.srt`), encodeLegacy(SRT_JA_PLAIN, 'shift_jis'));
    const pick = pickSidecarSubtitleForLanguage(path.join(dir, `${SHOW} - 02.mkv`), 'ja');
    expect(parseStudySubtitles(pick!.text).cues.map((cue) => cue.text)).toEqual([...CUE_LINES]);
  });

  it('reads a UTF-16 LE sidecar subtitle', () => {
    const dir = path.join(SCRATCH, 'utf16');
    placeMedia(media, path.join(dir, `${SHOW} - 03.mkv`));
    fs.writeFileSync(path.join(dir, `${SHOW} - 03.ja.srt`), encodeUtf16Le(SRT_JA_PLAIN));
    const pick = pickSidecarSubtitleForLanguage(path.join(dir, `${SHOW} - 03.mkv`), 'ja');
    expect(parseStudySubtitles(pick!.text).cues.map((cue) => cue.text)).toEqual([...CUE_LINES]);
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: P2 Japanese episode parsing', () => {
  it('does not read a title ending in a number as a batch', async () => {
    const run = await scrape(NUMBERED_SHOW);
    expect(run.error).toBe('');
    const torrents = run.result?.torrents ?? [];
    expect(torrents).toHaveLength(4);
    expect(torrents.some((row) => row.isBatch)).toBe(false);
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: P3 HTTP correctness', () => {
  it('refuses a page robots.txt disallows', async () => {
    const run = await scrape(`${site.base}/private/secret`);
    expect(run.error).toMatch(/robots/i);
    expect(site.hits).not.toContain('GET /private/secret');
  });

  it('waits out Retry-After before retrying a 503', async () => {
    site.reset();
    const run = await scrape(`${site.base}/flaky`);
    expect(run.error).toBe('');
    const times = site.hits.map((hit, i) => [hit, site.hitTimes[i]] as const).filter(([hit]) => hit === 'GET /flaky');
    expect(times).toHaveLength(2);
    expect(times[1][1] - times[0][1]).toBeGreaterThanOrEqual(900);
  });

  it('drops cookie and authorization on a cross-origin redirect', async () => {
    const response = await scraperRequest(`${site.base}/redirect-cross-host`, {
      headers: { cookie: 'session=e2e-secret', authorization: 'Bearer e2e-secret' },
      correlationId: 'e2e',
    });
    const echoed = JSON.parse(response.body) as { host: string; cookie: string; authorization: string };
    expect(echoed.host).toMatch(/^localhost:/);
    expect(echoed.cookie).toBe('');
    expect(echoed.authorization).toBe('');
  });

  it('decodes numeric character references in a page title before searching', async () => {
    h.catalogueQueries.length = 0;
    // `localhost`, not 127.0.0.1: the fixture's site rule is for 127.0.0.1, and a
    // URL no rule covers goes through the page-title -> catalogue path under test.
    await scrape(`http://localhost:${site.port}/entity-title`);
    expect(h.catalogueQueries[0]).toBe('ガム Test Show');
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: P4 cancellation', () => {
  it('cancels a scrape whose request is still in flight, promptly', async () => {
    site.reset();
    const events: ScrapeJobEvent[] = [];
    const jobId = startScrape(
      { request: { targetUrl: `${site.base}/slow`, profileId: 'e2e' }, settings: e2eSettings() },
      (_id, event) => events.push(event),
    );
    await vi.waitFor(() => {
      if (!site.hits.includes('GET /slow')) throw new Error('not fetching yet');
    }, { timeout: 3_000, interval: 10 });
    const cancelledAt = Date.now();
    cancelScrape(jobId);
    await vi.waitFor(() => {
      if (!events.some(isTerminal)) throw new Error('still running');
    }, { timeout: 1_500, interval: 10 });
    expect(events.some((e) => e.kind === 'stage' && e.stage === 'cancelled')).toBe(true);
    expect(Date.now() - cancelledAt).toBeLessThan(1_000);
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: P5 qBittorrent and ingest', () => {
  it('treats qBittorrent 4.x "200 Fails." as a refused add, with no handoff', async () => {
    const v4 = await startFakeQbit({
      password: PASSWORD,
      mediaPath: media,
      defaultSavePath: path.join(SCRATCH, 'v4-dl'),
      version: '4',
      rejectAdds: true,
    });
    try {
      const before = handoffs.length;
      const rows = withoutTrackers(releases5());
      const report = await qbitSend({
        config: qbitConfig(v4.port),
        password: PASSWORD,
        rows,
        ingest: { hint: { title: SHOW } },
      });
      expect(report.sent).toBe(0);
      expect(report.failed).toBe(rows.length);
      expect(handoffs.length).toBe(before);
    } finally {
      await v4.close();
    }
  });

  it('reads the session cookie named exactly SID', async () => {
    const decoy = await startFakeQbit({
      password: PASSWORD,
      mediaPath: media,
      defaultSavePath: path.join(SCRATCH, 'decoy-dl'),
      version: '5',
      decoyCookie: true,
    });
    try {
      const polled = await qbitPollTorrents({ config: qbitConfig(decoy.port), password: PASSWORD });
      expect(polled.ok).toBe(true);
    } finally {
      await decoy.close();
    }
  });

  it('maps a remote client\'s POSIX save path onto the local folder and imports', async () => {
    const remote = await startFakeQbit({
      password: PASSWORD,
      mediaPath: media,
      defaultSavePath: REMOTE_DOWNLOADS,
      reportedSavePath: '/srv/torrents',
      version: '4',
      completeAfterPolls: 1,
    });
    try {
      const config = qbitConfig(remote.port, {
        ...({ pathMappings: [{ remote: '/srv/torrents', local: REMOTE_DOWNLOADS }] } as Partial<ScraperQbittorrentSettings>),
      });
      await invoke(MEDIA_INGEST_CHANNELS.syncQbit, config);
      await vi.waitFor(async () => {
        const state = await invoke<MediaIngestState>(MEDIA_INGEST_CHANNELS.getState);
        if (state.qbit.status !== 'watching') throw new Error(`qbit status ${state.qbit.status}`);
      }, { timeout: 5_000, interval: 25 });
      const rows = withoutTrackers(releases5());
      const report = await qbitSend({ config, rows, ingest: { hint: { title: NUMBERED_SHOW }, rowEpisodes: rowEpisodes(rows) } });
      expect(report.sent).toBe(rows.length);
      const before = library.length;
      await waitForLibrary(before + rows.length, 4_000);
      expect(library.filter((item) => path.dirname(item.path) === REMOTE_DOWNLOADS)).toHaveLength(rows.length);
    } finally {
      await remote.close();
    }
  });
});

/** Rows of the numbered show, built straight from its feed (no scrape needed). */
function releases5(): TorrentRow[] {
  const xml = `<?xml version="1.0"?><rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel>${
    EPISODES.map((e) => `<item><title>[GumSubs] ${NUMBERED_SHOW} - 0${e.n} (1080p) [JPN]</title>`
      + `<guid>n${e.n}</guid><nyaa:seeders>5</nyaa:seeders><nyaa:size>5.9 MiB</nyaa:size>`
      + `<nyaa:infoHash>${e.hash.split('').reverse().join('')}</nyaa:infoHash></item>`).join('')
  }</channel></rss>`;
  return parseTorrentFeed(xml, { tracker: 'fixture', trackers: [] });
}

describe.skipIf(!HAVE_FFMPEG)('probe: P7 output safety (subtitles)', () => {
  it('does not attach "- 010.ja.srt" to "- 01.mkv"', () => {
    const dir = path.join(SCRATCH, 'stems');
    placeMedia(media, path.join(dir, `${SHOW} - 01.mkv`));
    fs.writeFileSync(path.join(dir, `${SHOW} - 01.ja.srt`), SRT_JA);
    fs.writeFileSync(path.join(dir, `${SHOW} - 010.ja.srt`), SRT_JA);
    const names = findSidecarSubtitles(path.join(dir, `${SHOW} - 01.mkv`)).map((s) => s.fileName);
    expect(names).toEqual([`${SHOW} - 01.ja.srt`]);
  });

  it('does not read "Hi" in a show title as a hearing-impaired track', () => {
    const dir = path.join(SCRATCH, 'hi');
    placeMedia(media, path.join(dir, 'Hi Score Gum - 01.mkv'));
    fs.writeFileSync(path.join(dir, 'Hi Score Gum - 01.ja.srt'), SRT_JA);
    const [sidecar] = findSidecarSubtitles(path.join(dir, 'Hi Score Gum - 01.mkv'));
    expect(sidecar).toMatchObject({ language: 'ja', hearingImpaired: false });
  });

  it('turns ASS \\h into a space and never makes a cue of a {\\p1} drawing', () => {
    const texts = parseSubtitles(ASS_JA).map((cue) => cue.text);
    expect(texts).toContain('また 明日。');
    expect(texts.some((text) => /\bm 0 0\b/.test(text))).toBe(false);
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: P8 features', () => {
  it('follows the site\'s next-page link (rule nextPageSelector, page cap)', async () => {
    const run = await scrape(`${site.base}/shows/gum-test-show`);
    expect(run.result?.episodes.map((row) => row.number)).toEqual([1, 2, 3, 4]);
  });

  it('blocks a private address in the HTTP Inspector by default', async () => {
    const result = await probeHttp({ url: `${site.base}/`, method: 'GET', headers: {} });
    expect(result.status).toBe(0);
    expect(site.hits.at(-1)).not.toBe('GET /');
  });
});

describe.skipIf(!HAVE_FFMPEG)('probe: round 2 (page failures, .torrent files, the robots guard)', () => {
  it('a site-rule page after the first that fails is in the job summary, not only the log', async () => {
    const run = await scrape(`${site.base}/shows/broken-pages`);
    expect(run.error).toBe('');
    expect(run.result?.episodes.map((row) => row.number)).toEqual([1, 2]);
    const done = run.events.find((e): e is Extract<ScrapeJobEvent, { kind: 'done' }> => e.kind === 'done');
    expect(done?.summary.pageFailures).toEqual([
      { page: 2, url: `${site.base}/shows/broken-pages?page=2`, reason: 'status', status: 503 },
    ]);
    expect(done?.summary.note).toContain('Could not read page 2 (HTTP 503); the episode list may be incomplete.');
    expect(pageFailuresNote([{ page: 3, url: 'u', reason: 'empty' }])).toBe('Could not read page 3 (no rows); the episode list may be incomplete.');
  });

  it('a .torrent file goes to qBittorrent as a multipart add, is handed to the ingest, and is imported', async () => {
    const torrent = makeTorrent(`${SHOW} - 09 (1080p).mkv`);
    // P5 pointed the ingest at its own (now closed) remote client: point it back.
    await invoke(MEDIA_INGEST_CHANNELS.syncQbit, qbitConfig(qbit.port));
    await vi.waitFor(async () => {
      const state = await invoke<MediaIngestState>(MEDIA_INGEST_CHANNELS.getState);
      if (state.qbit.status !== 'watching') throw new Error(`qbit status ${state.qbit.status}`);
    }, { timeout: 5_000, interval: 25 });
    const before = handoffs.length;
    const libraryBefore = library.length;
    const report = await qbitAddTorrentFiles({
      config: qbitConfig(qbit.port),
      files: [{ fileName: 'from-browser.torrent', data: torrent.bytes }, { fileName: 'junk.torrent', data: Buffer.from('<html>') }],
      ingest: { hint: { title: SHOW, provider: 'scraper', season: 1 }, via: 'e2e-torrent-file' },
    });
    expect(report).toMatchObject({ sent: 1, skipped: 1, failed: 0, infoHashes: [torrent.infoHash] });
    expect(qbit.torrents.get(torrent.infoHash)).toMatchObject({ category: 'gum-e2e' });
    expect(handoffs.length).toBe(before + 1);
    expect(handoffs.at(-1)?.rows[0]).toMatchObject({ infoHash: torrent.infoHash });
    await waitForLibrary(libraryBefore + 1);
    expect(library.some((item) => item.fileName === torrent.name)).toBe(true);
  });

  it('a guarded crawl never asks a private host for its robots.txt', async () => {
    site.reset();
    const settings = e2eSettings();
    settings.safety.allowPrivateNetwork = false;
    const run = await scrape(`${site.base}/shows/gum-test-show`, settings);
    expect(run.error).toMatch(/private or local network/);
    expect(site.hits).toEqual([]);
  });
});
