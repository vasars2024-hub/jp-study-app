// @vitest-environment node
/**
 * The extension server answers Chinese and Russian pages in their own language,
 * over real HTTP:
 * - `/v1/examples` searched the Japanese corpus for every word (a Russian word
 *   found nothing; a Chinese one found Japanese sentences sharing a kanji);
 * - `/v1/translate` with no source translated everything "from Japanese".
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extlang-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const h = vi.hoisted(() => ({
  exampleCalls: [] as Array<{ query: string; limit: number; lang: string | undefined }>,
  translateCalls: [] as Array<{ text: string; source: string; target: string }>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock('../dictionary', () => ({
  searchExamples: async (query: string, limit: number, lang?: string) => {
    h.exampleCalls.push({ query, limit, lang });
    return { query, examples: [] };
  },
}));
vi.mock('../translate', () => ({
  isTranslateAvailable: () => true,
  runTranslationBatch: async (items: Array<{ id: string; text: string; source: string; target: string }>) => {
    for (const item of items) h.translateCalls.push({ text: item.text, source: item.source, target: item.target });
    return items.map((item) => ({ id: item.id, text: 'translated' }));
  },
}));

const PORT = 20000 + ((process.pid + 7) % 20000);

type Mod = typeof import('../extensionServer');
let mod: Mod;

function post(route: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = mod.getExtensionBridgeStatus().token;
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      method: 'POST',
      path: route,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }));
    });
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
  h.exampleCalls.length = 0;
  h.translateCalls.length = 0;
});

describe('/v1/examples', () => {
  it('searches the language the extension names', async () => {
    expect((await post('/v1/examples', { query: '学习', limit: 3, lang: 'zh' })).status).toBe(200);
    expect(h.exampleCalls).toEqual([{ query: '学习', limit: 3, lang: 'zh' }]);
  });

  it("falls back to the word's own script", async () => {
    await post('/v1/examples', { query: 'книга' });
    await post('/v1/examples', { query: '食べる' });
    expect(h.exampleCalls.map((c) => c.lang)).toEqual(['ru', 'ja']);
  });
});

describe('/v1/translate', () => {
  it('reads the source from the text when none is named', async () => {
    const res = await post('/v1/translate', { text: 'Я читаю книгу.', target: 'en' });
    expect(res.status).toBe(200);
    expect(res.json.source).toBe('ru');
    expect(h.translateCalls).toEqual([{ text: 'Я читаю книгу.', source: 'ru', target: 'en' }]);
  });

  it('keeps a source the caller named', async () => {
    await post('/v1/translate', { text: '学习', source: 'zh', target: 'ru' });
    expect(h.translateCalls).toEqual([{ text: '学习', source: 'zh', target: 'ru' }]);
  });
});
