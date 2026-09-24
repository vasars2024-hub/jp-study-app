import path from 'node:path';
import { app, ipcMain, type BrowserWindowConstructorOptions } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';

/** Native OS frame + in-app chrome behavior. */
export type WindowChromeMode = 'standard' | 'borderless' | 'frameless';

export interface WindowChromePrefs {
  mode: WindowChromeMode;
}

const FILE_NAME = 'window-chrome.json';

function prefsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function parseMode(v: unknown): WindowChromeMode {
  if (v === 'borderless' || v === 'frameless') return v;
  // Legacy boolean storage: { borderless: true }
  if (v === true || (typeof v === 'object' && v !== null && (v as { borderless?: boolean }).borderless === true)) {
    return 'borderless';
  }
  return 'standard';
}

export function loadWindowChromePrefs(): WindowChromePrefs {
  try {
    const parsed = readJsonSync<{ mode?: unknown; borderless?: boolean }>(prefsPath(), {}, {
      validate: (v) => typeof v === 'object' && v !== null,
    });
    if (parsed.mode !== undefined) return { mode: parseMode(parsed.mode) };
    return { mode: parseMode(parsed.borderless) };
  } catch {
    return { mode: 'standard' };
  }
}

export function saveWindowChromePrefs(prefs: WindowChromePrefs): void {
  try {
    writeJsonAtomicSync(prefsPath(), { mode: prefs.mode }, { space: 0 });
  } catch {
    /* ignore */
  }
}

export type RecreateMainWindow = () => void;

export function registerWindowChromeIpc(recreateMainWindow: RecreateMainWindow): void {
  ipcMain.handle('shell:getWindowChromeMode', (): WindowChromeMode => loadWindowChromePrefs().mode);
  ipcMain.handle('shell:setWindowChromeMode', (_e, mode: unknown): WindowChromeMode => {
    const next = parseMode(mode);
    const cur = loadWindowChromePrefs();
    saveWindowChromePrefs({ mode: next });
    if (cur.mode !== next) recreateMainWindow();
    return next;
  });
  /** Legacy boolean bridge — prefer setWindowChromeMode. */
  ipcMain.handle('shell:getWindowBorderless', (): boolean => loadWindowChromePrefs().mode !== 'standard');
  ipcMain.handle('shell:setWindowBorderless', (_e, borderless: unknown): boolean => {
    const next: WindowChromeMode = borderless === true ? 'borderless' : 'standard';
    const cur = loadWindowChromePrefs();
    saveWindowChromePrefs({ mode: next });
    if (cur.mode !== next) recreateMainWindow();
    return next !== 'standard';
  });
}

export function mainWindowOptions(chrome: WindowChromePrefs): Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'thickFrame' | 'titleBarStyle'
> {
  const frameless = chrome.mode !== 'standard';
  if (!frameless) {
    return { frame: true, thickFrame: true };
  }
  // frame:false removes the native Windows title bar entirely.
  return {
    frame: false,
    thickFrame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
  };
}
