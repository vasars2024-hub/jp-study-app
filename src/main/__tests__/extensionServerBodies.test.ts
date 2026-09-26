// @vitest-environment node
/**
 * Request bodies the extension server refuses still get an HTTP answer.
 *
 * A body over the 8 MB cap used to be answered by destroying the socket: the
 * extension saw a network error — exactly what "Gum is not running" looks like
 * — so it queued the request for a retry that could never succeed and told the
 * user the app was closed. (Measured on the packaged build: ECONNRESET.)
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extbody-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const PORT = 20000 + ((process.pid + 13) % 20000);

type Mod = typeof import('../extensionServer');
let mod: Mod;

function post(route: string, payload: string | Buffer): Promise<{ status: number; json: Record<string, unknown> } | { error: string }> {
  const token = mod.getExtensionBridgeStatus().token;
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      method: 'POST',
      path: route,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('error', (err: NodeJS.ErrnoException) => resolve({ error: err.code || err.message }));
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

describe('oversize and malformed bodies', () => {
  it('answers a body over the cap with 413 instead of dropping the connection', async () => {
    const res = await post('/v1/clipboard', JSON.stringify({ text: 'x'.repeat(9 * 1024 * 1024) }));
    expect(res).toMatchObject({ status: 413, json: { ok: false } });
  });

  it('keeps answering after an oversize body', async () => {
    const res = await post('/v1/clipboard', '{not json');
    expect(res).toMatchObject({ status: 400, json: { ok: false } });
  });

  it('answers malformed JSON on every POST route with 400', async () => {
    for (const route of ['/v1/capture', '/v1/manga-import', '/v1/download', '/v1/transcribe']) {
      const res = await post(route, '{not json');
      expect(res, route).toMatchObject({ status: 400, json: { ok: false } });
    }
  });
});
