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
 *   --squirrel-uninstall <v>  uninstall             -> remove both
 *   --squirrel-obsolete <v>   old version retired   -> nothing, just exit
 *   --squirrel-firstrun       first normal launch   -> a normal launch
 *
 * This replaces `electron-squirrel-startup`, which only made shortcuts and was
 * imported but never configured (the app shipped a zip, so it never ran).
 *
 * Everything here is SYNCHRONOUS on purpose. `main.ts` calls it before
 * `requestSingleInstanceLock()`: during an update the old copy is usually still
 * running, and a lock request from this process would forward
 * `--squirrel-updated` into it as a `second-instance` event (window pops to the
 * front, nothing installs). Handling first and never taking the lock avoids that.
 * The work is one `Update.exe` call and ONE `reg import` of a generated `.reg`
 * file (both with timeouts that together stay under the 15-second budget).
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

/** Budgets inside Squirrel's ~15 s: worst case shortcut + import stays under it. */
export const UPDATE_EXE_TIMEOUT_MS = 5_000;
export const REG_IMPORT_TIMEOUT_MS = 8_000;

const defaultRunner: SyncRunner = (file, args, { timeoutMs }) => {
  execFileSync(file, [...args], { windowsHide: true, stdio: 'ignore', timeout: timeoutMs });
};

export interface SquirrelDeps {
  execPath: string;
  run?: SyncRunner;
  log?: (message: string) => void;
  /** Directory for the temporary `.reg` file; defaults to `os.tmpdir()`. */
  tmpDir?: string;
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
  const attempt = (label: string, file: string, args: readonly string[], timeoutMs: number) => {
    try {
      run(file, args, { timeoutMs });
    } catch (err) {
      fail(label, err);
    }
  };
  const updateExe = updateExePath(deps.execPath);
  const exeName = path.basename(deps.execPath);
  /** Every registry change in one `.reg` file and one `reg import`. */
  const reg = (ops: RegOp[]) => {
    const file = path.join(deps.tmpDir ?? os.tmpdir(), `gum-associations-${process.pid}-${Date.now()}.reg`);
    try {
      fs.writeFileSync(file, encodeRegFile(buildRegFile(ops)));
    } catch (err) {
      fail('reg import', err);
      return;
    }
    try {
      attempt('reg import', 'reg.exe', ['import', file], REG_IMPORT_TIMEOUT_MS);
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
    case 'uninstall':
      attempt('removeShortcut', updateExe, ['--removeShortcut', exeName], UPDATE_EXE_TIMEOUT_MS);
      reg(associationUnregisterOps());
      break;
    case 'obsolete':
    case 'firstrun':
      break;
  }
  return failed;
}

/**
 * Called at the top of `main.ts`. Returns `true` when this process was launched
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
  });
  return true;
}
