// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  validateScraperQbittorrentSettings,
  type ScraperQbittorrentSettings,
  type ScraperSettingsIssue,
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

const { addFailureReason, awaitFilesStallReason, buildAddForm, magnetInfoHash, mapQbitState, mapTransfer, normalizeQbitInput, parseAddOutcome, qbitAwaitFiles, qbitBaseUrl, qbitFiles, qbitSend, qbitSetFilePriorities, qbitStart, qbitAwaitMetadata, qbitTest, qbitTorrentInfo, qbitTransfers, resetQbitSessions, swarmCount, swarmSampleOf, unreachedSwarmReason } =
  await import('../scraper/qbittorrent');
type StallInput = Parameters<typeof awaitFilesStallReason>[0];

/** Two real-shaped 40-hex infohashes: one the stand-in holds, one it does not. */
const HASH_PRESENT = '0123456789abcdef0123456789abcdef01234567';
const HASH_NEW = '89abcdef0123456789abcdef0123456789abcdef';
const { getScraperSecret, hasScraperSecret, setScraperSecret, clearScraperSecret } =
  await import('../scraper/credentials');
const { readSecret, setCredentialVaultRoot } = await import('../credentials/vault');
const { setScraperStoreRoot } = await import('../scraper/store');
const { flushScraperLogWrites, recentScraperLogs, resetScraperLogs, scraperLog, scraperLogFiles } =
  await import('../scraper/logBus');
const { redactHeaders } = await import('../scraper/http');

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
/**
 * The reverse-proxy base path the stand-in answers under, `''` for the root.
 *
 * Gate 18's durable half. Before it, the only `basePath` coverage in this repo
 * called `qbitBaseUrl` directly, so a refactor that built a URL any other way
 * would have left the suite green while every reverse-proxy install broke.
 */
let mountPath = '';
/** Every request the app actually sent, so a header claim is measured not assumed. */
let seenHeaders: http.IncomingHttpHeaders[] = [];
/**
 * The same requests as a comparable wire record, for Phase 9.1 gate 2.
 *
 * "Byte-identical to today's" cannot be checked against code that no longer
 * exists, so the durable form of that gate is a pin: the password path's method,
 * target and full header set are recorded here and asserted against a literal.
 * Anything the key-mode work adds to a password-mode request breaks it.
 */
interface WireRecord {
  method: string;
  target: string;
  headers: Record<string, string>;
}
let seenWire: WireRecord[] = [];
/** The login form as it arrived, mirroring `addBodies`. Gate 2 pins these bytes. */
let loginBodies: string[] = [];
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
/**
 * The POST routes that only acknowledge, so the stand-in answers them the way a
 * daemon does rather than 404ing an operation into a false failure.
 */
const COMMAND_ROUTES = [
  '/api/v2/torrents/filePrio',
  '/api/v2/torrents/resume',
  '/api/v2/torrents/start',
  '/api/v2/torrents/pause',
  '/api/v2/torrents/stop',
  '/api/v2/torrents/delete',
];
/** Their forms, so a priority or a hash list is measured rather than assumed. */
let commandBodies: { route: string; body: string }[] = [];

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
    seenWire.push({
      method: req.method ?? '',
      target: req.url ?? '',
      // `host`, `connection` and `content-length` are the socket's and the
      // payload's, not the client's choice, so they are dropped rather than
      // pinned — otherwise the literal would encode the ephemeral test port.
      headers: Object.fromEntries(
        Object.entries(req.headers)
          .filter(([key]) => !['host', 'connection', 'content-length'].includes(key))
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]),
      ),
    });
    // Gate 18: the stand-in can be mounted under a reverse-proxy base path.
    // When it is, everything outside that mount 404s exactly as a real proxy
    // answers — which is what makes "the client sent the base path" a
    // measurement rather than an assumption. `''` keeps every other test at the
    // root, so the mount is invisible unless a test asks for it.
    if (mountPath && !url.pathname.startsWith(`${mountPath}/`)) {
      res.writeHead(404);
      res.end('No qBittorrent is mounted at this path.');
      return;
    }
    const routed = mountPath ? url.pathname.slice(mountPath.length) : url.pathname;
    // Mirrors the contract measured against a real daemon under
    // `WebUI\LocalHostAuth=true`: Bearer authorizes, `X-Api-Key` does not. The
    // second half is enforced by simply never reading that header.
    const keyed = (req.headers.authorization ?? '') === `Bearer ${GOOD_KEY}`;
    const authed =
      keyed || (sessionValid && (req.headers.cookie ?? '').includes('SID=session-token'));

    if (routed === '/api/v2/auth/login') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        loginBodies.push(body);
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

    if (routed === '/api/v2/app/version') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('v4.6.4');
      return;
    }
    if (routed === '/api/v2/transfer/info') {
      if (!connectionStatus) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ connection_status: connectionStatus, dht_nodes: 312 }));
      return;
    }
    if (routed === '/api/v2/torrents/info') {
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
    if (routed === '/api/v2/torrents/files') {
      if (!fileListResponse) {
        res.writeHead(404);
        res.end('Torrent hash was not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(fileListResponse));
      return;
    }
    if (routed === '/api/v2/torrents/add') {
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
    // The write half of the acquisition — gate 9's `qbitSetFilePriorities` and
    // `qbitStart`, plus the stop and the reaper's delete. They 404'd here until
    // 2026-08-19, which is why nothing in this suite could tell an operation
    // that authenticates from one that does not: an op reaching an unrouted
    // path fails identically whether or not it sent a credential.
    if (COMMAND_ROUTES.includes(routed)) {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        commandBodies.push({ route: routed, body });
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Ok.');
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
  mountPath = '';
  addBodies = [];
  addResponse = { status: 200, body: 'Ok.' };
  seenHeaders = [];
  seenWire = [];
  loginBodies = [];
  commandBodies = [];
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

// Phase 9.0's fourth bullet: "`qbitTest()` reports *which* mode authenticated,
// so a user can tell a working key from a working password." The field is on
// the report rather than only in the prose message because a surface has to be
// able to render it without parsing English.
describe('qbitTest names the auth mode it used', () => {
  const keyConfig = (): ScraperQbittorrentSettings => ({
    ...config,
    authMode: 'apiKey',
    username: '',
    passwordRef: '',
    apiKeyRef: 'test/qbit-key',
  });

  afterEach(async () => {
    await clearScraperSecret('test/qbit-key');
  });

  it('says `password` on a password-mode success and `apiKey` on a key-mode one', async () => {
    expect((await qbitTest({ config })).authMode).toBe('password');
    resetQbitSessions();
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    expect((await qbitTest({ config: keyConfig() })).authMode).toBe('apiKey');
  });

  // The whole point of the field. Both of these are `unauthorized` with a
  // rejection message, and with a password AND a key stored the status alone
  // sends the user to change the credential that was never consulted.
  it('distinguishes a rejected password from a rejected key', async () => {
    await setScraperSecret('test/qbit', 'wrong-password');
    const badPassword = await qbitTest({ config });
    resetQbitSessions();
    await setScraperSecret('test/qbit-key', 'a-key-the-daemon-never-issued');
    const badKey = await qbitTest({ config: keyConfig() });

    expect(badPassword.status).toBe('unauthorized');
    expect(badKey.status).toBe('unauthorized');
    expect(badPassword.authMode).toBe('password');
    expect(badKey.authMode).toBe('apiKey');
    expect(badPassword.message).not.toBe(badKey.message);
  });

  it('names the mode on the refusals that never reach the network', async () => {
    await clearScraperSecret('test/qbit');
    const noPassword = await qbitTest({ config });
    const noUser = await qbitTest({ config: { ...config, username: '' } });
    const noKey = await qbitTest({ config: keyConfig() });
    expect(noPassword.authMode).toBe('password');
    expect(noUser.authMode).toBe('password');
    expect(noKey.authMode).toBe('apiKey');
    expect(seenHeaders).toHaveLength(0);
  });

  it('names the mode on an unreachable base path, not only on success', async () => {
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    const report = await qbitTest({ config: { ...keyConfig(), basePath: '/proxied' } });
    expect(report.status).toBe('unreachable');
    expect(report.authMode).toBe('apiKey');
  });

  // The deliberate absence: sending is switched off, so no credential was
  // reached and claiming one would be an invention.
  it('omits the mode when sending is switched off', async () => {
    const report = await qbitTest({ config: { ...config, enabled: false } });
    expect(report.status).toBe('not-configured');
    expect(report.authMode).toBeUndefined();
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
    last: { connected: 6, seedsKnown: 12, peersKnown: 28, speedBps: 120_000 },
    peakConnected: 6,
    clientOffline: false,
    ...overrides,
  };
}

describe('awaitFilesStallReason', () => {
  it('calls a swarm nobody is in dead, not slow', () => {
    const reason = awaitFilesStallReason(stall({
      done: 0,
      last: { connected: 0, seedsKnown: 0, peersKnown: 0, speedBps: 0 },
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
      last: { connected: 0, seedsKnown: 8, peersKnown: 4, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('lists 8 seed(s)');
    expect(reason).toContain('connection problem');
    // The distinction is the whole point: this one is not the release's fault.
    // The sentence ends "not a dead release", so the word is present on purpose
    // — what must be absent is the verdict.
    expect(reason).not.toContain('dead, not slow');
    expect(reason).not.toContain('Pick another release');
  });

  it('says the swarm went silent when peers were there earlier and are not now', () => {
    const reason = awaitFilesStallReason(stall({
      last: { connected: 0, seedsKnown: 12, peersKnown: 28, speedBps: 0 },
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
      last: { connected: 0, seedsKnown: 0, peersKnown: 0, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toBe(
      'qBittorrent is running but not connected to any swarm, so no release can report its contents. '
      + 'Check its network connection, VPN or firewall.',
    );
  });

  it('refuses to call a release dead when no tracker ever answered', () => {
    // `-1` is qBittorrent's "not scraped yet", which is what a torrent added
    // seconds ago reports. Reading it as zero would convict a live release.
    const reason = awaitFilesStallReason(stall({
      done: 0,
      last: { connected: 0, seedsKnown: null, peersKnown: null, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('never learned how many');
    expect(reason).not.toContain('dead, not slow');
    expect(reason).not.toContain('connection problem');
  });

  it('says the same when torrents/info was unreadable for the whole wait', () => {
    const reason = awaitFilesStallReason(stall({ done: 0, last: null, peakConnected: 0 }));
    expect(reason).toContain('never learned how many');
  });

  it('does not call a swarm that sent nothing "slow"', () => {
    // Peers connected the whole time and not a byte at any rate. The old
    // sentence told that user to be patient; the wait has by then already been
    // patient for its whole stall budget, so patience is not the missing part.
    const reason = awaitFilesStallReason(stall({ nothingArrived: true }));
    expect(reason).toContain('sent nothing at all');
    expect(reason).toContain('pick another release');
    expect(reason).not.toContain('slow, not dead');
  });

  it('says the fetch ran out of ceiling, not that the release is at fault', () => {
    const reason = awaitFilesStallReason(stall({ nothingArrived: false, hitCeiling: true }));
    expect(reason).toContain('Subtitles were still arriving at 120 KB/s from 6 peer(s)');
    expect(reason).toContain('Nothing is wrong with the release');
    // NEGATIVE CONTROL: it must not still be recommending a wait it already took.
    expect(reason).not.toContain('slow, not dead');
  });

  it('keeps the old sentence when the wait had no ceiling to reach', () => {
    // A caller with its own budget gets the original wording, unchanged.
    const reason = awaitFilesStallReason(stall({ nothingArrived: false, hitCeiling: false }));
    expect(reason).toContain('slow, not dead');
  });

  it('never reports a zero-minute wait', () => {
    const reason = awaitFilesStallReason(stall({
      waitedMs: 900,
      last: { connected: 0, seedsKnown: 0, peersKnown: 0, speedBps: 0 },
      peakConnected: 0,
    }));
    expect(reason).toContain('in 1 minute.');
    expect(reason).not.toContain('0 minute');
  });
});

describe('swarmCount and the swarm sample', () => {
  it('reads a tracker that has not answered as unknown, not as empty', () => {
    // qBittorrent's own value for an unscraped tracker. Reading it raw is how a
    // message ends up claiming "the swarm lists -1".
    expect(swarmCount(-1)).toBeNull();
  });

  it('reads a real zero as a real zero', () => {
    // Measured live on qBittorrent 5.2.3, on a torrent added seconds earlier:
    // `num_complete` 0 and `num_incomplete` 61. Zero here is a fact, not a gap.
    expect(swarmCount(0)).toBe(0);
    expect(swarmCount(61)).toBe(61);
  });

  it('keeps the two halves apart, which is what decides the advice', () => {
    // The exact live shape of gate 31's Route B candidate on 2026-08-18.
    const sample = swarmSampleOf(mapTransfer({
      num_seeds: 0, num_leechs: 0, num_complete: 0, num_incomplete: 1, dlspeed: 0,
    }));
    expect(sample).toEqual({ connected: 0, seedsKnown: 0, peersKnown: 1, speedBps: 0 });
    // Summed it would be 1, and "we reached none of 1" reads as the user's
    // firewall. Split, it is "no complete copy is being shared".
    expect(unreachedSwarmReason(sample)).toContain('no seed');
    expect(unreachedSwarmReason(sample)).not.toContain('connection problem');
  });

  it('drops only the half the tracker withheld', () => {
    const sample = swarmSampleOf(mapTransfer({ num_complete: -1, num_incomplete: 61 }));
    expect(sample.seedsKnown).toBeNull();
    expect(sample.peersKnown).toBe(61);
  });
});

describe('unreachedSwarmReason', () => {
  const s = (seedsKnown: number | null, peersKnown: number | null) =>
    unreachedSwarmReason({ connected: 0, seedsKnown, peersKnown, speedBps: 0 });

  it('blames the connection only when a seed actually exists', () => {
    expect(s(8, 4)).toContain('connection problem');
    expect(s(8, 4)).toContain('lists 8 seed(s)');
  });

  it('blames the release when peers exist but no seed does', () => {
    expect(s(0, 1)).toContain('1 peer(s) and no seed');
    expect(s(0, 1)).toContain('complete copy');
    expect(s(0, 1)).not.toContain('connection problem');
  });

  it('calls an empty swarm dead', () => {
    expect(s(0, 0)).toContain('dead, not slow');
  });

  it('convicts nobody when the tracker never answered', () => {
    expect(s(null, null)).toContain('never learned how many');
    // It says "nothing says it is dead either" — a refusal to convict, which is
    // the opposite of the verdict, so the verdict is what is asserted absent.
    expect(s(null, null)).not.toContain('dead, not slow');
    expect(s(null, null)).not.toContain('Pick another release');
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
      save_path: 'D:\\Subs',
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
    // 7 seeds, not the 8 a sum would report: the leecher is not a complete copy
    // and naming it here is what made the advice wrong.
    expect(out.ok === false && out.reason).toContain('lists 7 seed(s)');
    expect(out.ok === false && out.reason).toContain('connection problem');
  });

  it('reports a slow swarm with the count and the speed it measured', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 51_200 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok === false && out.reason).toContain('Timed out with 1/2 subtitle file(s) complete.');
    expect(out.ok === false && out.reason).toContain('Still connected to 6 peer(s) at 51 KB/s');
  });

  it('does not convict a release whose tracker answered -1', async () => {
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_complete: -1, num_incomplete: -1 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok === false && out.reason).toContain('never learned how many');
    // NEGATIVE CONTROL: the sentence a raw read would have produced.
    expect(out.ok === false && out.reason).not.toContain('-1');
    expect(out.ok === false && out.reason).not.toContain('dead, not slow');
  });

  it('blames the release, not the firewall, for a swarm with peers and no seed', async () => {
    // The live shape, end to end through the wait rather than through the pure
    // function: `num_complete 0, num_incomplete 1` for the whole wait.
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_complete: 0, num_incomplete: 1 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok === false && out.reason).toContain('1 peer(s) and no seed');
    expect(out.ok === false && out.reason).not.toContain('connection problem');
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

  it('hands back the files that did finish, so a stall is not all-or-nothing', async () => {
    // `SUBS` is index 0 at 40% and index 1 whole — the measured Route B shape in
    // miniature. The refusal is unchanged; what is new is that index 1 comes
    // back with it instead of being discarded.
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 4, dlspeed: 0 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.partial?.map((f) => f.index)).toEqual([1]);
    // NEGATIVE CONTROL: the incomplete file must not ride along. It is on disk
    // at 40% and reading it would produce a truncated subtitle nothing can spot.
    expect(out.ok === false && out.partial?.some((f) => f.progress < 1)).toBe(false);
  });

  it('reports an empty partial rather than a misleading one when nothing finished', async () => {
    fileListResponse = SUBS.map((f) => ({ ...f, progress: 0.4 }));
    torrentInfoExtra = [torrent({ num_seeds: 4, dlspeed: 0 })];
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], options);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.partial).toEqual([]);
    expect(out.ok === false && out.reason).toContain('0/2 subtitle file(s) complete');
  });

  // ---- the budget is a stall budget, not a wall clock ---------------------
  //
  // Measured 2026-08-18: a 39-sidecar Route B pack timed out at `3/39` while
  // connected to 16 peers at 121 KB/s, and the product printed *"this swarm is
  // slow, not dead, so a longer wait may finish it"* — advice it then offered no
  // way to take. Whole-file completion is far too coarse to steer by; sidecars
  // behind 4 MB piece alignment can transfer for twenty minutes and finish none.
  //
  // Wall-clock assertions here are one-sided on purpose: a loaded machine can
  // make a wait longer, never shorter, so the bounds that matter are the floors
  // for "it kept going" and the ceilings for "it did not".

  /** A file list whose first file gains bytes on every poll and never completes. */
  function trickling(step: number): void {
    let progress = SUBS[0].progress;
    fileListResponse = SUBS.map((f) => ({ ...f }));
    torrentInfoHook = () => {
      progress = Math.min(0.95, progress + step);
      fileListResponse = [{ ...SUBS[0], progress }, SUBS[1]];
    };
  }

  it('keeps waiting past the budget while subtitle bytes are still arriving', async () => {
    // `dlspeed: 0` on purpose: the *bytes* are the signal being tested here, and
    // a nonzero rate would extend the wait on its own and prove nothing.
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 0 })];
    // Slow enough that bytes are still arriving when the ceiling lands — so the
    // upper bound below is the ceiling doing its job, not the trickle running out.
    trickling(0.002);

    const startedAt = Date.now();
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], {
      timeoutMs: 120,
      pollMs: 15,
      progressCeilingMs: 700,
    });
    const elapsed = Date.now() - startedAt;

    // Without the renewal this returns at ~120 ms. It has to reach the ceiling.
    expect(elapsed).toBeGreaterThan(500);
    // And stop there: an unclamped renewal would follow this trickle for ~4 s,
    // which in the product is a discovery sweep pinned by one release forever.
    expect(elapsed).toBeLessThan(1_600);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('Subtitles were still arriving');
    // NEGATIVE CONTROL: the sentence that recommended a wait nothing could take.
    expect(out.ok === false && out.reason).not.toContain('slow, not dead');
  });

  it('does not let a ceiling stretch a wait that nothing is arriving on', async () => {
    // The other half, and the one a ceiling alone would break: a dead transfer
    // must still give up on the short budget rather than hold the pipeline for
    // the whole ceiling.
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 0 })];

    const startedAt = Date.now();
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], {
      timeoutMs: 120,
      pollMs: 15,
      progressCeilingMs: 10_000,
    });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(2_000);
    expect(out.ok === false && out.reason).toContain('sent nothing at all');
    expect(out.ok === false && out.reason).not.toContain('slow, not dead');
  });

  it('waits on a rate even when no wanted file has gained a byte', async () => {
    // The measured shape, and the one a byte-only signal gets wrong: a 30 KB
    // sidecar inside a 4 MB piece stays at its starting fraction until the piece
    // completes, so a real transfer looks frozen for minutes at a time.
    fileListResponse = SUBS;
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 121_000 })];

    const startedAt = Date.now();
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], {
      timeoutMs: 120,
      pollMs: 15,
      progressCeilingMs: 700,
    });

    expect(Date.now() - startedAt).toBeGreaterThan(500);
    expect(out.ok === false && out.reason).toContain('Subtitles were still arriving');
    expect(out.ok === false && out.reason).not.toContain('sent nothing at all');
  });

  it('completes a transfer that would have been killed by the old wall clock', async () => {
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 121_000 })];
    let polls = 0;
    fileListResponse = SUBS.map((f) => ({ ...f, progress: 0 }));
    torrentInfoHook = () => {
      polls += 1;
      // Steady arrival for well past the 60 ms budget, then done.
      const progress = polls >= 20 ? 1 : Math.min(0.95, polls * 0.05);
      fileListResponse = SUBS.map((f) => ({ ...f, progress }));
    };

    const startedAt = Date.now();
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], {
      timeoutMs: 60,
      pollMs: 15,
      progressCeilingMs: 5_000,
    });

    expect(out.ok).toBe(true);
    expect(Date.now() - startedAt).toBeGreaterThan(60);
    expect(polls).toBeGreaterThanOrEqual(20);
  });

  it('is the old wall clock exactly when no ceiling is given', async () => {
    // Every other caller keeps the budget it asked for: `progressCeilingMs`
    // absent must not silently turn a 120 ms wait into a long one just because
    // bytes happen to be moving.
    torrentInfoExtra = [torrent({ num_seeds: 4, num_leechs: 2, num_complete: 9, dlspeed: 121_000 })];
    trickling(0.02);

    const startedAt = Date.now();
    // No `progressCeilingMs`, and everything else says "still arriving".
    const out = await qbitAwaitFiles({ config }, HASH_AWAIT, [0, 1], { timeoutMs: 120, pollMs: 15 });

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('slow, not dead');
  });
});

// ---- the metadata wait had the identical blind spot -----------------------
//
// Measured live 2026-08-18: gate 31's own Route B candidate spent 8 minutes at
// `seedsConnected 0, peersConnected 0, seedsTotal 0, peersTotal 1` and was
// reported as "no peer sent its file list within 8 minutes" — true, and silent
// about the fact that no complete copy of it is being shared at all. The fetch
// never reached `qbitAwaitFiles`; it died one function earlier, saying nothing.

describe('qbitAwaitMetadata names the swarm too', () => {
  const options = { timeoutMs: 300, pollMs: 15 };

  function torrent(overrides: Record<string, unknown> = {}) {
    return {
      hash: HASH_AWAIT,
      name: 'Show',
      state: 'metaDL',
      progress: 0,
      save_path: 'D:\\Subs',
      num_leechs: 0,
      num_incomplete: 0,
      num_seeds: 0,
      num_complete: 0,
      ...overrides,
    };
  }

  it('reports the live shape as a release nobody has a complete copy of', async () => {
    fileListResponse = [];
    torrentInfoExtra = [torrent({ num_incomplete: 1 })];
    const out = await qbitAwaitMetadata({ config }, HASH_AWAIT, options);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('1 peer(s) and no seed');
    // NEGATIVE CONTROL: the sentence the live run actually produced, which
    // named the symptom and stopped there.
    expect(out.ok === false && out.reason).not.toBe(
      'qBittorrent could not read what is inside this release: no peer sent its file list within 1 minute.',
    );
  });

  it('calls an empty swarm dead here too', async () => {
    fileListResponse = [];
    torrentInfoExtra = [torrent()];
    const out = await qbitAwaitMetadata({ config }, HASH_AWAIT, options);
    expect(out.ok === false && out.reason).toContain('dead, not slow');
  });

  it('keeps blaming the connection when seeds are there and unreached', async () => {
    fileListResponse = [];
    torrentInfoExtra = [torrent({ num_complete: 6, num_incomplete: 2 })];
    const out = await qbitAwaitMetadata({ config }, HASH_AWAIT, options);
    expect(out.ok === false && out.reason).toContain('connection problem');
  });

  it('says peers connected and stayed mute when they did', async () => {
    // The one case that is genuinely about the release rather than the swarm:
    // somebody is on the wire and still nobody sends the file list.
    fileListResponse = [];
    torrentInfoExtra = [torrent({ num_seeds: 3, num_complete: 9 })];
    const out = await qbitAwaitMetadata({ config }, HASH_AWAIT, options);
    expect(out.ok === false && out.reason).toContain('peers connected but none sent');
  });

  it('still returns the file list the moment one arrives', async () => {
    fileListResponse = [{ index: 0, name: 'Show/ep01.ass', size: 30_000, progress: 0, priority: 1 }];
    torrentInfoExtra = [torrent()];
    const out = await qbitAwaitMetadata({ config }, HASH_AWAIT, options);
    expect(out.ok).toBe(true);
    expect(out.ok === true && out.value.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 9.1 contract gates. Gates 1 and 5 are covered by the API-key describe
// above ("sends the key as Authorization: Bearer and never as X-Api-Key" and
// "refuses an unusable key before making any request"). What follows is 2, 3
// and 4, which were unwritten.
// ---------------------------------------------------------------------------

/** Gate 2's pin, with the ephemeral test port substituted at assert time. */
const BROWSERISH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
    + 'Chrome/126.0 Safari/537.36',
  accept: '*/*',
  'accept-language': 'ja,en;q=0.8',
};

describe('Phase 9.1 gate 2 — the password path is byte-identical', () => {
  /**
   * "Byte-identical to today's" cannot be diffed against code that no longer
   * exists, so it is pinned instead: the exact requests a password-mode
   * `qbitTest` puts on the wire, header for header. The key-mode work must not
   * have added an `authorization`, changed the login form, reordered the
   * sequence or dropped the `referer` qBittorrent requires cross-origin.
   */
  it('sends exactly the login → version → transfer/info sequence it always did', async () => {
    const base = qbitBaseUrl(config);
    const report = await qbitTest({ config });
    expect(report.status).toBe('connected');

    expect(seenWire).toEqual([
      {
        method: 'POST',
        target: '/api/v2/auth/login',
        headers: {
          ...BROWSERISH_HEADERS,
          'content-type': 'application/x-www-form-urlencoded',
          referer: base,
        },
      },
      {
        method: 'GET',
        target: '/api/v2/app/version',
        headers: { ...BROWSERISH_HEADERS, cookie: 'SID=session-token', referer: base },
      },
      {
        method: 'GET',
        target: '/api/v2/transfer/info',
        headers: { ...BROWSERISH_HEADERS, cookie: 'SID=session-token', referer: base },
      },
    ]);
    // The credential itself, form-encoded, and nothing else in the body.
    expect(loginBodies).toEqual([`username=${GOOD_USER}&password=${GOOD_PASS}`]);
  });

  /**
   * The control that makes the pin a measurement: the same recorder, on the
   * same operation, produces a *different* record in key mode. Without this,
   * a pin that had silently stopped discriminating would still read green.
   */
  it('records a visibly different wire in key mode, so the pin discriminates', async () => {
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    try {
      const report = await qbitTest({
        config: { ...config, authMode: 'apiKey', username: '', passwordRef: '', apiKeyRef: 'test/qbit-key' },
      });
      expect(report.status).toBe('connected');
      // No login at all, and every request carries the header the password path
      // never sends.
      expect(seenWire.map((r) => r.target)).toEqual([
        '/api/v2/app/version',
        '/api/v2/transfer/info',
      ]);
      expect(loginBodies).toEqual([]);
      for (const record of seenWire) {
        expect(record.headers.authorization).toBe(`Bearer ${GOOD_KEY}`);
        expect(record.headers.cookie).toBeUndefined();
      }
    } finally {
      await clearScraperSecret('test/qbit-key');
    }
  });

  /** The send path, which is the one acquisition actually uses. */
  it('sends the add form on the SID cookie, with no authorization header', async () => {
    const base = qbitBaseUrl(config);
    await qbitSend({ config, rows: [row({ magnet: 'magnet:?xt=urn:btih:' + HASH_NEW })] });
    const add = seenWire.find((r) => r.target === '/api/v2/torrents/add');
    expect(add).toEqual({
      method: 'POST',
      target: '/api/v2/torrents/add',
      headers: {
        ...BROWSERISH_HEADERS,
        'content-type': 'application/x-www-form-urlencoded',
        cookie: 'SID=session-token',
        referer: base,
      },
    });
  });
});

describe('Phase 9.4 gate 18 — a reverse-proxy base path, in both auth modes', () => {
  /**
   * Measured live on 2026-08-19 through `debug/qbit-basepath-proxy.cjs`: the app
   * reached a real qBittorrent 5.2.3 on `127.0.0.1:8781/qb` in key mode and read
   * back `v5.2.3`, while the same port with an empty base path answered 404.
   * These are the same ten shapes, pinned so a refactor cannot quietly drop the
   * base path — the only coverage before this called `qbitBaseUrl` directly,
   * which any URL built some other way would sail straight past.
   */
  const MOUNT = '/qbt';
  const mounted = (over: Partial<ScraperQbittorrentSettings> = {}): ScraperQbittorrentSettings =>
    ({ ...config, basePath: MOUNT, ...over });

  it('puts the base path on every request the password path makes', async () => {
    mountPath = MOUNT;
    const report = await qbitTest({ config: mounted() });
    expect(report.status).toBe('connected');
    expect(report.version).toBe('4.6.4');
    // Every target, login included, carries the mount. `toEqual` on the whole
    // list rather than a `some()` — a check that passed on one prefixed request
    // would miss the case where only the login got it.
    expect(seenWire.map((r) => r.target)).toEqual([
      `${MOUNT}/api/v2/auth/login`,
      `${MOUNT}/api/v2/app/version`,
      `${MOUNT}/api/v2/transfer/info`,
    ]);
    // The Referer qBittorrent's CSRF check reads has to be the proxy's own URL,
    // not the daemon's, or a real reverse-proxy install is refused.
    for (const record of seenWire) {
      expect(record.headers.referer).toBe(`http://127.0.0.1:${config.port}${MOUNT}`);
    }
  });

  it('puts the base path on every request key mode makes', async () => {
    mountPath = MOUNT;
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    try {
      const report = await qbitTest({
        config: mounted({ authMode: 'apiKey', username: '', passwordRef: '', apiKeyRef: 'test/qbit-key' }),
      });
      expect(report.status).toBe('connected');
      expect(seenWire.map((r) => r.target)).toEqual([
        `${MOUNT}/api/v2/app/version`,
        `${MOUNT}/api/v2/transfer/info`,
      ]);
    } finally {
      await clearScraperSecret('test/qbit-key');
    }
  });

  /**
   * The control that makes the two above measurements. Same mounted daemon,
   * same credential, base path left empty — the client must miss it, and say
   * which request missed it rather than blaming the host.
   */
  it('fails, and names the failing request, when the base path is left off', async () => {
    mountPath = MOUNT;
    const report = await qbitTest({ config: { ...config, basePath: '' } });
    expect(report.status).toBe('unreachable');
    expect(report.message).toBe('qBittorrent answered 404 to the login.');
    expect(seenWire.map((r) => r.target)).toEqual(['/api/v2/auth/login']);
  });

  it('fails in key mode too when the base path is left off', async () => {
    mountPath = MOUNT;
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    try {
      const report = await qbitTest({
        config: { ...config, basePath: '', authMode: 'apiKey', username: '', passwordRef: '', apiKeyRef: 'test/qbit-key' },
      });
      // Key mode has no login step, so the version request is where a wrong
      // base path first shows — the one place `qbitTest` can catch it.
      expect(report.status).toBe('unreachable');
      expect(report.message).toBe('qBittorrent answered 404 to the version request.');
    } finally {
      await clearScraperSecret('test/qbit-key');
    }
  });

  it('sends a wrong base path verbatim rather than silently correcting it', async () => {
    mountPath = MOUNT;
    const report = await qbitTest({ config: { ...config, basePath: '/wrong' } });
    expect(report.status).toBe('unreachable');
    expect(seenWire.map((r) => r.target)).toEqual(['/wrong/api/v2/auth/login']);
  });

  /**
   * What a user actually types into the Base Path field. `qbt` and `/qbt/` are
   * both normalized on the way into the settings document, so both have to
   * reach the same mount as `/qbt` — through `normalizeQbitInput`, which is
   * what the IPC entry point runs.
   */
  it.each([['qbt'], ['/qbt/'], ['/qbt']])('connects on a base path typed as %j', async (typed) => {
    mountPath = MOUNT;
    const report = await qbitTest(
      normalizeQbitInput({ config: { ...config, basePath: typed } }),
    );
    expect(report.status).toBe('connected');
    expect(seenWire[0].target).toBe(`${MOUNT}/api/v2/auth/login`);
  });

  /** The send path, since acquisition is the reason the base path matters. */
  it('carries the base path into torrents/add', async () => {
    mountPath = MOUNT;
    await qbitSend({
      config: mounted(),
      rows: [row({ magnet: `magnet:?xt=urn:btih:${HASH_NEW}` })],
    });
    expect(seenWire.map((r) => r.target)).toContain(`${MOUNT}/api/v2/torrents/add`);
    expect(addBodies.length).toBe(1);
  });

  /**
   * Two deployments of the same daemon differing only by base path are two
   * different sessions. The cookie map is keyed on the full base URL, so this
   * pins that it stays that way — a key of `host:port` would hand the second
   * deployment a cookie the first one minted.
   */
  it('does not reuse one base path’s session on another', async () => {
    mountPath = MOUNT;
    await qbitTest({ config: mounted() });
    const loginsAfterFirst = seenWire.filter((r) => r.target.endsWith('/auth/login')).length;
    expect(loginsAfterFirst).toBe(1);
    await qbitTransfers({ config: mounted({ basePath: '/other' }) });
    // The second base path is unmounted here, so it 404s — the point is that it
    // tried to log in again instead of riding the first mount's cookie.
    expect(seenWire.filter((r) => r.target === '/other/api/v2/auth/login').length).toBe(1);
  });
});

describe('Phase 9.1 gate 3 — the key never leaves the vault', () => {
  /**
   * Recognisable on sight and a legal header value, so it reaches the wire
   * rather than being refused by `apiKeyProblem` before anything happens.
   */
  const SENTINEL = 'SENTINELqbitKEY7f3a2b91c4d6e8';

  const keyConfig = (): ScraperQbittorrentSettings => ({
    ...config,
    authMode: 'apiKey',
    username: '',
    passwordRef: '',
    apiKeyRef: 'test/qbit-key',
  });

  /** Every place a user or a support log could read the value back. */
  async function everythingRendered(): Promise<string> {
    await flushScraperLogWrites();
    const parts: string[] = [];
    for (const file of scraperLogFiles()) {
      parts.push(await fsp.readFile(file, 'utf-8').catch(() => ''));
    }
    parts.push(JSON.stringify(recentScraperLogs(2_000)));
    // The persisted settings document, through the validator persistence uses.
    const issues: ScraperSettingsIssue[] = [];
    parts.push(JSON.stringify(validateScraperQbittorrentSettings(
      // A hand-written config or a naive import is the realistic source of a
      // plaintext key, so the document is built from one that carries it.
      { ...keyConfig(), apiKey: SENTINEL },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
      issues,
      'qbittorrent',
    )));
    // What the HTTP Inspector renders for the requests that actually carried it.
    for (const headers of seenHeaders) parts.push(JSON.stringify(redactHeaders(headers)));
    return parts.join('\n');
  }

  beforeEach(() => {
    // The ring outlives a test; a leak planted by the control below must not be
    // what the absence check reads.
    resetScraperLogs();
  });

  afterEach(async () => {
    await clearScraperSecret('test/qbit-key');
  });

  it('is absent from every log line, report, settings document and rendered header', async () => {
    await setScraperSecret('test/qbit-key', SENTINEL);
    // The key really is the one in play — otherwise the whole scan is vacuous.
    expect(await getScraperSecret('test/qbit-key')).toBe(SENTINEL);

    // Every outcome the client can produce with a key stored: a rejection, a
    // transfer list, and a send that the daemon refuses with a body.
    const rejected = await qbitTest({ config: keyConfig() });
    expect(rejected.status).toBe('unauthorized');
    const transfers = await qbitTransfers({ config: keyConfig() });
    addResponse = { status: 409, body: 'Conflict' };
    const send = await qbitSend({
      config: keyConfig(),
      rows: [row({ magnet: 'magnet:?xt=urn:btih:' + HASH_NEW })],
    });

    const reports = JSON.stringify({ rejected, transfers, send });
    expect(reports).not.toContain(SENTINEL);
    expect(await everythingRendered()).not.toContain(SENTINEL);
    // It did reach the daemon — this is not a scan over an idle client.
    expect(seenHeaders.some((h) => h.authorization === `Bearer ${SENTINEL}`)).toBe(true);
  });

  /**
   * The control. A `not.toContain` over a corpus proves nothing until the same
   * corpus is shown to detect the value when it is genuinely there — a scan
   * over the wrong files, or a sentinel that never got stored, passes silently.
   */
  it('the same scan finds the sentinel when something does leak it', async () => {
    await setScraperSecret('test/qbit-key', SENTINEL);
    // A line built the way a careless diagnostic would build one: the value is
    // not behind an `Authorization:` prefix, so no redaction pattern applies.
    scraperLog('warn', 'qbit', `key was ${SENTINEL}`);
    expect(await everythingRendered()).toContain(SENTINEL);
    // And the validator's own guard, stated as the positive it is: the key is
    // dropped from the document *and* the drop is reported.
    const issues: ScraperSettingsIssue[] = [];
    const document = validateScraperQbittorrentSettings(
      { ...keyConfig(), apiKey: SENTINEL },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
      issues,
      'qbittorrent',
    );
    expect(document).not.toHaveProperty('apiKey');
    expect(document.apiKeyRef).toBe('test/qbit-key');
    expect(issues.map((i) => i.path)).toContain('qbittorrent.apiKey');
  });
});

describe('Phase 9.1 gate 4 — switching modes clears the cached session', () => {
  const keyConfig = (): ScraperQbittorrentSettings => ({
    ...config,
    authMode: 'apiKey',
    username: '',
    passwordRef: '',
    apiKeyRef: 'test/qbit-key',
  });

  afterEach(async () => {
    await clearScraperSecret('test/qbit-key');
  });

  /**
   * The direction that was broken. Key mode never reads the session map, so it
   * never used to clear it either: a password → key → password round trip rode
   * the SID the *first* password minted. The credential is changed underneath
   * to make that visible — a stale cookie still works on the daemon, so
   * counting logins alone would not separate "re-authenticated" from "reused".
   */
  it('does not ride a password session after a round trip through key mode', async () => {
    expect((await qbitTransfers({ config })).length).toBe(2);
    expect(loginBodies).toHaveLength(1);

    await setScraperSecret('test/qbit-key', GOOD_KEY);
    expect((await qbitTransfers({ config: keyConfig() })).length).toBe(2);
    expect(loginBodies).toHaveLength(1); // key mode does not log in

    // The user changed the password in qBittorrent; the app's stored one is now
    // wrong. A client holding the old SID would still list transfers.
    await setScraperSecret('test/qbit', 'the-password-was-changed');
    const after = await qbitTransfers({ config });
    expect(after).toEqual([]);
    expect(loginBodies).toHaveLength(2);
    expect(loginBodies[1]).toBe('username=admin&password=the-password-was-changed');
  });

  /**
   * The control: without a mode switch in between, the cached SID is reused and
   * no second login happens. If this failed the test above would pass for the
   * wrong reason — every call re-authenticating rather than the switch evicting.
   */
  it('reuses the session when the mode never changes', async () => {
    expect((await qbitTransfers({ config })).length).toBe(2);
    expect((await qbitTransfers({ config })).length).toBe(2);
    expect((await qbitTransfers({ config })).length).toBe(2);
    expect(loginBodies).toHaveLength(1);
  });

  /** The other direction, which `sessionCookie` already covered. */
  it('does not let a key session authorize a password-mode call', async () => {
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    expect((await qbitTransfers({ config: keyConfig() })).length).toBe(2);
    // No cookie was ever minted in key mode, so password mode must log in.
    await setScraperSecret('test/qbit', 'the-password-was-changed');
    expect(await qbitTransfers({ config })).toEqual([]);
    expect(loginBodies).toHaveLength(1);
    expect(loginBodies[0]).toBe('username=admin&password=the-password-was-changed');
  });
});

// ---- Phase 9.2 gate 9: six operations, both modes ------------------------

/**
 * Gate 9's durable half.
 *
 * The gate names six operations and asks that each succeed in **both** auth
 * modes, because reaching `app/version` proves nothing about the endpoints an
 * acquisition actually uses. Five of them are not on `window.api` at all — they
 * are internal to `subtitleNyaaSource` — so the live measurement had to drive a
 * whole acquisition against a stand-in daemon. This is the part of it a suite
 * can keep: every one of the six is called directly, in each mode, and the wire
 * is checked for the credential that mode is supposed to send.
 *
 * What it would catch: an operation that stops going through `authed()`. That
 * is not hypothetical — `authed()` is the only place the mode is read, and an
 * endpoint added with a bare `scraperRequest` would work perfectly against a
 * daemon with `LocalHostAuth=true` off, which is the configuration the first
 * qBittorrent auth table in this repo was wrongly measured under.
 */
describe('gate 9 — every acquisition operation authenticates, in both modes', () => {
  const HASH = 'aa11';
  const keyConfig = (): ScraperQbittorrentSettings => ({
    ...config,
    authMode: 'apiKey',
    username: '',
    passwordRef: '',
    apiKeyRef: 'test/qbit-key',
  });

  /** The six, in the order the gate lists them. `qbitAwaitFiles` runs last. */
  async function runSix(used: ScraperQbittorrentSettings) {
    const input = { config: used };
    fileListResponse = [
      { index: 0, name: 'Episode 01.srt', size: 240, progress: 1, priority: 1 },
      { index: 1, name: 'Episode 02.srt', size: 240, progress: 1, priority: 1 },
    ];
    return {
      transfers: (await qbitTransfers(input)).length,
      info: await qbitTorrentInfo(input, HASH),
      files: await qbitFiles(input, HASH),
      prio: await qbitSetFilePriorities(input, HASH, [0, 1], 1),
      start: await qbitStart(input, HASH),
      await: await qbitAwaitFiles(input, HASH, [0, 1], { timeoutMs: 500, pollMs: 10 }),
    };
  }

  it('succeeds in password mode, and every request carries the session cookie', async () => {
    const out = await runSix(config);

    expect(out.transfers).toBe(2);
    expect(out.info.ok && out.info.value?.name).toBe('[SubsPlease] Frieren - 01');
    expect(out.files.ok && out.files.value.length).toBe(2);
    expect(out.prio).toEqual({ ok: true, value: 2 });
    expect(out.start).toEqual({ ok: true, value: true });
    expect(out.await.ok && out.await.value.length).toBe(2);

    // One login, then the cookie on everything after it — and no key header
    // anywhere, which is what makes this password mode rather than a call that
    // happened to be authorized some other way.
    expect(loginBodies).toHaveLength(1);
    const afterLogin = seenWire.filter((r) => r.target !== '/api/v2/auth/login');
    expect(afterLogin.length).toBeGreaterThanOrEqual(6);
    expect(afterLogin.every((r) => (r.headers.cookie ?? '').includes('SID=session-token'))).toBe(true);
    expect(afterLogin.some((r) => r.headers.authorization)).toBe(false);
    // The write half reached the daemon as a form, not as a 404 the caller
    // reported as success.
    expect(commandBodies.map((c) => c.route)).toEqual([
      '/api/v2/torrents/filePrio',
      '/api/v2/torrents/resume',
    ]);
    expect(commandBodies[0].body).toBe('hash=aa11&id=0%7C1&priority=1');
  });

  it('succeeds in key mode, and every request carries the bearer key', async () => {
    await setScraperSecret('test/qbit-key', GOOD_KEY);
    const out = await runSix(keyConfig());

    expect(out.transfers).toBe(2);
    expect(out.info.ok && out.info.value?.name).toBe('[SubsPlease] Frieren - 01');
    expect(out.files.ok && out.files.value.length).toBe(2);
    expect(out.prio).toEqual({ ok: true, value: 2 });
    expect(out.start).toEqual({ ok: true, value: true });
    expect(out.await.ok && out.await.value.length).toBe(2);

    // Key mode never logs in, so a cookie appearing here would mean an
    // operation had fallen back to the password path behind the mode switch.
    expect(loginBodies).toHaveLength(0);
    expect(seenWire.length).toBeGreaterThanOrEqual(6);
    expect(seenWire.every((r) => r.headers.authorization === `Bearer ${GOOD_KEY}`)).toBe(true);
    expect(seenWire.some((r) => r.headers.cookie)).toBe(false);
  });

  /**
   * The negative control, and it is the point of the whole block: the same six
   * calls against a daemon that will not authorize them must fail — all six,
   * distinctly, and none of them reporting a value it never received.
   */
  it('fails all six when the credential is wrong', async () => {
    await setScraperSecret('test/qbit-key', 'not-the-key');
    const out = await runSix(keyConfig());

    // The refusal names the credential rather than the endpoint's status, which
    // is the honest half of gate 8 holding across every operation and not only
    // across `qbitTest`.
    const rejected = { ok: false, reason: 'qBittorrent rejected the API key.' };
    expect(out.transfers).toBe(0);
    expect(out.info).toEqual(rejected);
    expect(out.files).toEqual(rejected);
    expect(out.prio).toEqual(rejected);
    expect(out.start).toEqual(rejected);
    expect(out.await).toEqual(rejected);
    // Nothing was written: a refused call must not leave the stand-in holding a
    // priority change the user never authorized.
    expect(commandBodies).toEqual([]);
  });
});
