// @vitest-environment node
/**
 * Chunked tab / mic recording uploads from the Chrome extension
 * (src/main/extensionRecordings.ts), driven over a real loopback HTTP server.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/nonexistent-userdata', getAppPath: () => '/nonexistent-app', isPackaged: false },
}));

import {
  RECORDING_CHUNK_MAX_BYTES,
  __recordingConsumersIdle,
  cleanupStaleRecordingPartials,
  handleRecordingsRoute,
  setMicRecordingHandler,
  setRecordingFinalizer,
  type RecordingsRouteDeps,
} from '../extensionRecordings';

const TOKEN = 'test-token-0123456789abcdef';
const SMALL_CHUNK_MAX = 1024;
const SMALL_TOTAL_MAX = 4096;

let server: http.Server;
let port = 0;
let root = '';
let clock = 0;
let useDefaultLimits = false;
const roots: string[] = [];

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function requireAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    json(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function deps(): RecordingsRouteDeps {
  return {
    requireAuth,
    json,
    rootDir: () => root,
    now: () => clock,
    ...(useDefaultLimits ? {} : { chunkMaxBytes: SMALL_CHUNK_MAX, totalMaxBytes: SMALL_TOTAL_MAX }),
  };
}

interface Res {
  status: number;
  json: Record<string, unknown>;
}

function request(
  method: string,
  route: string,
  body?: Buffer | string,
  opts: { auth?: boolean; chunked?: boolean; contentType?: string } = {},
): Promise<Res> {
  const headers: Record<string, string | number> = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) {
    headers['Content-Type'] = opts.contentType ?? 'application/json';
    if (!opts.chunked) headers['Content-Length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode ?? 0, json: parsed });
      });
    });
    req.on('error', reject);
    if (body !== undefined && opts.chunked) {
      // No Content-Length: the size is only discovered while streaming.
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const step = 64 * 1024;
      for (let i = 0; i < buf.length; i += step) req.write(buf.subarray(i, i + step));
      req.end();
    } else {
      req.end(body);
    }
  });
}

const put = (id: string, seq: number | string, bytes: Buffer, opts: { chunked?: boolean } = {}): Promise<Res> =>
  request('PUT', `/v1/recordings/${id}/chunks/${seq}`, bytes, { contentType: 'application/octet-stream', ...opts });

async function create(body: Record<string, unknown> = { kind: 'tab' }): Promise<string> {
  const res = await request('POST', '/v1/recordings', JSON.stringify(body));
  expect(res.status).toBe(200);
  return String(res.json.id);
}

const partialPath = (id: string): string => path.join(root, 'extension-partial', id);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    void handleRecordingsRoute(req, res, pathname, deps()).then((handled) => {
      if (!handled) json(res, 404, { ok: false, error: 'Not found (server)' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extrec-'));
  roots.push(root);
  clock = Date.UTC(2026, 9, 8, 12, 0, 0);
  useDefaultLimits = false;
});

afterEach(() => {
  setRecordingFinalizer(null);
  setMicRecordingHandler(null);
});

describe('auth', () => {
  it('answers 401 without a token on every route', async () => {
    const id = crypto.randomUUID();
    const cases: Array<[string, string, string | Buffer | undefined]> = [
      ['POST', '/v1/recordings', JSON.stringify({ kind: 'tab' })],
      ['PUT', `/v1/recordings/${id}/chunks/0`, Buffer.from('abc')],
      ['POST', `/v1/recordings/${id}/finish`, '{}'],
      ['GET', `/v1/recordings/${id}/status`, undefined],
      ['DELETE', `/v1/recordings/${id}`, undefined],
    ];
    for (const [method, route, body] of cases) {
      const res = await request(method, route, body, { auth: false });
      expect(res, `${method} ${route}`).toMatchObject({ status: 401, json: { ok: false } });
    }
    expect(fs.existsSync(path.join(root, 'extension-partial'))).toBe(false);
  });
});

describe('upload and finish', () => {
  it('assembles three chunks into exactly their concatenation', async () => {
    const created = await request('POST', '/v1/recordings', JSON.stringify({ kind: 'tab', title: 'My: Page?' }));
    expect(created).toMatchObject({ status: 200, json: { ok: true, chunkMax: SMALL_CHUNK_MAX, nextSeq: 0 } });
    const id = String(created.json.id);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.existsSync(path.join(partialPath(id), 'meta.json'))).toBe(true);

    const parts = [crypto.randomBytes(1000), crypto.randomBytes(17), crypto.randomBytes(512)];
    for (let i = 0; i < parts.length; i++) {
      const res = await put(id, i, parts[i]);
      expect(res).toMatchObject({ status: 200, json: { ok: true, nextSeq: i + 1 } });
    }

    const fin = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ totalChunks: 3, durationMs: 6000 }));
    expect(fin).toMatchObject({ status: 200, json: { ok: true, id, finalized: false } });
    const out = String(fin.json.path);
    expect(path.dirname(out)).toBe(path.join(root, 'recordings'));
    expect(path.basename(out)).toMatch(/^Gum tab recording \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} - My Page\.webm$/);
    expect(fs.readFileSync(out).equals(Buffer.concat(parts))).toBe(true);
    expect(fs.existsSync(partialPath(id))).toBe(false);

    // Idempotent: a repeated finish returns the stored answer.
    const again = await request('POST', `/v1/recordings/${id}/finish`, '{}');
    expect(again).toMatchObject({ status: 200, json: fin.json });
    expect(fs.readdirSync(path.join(root, 'recordings'))).toHaveLength(1);
  });

  it('accepts an identical re-PUT as a duplicate and refuses a different one', async () => {
    const id = await create();
    const a = crypto.randomBytes(200);
    expect((await put(id, 0, a)).status).toBe(200);
    expect(await put(id, 0, a)).toMatchObject({ status: 200, json: { ok: true, duplicate: true, nextSeq: 1 } });
    expect(await put(id, 0, crypto.randomBytes(200))).toMatchObject({ status: 409, json: { ok: false, nextSeq: 1 } });
    expect(await put(id, 0, a.subarray(0, 199))).toMatchObject({ status: 409, json: { ok: false } });
    const status = await request('GET', `/v1/recordings/${id}/status`);
    expect(status.json).toMatchObject({ nextSeq: 1, bytes: 200 });
  });

  it('rejects a gap with the expected seq', async () => {
    const id = await create();
    expect((await put(id, 0, Buffer.from('a'))).status).toBe(200);
    expect(await put(id, 2, Buffer.from('c'))).toMatchObject({ status: 409, json: { ok: false, error: 'gap', nextSeq: 1 } });
    expect(fs.readdirSync(partialPath(id)).sort()).toEqual(['0.part', 'meta.json']);
  });

  it('answers 413 for an oversize chunk (declared or streamed) and keeps serving', async () => {
    const id = await create();
    const big = crypto.randomBytes(SMALL_CHUNK_MAX + 1);
    expect(await put(id, 0, big)).toMatchObject({ status: 413, json: { ok: false, error: 'chunk too large' } });
    expect(await put(id, 0, big, { chunked: true })).toMatchObject({
      status: 413,
      json: { ok: false, error: 'chunk too large' },
    });
    // Nothing was committed and nothing was left behind.
    expect(fs.readdirSync(partialPath(id))).toEqual(['meta.json']);
    expect(await put(id, 0, crypto.randomBytes(SMALL_CHUNK_MAX))).toMatchObject({ status: 200, json: { nextSeq: 1 } });
  });

  it('enforces the real 8 MB chunk cap on a streamed body', async () => {
    useDefaultLimits = true;
    const id = await create();
    const big = Buffer.alloc(RECORDING_CHUNK_MAX_BYTES + 1, 7);
    expect(await put(id, 0, big, { chunked: true })).toMatchObject({ status: 413, json: { error: 'chunk too large' } });
    expect((await request('GET', `/v1/recordings/${id}/status`)).json).toMatchObject({ state: 'uploading', nextSeq: 0 });
  });

  it('enforces the total size cap over the session', async () => {
    const id = await create();
    for (let i = 0; i < 4; i++) expect((await put(id, i, Buffer.alloc(SMALL_CHUNK_MAX))).status).toBe(200);
    expect(await put(id, 4, Buffer.alloc(1))).toMatchObject({ status: 413, json: { ok: false, nextSeq: 4 } });
  });

  it('refuses a finish whose totalChunks differs from what arrived', async () => {
    const id = await create();
    await put(id, 0, Buffer.from('x'));
    await put(id, 1, Buffer.from('y'));
    const res = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ totalChunks: 3 }));
    expect(res).toMatchObject({ status: 409, json: { ok: false, nextSeq: 2 } });
    expect(fs.existsSync(partialPath(id))).toBe(true);
  });

  it('allows one upload at a time until the open one goes idle', async () => {
    const first = await create();
    const busy = await request('POST', '/v1/recordings', JSON.stringify({ kind: 'mic' }));
    expect(busy).toMatchObject({ status: 409, json: { ok: false, error: 'busy', activeId: first } });
    clock += 11 * 60 * 1000;
    const second = await create({ kind: 'mic' });
    expect(second).not.toBe(first);
  });

  it('reports progress through status', async () => {
    const id = await create();
    expect((await request('GET', `/v1/recordings/${id}/status`)).json).toMatchObject({
      ok: true,
      id,
      state: 'uploading',
      nextSeq: 0,
      bytes: 0,
    });
    await put(id, 0, Buffer.alloc(10));
    await put(id, 1, Buffer.alloc(5));
    expect((await request('GET', `/v1/recordings/${id}/status`)).json).toMatchObject({ state: 'uploading', nextSeq: 2, bytes: 15 });
    await request('POST', `/v1/recordings/${id}/finish`, '{}');
    const done = await request('GET', `/v1/recordings/${id}/status`);
    expect(done.json).toMatchObject({ ok: true, state: 'finished', nextSeq: 2, bytes: 15 });
    expect(typeof done.json.path).toBe('string');
    expect(done.json.result).toMatchObject({ ok: true, id });
    expect((await request('GET', `/v1/recordings/${crypto.randomUUID()}/status`)).status).toBe(404);
  });

  it('DELETE removes the partial and only the partial', async () => {
    const id = await create();
    await put(id, 0, Buffer.from('abc'));
    expect(await request('DELETE', `/v1/recordings/${id}`)).toMatchObject({ status: 200, json: { ok: true } });
    expect(fs.existsSync(partialPath(id))).toBe(false);
    expect((await request('GET', `/v1/recordings/${id}/status`)).status).toBe(404);
    expect((await request('DELETE', `/v1/recordings/${id}`)).status).toBe(404);

    // A finished recording is never deleted through this route.
    const done = await create();
    await put(done, 0, Buffer.from('xyz'));
    const fin = await request('POST', `/v1/recordings/${done}/finish`, '{}');
    expect((await request('DELETE', `/v1/recordings/${done}`)).status).toBe(409);
    expect(fs.existsSync(String(fin.json.path))).toBe(true);
  });
});

describe('finalizer and mic handler', () => {
  it('passes the assembled file to the registered finalizer and returns its result', async () => {
    const calls: Array<{ filePath: string; bytes: Buffer; opts: Record<string, unknown> }> = [];
    setRecordingFinalizer(async (filePath, opts) => {
      calls.push({ filePath, bytes: fs.readFileSync(filePath), opts: { ...opts } });
      return { ok: true, mediaId: 'media-42', path: path.join(root, 'library', 'final.mp4') };
    });
    const id = await create({ kind: 'tab', title: 'Clip', url: 'https://example.com/v', mimeType: 'video/webm;codecs=vp9' });
    const a = crypto.randomBytes(300);
    const b = crypto.randomBytes(300);
    await put(id, 0, a);
    await put(id, 1, b);
    const fin = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ durationMs: 4000, transcribe: true }));
    expect(fin).toMatchObject({
      status: 200,
      json: { ok: true, id, mediaId: 'media-42', path: path.join(root, 'library', 'final.mp4'), finalized: true },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].filePath).toBe(fin.json.sourcePath);
    expect(calls[0].bytes.equals(Buffer.concat([a, b]))).toBe(true);
    expect(calls[0].opts).toMatchObject({
      title: 'Clip',
      url: 'https://example.com/v',
      durationMs: 4000,
      transcribe: true,
      mimeType: 'video/webm;codecs=vp9',
      source: 'extension-tab',
      recordingId: id,
    });
    // Idempotent finish does not finalize twice.
    await request('POST', `/v1/recordings/${id}/finish`, '{}');
    expect(calls).toHaveLength(1);
  });

  it('reports a failed finalize and retries it on the next finish', async () => {
    let attempts = 0;
    setRecordingFinalizer(async () => {
      attempts++;
      return attempts === 1 ? { ok: false, error: 'ffmpeg missing' } : { ok: true, mediaId: 'm1' };
    });
    const id = await create();
    await put(id, 0, Buffer.from('data'));
    const first = await request('POST', `/v1/recordings/${id}/finish`, '{}');
    expect(first).toMatchObject({ status: 500, json: { ok: false, error: 'ffmpeg missing' } });
    expect((await request('GET', `/v1/recordings/${id}/status`)).json).toMatchObject({ state: 'failed' });
    const second = await request('POST', `/v1/recordings/${id}/finish`, '{}');
    expect(second).toMatchObject({ status: 200, json: { ok: true, mediaId: 'm1' } });
  });

  it('routes a mic card recording to the mic handler, not the finalizer', async () => {
    const finalizer = vi.fn(async () => ({ ok: true }));
    setRecordingFinalizer(finalizer);
    const seen: Array<{ filePath: string; kind: string; purpose: string }> = [];
    setMicRecordingHandler(async (filePath, meta) => {
      seen.push({ filePath, kind: meta.kind, purpose: meta.purpose });
      return { ok: true, text: '猫がいる', term: '猫' };
    });
    const id = await create({ kind: 'mic', purpose: 'card', mimeType: 'audio/webm' });
    await put(id, 0, Buffer.from('opus'));
    const fin = await request('POST', `/v1/recordings/${id}/finish`, '{}');
    expect(fin).toMatchObject({ status: 200, json: { ok: true, id, text: '猫がいる', term: '猫' } });
    expect(seen).toEqual([{ filePath: fin.json.path, kind: 'mic', purpose: 'card' }]);
    expect(path.basename(String(fin.json.path))).toMatch(/^Gum mic recording .*\.webm$/);
    expect(finalizer).not.toHaveBeenCalled();
  });
});

describe('path safety', () => {
  it('rejects malformed ids and seqs without touching the disk', async () => {
    const bad = [
      '/v1/recordings/..%2F..%2Fetc/status',
      '/v1/recordings/%2e%2e/status',
      `/v1/recordings/${'A'.repeat(36)}/status`,
      `/v1/recordings/${crypto.randomUUID()}x/status`,
      '/v1/recordings/short/status',
    ];
    for (const route of bad) {
      const res = await request('GET', route);
      expect(res.status, route).toBe(404);
    }
    const id = await create();
    for (const seq of ['-1', 'abc', '1.5', '12345678', '%2e%2e']) {
      const res = await put(id, seq, Buffer.from('z'));
      // `%2e%2e` is normalised away by URL parsing, leaving a PUT on the session itself (405).
      expect([400, 404, 405], seq).toContain(res.status);
    }
    expect(fs.readdirSync(partialPath(id))).toEqual(['meta.json']);
    expect(fs.readdirSync(root).sort()).toEqual(['extension-partial']);
  });

  it('answers 404/405 for anything else under /v1/recordings', async () => {
    const id = await create();
    expect((await request('GET', '/v1/recordings')).status).toBe(405);
    expect((await request('GET', `/v1/recordings/${id}/nope`)).status).toBe(404);
    expect((await request('POST', `/v1/recordings/${id}/status`, '{}')).status).toBe(405);
    expect((await request('POST', `/v1/recordings/${id}/chunks/0`, 'x')).status).toBe(405);
  });
});

describe('cleanupStaleRecordingPartials', () => {
  it('removes partials idle for more than 24 h and nothing else', () => {
    const now = Date.UTC(2026, 9, 8, 12, 0, 0);
    const base = path.join(root, 'extension-partial');
    const mk = (id: string, touchedAt: number | null): string => {
      const dir = path.join(base, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '0.part'), 'x');
      if (touchedAt !== null) fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, touchedAt }));
      return dir;
    };
    const old = mk(crypto.randomUUID(), now - 25 * 3600 * 1000);
    const fresh = mk(crypto.randomUUID(), now - 3600 * 1000);
    const noMetaOld = mk(crypto.randomUUID(), null);
    const oldSec = (now - 30 * 3600 * 1000) / 1000;
    fs.utimesSync(noMetaOld, oldSec, oldSec);
    const notAnId = path.join(base, 'keep-me');
    fs.mkdirSync(notAnId);
    fs.utimesSync(notAnId, oldSec, oldSec);
    const recordings = path.join(root, 'recordings');
    fs.mkdirSync(recordings);
    fs.writeFileSync(path.join(recordings, 'done.webm'), 'x');
    fs.utimesSync(path.join(recordings, 'done.webm'), oldSec, oldSec);

    expect(cleanupStaleRecordingPartials(root, now)).toBe(2);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(noMetaOld)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(notAnId)).toBe(true);
    expect(fs.existsSync(path.join(recordings, 'done.webm'))).toBe(true);
    expect(cleanupStaleRecordingPartials(path.join(root, 'missing'), now)).toBe(0);
  });
});

describe('async finish (202 + poll)', () => {
  it('answers 202 at once, reports finishing, runs the finalizer once, then reports the result', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    setRecordingFinalizer(async (filePath) => {
      calls += 1;
      await gate;
      return { ok: true, mediaId: 'm-1', path: filePath };
    });
    const id = await create();
    expect((await put(id, 0, Buffer.from('abc'))).status).toBe(200);

    const fin = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ totalChunks: 1, async: true }));
    expect(fin.status).toBe(202);
    expect(fin.json).toMatchObject({ ok: true, id, state: 'finishing', pending: true });

    const during = await request('GET', `/v1/recordings/${id}/status`);
    expect(during.json).toMatchObject({ ok: true, state: 'finishing' });

    // A repeated async finish while converting never starts a second run.
    const again = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ async: true }));
    expect(again.status).toBe(202);

    release();
    await __recordingConsumersIdle();
    expect(calls).toBe(1);
    const done = await request('GET', `/v1/recordings/${id}/status`);
    expect(done.json).toMatchObject({ ok: true, state: 'finished', result: { ok: true, mediaId: 'm-1', finalized: true } });
  });

  it('still waits for the result without async (older extension builds)', async () => {
    setRecordingFinalizer(async (filePath) => ({ ok: true, mediaId: 'm-2', path: filePath }));
    const id = await create();
    await put(id, 0, Buffer.from('abc'));
    const fin = await request('POST', `/v1/recordings/${id}/finish`, JSON.stringify({ totalChunks: 1 }));
    expect(fin.status).toBe(200);
    expect(fin.json).toMatchObject({ ok: true, mediaId: 'm-2', finalized: true });
  });
});