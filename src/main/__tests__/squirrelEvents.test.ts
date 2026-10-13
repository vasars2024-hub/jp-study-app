// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_EXE_NAME,
  APP_USER_MODEL_ID,
  ENTRY_STARTUP_ALLOWANCE_MS,
  FILE_ASSOCIATIONS,
  HOOK_EXIT_MARGIN_MS,
  HOOK_STEP_BUDGET_MS,
  REG_IMPORT_TIMEOUT_MS,
  SQUIRREL_HOOK_LIMIT_MS,
  UPDATE_EXE_TIMEOUT_MS,
  LOGIN_ITEM_REG_VALUES,
  OS_HOTKEY_STARTUP_CMD,
  SQUIRREL_APP_ID,
  UNINSTALL_TIMEOUTS_MS,
  associationRegisterOps,
  associationUnregisterOps,
  bootEntry,
  buildRegFile,
  encodeRegFile,
  handleSquirrelStartup,
  helperScriptFromStartupCmd,
  hookWorstCaseMs,
  installBudgetMs,
  osHotkeyHelperIsOurs,
  osHotkeyStartupCmdPath,
  progIdFor,
  regString,
  runSquirrelEvent,
  squirrelEventOf,
  stopHotkeyHelperArgs,
  uninstallBudgetMs,
  updateExePath,
} from '../squirrelEvents';

const cp = vi.hoisted(() => ({ calls: [] as Array<{ file: string; args: string[]; opts: Record<string, unknown> }> }));
vi.mock('node:child_process', () => ({
  execFileSync: (file: string, args: string[], opts: Record<string, unknown>) => {
    cp.calls.push({ file, args, opts });
    return Buffer.alloc(0);
  },
}));

const EXE = 'C:\\Users\\u\\AppData\\Local\\jp_study_app\\app-1.0.1\\jp-study-app.exe';
const UPDATE = 'C:\\Users\\u\\AppData\\Local\\jp_study_app\\Update.exe';
const ROOT = 'C:\\Users\\u\\AppData\\Local\\jp_study_app';

/**
 * A scratch %APPDATA% for every uninstall: the real one holds the user's own
 * Startup folder, which a test must never read or change.
 */
const scratch: string[] = [];
function fakeAppData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gum-squirrel-test-'));
  scratch.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Writes the helper as osHotkeyHelper.ts does: script + config under userData, launcher in Startup. */
function plantHelper(appData: string, configExe: string | null) {
  const scriptDir = join(appData, 'jp-study-app-fake', 'os-hotkey');
  mkdirSync(scriptDir, { recursive: true });
  const script = join(scriptDir, 'helper.ps1');
  writeFileSync(script, '# helper', 'utf8');
  if (configExe !== null) {
    writeFileSync(join(scriptDir, 'config.json'), JSON.stringify({ version: 2, exe: configExe, cwd: '', baseArgs: [], hotkeys: [] }), 'utf8');
  }
  const cmd = osHotkeyStartupCmdPath(appData);
  mkdirSync(dirname(cmd), { recursive: true });
  writeFileSync(cmd, `@echo off\r\npowershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${script}"\r\n`, 'utf8');
  return { script, cmd };
}
const BOM = String.fromCharCode(0xfeff);

function recorder(failOn?: (file: string, args: readonly string[]) => boolean) {
  const calls: Array<{ file: string; args: readonly string[]; timeoutMs: number; regFile?: string }> = [];
  const run = (file: string, args: readonly string[], { timeoutMs }: { timeoutMs: number }) => {
    // The .reg file is deleted right after the import, so capture it now.
    const regFile = args[0] === 'import' ? readFileSync(args[1]!).toString('utf16le') : undefined;
    calls.push({ file, args, timeoutMs, regFile });
    if (failOn?.(file, args)) throw new Error('exit 1');
  };
  return { calls, run };
}

describe('squirrel event parsing', () => {
  it('reads the flag Squirrel passes after the exe, and nothing else', () => {
    expect(squirrelEventOf([EXE, '--squirrel-install', '1.0.1'])).toBe('install');
    expect(squirrelEventOf([EXE, '--squirrel-updated', '1.0.2'])).toBe('updated');
    expect(squirrelEventOf([EXE, '--squirrel-uninstall', '1.0.1'])).toBe('uninstall');
    expect(squirrelEventOf([EXE, '--squirrel-obsolete', '1.0.1'])).toBe('obsolete');
    expect(squirrelEventOf([EXE, '--squirrel-firstrun'])).toBe('firstrun');
    expect(squirrelEventOf([EXE])).toBeNull();
    expect(squirrelEventOf([EXE, '--open=library'])).toBeNull();
    // argv[0] is the exe and is never read as a flag.
    expect(squirrelEventOf(['--squirrel-install'])).toBeNull();
  });

  it('finds Update.exe one level above the versioned app folder', () => {
    expect(updateExePath(EXE)).toBe(UPDATE);
  });
});

describe('runSquirrelEvent', () => {
  it('install: desktop + Start-menu shortcuts through Update.exe, then ONE reg import of every association', () => {
    const { calls, run } = recorder();
    expect(runSquirrelEvent('install', { execPath: EXE, run })).toEqual([]);
    expect(calls[0]).toMatchObject({
      file: UPDATE,
      args: ['--createShortcut', 'jp-study-app.exe', '--shortcut-locations', 'Desktop,StartMenu'],
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ file: 'reg.exe', args: ['import', expect.stringMatching(/\.reg$/)] });
    expect(calls[1]!.regFile).toBe(BOM + buildRegFile(associationRegisterOps(EXE)));
    // The temp file is cleaned up.
    expect(existsSync(calls[1]!.args[1]!)).toBe(false);
    // Both steps together stay inside Squirrel's ~15 s.
    expect(calls[0]!.timeoutMs + calls[1]!.timeoutMs).toBeLessThan(15_000);
  });

  it('updated: Start menu only (a deleted desktop shortcut stays deleted) and re-points associations', () => {
    const { calls, run } = recorder();
    runSquirrelEvent('updated', { execPath: EXE, run });
    expect(calls[0]?.args).toEqual(['--createShortcut', 'jp-study-app.exe', '--shortcut-locations', 'StartMenu']);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.regFile).toContain(regString(`"${EXE}" "%1"`));
  });

  it('uninstall: removes the sign-in entry, shortcuts and every key it wrote, in one import', () => {
    const { calls, run } = recorder();
    expect(runSquirrelEvent('uninstall', { execPath: EXE, run, appData: fakeAppData() })).toEqual([]);
    // No helper launcher in this profile: no PowerShell at all.
    expect(calls.map((c) => c.file)).toEqual(['reg.exe', 'reg.exe', UPDATE, 'reg.exe']);
    expect(calls[0]!.args).toEqual(['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', APP_USER_MODEL_ID, '/f']);
    expect(calls[1]!.args).toEqual([
      'delete',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
      '/v',
      APP_USER_MODEL_ID,
      '/f',
    ]);
    expect(calls[2]).toMatchObject({ file: UPDATE, args: ['--removeShortcut', 'jp-study-app.exe'] });
    expect(calls[3]!.regFile).toBe(BOM + buildRegFile(associationUnregisterOps()));
    expect(calls.reduce((sum, c) => sum + c.timeoutMs, 0)).toBeLessThan(15_000);
  });

  it("uninstall: every step together stays inside Squirrel's ~15 s, helper included", () => {
    expect(uninstallBudgetMs()).toBeLessThanOrEqual(HOOK_STEP_BUDGET_MS);
    const appData = fakeAppData();
    plantHelper(appData, UPDATE);
    const { calls, run } = recorder();
    runSquirrelEvent('uninstall', { execPath: EXE, run, appData });
    expect(calls).toHaveLength(5);
    expect(calls.reduce((sum, c) => sum + c.timeoutMs, 0)).toBe(uninstallBudgetMs());
    for (const c of calls) expect(c.timeoutMs).toBeGreaterThan(0);
  });

  it('uninstall: deletes the OS-hotkey launcher and stops that helper first, by its script path', () => {
    const appData = fakeAppData();
    const { script, cmd } = plantHelper(appData, UPDATE);
    const { calls, run } = recorder();
    expect(runSquirrelEvent('uninstall', { execPath: EXE, run, appData })).toEqual([]);
    expect(existsSync(cmd)).toBe(false);
    expect(calls[0]).toMatchObject({
      file: 'powershell.exe',
      args: stopHotkeyHelperArgs(script),
      timeoutMs: UNINSTALL_TIMEOUTS_MS.stopHotkeyHelper,
    });
    expect(calls[0]!.args.at(-1)).toContain(script);
    // The helper's own files (userData) are the user's data and stay.
    expect(existsSync(script)).toBe(true);
    expect(calls.slice(1).map((c) => c.file)).toEqual(['reg.exe', 'reg.exe', UPDATE, 'reg.exe']);
  });

  it('uninstall: a helper written by an older build (exe in an app-<v> folder) is ours too', () => {
    const appData = fakeAppData();
    const { cmd } = plantHelper(appData, `${ROOT}\\app-0.9.0\\jp-study-app.exe`);
    const { calls, run } = recorder();
    runSquirrelEvent('uninstall', { execPath: EXE, run, appData });
    expect(existsSync(cmd)).toBe(false);
    expect(calls[0]!.file).toBe('powershell.exe');
  });

  it('uninstall: leaves a helper that launches a portable copy still on disk', () => {
    const appData = fakeAppData();
    const portable = join(appData, 'portable', 'jp-study-app.exe');
    mkdirSync(dirname(portable), { recursive: true });
    writeFileSync(portable, '');
    const { cmd } = plantHelper(appData, portable);
    const logs: string[] = [];
    const { calls, run } = recorder();
    expect(runSquirrelEvent('uninstall', { execPath: EXE, run, appData, log: (m) => logs.push(m) })).toEqual([]);
    expect(existsSync(cmd)).toBe(true);
    expect(calls.some((c) => c.file === 'powershell.exe')).toBe(false);
    expect(logs.join('\n')).toContain('left in place');
  });

  it('uninstall: removes a helper whose target is gone or unreadable', () => {
    for (const exe of [join(fakeAppData(), 'gone', 'jp-study-app.exe'), null]) {
      const appData = fakeAppData();
      const { cmd } = plantHelper(appData, exe);
      const { calls, run } = recorder();
      runSquirrelEvent('uninstall', { execPath: EXE, run, appData });
      expect(existsSync(cmd), String(exe)).toBe(false);
      expect(calls[0]!.file).toBe('powershell.exe');
    }
  });

  it('uninstall: a failed helper stop or reg delete is reported and the rest still runs', () => {
    const appData = fakeAppData();
    const { cmd } = plantHelper(appData, UPDATE);
    const logs: string[] = [];
    const { calls, run } = recorder((file, args) => file === 'powershell.exe' || args[0] === 'delete');
    const failed = runSquirrelEvent('uninstall', { execPath: EXE, run, appData, log: (m) => logs.push(m) });
    expect(failed).toEqual(['stop hotkey helper', ...LOGIN_ITEM_REG_VALUES.map((v) => v.label)]);
    expect(existsSync(cmd)).toBe(false);
    expect(calls.map((c) => c.file)).toEqual(['powershell.exe', 'reg.exe', 'reg.exe', UPDATE, 'reg.exe']);
  });

  it('obsolete and firstrun touch nothing', () => {
    const { calls, run } = recorder();
    runSquirrelEvent('obsolete', { execPath: EXE, run });
    runSquirrelEvent('firstrun', { execPath: EXE, run });
    expect(calls).toEqual([]);
  });

  it('a failing step is reported, logged and never aborts the rest', () => {
    const logs: string[] = [];
    const { calls, run } = recorder((file) => file === UPDATE);
    const failed = runSquirrelEvent('uninstall', { execPath: EXE, run, log: (m) => logs.push(m), appData: fakeAppData() });
    expect(failed).toEqual(['removeShortcut']);
    expect(logs[0]).toContain('removeShortcut failed');
    expect(calls.length).toBe(4);
  });

  it('a failed import is reported and still deletes the temp file', () => {
    const logs: string[] = [];
    const { calls, run } = recorder((file) => file === 'reg.exe');
    const failed = runSquirrelEvent('install', { execPath: EXE, run, log: (m) => logs.push(m) });
    expect(failed).toEqual(['reg import']);
    expect(existsSync(calls[1]!.args[1]!)).toBe(false);
  });
});

describe("the whole hook fits Squirrel's 15 s", () => {
  it('start-up allowance + every step + exit margin, for each event, is within the limit', () => {
    expect(SQUIRREL_HOOK_LIMIT_MS).toBe(15_000);
    expect(HOOK_STEP_BUDGET_MS).toBe(SQUIRREL_HOOK_LIMIT_MS - ENTRY_STARTUP_ALLOWANCE_MS - HOOK_EXIT_MARGIN_MS);
    for (const event of ['install', 'updated', 'uninstall', 'obsolete'] as const) {
      expect(hookWorstCaseMs(event), event).toBeLessThanOrEqual(SQUIRREL_HOOK_LIMIT_MS);
    }
    expect(installBudgetMs()).toBe(UPDATE_EXE_TIMEOUT_MS + REG_IMPORT_TIMEOUT_MS);
    expect(installBudgetMs()).toBeLessThanOrEqual(HOOK_STEP_BUDGET_MS);
    expect(uninstallBudgetMs()).toBeLessThanOrEqual(HOOK_STEP_BUDGET_MS);
  });

  it('the start-up allowance covers the measured entry start with room for a cold machine', () => {
    // Measured 2026-10-13 (squirrelEvents.ts): JS start ~135 ms from PowerShell, ~1,050 ms
    // from Git Bash; the new entry reaches the first step 2 ms after that. An allowance
    // below the slow figure would be a budget nobody measured.
    expect(ENTRY_STARTUP_ALLOWANCE_MS).toBeGreaterThanOrEqual(2 * 1_050);
    // ...and the steps still get most of the 15 s: no step budget below the old one's
    // install minimum (Update.exe and reg import must each keep several seconds).
    expect(UPDATE_EXE_TIMEOUT_MS).toBeGreaterThanOrEqual(4_000);
    expect(REG_IMPORT_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('what a real install records adds up to the step budget, not more', () => {
    const { calls, run } = recorder();
    runSquirrelEvent('install', { execPath: EXE, run });
    expect(ENTRY_STARTUP_ALLOWANCE_MS + calls.reduce((sum, c) => sum + c.timeoutMs, 0) + HOOK_EXIT_MARGIN_MS).toBeLessThanOrEqual(
      SQUIRREL_HOOK_LIMIT_MS,
    );
  });
});

describe('bootEntry (src/squirrelEntry.ts)', () => {
  function entry(argv: string[], platform = 'win32', handle?: () => boolean) {
    const seen = { exit: [] as number[], loaded: 0, handled: [] as Array<readonly string[]>, logs: [] as string[] };
    const result = bootEntry({
      argv,
      platform,
      exit: (code) => seen.exit.push(code),
      loadApp: () => {
        seen.loaded += 1;
      },
      handle:
        handle ??
        ((a) => {
          seen.handled.push(a);
          return true;
        }),
      log: (m) => seen.logs.push(m),
    });
    return { result, ...seen };
  }

  it('services every lifecycle event and exits WITHOUT loading the app', () => {
    for (const flag of ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete']) {
      const r = entry([EXE, flag, '1.0.1']);
      expect(r, flag).toMatchObject({ result: 'squirrel', exit: [0], loaded: 0 });
      expect(r.handled, flag).toEqual([[EXE, flag, '1.0.1']]);
    }
  });

  it('loads the app for a normal launch, --squirrel-firstrun, and any non-Windows platform', () => {
    for (const [argv, platform] of [
      [[EXE], 'win32'],
      [[EXE, '--open=library'], 'win32'],
      [[EXE, '--squirrel-firstrun'], 'win32'],
      [[EXE, '--squirrel-install', '1.0.1'], 'linux'],
    ] as const) {
      const r = entry([...argv], platform);
      expect(r, `${argv.join(' ')} on ${platform}`).toMatchObject({ result: 'app', exit: [], loaded: 1, handled: [] });
    }
  });

  it('a hook that throws still exits, and never falls through to the app', () => {
    const r = entry([EXE, '--squirrel-install', '1.0.1'], 'win32', () => {
      throw new Error('boom');
    });
    expect(r).toMatchObject({ result: 'squirrel', exit: [0], loaded: 0 });
    expect(r.logs.join('\n')).toContain('install hook threw: boom');
  });

  it('by default runs the real hook (handleSquirrelStartup), which does the install steps', () => {
    cp.calls.length = 0;
    const exits: number[] = [];
    // `--squirrel-obsolete` is a lifecycle launch with no steps: nothing is spawned.
    expect(bootEntry({ argv: [EXE, '--squirrel-obsolete', '1.0.1'], platform: 'win32', exit: (c) => exits.push(c), loadApp: () => undefined })).toBe(
      'squirrel',
    );
    expect(exits).toEqual([0]);
    expect(cp.calls).toEqual([]);
  });
});

describe('default runner', () => {
  beforeEach(() => {
    cp.calls.length = 0;
  });

  it('spawns Update.exe once and reg.exe once, hidden, each with a timeout under 15 s', () => {
    expect(runSquirrelEvent('updated', { execPath: EXE })).toEqual([]);
    expect(cp.calls.map((c) => c.file)).toEqual([UPDATE, 'reg.exe']);
    for (const c of cp.calls) {
      expect(c.opts.windowsHide).toBe(true);
      expect(c.opts.timeout).toBeGreaterThan(0);
      expect(c.opts.timeout as number).toBeLessThan(15_000);
    }
    expect(cp.calls[1]!.args[0]).toBe('import');
    expect((cp.calls[0]!.opts.timeout as number) + (cp.calls[1]!.opts.timeout as number)).toBeLessThan(15_000);
  });

  it('uninstall spawns PowerShell, reg.exe and Update.exe hidden, all within 15 s together (mocked, never for real)', () => {
    const appData = fakeAppData();
    plantHelper(appData, UPDATE);
    expect(runSquirrelEvent('uninstall', { execPath: EXE, appData })).toEqual([]);
    expect(cp.calls.map((c) => c.file)).toEqual(['powershell.exe', 'reg.exe', 'reg.exe', UPDATE, 'reg.exe']);
    for (const c of cp.calls) expect(c.opts.windowsHide).toBe(true);
    expect(cp.calls.reduce((sum, c) => sum + (c.opts.timeout as number), 0)).toBeLessThan(15_000);
  });
});

describe('file association registry shape', () => {
  const ops = associationRegisterOps(EXE);

  it('registers exactly the advertised types, all under HKCU (no admin)', () => {
    expect(FILE_ASSOCIATIONS.map((a) => a.ext)).toEqual(['.epub', '.cbz', '.apkg', '.srt', '.ass', '.mkv', '.mp4']);
    expect(ops.every((o) => o.key.startsWith('HKCU\\Software\\Classes\\'))).toBe(true);
    expect(associationUnregisterOps().every((o) => o.key.startsWith('HKCU\\Software\\Classes\\'))).toBe(true);
    // Same shape as the former reg.exe calls: 3 app values + 8 per type.
    expect(ops).toHaveLength(3 + 8 * FILE_ASSOCIATIONS.length);
  });

  it('joins each type\'s "Open with" list and adds a verb, but never takes over its default handler', () => {
    for (const { ext } of FILE_ASSOCIATIONS) {
      expect(ops).toContainEqual(
        { op: 'set', key: `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, name: progIdFor(ext), type: 'REG_NONE' },
      );
      expect(ops).toContainEqual({
        op: 'set', key: `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\OpenWithGum\\command`,
        name: null, type: 'REG_SZ', data: `"${EXE}" "%1"`,
      });
      // Writing the extension key's default value is what would steal the type.
      expect(ops.some((o) => o.key === `HKCU\\Software\\Classes\\${ext}`)).toBe(false);
    }
  });

  it('names the app "Gum" in Open with', () => {
    expect(ops).toContainEqual({
      op: 'set', key: `HKCU\\Software\\Classes\\Applications\\${APP_EXE_NAME}`, name: 'FriendlyAppName', type: 'REG_SZ', data: 'Gum',
    });
  });

  it('uninstall removes the app key, each ProgID, each verb and each Open-with entry', () => {
    const un = associationUnregisterOps();
    expect(un[0]).toEqual({ op: 'deleteKey', key: `HKCU\\Software\\Classes\\Applications\\${APP_EXE_NAME}` });
    for (const { ext } of FILE_ASSOCIATIONS) {
      expect(un).toContainEqual({ op: 'deleteKey', key: `HKCU\\Software\\Classes\\${progIdFor(ext)}` });
      expect(un).toContainEqual({ op: 'deleteValue', key: `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, name: progIdFor(ext) });
      expect(un).toContainEqual({ op: 'deleteKey', key: `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\OpenWithGum` });
    }
    expect(un).toHaveLength(1 + 3 * FILE_ASSOCIATIONS.length);
  });
});

describe('buildRegFile', () => {
  it('writes the regedit 5 header, full hive names, CRLF and escaped strings', () => {
    const text = buildRegFile([
      { op: 'set', key: 'HKCU\\Software\\Classes\\A', name: null, type: 'REG_SZ', data: '"C:\\x\\y.exe" "%1"' },
      { op: 'set', key: 'HKCU\\Software\\Classes\\A', name: 'Icon', type: 'REG_SZ', data: '"C:\\x\\y.exe",0' },
      { op: 'set', key: 'HKCU\\Software\\Classes\\A\\T', name: '.epub', type: 'REG_SZ', data: '' },
      { op: 'set', key: 'HKCU\\Software\\Classes\\.epub\\OpenWithProgids', name: 'Gum.epub', type: 'REG_NONE' },
    ]);
    expect(text).toBe([
      'Windows Registry Editor Version 5.00',
      '',
      '[HKEY_CURRENT_USER\\Software\\Classes\\A]',
      '@="\\"C:\\\\x\\\\y.exe\\" \\"%1\\""',
      '"Icon"="\\"C:\\\\x\\\\y.exe\\",0"',
      '',
      '[HKEY_CURRENT_USER\\Software\\Classes\\A\\T]',
      '".epub"=""',
      '',
      '[HKEY_CURRENT_USER\\Software\\Classes\\.epub\\OpenWithProgids]',
      '"Gum.epub"=hex(0):',
      '',
    ].join('\r\n'));
  });

  it('removes keys with [-key] and values with "name"=-', () => {
    const text = buildRegFile(associationUnregisterOps());
    expect(text.startsWith('Windows Registry Editor Version 5.00\r\n')).toBe(true);
    expect(text).toContain(`\r\n[-HKEY_CURRENT_USER\\Software\\Classes\\Applications\\${APP_EXE_NAME}]\r\n`);
    expect(text).toContain('\r\n[-HKEY_CURRENT_USER\\Software\\Classes\\Gum.epub]\r\n');
    expect(text).toContain('\r\n[HKEY_CURRENT_USER\\Software\\Classes\\.epub\\OpenWithProgids]\r\n"Gum.epub"=-\r\n');
    expect(text).toContain('\r\n[-HKEY_CURRENT_USER\\Software\\Classes\\SystemFileAssociations\\.epub\\shell\\OpenWithGum]\r\n');
    expect(text).not.toContain('HKCU');
  });

  it('keeps a non-ASCII install path intact as UTF-16LE with a BOM', () => {
    const exe = 'C:\\Users\\山田\\AppData\\Local\\jp_study_app\\app-1.0.1\\jp-study-app.exe';
    const buf = encodeRegFile(buildRegFile(associationRegisterOps(exe)));
    expect([...buf.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(buf.toString('utf16le')).toContain('C:\\\\Users\\\\山田\\\\AppData');
  });

  it('rejects line breaks a .reg string cannot hold', () => {
    expect(() => regString('a\nb')).toThrow();
  });
});

describe('handleSquirrelStartup', () => {
  it('handles install/update/uninstall/obsolete and tells main to skip the lock', () => {
    const { run } = recorder();
    expect(handleSquirrelStartup([EXE, '--squirrel-install', '1.0.1'], { platform: 'win32', execPath: EXE, run })).toBe(true);
    expect(handleSquirrelStartup([EXE, '--squirrel-obsolete', '1.0.1'], { platform: 'win32', execPath: EXE, run })).toBe(true);
  });

  it('passes the profile through to the uninstall cleanup', () => {
    const appData = fakeAppData();
    const { cmd } = plantHelper(appData, UPDATE);
    const { calls, run } = recorder();
    expect(
      handleSquirrelStartup([EXE, '--squirrel-uninstall', '1.0.1'], { platform: 'win32', execPath: EXE, run, appData, log: () => undefined }),
    ).toBe(true);
    expect(existsSync(cmd)).toBe(false);
    expect(calls[0]!.file).toBe('powershell.exe');
  });

  it('is a normal launch for firstrun, no flag, and any non-Windows platform', () => {
    const { calls, run } = recorder();
    expect(handleSquirrelStartup([EXE, '--squirrel-firstrun'], { platform: 'win32', execPath: EXE, run })).toBe(false);
    expect(handleSquirrelStartup([EXE], { platform: 'win32', execPath: EXE, run })).toBe(false);
    expect(handleSquirrelStartup([EXE, '--squirrel-install'], { platform: 'linux', execPath: EXE, run })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('installer identity matches forge.config.ts', () => {
  const forge = readFileSync(resolve(__dirname, '..', '..', '..', 'forge.config.ts'), 'utf8');

  it('uses the same Squirrel id, so the install folder and shortcut AUMID are what main expects', () => {
    expect(forge).toContain(`const SQUIRREL_APP_ID = '${SQUIRREL_APP_ID}';`);
    expect(forge).toMatch(/new MakerSquirrel\(\{\s*name: SQUIRREL_APP_ID,/);
    expect(forge).toContain(`exe: '${APP_EXE_NAME}'`);
    expect(APP_USER_MODEL_ID).toBe('com.squirrel.jp_study_app.jp-study-app');
  });

  it('keeps the zip maker beside the installer', () => {
    expect(forge).toContain("new MakerZIP({}, ['win32', 'darwin'])");
  });

  it('`npm run publish` builds the release from the pruned app too, never a bare forge publish', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const publish = pkg.scripts.publish!;
    const commands = publish.split('&&').map((c) => c.trim());
    expect(commands.filter((c) => /^(?:npx\s+)?electron-forge\s+(?:publish|make)\b/.test(c))).toEqual([]);
    expect(publish).toContain('node tools/package-app.cjs --installer --zip');
    expect(publish.indexOf('check-runtime-assets.cjs')).toBeLessThan(publish.indexOf('package-app.cjs'));
    expect(publish).toMatch(/UNPRUNED/);
    // A release keeps the CUDA backends unless someone chooses otherwise for it.
    expect(publish).not.toContain('--drop-cuda');
    expect(pkg.scripts.make!).not.toContain('--drop-cuda');
    expect(pkg.scripts['package:installer']!).not.toContain('--drop-cuda');
  });

  it('`npm run make` cannot build an installer from the unpruned app', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const make = pkg.scripts.make!;
    // A bare `electron-forge make` packages ~2 GB of node_modules into the nupkg.
    const commands = make.split('&&').map((c) => c.trim());
    expect(commands.filter((c) => /^(?:npx\s+)?electron-forge\s+make\b/.test(c))).toEqual([]);
    expect(make).toContain('node tools/package-app.cjs --installer');
    // The asset preflight still runs first (runtimeAssets.test.ts).
    expect(make.indexOf('check-runtime-assets.cjs')).toBeLessThan(make.indexOf('package-app.cjs'));
    // The script says why, so nobody "fixes" it back.
    expect(make).toMatch(/UNPRUNED/);
  });
});

describe('uninstall cleanup helpers', () => {
  it('the launcher path and name are the ones osHotkeyHelper.ts writes', () => {
    expect(osHotkeyStartupCmdPath('C:\\Users\\u\\AppData\\Roaming')).toBe(
      `C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\${OS_HOTKEY_STARTUP_CMD}`,
    );
    const helperSrc = readFileSync(resolve(__dirname, '..', 'osHotkeyHelper.ts'), 'utf8');
    expect(helperSrc).toContain('osHotkeyStartupCmdPath(');
    // The launcher line helperScriptFromStartupCmd reads back.
    expect(helperSrc).toContain('-File "${scriptPath()}"');
  });

  it('reads the helper script out of the launcher', () => {
    const cmd =
      '@echo off\r\npowershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\\Users\\u\\AppData\\Roaming\\jp-study-app\\os-hotkey\\helper.ps1"\r\n';
    expect(helperScriptFromStartupCmd(cmd)).toBe('C:\\Users\\u\\AppData\\Roaming\\jp-study-app\\os-hotkey\\helper.ps1');
    expect(helperScriptFromStartupCmd('@echo off\r\n')).toBeNull();
  });

  it('owns a helper launching anything in the install root, or nothing that exists', () => {
    const none = () => false;
    const all = () => true;
    expect(osHotkeyHelperIsOurs(ROOT, UPDATE, all)).toBe(true);
    expect(osHotkeyHelperIsOurs(ROOT, UPDATE.toUpperCase(), all)).toBe(true);
    expect(osHotkeyHelperIsOurs(ROOT, `${ROOT}\\app-0.9.0\\jp-study-app.exe`, all)).toBe(true);
    expect(osHotkeyHelperIsOurs(ROOT, null, all)).toBe(true);
    expect(osHotkeyHelperIsOurs(ROOT, 'D:\\Gum\\jp-study-app.exe', all)).toBe(false);
    expect(osHotkeyHelperIsOurs(ROOT, 'D:\\Gum\\jp-study-app.exe', none)).toBe(true);
    // A sibling folder that merely starts with the same name is not inside the root.
    expect(osHotkeyHelperIsOurs(ROOT, `${ROOT}_old\\jp-study-app.exe`, all)).toBe(false);
  });

  it('stops only the process running that exact script, with the path quoted for PowerShell', () => {
    const args = stopHotkeyHelperArgs("C:\\Users\\o'brien\\os-hotkey\\helper.ps1");
    expect(args.slice(0, -1)).toEqual(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']);
    const script = args.at(-1)!;
    expect(script).toContain("$s = 'C:\\Users\\o''brien\\os-hotkey\\helper.ps1';");
    expect(script).toContain("Name='powershell.exe'");
    expect(script).toContain('$_.CommandLine.IndexOf($s');
    expect(script).toContain('Stop-Process -Id $_.ProcessId -Force');
  });

  it('the login-item values are the ones Electron writes for this AUMID', () => {
    expect(LOGIN_ITEM_REG_VALUES.map((v) => v.name)).toEqual([APP_USER_MODEL_ID, APP_USER_MODEL_ID]);
    expect(LOGIN_ITEM_REG_VALUES.every((v) => v.key.startsWith('HKCU\\'))).toBe(true);
  });
});
