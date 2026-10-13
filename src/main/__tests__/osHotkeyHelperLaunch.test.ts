// @vitest-environment node
/**
 * What the OS-hotkey helper stores as the program to launch (main/osHotkeyHelper.ts).
 *
 * An installed copy used to store `process.execPath`, which lives in the versioned
 * `app-<v>\` folder that Squirrel deletes on the next update: every hotkey then
 * launched nothing until Gum was opened some other way. It now goes through the
 * stable `Update.exe --processStart`, like the sign-in entry (appLifecycle.ts).
 * Only the pure launch spec is exercised: nothing here writes the Startup folder,
 * starts PowerShell or touches the registry.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '', getAppPath: () => '', isPackaged: false },
  ipcMain: { handle: () => undefined },
}));

import { helperLaunchBase } from '../osHotkeyHelper';
import { loginItemSpec } from '../appLifecycle';

const ROOT = 'C:\\Users\\u\\AppData\\Local\\jp_study_app';
const EXE = `${ROOT}\\app-1.0.1\\jp-study-app.exe`;
const UPDATE = `${ROOT}\\Update.exe`;
const installed = (p: string) => p === UPDATE;

/** The helper's command line for one hotkey: base args, then the hotkey's action arg (HELPER_PS1). */
const commandLine = (base: { baseArgs: string[] }, action: string) => [...base.baseArgs, action].join(' ');

describe('OS-hotkey helper launch target', () => {
  it('an installed copy launches through Update.exe --processStart, which survives updates', () => {
    const base = helperLaunchBase({ execPath: EXE, isPackaged: true, platform: 'win32', appPath: '', cwd: 'C:\\x', exists: installed });
    expect(base).toEqual({
      exe: UPDATE,
      cwd: ROOT,
      baseArgs: ['--processStart', 'jp-study-app.exe', '--process-start-args'],
    });
    // Nothing the helper stores points into a versioned folder.
    expect(JSON.stringify(base)).not.toMatch(/app-\d/);
    // Each hotkey's action becomes the value of --process-start-args.
    expect(commandLine(base, '--toggle')).toBe('--processStart jp-study-app.exe --process-start-args --toggle');
    expect(commandLine(base, '--open=reading')).toBe('--processStart jp-study-app.exe --process-start-args --open=reading');
  });

  it('matches the sign-in entry: same Update.exe and the same exe name', () => {
    const base = helperLaunchBase({ execPath: EXE, isPackaged: true, platform: 'win32', appPath: '', cwd: '', exists: installed });
    const login = loginItemSpec(
      { keepRunningInTray: false, startAtLogin: true, startMinimized: false },
      { execPath: EXE, isPackaged: true, platform: 'win32', exists: installed },
    );
    expect(base.exe).toBe(login.path);
    expect(login.args.slice(0, 2)).toEqual(['--processStart', '"jp-study-app.exe"']);
    expect(base.baseArgs.slice(0, 2)).toEqual(['--processStart', 'jp-study-app.exe']);
  });

  it('the zip build keeps its own exe (it has no Update.exe)', () => {
    const exe = 'D:\\Gum\\jp-study-app.exe';
    expect(helperLaunchBase({ execPath: exe, isPackaged: true, platform: 'win32', appPath: '', cwd: 'C:\\x', exists: () => false })).toEqual({
      exe,
      cwd: 'D:\\Gum',
      baseArgs: [],
    });
    // An app-<v> folder without Update.exe beside it is not an install either.
    expect(helperLaunchBase({ execPath: EXE, isPackaged: true, platform: 'win32', appPath: '', cwd: '', exists: () => false }).exe).toBe(EXE);
  });

  it('dev runs electron.exe with the app path from the working directory', () => {
    const electron = 'C:\\repo\\node_modules\\electron\\dist\\electron.exe';
    expect(helperLaunchBase({ execPath: electron, isPackaged: false, platform: 'win32', appPath: 'C:\\repo', cwd: 'C:\\repo', exists: installed })).toEqual({
      exe: electron,
      cwd: 'C:\\repo',
      baseArgs: ['C:\\repo'],
    });
  });

  it('the helper puts base args first and the one action arg last, and every action is one token', () => {
    const src = readFileSync(resolve(__dirname, '..', 'osHotkeyHelper.ts'), 'utf8');
    expect(src).toContain('$all = @($baseQuoted) + @($actionQuoted)');
    expect(src).toContain('baseArgs: base.baseArgs');
    // buildEntry's action args: `['--toggle']`, `['--restart']`, [`--open=${section}`].
    const actions = [...src.matchAll(/buildEntry\([^)]*?,\s*(\[[^\]]*\])\)/g)].map((m) => m[1]!);
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const a of actions) expect(a.split(',').length, a).toBe(1);
  });
});
