// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import type { AssetSpec } from '../../shared/assetRegistry';

// The download manager talks to Electron for exactly two things — the userData
// path and the windows it broadcasts progress to — so both are stubbed and the
// rest of the module (streaming, hashing, resume, atomic install) runs for real
// against a local HTTP server.

let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

const {
  initDownloads,
  startDownload,
  removeAsset,
  isInstalled,
  assetPath,
  getAssetStatus,
  registerAssetUnloadHandler,
} = await import('../downloads');

// ----- fixtures ----------------------------------------------------------

const PAYLOAD = Buffer.from('MODEL-BYTES-'.repeat(5000)); // 60 KB
const PAYLOAD_SHA = crypto.createHash('sha256').update(PAYLOAD).digest('hex');

const ZIP = (() => {
  const zip = new AdmZip();
  zip.addFile('model.onnx', Buffer.from('onnx-weights'));
  zip.addFile('nested/tokenizer.json', Buffer.from('{}'));
  return zip.toBuffer();
})();

let server: http.Server;
let baseUrl = '';

/** Set per-test to make the server misbehave in a specific, realistic way. */
let ignoreRange = false;
let requests: { range: string | undefined }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ range: req.headers.range });
    const body = req.url?.startsWith('/archive') ? ZIP : PAYLOAD;
    const range = ignoreRange ? undefined : req.headers.range;

    if (range) {
      const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
      const slice = body.subarray(start);
      res.writeHead(206, {
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}`,
        ETag: '"v1"',
      });
      res.end(slice);
      return;
    }
    res.writeHead(200, { 'Content-Length': String(body.length), ETag: '"v1"' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jp-downloads-'));
  ignoreRange = false;
  requests = [];
});

afterEach(async () => {
  await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
});

function fileSpec(over: Partial<AssetSpec> = {}): AssetSpec {
  return {
    id: 'test-model',
    name: 'Test model',
    description: 'A model',
    kind: 'whisper',
    lang: 'any',
    url: `${baseUrl}/model.bin`,
    sizeBytes: PAYLOAD.length,
    version: '1',
    installDir: 'test-model',
    file: 'model.bin',
    ...over,
  };
}

function partialPath(id: string): string {
  return path.join(userDataDir, 'models', '.partial', `${id}.part`);
}

async function boot(spec: AssetSpec): Promise<void> {
  await initDownloads({ catalog: [spec] });
}

/** startDownload only enqueues; wait for the state machine to settle. */
async function settle(id: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const state = getAssetStatus(id)?.state;
    if (state === 'installed' || state === 'failed' || state === 'not-installed') return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out in state ${getAssetStatus(id)?.state}`);
}

// ----- tests -------------------------------------------------------------

describe('download → verify → install', () => {
  it('installs a plain file and reports it as installed', async () => {
    await boot(fileSpec({ sha256: PAYLOAD_SHA }));
    await startDownload('test-model');
    await settle('test-model');

    expect(getAssetStatus('test-model')?.state).toBe('installed');
    expect(isInstalled('test-model')).toBe(true);

    const installed = assetPath('test-model');
    expect(installed).toBeTruthy();
    expect(fs.readFileSync(installed as string)).toEqual(PAYLOAD);

    // The partial is cleaned up, not left behind to confuse the next resume.
    expect(fs.existsSync(partialPath('test-model'))).toBe(false);
  });

  it('extracts a zip asset into its install directory', async () => {
    await boot(
      fileSpec({
        id: 'test-zip',
        url: `${baseUrl}/archive.zip`,
        installDir: 'test-zip',
        archive: 'zip',
        file: undefined,
        sizeBytes: ZIP.length,
      }),
    );
    await startDownload('test-zip');
    await settle('test-zip');

    expect(getAssetStatus('test-zip')?.state).toBe('installed');
    const dir = assetPath('test-zip') as string;
    expect(fs.readFileSync(path.join(dir, 'model.onnx'), 'utf8')).toBe('onnx-weights');
    expect(fs.existsSync(path.join(dir, 'nested', 'tokenizer.json'))).toBe(true);
    // The staging directory must not survive a successful install.
    expect(fs.existsSync(`${dir}.staging`)).toBe(false);
  });

  it('rejects a corrupt download and leaves nothing installed', async () => {
    await boot(fileSpec({ sha256: 'a'.repeat(64) }));
    await startDownload('test-model');
    await settle('test-model');

    const status = getAssetStatus('test-model');
    expect(status?.state).toBe('failed');
    // Main hands the renderer a translation key + vars, never an English
    // sentence — it does not know which UI language is active.
    expect(status?.error?.key).toBe('assetError.checksumMismatch');
    expect(isInstalled('test-model')).toBe(false);
    expect(fs.existsSync(path.join(userDataDir, 'models', 'test-model'))).toBe(false);
    // Worthless bytes are dropped so the retry is a clean download, not an
    // append onto garbage.
    expect(fs.existsSync(partialPath('test-model'))).toBe(false);
  });

  it('rejects a truncated download when no hash is pinned', async () => {
    // Server sends 60 KB; the catalog claims 10 MB. Size check must catch it.
    await boot(fileSpec({ sizeBytes: 10_000_000 }));
    await startDownload('test-model');
    await settle('test-model');

    expect(getAssetStatus('test-model')?.state).toBe('failed');
    expect(getAssetStatus('test-model')?.error?.key).toBe('assetError.sizeMismatch');
  });

  it('refuses to start when the pre-flight disk check fails, with the asset name and sizes as vars', async () => {
    const spec = fileSpec({ sha256: PAYLOAD_SHA, name: 'Whisper Base', sizeBytes: 500_000_000 });
    await boot(spec);

    // Force the volume to look nearly full, without touching real disk space.
    const statfsSpy = vi
      .spyOn(fsp, 'statfs')
      .mockResolvedValue({ bavail: 1000, bsize: 1 } as unknown as Awaited<ReturnType<typeof fsp.statfs>>);

    const result = await startDownload('test-model');
    statfsSpy.mockRestore();

    expect(result.ok).toBe(false);
    expect(result.error?.key).toBe('assetError.diskSpace');
    expect(result.error?.vars?.name).toBe('Whisper Base');
    expect(getAssetStatus('test-model')?.state).toBe('not-installed');
    // Nothing was queued, let alone downloaded.
    expect(requests).toHaveLength(0);
  });
});

describe('resume', () => {
  it('appends to an existing partial instead of starting over', async () => {
    const spec = fileSpec({ sha256: PAYLOAD_SHA });
    await boot(spec);

    // Simulate a download that was interrupted at 20 KB and an app restart.
    const partial = partialPath('test-model');
    await fsp.mkdir(path.dirname(partial), { recursive: true });
    await fsp.writeFile(partial, PAYLOAD.subarray(0, 20_000));
    await fsp.writeFile(
      path.join(userDataDir, 'models', '.partial', 'test-model.meta.json'),
      JSON.stringify({ url: spec.url, version: '1', totalBytes: PAYLOAD.length, etag: '"v1"' }),
    );

    await startDownload('test-model');
    await settle('test-model');

    expect(getAssetStatus('test-model')?.state).toBe('installed');
    // The reassembled file must hash to the original — this is what proves the
    // running hash was correctly rebuilt from the bytes already on disk.
    expect(fs.readFileSync(assetPath('test-model') as string)).toEqual(PAYLOAD);
    expect(requests.at(-1)?.range).toBe('bytes=20000-');
  });

  it('starts over when the server ignores the Range request', async () => {
    const spec = fileSpec({ sha256: PAYLOAD_SHA });
    await boot(spec);

    const partial = partialPath('test-model');
    await fsp.mkdir(path.dirname(partial), { recursive: true });
    await fsp.writeFile(partial, PAYLOAD.subarray(0, 20_000));
    await fsp.writeFile(
      path.join(userDataDir, 'models', '.partial', 'test-model.meta.json'),
      JSON.stringify({ url: spec.url, version: '1', totalBytes: PAYLOAD.length, etag: '"v1"' }),
    );

    // A CDN that answers a Range request with a plain 200 is the classic way to
    // end up with a spliced, permanently corrupt model.
    ignoreRange = true;

    await startDownload('test-model');
    await settle('test-model');

    expect(getAssetStatus('test-model')?.state).toBe('installed');
    expect(fs.readFileSync(assetPath('test-model') as string)).toEqual(PAYLOAD);
  });

  it('discards a partial left over from a different version of the asset', async () => {
    const spec = fileSpec({ sha256: PAYLOAD_SHA, version: '2' });
    await boot(spec);

    const partial = partialPath('test-model');
    await fsp.mkdir(path.dirname(partial), { recursive: true });
    await fsp.writeFile(partial, Buffer.from('bytes from the old version'));
    await fsp.writeFile(
      path.join(userDataDir, 'models', '.partial', 'test-model.meta.json'),
      JSON.stringify({ url: spec.url, version: '1', totalBytes: 26 }),
    );

    await startDownload('test-model');
    await settle('test-model');

    expect(getAssetStatus('test-model')?.state).toBe('installed');
    expect(fs.readFileSync(assetPath('test-model') as string)).toEqual(PAYLOAD);
    // A stale partial must never be appended to — no Range header at all.
    expect(requests.at(-1)?.range).toBeUndefined();
  });
});

describe('delete and re-download', () => {
  it('removes an installed asset and can install it again', async () => {
    await boot(fileSpec({ sha256: PAYLOAD_SHA }));

    await startDownload('test-model');
    await settle('test-model');
    expect(isInstalled('test-model')).toBe(true);

    const result = await removeAsset('test-model');
    expect(result.ok).toBe(true);
    expect(isInstalled('test-model')).toBe(false);
    expect(assetPath('test-model')).toBeNull();
    expect(fs.existsSync(path.join(userDataDir, 'models', 'test-model'))).toBe(false);

    // The acceptance criterion for Phase 6: re-downloading after a delete just works.
    await startDownload('test-model');
    await settle('test-model');
    expect(isInstalled('test-model')).toBe(true);
    expect(fs.readFileSync(assetPath('test-model') as string)).toEqual(PAYLOAD);
  });

  it('asks consumers to unload before deleting the files', async () => {
    await boot(fileSpec({ sha256: PAYLOAD_SHA }));
    await startDownload('test-model');
    await settle('test-model');

    let unloadedWhileFilesStillExisted = false;
    const off = registerAssetUnloadHandler('test-model', () => {
      // On Windows an mmapped model refuses to unlink, so the handler must run
      // while the files are still there — that is the whole point.
      unloadedWhileFilesStillExisted = fs.existsSync(
        path.join(userDataDir, 'models', 'test-model'),
      );
    });

    await removeAsset('test-model');
    off();

    expect(unloadedWhileFilesStillExisted).toBe(true);
    expect(fs.existsSync(path.join(userDataDir, 'models', 'test-model'))).toBe(false);
  });
});

describe('reconcile on boot', () => {
  it('demotes an asset whose files were deleted behind the app', async () => {
    await boot(fileSpec({ sha256: PAYLOAD_SHA }));
    await startDownload('test-model');
    await settle('test-model');
    expect(isInstalled('test-model')).toBe(true);

    // The user cleaned out the folder by hand between runs.
    await fsp.rm(path.join(userDataDir, 'models', 'test-model'), { recursive: true, force: true });

    await boot(fileSpec({ sha256: PAYLOAD_SHA }));
    expect(isInstalled('test-model')).toBe(false);
    expect(getAssetStatus('test-model')?.state).toBe('not-installed');
  });

  it('picks up an orphaned partial as a paused download', async () => {
    const spec = fileSpec({ sha256: PAYLOAD_SHA });
    const partial = partialPath('test-model');
    await fsp.mkdir(path.dirname(partial), { recursive: true });
    await fsp.writeFile(partial, PAYLOAD.subarray(0, 12_345));

    await boot(spec);

    const status = getAssetStatus('test-model');
    expect(status?.state).toBe('paused');
    expect(status?.receivedBytes).toBe(12_345);
  });
});
