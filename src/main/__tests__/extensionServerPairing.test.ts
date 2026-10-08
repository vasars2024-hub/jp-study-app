// @vitest-environment node
/**
 * The extension server over real HTTP: who gets the pairing token, who gets a
 * CORS echo, and what a mine hands the renderer.
 *
 * - Any installed extension could pull the token while `pairedOrigin` was
 *   null — on every upgrade from a state file without it, and after "New
 *   token". Pinning now needs the user to open a pairing window in the app
 *   ("Pair now", two minutes, one pin). A valid token still pairs, so the real
 *   extension keeps working, and once pinned its token-less Pull works.
 * - CORS was echoed for every chrome-extension:// origin.
 * - A mine queued while Anki was down was later rebuilt from the local card,
 *   losing its audio, deck routing and tags; the renderer now receives the
 *   exact request main sent.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extpair-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const h = vi.hoisted(() => ({
  sent: [] as Array<{ channel: string; payload: unknown }>,
  mineRequests: [] as unknown[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, isAlwaysOnTop: () => false, webContents: { send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }) } }],
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock('../anki', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../anki')>()),
  mineNote: async (request: unknown) => {
    h.mineRequests.push(request);
    return { ok: false, error: 'AnkiConnect is not reachable' };
  },
}));

const PORT = 20000 + (process.pid % 20000);
const GUM = `chrome-extension://${'a'.repeat(32)}`;
const OTHER = `chrome-extension://${'b'.repeat(32)}`;

type Mod = typeof import('../extensionServer');
let mod: Mod;

function request(
  method: string,
  route: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      method,
      path: route,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: Record<string, unknown> = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
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
  // A fresh pairing, as after "New token" or an upgrade.
  mod.regenerateExtensionToken();
  h.sent.length = 0;
  h.mineRequests.length = 0;
});

describe('pairing the extension', () => {
  it('no extension gets the token while nothing is paired and no pairing window is open', async () => {
    const res = await request('GET', '/v1/extension-settings', { Origin: OTHER });
    expect(res.status).toBe(401);
    expect(res.json.token).toBeUndefined();
  });

  it('"Pair now" lets the first extension that pulls pin itself, once', async () => {
    mod.openExtensionPairingWindow();
    const first = await request('GET', '/v1/extension-settings', { Origin: GUM });
    expect(first.status).toBe(200);
    expect(first.json.token).toBe(mod.getExtensionBridgeStatus().token);
    // The window closed with that pin: a second extension is refused.
    expect((await request('GET', '/v1/extension-settings', { Origin: OTHER })).status).toBe(401);
    // The paired extension's token-less Pull keeps working.
    expect((await request('GET', '/v1/extension-settings', { Origin: GUM })).status).toBe(200);
  });

  it("pairs the extension's real Pull, which Chrome sends without an Origin, once per \"Pair now\"", async () => {
    // Measured on Chrome 153: an extension page's fetch to a permitted host
    // carries Sec-Fetch-Site: none / Sec-Fetch-Mode: cors and no Origin header.
    const chromePull = { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'cors' };
    expect((await request('GET', '/v1/extension-settings', chromePull)).status).toBe(401);
    mod.openExtensionPairingWindow();
    const first = await request('GET', '/v1/extension-settings', chromePull);
    expect(first.status).toBe(200);
    expect(first.json.token).toBe(mod.getExtensionBridgeStatus().token);
    // The window closed with that pull.
    expect((await request('GET', '/v1/extension-settings', chromePull)).status).toBe(401);
    // With the pasted token the same Pull works any time.
    const token = mod.getExtensionBridgeStatus().token;
    expect((await request('GET', '/v1/extension-settings', { ...chromePull, Authorization: `Bearer ${token}` })).status).toBe(200);
  });

  it('the pairing window expires after two minutes', async () => {
    mod.openExtensionPairingWindow(Date.now() - 121_000);
    expect((await request('GET', '/v1/extension-settings', { Origin: GUM })).status).toBe(401);
  });

  it('a pasted token still pairs the real extension, and its Pull works afterwards without one', async () => {
    const token = mod.getExtensionBridgeStatus().token;
    const withToken = await request('GET', '/v1/extension-settings', { Origin: GUM, Authorization: `Bearer ${token}` });
    expect(withToken.status).toBe(200);
    expect((await request('GET', '/v1/extension-settings', { Origin: GUM })).status).toBe(200);
  });
});

describe('CORS', () => {
  it('is echoed only for the paired extension', async () => {
    const before = await request('OPTIONS', '/v1/mine', { Origin: GUM });
    expect(before.headers['access-control-allow-origin']).toBeUndefined();
    const token = mod.getExtensionBridgeStatus().token;
    await request('GET', '/v1/extension-settings', { Origin: GUM, Authorization: `Bearer ${token}` });
    const paired = await request('OPTIONS', '/v1/mine', { Origin: GUM });
    expect(paired.headers['access-control-allow-origin']).toBe(GUM);
    const other = await request('OPTIONS', '/v1/mine', { Origin: OTHER });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('a mine while Anki is down', () => {
  it('hands the renderer the exact request main sent — audio and tags included', async () => {
    const token = mod.getExtensionBridgeStatus().token;
    const res = await request('POST', '/v1/mine', { Authorization: `Bearer ${token}` }, {
      text: '猫',
      mode: 'word',
      sentence: '猫が好きです。',
      audioBase64: 'QUJD',
      audioFilename: 'clip.webm',
      folder: 'audio',
    });
    expect(res.status).toBe(200);
    const mined = h.sent.find((entry) => entry.channel === 'extension:mined')?.payload as { ankiRequest?: Record<string, unknown> } | undefined;
    expect(mined?.ankiRequest).toEqual(h.mineRequests[0]);
    expect(mined?.ankiRequest).toMatchObject({
      term: '猫',
      audioBase64: 'QUJD',
      audioFilename: 'clip.webm',
      extraTags: expect.arrayContaining(['jp-study-app::extension', 'jp-study-app::extension-audio']),
    });
  });
});
