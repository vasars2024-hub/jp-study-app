/**
 * The extension server's port resolution and its stopped-reason.
 *
 * Why this exists. `JP_DEBUG_PORT` / `JP_USER_DATA_DIR` (64c22632) give a second
 * dev instance its own debug bridge and its own profile, but the extension
 * server stayed on the shared 18765. Measured live on 2026-09-01: the second
 * instance lost the bind, reported `running: false` with NO reason, and still
 * advertised 18765 — a port the FIRST app owned. A driver reading that status
 * would have measured the wrong app on the wrong profile, and MINING gate 11 is
 * driven through exactly that status.
 *
 * So the two claims worth pinning are the two that were wrong:
 *   1. the reported port is the one this process actually listens on;
 *   2. a bind failure is NAMED, and named differently from a clean stop.
 *
 * Each is paired with the control that stops it being a constant — an unset
 * variable must change nothing, and a packaged app must ignore the variable
 * entirely, or the override becomes a way to move a shipped app off its port.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = path.join(os.tmpdir(), `jp-extport-${process.pid}`);
fs.mkdirSync(tmpRoot, { recursive: true });

// `extensionInstall.candidateSourceDirs` path.join()s it unconditionally, and
// outside Electron it is undefined — which throws before any assertion here runs.
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

const packaged = vi.hoisted(() => ({ value: false }));

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpRoot,
    getAppPath: () => tmpRoot,
    get isPackaged() {
      return packaged.value;
    },
  },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const ORIGINAL = process.env.JP_EXTENSION_PORT;

async function freshStatus(): Promise<{
  running: boolean;
  port: number;
  stoppedReasonKey?: string;
  stoppedDetail?: string;
}> {
  // The module caches `bridgeState`, and the override is read per call rather
  // than at import — but re-importing keeps each case independent of the order
  // the others ran in, which is how a stale port reading would hide.
  vi.resetModules();
  const mod = await import('../extensionServer');
  return mod.getExtensionBridgeStatus();
}

describe('extension server port resolution', () => {
  beforeEach(() => {
    packaged.value = false;
    delete process.env.JP_EXTENSION_PORT;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.JP_EXTENSION_PORT;
    else process.env.JP_EXTENSION_PORT = ORIGINAL;
    packaged.value = false;
  });

  it('reports the default port when the override is unset', async () => {
    const { EXTENSION_PORT } = await import('../../shared/inboxMeta');
    expect((await freshStatus()).port).toBe(EXTENSION_PORT);
  });

  it('reports the overridden port, so a second dev instance is not read as the first', async () => {
    process.env.JP_EXTENSION_PORT = '18865';
    expect((await freshStatus()).port).toBe(18865);
  });

  it('ignores the override in a packaged app', async () => {
    // The whole point of the !isPackaged guard: a stray environment variable
    // must not be able to move a shipped app off the port its extension pairs on.
    process.env.JP_EXTENSION_PORT = '18865';
    packaged.value = true;
    const { EXTENSION_PORT } = await import('../../shared/inboxMeta');
    expect((await freshStatus()).port).toBe(EXTENSION_PORT);
  });

  it.each([
    ['not a number', 'abcd'],
    ['out of range', '70000'],
    ['zero', '0'],
    ['empty', ''],
  ])('falls back to the default when the override is %s', async (_label, raw) => {
    process.env.JP_EXTENSION_PORT = raw;
    const { EXTENSION_PORT } = await import('../../shared/inboxMeta');
    expect((await freshStatus()).port).toBe(EXTENSION_PORT);
  });

  it('carries no stopped reason before any listen was attempted', async () => {
    // The control for the case below: "stopped with a reason" must not be the
    // only thing this status can ever say, or naming the reason proves nothing.
    const status = await freshStatus();
    expect(status.running).toBe(false);
    expect(status.stoppedReasonKey).toBeUndefined();
  });

  it('names a port collision, and names it differently from any other failure', async () => {
    vi.resetModules();
    const mod = await import('../extensionServer');
    const http = await import('node:http');

    // A real occupied port, not a simulated one — EADDRINUSE is the code the
    // handler branches on and it has to come from the OS to be worth pinning.
    const squatter = http.createServer(() => undefined);
    await new Promise<void>((resolve) => squatter.listen(0, '127.0.0.1', resolve));
    const taken = (squatter.address() as { port: number }).port;

    try {
      process.env.JP_EXTENSION_PORT = String(taken);
      mod.startExtensionServer();
      // The error is emitted asynchronously, after listen() returns.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const status = mod.getExtensionBridgeStatus();
      expect(status.running).toBe(false);
      expect(status.stoppedReasonKey).toBe('portInUse');
      // And it reports the port it actually tried, not the profile's default —
      // reporting 18765 here is the original defect in miniature.
      expect(status.port).toBe(taken);
    } finally {
      mod.stopExtensionServer();
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
    // 60s on the two cases that bind a REAL socket and re-import `extensionServer`
    // through Vite's transform. Alone they take ~220ms; under a full `vitest run` with
    // eight workers contending they exceeded the 20s default and were reported as a
    // product regression on 2026-09-02. The cost is external — a real listen and a real
    // module transform — so unlike `mediaSurfaceImportGraph` there is no repeated work
    // to remove. Every assertion above still fails on the assertion, not the clock.
  }, 60_000);

  it('carries no reason once a listen succeeds', async () => {
    vi.resetModules();
    const mod = await import('../extensionServer');
    const http = await import('node:http');

    // Borrow a free port from the OS and hand it straight back, so this never
    // touches 18765 — a test that binds the real port would take it away from
    // the running app for as long as it held it.
    const scout = http.createServer(() => undefined);
    await new Promise<void>((resolve) => scout.listen(0, '127.0.0.1', resolve));
    const free = (scout.address() as { port: number }).port;
    await new Promise<void>((resolve) => scout.close(() => resolve()));

    try {
      process.env.JP_EXTENSION_PORT = String(free);
      mod.startExtensionServer();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const status = mod.getExtensionBridgeStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(free);
      expect(status.stoppedReasonKey).toBeUndefined();
    } finally {
      mod.stopExtensionServer();
    }
    // See the note on the collision case above — same cause, same reasoning.
  }, 60_000);
});
