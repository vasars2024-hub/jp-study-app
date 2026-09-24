// @vitest-environment node
/**
 * tools/package-app.cjs used to delete out\ before every build, so a failed
 * build left the desktop shortcut (out\jp-study-app-win32-x64\jp-study-app.exe)
 * pointing at nothing. The swap now happens only after a successful build, the
 * final path never changes, and exactly one previous build is kept.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { swapBuild, removeStaleStaging, APP_DIR_NAME } = require('../../../tools/package-app.cjs') as {
  swapBuild: (staged: string, outDir: string, io?: typeof fs) => { ok: boolean; error?: string; previous?: string | null };
  removeStaleStaging: (outDir: string) => void;
  APP_DIR_NAME: string;
};

let out: string;
const exe = (dir: string) => path.join(dir, 'jp-study-app.exe');
function build(dir: string, marker: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(exe(dir), marker);
}

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-out-'));
});
afterEach(() => {
  fs.rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('package-app build swap', () => {
  it('puts the new build at the same path and keeps exactly one previous build', () => {
    const final = path.join(out, APP_DIR_NAME);
    build(final, 'v1');
    build(`${final}.previous`, 'v0');
    const staged = path.join(out, '.staging-1', APP_DIR_NAME);
    build(staged, 'v2');
    const r = swapBuild(staged, out);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(exe(final), 'utf8')).toBe('v2');
    expect(fs.readFileSync(exe(`${final}.previous`), 'utf8')).toBe('v1');
    expect(fs.readdirSync(out).filter((n) => n.startsWith(APP_DIR_NAME)).sort()).toEqual([APP_DIR_NAME, `${APP_DIR_NAME}.previous`]);
  });

  it('when the swap fails (Gum is running), the current build stays runnable', () => {
    const final = path.join(out, APP_DIR_NAME);
    build(final, 'v1');
    const staged = path.join(out, '.staging-2', APP_DIR_NAME);
    build(staged, 'v2');
    const io = {
      ...fs,
      renameSync: (from: fs.PathLike, to: fs.PathLike) => {
        if (String(from) === staged) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
        fs.renameSync(from, to);
      },
    } as typeof fs;
    const r = swapBuild(staged, out, io);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(exe(final), 'utf8')).toBe('v1');
  });

  it('clears staging left behind by an interrupted run', () => {
    build(path.join(out, '.staging-9', APP_DIR_NAME), 'x');
    build(path.join(out, APP_DIR_NAME), 'v1');
    removeStaleStaging(out);
    expect(fs.readdirSync(out)).toEqual([APP_DIR_NAME]);
  });
});
