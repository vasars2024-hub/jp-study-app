// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ stored: {} as unknown, login: [] as unknown[] }));

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
    setLoginItemSettings: (s: unknown) => h.login.push(s),
    getLoginItemSettings: () => ({ openAtLogin: (h.login.at(-1) as { openAtLogin?: boolean } | undefined)?.openAtLogin === true }),
  },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../atomicJson', () => ({
  readJsonSync: () => h.stored,
  writeJsonAtomicSync: (_p: string, v: unknown) => {
    h.stored = v;
  },
}));

async function load() {
  vi.resetModules();
  return import('../appLifecycle');
}

beforeEach(() => {
  h.stored = {};
  h.login.length = 0;
});

describe('keep running in the tray / start at sign-in', () => {
  it('both are off by default, so closing still quits', async () => {
    const m = await load();
    expect(m.loadAppLifecyclePrefs()).toMatchObject({ keepRunningInTray: false, startAtLogin: false });
    expect(m.shouldHideOnClose()).toBe(false);
  });

  it('closing hides when enabled, until the app is really quitting', async () => {
    const m = await load();
    m.setAppLifecyclePrefs({ keepRunningInTray: true });
    expect(m.shouldHideOnClose()).toBe(true);
    m.markAppQuitting();
    expect(m.shouldHideOnClose()).toBe(false);
  });

  it('start at sign-in registers a login item that starts in the tray', async () => {
    const m = await load();
    if (process.platform !== 'win32' && process.platform !== 'darwin') return;
    const status = m.setAppLifecyclePrefs({ keepRunningInTray: true, startAtLogin: true });
    expect(h.login.at(-1)).toEqual({ openAtLogin: true, args: [m.START_MINIMIZED_ARG] });
    expect(status.startAtLogin).toBe(true);
    expect(m.launchedToTray(['gum.exe', m.START_MINIMIZED_ARG])).toBe(true);
    m.setAppLifecyclePrefs({ startAtLogin: false });
    expect(h.login.at(-1)).toMatchObject({ openAtLogin: false });
  });

  it('ignores malformed patches', async () => {
    const m = await load();
    expect(m.normalizeAppLifecyclePrefs({ keepRunningInTray: 'yes' })).toMatchObject({ keepRunningInTray: false });
  });
});

describe('loginItemSpec', () => {
  const ROOT = 'C:\\Users\\u\\AppData\\Local\\jp_study_app';
  const EXE = `${ROOT}\\app-1.2.3\\jp-study-app.exe`;
  const UPDATE = `${ROOT}\\Update.exe`;
  const installed = { execPath: EXE, isPackaged: true, platform: 'win32', exists: (p: string) => p === UPDATE };
  const tray = { keepRunningInTray: true, startAtLogin: true, startMinimized: true };

  it('a Squirrel install registers Update.exe --processStart, forwarding the tray flag', async () => {
    const m = await load();
    expect(m.loginItemSpec(tray, installed)).toEqual({
      openAtLogin: true,
      path: UPDATE,
      args: ['--processStart', '"jp-study-app.exe"', '--process-start-args', `"${m.START_MINIMIZED_ARG}"`],
    });
  });

  it('omits --process-start-args when there is nothing to forward', async () => {
    const m = await load();
    expect(m.loginItemSpec({ ...tray, startMinimized: false }, installed)).toEqual({
      openAtLogin: true,
      path: UPDATE,
      args: ['--processStart', '"jp-study-app.exe"'],
    });
  });

  it('disabling uses the same path/args, so Electron matches the registration', async () => {
    const m = await load();
    const on = m.loginItemSpec(tray, installed);
    const off = m.loginItemSpec({ ...tray, startAtLogin: false }, installed);
    expect(off).toEqual({ ...on, openAtLogin: false });
  });

  it('zip/portable and dev builds keep the plain exe registration', async () => {
    const m = await load();
    const plain = { openAtLogin: true, args: [m.START_MINIMIZED_ARG] };
    // No Update.exe beside the install root.
    expect(m.loginItemSpec(tray, { ...installed, exists: () => false })).toEqual(plain);
    // Not inside an app-<version> folder.
    expect(m.loginItemSpec(tray, { ...installed, execPath: 'D:\\Gum\\jp-study-app.exe', exists: () => true })).toEqual(plain);
    // Unpackaged.
    expect(m.loginItemSpec(tray, { ...installed, isPackaged: false })).toEqual(plain);
  });
});
