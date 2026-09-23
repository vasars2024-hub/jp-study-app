// @vitest-environment node
/**
 * The qBittorrent half of the media ingest: what a send now tells the daemon
 * (destination honoured, `gum` tags, a rename that is filled or not sent), the
 * handoff it announces for the ledger, `content_path` surviving `mapTransfer`,
 * and the completion poller's two quiet reads.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (buffer: Buffer) => buffer.toString(),
  },
}));

const { buildAddForm, mapTransfer, qbitDefaultSavePath, qbitPollTorrents, qbitSend, resetQbitSessions } =
  await import('../scraper/qbittorrent');
const { onAcquisitionHandoff } = await import('../scraper/handoffs');
const { setScraperStoreRoot } = await import('../scraper/store');
const { flushScraperLogWrites } = await import('../scraper/logBus');
type Handoff = Parameters<Parameters<typeof onAcquisitionHandoff>[0]>[0];

const KEY = 'RmDdRLXCTFEBpS2v3Yk6wJn9';
const HASH_A = '0123456789abcdef0123456789abcdef01234567';
const HASH_B = '89abcdef0123456789abcdef0123456789abcdef';

let server: http.Server;
let config: ScraperQbittorrentSettings;
let addBodies: URLSearchParams[] = [];
let torrentsInfo: unknown[] = [];

function row(patch: Partial<TorrentRow> = {}): TorrentRow {
  return {
    id: 'r1',
    infoHash: HASH_A,
    name: '[SubsPlease] Sousou no Frieren - 05 (1080p)',
    releaseGroup: 'SubsPlease',
    resolution: '1080p',
    seeders: 10,
    leechers: 1,
    availability: 1,
    tracker: 'nyaa',
    sizeBytes: 1,
    ageDays: 0,
    fileCount: 1,
    subtitleLanguages: [],
    isBatch: false,
    magnet: `magnet:?xt=urn:btih:${HASH_A}`,
    ...patch,
  };
}

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'qbit-ingest-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
  server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/v2/torrents/add') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        addBodies.push(new URLSearchParams(body));
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Ok.');
      });
      return;
    }
    if (url.pathname === '/api/v2/torrents/info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(torrentsInfo));
      return;
    }
    if (url.pathname === '/api/v2/app/preferences') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ save_path: 'D:\\Downloads\\', temp_path_enabled: false }));
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  config = {
    ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    enabled: true,
    host: '127.0.0.1',
    port: (server.address() as AddressInfo).port,
    authMode: 'apiKey',
    apiKeyRef: 'test/key',
  };
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  setScraperStoreRoot(null);
  await flushScraperLogWrites();
  await fsp.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

beforeEach(() => {
  addBodies = [];
  torrentsInfo = [];
  resetQbitSessions();
});

describe('buildAddForm', () => {
  it('honours a destination by turning Automatic Torrent Management off', () => {
    const form = buildAddForm({ ...config, autoTmm: true }, ['magnet:?x'], { savePath: 'E:\\Anime' });
    expect(form.get('savepath')).toBe('E:\\Anime');
    expect(form.get('autoTMM')).toBe('false');
    // No destination anywhere: the profile's own choice stands.
    expect(buildAddForm({ ...config, autoTmm: true }, ['magnet:?x']).get('autoTMM')).toBe('true');
  });

  it('adds the gum tags to the profile’s without duplicates or commas', () => {
    const form = buildAddForm({ ...config, tags: ['seasonal', 'gum'] }, ['magnet:?x'], {
      extraTags: ['gum', 'gum:mal:52991', 'bad,tag'],
    });
    expect(form.get('tags')).toBe('seasonal,gum,gum:mal:52991');
  });

  it('never sends a template with unfilled placeholders, and a literal name only for one torrent', () => {
    const templated = { ...config, renameTemplate: '{series} - {episode}' };
    expect(buildAddForm(templated, ['magnet:?x']).get('rename')).toBeNull();
    const literal = { ...config, renameTemplate: 'My name' };
    expect(buildAddForm(literal, ['magnet:?x']).get('rename')).toBe('My name');
    expect(buildAddForm(literal, ['magnet:?x', 'magnet:?y']).get('rename')).toBeNull();
    expect(buildAddForm(templated, ['magnet:?x'], { rename: 'Frieren - 05' }).get('rename')).toBe('Frieren - 05');
  });
});

describe('mapTransfer', () => {
  it('keeps qBittorrent’s content_path', () => {
    expect(mapTransfer({ hash: HASH_A, content_path: 'D:\\Downloads\\Show S01' }).contentPath)
      .toBe('D:\\Downloads\\Show S01');
    expect(mapTransfer({ hash: HASH_A }).contentPath).toBe('');
  });
});

describe('qbitSend with an ingest handoff', () => {
  it('tags, honours the destination, fills the rename per torrent and announces the handoff', async () => {
    const handoffs: Handoff[] = [];
    const off = onAcquisitionHandoff((handoff) => { handoffs.push(handoff); });
    try {
      const report = await qbitSend({
        config: { ...config, renameTemplate: '{series} - {episode}' },
        apiKey: KEY,
        rows: [
          row(),
          row({ id: 'r2', infoHash: '', name: '[SubsPlease] Sousou no Frieren - 06 (1080p)', magnet: `magnet:?xt=urn:btih:${HASH_B}` }),
        ],
        ingest: {
          via: 'mal-dialog',
          savePath: 'E:\\Anime',
          hint: { malId: 52_991, title: 'Frieren' },
          rowEpisodes: { r1: [5], r2: [6] },
        },
      });
      expect(report.sent).toBe(2);
      // Two names, so two requests — `rename` applies to every magnet in one.
      expect(addBodies.map((body) => body.get('rename'))).toEqual(['Frieren - 05', 'Frieren - 06']);
      for (const body of addBodies) {
        expect(body.get('savepath')).toBe('E:\\Anime');
        expect(body.get('autoTMM')).toBe('false');
        expect(body.get('tags')).toBe('gum,gum:mal:52991');
      }
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0].target).toBe('qbittorrent');
      // The second row's hash came from its magnet.
      expect(handoffs[0].rows.map((r) => r.infoHash)).toEqual([HASH_A, HASH_B]);
      expect(handoffs[0].ingest?.rowEpisodes).toEqual({ r1: [5], r2: [6] });
    } finally {
      off();
    }
  });

  it('leaves an old-style send exactly as it was: one request, no tags, no handoff', async () => {
    const handoffs: Handoff[] = [];
    const off = onAcquisitionHandoff((handoff) => { handoffs.push(handoff); });
    try {
      await qbitSend({ config, apiKey: KEY, rows: [row(), row({ id: 'r2', magnet: `magnet:?xt=urn:btih:${HASH_B}` })] });
      expect(addBodies).toHaveLength(1);
      expect(addBodies[0].get('tags')).toBeNull();
      expect(handoffs).toEqual([]);
    } finally {
      off();
    }
  });
});

describe('completion polling', () => {
  it('lists torrents with their content path and raw state', async () => {
    torrentsInfo = [{
      hash: HASH_A.toUpperCase(),
      name: 'Show',
      state: 'stalledUP',
      progress: 1,
      save_path: 'D:\\Downloads',
      content_path: 'D:\\Downloads\\Show',
      category: 'anime',
      tags: 'gum, gum:al:154587',
    }];
    const polled = await qbitPollTorrents({ config, apiKey: KEY });
    expect(polled).toEqual({
      ok: true,
      value: [{
        hash: HASH_A,
        name: 'Show',
        rawState: 'stalledUP',
        progress: 1,
        savePath: 'D:\\Downloads',
        contentPath: 'D:\\Downloads\\Show',
        category: 'anime',
        tags: ['gum', 'gum:al:154587'],
      }],
    });
  });

  it('reports a refused credential as unauthorized, so the poller stops', async () => {
    const polled = await qbitPollTorrents({ config, apiKey: 'wrong-key' });
    expect(polled).toMatchObject({ ok: false, status: 'unauthorized' });
  });

  it('reports a closed port as unreachable, so the poller backs off', async () => {
    const polled = await qbitPollTorrents({ config: { ...config, port: 1 }, apiKey: KEY });
    expect(polled).toMatchObject({ ok: false, status: 'unreachable' });
  });

  it('reads the default save path', async () => {
    expect(await qbitDefaultSavePath({ config, apiKey: KEY })).toEqual({ ok: true, value: 'D:\\Downloads\\' });
  });
});
