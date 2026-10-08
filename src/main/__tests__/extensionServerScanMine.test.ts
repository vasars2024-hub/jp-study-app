// @vitest-environment node
/**
 * The 2026-10 extension overhaul, over real HTTP:
 * - `/v1/scan` answers a whole hover window in one call (bug 1, WP1);
 * - `/v1/lookup` no longer reports prefix / fuzzy near misses as the word, and
 *   carries the character data the Kanji tab needs (bug 17);
 * - `/v1/mine` turns the popup's context into a full Anki request — reading,
 *   meaning, sentence, cloze surface, native audio, screenshot — and no longer
 *   claims the local copy is saved before a Gum window confirmed it (bugs 5, 6);
 * - `/v1/recordings` is routed, authenticated, and allowed by CORS (WP10).
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extscan-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const h = vi.hoisted(() => ({
  scanCalls: [] as Array<{ text: string; lang: string | undefined }>,
  mineRequests: [] as Array<Record<string, unknown>>,
  sent: [] as Array<{ channel: string; payload: unknown }>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        isAlwaysOnTop: () => false,
        webContents: { send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }) },
      },
    ],
    getFocusedWindow: () => null,
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openPath: async () => '' },
}));
vi.mock('../dictionary', () => ({
  scanOfflinePrefixes: async (text: string, lang?: string) => {
    h.scanCalls.push({ text, lang });
    return text.startsWith('私')
      ? { matched: '私', via: 'exact', entries: [{ word: '私', reading: 'わたし', via: 'exact', senses: [{ partsOfSpeech: [], definitions: ['I'], tags: [] }] }] }
      : { matched: '', entries: [] };
  },
  lookupTermOffline: async (query: string) => ({
    query,
    entries: [
      { word: '猫舌', reading: 'ねこじた', via: 'prefix', senses: [{ partsOfSpeech: [], definitions: ['sensitive to heat'], tags: [] }] },
      ...(query === '猫'
        ? [{ word: '猫', reading: 'ねこ', via: 'exact', senses: [{ partsOfSpeech: [], definitions: ['cat'], tags: [] }] }]
        : []),
    ],
    character: query === '猫' ? { char: '猫', readings: ['ビョウ', 'ねこ'], meanings: ['cat'], strokes: 11 } : undefined,
  }),
}));
vi.mock('../anki', () => ({
  mineNote: async (req: Record<string, unknown>) => {
    h.mineRequests.push(req);
    return { ok: true, noteId: 1 };
  },
}));

const PORT = 20000 + ((process.pid + 23) % 20000);

type Mod = typeof import('../extensionServer');
let mod: Mod;

function call(
  method: string,
  route: string,
  body?: unknown,
  auth = true,
): Promise<{ status: number; json: Record<string, unknown>; headers: http.IncomingHttpHeaders }> {
  const token = mod.getExtensionBridgeStatus().token;
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: route,
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

beforeAll(async () => {
  process.env.JP_EXTENSION_PORT = String(PORT);
  mod = await import('../extensionServer');
  mod.startExtensionServer();
  for (let i = 0; i < 50 && !mod.getExtensionBridgeStatus().running; i++) await new Promise((r) => setTimeout(r, 20));
});

afterAll(() => {
  mod.stopExtensionServer();
  delete process.env.JP_EXTENSION_PORT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  h.scanCalls.length = 0;
  h.mineRequests.length = 0;
  h.sent.length = 0;
});

describe('/v1/scan', () => {
  it('refuses without the pairing token', async () => {
    expect((await call('POST', '/v1/scan', { text: '私は' }, false)).status).toBe(401);
  });

  it('answers the whole window in one dictionary call, short words included', async () => {
    const res = await call('POST', '/v1/scan', { text: '私はきのう学校へ行きました', lang: 'ja' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, matched: '私', via: 'exact' });
    expect(h.scanCalls).toEqual([{ text: '私はきのう学校へ行きました', lang: 'ja' }]);
  });

  it('is advertised in the health contract', async () => {
    const res = await call('GET', '/v1/health');
    expect((res.json.features as Record<string, unknown>).scan).toBe(true);
  });
});

describe('/v1/lookup', () => {
  it('drops prefix near misses and carries the character data', async () => {
    const res = await call('POST', '/v1/lookup', { query: '猫', lang: 'ja' });
    const words = (res.json.entries as Array<{ word: string }>).map((e) => e.word);
    expect(words).toEqual(['猫']);
    expect(res.json.character).toMatchObject({ char: '猫', strokes: 11 });
  });
});

describe('/v1/mine', () => {
  it('builds the Anki request from the popup context', async () => {
    const res = await call('POST', '/v1/mine', {
      text: '食べた',
      mode: 'word',
      lemma: '食べる',
      surface: '食べた',
      reading: 'たべる',
      meaning: 'to eat',
      sentence: '昨日、寿司を食べた。',
      entryIndex: 0,
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(res.status).toBe(200);
    expect(h.mineRequests[0]).toMatchObject({
      term: '食べる',
      surface: '食べた',
      reading: 'たべる',
      meaning: 'to eat',
      sentence: '昨日、寿司を食べた。',
      fetchAudio: true,
      imageBase64: 'iVBORw0KGgo=',
    });
  }, 10_000);

  it('says the local copy is pending until a Gum window confirms it', async () => {
    const res = await call('POST', '/v1/mine', { text: '猫', mode: 'word', preferAnki: false });
    const app = (res.json.destinations as { app: { ok: boolean; pending?: boolean } }).app;
    // The mock window never acks, so the copy is persisted for replay, not claimed.
    expect(app.ok).toBe(false);
    expect(app.pending).toBe(true);
    expect(res.json.appPending).toBe(true);
    // Only the one host window was sent the mine.
    expect(h.sent.filter((s) => s.channel === 'extension:mined')).toHaveLength(1);
  }, 10_000);

  it('does not fetch native audio over a recording the user made', async () => {
    await call('POST', '/v1/mine', { text: '猫', mode: 'word', audioBase64: 'QUJD' });
    expect(h.mineRequests[0].fetchAudio).toBeUndefined();
  }, 10_000);
});

describe('/v1/recordings', () => {
  it('is routed and authenticated', async () => {
    expect((await call('POST', '/v1/recordings', { kind: 'tab' }, false)).status).toBe(401);
    const created = await call('POST', '/v1/recordings', { kind: 'tab', mimeType: 'video/webm' });
    expect(created.status).toBe(200);
    expect(created.json).toMatchObject({ ok: true, nextSeq: 0 });
    expect(typeof created.json.id).toBe('string');
    await call('DELETE', `/v1/recordings/${String(created.json.id)}`);
  });

  it('lets the extension PUT chunks through CORS', async () => {
    const res = await call('OPTIONS', '/v1/recordings');
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/PUT/);
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/DELETE/);
  });
});
