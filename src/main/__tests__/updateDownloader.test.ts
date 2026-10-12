// @vitest-environment node
/**
 * Gum's own update download (main/updateDownloader.ts) against a real local HTTP
 * server: RELEASES parsing and Squirrel's package choice mirrored, byte progress,
 * a connection dropped mid-file resumed with a Range request, a user's cancel
 * resumed later from the bytes on disk, a server that ignores Range, a SHA1 that
 * does not match (thrown away, retried once clean, then refused), a 404, a
 * RELEASES it does not handle, and the free-space check. Nothing reaches GitHub.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  formatSquirrelReleases,
  latestFullVersion,
  parseSquirrelReleases,
  planSquirrelDownload,
  squirrelVersionOf,
  startUpdateDownload,
  clearStaging,
  type UpdateDownloadProgress,
} from '../updateDownloader';

const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex').toUpperCase();
const entry = (name: string, size: number, hash = 'A'.repeat(40)) => `${hash} ${name} ${size}`;

describe('RELEASES and the package choice', () => {
  it('parses Squirrel lines, comments and a BOM; versions come from the file name', () => {
    const text = `﻿${entry('gum-1.0.1-full.nupkg', 100)}\r\n# a comment\n${entry('gum-1.0.2-delta.nupkg', 10)}\n${entry('gum-1.1.0-beta1-full.nupkg', 120)}\n`;
    const parsed = parseSquirrelReleases(text)!;
    expect(parsed.map((e) => [e.version, e.isDelta, e.size])).toEqual([
      ['1.0.1', false, 100],
      ['1.0.2', true, 10],
      ['1.1.0-beta1', false, 120],
    ]);
    expect(latestFullVersion(parsed)).toBe('1.1.0-beta1');
  });

  it('refuses what it does not fetch itself: URLs, paths, queries, junk', () => {
    expect(parseSquirrelReleases(entry('https://evil.example/gum-1.0.2-full.nupkg', 1))).toBeNull();
    expect(parseSquirrelReleases(entry('..\\gum-1.0.2-full.nupkg', 1))).toBeNull();
    expect(parseSquirrelReleases(entry('gum-1.0.2-full.nupkg?x=1', 1))).toBeNull();
    expect(parseSquirrelReleases('not a releases file')).toBeNull();
    expect(parseSquirrelReleases(entry('gum-1.0.2-full.nupkg', 0))).toBeNull();
  });

  it('mirrors Squirrel: deltas when together smaller than the full package, else the full one', () => {
    const remote = parseSquirrelReleases([
      entry('gum-1.0.0-full.nupkg', 1000),
      entry('gum-1.0.1-delta.nupkg', 50),
      entry('gum-1.0.1-full.nupkg', 1000),
      entry('gum-1.0.2-delta.nupkg', 60),
      entry('gum-1.0.2-full.nupkg', 1000),
    ].join('\n'))!;
    const fromOld = planSquirrelDownload(remote, '1.0.0')!;
    expect(fromOld.deltas).toBe(true);
    expect(fromOld.files.map((f) => f.filename)).toEqual(['gum-1.0.1-delta.nupkg', 'gum-1.0.2-delta.nupkg']);
    // The staging RELEASES must still name a full package, or Update.exe throws.
    expect(fromOld.manifest.some((f) => !f.isDelta && f.version === '1.0.2')).toBe(true);
    expect(fromOld.totalBytes).toBe(110);
    expect(planSquirrelDownload(remote, null)!.files.map((f) => f.filename)).toEqual(['gum-1.0.2-full.nupkg']);
    expect(planSquirrelDownload(remote, '1.0.0', true)!.deltas).toBe(false);
    expect(planSquirrelDownload(remote, '1.0.2')).toBeNull();
    const fat = parseSquirrelReleases([entry('gum-1.0.2-delta.nupkg', 2000), entry('gum-1.0.2-full.nupkg', 1000)].join('\n'))!;
    expect(planSquirrelDownload(fat, '1.0.1')!.deltas).toBe(false);
    expect(formatSquirrelReleases(fromOld.manifest).split('\r\n')).toHaveLength(3);
  });

  it("spells a release version the way Squirrel does", () => {
    expect(squirrelVersionOf('v1.1.0-beta.1')).toBe('1.1.0-beta1');
    expect(squirrelVersionOf('1.0.2')).toBe('1.0.2');
    expect(squirrelVersionOf('1.0.2+build.7')).toBe('1.0.2');
  });
});

// ---- a real server ---------------------------------------------------------

const PKG = Buffer.alloc(300 * 1024);
for (let i = 0; i < PKG.length; i++) PKG[i] = (i * 31 + 7) & 0xff;
const PKG_NAME = 'gum-1.0.3-full.nupkg';

interface ServerMode {
  releases?: string;
  releasesStatus?: number;
  /** Cut the first N whole-file responses after this many bytes. */
  dropAfter?: number;
  drops?: number;
  /** Answer a Range request with the whole file (200). */
  ignoreRange?: boolean;
  /** Serve these bytes instead of PKG (a corrupted mirror). */
  body?: Buffer;
  /** Serve the corrupted body this many times, then the right one. */
  corruptTimes?: number;
  chunk?: number;
  chunkMs?: number;
}

let server: http.Server;
let base = '';
let mode: ServerMode = {};
let requests: Array<{ path: string; range: string | null; status: number }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const range = typeof req.headers.range === 'string' ? req.headers.range : null;
    if (url.endsWith('/RELEASES')) {
      const status = mode.releasesStatus ?? 200;
      requests.push({ path: 'RELEASES', range, status });
      res.writeHead(status, { 'content-type': 'text/plain' });
      res.end(status === 200 ? (mode.releases ?? entry(PKG_NAME, PKG.length, sha1(PKG))) : 'nope');
      return;
    }
    if (!url.endsWith(`/${PKG_NAME}`)) {
      requests.push({ path: url, range, status: 404 });
      res.writeHead(404).end();
      return;
    }
    let body = PKG;
    if (mode.body && (mode.corruptTimes ?? Infinity) > 0) {
      body = mode.body;
      if (mode.corruptTimes !== undefined) mode.corruptTimes -= 1;
    }
    const m = range && !mode.ignoreRange ? /^bytes=(\d+)-$/.exec(range) : null;
    const start = m ? Number(m[1]) : 0;
    if (start >= body.length) {
      requests.push({ path: PKG_NAME, range, status: 416 });
      res.writeHead(416).end();
      return;
    }
    const status = m ? 206 : 200;
    const cut = !m && (mode.drops ?? 0) > 0;
    if (cut) mode.drops! -= 1;
    requests.push({ path: PKG_NAME, range, status });
    res.writeHead(status, { 'content-length': String(body.length - start), 'accept-ranges': 'bytes' });
    const chunk = mode.chunk ?? 32 * 1024;
    let at = start;
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      if (res.destroyed) return clearInterval(timer);
      if (cut && at - start >= (mode.dropAfter ?? 0)) {
        clearInterval(timer);
        res.destroy();
        return;
      }
      const end = Math.min(body.length, at + chunk);
      res.write(body.subarray(at, end));
      at = end;
      if (at >= body.length) {
        clearInterval(timer);
        res.end();
      }
    }, mode.chunkMs ?? 1);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/download/v1.0.3`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const dirs: string[] = [];
function staging(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-upd-test-'));
  dirs.push(dir);
  return path.join(dir, 'gum-staged');
}
afterEach(() => {
  mode = {};
  requests = [];
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function run(stagingDir: string, extra: Partial<Parameters<typeof startUpdateDownload>[0]> = {}) {
  const progress: UpdateDownloadProgress[] = [];
  const job = startUpdateDownload({
    baseUrl: base,
    stagingDir,
    localVersion: '1.0.2',
    currentVersion: '1.0.2',
    retryDelaysMs: [5, 5, 5],
    freeBytes: async () => null,
    onProgress: (p) => progress.push(p),
    ...extra,
  });
  return { job, progress };
}

describe('download, verify, stage', () => {
  it('reports real byte progress up to the total, verifies, and writes the staging RELEASES', async () => {
    const dir = staging();
    const { job, progress } = run(dir);
    const r = await job.done;
    expect(r).toMatchObject({ ok: true, version: '1.0.3', deltas: false, bytes: PKG.length, stagingDir: dir });
    const pkg = progress.filter((p) => p.phase === 'package');
    expect(pkg.length).toBeGreaterThan(3);
    expect(pkg.every((p) => p.total === PKG.length)).toBe(true);
    // Monotonic, and it ends at the whole file.
    for (let i = 1; i < pkg.length; i++) expect(pkg[i]!.received).toBeGreaterThanOrEqual(pkg[i - 1]!.received);
    expect(pkg[pkg.length - 1]!.received).toBe(PKG.length);
    expect(progress.some((p) => p.phase === 'verifying')).toBe(true);
    expect(sha1(fs.readFileSync(path.join(dir, PKG_NAME)))).toBe(sha1(PKG));
    expect(fs.readFileSync(path.join(dir, 'RELEASES'), 'utf8')).toBe(entry(PKG_NAME, PKG.length, sha1(PKG)));
    expect(fs.existsSync(path.join(dir, `${PKG_NAME}.partial`))).toBe(false);
  });

  it('a connection dropped part-way is resumed with a Range request, not started over', async () => {
    mode = { drops: 1, dropAfter: 100 * 1024 };
    const { job } = run(staging());
    const r = await job.done;
    expect(r.ok).toBe(true);
    const pkgReqs = requests.filter((q) => q.path === PKG_NAME);
    expect(pkgReqs[0]).toMatchObject({ range: null, status: 200 });
    expect(pkgReqs[1]!.status).toBe(206);
    expect(Number(/bytes=(\d+)-/.exec(pkgReqs[1]!.range ?? '')?.[1])).toBeGreaterThanOrEqual(100 * 1024);
  });

  it('cancel keeps the bytes; a new job resumes from them and finishes', async () => {
    mode = { chunk: 8 * 1024, chunkMs: 5 };
    const dir = staging();
    const first = run(dir);
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (first.progress.some((p) => p.phase === 'package' && p.received > 40 * 1024)) {
          clearInterval(poll);
          resolve();
        }
      }, 2);
    });
    first.job.cancel();
    const cancelled = await first.job.done;
    expect(cancelled).toMatchObject({ ok: false, code: 'canceled', total: PKG.length });
    expect(cancelled.ok ? 0 : cancelled.received).toBeGreaterThan(40 * 1024);
    const kept = fs.statSync(path.join(dir, `${PKG_NAME}.partial`)).size;
    expect(kept).toBeGreaterThan(0);

    mode = {};
    requests = [];
    const second = run(dir);
    // The resumed job counts the kept bytes from its first report.
    const r = await second.job.done;
    expect(r.ok).toBe(true);
    expect(requests.find((q) => q.path === PKG_NAME)).toMatchObject({ range: `bytes=${kept}-`, status: 206 });
    expect(second.progress.find((p) => p.phase === 'package')!.received).toBe(kept);
    expect(sha1(fs.readFileSync(path.join(dir, PKG_NAME)))).toBe(sha1(PKG));
  });

  it('a server that ignores Range sends the whole file again: the partial is rewritten, not appended', async () => {
    const dir = staging();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${PKG_NAME}.partial`), PKG.subarray(0, 50_000));
    mode = { ignoreRange: true };
    const r = await run(dir).job.done;
    expect(r.ok).toBe(true);
    expect(sha1(fs.readFileSync(path.join(dir, PKG_NAME)))).toBe(sha1(PKG));
  });

  it('a wrong SHA1 is thrown away and fetched again clean once; twice is refused as checksum', async () => {
    const bad = Buffer.from(PKG);
    bad[1000] ^= 0xff;
    mode = { body: bad, corruptTimes: 1 };
    const dir = staging();
    expect((await run(dir).job.done).ok).toBe(true);

    mode = { body: bad };
    const dir2 = staging();
    const r = await run(dir2).job.done;
    expect(r).toMatchObject({ ok: false, code: 'checksum' });
    expect(fs.existsSync(path.join(dir2, PKG_NAME))).toBe(false);
    expect(fs.existsSync(path.join(dir2, `${PKG_NAME}.partial`))).toBe(false);
  });

  it('a release without RELEASES is no-feed; one it cannot handle is unsupported; not newer is no-feed', async () => {
    mode = { releasesStatus: 404 };
    expect(await run(staging()).job.done).toMatchObject({ ok: false, code: 'no-feed' });
    mode = { releases: entry('https://elsewhere.example/gum-1.0.3-full.nupkg', 10) };
    expect(await run(staging()).job.done).toMatchObject({ ok: false, code: 'unsupported' });
    mode = {};
    expect(await run(staging(), { localVersion: '1.0.3', currentVersion: '1.0.3' }).job.done).toMatchObject({ ok: false, code: 'no-feed' });
  });

  it('a delta the release does not carry (404) falls back to the full package, as Update.exe would', async () => {
    mode = {
      releases: [entry('gum-1.0.3-delta.nupkg', 1000, 'C'.repeat(40)), entry(PKG_NAME, PKG.length, sha1(PKG))].join('\n'),
    };
    const dir = staging();
    const r = await run(dir).job.done;
    expect(r).toMatchObject({ ok: true, deltas: false, bytes: PKG.length });
    expect(requests.map((q) => q.path).filter((p) => p !== 'RELEASES')).toEqual(['/download/v1.0.3/gum-1.0.3-delta.nupkg', PKG_NAME]);
    // Update.exe re-plans from this RELEASES: only the full package, so it cannot pick the missing delta.
    expect(fs.readFileSync(path.join(dir, 'RELEASES'), 'utf8')).toBe(entry(PKG_NAME, PKG.length, sha1(PKG)));
  });

  it('offline: retries run out and it says network, keeping what it had', async () => {
    const r = await startUpdateDownload({
      baseUrl: 'http://127.0.0.1:9/nothing-listens-here',
      stagingDir: staging(),
      localVersion: '1.0.2',
      currentVersion: '1.0.2',
      retryDelaysMs: [1, 1],
      freeBytes: async () => null,
    }).done;
    expect(r).toMatchObject({ ok: false, code: 'network' });
  });

  it('refuses to start without room for the package and Squirrel\'s copy of it', async () => {
    const r = await run(staging(), { freeBytes: async () => PKG.length }).job.done;
    expect(r).toMatchObject({ ok: false, code: 'disk' });
    expect(requests.some((q) => q.path === PKG_NAME)).toBe(false);
  });

  it('a package already staged and intact is not downloaded again; stale files are cleared', async () => {
    const dir = staging();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, PKG_NAME), PKG);
    fs.writeFileSync(path.join(dir, 'gum-0.9.0-full.nupkg.partial'), 'old');
    const r = await run(dir).job.done;
    expect(r.ok).toBe(true);
    expect(requests.some((q) => q.path === PKG_NAME)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'gum-0.9.0-full.nupkg.partial'))).toBe(false);
    clearStaging(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
