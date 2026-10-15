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
 * - Local crash reports (D9: opt-in, local only): with the Diagnostics switch on,
 *   `crashReporter` writes native minidumps to `<userData>/Crashpad` and never
 *   uploads them (`uploadToServer: false`, no submit URL). Off by default.
 * - "Save problem report…" writes a redacted zip (`problemReport.ts`) where the
 *   user picks in a save dialog. Nothing is sent anywhere.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, crashReporter, dialog, ipcMain, shell, type WebContents } from 'electron';
import { errorDetail, logDiagnostic, redactSecrets } from './errorLog';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  buildProblemReportZip,
  problemReportFileName,
  PROBLEM_REPORT_MAX_DUMP_BYTES,
  PROBLEM_REPORT_MAX_DUMPS,
  PROBLEM_REPORT_MAX_SETTINGS_BYTES,
  PROBLEM_REPORT_SETTINGS_FILES,
} from './problemReport';
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

// ── local crash reports (opt-in) ─────────────────────────────────────────────

const CRASH_PREF_FILE = 'crash-reporting.json';

export interface CrashReportingState {
  /** The Diagnostics switch: keep native crash reports on this PC. */
  enabled: boolean;
  /** The crash reporter is running in this process (it cannot be stopped once started). */
  active: boolean;
  /** Minidumps on disk now. */
  dumps: number;
}

let crashReporterActive = false;

function crashPrefPath(): string {
  return path.join(app.getPath('userData'), CRASH_PREF_FILE);
}

/** Minidumps live in the profile, next to the log, whatever the platform default. */
export function crashDumpsDir(): string {
  return path.join(app.getPath('userData'), 'Crashpad');
}

export function crashReportingEnabled(): boolean {
  try {
    return readJsonSync<{ enabled?: unknown }>(crashPrefPath(), {}).enabled === true;
  } catch {
    return false;
  }
}

/** Every `.dmp` under the dumps folder (Crashpad keeps them in `reports/`), newest first. */
export function listMinidumps(dir: string = crashDumpsDir()): Array<{ file: string; mtimeMs: number; size: number }> {
  const out: Array<{ file: string; mtimeMs: number; size: number }> = [];
  const walk = (d: string, depth: number) => {
    if (depth > 3) return;
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const n of names) {
      const full = path.join(d, n.name);
      if (n.isDirectory()) walk(full, depth + 1);
      else if (n.isFile() && n.name.toLowerCase().endsWith('.dmp')) {
        try {
          const st = fs.statSync(full);
          out.push({ file: full, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          /* vanished */
        }
      }
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Start the local crash reporter. Called once at startup (before `ready`, so every
 * child process is covered) when the switch is on, and when the user turns it on.
 * Never uploads: `uploadToServer: false` and no submit URL.
 */
export function startLocalCrashReporter(): boolean {
  if (crashReporterActive) return true;
  try {
    const dir = crashDumpsDir();
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('crashDumps', dir);
    crashReporter.start({ uploadToServer: false, compress: true });
    crashReporterActive = true;
    return true;
  } catch (err) {
    logDiagnostic('warn', 'crash', 'crashReporter', errorDetail(err));
    return false;
  }
}

/** main.ts calls this as early as it can: it starts only when the user turned crash reports on. */
export function startCrashReporterIfEnabled(): void {
  if (crashReportingEnabled()) startLocalCrashReporter();
}

function crashReportingState(): CrashReportingState {
  return { enabled: crashReportingEnabled(), active: crashReporterActive, dumps: listMinidumps().length };
}

function setCrashReporting(enabled: boolean): CrashReportingState {
  try {
    writeJsonAtomicSync(crashPrefPath(), { enabled });
  } catch (err) {
    logDiagnostic('warn', 'crash', 'pref', errorDetail(err));
  }
  // On takes effect now (and for every process from the next start); off from the
  // next start, since a running crash reporter cannot be stopped.
  if (enabled) startLocalCrashReporter();
  return crashReportingState();
}

// ── "Save problem report…" ───────────────────────────────────────────────────

export type ProblemReportSaveResult =
  | { ok: true; file: string; files: string[] }
  | { ok: false; reason: 'canceled' | 'failed' };

/** Reports saved in this session: the only files "Show in folder" will reveal. */
const savedReports = new Set<string>();

function readSettingsForReport(): Record<string, string> {
  const out: Record<string, string> = {};
  const dir = app.getPath('userData');
  for (const name of PROBLEM_REPORT_SETTINGS_FILES) {
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      // Oversized: a stand-in the builder lists as left out, never the content.
      out[name] = st.size > PROBLEM_REPORT_MAX_SETTINGS_BYTES ? ' '.repeat(PROBLEM_REPORT_MAX_SETTINGS_BYTES + 1) : fs.readFileSync(file, 'utf8');
    } catch {
      /* not there on this profile */
    }
  }
  return out;
}

function readDumpsForReport(): Array<{ name: string; data: Uint8Array }> {
  return listMinidumps()
    .filter((d) => d.size > 0 && d.size <= PROBLEM_REPORT_MAX_DUMP_BYTES)
    .slice(0, PROBLEM_REPORT_MAX_DUMPS)
    .flatMap((d) => {
      try {
        return [{ name: path.basename(d.file), data: new Uint8Array(fs.readFileSync(d.file)) }];
      } catch {
        return [];
      }
    });
}

/** The renderer's few preferences (UI language, theme): short plain values only. */
function cleanUi(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 12)) {
    if (/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      out[k] = String(v).slice(0, 80);
    }
  }
  return out;
}

/** Build the report zip from this profile. */
export function makeProblemReport(ui?: unknown): ReturnType<typeof buildProblemReportZip> {
  return buildProblemReportZip({
    appVersion: app.getVersion(),
    os: `${process.platform} ${os.release()} ${process.arch}`,
    createdAt: new Date(),
    homeDir: os.homedir(),
    summary: summary(),
    log: readRecentDiagnostics(path.join(logDir(), 'main.log'), 200, 'info'),
    settings: readSettingsForReport(),
    ui: cleanUi(ui),
    dumps: readDumpsForReport(),
    crashReportsOn: crashReportingEnabled(),
  });
}

async function saveProblemReport(sender: WebContents, opts: unknown): Promise<ProblemReportSaveResult> {
  const o = opts && typeof opts === 'object' ? (opts as Record<string, unknown>) : {};
  // The renderer sends the dialog title in the UI language.
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 120) : 'Save problem report';
  const parent = BrowserWindow.fromWebContents(sender) ?? undefined;
  const options = {
    title,
    defaultPath: path.join(app.getPath('documents'), problemReportFileName(new Date())),
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  };
  try {
    const picked = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: false, reason: 'canceled' };
    const { zip, files } = makeProblemReport(o.ui);
    const target = /\.zip$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.zip`;
    fs.writeFileSync(target, zip);
    savedReports.add(path.resolve(target));
    logDiagnostic('info', 'diagnostics', 'problemReport', `saved ${files.length} file(s)`);
    return { ok: true, file: target, files };
  } catch (err) {
    logDiagnostic('error', 'diagnostics', 'problemReport', errorDetail(err));
    return { ok: false, reason: 'failed' };
  }
}

export function registerCrashRecoveryIpc(): void {
  ipcMain.handle('diagnostics:crashReports', () => crashReportingState());
  ipcMain.handle('diagnostics:setCrashReports', (_e, enabled: unknown) => setCrashReporting(enabled === true));
  ipcMain.handle('diagnostics:saveProblemReport', (event, opts: unknown) => saveProblemReport(event.sender, opts));
  ipcMain.handle('diagnostics:showProblemReport', (_e, file: unknown) => {
    if (typeof file !== 'string' || !savedReports.has(path.resolve(file)) || !fs.existsSync(file)) return false;
    shell.showItemInFolder(file);
    return true;
  });
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
