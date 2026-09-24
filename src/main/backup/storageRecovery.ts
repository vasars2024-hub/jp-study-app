/**
 * Recovery exports for the renderer's IndexedDB (audit robust #2).
 *
 * `renderer/storage/db.ts` may only rebuild a damaged database after its
 * readable records are on disk here, and — when some records could not be read
 * — after the raw LevelDB files were copied aside. Both land in
 * `userData/recovery/`, which nothing in the app ever deletes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFileAtomicSync } from '../atomicJson';
import { logDiagnostic } from '../errorLog';

export function recoveryDir(userData = app.getPath('userData')): string {
  return path.join(userData, 'recovery');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** File-name-safe database name: letters, digits, dash, underscore, dot. */
export function safeDbName(name: unknown): string {
  const s = String(name ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 64);
  return s || 'indexeddb';
}

/**
 * Chromium's on-disk storage id for an origin: `scheme_host_port`, port 0 when
 * the origin has none. `http://localhost:5173` → `http_localhost_5173`,
 * `app://bundle` → `app_bundle_0`.
 */
export function chromiumOriginId(origin: string): string | null {
  try {
    const u = new URL(origin);
    const scheme = u.protocol.replace(/:$/, '');
    if (!scheme || !u.hostname) return null;
    return `${scheme}_${u.hostname}_${u.port || '0'}`;
  } catch {
    return null;
  }
}

export function saveIdbRecoveryExport(userData: string, dbName: string, json: string): string {
  if (typeof json !== 'string' || !json.length) throw new Error('empty recovery export');
  const file = path.join(recoveryDir(userData), `${safeDbName(dbName)}-${stamp()}.json`);
  writeFileAtomicSync(file, json, { backup: false });
  return file;
}

/** Copy the origin's raw IndexedDB directories aside. Returns the folder, or null when nothing was copied. */
export function preserveIdbFiles(userData: string, origin: string, dbName: string): string | null {
  const id = chromiumOriginId(origin);
  if (!id) return null;
  const idbRoot = path.join(userData, 'IndexedDB');
  let names: string[];
  try {
    names = fs.readdirSync(idbRoot).filter((n) => n.startsWith(`${id}.indexeddb.`));
  } catch {
    return null;
  }
  if (!names.length) return null;
  const target = path.join(recoveryDir(userData), `${safeDbName(dbName)}-${stamp()}-raw`);
  let copied = 0;
  for (const name of names) {
    try {
      fs.cpSync(path.join(idbRoot, name), path.join(target, name), { recursive: true, force: true });
      copied += 1;
    } catch (err) {
      logDiagnostic('warn', 'storage', 'idb-preserve-partial', `${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return copied ? target : null;
}

function senderOrigin(event: IpcMainInvokeEvent): string {
  try {
    return event.senderFrame?.origin ?? '';
  } catch {
    return '';
  }
}

export function registerStorageRecoveryIpc(): void {
  ipcMain.handle('storage:saveIdbRecovery', (_e, dbName: unknown, json: unknown) => {
    const file = saveIdbRecoveryExport(app.getPath('userData'), String(dbName ?? ''), String(json ?? ''));
    logDiagnostic('warn', 'storage', 'idb-recovery-export', file);
    return file;
  });
  ipcMain.handle('storage:preserveIdbFiles', (event, dbName: unknown) => {
    const dir = preserveIdbFiles(app.getPath('userData'), senderOrigin(event), String(dbName ?? ''));
    logDiagnostic('warn', 'storage', 'idb-raw-preserve', dir ?? 'nothing copied');
    return dir;
  });
}
