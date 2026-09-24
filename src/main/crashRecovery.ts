/**
 * Crashes are recovered from, and never vanish silently (audit robust #5).
 *
 * Before: an uncaught main-process exception was logged and the app quit with
 * no dialog; a crashed renderer (a runtime sweep saw `reason=oom`) was logged
 * and its window stayed dead — frozen for >10 minutes; the diagnostic log was
 * write-only.
 *
 * - `handleFatalMainError` shows an error dialog with "Copy details" and a
 *   choice to restart or quit (a second fatal error while it is open quits).
 * - `watchRendererCrashes` reloads a crashed window with backoff; the reloaded
 *   renderer asks `diagnostics:consumeCrashRecovery` and shows a "Recovered
 *   from a crash" notice. Desktop windows come back by themselves: their layout
 *   lives in main (`desktop.ts`) and the reloaded shell re-reads it. After
 *   repeated crashes the user is offered safe mode (the presentation-only
 *   `aeroSafeMode` flag the renderer applies on the next boot).
 * - `readRecentDiagnostics` makes the log readable from Settings > Help.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type WebContents } from 'electron';
import { errorDetail, logDiagnostic, redactSecrets } from './errorLog';
import { mt } from './i18n';

// ── fatal main-process errors ────────────────────────────────────────────────

let fatalDialogOpen = false;

export function fatalErrorReport(err: unknown): string {
  return redactSecrets(
    [
      `Gum ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform} ${os.release()} ${process.arch})`,
      new Date().toISOString(),
      errorDetail(err),
    ].join('\n'),
  );
}

/**
 * The uncaught-exception path. Returns after the user chose; the process is
 * exiting (quit/restart) by then.
 */
export function handleFatalMainError(err: unknown, flush: () => void): void {
  logDiagnostic('error', 'main', 'uncaughtException', errorDetail(err));
  if (fatalDialogOpen) {
    // A second fatal error while the dialog is up: don't stack dialogs.
    app.exit(1);
    return;
  }
  fatalDialogOpen = true;
  try {
    flush();
  } catch {
    /* the save we can do is best effort */
  }
  const report = fatalErrorReport(err);
  const message = err instanceof Error ? err.message : String(err);
  try {
    if (!app.isReady()) {
      dialog.showErrorBox(mt('crash.main.title'), `${mt('crash.main.message')}\n\n${report}`);
      app.exit(1);
      return;
    }
    for (;;) {
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: mt('crash.main.title'),
        message: mt('crash.main.message'),
        detail: `${message.slice(0, 600)}\n\n${mt('crash.main.detail')}`,
        buttons: [mt('crash.main.restart'), mt('crash.main.copy'), mt('crash.main.quit')],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (choice === 1) {
        clipboard.writeText(report);
        continue;
      }
      if (choice === 0) app.relaunch();
      app.exit(1);
      return;
    }
  } catch {
    app.exit(1);
  }
}

// ── renderer crashes ─────────────────────────────────────────────────────────

/** Reload delays after the 1st, 2nd, 3rd crash inside the window. */
export const CRASH_RELOAD_BACKOFF_MS = [500, 3000, 10000];
export const CRASH_WINDOW_MS = 10 * 60 * 1000;

interface CrashRecord {
  times: number[];
  pendingNotice: { reason: string; crashes: number; safeMode: boolean } | null;
}

const crashes = new Map<number, CrashRecord>();

export type CrashAction = { kind: 'ignore' } | { kind: 'reload'; delayMs: number } | { kind: 'ask' };

/** Pure policy: what to do after a crash, given earlier crash times. */
export function decideCrashAction(reason: string, earlier: number[], now: number): CrashAction {
  if (reason === 'clean-exit') return { kind: 'ignore' };
  const recent = earlier.filter((t) => now - t < CRASH_WINDOW_MS);
  if (recent.length >= CRASH_RELOAD_BACKOFF_MS.length) return { kind: 'ask' };
  return { kind: 'reload', delayMs: CRASH_RELOAD_BACKOFF_MS[recent.length] };
}

function reload(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    win.webContents.reload();
  } catch (err) {
    logDiagnostic('error', 'renderer', 'crash-reload-failed', errorDetail(err));
  }
}

export function watchRendererCrashes(win: BrowserWindow): void {
  const id = win.webContents.id;
  win.webContents.on('render-process-gone', (_e, details) => {
    logDiagnostic('error', 'renderer', 'render-process-gone', `reason=${details.reason} exitCode=${details.exitCode}`);
    const record = crashes.get(id) ?? { times: [], pendingNotice: null };
    const now = Date.now();
    const action = decideCrashAction(details.reason, record.times, now);
    if (action.kind === 'ignore') return;
    record.times = [...record.times.filter((t) => now - t < CRASH_WINDOW_MS), now];
    crashes.set(id, record);
    if (action.kind === 'reload') {
      record.pendingNotice = { reason: details.reason, crashes: record.times.length, safeMode: false };
      setTimeout(() => reload(win), action.delayMs);
      return;
    }
    if (win.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: mt('crash.renderer.title'),
      message: mt('crash.renderer.message', { count: record.times.length }),
      detail: mt('crash.renderer.detail', { reason: details.reason }),
      buttons: [mt('crash.renderer.safeMode'), mt('crash.renderer.reload'), mt('crash.renderer.close')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (choice === 2) {
      win.close();
      return;
    }
    record.pendingNotice = { reason: details.reason, crashes: record.times.length, safeMode: choice === 0 };
    record.times = [];
    reload(win);
  });
  win.webContents.once('destroyed', () => crashes.delete(id));
}

function consumeCrashNotice(sender: WebContents): CrashRecord['pendingNotice'] {
  const record = crashes.get(sender.id);
  const notice = record?.pendingNotice ?? null;
  if (record) record.pendingNotice = null;
  return notice;
}

// ── reading the log ──────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  ts: string;
  severity: 'info' | 'warn' | 'error';
  subsystem: string;
  operation: string;
  detail: string;
}

export function logDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

/** Newest first. Reads only the tail of the log. */
export function readRecentDiagnostics(file: string, limit = 50, minSeverity: 'info' | 'warn' | 'error' = 'warn'): DiagnosticEntry[] {
  const rank = { info: 0, warn: 1, error: 2 } as const;
  let text: string;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, 512 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
  const out: DiagnosticEntry[] = [];
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const e = JSON.parse(line) as DiagnosticEntry;
      if (!e || typeof e.ts !== 'string' || !(e.severity in rank)) continue;
      if (rank[e.severity] < rank[minSeverity]) continue;
      out.push({ ts: e.ts, severity: e.severity, subsystem: String(e.subsystem), operation: String(e.operation), detail: String(e.detail ?? '').slice(0, 2000) });
    } catch {
      /* a torn first line from the tail cut */
    }
  }
  return out;
}

export interface DiagnosticsSummary {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  osRelease: string;
  arch: string;
  packaged: boolean;
  uptimeSec: number;
  totalMemMb: number;
  processes: Array<{ type: string; name?: string; memoryMb: number }>;
}

function summary(): DiagnosticsSummary {
  let processes: DiagnosticsSummary['processes'] = [];
  try {
    processes = app.getAppMetrics().map((m) => ({
      type: m.type,
      name: m.serviceName || m.name,
      memoryMb: Math.round((m.memory?.workingSetSize ?? 0) / 1024),
    }));
  } catch {
    /* metrics are optional */
  }
  return {
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node,
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    packaged: app.isPackaged,
    uptimeSec: Math.round(process.uptime()),
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    processes,
  };
}

export function registerCrashRecoveryIpc(): void {
  ipcMain.handle('diagnostics:recent', (_e, limit: unknown) =>
    readRecentDiagnostics(path.join(logDir(), 'main.log'), typeof limit === 'number' ? Math.min(Math.max(1, limit), 200) : 50),
  );
  ipcMain.handle('diagnostics:summary', () => summary());
  ipcMain.handle('diagnostics:openLogFolder', async () => {
    fs.mkdirSync(logDir(), { recursive: true });
    return shell.openPath(logDir());
  });
  ipcMain.handle('diagnostics:consumeCrashRecovery', (event) => consumeCrashNotice(event.sender));
}
