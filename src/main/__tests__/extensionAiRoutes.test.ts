// @vitest-environment node
/**
 * The extension's optional-AI routes (src/main/extensionAiRoutes.ts), over real
 * HTTP, with fake gates and runners — nothing reaches a model.
 *
 *  - pairing: the bridge refuses an unpaired caller before the AI handler runs;
 *  - size cap: an oversize body is a 413 answer, not a reset connection;
 *  - rate limit and concurrency cap: 429 with a code the extension can say;
 *  - "Use AI features" off: every feature answers `ai-off` and no runner runs;
 *  - consent: a cloud request without the feature's opt-in is refused before
 *    anything is sent, and the status says so;
 *  - pass-through: each route hands the runner a normalized, capped request and
 *    returns its answer without the English `error`;
 *  - cancel: the client hanging up aborts the runner's signal.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EXTENSION_AI_MAX_BODY_BYTES,
  EXTENSION_AI_MAX_IN_FLIGHT,
  createAiRateLimiter,
  createExtensionAiHandler,
  withRunnerId,
  type ExtensionAiDeps,
} from '../extensionAiRoutes';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extai-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal: () => undefined },
}));

type Json = Record<string, unknown>;

function fakeDeps(over: Partial<ExtensionAiDeps> = {}): ExtensionAiDeps & { calls: Json[] } {
  const calls: Json[] = [];
  const deps: ExtensionAiDeps & { calls: Json[] } = {
    calls,
    enabled: () => true,
    engine: () => 'cloud',
    cloudAllowed: () => true,
    providerConfigured: () => true,
    providerReachable: () => true,
    localModelAvailable: () => false,
    explainContext: async (input) => {
      calls.push({ runner: 'explain', input });
      return { ok: true, result: { senseIndex: 1, explanation: 'fits here', confidence: 'high' }, engine: 'cloud' };
    },
    simplify: async (input) => {
      calls.push({ runner: 'simplify', input });
      return { ok: true, result: { simplified: 'やさしい文。', notes: [] }, engine: 'cloud' };
    },
    lineExplain: async (input) => {
      calls.push({ runner: 'lineExplain', input });
      return { ok: true, result: { translation: 'The cat sleeps.', explanation: 'x', grammar: [], targetMeaning: 'cat' }, engine: 'cloud' };
    },
    analyze: async (request, options) => {
      calls.push({ runner: 'analyze', request, engine: options.engine, feature: options.feature });
      return { ok: true, result: { sentence: request.text, translations: { en: 'The cat sleeps.' }, annotations: [], nuance: [], pitfalls: [] } };
    },
    translateLocal: async (text, source, target) => {
      calls.push({ runner: 'translateLocal', text, source, target });
      return 'offline translation';
    },
    now: () => Date.now(),
    ...over,
  };
  return deps;
}

/** A server that runs only the AI handler (the bridge's pairing check is tested below). */
async function serve(deps: ExtensionAiDeps, limiter = createAiRateLimiter()) {
  const handler = createExtensionAiHandler(deps, limiter);
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void handler.handle(req, res, pathname);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

function request(
  port: number,
  method: string,
  route: string,
  body?: string,
  opts: { headers?: Record<string, string>; chunked?: boolean } = {},
): Promise<{ status: number; json: Json }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
    if (body !== undefined && !opts.chunked) headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let json: Json = {};
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined && opts.chunked) {
      // No Content-Length: the handler must still stop reading at the cap.
      const half = Math.ceil(body.length / 2);
      req.write(body.slice(0, half));
      req.end(body.slice(half));
    } else {
      req.end(body);
    }
  });
}

const post = (port: number, route: string, body: Json) => request(port, 'POST', route, JSON.stringify(body));

const EXPLAIN = { word: '猫', reading: 'ねこ', sentence: '窓辺の猫は静かに眠っていた。', senses: ['cat', 'shamisen'], lang: 'ja', uiLang: 'en' };

let open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const s of open) await s.close();
  open = [];
});

async function start(deps: ExtensionAiDeps, limiter?: ReturnType<typeof createAiRateLimiter>) {
  const s = await serve(deps, limiter);
  open.push(s);
  return s.port;
}

describe('extension AI routes — the master switch', () => {
  it('answers ai-off on every feature and never runs a runner', async () => {
    const deps = fakeDeps({ enabled: () => false });
    const port = await start(deps);
    for (const [route, body] of [
      ['/v1/ai/explain-context', EXPLAIN],
      ['/v1/ai/breakdown', { text: '猫が寝ている。' }],
      ['/v1/ai/simplify', { text: '猫が寝ている。' }],
      ['/v1/ai/word-meaning', { word: '猫' }],
    ] as const) {
      const res = await post(port, route, body);
      expect(res, route).toMatchObject({ status: 200, json: { ok: false, aiOff: true, code: 'ai-off' } });
    }
    expect(deps.calls).toEqual([]);
  });

  it('reports AI off in the status, every feature off', async () => {
    const port = await start(fakeDeps({ enabled: () => false }));
    const res = await request(port, 'GET', '/v1/ai/status');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, enabled: false });
    expect(Object.values(res.json.features as Json)).toEqual(['off', 'off', 'off', 'off']);
  });
});

describe('extension AI routes — consent and setup', () => {
  it('says which features need the cloud opt-in, a key, or the network', async () => {
    const port = await start(fakeDeps({ cloudAllowed: (f) => f === 'contextExplain' }));
    expect((await request(port, 'GET', '/v1/ai/status')).json.features).toEqual({
      explain: 'ready',
      breakdown: 'consent',
      simplify: 'consent',
      meaning: 'consent',
    });
    const noKey = await start(fakeDeps({ providerConfigured: () => false }));
    expect(((await request(noKey, 'GET', '/v1/ai/status')).json.features as Json).explain).toBe('no-key');
    const offline = await start(fakeDeps({ providerReachable: () => false }));
    expect(((await request(offline, 'GET', '/v1/ai/status')).json.features as Json).explain).toBe('offline');
  });

  it('offers the breakdown offline whenever the offline model is installed, opt-in or not', async () => {
    const port = await start(fakeDeps({ cloudAllowed: () => false, localModelAvailable: () => true }));
    const features = (await request(port, 'GET', '/v1/ai/status')).json.features as Json;
    expect(features.breakdown).toBe('ready');
    expect(features.explain).toBe('consent');
  });

  it('passes the runner\'s consent refusal through as a code, without its English text', async () => {
    const deps = fakeDeps({
      explainContext: async () => ({ ok: false, needsConsent: true, code: 'consent', error: 'This feature is not allowed…' }),
    });
    const port = await start(deps);
    const res = await post(port, '/v1/ai/explain-context', EXPLAIN);
    expect(res.json).toEqual({ ok: false, needsConsent: true, code: 'consent' });
  });

  it('refuses a cloud breakdown without the readerExplain opt-in before anything is sent', async () => {
    const deps = fakeDeps({ cloudAllowed: (f) => f !== 'readerExplain' });
    const port = await start(deps);
    const res = await post(port, '/v1/ai/breakdown', { text: '猫が寝ている。' });
    expect(res.json).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(deps.calls).toEqual([]);
  });
});

describe('extension AI routes — pass-through to the runners', () => {
  it('explain-context: a normalized request, the runner\'s result', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const senses = Array.from({ length: 20 }, (_, i) => `sense ${i + 1}`);
    const res = await post(port, '/v1/ai/explain-context', { ...EXPLAIN, senses, uiLang: 'xx', extra: 'ignored' });
    expect(res.json).toEqual({ ok: true, result: { senseIndex: 1, explanation: 'fits here', confidence: 'high' }, engine: 'cloud' });
    const input = deps.calls[0].input as Json;
    expect(input).toMatchObject({ word: '猫', reading: 'ねこ', lang: 'ja', answerLang: 'en' });
    expect((input.senses as string[]).length).toBe(12);
    expect(input).not.toHaveProperty('extra');
    expect(input).not.toHaveProperty('requestId');
  });

  it('explain-context: nothing to ask is empty-input, not a runner call', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const res = await post(port, '/v1/ai/explain-context', { word: '猫', sentence: '', senses: [] });
    expect(res.json).toEqual({ ok: false, code: 'empty-input' });
    expect(deps.calls).toEqual([]);
  });

  it('simplify: the paragraph and the languages, and a too-long paragraph is refused', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const ok = await post(port, '/v1/ai/simplify', { text: '猫が  寝ている。', lang: 'ja', uiLang: 'ru' });
    expect(ok.json).toMatchObject({ ok: true, result: { simplified: 'やさしい文。' } });
    expect(deps.calls[0].input).toMatchObject({ text: '猫が 寝ている。', studyLang: 'ja', answerLang: 'ru' });
    const long = await post(port, '/v1/ai/simplify', { text: 'あ'.repeat(1501) });
    expect(long.json).toEqual({ ok: false, code: 'too-long' });
  });

  it('word-meaning: the target\'s meaning in the sentence', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const res = await post(port, '/v1/ai/word-meaning', { word: '猫', sentence: '猫が寝ている。', lang: 'ja' });
    expect(res.json).toMatchObject({ ok: true, result: { meaning: 'cat', translation: 'The cat sleeps.' } });
    expect(deps.calls[0].input).toMatchObject({ surface: 'reader', text: '猫が寝ている。', target: '猫' });
  });

  it('breakdown: offline first — the offline model when installed, with the readerExplain opt-in named', async () => {
    const deps = fakeDeps({ localModelAvailable: () => true });
    const port = await start(deps);
    const res = await post(port, '/v1/ai/breakdown', { text: '猫が寝ている。', lang: 'ja', uiLang: 'en' });
    expect(res.json).toMatchObject({ ok: true, engine: 'local', result: { analysis: { sentence: '猫が寝ている。' } } });
    expect(deps.calls[0]).toMatchObject({ runner: 'analyze', engine: 'local-qwen', feature: 'readerExplain' });
  });

  it('breakdown: the cloud only when no offline model and the opt-in allows it', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const res = await post(port, '/v1/ai/breakdown', { text: '猫が寝ている。' });
    expect(res.json).toMatchObject({ ok: true, engine: 'cloud' });
    expect(deps.calls[0]).toMatchObject({ runner: 'analyze', engine: 'cloud' });
  });

  it('breakdown: a failed offline analysis still gives the offline translation, and says why', async () => {
    const deps = fakeDeps({
      localModelAvailable: () => true,
      analyze: async () => ({ ok: false, code: 'invalid' }),
    });
    const port = await start(deps);
    const res = await post(port, '/v1/ai/breakdown', { text: '猫が寝ている。', lang: 'ja', uiLang: 'ja' });
    expect(res.json).toEqual({ ok: true, engine: 'local', result: { translation: 'offline translation', analysisCode: 'invalid' } });
    // The translation goes to English when the reader's language is the sentence's own.
    expect(deps.calls.find((c) => c.runner === 'translateLocal')).toMatchObject({ source: 'ja', target: 'en' });
  });
});

describe('extension AI routes — size cap', () => {
  it('answers an oversize body with 413 too-long, and keeps answering', async () => {
    const deps = fakeDeps();
    const port = await start(deps);
    const big = JSON.stringify({ ...EXPLAIN, sentence: 'あ'.repeat(EXTENSION_AI_MAX_BODY_BYTES) });
    expect(await request(port, 'POST', '/v1/ai/explain-context', big)).toMatchObject({ status: 413, json: { ok: false, code: 'too-long' } });
    // No Content-Length (chunked): still capped while reading.
    expect(await request(port, 'POST', '/v1/ai/explain-context', big, { chunked: true })).toMatchObject({ status: 413 });
    expect(deps.calls).toEqual([]);
    expect((await post(port, '/v1/ai/explain-context', EXPLAIN)).json).toMatchObject({ ok: true });
  });

  it('answers malformed JSON with 400', async () => {
    const port = await start(fakeDeps());
    expect(await request(port, 'POST', '/v1/ai/simplify', '{nope')).toMatchObject({ status: 400, json: { ok: false } });
    expect(await request(port, 'POST', '/v1/ai/simplify', '[1,2]')).toMatchObject({ status: 400 });
  });

  it('refuses the wrong method and unknown AI paths', async () => {
    const port = await start(fakeDeps());
    expect((await request(port, 'POST', '/v1/ai/status', '{}')).status).toBe(405);
    expect((await request(port, 'GET', '/v1/ai/simplify')).status).toBe(405);
    expect((await post(port, '/v1/ai/anything', {})).status).toBe(404);
  });
});

describe('extension AI routes — rate limit', () => {
  it('refuses past the window with 429 rate-limit', async () => {
    const deps = fakeDeps();
    const port = await start(deps, createAiRateLimiter(2, 60_000));
    expect((await post(port, '/v1/ai/simplify', { text: '猫。' })).status).toBe(200);
    expect((await post(port, '/v1/ai/simplify', { text: '猫。' })).status).toBe(200);
    expect(await post(port, '/v1/ai/simplify', { text: '猫。' })).toMatchObject({ status: 429, json: { ok: false, code: 'rate-limit' } });
    expect(deps.calls.length).toBe(2);
    // The status is not a model call and is not limited.
    expect((await request(port, 'GET', '/v1/ai/status')).status).toBe(200);
  });

  it('frees the window as it slides', () => {
    const limiter = createAiRateLimiter(1, 1000);
    expect(limiter.take(0)).toBe(true);
    expect(limiter.take(999)).toBe(false);
    expect(limiter.take(1000)).toBe(true);
  });

  it('caps requests running at once', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const deps = fakeDeps({
      simplify: async () => {
        await gate;
        return { ok: true, result: { simplified: 'x', notes: [] } };
      },
    });
    const port = await start(deps);
    const running = Array.from({ length: EXTENSION_AI_MAX_IN_FLIGHT }, () => post(port, '/v1/ai/simplify', { text: '猫。' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await post(port, '/v1/ai/simplify', { text: '猫。' })).toMatchObject({ status: 429, json: { code: 'rate-limit' } });
    release();
    for (const r of await Promise.all(running)) expect(r.status).toBe(200);
  });
});

describe('extension AI routes — cancel', () => {
  it('does not cancel a request the extension is still waiting for', async () => {
    let abortedDuringRun: boolean | null = null;
    const deps = fakeDeps({
      explainContext: async (_input, signal) => {
        await new Promise((r) => setTimeout(r, 80));
        abortedDuringRun = signal.aborted;
        return { ok: true, result: { senseIndex: 0, explanation: 'kept', confidence: 'low' } };
      },
    });
    const port = await start(deps);
    const res = await post(port, '/v1/ai/explain-context', EXPLAIN);
    expect(res.json).toMatchObject({ ok: true, result: { explanation: 'kept' } });
    expect(abortedDuringRun).toBe(false);
  });

  it('aborts the runner when the extension hangs up', async () => {
    let seen: AbortSignal | null = null;
    let aborted: () => void = () => undefined;
    const abortedP = new Promise<void>((r) => {
      aborted = r;
    });
    const deps = fakeDeps({
      explainContext: (_input, signal) => {
        seen = signal;
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted();
            resolve({ ok: false, code: 'cancelled' });
          });
        });
      },
    });
    const port = await start(deps);
    const body = JSON.stringify(EXPLAIN);
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/v1/ai/explain-context',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => undefined);
    req.end(body);
    for (let i = 0; i < 50 && !seen; i++) await new Promise((r) => setTimeout(r, 10));
    expect(seen).not.toBeNull();
    req.destroy();
    await abortedP;
    expect((seen as unknown as AbortSignal).aborted).toBe(true);
  });

  it('cancels a runner by an id it made, retrying until the runner has registered it', async () => {
    const registered = new Set<string>();
    const cancelled: string[] = [];
    const controller = new AbortController();
    let seenId = '';
    const result = withRunnerId(
      controller.signal,
      (id) => {
        if (!registered.has(id)) return false;
        cancelled.push(id);
        return true;
      },
      async (id) => {
        seenId = id;
        controller.abort(); // the reader cancels while the runner is still checking its gates
        await new Promise((r) => setTimeout(r, 30));
        registered.add(id); // …then it registers
        await new Promise((r) => setTimeout(r, 120));
        return 'done';
      },
    );
    expect(await result).toBe('done');
    expect(seenId).toMatch(/^ext_[0-9a-f]{24}$/);
    expect(cancelled).toEqual([seenId]);
  });
});

describe('extension AI routes — through the bridge', () => {
  const PORT = 20000 + ((process.pid + 29) % 20000);
  type Mod = typeof import('../extensionServer');
  let mod: Mod;

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

  it('refuses every AI route without the pairing token', async () => {
    for (const route of ['/v1/ai/explain-context', '/v1/ai/breakdown', '/v1/ai/simplify', '/v1/ai/word-meaning']) {
      const res = await request(PORT, 'POST', route, JSON.stringify(EXPLAIN));
      expect(res, route).toMatchObject({ status: 401, json: { ok: false } });
    }
    const status = await request(PORT, 'GET', '/v1/ai/status');
    expect(status.status).toBe(401);
    const wrong = await request(PORT, 'GET', '/v1/ai/status', undefined, { headers: { Authorization: 'Bearer nope-nope-nope-nope' } });
    expect(wrong.status).toBe(401);
  });

  it('caps the body for a paired caller with 413, before any AI module loads', async () => {
    const token = mod.getExtensionBridgeStatus().token;
    const big = JSON.stringify({ text: 'あ'.repeat(EXTENSION_AI_MAX_BODY_BYTES) });
    const res = await request(PORT, 'POST', '/v1/ai/simplify', big, { headers: { Authorization: `Bearer ${token}` } });
    expect(res).toMatchObject({ status: 413, json: { ok: false, code: 'too-long' } });
  });
});
