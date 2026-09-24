// @vitest-environment node
/**
 * What a committed restore keeps, and what it waits for.
 *
 * - The dialog says the current data is "kept in the backups folder", but the
 *   renderer's localStorage/IndexedDB snapshot taken before the restore lived
 *   only in the renderer's memory. It is now written to
 *   pre-restore-<ts>/renderer.json, and the folder gets a manifest so choosing
 *   it in Restore… puts everything back.
 * - Stores that exist now but are not in the archive used to stay, leaving a
 *   mix of the backup and the present. They move aside with the rest.
 * - An async JSON write that was on its way to disk when the restore began
 *   could land after the swap. The commit freezes, then waits for it.
 * - Every other window is told to stop writing renderer data.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as Array<{ webContents: { send: (channel: string, payload: unknown) => void }; isDestroyed: () => boolean }>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => '', getVersion: () => '0.0.0-test' },
  BrowserWindow: { fromWebContents: () => undefined, getAllWindows: () => h.windows },
  dialog: {},
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
  session: {},
  shell: {},
}));
vi.mock('../errorLog', () => ({ logDiagnostic: () => undefined }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

import { commitPendingRestore, registerBackupIpc, setPendingRestoreForTests } from '../backup/backupService';
import { createBackupArchive, listZipEntries, stageArchive, stageDirectory } from '../backup/backupArchive';
import { __resetAtomicJsonForTests, readJsonSync, writeJsonAtomic } from '../atomicJson';

let root: string;
let userData: string;
let backups: string;

function put(base: string, rel: string, content: string | Buffer): void {
  const p = path.join(base, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
const get = (base: string, rel: string): string => fs.readFileSync(path.join(base, ...rel.split('/')), 'utf8');

const OLD_RENDERER = { app: 'jp-study-app', kind: 'renderer-snapshot', format: 1, createdAt: '2026-09-01T00:00:00.000Z', localStorage: { 'jp-os-theme': 'dark' }, indexedDb: {} };
const CURRENT_RENDERER = { app: 'jp-study-app', kind: 'renderer-snapshot', format: 1, createdAt: '2026-09-24T00:00:00.000Z', localStorage: { 'jp-os-theme': 'light', 'jp-flashcard-deck': '{"cards":[1,2,3]}' }, indexedDb: {} };

/** A backup made from `source`, staged for commit. */
async function stagedFrom(source: string, includeBookFiles: boolean): Promise<void> {
  const zip = path.join(root, 'backup.zip');
  await createBackupArchive({ userData: source, target: zip, includeBookFiles, trigger: 'manual', appVersion: '1', renderer: OLD_RENDERER });
  expect(listZipEntries(zip).length).toBeGreaterThan(0);
  const staged = await stageArchive(zip, path.join(backups, '.staging-t'));
  if (!staged.ok) throw new Error(staged.errors.join());
  setPendingRestoreForTests('t', staged.staged);
}

const deps = () => ({ userData, backupsDir: backups, appVersion: '2.0.0' });

beforeEach(() => {
  __resetAtomicJsonForTests();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-restore-'));
  userData = path.join(root, 'userData');
  backups = path.join(userData, 'backups');
  const source = path.join(root, 'source');
  put(source, 'library.json', '[{"id":"old"}]');
  put(source, 'config.json', '{"v":"old"}');
  put(source, 'library/book-1/book.epub', 'OLD-EPUB');
  put(userData, 'library.json', '[{"id":"current"}]');
  put(userData, 'config.json', '{"v":"current"}');
  put(userData, 'watch-library.json', '{"titles":["added after the backup"]}');
  put(userData, 'library/book-2/book.epub', 'CURRENT-EPUB');
  put(userData, 'mal-tokens.json', '{"access_token":"secret"}');
});

afterEach(() => {
  setPendingRestoreForTests('', null);
  __resetAtomicJsonForTests();
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function preRestoreDir(): string {
  const name = fs.readdirSync(backups).find((n) => n.startsWith('pre-restore-'));
  if (!name) throw new Error('no pre-restore folder');
  return path.join(backups, name);
}

describe('what a restore keeps', () => {
  it('writes the renderer data it replaced, and the folder restores everything back', async () => {
    await stagedFrom(path.join(root, 'source'), false);
    const result = await commitPendingRestore('t', { previousRenderer: CURRENT_RENDERER }, deps());
    expect(result.ok).toBe(true);
    expect(get(userData, 'library.json')).toBe('[{"id":"old"}]');

    const previous = preRestoreDir();
    expect(JSON.parse(get(previous, 'renderer.json'))).toEqual(CURRENT_RENDERER);
    expect(get(previous, 'userdata/library.json')).toBe('[{"id":"current"}]');
    const manifest = JSON.parse(get(previous, 'manifest.json'));
    expect(manifest.trigger).toBe('pre-restore');

    // Restore the pre-restore folder itself: back to how it was.
    const staged = await stageDirectory(previous, path.join(backups, '.staging-back'));
    if (!staged.ok) throw new Error(staged.errors.join());
    expect(staged.staged.renderer).toEqual(CURRENT_RENDERER);
    setPendingRestoreForTests('back', staged.staged);
    expect((await commitPendingRestore('back', { previousRenderer: OLD_RENDERER }, deps())).ok).toBe(true);
    expect(get(userData, 'library.json')).toBe('[{"id":"current"}]');
    expect(get(userData, 'config.json')).toBe('{"v":"current"}');
    expect(get(userData, 'watch-library.json')).toBe('{"titles":["added after the backup"]}');
  });

  it('moves current stores the archive does not contain aside, but leaves books and secrets when the archive has no books', async () => {
    await stagedFrom(path.join(root, 'source'), false);
    expect((await commitPendingRestore('t', { previousRenderer: CURRENT_RENDERER }, deps())).ok).toBe(true);
    const previous = preRestoreDir();
    // Before: this store stayed, a mix of the present and the backup.
    expect(fs.existsSync(path.join(userData, 'watch-library.json'))).toBe(false);
    expect(get(previous, 'userdata/watch-library.json')).toContain('added after the backup');
    expect(get(userData, 'library/book-2/book.epub')).toBe('CURRENT-EPUB');
    expect(get(userData, 'mal-tokens.json')).toContain('secret');
  });

  it('with book files in the archive, current books it does not contain move aside too', async () => {
    await stagedFrom(path.join(root, 'source'), true);
    expect((await commitPendingRestore('t', {}, deps())).ok).toBe(true);
    expect(get(userData, 'library/book-1/book.epub')).toBe('OLD-EPUB');
    expect(fs.existsSync(path.join(userData, 'library', 'book-2', 'book.epub'))).toBe(false);
    expect(get(preRestoreDir(), 'userdata/library/book-2/book.epub')).toBe('CURRENT-EPUB');
  });

  it('refuses a folder whose files do not match its manifest', async () => {
    await stagedFrom(path.join(root, 'source'), false);
    await commitPendingRestore('t', { previousRenderer: CURRENT_RENDERER }, deps());
    const previous = preRestoreDir();
    fs.rmSync(path.join(previous, 'userdata', 'config.json'));
    const staged = await stageDirectory(previous, path.join(backups, '.staging-x'));
    expect(staged.ok).toBe(false);
  });
});

describe('writes around the swap', () => {
  it('waits for an async write already on its way to disk, and it does not land on the restored file', async () => {
    await stagedFrom(path.join(root, 'source'), false);
    const target = path.join(userData, 'library.json');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const realOpen = fs.promises.open;
    vi.spyOn(fs.promises, 'open').mockImplementation((async (...args: Parameters<typeof fs.promises.open>) => {
      await gate; // the write is past its first freeze check, writing its temp file
      return realOpen(...args);
    }) as typeof fs.promises.open);
    const write = writeJsonAtomic(target, [{ id: 'stale in-memory copy' }]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const commit = commitPendingRestore('t', {}, deps());
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    expect((await commit).ok).toBe(true);
    await write;
    expect(readJsonSync(target, null)).toEqual([{ id: 'old' }]);
  });
});

describe('other windows', () => {
  it('are told to stop writing while a restore applies, and to resume when it ends', async () => {
    const sent: Array<{ win: number; payload: unknown }> = [];
    const sender = { send: () => undefined };
    h.windows = [
      { webContents: sender as never, isDestroyed: () => false },
      { webContents: { send: (_c: string, payload: unknown) => sent.push({ win: 1, payload }) }, isDestroyed: () => false },
      { webContents: { send: (_c: string, payload: unknown) => sent.push({ win: 2, payload }) }, isDestroyed: () => false },
    ];
    registerBackupIpc();
    await h.handlers.get('backup:restoreBegin')!({ sender });
    await h.handlers.get('backup:restoreEnd')!({ sender });
    expect(sent).toEqual([
      { win: 1, payload: { active: true } },
      { win: 2, payload: { active: true } },
      { win: 1, payload: { active: false } },
      { win: 2, payload: { active: false } },
    ]);
  });
});
