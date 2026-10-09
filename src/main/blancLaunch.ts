/**
 * Blanc's launch preference and its view of Study OS.
 *
 * "Start in Blanc only (lowest memory)": main normally opens the full Study OS
 * window at launch, and Blanc (when enabled) opens beside it — so the cheap
 * toolbox never actually ran alone. With this preference on, main opens only
 * the Blanc window; Study OS is created on demand by the paths that already
 * recreate it (focus/toggle, the extension's "open in app", "Open Study OS").
 * It lives in userData so main can read it before any renderer exists, the
 * same way `window-chrome.json` is read.
 *
 * Blanc also needs to know whether a Study OS renderer is alive: the background
 * jobs (extension mining, transcription, reminders…) run in exactly one place,
 * and Blanc takes them over only while there is no Study OS window.
 */
import path from 'node:path';
import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { summarizeAppMemory, type AppMemoryReport, type AppProcessMemory, type AppProcessRole } from '../shared/appMemory';

export interface BlancLaunchPrefs {
  /** Open only the Blanc window at launch; Study OS on demand. Off by default. */
  blancOnly: boolean;
}

const FILE_NAME = 'blanc-launch.json';

function prefsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function loadBlancLaunchPrefs(): BlancLaunchPrefs {
  try {
    const parsed = readJsonSync<{ blancOnly?: unknown }>(prefsPath(), {}, {
      validate: (v) => typeof v === 'object' && v !== null,
    });
    return { blancOnly: parsed.blancOnly === true };
  } catch {
    return { blancOnly: false };
  }
}

function saveBlancLaunchPrefs(prefs: BlancLaunchPrefs): BlancLaunchPrefs {
  try {
    writeJsonAtomicSync(prefsPath(), { blancOnly: prefs.blancOnly }, { space: 0 });
  } catch {
    /* best effort: the default (off) is always safe */
  }
  return prefs;
}

export interface BlancLaunchDeps {
  /** True while a window running the Study OS renderer (main or a pop-out) is open. */
  isStudyOsAlive: () => boolean;
  /** Show Study OS, creating its window when there is none. */
  openStudyOs: () => void;
  /** Which window a renderer process draws, for the memory readout. */
  describeWindow: (win: BrowserWindow) => { role: AppProcessRole; title: string };
}

/**
 * Send to every window whose renderer can still receive it.
 *
 * `win.isDestroyed()` alone is not enough: these broadcasts run from a closing
 * window's own teardown (`webContents` 'destroyed', the main window's 'closed'),
 * where `getAllWindows()` still lists that window but its webContents is already
 * gone, and `send` throws "Object has been destroyed". Measured live 2026-10-08:
 * closing the Study OS window raised that as an uncaught main-process exception
 * and the "Gum ran into a problem" dialog appeared on every ordinary close.
 */
function sendToLiveWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      win.webContents.send(channel, payload);
    } catch {
      /* torn down between the check and the send */
    }
  }
}

/** Tell every renderer whether a Study OS window is alive (Blanc listens). */
export function broadcastStudyOsAlive(alive: boolean): void {
  sendToLiveWindows('blanc:study-os-alive', alive);
}

/**
 * Study OS renderers that have acked "my background jobs are installed"
 * (renderer/studyOsJobsReady.ts). Blanc drops its own copy of the jobs only on
 * this ack — "a Study OS window is alive" holds long before its handlers exist.
 * An entry is cleared when its window is destroyed, its renderer dies, or it
 * navigates/reloads (the new page acks again once installed).
 */
const studyOsJobsReadyIds = new Set<number>();

export function isStudyOsJobsReady(): boolean {
  return studyOsJobsReadyIds.size > 0;
}

/** Tell every renderer whether a Study OS window has its background jobs installed (Blanc listens). */
export function broadcastStudyOsJobsReady(ready: boolean = isStudyOsJobsReady()): void {
  sendToLiveWindows('blanc:study-os-jobs-ready', ready);
}

function markStudyOsJobsReady(sender: WebContents): void {
  const id = sender.id;
  if (!studyOsJobsReadyIds.has(id)) {
    studyOsJobsReadyIds.add(id);
    const clear = (): void => {
      sender.removeListener('did-navigate', clear);
      sender.removeListener('render-process-gone', clear);
      if (studyOsJobsReadyIds.delete(id)) broadcastStudyOsJobsReady();
    };
    sender.once('destroyed', clear);
    sender.on('did-navigate', clear);
    sender.on('render-process-gone', clear);
  }
  broadcastStudyOsJobsReady();
}

function processRole(type: string): AppProcessRole {
  if (type === 'Browser') return 'browser';
  if (type === 'GPU') return 'gpu';
  if (type === 'Utility') return 'utility';
  return 'other';
}

export function collectAppMemory(describeWindow: BlancLaunchDeps['describeWindow']): AppMemoryReport {
  const windowsByPid = new Map<number, { role: AppProcessRole; title: string }>();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const pid = win.webContents.getOSProcessId();
      if (pid > 0 && !windowsByPid.has(pid)) windowsByPid.set(pid, describeWindow(win));
    } catch {
      /* a window mid-teardown */
    }
  }
  const processes: AppProcessMemory[] = app.getAppMetrics().map((metric) => {
    const win = windowsByPid.get(metric.pid);
    const memory = metric.memory as { workingSetSize?: number; privateBytes?: number } | undefined;
    return {
      pid: metric.pid,
      role: win ? win.role : processRole(metric.type),
      label: win ? win.title : (metric.name || metric.serviceName || metric.type),
      // Electron reports kilobytes.
      workingSetBytes: Math.max(0, (memory?.workingSetSize ?? 0) * 1024),
      ...(typeof memory?.privateBytes === 'number' ? { privateBytes: memory.privateBytes * 1024 } : {}),
      cpuPercent: Math.max(0, metric.cpu?.percentCPUUsage ?? 0),
    };
  });
  return summarizeAppMemory(processes);
}

export function registerBlancLaunchIpc(deps: BlancLaunchDeps): void {
  ipcMain.handle('blanc:getLaunchPrefs', (): BlancLaunchPrefs => loadBlancLaunchPrefs());
  ipcMain.handle('blanc:setLaunchPrefs', (_event, patch: unknown): BlancLaunchPrefs => {
    const current = loadBlancLaunchPrefs();
    const next: BlancLaunchPrefs = {
      blancOnly:
        patch && typeof patch === 'object' && typeof (patch as { blancOnly?: unknown }).blancOnly === 'boolean'
          ? (patch as { blancOnly: boolean }).blancOnly
          : current.blancOnly,
    };
    return saveBlancLaunchPrefs(next);
  });
  ipcMain.handle('blanc:studyOsAlive', (): boolean => deps.isStudyOsAlive());
  ipcMain.handle('blanc:studyOsJobsReady', (event): boolean => {
    markStudyOsJobsReady(event.sender);
    return true;
  });
  ipcMain.handle('blanc:studyOsJobsReadyState', (): boolean => isStudyOsJobsReady());
  ipcMain.handle('blanc:openStudyOs', (): { ok: boolean } => {
    deps.openStudyOs();
    return { ok: true };
  });
  ipcMain.handle('app:memoryMetrics', (): AppMemoryReport => collectAppMemory(deps.describeWindow));
}
