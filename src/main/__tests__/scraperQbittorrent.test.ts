// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  type ScraperQbittorrentSettings,
} from '../../shared/scraperSourceSettings';
import type { TorrentRow } from '../../shared/scraperResults';

let tempRoot = '';

// safeStorage is stubbed with a reversible transform: the point of the
// credential tests is that the secret leaves the settings document and comes
// back correctly, not that DPAPI works.
vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString();
      if (!text.startsWith('enc:')) throw new Error('not ours');
      return text.slice(4);
    },
  },
}));

let encryptionAvailable = true;

const { addFailureReason, awaitFilesStallReason, buildAddForm, magnetInfoHash, mapQbitState, mapTransfer, normalizeQbitInput, parseAddOutcome, qbitAwaitFiles, qbitBaseUrl, qbitSend, qbitTest, qbitTransfers, resetQbitSessions } =
  await import('../scraper/qbittorrent');
type StallInput = Parameters<typeof awaitFilesStallReason>[0];

/** Two real-shaped 40-hex infohashes: one the stand-in holds, one it does not. */
const HASH_PRESENT = '0123456789abcdef0123456789abcdef01234567';
const HASH_NEW = '89abcdef0123456789abcdef0123456789abcdef';
const { getScraperSecret, hasScraperSecret, setScraperSecret, clearScraperSecret } =
  await import('../scraper/credentials');
const { readSecret, setCredentialVaultRoot } = await import('../credentials/vault');
const { setScraperStoreRoot } = await import('../scraper/store');
const { flushScraperLogWrites } = await import('../scraper/logBus');

// ---- a stand-in qBittorrent WebUI ---------------------------------------

const GOOD_USER = 'admin';
const GOOD_PASS = 'adminadmin';
const GOOD_KEY = 'RmDdRLXCTFEBpS2v3Yk6wJn9';

let server: http.Server;
let config: ScraperQbittorrentSettings;
let addBodies: string[] = [];
/**
 * What `torrents/add` answers next.
 *
 * The real daemon refuses with a status *and a body naming the cause* — a live
 * send measured `409` with the reason in the body. A stub that only ever
 * answers `200 Ok.` encodes a contract the daemon does not have, which is how
 * the last two qBittorrent defects survived a green suite.
 */
let addResponse: { status: number; body: string } = { status: 200, body: 'Ok.' };
let sessionValid = true;
/**
 * How the stand-in refuses a bad login. qBittorrent changed this between
 * versions: 4.x answered `200 Ok./Fails.`, 5.2.3 answers `401`. Both are
 * exercised, because the client has to be right on either.
 */
let loginRejectStyle: 'fails' | '401' = 'fails';
/** Every request the app actually sent, so a header claim is measured not assumed. */
let seenHeaders: http.IncomingHttpHeaders[] = [];
/**
 * Torrents the stand-in is already holding, on top of the two fixtures.
 *
 * Empty by default so the `qbitTransfers` counts stay as they were; the 409
 * branch needs a real 40-hex infohash to recognise, which the fixtures' short
 * `aa11`/`bb22` deliberately are not.
 */
let torrentInfoExtra: unknown[] = [];
/**
 * qBittorrent's own `connection_status`, the half `app/version` cannot answer.
 *
 * `''` makes the stand-in 404 the route — a build that predates it, which must
 * leave the report exactly as it was rather than inventing an outage.
 */
let connectionStatus = 'connected';
/** What `torrents/files` answers next. `null` makes the stand-in 404 the route. */
let fileListResponse: unknown[] | null = null;
/**
 * Run on every `torrents/info` request, before it answers.
 *
 * The point of it is the one thing a fixed fixture cannot express: a swarm that
 * is alive on one poll and dead on the next. A test mutates `torrentInfoExtra`
 * from here and the wait sees it change under itself, exactly as it would live.
 */
let torrentInfoHook: (() => void) | null = null;

const TORRENT_INFO = [
  {
    hash: 'aa11',
    name: '[SubsPlease] Frieren - 01',
    state: 'downloading',
    progress: 0.42,
    dlspeed: 4_500_000,
    upspeed: 120_000,
    eta: 620,
    ratio: 0.12,
    category: 'anime',
    tags: 'seasonal, 1080p',
    save_path: 'D:\\Anime',
    size: 1_503_238_554,
    downloaded: 631_360_192,
    uploaded: 75_000_000,
    added_on: 1_753_000_000,
    completion_on: 0,
    num_leechs: 3,
    num_incomplete: 40,
    num_seeds: 12,
    num_complete: 800,
    availability: 2.4,
  },
  {
    hash: 'bb22',
    name: '[SubsPlease] Frieren - 02',
    state: 'stalledUP',
    progress: 1,
    dlspeed: 0,
    upspeed: 0,
    eta: 8_640_000,
    ratio: 3.4,
    category: '',
    tags: '',
    save_path: 'D:\\Anime',
    size: 1_400_000_000,
    downloaded: 1_400_000_000,
    uploaded: 4_760_000_000,
    added_on: 1_752_000_000,
    completion_on: 1_752_100_000,
    num_leechs: 0,
    num_incomplete: 2,
    num_seeds: 0,
    num_complete: 300,
    availability: 0,
  },
];

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-qbit-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
  setCredentialVaultRoot(tempRoot);

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    seenHeaders.push(req.headers);
    // Mirrors the contract measured against a real daemon under
    // `WebUI\LocalHostAuth=true`: Bearer authorizes, `X-Api-Key` does not. The
    // second half is enforced by simply never reading that header.
    const keyed = (req.headers.authorization ?? '') === `Bearer ${GOOD_KEY}`;
    const authed =
      keyed || (sessionValid && (req.headers.cookie ?? '').includes('SID=session-token'));

    if (url.pathname === '/api/v2/auth/login') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        const form = new URLSearchParams(body);
        if (form.get('username') === GOOD_USER && form.get('password') === GOOD_PASS) {
          res.writeHead(200, {
            'set-cookie': 'SID=session-token; HttpOnly; path=/',
            'content-type': 'text/plain',
          });
          res.end('Ok.');
        } else if (loginRejectStyle === '401') {
          // What a real 5.2.3 daemon does. The stand-in defaulted to the older
          // `200 Fails.` for long enough that a live probe, not this suite,
          // found the client mapping 401 onto "unreachable".
          res.writeHead(401, { 'content-type': 'text/plain' });
          res.end('Unauthorized');
        } else {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('Fails.');
        }
      });
      return;
    }

    if (!authed) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (url.pathname === '/api/v2/app/version') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('v4.6.4');
      return;
    }
    if (url.pathname === '/api/v2/transfer/info') {
      if (!connectionStatus) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ connection_status: connectionStatus, dht_nodes: 312 }));
      return;
    }
    if (url.pathname === '/api/v2/torrents/info') {
      torrentInfoHook?.();
      const all = [...TORRENT_INFO, ...torrentInfoExtra];
      // The real daemon filters on `hashes` and answers `[]` for one it does not
      // hold; a stand-in that ignores the parameter reports the first fixture
      // for every hash, which is how "already present" would test green for a
      // torrent the client has never seen.
      const hashes = url.searchParams.get('hashes');
      const rows = hashes
        ? all.filter((t) => hashes.toLowerCase().split('|').includes(String((t as { hash?: string }).hash ?? '').toLowerCase()))
        : all;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rows));
      return;
    }
    if (url.pathname === '/api/v2/torrents/files') {
      if (!fileListResponse) {
        res.writeHead(404);
        res.end('Torrent hash was not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(fileListResponse));
      return;
    }
    if (url.pathname === '/api/v2/torrents/add') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        addBodies.push(body);
        res.writeHead(addResponse.status, { 'content-type': 'text/plain' });
        res.end(addResponse.body);
      });
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  config = {
    ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    enabled: true,
    scheme: 'http',
    host: '127.0.0.1',
    port,
    username: GOOD_USER,
    passwordRef: 'test/qbit',
  };
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  setScraperStoreRoot(null);
  setCredentialVaultRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  encryptionAvailable = true;
  sessionValid = true;
  loginRejectStyle = 'fails';
  addBodies = [];
  addResponse = { status: 200, body: 'Ok.' };
  seenHeaders = [];
  torrentInfoExtra = [];
  connectionStatus = 'connected';
  fileListResponse = null;
  torrentInfoHook = null;
  resetQbitSessions();
  await flushScraperLogWrites();
  await fsp.rm(path.join(tempRoot, 'scraper'), { recursive: true, force: true });
  await fsp.rm(path.join(tempRoot, 'credentials.dat'), { force: true });
  await setScraperSecret('test/qbit', GOOD_PASS);
});

afterEach(() => {
  resetQbitSessions();
});

function row(overrides: Partial<TorrentRow> = {}): TorrentRow {
  return {
    id: 'row-1',
    infoHash: 'aa11bb22',
    name: '[SubsPlease] Frieren - 01',
    releaseGroup: 'SubsPlease',
    resolution: '1080p',
    seeders: 400,
    leechers: 20,
    availability: 5,
    tracker: 'Nyaa',
    sizeBytes: 1_500_000_000,
    ageDays: 3,
    fileCount: 1,
    subtitleLanguages: ['en'],
    isBatch: false,
    magnet: 'magnet:?xt=urn:btih:aa11bb22',
    ...overrides,
  };
}

// ---- credential vault ---------------------------------------------------

describe('the credential vault', () => {
  it('stores and reads a secret back', async () => {
    await setScraperSecret('my/ref', 'hunter2');
    expect(await getScraperSecret('my/ref')).toBe('hunter2');
    expect(await hasScraperSecret('my/ref')).toBe(true);
  });

  it('never writes the plaintext to disk', async () => {
    await setScraperSecret('my/ref', 'hunter2');
    const raw = await fsp.readFile(path.join(tempRoot, 'credentials.dat'), 'utf-8');
    expect(raw).not.toContain('hunter2');
  });

  it('refuses to store anything when the OS cannot encrypt', async () => {
    encryptionAvailable = false;
    const result = await setScraperSecret('plain/ref', 'hunter2');
    expect(result.ok).toBe(false);
    expect(await hasScraperSecret('plain/ref')).toBe(false);
  });

  it('treats an undecryptable secret as absent rather than throwing', async () => {
    // Simulate a file copied from another machine.
    const file = path.join(tempRoot, 'scraper', 'credentials.json');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify({ secrets: { 'my/ref': 'Zm9yZWln' } }), 'utf-8');
    await expect(getScraperSecret('my/ref')).resolves.toBe('');
  });

  it('migrates a legacy per-scraper reference into the central vault', async () => {
    const file = path.join(tempRoot, 'scraper', 'credentials.json');
    const sealed = Buffer.from('enc:legacy-password').toString('base64');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify({ secrets: { 'legacy/ref': sealed } }), 'utf-8');

    await expect(getScraperSecret('legacy/ref')).resolves.toBe('legacy-password');
    expect(await hasScraperSecret('legacy/ref')).toBe(true);
    expect(await fsp.readFile(path.join(tempRoot, 'credentials.dat'), 'utf-8'))
      .not.toContain('legacy-password');
    expect(JSON.parse(await fsp.readFile(file, 'utf-8')).secrets).toEqual({});
  });

  it('keeps a readable legacy reference when central migration cannot encrypt', async () => {
    const file = path.join(tempRoot, 'scraper', 'credentials.json');
    const sealed = Buffer.from('enc:legacy-password').toString('base64');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify({ secrets: { 'legacy/ref': sealed } }), 'utf-8');
    encryptionAvailable = false;

    await expect(getScraperSecret('legacy/ref')).resolves.toBe('legacy-password');
    expect(JSON.parse(await fsp.readFile(file, 'utf-8')).secrets['legacy/ref']).toBe(sealed);
    expect(readSecret('scraper', 'legacy/ref')).toBe('');
  });

  it('clears a secret', async () => {
    await setScraperSecret('my/ref', 'hunter2');
    await clearScraperSecret('my/ref');
    expect(await hasScraperSecret('my/ref')).toBe(false);
  });
});

// ---- mapping ------------------------------------------------------------

describe('state and row mapping', () => {
  it('collapses qBittorrent states onto the UI vocabulary', () => {
    expect(mapQbitState('forcedDL')).toBe('downloading');
    expect(mapQbitState('uploading')).toBe('seeding');
    expect(mapQbitState('pausedUP')).toBe('paused');
    expect(mapQbitState('stoppedDL')).toBe('paused');
    expect(mapQbitState('queuedDL')).toBe('queued');
    expect(mapQbitState('checkingResumeData')).toBe('checking');
    expect(mapQbitState('stalledUP')).toBe('stalled');
    expect(mapQbitState('missingFiles')).toBe('error');
    expect(mapQbitState('something-new')).toBe('queued');
  });

  it('maps a torrent record onto the transfer row', () => {
    const mapped = mapTransfer(TORRENT_INFO[0]);
    expect(mapped.hash).toBe('aa11');
    expect(mapped.state).toBe('downloading');
    expect(mapped.progress).toBeCloseTo(0.42);
    expect(mapped.etaSec).toBe(620);
    expect(mapped.tags).toEqual(['seasonal', '1080p']);
    expect(mapped.addedOn).toBe(new Date(1_753_000_000_000).toISOString());
    expect(mapped.completedOn).toBeNull();
  });

  it('turns qBittorrent\u2019s "unknown ETA" sentinel into null', () => {
    expect(mapTransfer(TORRENT_INFO[1]).etaSec).toBeNull();
    expect(mapTransfer(TORRENT_INFO[1]).completedOn).toBe(
      new Date(1_752_100_000_000).toISOString(),
    );
  });

  it('builds the base URL including a reverse-proxy base path', () => {
    expect(qbitBaseUrl({ ...config, basePath: '/qbit' })).toBe(
      `http://127.0.0.1:${config.port}/qbit`,
    );
  });
});

describe('buildAddForm', () => {
  it('carries the profile options qBittorrent understands', () => {
    const form = buildAddForm(
      {
        ...config,
        category: 'anime',
        tags: ['seasonal', 'ja'],
        savePath: 'D:\\Anime',
        addMode: 'paused',
        contentLayout: 'subfolder',
        sequentialDownload: true,
        skipHashCheck: true,
        ratioLimit: 2,
        seedingTimeLimitMin: 120,
        uploadLimitKbps: 500,
      },
      ['magnet:?xt=urn:btih:a', 'magnet:?xt=urn:btih:b'],
    );
    expect(form.get('urls')).toBe('magnet:?xt=urn:btih:a\nmagnet:?xt=urn:btih:b');
    expect(form.get('category')).toBe('anime');
    expect(form.get('tags')).toBe('seasonal,ja');
    expect(form.get('savepath')).toBe('D:\\Anime');
    expect(form.get('paused')).toBe('true');
    expect(form.get('contentLayout')).toBe('Subfolder');
    expect(form.get('sequentialDownload')).toBe('true');
    expect(form.get('skip_checking')).toBe('true');
    expect(form.get('ratioLimit')).toBe('2');
    expect(form.get('seedingTimeLimit')).toBe('120');
    // KiB/s in the profile, bytes/s on the wire.
    expect(form.get('upLimit')).toBe('512000');
  });

  it('omits limits that mean "follow the global setting"', () => {
    const form = buildAddForm(config, ['magnet:?x']);
    expect(form.get('ratioLimit')).toBeNull();
    expect(form.get('seedingTimeLimit')).toBeNull();
    expect(form.get('upLimit')).toBeNull();
    expect(form.get('forceStart')).toBeNull();
  });

  it('marks a forced start', () => {
    const form = buildAddForm({ ...config, addMode: 'forced' }, ['magnet:?x']);
    expect(form.get('forceStart')).toBe('true');
    expect(form.get('paused')).toBe('false');
  });
});

// ---- live calls against the stub ----------------------------------------

describe('qbitTest', () => {
  it('connects and reports the version', async () => {
    const report = await qbitTest({ config });
    expect(report.status).toBe('connected');
    expect(report.version).toBe('4.6.4');
    expect(report.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports "not-configured" when sending is switched off', async () => {
    const report = await qbitTest({ config: { ...config, enabled: false } });
    expect(report.status).toBe('not-configured');
  });

  // Reaching the WebUI and reaching a swarm are different questions, and this
  // test reported only the first. Live on 2026-08-17 it read `connected, 1 ms`
  // through a whole session in which no magnet on the machine ever obtained
  // metadata — so the user was told the client was healthy and every fetch then
  // blamed the release it was trying to read.
  it('says so when the client reaches the WebUI but no swarm', async () => {
    connectionStatus = 'disconnected';
    const report = await qbitTest({ config });
    // Still `connected`: this app's own connection to the WebUI is fine, and
    // downgrading the status would send the user to check a host and port that
    // are both correct — the exact defect gate 24 was.
    expect(report.status).toBe('connected');
    expect(report.connection).toBe('disconnected');
    expect(report.message).toMatch(/not connected to any swarm/i);
  });

  it('says nothing extra when the client is connected or merely firewalled', async () => {
    // Both controls in one place, because a message that names an outage for
    // every state is the same failure as one that never does. `firewalled` is
    // the ordinary state of a machine behind a NAT with no port mapping.
    const healthy = await qbitTest({ config });
    expect(healthy.connection).toBe('connected');
    expect(healthy.message).not.toMatch(/swarm/i);

    resetQbitSessions();
    connectionStatus = 'firewalled';
    const natted = await qbitTest({ config });
    expect(natted.status).toBe('connected');
    expect(natted.connection).toBe('firewalled');
    expect(natted.message).not.toMatch(/swarm/i);
  });

  it('reports an empty connection on a build with no transfer/info route', async () => {
    connectionStatus = '';
    const report = await qbitTest({ config });
    expect(report.status).toBe('connected');
    expect(report.version).toBe('4.6.4');
    expect(report.connection).toBe('');
    expect(report.message).not.toMatch(/swarm/i);
  });

  it('reports "unauthorized" with no stored password', async () => {
    await clearScraperSecret('test/qbit');
    const report = await qbitTest({ config });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/no password/i);
  });

  it('reports "unauthorized" when the password is wrong', async () => {
    await setScraperSecret('test/qbit', 'wrong-password');
    const report = await qbitTest({ config });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/rejected/i);
  });

  // P6 gate 24, brought back from a live probe against the user's real 5.2.3
  // daemon: it answers 401, and the client used to call that "unreachable" —
  // sending the user to check a host and port that were both correct.
  it('reports "unauthorized", not "unreachable", when the daemon refuses with 401', async () => {
    loginRejectStyle = '401';
    await setScraperSecret('test/qbit', 'wrong-password');
    const report = await qbitTest({ config });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/username or password was rejected/i);
    // The negative control this test exists for: the old mapping produced this.
    expect(report.message).not.toMatch(/answered 401/i);
  });

  it('accepts a password passed in for a test before saving', async () => {
    await clearScraperSecret('test/qbit');
    const report = await qbitTest({ config, password: GOOD_PASS });
    expect(report.status).toBe('connected');
  });

  it('reports "unreachable" when nothing is listening', async () => {
    const report = await qbitTest({ config: { ...config, port: 1 } });
    expect(report.status).toBe('unreachable');
  });
});

describe('qbitTest in API-key mode', () => {
  /** No username and no stored password: the key must carry the call alone. */
  const keyConfig = (): ScraperQbittorrentSettings => ({
    ...config,
    authMode: 'apiKey',
    username: '',
    passwordRef: '',
    apiKeyRef: 'test/qbit-key',
  });

  beforeEach(async () => {
    await setScraperSecret('test/qbit-key', GOOD_KEY);
  });

  afterEach(async () => {
    await clearScraperSecret('test/qbit-key');
  });

  it('connects on the key alone, with no username and no password', async () => {
    const report = await qbitTest({ config: keyConfig() });
    expect(report.status).toBe('connected');
    expect(report.version).toBe('4.6.4');
  });

  it('sends the key as Authorization: Bearer and never as X-Api-Key', async () => {
    await qbitTest({ config: keyConfig() });
    expect(seenHeaders.length).toBeGreaterThan(0);
    for (const headers of seenHeaders) {
      expect(headers.authorization).toBe(`Bearer ${GOOD_KEY}`);
      expect(headers['x-api-key']).toBeUndefined();
    }
    // No login was attempted: a key authenticates on its own.
    expect(addBodies).toEqual([]);
  });

  // Negative control: the daemon must actually refuse a key it does not know.
  it('reports "unauthorized" when the key is wrong, without retrying', async () => {
    await setScraperSecret('test/qbit-key', 'a-key-the-daemon-never-issued');
    const report = await qbitTest({ config: keyConfig() });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/rejected the API key/i);
    // One attempt, not a retry loop: a key does not expire mid-call.
    expect(seenHeaders).toHaveLength(1);
  });

  it('reports "unauthorized" when no key is stored', async () => {
    await clearScraperSecret('test/qbit-key');
    const report = await qbitTest({ config: keyConfig() });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/no api key/i);
    expect(seenHeaders).toHaveLength(0);
  });

  it('refuses an unusable key before making any request', async () => {
    await setScraperSecret('test/qbit-key', `bad key\nwith a newline`);
    const report = await qbitTest({ config: keyConfig() });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/space or control character/i);
    expect(seenHeaders).toHaveLength(0);
  });

  it('accepts a key passed in on the call, ahead of the keychain (no renderer sends one)', async () => {
    await clearScraperSecret('test/qbit-key');
    const report = await qbitTest({ config: keyConfig(), apiKey: GOOD_KEY });
    expect(report.status).toBe('connected');
  });

  it('does not ride a password session after the mode is switched to a bad key', async () => {
    // A real password session first, so a cached SID exists for this base URL.
    expect((await qbitTest({ config })).status).toBe('connected');
    expect((await qbitTransfers({ config })).length).toBeGreaterThan(0);

    await setScraperSecret('test/qbit-key', 'a-key-the-daemon-never-issued');
    const report = await qbitTest({ config: keyConfig() });
    expect(report.status).toBe('unauthorized');
  });

  it('reports "unreachable" rather than connected when the base path is wrong', async () => {
    const report = await qbitTest({ config: { ...keyConfig(), basePath: '/proxied' } });
    expect(report.status).toBe('unreachable');
    expect(report.message).toMatch(/404/);
  });
});

describe('qbitTransfers', () => {
  it('returns mapped rows', async () => {
    const rows = await qbitTransfers({ config });
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toContain('Frieren - 01');
    expect(rows[0].state).toBe('downloading');
    expect(rows[1].state).toBe('stalled');
  });

  it('logs in again when the session has expired', async () => {
    await qbitTransfers({ config });
    // qBittorrent restarted: the cached cookie is now rejected once.
    sessionValid = false;
    const rejected = await qbitTransfers({ config });
    expect(rejected).toEqual([]);
    sessionValid = true;
    const recovered = await qbitTransfers({ config });
    expect(recovered).toHaveLength(2);
  });

  it('returns an empty list rather than throwing when the client is down', async () => {
    await expect(qbitTransfers({ config: { ...config, port: 1 } })).resolves.toEqual([]);
  });

  it('returns nothing when sending is switched off', async () => {
    await expect(qbitTransfers({ config: { ...config, enabled: false } })).resolves.toEqual([]);
  });
});

describe('qbitSend', () => {
  it('sends every eligible row in one request', async () => {
    const report = await qbitSend({ config, rows: [row(), row({ id: 'row-2', magnet: 'magnet:?xt=urn:btih:cc' })] });
    expect(report.sent).toBe(2);
    expect(report.failed).toBe(0);
    expect(addBodies).toHaveLength(1);
    expect(decodeURIComponent(addBodies[0])).toContain('urn:btih:aa11bb22');
  });

  it('skips rows with no seeders or no magnet, and says why', async () => {
    const report = await qbitSend({
      config,
      rows: [row({ seeders: 0 }), row({ id: 'row-3', magnet: '' })],
    });
    expect(report.sent).toBe(0);
    expect(report.skipped).toBe(2);
    expect(report.details.map((d) => d.reason)).toEqual(['No seeders.', 'No magnet link.']);
    expect(addBodies).toHaveLength(0);
  });

  it('fails every row when qBittorrent is unreachable', async () => {
    const report = await qbitSend({ config: { ...config, port: 1 }, rows: [row()] });
    expect(report.failed).toBe(1);
    expect(report.details[0].reason).toBeTruthy();
  });

  it('fails every row when sending is switched off', async () => {
    const report = await qbitSend({ config: { ...config, enabled: false }, rows: [row()] });
    expect(report.failed).toBe(1);
    expect(report.details[0].reason).toMatch(/not enabled/i);
  });

  // A live send returned 409 and the user was told only "qBittorrent answered
  // 409." The daemon had said why in the body, and the report threw it away.
  it('carries qBittorrent’s own explanation of a refusal', async () => {
    addResponse = { status: 409, body: 'Torrent is already in the transfer list.' };
    const report = await qbitSend({ config, rows: [row()] });
    expect(report.sent).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.details[0].reason).toBe(
      'qBittorrent answered 409: Torrent is already in the transfer list.',
    );
  });

  it('falls back to the bare status when the refusal carries no body', async () => {
    addResponse = { status: 500, body: '   ' };
    const report = await qbitSend({ config, rows: [row()] });
    expect(report.details[0].reason).toBe('qBittorrent answered 500.');
  });

  // Measured against a live qBittorrent v5.2.3: a batch holding one duplicate and
  // one new magnet answers **200** with `failure_count: 1`. Reporting every row of
  // a 200 as sent therefore tells the user an episode was delivered that the
  // daemon threw away.
  it('does not report a refused link as sent when the batch partly failed', async () => {
    addResponse = {
      status: 200,
      body: JSON.stringify({
        added_torrent_ids: [HASH_NEW],
        failure_count: 1,
        pending_count: 0,
        success_count: 1,
      }),
    };
    const report = await qbitSend({
      config,
      rows: [
        row({ id: 'ok', name: 'accepted', magnet: `magnet:?xt=urn:btih:${HASH_NEW}` }),
        row({ id: 'no', name: 'refused', magnet: `magnet:?xt=urn:btih:${HASH_PRESENT}` }),
      ],
    });
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.details.find((d) => d.name === 'accepted')?.outcome).toBe('sent');
    expect(report.details.find((d) => d.name === 'refused')).toMatchObject({
      outcome: 'failed',
      reason: 'qBittorrent did not accept this link.',
    });
  });

  it('refuses the whole batch rather than guessing when the refusal cannot be attributed', async () => {
    addResponse = {
      status: 200,
      body: JSON.stringify({
        added_torrent_ids: [],
        failure_count: 1,
        pending_count: 0,
        success_count: 1,
      }),
    };
    // Neither magnet is 40-hex, so no row can be matched to `added_torrent_ids`.
    const report = await qbitSend({
      config,
      rows: [row({ id: 'a' }), row({ id: 'b', magnet: 'magnet:?xt=urn:btih:cc' })],
    });
    expect(report.sent).toBe(0);
    expect(report.failed).toBe(2);
    expect(report.details[0].reason).toBe(
      'qBittorrent accepted 1 of 2 links and refused 1, without naming which.',
    );
  });

  it('still reports a whole-batch success on qBittorrent 4.x’s plain-text body', async () => {
    addResponse = { status: 200, body: 'Ok.' };
    const report = await qbitSend({ config, rows: [row(), row({ id: 'row-2' })] });
    expect(report.sent).toBe(2);
    expect(report.failed).toBe(0);
  });

  // v5.2.3 answers a duplicate add with the literal body "Conflict", which names
  // no cause at all — so the app establishes the common one itself.
  it('names the duplicate instead of the status when the torrent is already there', async () => {
    torrentInfoExtra = [{ hash: HASH_PRESENT.toUpperCase(), name: 'already here', state: 'downloading' }];
    addResponse = { status: 409, body: 'Conflict' };
    const report = await qbitSend({
      config,
      rows: [row({ id: 'dup', magnet: `magnet:?xt=urn:btih:${HASH_PRESENT}` })],
    });
    expect(report.failed).toBe(1);
    expect(report.details[0].reason).toBe('Already in qBittorrent.');
  });

  it('keeps the bare 409 for a row qBittorrent is not already holding', async () => {
    addResponse = { status: 409, body: 'Conflict' };
    const report = await qbitSend({
      config,
      rows: [row({ id: 'fresh', magnet: `magnet:?xt=urn:btih:${HASH_NEW}` })],
    });
    expect(report.details[0].reason).toBe('qBittorrent answered 409: Conflict');
  });
});

describe('parseAddOutcome', () => {
  it('reads the v5.2 JSON result', () => {
    expect(parseAddOutcome(JSON.stringify({
      added_torrent_ids: ['AABB'],
      failure_count: 2,
      pending_count: 1,
      success_count: 3,
    }))).toEqual({
      addedIds: ['aabb'],
      failureCount: 2,
      pendingCount: 1,
      successCount: 3,
    });
  });

  it('returns null for the 4.x text body and for anything without counts', () => {
    expect(parseAddOutcome('Ok.')).toBeNull();
    expect(parseAddOutcome('Fails.')).toBeNull();
    expect(parseAddOutcome('[]')).toBeNull();
    expect(parseAddOutcome(JSON.stringify({ added_torrent_ids: ['aa'] }))).toBeNull();
  });
});

describe('magnetInfoHash', () => {
  it('reads a v1 and a v2 hex infohash, lowercased', () => {
    expect(magnetInfoHash(`magnet:?xt=urn:btih:${HASH_NEW.toUpperCase()}&dn=x`)).toBe(HASH_NEW);
    expect(magnetInfoHash(`magnet:?xt=urn:btmh:${'a'.repeat(64)}`)).toBe('a'.repeat(64));
  });

  it('returns empty for a base32 or truncated hash rather than a wrong one', () => {
    expect(magnetInfoHash('magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TP')).toBe('');
    expect(magnetInfoHash('magnet:?xt=urn:btih:aa11bb22')).toBe('');
    expect(magnetInfoHash('')).toBe('');
  });
});

// ---- a malformed config crossing IPC ------------------------------------
//
// The renderer is typed but not trusted: `ScraperQbitInput` arrives over IPC,
// so a hand-crafted or old payload can be missing any field. Boss audit
// 2026-08-16 18:20 found two ways that used to surface, and both are here.

describe('a config that is missing fields', () => {
  it('leaves a real saved profile byte-identical — normalisation is a fixed point', () => {
    const normalized = normalizeQbitInput({ config });
    expect(normalized.config).toEqual(config);
    // and it is idempotent, so the internal re-entry through qbitTransfers cannot drift
    expect(normalizeQbitInput(normalized).config).toEqual(config);
  });

  it('carries the rest of the input through untouched', () => {
    const rows = [row()];
    const normalized = normalizeQbitInput({ config, rows, password: 'in-memory' });
    expect(normalized.rows).toBe(rows);
    expect(normalized.password).toBe('in-memory');
  });

  it('builds a real base URL from `{}` instead of four undefined tokens', () => {
    // Finding 1: an unvalidated config reached `qbitBaseUrl` and the failure was
    // reported to the user as
    // "Not a usable URL: undefined://undefined:undefinedundefined/api/v2/auth/login".
    const url = qbitBaseUrl(normalizeQbitInput({ config: {} as ScraperQbittorrentSettings }).config);
    expect(url).toBe('http://localhost:8080');
    expect(url).not.toContain('undefined');
  });

  it('connects with `scheme`, `authMode` and `basePath` all absent', async () => {
    // The same payload the finding used, minus every field the defaults can
    // supply — this is the end-to-end half, and it really logs in.
    const partial = {
      enabled: true,
      host: '127.0.0.1',
      port: config.port,
      username: GOOD_USER,
      passwordRef: 'test/qbit',
    } as ScraperQbittorrentSettings;
    const report = await qbitTest({ config: partial });
    expect(report.message).not.toContain('undefined');
    expect(report.status).toBe('connected');
  });

  it('answers `not-configured` when the payload is empty', async () => {
    const report = await qbitTest({ config: {} as ScraperQbittorrentSettings });
    expect(report.status).toBe('not-configured');
    expect(report.message).toBe('Sending to qBittorrent is turned off.');
  });

  it('returns an empty transfer list rather than throwing', async () => {
    await expect(qbitTransfers({ config: {} as ScraperQbittorrentSettings })).resolves.toEqual([]);
  });

  it('sends successfully with no `tags` key at all', async () => {
    // Finding 2: `buildAddForm` read `config.tags.length` and `qbitSend`
    // rejected across IPC with a raw TypeError instead of a QbitSendReport.
    const withoutTags = { ...config } as Record<string, unknown>;
    delete withoutTags.tags;
    const report = await qbitSend({
      config: withoutTags as unknown as ScraperQbittorrentSettings,
      rows: [row()],
    });
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(0);
    expect(addBodies).toHaveLength(1);
    expect(addBodies[0]).not.toContain('tags=');
  });

  it('turns an unexpected throw into a failed report, not a rejection', async () => {
    // Any throw from below the entry point: the report is what the dialog reads.
    const exploding = row();
    Object.defineProperty(exploding, 'magnet', {
      get() {
        throw new Error('boom');
      },
    });
    const report = await qbitSend({ config, rows: [exploding] });
    expect(report.sent).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.details[0].outcome).toBe('failed');
    expect(report.details[0].reason).toBe('qBittorrent send failed: boom');
  });
});

describe('addFailureReason', () => {
  it('never returns an empty string', () => {
    expect(addFailureReason(409, '')).toBe('qBittorrent answered 409.');
    expect(addFailureReason(409, '\n\t ')).toBe('qBittorrent answered 409.');
  });

  it('collapses whitespace and caps a long body', () => {
    expect(addFailureReason(415, 'Torrent file\n  is not valid')).toBe(
      'qBittorrent answered 415: Torrent file is not valid',
    );
    const long = 'x'.repeat(500);
    const reason = addFailureReason(409, long);
    expect(reason.length).toBeLessThanOrEqual('qBittorrent answered 409: '.length + 200);
  });
});

// ---- why a subtitle wait gave up ----------------------------------------
//
// The defect these cover, measured live 2026-08-18: a Route B fetch reported
// "Timed out with 3/39 subtitle file(s) complete" while the same torrent read
// `num_seeds=0, num_leechs=0, dlspeed 0.0 KB/s`. That sentence tells a user to
// wait longer, and there was nobody on the other end to wait for.

/** A 40-hex hash the fixtures deliberately do not hold. */
const HASH_AWAIT = 'cafebabe0123456789abcdef0123456789abcdef';

function stall(overrides: Partial<StallInput> = {}): StallInput {
  return {
    done: 3,
    total: 39,
    waitedMs: 307_916,
    last: { connected: 6, known: 40, speedBps: 120_000 },
    peakConnected: 6,
    clientOffline: false,
    ...overrides,
  };
}

describe('awaitFilesStallReason', () => {
  it('calls a swarm nobody is in dead, not slow', () => {
    const reason = awaitFilesStallReason(stall({
      done: 0,
      last: { connected: 0, known: 0, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('dead, not slow');
    expect(reason).toContain('5 minutes');
    // NEGATIVE CONTROL: the exact sentence the defect produced must be gone.
    // Without the branch this whole block adds, this is what came back.
    expect(reason).not.toContain('Timed out with');
  });

  it('blames the connection, not the release, when the swarm is populated but unreached', () => {
    const reason = awaitFilesStallReason(stall({
      done: 0,
      last: { connected: 0, known: 8, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('the swarm lists 8');
    expect(reason).toContain('connection problem');
    // The distinction is the whole point: this one is not the release's fault.
    expect(reason).not.toContain('dead');
  });

  it('says the swarm went silent when peers were there earlier and are not now', () => {
    const reason = awaitFilesStallReason(stall({
      last: { connected: 0, known: 40, speedBps: 0 },
      peakConnected: 6,
    }));
    expect(reason).toContain('Timed out with 3/39 subtitle file(s) complete.');
    expect(reason).toContain('went silent');
    expect(reason).toContain('waiting longer is unlikely to help');
  });

  it('says a slow swarm is slow, and only then invites a longer wait', () => {
    const reason = awaitFilesStallReason(stall());
    expect(reason).toContain('Timed out with 3/39 subtitle file(s) complete.');
    expect(reason).toContain('Still connected to 6 peer(s) at 120 KB/s');
    expect(reason).toContain('slow, not dead');
  });

  it('blames the client itself in the client\'s own words when it is offline', () => {
    // Word-for-word the status check's sentence, so a user cannot read the two
    // as different problems. Every other input is the dead-swarm shape.
    const reason = awaitFilesStallReason(stall({
      clientOffline: true,
      last: { connected: 0, known: 0, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toBe(
      'qBittorrent is running but not connected to any swarm, so no release can report its contents. '
      + 'Check its network connection, VPN or firewall.',
    );
  });

  it('never reports a zero-minute wait', () => {
    const reason = awaitFilesStallReason(stall({
      waitedMs: 900,
      last: { connected: 0, known: 0, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('1 minute,');
    expect(reason).not.toContain('0 minute');
  });
});

describe('qbitAwaitFiles reads the swarm off the live torrent', () => {
  const SUBS = [
    { index: 0, name: 'Show/Subs/ep01.ass', size: 30_000, progress: 0.4, priority: 1 },
    { index: 1, name: 'Show/Subs/ep02.ass', size: 30_000, progress: 1, priority: 1 },
  ];

  function torrent(overrides: Record<string, unknown> = {}) {
    return {
      hash: HASH_AWAIT,
      name: 'Show',
      state: 'downloading',
      progress: 0.5,
      dlspeed: 0,
      save_path: 'D:\Subs',
      num_leechs: 0,
      num_incomplete: 0,
      num_seeds: 0,
      num_complete: 0,
      ...overrides,
    };
  }

  /**
   * A real but tiny budget. The deadline is real wall-clock inside the wait, so
   * a no-op `sleep` does not skip it — it spins the loop against a live HTTP
   * stand-in for the whole timeout instead. 300 ms at a 15 ms poll leaves room
   * for the several polls the "swarm dies under it" case needs.
   */
  const options = { timeoutMs: 300, pollMs: 15 };

  it('reports a dead swarm as dead', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent()];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('dead, not slow');
  });

  it('reports a populated swarm it cannot reach as a connection problem', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_complete: 7, num_incomplete: 1 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok === false && out.reason).toContain('the swarm lists 8');
    expect(out.ok === false && out.reason).toContain('connection problem');
  });

  it('reports a slow swarm with the count and the speed it measured', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 51_200 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok === false && out.reason).toContain('Timed out with 1/2 subtitle file(s) complete.');
    expect(out.ok === false && out.reason).toContain('Still connected to 6 peer(s) at 51 KB/s');
  });

  it('notices a swarm that dies under it, which one final sample could not', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 5, num_complete: 9 })];
    let polls = 0;
    torrentInfoHook = () => {
      polls += 1;
      // Alive for the first two polls, then everyone leaves. A wait that only
      // looked at the end would call this "never reached anyone".
      if (polls >= 2) torrentInfoExtra = [torrent({ num_seeds: 0, num_complete: 9 })];
    };
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(polls).toBeGreaterThan(2);
    expect(out.ok === false && out.reason).toContain('went silent');
    expect(out.ok === false && out.reason).not.toContain('No seed or peer answered');
  });

  it('still succeeds, and asks the swarm nothing, when every file is complete', async () => {
    fileListResponse = SUBS.map((f) => ({ ...f, progress: 1 }));
    torrentInfoExtra = [torrent()];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok).toBe(true);
    expect(out.ok === true && out.value.map((f) => f.index)).toEqual([0, 1]);
  });
});
