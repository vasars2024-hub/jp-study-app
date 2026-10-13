/**
 * Squirrel.Windows install lifecycle: shortcuts, file associations, uninstall.
 *
 * The Windows installer is Squirrel (`@electron-forge/maker-squirrel`, see
 * `forge.config.ts`). Squirrel installs per-user into
 * `%LOCALAPPDATA%\<SQUIRREL_APP_ID>\app-<version>\` and launches the app exe with one
 * of these flags so the app can do its own setup, then gives it ~15 s to exit:
 *
 *   --squirrel-install <v>    first install         -> shortcuts + file associations
 *   --squirrel-updated <v>    new version installed -> re-point associations at it
 *   --squirrel-uninstall <v>  uninstall             -> remove both, the sign-in entry and the
 *                                                     OS-hotkey helper (Startup launcher + process)
 *   --squirrel-obsolete <v>   old version retired   -> nothing, just exit
 *   --squirrel-firstrun       first normal launch   -> a normal launch
 *
 * This replaces `electron-squirrel-startup`, which only made shortcuts and was
 * imported but never configured (the app shipped a zip, so it never ran).
 *
 * Everything here is SYNCHRONOUS on purpose, and it runs from `src/squirrelEntry.ts`
 * (`bootEntry`), the bundle Electron starts, BEFORE the app bundle is even loaded and so
 * long before `requestSingleInstanceLock()`: during an update the old copy is usually
 * still running, and a lock request from this process would forward
 * `--squirrel-updated` into it as a `second-instance` event (window pops to the
 * front, nothing installs). Handling first and never taking the lock avoids that.
 * The work is one `Update.exe` call and ONE `reg import` of a generated `.reg`
 * file; uninstall adds two `reg delete`s and one PowerShell. Every step's timeout,
 * plus the measured start-up allowance and an exit margin, fits Squirrel's 15 s
 * (`hookWorstCaseMs`, `SQUIRREL_HOOK_LIMIT_MS`).
 *
 * This module is the entry's ONLY non-builtin import, so it must stay cheap: Node
 * builtins only, never Electron, never another app module (`squirrelEntryGraph.test.ts`).
 *
 * File associations are written under HKCU\Software\Classes (no admin), and they
 * are deliberately polite: Gum is added to each type's "Open with" list and gets
 * an "Open with Gum" right-click verb, but it never takes over a type's default
 * handler. Re-registered on every `--squirrel-updated`, because the exe path
 * contains the version folder and the previous one is deleted after an update.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Squirrel's package id. MUST equal `MakerSquirrel({ name })` in forge.config.ts —
 * it names the install folder and the shortcut AUMID. Squirrel rejects hyphens,
 * which is why it is not `jp-study-app`. `squirrelEvents.test.ts` fails on drift.
 */
export const SQUIRREL_APP_ID = 'jp_study_app';
/** The packaged executable. Kept as `jp-study-app.exe` (see forge.config.ts). */
export const APP_EXE_NAME = 'jp-study-app.exe';
/**
 * The AppUserModelID Squirrel stamps on the shortcuts it creates
 * (`com.squirrel.<id>.<exe without .exe>`; Update.exe offers no way to choose it).
 * An installed copy must run under the same id or Windows treats it as a
 * different app: taskbar pins split from the Start-menu entry and toast
 * notifications lose their attribution. `main.ts` sets it for every build, so the
 * portable zip and an installed copy are the same app to Windows.
 */
export const APP_USER_MODEL_ID = `com.squirrel.${SQUIRREL_APP_ID}.${APP_EXE_NAME.replace(/\.exe$/i, '')}`;
/** Shown in "Open with", the right-click verb and the ProgID descriptions. */
export const APP_DISPLAY_NAME = 'Gum';

/** One file type Gum offers to open, and how Explorer should describe it. */
export interface FileAssociation {
  ext: string;
  /** Friendly type name for the ProgID ("EPUB book"). */
  description: string;
}

/**
 * The types an installed Gum registers for. `fileOpenRouter.ts` accepts exactly
 * these from the command line, and the renderer's DropRouter decides where each
 * goes (book/manga reader, Anki import, subtitle attach, media player).
 */
export const FILE_ASSOCIATIONS: readonly FileAssociation[] = [
  { ext: '.epub', description: 'EPUB book' },
  { ext: '.cbz', description: 'Comic book archive' },
  { ext: '.apkg', description: 'Anki deck package' },
  { ext: '.srt', description: 'SubRip subtitles' },
  { ext: '.ass', description: 'Advanced SubStation subtitles' },
  { ext: '.mkv', description: 'Matroska video' },
  { ext: '.mp4', description: 'MP4 video' },
];

export type SquirrelEvent = 'install' | 'updated' | 'uninstall' | 'obsolete' | 'firstrun';

const EVENT_FLAGS: Record<string, SquirrelEvent> = {
  '--squirrel-install': 'install',
  '--squirrel-updated': 'updated',
  '--squirrel-uninstall': 'uninstall',
  '--squirrel-obsolete': 'obsolete',
  '--squirrel-firstrun': 'firstrun',
};

/** The Squirrel event this process was launched for, or null for a normal launch. */
export function squirrelEventOf(argv: readonly string[]): SquirrelEvent | null {
  for (const arg of argv.slice(1)) {
    const event = EVENT_FLAGS[arg.toLowerCase()];
    if (event) return event;
  }
  return null;
}

/** `<install root>\Update.exe` for an exe at `<install root>\app-<v>\<exe>`. */
export function updateExePath(execPath: string): string {
  return path.resolve(path.dirname(execPath), '..', 'Update.exe');
}

const CLASSES = 'HKCU\\Software\\Classes';

/** ProgID per extension: `Gum.epub`, `Gum.mkv`, … */
export function progIdFor(ext: string): string {
  return `${APP_DISPLAY_NAME}.${ext.replace(/^\./, '').toLowerCase()}`;
}

/**
 * One registry operation. Keys are written `HKCU\...`; `name: null` is the key's
 * default value (`reg add /ve`). The whole list becomes ONE `.reg` file imported by
 * a single `reg import`: Squirrel kills the hook after ~15 s, and ~60 separate
 * `reg.exe` launches could not be trusted to fit on a slow or AV-scanned machine.
 */
export type RegOp =
  | { op: 'set'; key: string; name: string | null; type: 'REG_SZ'; data: string }
  | { op: 'set'; key: string; name: string; type: 'REG_NONE' }
  | { op: 'deleteKey'; key: string }
  | { op: 'deleteValue'; key: string; name: string };

/**
 * The writes that register every association for `exePath`. Pure, so the exact
 * registry shape is pinned by a test rather than discovered on a user's PC.
 */
export function associationRegisterOps(exePath: string): RegOp[] {
  const open = `"${exePath}" "%1"`;
  const icon = `"${exePath}",0`;
  const app = `${CLASSES}\\Applications\\${APP_EXE_NAME}`;
  const sz = (key: string, name: string | null, data: string): RegOp => ({ op: 'set', key, name, type: 'REG_SZ', data });
  const ops: RegOp[] = [
    // How "Open with" names and launches the exe, and which types it lists it for.
    sz(app, 'FriendlyAppName', APP_DISPLAY_NAME),
    sz(`${app}\\DefaultIcon`, null, icon),
    sz(`${app}\\shell\\open\\command`, null, open),
  ];
  for (const { ext, description } of FILE_ASSOCIATIONS) {
    const progId = progIdFor(ext);
    const prog = `${CLASSES}\\${progId}`;
    const verb = `${CLASSES}\\SystemFileAssociations\\${ext}\\shell\\OpenWith${APP_DISPLAY_NAME}`;
    ops.push(
      sz(`${app}\\SupportedTypes`, ext, ''),
      sz(prog, null, `${description} (${APP_DISPLAY_NAME})`),
      sz(`${prog}\\DefaultIcon`, null, icon),
      sz(`${prog}\\shell\\open\\command`, null, open),
      // Listed under "Open with" for the type, without becoming its default.
      { op: 'set', key: `${CLASSES}\\${ext}\\OpenWithProgids`, name: progId, type: 'REG_NONE' },
      // The right-click "Open with Gum" verb, present whatever the default app is.
      sz(verb, null, `Open with ${APP_DISPLAY_NAME}`),
      sz(verb, 'Icon', icon),
      sz(`${verb}\\command`, null, open),
    );
  }
  return ops;
}

/** The removals that undo `associationRegisterOps`. */
export function associationUnregisterOps(): RegOp[] {
  const ops: RegOp[] = [{ op: 'deleteKey', key: `${CLASSES}\\Applications\\${APP_EXE_NAME}` }];
  for (const { ext } of FILE_ASSOCIATIONS) {
    const progId = progIdFor(ext);
    ops.push(
      { op: 'deleteKey', key: `${CLASSES}\\${progId}` },
      { op: 'deleteValue', key: `${CLASSES}\\${ext}\\OpenWithProgids`, name: progId },
      { op: 'deleteKey', key: `${CLASSES}\\SystemFileAssociations\\${ext}\\shell\\OpenWith${APP_DISPLAY_NAME}` },
    );
  }
  return ops;
}

/** `HKCU\...` -> `HKEY_CURRENT_USER\...` (a `.reg` file needs the full hive name). */
function regFileKey(key: string): string {
  return key.replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\');
}

/** A `.reg` string literal: backslashes and double quotes escaped. */
export function regString(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('registry string values cannot contain line breaks');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The text of a `.reg` file applying `ops` in order (CRLF line endings, no BOM —
 * `encodeRegFile` adds it). Consecutive ops on one key share a `[key]` section;
 * repeating a section later in the file is valid.
 */
export function buildRegFile(ops: readonly RegOp[]): string {
  const lines = ['Windows Registry Editor Version 5.00'];
  let section: string | null = null;
  for (const op of ops) {
    const key = regFileKey(op.key);
    if (op.op === 'deleteKey') {
      lines.push('', `[-${key}]`);
      section = null;
      continue;
    }
    if (section !== key) {
      lines.push('', `[${key}]`);
      section = key;
    }
    if (op.op === 'deleteValue') {
      lines.push(`${regString(op.name)}=-`);
    } else {
      const name = op.name === null ? '@' : regString(op.name);
      lines.push(op.type === 'REG_NONE' ? `${name}=hex(0):` : `${name}=${regString(op.data)}`);
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** UTF-16LE with a BOM: what `reg import` reads most reliably, and safe for any exe path. */
export function encodeRegFile(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}

/** Synchronous process runner; throws on a non-zero exit like `execFileSync`. */
export type SyncRunner = (file: string, args: readonly string[], options: { timeoutMs: number }) => void;

/**
 * THE BUDGET. Squirrel.Windows waits this long for a lifecycle launch to exit, then gives
 * up on it (Update.exe's hook timeout). Everything below has to fit inside it: the time the
 * process takes to reach the hook, every step's worst case, and the exit.
 */
export const SQUIRREL_HOOK_LIMIT_MS = 15_000;

/**
 * Spawn -> first hook step. Measured 2026-10-13 on the owner's machine:
 * `electron <production build> --squirrel-install 1.0.1`, scratch profile, hidden, the
 * steps stubbed (no Update.exe, no reg.exe), 7 runs each, medians:
 *
 *                                   JS starts   first step   process exit
 *   src/main.ts as the entry          133 ms       440 ms        629 ms
 *   src/squirrelEntry.ts (now)        135 ms       137 ms        153 ms
 *
 * So the app bundle (~4.8 MB main chunk plus linkedom, adm-zip & co.) cost ~305 ms on a
 * warm cache before the hook could start; the entry reaches it 2 ms after JS starts. The
 * rest is Electron's own start, which no entry can shorten, and which varies a lot with
 * the launching environment (the same runs from Git Bash: ~1,050 ms). The allowance is
 * twice that slowest figure plus headroom, for a cold first install whose freshly
 * extracted electron.exe an antivirus scans before it runs; a cold VM is the owner's to
 * measure (docs/RELEASING.md, "Squirrel hook budget").
 */
export const ENTRY_STARTUP_ALLOWANCE_MS = 2_500;

/** After the last step: the `.reg` temp file's removal, `app.exit` and Squirrel noticing. */
export const HOOK_EXIT_MARGIN_MS = 1_000;

/** What the timed steps of one event may add up to. */
export const HOOK_STEP_BUDGET_MS = SQUIRREL_HOOK_LIMIT_MS - ENTRY_STARTUP_ALLOWANCE_MS - HOOK_EXIT_MARGIN_MS;

/**
 * Install/update: one Update.exe (a .NET start plus two .lnk writes, ~0.5 s warm) and one
 * `reg import` of ~60 values (well under a second). The margins are for a slow or
 * AV-scanned machine; together they are exactly `HOOK_STEP_BUDGET_MS`.
 */
export const UPDATE_EXE_TIMEOUT_MS = 4_500;
export const REG_IMPORT_TIMEOUT_MS = 7_000;

/**
 * Uninstall does more than install, so its steps get their own, smaller budgets:
 * every step's worst case added together (`uninstallBudgetMs`) is at most
 * `HOOK_STEP_BUDGET_MS`. `reg delete` and the `reg import` of ~22 removals finish in well
 * under a second on a normal machine; the margins are for a slow or AV-scanned one.
 */
export const UNINSTALL_TIMEOUTS_MS = Object.freeze({
  /** One PowerShell that finds the OS-hotkey helper by its script path and stops it. */
  stopHotkeyHelper: 2_000,
  /** Each `reg delete` of a login-item value. */
  regDelete: 750,
  removeShortcut: UPDATE_EXE_TIMEOUT_MS,
  regImport: 3_500,
});

/** The worst case of every timed install (or update) step together. */
export function installBudgetMs(): number {
  return UPDATE_EXE_TIMEOUT_MS + REG_IMPORT_TIMEOUT_MS;
}

/** The worst case of every timed uninstall step together. */
export function uninstallBudgetMs(): number {
  const t = UNINSTALL_TIMEOUTS_MS;
  return t.stopHotkeyHelper + LOGIN_ITEM_REG_VALUES.length * t.regDelete + t.removeShortcut + t.regImport;
}

/** Spawn to exit, worst case, for one event: what has to stay within `SQUIRREL_HOOK_LIMIT_MS`. */
export function hookWorstCaseMs(event: SquirrelEvent): number {
  const steps = event === 'install' || event === 'updated' ? installBudgetMs() : event === 'uninstall' ? uninstallBudgetMs() : 0;
  return ENTRY_STARTUP_ALLOWANCE_MS + steps + HOOK_EXIT_MARGIN_MS;
}

/**
 * Electron's login item (`app.setLoginItemSettings`, appLifecycle.ts): on Windows it
 * writes a value under `Run` and its enabled/disabled flag under
 * `Explorer\StartupApproved\Run`, both named after the AppUserModelID by default —
 * which `main.ts` sets to `APP_USER_MODEL_ID` before anything else runs.
 */
export const LOGIN_ITEM_REG_VALUES: readonly { key: string; name: string; label: string }[] = Object.freeze([
  { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', name: APP_USER_MODEL_ID, label: 'reg delete Run' },
  {
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
    name: APP_USER_MODEL_ID,
    label: 'reg delete StartupApproved',
  },
]);

/** osHotkeyHelper.ts's launcher in the user's Startup folder (one per Windows user). */
export const OS_HOTKEY_STARTUP_CMD = 'GrammarX-OS-Hotkey.cmd';

/** `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GrammarX-OS-Hotkey.cmd`. */
export function osHotkeyStartupCmdPath(appData: string): string {
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', OS_HOTKEY_STARTUP_CMD);
}

/** The `-File "<helper.ps1>"` the Startup launcher runs, or null. */
export function helperScriptFromStartupCmd(text: string): string | null {
  const m = /-File\s+"([^"\r\n]+)"/i.exec(text);
  return m ? m[1]! : null;
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root.toLowerCase(), target.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Whether the OS-hotkey helper belongs to the copy being uninstalled. The zip build
 * shares the userData folder (and so the one helper) with an installed copy: a
 * helper whose config launches a portable exe that is still there is that copy's,
 * and uninstalling Gum's installer must leave it alone. One launching anything in
 * this install root (Update.exe, an `app-<v>\` exe) is ours; one with no readable
 * target, or a target that is gone, launches nothing and is removed too.
 */
export function osHotkeyHelperIsOurs(installRoot: string, configExe: string | null, exists: (p: string) => boolean): boolean {
  if (!configExe) return true;
  if (isInside(installRoot, configExe)) return true;
  return !exists(configExe);
}

/** A PowerShell single-quoted string literal. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Stops exactly the helper running `scriptPath` (matched on its command line, never
 * by a PID file that may be stale and name someone else's process).
 */
export function stopHotkeyHelperArgs(scriptPath: string): string[] {
  const script =
    `$s = ${psQuote(scriptPath)}; ` +
    `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($s, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
}

const defaultRunner: SyncRunner = (file, args, { timeoutMs }) => {
  execFileSync(file, [...args], { windowsHide: true, stdio: 'ignore', timeout: timeoutMs });
};

export interface SquirrelDeps {
  execPath: string;
  run?: SyncRunner;
  log?: (message: string) => void;
  /** Directory for the temporary `.reg` file; defaults to `os.tmpdir()`. */
  tmpDir?: string;
  /** `%APPDATA%` (the roaming profile holding the Startup folder); defaults to the env var. */
  appData?: string;
}

type Attempt = (label: string, file: string, args: readonly string[], timeoutMs: number) => void;

/**
 * Uninstall half of osHotkeyHelper.ts: delete its Startup launcher and stop the
 * running listener, when they belong to this install. Only the launcher is read
 * to find the helper (its `-File` names the script; the config beside it names
 * the exe it launches), so this needs neither Electron nor the userData path.
 */
function removeOsHotkeyHelper(
  installRoot: string,
  appData: string | undefined,
  attempt: Attempt,
  fail: (label: string, err: unknown) => void,
  log: ((message: string) => void) | undefined,
): void {
  if (!appData) return;
  const cmdPath = osHotkeyStartupCmdPath(appData);
  let text: string;
  try {
    text = fs.readFileSync(cmdPath, 'utf8');
  } catch (err) {
    // No launcher: the helper was never installed (or was removed in Settings).
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') fail('remove hotkey launcher', err);
    return;
  }
  const script = helperScriptFromStartupCmd(text);
  let configExe: string | null = null;
  if (script) {
    try {
      const raw = fs.readFileSync(path.join(path.dirname(script), 'config.json'), 'utf8').trimStart(); // trimStart drops a BOM too
      const exe = (JSON.parse(raw) as { exe?: unknown } | null)?.exe;
      if (typeof exe === 'string' && exe.trim()) configExe = exe;
    } catch {
      /* no readable config: the helper cannot launch anything */
    }
  }
  if (!osHotkeyHelperIsOurs(installRoot, configExe, fs.existsSync)) {
    log?.(`[squirrel] the OS-hotkey helper launches ${configExe}, not this install; left in place`);
    return;
  }
  try {
    fs.rmSync(cmdPath, { force: true });
  } catch (err) {
    fail('remove hotkey launcher', err);
  }
  if (script) attempt('stop hotkey helper', 'powershell.exe', stopHotkeyHelperArgs(script), UNINSTALL_TIMEOUTS_MS.stopHotkeyHelper);
}

/**
 * Do the work for one Squirrel event. Every step is best-effort: a failed
 * `reg delete` of a key that was never written must not abort the uninstall, and
 * nothing here may throw into startup. Returns the steps that failed, for logs and
 * tests.
 */
export function runSquirrelEvent(event: SquirrelEvent, deps: SquirrelDeps): string[] {
  const run = deps.run ?? defaultRunner;
  const failed: string[] = [];
  const fail = (label: string, err: unknown) => {
    failed.push(label);
    deps.log?.(`[squirrel] ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
  };
  const attempt: Attempt = (label, file, args, timeoutMs) => {
    try {
      run(file, args, { timeoutMs });
    } catch (err) {
      fail(label, err);
    }
  };
  const updateExe = updateExePath(deps.execPath);
  const exeName = path.basename(deps.execPath);
  /** Every registry change in one `.reg` file and one `reg import`. */
  const reg = (ops: RegOp[], timeoutMs: number = REG_IMPORT_TIMEOUT_MS) => {
    const file = path.join(deps.tmpDir ?? os.tmpdir(), `gum-associations-${process.pid}-${Date.now()}.reg`);
    try {
      fs.writeFileSync(file, encodeRegFile(buildRegFile(ops)));
    } catch (err) {
      fail('reg import', err);
      return;
    }
    try {
      attempt('reg import', 'reg.exe', ['import', file], timeoutMs);
    } finally {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* a leftover temp file is harmless */
      }
    }
  };

  switch (event) {
    case 'install':
      attempt('createShortcut', updateExe, ['--createShortcut', exeName, '--shortcut-locations', 'Desktop,StartMenu'], UPDATE_EXE_TIMEOUT_MS);
      reg(associationRegisterOps(deps.execPath));
      break;
    case 'updated':
      // Start menu only: Squirrel's shortcuts target Update.exe, so they survive an
      // update anyway, and re-creating the desktop one would resurrect a shortcut
      // the user deliberately deleted.
      attempt('createShortcut', updateExe, ['--createShortcut', exeName, '--shortcut-locations', 'StartMenu'], UPDATE_EXE_TIMEOUT_MS);
      reg(associationRegisterOps(deps.execPath));
      break;
    case 'uninstall': {
      const t = UNINSTALL_TIMEOUTS_MS;
      // What would keep running Gum's pieces after Gum is gone goes first: the
      // OS-hotkey helper (its Startup launcher starts PowerShell at every sign-in)
      // and the sign-in entry.
      removeOsHotkeyHelper(path.dirname(updateExe), deps.appData ?? process.env.APPDATA, attempt, fail, deps.log);
      for (const value of LOGIN_ITEM_REG_VALUES) {
        // Exit 1 also means "never written" (start at sign-in was off): logged, harmless.
        attempt(value.label, 'reg.exe', ['delete', value.key, '/v', value.name, '/f'], t.regDelete);
      }
      attempt('removeShortcut', updateExe, ['--removeShortcut', exeName], t.removeShortcut);
      reg(associationUnregisterOps(), t.regImport);
      break;
    }
    case 'obsolete':
    case 'firstrun':
      break;
  }
  return failed;
}

/**
 * Called by `bootEntry` (and, as a fallback for a build whose `main` still names
 * `main.js`, at the top of `main.ts`). Returns `true` when this process was launched
 * only to service a Squirrel event — the caller must then skip the single-instance
 * lock and quit. `--squirrel-firstrun` is a normal launch and returns `false`.
 */
export function handleSquirrelStartup(
  argv: readonly string[] = process.argv,
  deps: Partial<SquirrelDeps> & { platform?: string } = {},
): boolean {
  if ((deps.platform ?? process.platform) !== 'win32') return false;
  const event = squirrelEventOf(argv);
  if (!event || event === 'firstrun') return false;
  runSquirrelEvent(event, {
    execPath: deps.execPath ?? process.execPath,
    run: deps.run,
    log: deps.log ?? ((m) => console.warn(m)),
    tmpDir: deps.tmpDir,
    appData: deps.appData,
  });
  return true;
}

/** What `src/squirrelEntry.ts` hands `bootEntry`: the process, and the two ways out of it. */
export interface EntryDeps {
  argv: readonly string[];
  platform: string;
  /** Ends a Squirrel lifecycle launch (`app.exit`). */
  exit: (code: number) => void;
  /** Loads the full app (`require` of the sibling `main.js` bundle). */
  loadApp: () => void;
  /** Tests inject a recorder; the real entry uses `handleSquirrelStartup`. */
  handle?: (argv: readonly string[], deps: { platform: string }) => boolean;
  log?: (message: string) => void;
}

/**
 * The first thing the packaged main process does. A Squirrel lifecycle launch
 * (`--squirrel-install|updated|uninstall|obsolete`) is serviced and the process exits
 * WITHOUT the app bundle ever being loaded; anything else (including
 * `--squirrel-firstrun`, and every launch off Windows) loads the app.
 *
 * A lifecycle launch never falls through to the app, even when the hook throws: booting
 * the full app inside Squirrel's install would put a window up mid-install and hold the
 * process past the budget.
 */
export function bootEntry(deps: EntryDeps): 'squirrel' | 'app' {
  const event = deps.platform === 'win32' ? squirrelEventOf(deps.argv) : null;
  if (!event || event === 'firstrun') {
    deps.loadApp();
    return 'app';
  }
  try {
    (deps.handle ?? handleSquirrelStartup)(deps.argv, { platform: deps.platform });
  } catch (err) {
    (deps.log ?? ((m: string) => console.warn(m)))(
      `[squirrel] ${event} hook threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  deps.exit(0);
  return 'squirrel';
}
