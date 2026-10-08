// @vitest-environment node
/**
 * Page word status (WP8), over real HTTP:
 * - `/v1/annotate` asks the host window to tokenize (here: the real renderer
 *   half, src/renderer/extensionAnnotate.ts, with a stubbed tokenizer and known
 *   store) and answers sanitized tokens with lemma, reading and level;
 * - `/v1/known-snapshot` answers the known-word map with a version, and only
 *   the version when the caller already has it.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { annotateTexts } from '../../renderer/extensionAnnotate';
import type { JpToken } from '../../renderer/tokenizer';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extannot-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const h = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, payload: unknown) => void>(),
  sent: [] as Array<{ channel: string; payload: unknown }>,
  known: {} as Record<string, number>,
  hostOpen: true,
  silent: false,
  onSend: null as null | ((channel: string, payload: unknown) => void),
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: {
    handle: () => undefined,
    on: (channel: string, fn: (e: unknown, payload: unknown) => void) => h.handlers.set(channel, fn),
  },
  BrowserWindow: {
    getAllWindows: () =>
      h.hostOpen
        ? [
            {
              isDestroyed: () => false,
              isAlwaysOnTop: () => false,
              webContents: {
                send: (channel: string, payload: unknown) => {
                  h.sent.push({ channel, payload });
                  h.onSend?.(channel, payload);
                },
              },
            },
          ]
        : [],
    getFocusedWindow: () => null,
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openPath: async () => '' },
}));

/** kuromoji stand-in: the lexicon's words are content tokens, everything else one-char function tokens. */
const LEXICON: Record<string, { lemma: string; reading: string }> = {
  食べた: { lemma: '食べる', reading: 'タベタ' },
  猫: { lemma: '猫', reading: 'ネコ' },
  学校: { lemma: '学校', reading: 'ガッコウ' },
};
function stubTokenize(text: string): JpToken[] {
  const out: JpToken[] = [];
  let i = 0;
  while (i < text.length) {
    const word = Object.keys(LEXICON).find((w) => text.startsWith(w, i));
    if (word) {
      out.push({ surface: word, lemma: LEXICON[word].lemma, reading: LEXICON[word].reading, content: true, proper: false, pos: '名詞', posDetail: '*' });
      i += word.length;
    } else {
      out.push({ surface: text[i], lemma: text[i], content: false, proper: false, pos: '助詞', posDetail: '*' });
      i += 1;
    }
  }
  return out;
}

/** The host renderer: what studyBackgroundJobs.ts wires to these channels. */
function fakeRenderer(channel: string, payload: unknown): void {
  if (h.silent) return;
  const p = payload as { id: string; texts?: string[]; lang?: string };
  setTimeout(() => {
    if (channel === 'extension:annotate-request') {
      const results = annotateTexts(p.texts ?? [], p.lang ?? 'ja', {
        tokenizeJa: stubTokenize,
        getLevel: (w) => h.known[w] ?? 0,
      });
      h.handlers.get('extension:annotate-reply')?.({}, { id: p.id, results });
    }
    if (channel === 'extension:known-snapshot-request') {
      h.handlers.get('extension:known-snapshot-reply')?.({}, { id: p.id, words: { ...h.known }, lang: 'ja' });
    }
  }, 1);
}

const PORT = 20000 + ((process.pid + 41) % 20000);

type Mod = typeof import('../extensionServer');
let mod: Mod;
let bridge: typeof import('../extensionBridgeHost');

function call(method: string, route: string, body?: unknown, auth = true): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = mod.getExtensionBridgeStatus().token;
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: route,
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

beforeAll(async () => {
  process.env.JP_EXTENSION_PORT = String(PORT);
  mod = await import('../extensionServer');
  bridge = await import('../extensionBridgeHost');
  mod.registerExtensionBridgeIpc();
  bridge.registerExtensionBridgeHostIpc();
  h.onSend = fakeRenderer;
  mod.startExtensionServer();
  for (let i = 0; i < 50 && !mod.getExtensionBridgeStatus().running; i++) await new Promise((r) => setTimeout(r, 20));
});

afterAll(() => {
  mod.stopExtensionServer();
  delete process.env.JP_EXTENSION_PORT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.known = {};
  h.hostOpen = true;
  h.silent = false;
  bridge.invalidateKnownSnapshotCache();
});

describe('/v1/annotate', () => {
  it('refuses without the pairing token', async () => {
    expect((await call('POST', '/v1/annotate', { texts: ['猫'] }, false)).status).toBe(401);
  });

  it('answers 400 with a code for an empty request', async () => {
    const res = await call('POST', '/v1/annotate', { texts: [] });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ ok: false, code: 'texts_required' });
  });

  it('tokenizes each text in the host window: offsets, lemma, hiragana reading, known level', async () => {
    h.known = { 食べる: 3, 学校: 1 };
    const res = await call('POST', '/v1/annotate', { texts: ['猫が食べた', '学校へ'], lang: 'ja' });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.results).toEqual([
      [
        { o: 0, n: 1, l: '猫', r: 'ねこ', k: 0 },
        { o: 2, n: 3, l: '食べる', r: 'たべた', k: 3 },
      ],
      [{ o: 0, n: 2, l: '学校', r: 'がっこう', k: 1 }],
    ]);
    const req = h.sent.find((s) => s.channel === 'extension:annotate-request');
    expect(req?.payload).toMatchObject({ texts: ['猫が食べた', '学校へ'], lang: 'ja' });
  });

  it('caps the batch it forwards (64 texts, 2000 chars each)', async () => {
    const texts = Array.from({ length: 80 }, () => '猫'.repeat(2500));
    const res = await call('POST', '/v1/annotate', { texts, lang: 'ja' });
    expect(res.status).toBe(200);
    const forwarded = (h.sent.find((s) => s.channel === 'extension:annotate-request')?.payload as { texts: string[] }).texts;
    expect(forwarded.length).toBeLessThanOrEqual(64);
    expect(forwarded.every((t) => t.length <= 2000)).toBe(true);
  });

  it('answers 504 app_window_closed with no Gum window', async () => {
    h.hostOpen = false;
    const res = await call('POST', '/v1/annotate', { texts: ['猫'] });
    expect(res.status).toBe(504);
    expect(res.json).toMatchObject({ ok: false, code: 'app_window_closed' });
  });
});

describe('/v1/known-snapshot', () => {
  it('answers the map with a version, then only the version when unchanged', async () => {
    h.known = { 猫: 3, 犬: 1 };
    const first = await call('GET', '/v1/known-snapshot');
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ ok: true, lang: 'ja', words: { 猫: 3, 犬: 1 } });
    const version = String(first.json.version);
    expect(version).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);

    const again = await call('GET', `/v1/known-snapshot?since=${encodeURIComponent(version)}`);
    expect(again.json).toEqual({ ok: true, version, unchanged: true, lang: 'ja' });
  });

  it('changes version when a level changes', async () => {
    h.known = { 猫: 3 };
    const a = String((await call('GET', '/v1/known-snapshot')).json.version);
    bridge.invalidateKnownSnapshotCache();
    h.known = { 猫: 2 };
    const b = await call('GET', `/v1/known-snapshot?since=${encodeURIComponent(a)}`);
    expect(b.json.unchanged).toBeUndefined();
    expect(b.json.version).not.toBe(a);
    expect(b.json.words).toEqual({ 猫: 2 });
  });

  it('answers 504 with a code when the host never replies', async () => {
    h.silent = true;
    const res = await call('GET', '/v1/known-snapshot');
    expect(res.status).toBe(504);
    expect(res.json).toMatchObject({ ok: false, code: 'timeout' });
  }, 10_000);

  it('is advertised in the health contract', async () => {
    const res = await call('GET', '/v1/health');
    expect(res.json.features).toMatchObject({ annotate: true, knownSnapshot: true });
  });
});
