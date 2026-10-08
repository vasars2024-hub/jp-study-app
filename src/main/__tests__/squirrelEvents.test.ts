// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_EXE_NAME,
  APP_USER_MODEL_ID,
  FILE_ASSOCIATIONS,
  SQUIRREL_APP_ID,
  associationRegisterOps,
  associationUnregisterOps,
  buildRegFile,
  encodeRegFile,
  handleSquirrelStartup,
  progIdFor,
  regString,
  runSquirrelEvent,
  squirrelEventOf,
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

  it('uninstall: removes shortcuts and every key it wrote, in one import', () => {
    const { calls, run } = recorder();
    runSquirrelEvent('uninstall', { execPath: EXE, run });
    expect(calls[0]).toMatchObject({ file: UPDATE, args: ['--removeShortcut', 'jp-study-app.exe'] });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.regFile).toBe(BOM + buildRegFile(associationUnregisterOps()));
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
    const failed = runSquirrelEvent('uninstall', { execPath: EXE, run, log: (m) => logs.push(m) });
    expect(failed).toEqual(['removeShortcut']);
    expect(logs[0]).toContain('removeShortcut failed');
    expect(calls.length).toBe(2);
  });

  it('a failed import is reported and still deletes the temp file', () => {
    const logs: string[] = [];
    const { calls, run } = recorder((file) => file === 'reg.exe');
    const failed = runSquirrelEvent('install', { execPath: EXE, run, log: (m) => logs.push(m) });
    expect(failed).toEqual(['reg import']);
    expect(existsSync(calls[1]!.args[1]!)).toBe(false);
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
});
