// @vitest-environment node
/**
 * Resilience audit #14: every sidecar failure used to be an English/process
 * diagnostic in `status.error`, rendered verbatim beside a translated heading.
 * Each now carries a typed `errorCode` the workspace translates (with the raw
 * text kept only for an optional details line).
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  root: '',
  children: [] as Array<EventEmitter & { pid?: number; exitCode: number | null; stdout: EventEmitter; stderr: EventEmitter }>,
  spawnError: null as Error | null,
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.root, isPackaged: false, getAppPath: () => h.root, on: () => undefined, once: () => undefined },
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: () => ({ status: 0 }),
    spawn: () => {
      const child = Object.assign(new EventEmitter(), {
        pid: h.spawnError ? undefined : 7000 + h.children.length,
        exitCode: null as number | null,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => true,
      });
      const failure = h.spawnError;
      if (failure) process.nextTick(() => child.emit('error', failure));
      h.children.push(child);
      return child;
    },
  };
});

h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'seanime-sup-'));
process.env.SEANIME_DATADIR = path.join(h.root, 'datadir');

const { startSeanime, stopSeanime, getSeanimeStatus } = await import('../seanime/supervisor');
const { seanimeFailureKey } = await import('../../shared/seanime');

const fetchMock = vi.fn();

beforeEach(() => {
  h.children.length = 0;
  h.spawnError = null;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  stopSeanime();
  vi.unstubAllGlobals();
  delete process.env.SEANIME_EXE;
});

describe('sidecar failures are typed', () => {
  it('a missing executable is missing-exe, with a translatable key', async () => {
    process.env.SEANIME_EXE = path.join(h.root, 'nope', 'seanime.exe');
    const status = await startSeanime();
    expect(status).toMatchObject({ kind: 'failed', errorCode: 'missing-exe' });
    expect(seanimeFailureKey(status.errorCode)).toBe('mediaWorkspace.failure.missing-exe');
  });

  it('a spawn error stays spawn-failed, not reworded as unhealthy', async () => {
    const exe = path.join(h.root, 'seanime.exe');
    fs.writeFileSync(exe, 'MZ');
    process.env.SEANIME_EXE = exe;
    h.spawnError = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const status = await startSeanime();
    expect(status).toMatchObject({ kind: 'failed', errorCode: 'spawn-failed' });
  });

  it('a crash after it was ready is crashed', async () => {
    const exe = path.join(h.root, 'seanime.exe');
    fs.writeFileSync(exe, 'MZ');
    process.env.SEANIME_EXE = exe;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { version: '3.0.0' } }) });
    const ready = await startSeanime();
    expect(ready).toMatchObject({ kind: 'ready', errorCode: null });
    h.children[0].exitCode = 1;
    h.children[0].emit('exit', 1);
    expect(getSeanimeStatus()).toMatchObject({ kind: 'offline', errorCode: 'crashed' });
  });
});
