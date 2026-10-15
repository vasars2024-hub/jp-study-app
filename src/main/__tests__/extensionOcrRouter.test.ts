// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineLine, RouterDeps } from '../ocrRouter';
import type { SurfaceOcrOptions } from '../ocrSurface';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-extension-ocr-'));
const originalResourcesPath = process.resourcesPath;
(process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
const h = vi.hoisted(() => {
  const image = (): unknown => ({ getSize: () => ({ width: 300, height: 100 }), toDataURL: () => 'data:image/png;base64,AA==', crop: image });
  return { lang: 'ja', image, deps: null as unknown as RouterDeps, calls: [] as SurfaceOcrOptions[] };
});
vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] }, safeStorage: { isEncryptionAvailable: () => false },
  nativeImage: { createFromDataURL: h.image },
}));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => h.lang }));
vi.mock('../downloads', async (original) => ({
  ...await original<typeof import('../downloads')>(), startDownload: async () => ({ ok: true }),
}));
vi.mock('../paddleOcr', async (original) => ({
  ...await original<typeof import('../paddleOcr')>(), paddleOcrAvailable: () => true, installedPaddleLangs: () => ['ja', 'zh'],
}));
vi.mock('../ocrSurface', async (original) => {
  const real = await original<typeof import('../ocrSurface')>();
  return { ...real, readOcrSurface: (image: Electron.NativeImage, opts: SurfaceOcrOptions) => {
    h.calls.push(opts); return real.readOcrSurface(image, opts, h.deps);
  } };
});
import { defaultScriptOf } from '../ocrRouter';

const port = 22000 + (process.pid % 18000);
let server: typeof import('../extensionServer');
beforeAll(async () => {
  process.env.JP_EXTENSION_PORT = String(port);
  server = await import('../extensionServer');
  server.startExtensionServer();
  for (let i = 0; i < 50 && !server.getExtensionBridgeStatus().running; i++) await new Promise((resolve) => setTimeout(resolve, 20));
});
afterAll(() => {
  server?.stopExtensionServer(); delete process.env.JP_EXTENSION_PORT;
  (process as NodeJS.Process & { resourcesPath: string | undefined }).resourcesPath = originalResourcesPath;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  h.lang = 'ja'; h.calls = [];
  h.deps = { providers: [], now: () => 0, wordOracle: () => null, detectLang: (_text, langs) => langs[0],
    scriptOf: defaultScriptOf, assetsFor: (lang) => [`paddle-ocr-${lang}`] };
});

function post(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/ocr',
      headers: { Authorization: `Bearer ${server.getExtensionBridgeStatus().token}`, 'Content-Type': 'application/json' } },
    (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject); request.end(JSON.stringify({ dataUrl: 'data:image/png;base64,AA==', ...body }));
  });
}
const line = (text: string, confidence: number): EngineLine => ({ text, confidence, vertical: false, box: [0, 0, 200, 40] });

describe('extension image OCR router', () => {
  it('switches readers on unsure screen text and returns the candidates over HTTP', async () => {
    h.deps.providers = [
      { id: 'web', langs: ['ja'], tier: 0, available: () => true,
        readPage: async () => [{ ...line('彼後', 0.5), chars: [
          { ch: '彼', p: 0.9, alts: [] }, { ch: '後', p: 0.4, alts: [{ ch: '竜', p: 0.3 }] },
        ] }] },
      { id: 'manga', langs: ['ja'], tier: 1, available: () => true, readLine: async () => line('恐竜', 0.95) },
    ];
    const result = await post({});
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ ok: true, text: '恐竜', engines: ['web', 'manga'] });
    expect(h.calls[0]).toMatchObject({ purpose: 'lens', langs: ['ja', 'zh'] });
  });
  it('uses manga purpose without forcing a Chinese page through a Japanese reader', async () => {
    h.lang = 'zh';
    const page = vi.fn(async () => [line('今天天气很好', 0.95)]);
    h.deps.providers = [{ id: 'web', langs: ['zh'], available: () => true, readPage: page }];
    const result = await post({ category: 'manga', langHint: 'zh' });
    expect(result.body).toMatchObject({ ok: true, text: '今天天气很好', lang: 'zh', engine: 'web' });
    expect(h.calls[0]).toMatchObject({ purpose: 'manga', langs: ['zh', 'ja'] });
    expect(page).toHaveBeenCalledOnce();
  });
  it('reports a missing reader without claiming a successful empty page', async () => {
    const result = await post({});
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ ok: false, available: false, errorCode: 'no-engine' });
  });
});
