// @vitest-environment node
//
// The acquisition half of the nyaa provider, against a stand-in qBittorrent.
//
// A real HTTP server rather than a mocked client, for the same reason
// `scraperQbittorrent.test.ts` uses one: the thing most likely to be wrong here
// is the exact form encoding and call *order* sent to the WebUI API, and a
// mock that records method calls would assert the code does what it does.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  DEFAULT_SCRAPER_TORRENT_SETTINGS,
  type ScraperQbittorrentSettings,
} from '../../shared/scraperSourceSettings';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer) => buffer.toString().slice(4),
  },
}));

const { nyaaAvailability, nyaaFetch, nyaaFetchAll } = await import('../subtitleNyaaSource');
const { resetQbitSessions } = await import('../scraper/qbittorrent');
const { setScraperStoreRoot } = await import('../scraper/store');

const HASH = 'b'.repeat(40);
const MAGNET = `magnet:?xt=urn:btih:${HASH}`;

interface StoredFile { name: string; size: number; progress: number; priority: number }

let server: http.Server;
let qbitConfig: ScraperQbittorrentSettings;
let savePath = '';
/** Every API path hit, in order — this is what proves the priority sequence. */
let calls: string[] = [];
let files: StoredFile[] = [];
/** Whether the torrent is already in the client before we add it. */
let present = false;
/**
 * The raw qBittorrent state the stand-in reports. `error` is what a disk that
 * filled mid-transfer produces, and `missingFiles` is what deleting the data
 * underneath it produces; neither ever moves progress again.
 */
let torrentState = 'downloading';
/** Torrents that vanish while we are waiting — the user removed it, or the client restarted without it. */
let disappearAfterAdd = false;
/** Starting the torrent moves nothing, which is what a stopped-on-error transfer looks like. */
let stallOnStart = false;
let addBodies: string[] = [];
/**
 * How many `torrents/files` reads answer `[]` before the metadata "arrives".
 *
 * This is the real daemon's behaviour for a magnet, not an invented one: a
 * magnet names no files, so the WebUI answers `200 []` until a peer sends the
 * torrent's info dictionary. Measured on the live client at 0 files for as long
 * as the torrent stayed stopped, then 26 files 4 s after it was allowed to run.
 */
let metadataAfterPolls = 0;
let filesReads = 0;
/**
 * The whole transfer list, for the orphan sweep.
 *
 * Deliberately holds torrents outside `jp-study-subtitles` too: the sweep
 * deletes what it is handed, so the control that matters is a client which
 * answers a category query with everything — some builds ignore the parameter —
 * and the sweep still touching only its own.
 */
let clientTorrents: Array<{ hash: string; category: string }> = [];
/** Bodies posted to `torrents/delete`, so the control can assert nothing went. */
let deleteBodies: string[] = [];

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nyaa-fetch-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
  savePath = path.join(tempRoot, 'downloads');
  await fsp.mkdir(savePath, { recursive: true });

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    calls.push(url.pathname);

    if (url.pathname === '/api/v2/auth/login') {
      void readBody(req).then(() => {
        res.writeHead(200, { 'set-cookie': 'SID=tok; path=/', 'content-type': 'text/plain' });
        res.end('Ok.');
      });
      return;
    }
    if (!(req.headers.cookie ?? '').includes('SID=tok')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (url.pathname === '/api/v2/torrents/info' && url.searchParams.has('category')) {
      // The sweep's query. Answers with the *whole* list on purpose, ignoring
      // the parameter the way a build that does not support it would.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(clientTorrents));
      return;
    }
    if (url.pathname === '/api/v2/torrents/delete') {
      void readBody(req).then((body) => {
        deleteBodies.push(body);
        const gone = new Set((new URLSearchParams(body).get('hashes') ?? '').split('|'));
        clientTorrents = clientTorrents.filter((row) => !gone.has(row.hash));
        res.writeHead(200);
        res.end('Ok.');
      });
      return;
    }
    if (url.pathname === '/api/v2/torrents/info') {
      // Honours `hashes`, unlike the fixture next door — "is this torrent
      // already here?" is the whole safety gate and must be answerable.
      const wanted = url.searchParams.get('hashes');
      const rows = present || !wanted
        ? [{ hash: HASH, name: 'Show Subs', save_path: savePath, progress: 1, size: 1000, state: torrentState }]
        : [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rows));
      return;
    }
    if (url.pathname === '/api/v2/torrents/files') {
      filesReads += 1;
      const known = filesReads > metadataAfterPolls ? files : [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(known.map((file, index) => ({ index, ...file }))));
      return;
    }
    if (url.pathname === '/api/v2/torrents/pause') {
      void readBody(req).then(() => {
        res.writeHead(200);
        res.end('Ok.');
      });
      return;
    }
    if (url.pathname === '/api/v2/torrents/add') {
      void readBody(req).then((body) => {
        addBodies.push(body);
        present = !disappearAfterAdd;
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Ok.');
      });
      return;
    }
    if (url.pathname === '/api/v2/torrents/filePrio') {
      void readBody(req).then((body) => {
        const form = new URLSearchParams(body);
        const priority = Number(form.get('priority'));
        for (const id of (form.get('id') ?? '').split('|')) {
          const file = files[Number(id)];
          if (file) file.priority = priority;
        }
        // Record the effect, not just the hit, so ordering assertions read well.
        calls.push(`prio:${form.get('priority')}=${form.get('id')}`);
        res.writeHead(200);
        res.end('Ok.');
      });
      return;
    }
    if (url.pathname === '/api/v2/torrents/resume') {
      void readBody(req).then(() => {
        // Starting completes whatever was left enabled.
        if (!stallOnStart) for (const file of files) if (file.priority > 0) file.progress = 1;
        res.writeHead(200);
        res.end('Ok.');
      });
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  qbitConfig = {
    ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    enabled: true,
    scheme: 'http',
    host: '127.0.0.1',
    port: (server.address() as AddressInfo).port,
    username: 'admin',
    passwordRef: '',
    savePath,
  };
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  setScraperStoreRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  addBodies = [];
  present = false;
  torrentState = 'downloading';
  disappearAfterAdd = false;
  stallOnStart = false;
  metadataAfterPolls = 0;
  filesReads = 0;
  clientTorrents = [];
  deleteBodies = [];
  resetQbitSessions();
});

afterEach(() => { resetQbitSessions(); });

function config() {
  return {
    indexers: [{
      id: 'nyaa', label: 'nyaa', host: 'nyaa.si', kind: 'torrent' as const, enabled: true,
      priority: 1, fallbackIds: [], verifiedSiteId: '', requiresAuth: false,
      supportsSubtitles: true, health: 'unknown' as const, lastCheckedAt: null, notes: '',
    }],
    torrents: DEFAULT_SCRAPER_TORRENT_SETTINGS,
    qbittorrent: qbitConfig,
  };
}

function candidate(route: 'sub-pack' | 'batch-sidecar', episode: number | null = 7) {
  return {
    providerId: 'nyaa' as const,
    providerItemId: `nyaa:${HASH}`,
    language: 'ja',
    format: 'ass' as const,
    releaseName: 'Show Subs',
    season: null,
    episode,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: 10,
    fetchToken: JSON.stringify({
      infoHash: HASH, magnet: MAGNET, route, episode, languages: ['ja'],
    }),
  };
}

async function writeOnDisk(name: string, text: string): Promise<void> {
  const target = path.join(savePath, name);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, text, 'utf-8');
}

describe('nyaaAvailability', () => {
  it('refuses a qBittorrent whose save path this machine cannot read', async () => {
    const result = await nyaaAvailability({
      ...config(),
      qbittorrent: { ...qbitConfig, savePath: path.join(tempRoot, 'not-a-real-mount') },
    });
    expect(result.ok).toBe(false);
    // Must be its own state: the connection is fine, the fetch is impossible.
    // Reporting this as "no results" sends the user hunting for a subtitle
    // that is actually right there.
    expect(result.ok === false && result.reason).toBe('qbit-remote');
  });

  it('refuses when qBittorrent is switched off, and passes when it is not', async () => {
    const off = await nyaaAvailability({
      ...config(),
      qbittorrent: { ...qbitConfig, enabled: false },
    });
    expect(off.ok === false && off.reason).toBe('qbit-disabled');
    expect((await nyaaAvailability(config())).ok).toBe(true);
  });

  it('refuses with no configuration at all, which is what the auto sweep passes', async () => {
    const result = await nyaaAvailability(undefined);
    expect(result.ok === false && result.reason).toBe('not-configured');
  });
});

// Gate 29's second half. `jp-study-subtitles` used to be written in three
// places and read in none, so a process that died between the add and the read
// left a torrent nothing would ever reap, resume or mention — still downloading
// on the user's connection for a subtitle no record could point at.
describe('nyaaFetch — what an interrupted run left in the client', () => {
  it('clears a subtitle fetch an earlier run abandoned, with its data', async () => {
    clientTorrents = [{ hash: 'a'.repeat(40), category: 'jp-study-subtitles' }];
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: hello');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(deleteBodies).toHaveLength(1);
    expect(new URLSearchParams(deleteBodies[0]).get('hashes')).toBe('a'.repeat(40));
    // The bytes are the actual leak; a part-fetched sub-pack is worth nothing.
    expect(new URLSearchParams(deleteBodies[0]).get('deleteFiles')).toBe('true');
  });

  // The control, and the one that would make this dangerous if it failed: the
  // stand-in answers the category query with the whole transfer list, so only
  // the sweep's own filter keeps it off the user's torrents.
  it('does not touch a torrent outside its own category', async () => {
    clientTorrents = [
      { hash: 'c'.repeat(40), category: '' },
      { hash: 'd'.repeat(40), category: 'jp-study' },
    ];
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: hello');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(deleteBodies).toEqual([]);
    expect(clientTorrents).toHaveLength(2);
  });

  // A fetch does not sweep itself out from under its own feet.
  it('holds back the hash it is about to acquire', async () => {
    clientTorrents = [
      { hash: HASH, category: 'jp-study-subtitles' },
      { hash: 'e'.repeat(40), category: 'jp-study-subtitles' },
    ];
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: hello');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(new URLSearchParams(deleteBodies[0]).get('hashes')).toBe('e'.repeat(40));
    expect(clientTorrents.map((row) => row.hash)).toEqual([HASH]);
  });

  it('sends no delete at all when the category is empty', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: hello');

    expect((await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 })).ok).toBe(true);
    expect(calls).not.toContain('/api/v2/torrents/delete');
  });
});

describe('nyaaFetch — route A, a subtitle-only pack', () => {
  it('adds stopped, enables the subtitles, and returns the text', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: hello');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.text).toContain('Dialogue: hello');
    expect(result.ok && result.value.fileName).toBe('Show - 07.ja.ass');

    // Stopped by condition, not by flag. `paused`/`stopped` was the old form
    // and it is the one thing that must never come back: a magnet added stopped
    // never asks the swarm for its metadata, so the file list stays empty and
    // every release looks like it has no subtitles in it.
    expect(addBodies[0]).toContain('stopCondition=MetadataReceived');
    expect(addBodies[0]).not.toContain('paused=true');
    expect(addBodies[0]).not.toContain('stopped=true');
    expect(addBodies[0]).toContain('category=jp-study-subtitles');
  });

  it('waits for a magnet’s file list instead of reading an empty one', async () => {
    // Three empty reads, then the real list — the shape a magnet actually has.
    metadataAfterPolls = 3;
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', '[Script Info]\nDialogue: after metadata');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.text).toContain('after metadata');
    // It really did have to wait, rather than the stand-in answering at once.
    expect(filesReads).toBeGreaterThan(3);
    // And the torrent we added was put back to stopped before any file was
    // chosen — a build that ignores `stopCondition` must not be left running.
    expect(calls).toContain('/api/v2/torrents/pause');
  });

  it('names a swarm that never sends a file list, and does not call it empty', async () => {
    // 500 polls at the 1 s floor is far beyond the metadata timeout, so this is
    // the "nobody answered" case rather than a slow one.
    metadataAfterPolls = 500;
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    // The distinction this whole wait exists for: "we could not see inside it"
    // is not "there is nothing inside it".
    expect(result.ok === false && result.reason).toMatch(/no peer sent its file list/i);
    expect(result.ok === false && result.reason).not.toMatch(/no subtitle files/i);
    expect(calls.some((call) => call.startsWith('prio:'))).toBe(false);
  });

  it('never pauses a torrent the user already had', async () => {
    // The negative control for `stopWhenReady`: this transfer is the user's, and
    // silently pausing it would stop a download they started.
    present = true;
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 1, priority: 1 }];
    await writeOnDisk('Show - 07.ja.ass', 'Dialogue: theirs');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(addBodies).toHaveLength(0);
    expect(calls).not.toContain('/api/v2/torrents/pause');
  });

  it('corrects the format from the file that actually arrived', async () => {
    // The index lists no file names, so search has to guess `.ass`. If the
    // record kept that guess a `.srt` release would be written with the wrong
    // extension and parse as nothing.
    files = [{ name: 'Show - 07.srt', size: 20_000, progress: 0, priority: 1 }];
    await writeOnDisk('Show - 07.srt', '1\n00:00:01,000 --> 00:00:02,000\nhi');

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(candidate('sub-pack').format).toBe('ass');
    expect(result.ok && result.value.format).toBe('srt');
  });

  it('reports a bitmap-only release instead of downloading it', async () => {
    files = [
      { name: 'Show - 07.idx', size: 5_000, progress: 0, priority: 1 },
      { name: 'Show - 07.sub', size: 900_000, progress: 0, priority: 1 },
    ];
    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/image-based/i);
    expect(calls.some((call) => call.startsWith('prio:'))).toBe(false);
  });
});

describe('nyaaFetch — route B, selected files out of a batch', () => {
  it('skips every other file before enabling the subtitles', async () => {
    files = [
      { name: 'Show/Show - 06.mkv', size: 1_400_000_000, progress: 0, priority: 1 },
      { name: 'Show/Show - 07.mkv', size: 1_400_000_000, progress: 0, priority: 1 },
      { name: 'Show/Subs/Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 },
    ];
    await writeOnDisk('Show/Subs/Show - 07.ja.ass', 'Dialogue: from a batch');

    const result = await nyaaFetch(candidate('batch-sidecar'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.text).toContain('from a batch');

    const prio = calls.filter((call) => call.startsWith('prio:'));
    // Order is the assertion. Enabling first would leave a window in which the
    // video files are downloading at full priority.
    expect(prio[0]).toBe('prio:0=0|1');
    expect(prio[1]).toBe('prio:1=2');

    // And the video files really were left off.
    expect(files[0].priority).toBe(0);
    expect(files[1].priority).toBe(0);
    expect(files[2].priority).toBe(1);
  });

  it('never fetches a video file when no subtitle is present', async () => {
    files = [{ name: 'Show/Show - 07.mkv', size: 1_400_000_000, progress: 0, priority: 1 }];
    const result = await nyaaFetch(candidate('batch-sidecar'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/no subtitle files/i);
    expect(calls.some((call) => call.startsWith('prio:'))).toBe(false);
  });
});

describe('nyaaFetch — a torrent the user already has', () => {
  it('leaves its file priorities alone rather than stopping files they wanted', async () => {
    // The damage this prevents is invisible until much later: silently setting
    // someone's episodes to priority 0 shows up as "why did this never finish".
    present = true;
    files = [
      { name: 'Show/Show - 07.mkv', size: 1_400_000_000, progress: 0.4, priority: 1 },
      { name: 'Show/Subs/Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 },
    ];

    const result = await nyaaFetch(candidate('batch-sidecar'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already in qBittorrent/i);
    expect(calls.some((call) => call.startsWith('prio:'))).toBe(false);
    expect(files[0].priority).toBe(1);
  });

  it('uses it when the subtitles happen to be complete already', async () => {
    present = true;
    files = [
      { name: 'Show/Show - 07.mkv', size: 1_400_000_000, progress: 0.4, priority: 1 },
      { name: 'Show/Subs/Show - 07.ja.ass', size: 40_000, progress: 1, priority: 1 },
    ];
    await writeOnDisk('Show/Subs/Show - 07.ja.ass', 'Dialogue: already here');

    const result = await nyaaFetch(candidate('batch-sidecar'), config(), { timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.text).toContain('already here');
    expect(calls.some((call) => call.startsWith('prio:'))).toBe(false);
  });
});

// P6 contingency gates 28 and 29: a transfer that stops and never resumes.
//
// Both used to be indistinguishable from a slow swarm, because the wait polled
// file progress and nothing else — so the user waited the full five minutes and
// was then told it "timed out", which is the generic failure this phase exists
// to eliminate.
describe('nyaaFetch — a transfer that stops and never comes back', () => {
  it('gate 28: names the error state instead of waiting out the timeout', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    stallOnStart = true;
    torrentState = 'error';

    const started = Date.now();
    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 30_000 });
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/free space/i);
    // The negative control: the old code produced this, after 30 seconds.
    expect(result.ok === false && result.reason).not.toMatch(/timed out/i);
    // It must give up on the first poll, not near the deadline.
    expect(elapsed).toBeLessThan(5_000);
  });

  it('gate 28: `missingFiles` counts too — the data went away underneath it', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    stallOnStart = true;
    torrentState = 'missingFiles';

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 30_000 });
    expect(result.ok === false && result.reason).toMatch(/free space/i);
  });

  it('gate 29: a torrent that is gone from the client says so', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    stallOnStart = true;
    disappearAfterAdd = true;

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 30_000 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/no longer in qBittorrent/i);
  });

  it('a stalled-but-healthy transfer is still allowed to finish waiting', async () => {
    // The control for both gates above: `stalledDL` is a slow swarm, not a
    // failure, and bailing on it would turn a working fetch into an error.
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    stallOnStart = true;
    torrentState = 'stalledDL';

    const result = await nyaaFetch(candidate('sub-pack'), config(), { timeoutMs: 1_200 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/timed out/i);
  });
});

describe('nyaaFetchAll — a sub-pack is a season, not one file', () => {
  it('returns every episode in the pack, each keyed to its own episode number', async () => {
    // The whole reason this function exists: a harvest asks for a *range*, and
    // `nyaaFetch` answers with one file no matter how many the release holds.
    files = [
      { name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 },
      { name: 'Show - 08.ja.ass', size: 41_000, progress: 0, priority: 1 },
      { name: 'Show - 09.ja.ass', size: 42_000, progress: 0, priority: 1 },
    ];
    await writeOnDisk('Show - 07.ja.ass', 'Dialogue: seven');
    await writeOnDisk('Show - 08.ja.ass', 'Dialogue: eight');
    await writeOnDisk('Show - 09.ja.ass', 'Dialogue: nine');

    // `episode: null` is what a range listing searches with — the pack covers
    // the range, so pinning one episode at search time would discard the rest.
    const all = await nyaaFetchAll(candidate('sub-pack', null), config(), { timeoutMs: 5_000 });
    expect(all.ok).toBe(true);
    expect(all.ok && all.files.map((file) => file.episode).sort((a, b) => Number(a) - Number(b)))
      .toEqual([7, 8, 9]);
    expect(all.ok && all.files.map((file) => file.text).join('|')).toContain('Dialogue: eight');

    // The single-file view over the same acquisition still answers one file,
    // which is the discovery contract and must not have moved.
    const one = await nyaaFetch(candidate('sub-pack', null), config(), { timeoutMs: 5_000 });
    expect(one.ok).toBe(true);
    expect(one.ok && one.value.fileName).toBe('Show - 09.ja.ass');
  });

  it('skips a file that is on disk but empty, and keeps the rest', async () => {
    // The negative control for the per-file skip: without it, one truncated
    // episode out of three would either fail the release or land as an empty
    // cue list that mines to nothing while reporting success.
    files = [
      { name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 },
      { name: 'Show - 08.ja.ass', size: 41_000, progress: 0, priority: 1 },
    ];
    await writeOnDisk('Show - 07.ja.ass', '   \n  ');
    await writeOnDisk('Show - 08.ja.ass', 'Dialogue: eight');

    const all = await nyaaFetchAll(candidate('sub-pack', null), config(), { timeoutMs: 5_000 });
    expect(all.ok).toBe(true);
    expect(all.ok && all.files).toHaveLength(1);
    expect(all.ok && all.files[0].episode).toBe(8);
  });

  it('refuses rather than returning an empty list when nothing reads', async () => {
    files = [{ name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 }];
    // Listed by the client, never written to disk.

    const all = await nyaaFetchAll(candidate('sub-pack'), config(), { timeoutMs: 5_000 });
    expect(all.ok).toBe(false);
    expect(all.ok === false && all.reason).toMatch(/could not be read from disk/i);
  });

  it('still honours the episode filter when the token names one', async () => {
    // Control for the test above it: the same three-file pack, fetched by a
    // token that pins episode 8, must narrow to 8 — otherwise the discovery
    // path would start attaching whole seasons to one video file.
    files = [
      { name: 'Show - 07.ja.ass', size: 40_000, progress: 0, priority: 1 },
      { name: 'Show - 08.ja.ass', size: 41_000, progress: 0, priority: 1 },
      { name: 'Show - 09.ja.ass', size: 42_000, progress: 0, priority: 1 },
    ];
    await writeOnDisk('Show - 07.ja.ass', 'Dialogue: seven');
    await writeOnDisk('Show - 08.ja.ass', 'Dialogue: eight');
    await writeOnDisk('Show - 09.ja.ass', 'Dialogue: nine');

    const all = await nyaaFetchAll(candidate('sub-pack', 8), config(), { timeoutMs: 5_000 });
    expect(all.ok).toBe(true);
    expect(all.ok && all.files.map((file) => file.episode)).toEqual([8]);
  });
});
