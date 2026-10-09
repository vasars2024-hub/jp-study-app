// @vitest-environment node
/**
 * The extension server while Gum is locked (main/lockGuard.ts), over real HTTP:
 * content routes answer 423 `{ code: 'locked', error: 'Gum is locked' }` — the
 * extension shows that `error` as its message — before any route runs (the
 * recordings stream included); liveness, pairing and the URL classifier stay
 * open; /v1/health says `locked`. Unlocked, the same routes answer normally.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLockGuard, installLockGuard, type LockBlockNotice } from '../lockGuard';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extlock-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const h = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        isAlwaysOnTop: () => false,
        webContents: { send: (channel: string) => void h.sent.push(channel) },
      },
    ],
    getFocusedWindow: () => null,
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openPath: async () => '' },
}));

const PORT = 20000 + ((process.pid + 977) % 20000);

type Mod = typeof import('../extensionServer');
let mod: Mod;
let locked = true;
const notices: LockBlockNotice[] = [];

function call(method: string, route: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = mod.getExtensionBridgeStatus().token;
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: route,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

beforeAll(async () => {
  process.env.JP_EXTENSION_PORT = String(PORT);
  installLockGuard(
    createLockGuard({
      isLocked: () => locked,
      roleOf: () => 'content',
      windows: () => [],
      notifyBlocked: (n) => notices.push(n),
      devToolsAllowed: true,
    }),
  );
  mod = await import('../extensionServer');
  mod.registerExtensionBridgeIpc();
  mod.startExtensionServer();
  for (let i = 0; i < 50 && !mod.getExtensionBridgeStatus().running; i++) await new Promise((r) => setTimeout(r, 20));
});

afterAll(() => {
  mod.stopExtensionServer();
  installLockGuard(null);
  delete process.env.JP_EXTENSION_PORT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  locked = true;
  h.sent.length = 0;
});

describe('extension server while locked', () => {
  it('health stays up and says locked', async () => {
    const r = await call('GET', '/v1/health');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, locked: true });
  });

  it('the URL classifier stays open (it reads nothing of the user)', async () => {
    const r = await call('GET', '/v1/page-kind?url=https%3A%2F%2Fexample.com%2F');
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
  });

  it.each([
    ['POST', '/v1/lookup', { text: '猫' }],
    ['POST', '/v1/mine', { word: '猫', sentence: '猫がいる。' }],
    ['GET', '/v1/known-snapshot', undefined],
    ['POST', '/v1/annotate', { texts: ['猫'] }],
    ['GET', '/v1/recordings', undefined],
    ['POST', '/v1/recordings/start', {}],
  ])('%s %s answers 423 locked and reaches no window', async (method, route, body) => {
    const r = await call(method, route, body);
    expect(r.status).toBe(423);
    expect(r.json).toEqual({ ok: false, code: 'locked', error: 'Gum is locked' });
    expect(h.sent).toEqual([]);
  });

  it('a refusal is surfaced on the lock screen (throttled by the guard)', () => {
    expect(notices.some((n) => n.kind === 'extension' && n.action.startsWith('extension:/v1/'))).toBe(true);
  });

  it('unlocked, the same route is served again', async () => {
    locked = false;
    const r = await call('GET', '/v1/health');
    expect(r.json).toMatchObject({ locked: false });
    const lookup = await call('POST', '/v1/lookup', { text: '' });
    expect(lookup.status).not.toBe(423);
  });
});
