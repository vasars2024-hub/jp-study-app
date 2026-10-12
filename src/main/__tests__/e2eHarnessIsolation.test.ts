// @vitest-environment node
/**
 * The e2e harness's run isolation (tools/e2e/isolation.cjs): two `npm run e2e` runs on one
 * machine used to collide — fixed ports (39391 / 18791), one shared tools/e2e/out, and one
 * snapshot that a building run deleted under a `--reuse-build` run's app.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(__filename);
const iso = require('../../../tools/e2e/isolation.cjs') as {
  resolvePorts(argv: string[], env: Record<string, string | undefined>, pick?: () => Promise<number>): Promise<{ bridge: number; extension: number; vite: number }>;
  freePort(): Promise<number>;
  makeRunId(now?: Date, pid?: number): string;
  withFileLock<T>(file: string, fn: () => Promise<T> | T, opts?: { timeoutMs?: number; pollMs?: number }): Promise<T>;
  prepareBuild(input: { outRoot: string; reuse: boolean; requestedAt?: number; runBuild: (appDir: string, id: string) => Promise<void>; log?: (s: string) => void }): Promise<{ id: string; appDir: string; reused: boolean }>;
  acquireSnapshot(appDir: string, runId: string, link: (dir: string) => void): Promise<void>;
  releaseSnapshot(appDir: string, runId: string, unlink: (dir: string) => void): Promise<boolean>;
  publishLatest(outRoot: string, runOut: string, runId: string): void;
  pruneRunDirs(outRoot: string, opts?: { keep?: number; exceptRunId?: string }): void;
  writeJsonAtomic(file: string, value: unknown): void;
};

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-iso-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const fakeBuild = (calls: string[]) => async (appDir: string, id: string): Promise<void> => {
  calls.push(id);
  fs.mkdirSync(path.join(appDir, '.vite', 'build'), { recursive: true });
  fs.writeFileSync(path.join(appDir, '.vite', 'build', 'main.js'), '');
  fs.writeFileSync(path.join(appDir, 'build-info.json'), '{}');
  await new Promise((r) => setTimeout(r, 30));
};

describe('ports', () => {
  it('are free ephemeral ports by default — never the old fixed ones — and distinct', async () => {
    const ports = await iso.resolvePorts([], {});
    const values = Object.values(ports);
    expect(new Set(values).size).toBe(3);
    expect(values).not.toContain(39391);
    expect(values).not.toContain(18791);
    const again = await iso.resolvePorts([], {});
    expect(again.bridge).not.toBe(ports.bridge);
  });

  it('honour a flag over the environment, per port', async () => {
    const ports = await iso.resolvePorts(['--bridge-port=40001'], { GUM_E2E_BRIDGE_PORT: '40002', GUM_E2E_EXTENSION_PORT: '40003' });
    expect(ports.bridge).toBe(40001);
    expect(ports.extension).toBe(40003);
    expect([40001, 40003]).not.toContain(ports.vite);
  });

  it('refuse the same port twice', async () => {
    await expect(iso.resolvePorts(['--bridge-port=40010', '--extension-port=40010'], {})).rejects.toThrow(/already used/);
  });
});

describe('run ids', () => {
  it('differ for two runs started in the same millisecond', () => {
    const now = new Date('2026-10-11T10:00:00.000Z');
    expect(iso.makeRunId(now, 100)).not.toBe(iso.makeRunId(now, 101));
    expect(iso.makeRunId(now, 100)).toMatch(/^2026-10-11T/);
  });
});

describe('the build lock', () => {
  it('serializes holders', async () => {
    const lock = path.join(root, 'x.lock');
    const order: string[] = [];
    const hold = (name: string) => iso.withFileLock(lock, async () => {
      order.push(`${name}+`);
      await new Promise((r) => setTimeout(r, 40));
      order.push(`${name}-`);
    }, { pollMs: 5 });
    await Promise.all([hold('a'), hold('b')]);
    // Never interleaved: one holder finishes before the other starts.
    expect(['a+,a-,b+,b-', 'b+,b-,a+,a-']).toContain(order.join(','));
  });

  it('takes over a lock whose owner is gone', async () => {
    const lock = path.join(root, 'stale.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: 999_999_999, at: 0 }));
    await expect(iso.withFileLock(lock, () => 'ran', { timeoutMs: 2000, pollMs: 5 })).resolves.toBe('ran');
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe('snapshot builds', () => {
  it('each build gets its own directory; --reuse-build takes the newest complete one', async () => {
    const calls: string[] = [];
    const first = await iso.prepareBuild({ outRoot: root, reuse: false, runBuild: fakeBuild(calls) });
    const second = await iso.prepareBuild({ outRoot: root, reuse: false, runBuild: fakeBuild(calls) });
    expect(first.appDir).not.toBe(second.appDir);
    expect(fs.existsSync(path.join(first.appDir, '.vite', 'build', 'main.js'))).toBe(true);
    const reused = await iso.prepareBuild({ outRoot: root, reuse: true, runBuild: fakeBuild(calls) });
    expect(reused).toMatchObject({ reused: true, appDir: second.appDir });
    expect(calls).toHaveLength(2);
  });

  it('two runs asking at once build once when the second asked before the first started', async () => {
    const calls: string[] = [];
    const requestedAt = Date.now() - 1000;
    const [a, b] = await Promise.all([
      iso.prepareBuild({ outRoot: root, reuse: false, requestedAt, runBuild: fakeBuild(calls) }),
      iso.prepareBuild({ outRoot: root, reuse: false, requestedAt, runBuild: fakeBuild(calls) }),
    ]);
    expect(calls).toHaveLength(1);
    expect(a.appDir).toBe(b.appDir);
  });

  it('a snapshot\'s junctions stay until the last run using it releases it', async () => {
    const appDir = path.join(root, 'builds', 'b1', 'app');
    fs.mkdirSync(appDir, { recursive: true });
    const links: string[] = [];
    await iso.acquireSnapshot(appDir, 'run-a', () => links.push('link'));
    await iso.acquireSnapshot(appDir, 'run-b', () => links.push('link'));
    expect(await iso.releaseSnapshot(appDir, 'run-a', () => links.push('unlink'))).toBe(false);
    expect(links).not.toContain('unlink');
    expect(await iso.releaseSnapshot(appDir, 'run-b', () => links.push('unlink'))).toBe(true);
    expect(links.filter((l) => l === 'unlink')).toHaveLength(1);
  });
});

describe('run output', () => {
  it('publishes the finished report as the latest and prunes only old, finished runs', () => {
    const runOut = path.join(root, '2026-10-11T10-00-00-000Z-p1');
    fs.mkdirSync(runOut, { recursive: true });
    fs.writeFileSync(path.join(runOut, 'report.md'), '# report');
    iso.publishLatest(root, runOut, '2026-10-11T10-00-00-000Z-p1');
    expect(fs.readFileSync(path.join(root, 'report.md'), 'utf8')).toBe('# report');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'))).toMatchObject({ runId: '2026-10-11T10-00-00-000Z-p1' });

    const live = path.join(root, '2026-10-10T00-00-00-000Z-p2');
    const dead = path.join(root, '2026-10-09T00-00-00-000Z-p3');
    iso.writeJsonAtomic(path.join(live, 'run.json'), { pid: process.pid });
    iso.writeJsonAtomic(path.join(dead, 'run.json'), { pid: 999_999_999, finishedAt: 'x' });
    iso.pruneRunDirs(root, { keep: 1 });
    expect(fs.existsSync(dead)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(runOut)).toBe(true);
  });
});
