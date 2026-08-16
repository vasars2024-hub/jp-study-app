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

const { addFailureReason, buildAddForm, mapQbitState, mapTransfer, qbitBaseUrl, qbitSend, qbitTest, qbitTransfers, resetQbitSessions } =
  await import('../scraper/qbittorrent');
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
    if (url.pathname === '/api/v2/torrents/info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(TORRENT_INFO));
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
