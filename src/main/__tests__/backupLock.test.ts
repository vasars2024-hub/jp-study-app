// @vitest-environment node
/**
 * The backup lock and the save dialog.
 *
 * "Back up now" took main's backup lock before it showed the save dialog, so a
 * dialog left open held the lock for as long as it stayed up. The automatic
 * backup — once per launch, a few seconds after boot — found the lock taken,
 * answered `busy`, and was never tried again. The lock now covers only the
 * archive, which is the part that writes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  userData: '',
  dialog: null as null | Promise<{ canceled: boolean; filePath?: string }>,
  archive: [] as Array<{ trigger: string; target: string }>,
  archiveGate: null as null | Promise<void>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, getVersion: () => '0.0.0-test' },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: () => h.dialog },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
  session: {},
  shell: {},
}));
vi.mock('../backup/backupArchive', () => ({
  autoBackupDue: () => true,
  autoBackupName: () => 'auto.zip',
  BackupTooLargeError: class extends Error {},
  commitStaged: vi.fn(),
  createBackupArchive: async (opts: { trigger: string; target: string }) => {
    h.archive.push({ trigger: opts.trigger, target: opts.target });
    if (opts.trigger === 'manual' && h.archiveGate) await h.archiveGate;
    return { path: opts.target, bytes: 1, manifest: {} };
  },
  inventoryUserData: () => ({ storeBytes: 0, libraryJsonBytes: 0 }),
  listAutoBackups: () => [],
  pruneAutoBackups: () => [],
  stageArchive: vi.fn(),
}));
vi.mock('../atomicJson', () => ({
  flushAllJsonWriters: () => undefined,
  freezeAtomicWrites: () => undefined,
  thawAtomicWrites: () => undefined,
  writeJsonAtomicSync: () => undefined,
}));
vi.mock('../errorLog', () => ({ logDiagnostic: () => undefined }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

import { registerBackupIpc } from '../backup/backupService';

const event = { sender: {}, senderFrame: { origin: 'app://bundle' } };
const call = (channel: string, args: unknown = {}) => h.handlers.get(channel)!(event, args) as Promise<unknown>;

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-backup-lock-'));
registerBackupIpc();

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

beforeEach(() => {
  h.archive.length = 0;
  h.archiveGate = null;
});

describe('backup lock', () => {
  it('runs the automatic backup while the manual save dialog is still open', async () => {
    const pick = deferred<{ canceled: boolean; filePath?: string }>();
    h.dialog = pick.promise;
    const manual = call('backup:create', { includeBookFiles: false });

    const auto = await call('backup:createAuto', {});
    expect(auto).toMatchObject({ ok: true });
    expect(h.archive.map((a) => a.trigger)).toEqual(['auto']);

    pick.resolve({ canceled: false, filePath: path.join(h.userData, 'manual.zip') });
    expect(await manual).toMatchObject({ ok: true });
    expect(h.archive.map((a) => a.trigger)).toEqual(['auto', 'manual']);
  });

  it('still refuses an automatic backup while a manual archive is being written', async () => {
    const gate = deferred<void>();
    h.archiveGate = gate.promise;
    h.dialog = Promise.resolve({ canceled: false, filePath: path.join(h.userData, 'manual.zip') });
    const manual = call('backup:create', {});
    // Let the dialog resolve and the archive start.
    await new Promise((r) => setTimeout(r, 0));
    expect(await call('backup:createAuto', {})).toEqual({ ok: false, skipped: 'busy' });
    gate.resolve();
    expect(await manual).toMatchObject({ ok: true });
  });

  it('holds nothing when the dialog is cancelled', async () => {
    h.dialog = Promise.resolve({ canceled: true });
    expect(await call('backup:create', {})).toEqual({ ok: false, cancelled: true });
    expect(await call('backup:createAuto', {})).toMatchObject({ ok: true });
  });
});
