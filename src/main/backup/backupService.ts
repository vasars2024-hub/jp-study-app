/**
 * Backup & restore — the main-process side (audit robust #1).
 *
 * The archive format and the all-or-nothing swap live in `backupArchive.ts`;
 * this file owns dialogs, the automatic-backup folder, and the restore
 * handshake with the renderer, whose localStorage/IndexedDB only the renderer
 * can read or write:
 *
 *   backup:create        renderer snapshot in → save dialog → archive
 *   backup:createAuto    once a day, no dialog, into userData/backups (last 7 kept)
 *   backup:restoreChoose open dialog → stage + validate → staged token (+ the
 *                        renderer snapshot for the renderer to apply)
 *   backup:restoreCommit swap the staged files in, or roll everything back
 *   backup:relaunch      flush DOM storage and restart on the restored data
 *
 * Automatic backups leave book files out: seven copies of a multi-GB library
 * on a nearly full disk would do more harm than good, and the books are the
 * user's own files. "Back up now" includes them by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron';
import {
  autoBackupDue,
  autoBackupName,
  BackupTooLargeError,
  commitStaged,
  createBackupArchive,
  inventoryUserData,
  listAutoBackups,
  pruneAutoBackups,
  stageArchive,
  type BackupManifest,
  type StagedRestore,
} from './backupArchive';
import { flushAllJsonWriters, freezeAtomicWrites, thawAtomicWrites, writeJsonAtomicSync } from '../atomicJson';
import { logDiagnostic } from '../errorLog';
import { mt } from '../i18n';

export function backupsDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function senderOrigin(event: IpcMainInvokeEvent): string | null {
  try {
    return event.senderFrame?.origin ?? null;
  } catch {
    return null;
  }
}

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function isRendererSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { localStorage?: unknown; indexedDb?: unknown };
  return typeof v.localStorage === 'object' && v.localStorage !== null && typeof v.indexedDb === 'object' && v.indexedDb !== null;
}

/** Free bytes on the userData volume, or null when the platform can't say. */
function freeBytes(dir: string): number | null {
  try {
    const st = fs.statfsSync(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

export interface BackupStatus {
  autoDir: string;
  lastAuto: { at: number; bytes: number } | null;
  autoCount: number;
  storeCount: number;
  storeBytes: number;
  bookFiles: number;
  bookBytes: number;
  lastManual: { at: number; path: string } | null;
}

interface BackupState {
  lastManual?: { at: number; path: string };
}

function statePath(): string {
  return path.join(backupsDir(), 'state.json');
}

function readState(): BackupState {
  try {
    const v = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as BackupState;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeState(state: BackupState): void {
  try {
    writeJsonAtomicSync(statePath(), state);
  } catch {
    /* status only */
  }
}

export function getBackupStatus(): BackupStatus {
  const dir = backupsDir();
  const autos = listAutoBackups(dir);
  const inv = inventoryUserData(app.getPath('userData'));
  return {
    autoDir: dir,
    lastAuto: autos[0] ? { at: autos[0].mtimeMs, bytes: autos[0].bytes } : null,
    autoCount: autos.length,
    storeCount: inv.stores.length + inv.library.filter((s) => !s.bookFile).length,
    storeBytes: inv.storeBytes + inv.libraryJsonBytes,
    bookFiles: inv.bookFiles,
    bookBytes: inv.bookBytes,
    lastManual: readState().lastManual ?? null,
  };
}

export type CreateBackupReply =
  | { ok: true; path: string; bytes: number; manifest: BackupManifest }
  | { ok: false; cancelled: true }
  | { ok: false; error: string; tooLarge?: boolean };

let busy = false;

async function withBusy<T>(fn: () => Promise<T>, whenBusy: T): Promise<T> {
  if (busy) return whenBusy;
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

async function createManual(event: IpcMainInvokeEvent, args: { includeBookFiles?: boolean; renderer?: unknown }): Promise<CreateBackupReply> {
  const renderer = isRendererSnapshot(args?.renderer) ? args.renderer : null;
  const stamp = new Date().toISOString().slice(0, 10);
  const lastDir = readState().lastManual?.path ? path.dirname(readState().lastManual?.path ?? '') : app.getPath('documents');
  const pick = await dialog.showSaveDialog(parentWindow(event) as BrowserWindow, {
    title: mt('backup.dialog.saveTitle'),
    defaultPath: path.join(lastDir, `Gum-backup-${stamp}.zip`),
    filters: [{ name: mt('backup.dialog.filter'), extensions: ['zip'] }],
  });
  if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true };
  flushAllJsonWriters();
  try {
    const result = await createBackupArchive({
      userData: app.getPath('userData'),
      target: pick.filePath,
      includeBookFiles: args?.includeBookFiles !== false,
      trigger: 'manual',
      appVersion: app.getVersion(),
      origin: senderOrigin(event),
      renderer,
    });
    writeState({ ...readState(), lastManual: { at: Date.now(), path: result.path } });
    logDiagnostic('info', 'backup', 'manual-backup', `${result.path} (${result.bytes} bytes)`);
    return { ok: true, ...result };
  } catch (err) {
    logDiagnostic('error', 'backup', 'manual-backup-failed', err instanceof Error ? err.message : String(err));
    return { ok: false, error: err instanceof Error ? err.message : String(err), tooLarge: err instanceof BackupTooLargeError };
  }
}

async function createAuto(event: IpcMainInvokeEvent, args: { renderer?: unknown }): Promise<CreateBackupReply | { ok: false; skipped: string }> {
  const dir = backupsDir();
  if (!autoBackupDue(dir)) return { ok: false, skipped: 'not-due' };
  const inv = inventoryUserData(app.getPath('userData'));
  const estimate = inv.storeBytes + inv.libraryJsonBytes + 1024 * 1024;
  const free = freeBytes(app.getPath('userData'));
  // Never be the thing that fills the disk: leave 256 MB plus twice the backup.
  if (free != null && free < estimate * 2 + 256 * 1024 * 1024) {
    logDiagnostic('warn', 'backup', 'auto-backup-skipped', `low disk space: ${free} bytes free`);
    return { ok: false, skipped: 'low-disk' };
  }
  flushAllJsonWriters();
  try {
    const result = await createBackupArchive({
      userData: app.getPath('userData'),
      target: path.join(dir, autoBackupName()),
      includeBookFiles: false,
      trigger: 'auto',
      appVersion: app.getVersion(),
      origin: senderOrigin(event),
      renderer: isRendererSnapshot(args?.renderer) ? args.renderer : null,
    });
    const pruned = pruneAutoBackups(dir);
    logDiagnostic('info', 'backup', 'auto-backup', `${result.path} (${result.bytes} bytes, pruned ${pruned.length})`);
    return { ok: true, ...result };
  } catch (err) {
    logDiagnostic('error', 'backup', 'auto-backup-failed', err instanceof Error ? err.message : String(err));
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── restore ──────────────────────────────────────────────────────────────────

interface PendingRestore {
  token: string;
  staged: StagedRestore;
}

let pending: PendingRestore | null = null;

function discardPending(): void {
  if (!pending) return;
  try {
    fs.rmSync(pending.staged.stagingDir, { recursive: true, force: true });
  } catch {
    /* next restore clears it */
  }
  pending = null;
}

export type RestoreChooseReply =
  | { ok: false; cancelled: true }
  | { ok: false; errors: string[] }
  | {
      ok: true;
      kind: 'archive';
      token: string;
      manifest: BackupManifest;
      files: number;
      renderer: unknown | null;
    }
  | { ok: true; kind: 'legacy'; legacy: unknown; exportedAt: number | null };

const MAX_LEGACY_BYTES = 512 * 1024 * 1024;

async function restoreChoose(event: IpcMainInvokeEvent): Promise<RestoreChooseReply> {
  const pick = await dialog.showOpenDialog(parentWindow(event) as BrowserWindow, {
    title: mt('backup.dialog.openTitle'),
    defaultPath: backupsDir(),
    properties: ['openFile'],
    filters: [{ name: mt('backup.dialog.filter'), extensions: ['zip', 'json'] }],
  });
  const file = pick.filePaths?.[0];
  if (pick.canceled || !file) return { ok: false, cancelled: true };
  discardPending();

  if (file.toLowerCase().endsWith('.json')) {
    // The old export ("format 1/2"): localStorage + IndexedDB + four host
    // settings, one JSON file. The renderer converts and applies it.
    try {
      if (fs.statSync(file).size > MAX_LEGACY_BYTES) return { ok: false, errors: [mt('backup.error.tooLargeFile')] };
      const legacy: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      const l = legacy as { app?: unknown; localStorage?: unknown; indexedDb?: unknown; exportedAt?: unknown } | null;
      if (!l || l.app !== 'jp-study-app' || typeof l.localStorage !== 'object' || typeof l.indexedDb !== 'object') {
        return { ok: false, errors: [mt('backup.error.notBackup')] };
      }
      return { ok: true, kind: 'legacy', legacy, exportedAt: typeof l.exportedAt === 'number' ? l.exportedAt : null };
    } catch (err) {
      return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const stagingDir = path.join(backupsDir(), `.staging-${token}`);
  const staged = await stageArchive(file, stagingDir);
  if (!staged.ok) {
    logDiagnostic('warn', 'backup', 'restore-rejected', staged.errors.slice(0, 20).join(' | '));
    return { ok: false, errors: staged.errors };
  }
  pending = { token, staged: staged.staged };
  return {
    ok: true,
    kind: 'archive',
    token,
    manifest: staged.staged.manifest,
    files: staged.staged.files.length,
    renderer: staged.staged.renderer,
  };
}

export type RestoreCommitReply =
  | { ok: true; restored: number; previousDir: string }
  | { ok: false; failures: Array<{ path: string; error: string }>; rollbackFailures: Array<{ path: string; error: string }> };

function pruneOldPreRestore(keep: string): void {
  try {
    for (const name of fs.readdirSync(backupsDir())) {
      const p = path.join(backupsDir(), name);
      if (name.startsWith('pre-restore-') && p !== keep) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {
    /* housekeeping */
  }
}

function restoreCommit(token: unknown): RestoreCommitReply {
  if (!pending || pending.token !== token) {
    return { ok: false, failures: [{ path: '', error: mt('backup.error.noStagedRestore') }], rollbackFailures: [] };
  }
  const { staged } = pending;
  // Coalesced saves land first, then nothing may write until the relaunch —
  // otherwise a module's in-memory copy would overwrite a restored file.
  flushAllJsonWriters();
  freezeAtomicWrites();
  const previousDir = path.join(backupsDir(), `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const result = commitStaged(staged, app.getPath('userData'), previousDir);
  discardPending();
  if (!result.ok) {
    thawAtomicWrites({ replay: true });
    logDiagnostic('error', 'backup', 'restore-rolled-back', JSON.stringify(result).slice(0, 2000));
    return result;
  }
  // Held writes are stale in-memory copies: drop them, and stay frozen until
  // the relaunch so a timer firing before exit can't overwrite a restored file.
  thawAtomicWrites({ replay: false });
  freezeAtomicWrites();
  pruneOldPreRestore(previousDir);
  logDiagnostic('info', 'backup', 'restore-committed', `${result.restored} file(s); previous state in ${previousDir}`);
  // Every module re-reads from disk on the next start. Guaranteed here rather
  // than left to the renderer, since writes stay frozen until it happens.
  setTimeout(() => void relaunch(), 1200);
  return result;
}

async function relaunch(): Promise<void> {
  try {
    await session.defaultSession.flushStorageData();
  } catch {
    /* best effort — localStorage commits are also flushed on exit */
  }
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 150);
}

export function registerBackupIpc(): void {
  ipcMain.handle('backup:status', () => getBackupStatus());
  ipcMain.handle('backup:create', (event, args: { includeBookFiles?: boolean; renderer?: unknown }) =>
    withBusy<CreateBackupReply>(() => createManual(event, args ?? {}), { ok: false, error: mt('backup.error.busy') }),
  );
  ipcMain.handle('backup:autoDue', () => autoBackupDue(backupsDir()));
  ipcMain.handle('backup:createAuto', (event, args: { renderer?: unknown }) =>
    withBusy(() => createAuto(event, args ?? {}), { ok: false as const, skipped: 'busy' }),
  );
  ipcMain.handle('backup:restoreChoose', (event) => restoreChoose(event));
  ipcMain.handle('backup:restoreCommit', (_e, token: unknown) => restoreCommit(token));
  ipcMain.handle('backup:restoreDiscard', () => {
    discardPending();
  });
  ipcMain.handle('backup:relaunch', () => relaunch());
  ipcMain.handle('backup:openFolder', async () => {
    fs.mkdirSync(backupsDir(), { recursive: true });
    return shell.openPath(backupsDir());
  });
}
