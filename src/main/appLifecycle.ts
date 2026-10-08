/**
 * How Gum lives on the desktop: whether closing the main window quits or keeps
 * Gum running in the notification area, and whether Windows starts it at sign-in.
 *
 * Keeping it running matters because the system-wide pieces (Reading Lens and
 * popup-dictionary hotkeys, the companion, calendar reminders) all die with the
 * process. Both preferences are OFF by default: an app that silently stops
 * quitting when its window is closed surprises people, so it is offered in
 * Settings (Startup & tray) and the tray menu instead.
 *
 * Stored in userData because main needs it before any renderer exists.
 */
import path from 'node:path';
import { app, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { updateExePath } from './squirrelEvents';
import { detectInstallKind } from './squirrelUpdater';

export interface AppLifecyclePrefs {
  /** Closing the main window hides it to the tray instead of quitting. */
  keepRunningInTray: boolean;
  /** Start Gum when the user signs in to Windows. */
  startAtLogin: boolean;
  /** At sign-in, start in the tray without showing a window (only with keepRunningInTray). */
  startMinimized: boolean;
}

export interface AppLifecycleStatus extends AppLifecyclePrefs {
  /** `setLoginItemSettings` works on this platform/build. */
  loginItemSupported: boolean;
}

export const DEFAULT_APP_LIFECYCLE_PREFS: Readonly<AppLifecyclePrefs> = {
  keepRunningInTray: false,
  startAtLogin: false,
  startMinimized: true,
};

/** Command-line flag the sign-in launch carries so Gum starts in the tray. */
export const START_MINIMIZED_ARG = '--start-in-tray';

const FILE_NAME = 'app-lifecycle.json';

function prefsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function normalizeAppLifecyclePrefs(raw: unknown, base: AppLifecyclePrefs = DEFAULT_APP_LIFECYCLE_PREFS): AppLifecyclePrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    keepRunningInTray: typeof r.keepRunningInTray === 'boolean' ? r.keepRunningInTray : base.keepRunningInTray,
    startAtLogin: typeof r.startAtLogin === 'boolean' ? r.startAtLogin : base.startAtLogin,
    startMinimized: typeof r.startMinimized === 'boolean' ? r.startMinimized : base.startMinimized,
  };
}

let cached: AppLifecyclePrefs | null = null;

export function loadAppLifecyclePrefs(): AppLifecyclePrefs {
  if (cached) return cached;
  try {
    cached = normalizeAppLifecyclePrefs(readJsonSync<unknown>(prefsPath(), {}));
  } catch {
    cached = { ...DEFAULT_APP_LIFECYCLE_PREFS };
  }
  reconcileLoginItem(cached);
  return cached;
}

function loginItemSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

/** Arguments Windows passes at sign-in. */
export function loginItemArgs(prefs: AppLifecyclePrefs): string[] {
  return prefs.keepRunningInTray && prefs.startMinimized ? [START_MINIMIZED_ARG] : [];
}

/** Where this copy runs from; injectable so the Squirrel branch is testable. */
export interface LoginItemEnv {
  execPath: string;
  isPackaged: boolean;
  platform: string;
  exists?: (p: string) => boolean;
}

/** What `setLoginItemSettings` / `getLoginItemSettings` are called with. */
export interface LoginItemSpec {
  openAtLogin: boolean;
  /** Only set for a Squirrel install; otherwise Electron uses `process.execPath`. */
  path?: string;
  args: string[];
}

/**
 * The login item for these prefs. A Squirrel install must NOT register its own exe:
 * that lives in `app-<version>\` and Squirrel deletes the folder on the next update,
 * leaving a dead sign-in entry. It registers the stable `Update.exe --processStart`
 * instead (the Electron-documented Squirrel pattern), forwarding the tray flag via
 * `--process-start-args`. The zip/portable build and dev keep the plain exe + args.
 * Enabling and disabling use the same path/args, because Electron matches the
 * registration by them.
 */
export function loginItemSpec(prefs: AppLifecyclePrefs, env: LoginItemEnv): LoginItemSpec {
  const args = loginItemArgs(prefs);
  if (detectInstallKind(env.execPath, env.isPackaged, env.platform, env.exists) !== 'installed') {
    return { openAtLogin: prefs.startAtLogin, args };
  }
  const squirrelArgs = ['--processStart', `"${path.basename(env.execPath)}"`];
  if (args.length) squirrelArgs.push('--process-start-args', `"${args.join(' ')}"`);
  return { openAtLogin: prefs.startAtLogin, path: updateExePath(env.execPath), args: squirrelArgs };
}

function currentEnv(): LoginItemEnv {
  return { execPath: process.execPath, isPackaged: app.isPackaged === true, platform: process.platform };
}

function applyLoginItem(prefs: AppLifecyclePrefs): void {
  if (!loginItemSupported()) return;
  try {
    // On Windows the Run-key value is named after the AppUserModelID, so this also
    // overwrites (or, when disabling, removes) a stale entry that still points at
    // an old `app-<version>\` exe.
    app.setLoginItemSettings(loginItemSpec(prefs, currentEnv()));
  } catch {
    /* a portable build in a read-only location: the preference still reads back honestly below */
  }
}

function readLoginItem(prefs: AppLifecyclePrefs): boolean {
  if (!loginItemSupported()) return false;
  try {
    const { path: itemPath, args } = loginItemSpec(prefs, currentEnv());
    return app.getLoginItemSettings(itemPath ? { path: itemPath, args } : { args }).openAtLogin;
  } catch {
    return prefs.startAtLogin;
  }
}

/**
 * Copies installed before the Update.exe registration (or registered from an
 * old version folder) carry a sign-in entry that an update breaks. When the
 * preference says "start at sign-in" but the registration doesn't match what this
 * copy would write, write it again. Runs once, on the first prefs load, and only
 * for a Squirrel install (the zip build keeps its old behaviour).
 */
function reconcileLoginItem(prefs: AppLifecyclePrefs): void {
  if (!prefs.startAtLogin || !loginItemSupported()) return;
  try {
    const env = currentEnv();
    if (detectInstallKind(env.execPath, env.isPackaged, env.platform) !== 'installed') return;
    if (!readLoginItem(prefs)) applyLoginItem(prefs);
  } catch {
    /* best effort */
  }
}

export function getAppLifecycleStatus(): AppLifecycleStatus {
  const prefs = loadAppLifecyclePrefs();
  return { ...prefs, startAtLogin: readLoginItem(prefs), loginItemSupported: loginItemSupported() };
}

export function setAppLifecyclePrefs(patch: unknown): AppLifecycleStatus {
  const next = normalizeAppLifecyclePrefs(patch, loadAppLifecyclePrefs());
  cached = next;
  try {
    writeJsonAtomicSync(prefsPath(), next, { space: 0 });
  } catch {
    /* best effort */
  }
  applyLoginItem(next);
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      /* a listener's failure is its own */
    }
  }
  return getAppLifecycleStatus();
}

const listeners = new Set<(prefs: AppLifecyclePrefs) => void>();
export function onAppLifecyclePrefsChanged(cb: (prefs: AppLifecyclePrefs) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True when this launch came from the sign-in entry and should stay in the tray. */
export function launchedToTray(argv: readonly string[] = process.argv): boolean {
  return argv.includes(START_MINIMIZED_ARG) && loadAppLifecyclePrefs().keepRunningInTray;
}

/**
 * Set by `before-quit`: from then on a close is a real close. Tray "Quit",
 * the app menu's Exit, an update restart and Windows shutdown all go through it.
 */
let quitting = false;
export function markAppQuitting(): void {
  quitting = true;
}
export function isAppQuitting(): boolean {
  return quitting;
}

/** Should closing the main window hide it to the tray instead? */
export function shouldHideOnClose(): boolean {
  return !quitting && loadAppLifecyclePrefs().keepRunningInTray;
}

export function registerTrayLifecycleIpc(): void {
  ipcMain.handle('app:getLifecycle', (): AppLifecycleStatus => getAppLifecycleStatus());
  ipcMain.handle('app:setLifecycle', (_event, patch: unknown): AppLifecycleStatus => setAppLifecyclePrefs(patch));
}
