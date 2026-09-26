// @vitest-environment node
/**
 * Resilience audit #10, #15 and #20 for the asset download manager, driven for
 * real against a local HTTP server (the same seam as downloads.test.ts).
 *
 * #10 — an asset deleted while the app runs stayed "installed" (and
 *       `startDownload` short-circuited on the stale flag) until a restart.
 * #15 — a disk that was full when the models folder was first created left
 *       every asset "unknown" to `startDownload`, even after space was freed.
 * #20 — a full disk AFTER the payload was promoted but before state.json was
 *       written reported a false "paused/resumable" and the next start
 *       downloaded the whole asset again.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AssetSpec } from '../../shared/assetRegistry';

let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { initDownloads, startDownload, isInstalled, assetPath, getAssetStatus } = await import('../downloads');

const PAYLOAD = Buffer.from('MODEL-BYTES-'.repeat(5000));
const PAYLOAD_SHA = crypto.createHash('sha256').update(PAYLOAD).digest('hex');

let server: http.Server;
let baseUrl = '';
let requests = 0;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'Content-Length': String(PAYLOAD.length) });
    res.end(PAYLOAD);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jp-dl-resil-'));
  requests = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
});

function spec(): AssetSpec {
  return {
    id: 'resil-model',
    name: 'Resilience model',
    description: 'A model',
    kind: 'whisper',
    lang: 'any',
    url: `${baseUrl}/model.bin`,
    sizeBytes: PAYLOAD.length,
    sha256: PAYLOAD_SHA,
    version: '1',
    installDir: 'resil-model',
    file: 'model.bin',
  };
}

async function settle(id: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const state = getAssetStatus(id)?.state;
    if (state === 'installed' || state === 'failed' || state === 'not-installed' || state === 'paused') return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out in state ${getAssetStatus(id)?.state}`);
}

describe('#10 an installed asset whose files vanish while the app runs', () => {
  it('is demoted on use, and a download repairs it', async () => {
    await initDownloads({ catalog: [spec()] });
    await startDownload('resil-model');
    await settle('resil-model');
    expect(isInstalled('resil-model')).toBe(true);

    await fsp.rm(path.join(userDataDir, 'models', 'resil-model'), { recursive: true, force: true });

    expect(assetPath('resil-model')).toBeNull();
    expect(getAssetStatus('resil-model')).toMatchObject({
      state: 'not-installed',
      error: { key: 'assetError.missingFiles' },
    });

    const before = requests;
    await startDownload('resil-model');
    await settle('resil-model');
    expect(requests).toBe(before + 1);
    expect(isInstalled('resil-model')).toBe(true);
  });
});

describe('#15 a models folder that cannot be created at startup', () => {
  it('still lists the asset, says why, and installs once space is back', async () => {
    // A FILE where the models folder should be: mkdir fails exactly as a
    // full disk makes it fail, without needing one.
    const blocker = path.join(userDataDir, 'models');
    await fsp.writeFile(blocker, 'not a directory');

    await initDownloads({ catalog: [spec()] });
    expect(getAssetStatus('resil-model')).toMatchObject({
      state: 'not-installed',
      error: { key: 'assetError.storageUnavailable' },
    });
    const refused = await startDownload('resil-model');
    expect(refused).toEqual({ ok: false, error: { key: 'assetError.storageUnavailable' } });

    await fsp.rm(blocker);
    const started = await startDownload('resil-model');
    expect(started.ok).toBe(true);
    await settle('resil-model');
    expect(isInstalled('resil-model')).toBe(true);
  });
});

describe('#20 a full disk between promoting the payload and saving its record', () => {
  it('reports installed, and the next start records it without downloading again', async () => {
    await initDownloads({ catalog: [spec()] });
    const realOpen = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, ...rest: unknown[]) => {
      if (String(file).includes('state.json')) {
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }
      return (realOpen as (...args: unknown[]) => number)(file, ...rest);
    }) as typeof fs.openSync);

    await startDownload('resil-model');
    await settle('resil-model');
    expect(getAssetStatus('resil-model')?.state).toBe('installed');
    expect(fs.existsSync(path.join(userDataDir, 'models', 'state.json'))).toBe(false);

    vi.restoreAllMocks();
    const downloadsBefore = requests;
    await initDownloads({ catalog: [spec()] });
    expect(isInstalled('resil-model')).toBe(true);
    expect(requests).toBe(downloadsBefore);
    const state = JSON.parse(fs.readFileSync(path.join(userDataDir, 'models', 'state.json'), 'utf-8')) as Record<string, { sha256?: string }>;
    expect(state['resil-model']?.sha256?.toLowerCase()).toBe(PAYLOAD_SHA);
    expect(fs.existsSync(path.join(userDataDir, 'models', '.partial', 'resil-model.install.json'))).toBe(false);
  });
});
