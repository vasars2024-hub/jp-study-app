// @vitest-environment node
/**
 * qBittorrent's remaining English-only messages now carry codes the renderer
 * translates: transport failures, the login back-off, and API-key format
 * problems — and `.torrent` files go to a (fake) daemon as a multipart add.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  qbitAddTorrentFiles,
  qbitTest,
  qbitTransportProblem,
  resetQbitSessions,
} from '../scraper/qbittorrent';
import { DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, type ScraperQbittorrentSettings } from '../../shared/scraperSourceSettings';
import { startFakeQbit, type FakeQbit } from './e2eFixtures/fakeQbit';
import { makeTorrent } from './e2eFixtures/torrentFixture';

const AT = { host: 'qbit.example', port: 8080 };
const sysError = (code: string, message: string): Error => Object.assign(new Error(message), { code });
const PASSWORD = crypto.randomBytes(8).toString('hex');
let dir = '';
let qbit: FakeQbit;

function config(port: number, extra: Partial<ScraperQbittorrentSettings> = {}): ScraperQbittorrentSettings {
  return { ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, enabled: true, scheme: 'http', host: '127.0.0.1', port, username: 'admin', category: 'gum', ...extra };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-qbit-codes-'));
  const media = path.join(dir, 'media.mkv');
  fs.writeFileSync(media, 'x');
  qbit = await startFakeQbit({ password: PASSWORD, mediaPath: media, defaultSavePath: path.join(dir, 'dl'), version: '5' });
});

afterAll(async () => {
  await qbit?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('coded transport problems', () => {
  it('each transport failure has a code and the variables its sentence needs', () => {
    expect(qbitTransportProblem(AT, sysError('ECONNREFUSED', 'connect ECONNREFUSED'))).toMatchObject({ messageCode: 'unreachable', messageVars: { address: 'qbit.example:8080' } });
    expect(qbitTransportProblem(AT, sysError('ENOTFOUND', 'getaddrinfo ENOTFOUND'))).toMatchObject({ messageCode: 'hostUnresolved', messageVars: { host: 'qbit.example' } });
    expect(qbitTransportProblem(AT, sysError('ETIMEDOUT', 'connect ETIMEDOUT'))).toMatchObject({ messageCode: 'timeout' });
    const odd = qbitTransportProblem(AT, new Error('socket hang up in a new way'));
    expect(odd).toMatchObject({ messageCode: 'transport', messageVars: { detail: 'socket hang up in a new way' } });
    // Main's own sentence stays for logs and older renderers.
    expect(odd.message).toContain('qbit.example:8080');
  });

  it('a refused connection in Test reports the code, not only English', async () => {
    const closed = await new Promise<number>((resolve) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });
    const report = await qbitTest({ config: config(closed), password: PASSWORD });
    expect(report).toMatchObject({ status: 'unreachable', messageCode: 'unreachable' });
  });

  it('API-key format problems are coded before any request', async () => {
    resetQbitSessions();
    const key = config(qbit.port, { authMode: 'apiKey' } as Partial<ScraperQbittorrentSettings>);
    expect(await qbitTest({ config: key, apiKey: ' padded ' })).toMatchObject({ status: 'unauthorized', messageCode: 'apiKeyWhitespace' });
    expect(await qbitTest({ config: key, apiKey: 'has\tTab' })).toMatchObject({ messageCode: 'apiKeyControlChar' });
  });

  it('the login back-off after a refused password holds the next attempt and names its seconds', async () => {
    resetQbitSessions();
    const cfg = config(qbit.port);
    // A refused login arms the back-off; the next background call is answered locally.
    await qbitAddTorrentFiles({ config: cfg, password: 'wrong', files: [{ fileName: 'a.torrent', data: makeTorrent('A').bytes }] });
    const held = await qbitAddTorrentFiles({ config: cfg, password: 'wrong', files: [{ fileName: 'a.torrent', data: makeTorrent('A').bytes }] });
    expect(held.details[0]).toMatchObject({ outcome: 'failed' });
    expect(held.details[0].reason).toMatch(/Not retrying for \d+ s/);
    resetQbitSessions();
  });
});

describe('.torrent files to qBittorrent', () => {
  it('parses, refuses non-torrents by reason, and sends the rest as one multipart add', async () => {
    resetQbitSessions();
    const a = makeTorrent('[Gum] Show - 01 (1080p).mkv');
    const b = makeTorrent('[Gum] Show - 02 (1080p).mkv');
    const report = await qbitAddTorrentFiles({
      config: config(qbit.port),
      password: PASSWORD,
      files: [
        { fileName: 'one.torrent', data: a.bytes },
        { fileName: 'two.torrent', data: b.bytes },
        { fileName: 'again.torrent', data: a.bytes },
        { fileName: 'notes.torrent', data: Buffer.from('not a torrent') },
      ],
    });
    expect(report).toMatchObject({ sent: 2, skipped: 2, failed: 0 });
    expect(report.infoHashes.sort()).toEqual([a.infoHash, b.infoHash].sort());
    expect(report.details.find((d) => d.name === 'notes.torrent')).toMatchObject({ outcome: 'skipped', reasonCode: 'torrentFile.not-bencode' });
    expect(report.details.some((d) => d.reasonCode === 'torrentFile.duplicate')).toBe(true);
    expect(qbit.torrents.get(a.infoHash)).toMatchObject({ category: 'gum', name: `${a.name}` });
    expect(qbit.calls.filter((c) => c === 'POST /api/v2/torrents/add')).toHaveLength(1);
  });
});
