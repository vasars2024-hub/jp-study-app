// @vitest-environment node
/**
 * The e2e harness's headless mode (main/e2eHeadless.ts).
 *
 * The property that matters most is the negative one: a packaged build must never go
 * headless because an environment variable happens to be set — only the variable PLUS an
 * explicit `--e2e` argument does it. The rest pins what "headless" means at run time
 * (no window surfaces, OS side effects are stubbed) and, statically, that every window
 * factory in main creates its window hidden, so the instance-level guard is never racing
 * a window that was already on screen when the constructor returned.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { connect as netConnect, createServer as createNetServer, type AddressInfo, type Server } from 'node:net';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  class FakeEmitter {
    listeners = new Map<string, Array<(...a: unknown[]) => void>>();
    on(event: string, fn: (...a: unknown[]) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const fn of this.listeners.get(event) ?? []) fn(...args);
      return true;
    }
  }
  const paths = new Map<string, string>();
  const userData = `${(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp').replace(/\\/g, '/')}/gum-e2e-headless-test-${process.pid}`;
  const app = Object.assign(new FakeEmitter(), {
    getPath: (name: string) => paths.get(name) ?? (name === 'userData' ? userData : `${userData}/${name}`),
    setPath: (name: string, value: string) => {
      paths.set(name, value);
    },
    isPackaged: false,
    focus: vi.fn(),
    setLoginItemSettings: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(() => true),
    setJumpList: vi.fn(),
    setUserTasks: vi.fn(),
  });
  const shell = {
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn(),
    beep: vi.fn(),
  };
  const dialog = {
    showOpenDialog: vi.fn(),
    showOpenDialogSync: vi.fn(),
    showSaveDialog: vi.fn(),
    showSaveDialogSync: vi.fn(),
    showMessageBox: vi.fn(),
    showMessageBoxSync: vi.fn(),
    showErrorBox: vi.fn(),
  };
  const globalShortcut = {
    register: vi.fn(() => true),
    registerAll: vi.fn(),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => true),
  };
  class Notification {
    title = 'n';
  }
  (Notification.prototype as unknown as { show: () => void }).show = vi.fn();
  class Menu {}
  (Menu.prototype as unknown as { popup: () => void }).popup = vi.fn();
  class BrowserWindow {
    static all: BrowserWindow[] = [];
    static getAllWindows() {
      return BrowserWindow.all;
    }
  }
  const autoUpdater = { checkForUpdates: vi.fn(), setFeedURL: vi.fn(), quitAndInstall: vi.fn() };
  // The real modules' surfaces, each method a spy that THROWS: reaching one means the
  // isolation stub was not installed and the OS clipboard / screen would have been used.
  const real = (name: string) => vi.fn(() => {
    throw new Error(`real ${name} reached`);
  });
  const clipboard = {
    readText: real('clipboard.readText'),
    writeText: real('clipboard.writeText'),
    readHTML: real('clipboard.readHTML'),
    writeHTML: real('clipboard.writeHTML'),
    readRTF: real('clipboard.readRTF'),
    writeRTF: real('clipboard.writeRTF'),
    readImage: real('clipboard.readImage'),
    writeImage: real('clipboard.writeImage'),
    readBookmark: real('clipboard.readBookmark'),
    writeBookmark: real('clipboard.writeBookmark'),
    readFindText: real('clipboard.readFindText'),
    writeFindText: real('clipboard.writeFindText'),
    readBuffer: real('clipboard.readBuffer'),
    writeBuffer: real('clipboard.writeBuffer'),
    availableFormats: real('clipboard.availableFormats'),
    has: real('clipboard.has'),
    clear: real('clipboard.clear'),
    read: real('clipboard.read'),
    write: real('clipboard.write'),
  };
  const desktopCapturer = { getSources: real('desktopCapturer.getSources') };
  const fakeImage = (w: number, h: number) => ({
    isEmpty: () => w === 0 || h === 0,
    getSize: () => ({ width: w, height: h }),
    resize: (o: { width: number; height: number }) => fakeImage(o.width, o.height),
  });
  const nativeImage = {
    createEmpty: () => fakeImage(0, 0),
    createFromBitmap: (_b: Buffer, o: { width: number; height: number }) => fakeImage(o.width, o.height),
    createFromPath: () => fakeImage(640, 360),
  };
  const screen = { getAllDisplays: () => [{ id: 2528732444 }] };
  // lock4: an emitter with the real idle reading the harness may override.
  const powerMonitor = Object.assign(new FakeEmitter(), { getSystemIdleTime: () => 3 });
  const ipcHandlers = new Map<string, (...a: unknown[]) => unknown>();
  const ipcMain = {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => ipcHandlers.set(ch, fn),
    on: (ch: string, fn: (...a: unknown[]) => unknown) => ipcHandlers.set(ch, fn),
  };
  return {
    app, shell, dialog, globalShortcut, Notification, Menu, BrowserWindow, FakeEmitter, autoUpdater,
    clipboard, desktopCapturer, nativeImage, screen, ipcMain, ipcHandlers, powerMonitor,
  };
});

vi.mock('electron', () => ({
  app: fakes.app,
  shell: fakes.shell,
  dialog: fakes.dialog,
  globalShortcut: fakes.globalShortcut,
  Notification: fakes.Notification,
  Menu: fakes.Menu,
  BrowserWindow: fakes.BrowserWindow,
  autoUpdater: fakes.autoUpdater,
  clipboard: fakes.clipboard,
  desktopCapturer: fakes.desktopCapturer,
  nativeImage: fakes.nativeImage,
  screen: fakes.screen,
  powerMonitor: fakes.powerMonitor,
  ipcMain: fakes.ipcMain,
  session: { defaultSession: null },
}));

const REPO = resolve(__dirname, '..', '..', '..');

type Mod = typeof import('../e2eHeadless');

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import('../e2eHeadless');
}

/** A window double with just what `neuterWindow` touches. */
function fakeWindow(visible: boolean) {
  const emitter = new fakes.FakeEmitter();
  const state = { visible, hides: 0, nativeShows: 0, throttling: true };
  const win = Object.assign(emitter, {
    id: 7,
    show: () => {
      state.nativeShows += 1;
      state.visible = true;
    },
    showInactive: () => {
      state.nativeShows += 1;
      state.visible = true;
    },
    focus: vi.fn(),
    maximize: () => {
      state.visible = true;
    },
    restore: vi.fn(),
    moveTop: vi.fn(),
    setFullScreen: vi.fn(),
    setSimpleFullScreen: vi.fn(),
    setKiosk: vi.fn(),
    flashFrame: vi.fn(),
    hide: () => {
      state.hides += 1;
      state.visible = false;
    },
    isVisible: () => state.visible,
    isDestroyed: () => false,
    getTitle: () => 'Gum',
    getContentSize: () => [1280, 860],
    webContents: {
      getURL: () => 'http://127.0.0.1:5173/',
      setBackgroundThrottling: (on: boolean) => {
        state.throttling = on;
      },
    },
  });
  return { win, state };
}

describe('resolveE2eHeadless: never by accident in production', () => {
  let mod: Mod;
  beforeEach(async () => {
    mod = await freshModule();
  });

  it('is off without the variable, in every build', () => {
    expect(mod.resolveE2eHeadless({ env: {}, argv: [], isPackaged: false })).toBe(false);
    expect(mod.resolveE2eHeadless({ env: {}, argv: ['--e2e'], isPackaged: true })).toBe(false);
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: '0' }, argv: ['--e2e'], isPackaged: false })).toBe(false);
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: 'true' }, argv: [], isPackaged: false })).toBe(false);
  });

  it('a dev (unpackaged) run honours the variable alone', () => {
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: false })).toBe(true);
  });

  it('a PACKAGED build ignores the variable unless --e2e is also passed', () => {
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: ['app.exe'], isPackaged: true })).toBe(false);
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: ['app.exe', '--e2e=1'], isPackaged: true })).toBe(false);
    expect(mod.resolveE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: ['app.exe', '--e2e'], isPackaged: true })).toBe(true);
  });

  it('initE2eHeadless in a packaged build without the flag installs nothing', () => {
    const before = fakes.app.listeners.size;
    const openExternal = fakes.shell.openExternal;
    expect(mod.initE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: true })).toBe(false);
    expect(mod.isE2eHeadless()).toBe(false);
    expect(fakes.app.listeners.size).toBe(before);
    expect(fakes.shell.openExternal).toBe(openExternal);
  });
});

describe('headless at run time', () => {
  it('stubs OS side effects and keeps windows off screen', async () => {
    const mod = await freshModule();
    expect(mod.initE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: false })).toBe(true);
    expect(mod.isE2eHeadless()).toBe(true);

    // A window created hidden: surfacing calls are swallowed, the page renders as visible.
    const hidden = fakeWindow(false);
    fakes.app.emit('browser-window-created', {}, hidden.win);
    hidden.win.show();
    hidden.win.showInactive();
    hidden.win.maximize();
    expect(hidden.state.visible).toBe(false);
    expect(hidden.state.nativeShows).toBe(0);
    expect(hidden.state.throttling).toBe(false);

    // A window that is on screen anyway is hidden and reported.
    const shown = fakeWindow(true);
    fakes.app.emit('browser-window-created', {}, shown.win);
    expect(shown.state.visible).toBe(false);
    shown.win.emit('show');
    expect(shown.state.hides).toBe(2);

    await fakes.shell.openExternal('https://example.com');
    expect(await fakes.shell.openPath('C:\\x')).toBe('');
    expect(fakes.globalShortcut.register('Ctrl+Alt+K')).toBe(true);
    expect(fakes.globalShortcut.isRegistered()).toBe(false);
    (new fakes.Notification() as unknown as { show: () => void }).show();
    expect(await fakes.dialog.showOpenDialog({ title: 'pick' })).toEqual({ canceled: true, filePaths: [] });
    mod.queueE2eDialogResult('open', { canceled: false, filePaths: ['C:\\book.epub'] });
    expect(await fakes.dialog.showOpenDialog({ title: 'pick' })).toEqual({ canceled: false, filePaths: ['C:\\book.epub'] });
    expect(await fakes.dialog.showMessageBox({ message: 'sure?', cancelId: 1 })).toEqual({ response: 1, checkboxChecked: false });

    const status = mod.e2eHeadlessStatus() as {
      violations: Array<{ api: string }>;
      calls: Array<{ api: string }>;
      patchFailures: string[];
    };
    expect(status.patchFailures).toEqual([]);
    expect(status.violations.map((v) => v.api)).toEqual(['BrowserWindow created visible', 'BrowserWindow shown']);
    const apis = status.calls.map((c) => c.api);
    for (const api of [
      'BrowserWindow.show',
      'BrowserWindow.showInactive',
      'BrowserWindow.maximize',
      'shell.openExternal',
      'shell.openPath',
      'globalShortcut.register',
      'Notification.show',
      'dialog.showOpenDialog',
      'dialog.showMessageBox',
    ]) {
      expect(apis).toContain(api);
    }
  });

  it('refuses web notifications on every session, before and after the app installs its policy', async () => {
    const mod = await freshModule();
    let request: ((...a: unknown[]) => void) | null = null;
    let check: ((...a: unknown[]) => boolean) | null = null;
    const sessionEvents: string[] = [];
    const ses = {
      on(event: string) {
        sessionEvents.push(event);
      },
      setPermissionRequestHandler(h: (...a: unknown[]) => void) {
        request = h;
      },
      setPermissionCheckHandler(h: (...a: unknown[]) => boolean) {
        check = h;
      },
    };
    mod.guardSessionForE2e(ses as never);
    // The app's own allow-everything-it-lists policy, installed afterwards.
    ses.setPermissionRequestHandler((_wc: unknown, _p: unknown, cb: (ok: boolean) => void) => cb(true));
    ses.setPermissionCheckHandler(() => true);
    const answers: boolean[] = [];
    request!(null, 'notifications', (ok: boolean) => answers.push(ok), {});
    request!(null, 'clipboard-read', (ok: boolean) => answers.push(ok), {});
    expect(answers).toEqual([false, true]);
    expect(check!(null, 'notifications', 'app://x', {})).toBe(false);
    expect(check!(null, 'fullscreen', 'app://x', {})).toBe(true);
    // An unhandled download would open the native Save As dialog: it is saved instead.
    expect(sessionEvents).toContain('will-download');
  });
});

describe('headless keeps the app\'s own semantics observable', () => {
  it('windows carry a logical visibility; the OS window is never shown', async () => {
    // Earlier tests' module instances still listen on the shared fake `app`; one instance only.
    fakes.app.listeners.clear();
    const mod = await freshModule();
    mod.initE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: false });
    const { win, state } = fakeWindow(false);
    const shows: number[] = [];
    win.on('show', () => shows.push(1));
    fakes.app.emit('browser-window-created', {}, win);
    expect(win.isVisible()).toBe(false);
    win.showInactive();
    // The app sees it shown (and its `show` listeners ran: the lock guard adopts that way)...
    expect(win.isVisible()).toBe(true);
    expect(shows.length).toBe(1);
    // ...the desktop does not, and the synthetic event is not a violation.
    expect(state.visible).toBe(false);
    expect(mod.osVisible(win as never)).toBe(false);
    win.hide();
    expect(win.isVisible()).toBe(false);
    // A window a constructor would have shown is marked shown on request.
    mod.e2eMarkCreatedShown(win as never);
    expect(win.isVisible()).toBe(true);
    expect((mod.e2eHeadlessStatus() as { violations: unknown[] }).violations).toEqual([]);
  });

  it('a held chord can be pressed, a tray row clicked, the network witnessed', async () => {
    const realFetch = vi.fn(async () => new Response('ok'));
    const saved = globalThis.fetch;
    globalThis.fetch = realFetch as unknown as typeof fetch;
    try {
      const mod = await freshModule();
      mod.initE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: false });
      const pressed = vi.fn();
      fakes.globalShortcut.register('Ctrl+Alt+B', pressed);
      expect(mod.fireE2eShortcut('Ctrl+Alt+B')).toBe(true);
      expect(pressed).toHaveBeenCalledTimes(1);
      expect(mod.fireE2eShortcut('Ctrl+Alt+Q')).toBe(false);

      const tray = mod.createE2eTray() as { setContextMenu: (m: unknown) => void };
      const open = vi.fn();
      tray.setContextMenu({ items: [{ label: 'Companion', submenu: { items: [{ label: 'Wheel', click: vi.fn() }] } }, { type: 'separator' }, { label: 'Open Blanc', click: open }] });
      expect(mod.e2eTrayItems()).toEqual(['Companion', 'Companion > Wheel', 'Open Blanc']);
      expect(mod.clickE2eTrayItem('Open Blanc')).toBe(true);
      expect(open).toHaveBeenCalledTimes(1);

      await globalThis.fetch('https://api.github.com/repos/x/y/releases/latest?token=secret');
      await globalThis.fetch('http://127.0.0.1:39391/health');
      expect(realFetch).toHaveBeenCalledTimes(2);
      const net = (mod.e2eHeadlessStatus() as { network: Array<{ detail: string }> }).network;
      expect(net.map((n) => n.detail)).toEqual(['https://api.github.com/repos/x/y/releases/latest']);

      fakes.autoUpdater.checkForUpdates();
      expect((mod.e2eHeadlessStatus() as { calls: Array<{ api: string }> }).calls.map((c) => c.api)).toContain('autoUpdater.checkForUpdates');
    } finally {
      globalThis.fetch = saved;
    }
  });
});

/** A session double with every surface the isolation guards touch. */
function fakeSession() {
  const state = {
    beforeRequest: null as null | ((d: { url: string }, cb: (r: Record<string, unknown>) => void) => void),
    displayHandler: null as null | ((req: unknown, cb: (s: Record<string, unknown>) => void) => void),
    preloads: [] as Array<Record<string, unknown>>,
  };
  const ses = {
    on: () => undefined,
    setPermissionRequestHandler: () => undefined,
    setPermissionCheckHandler: () => undefined,
    webRequest: {
      onCompleted: () => undefined,
      onBeforeRequest: (_f: unknown, fn: typeof state.beforeRequest) => {
        state.beforeRequest = fn;
      },
    },
    setDisplayMediaRequestHandler: (fn: typeof state.displayHandler) => {
      state.displayHandler = fn;
    },
    registerPreloadScript: (s: Record<string, unknown>) => {
      state.preloads.push(s);
      return 'id';
    },
  };
  const route = (url: string): Promise<Record<string, unknown>> =>
    new Promise((resolve) => state.beforeRequest!({ url }, resolve));
  return { ses, state, route };
}

describe('lock4: the power monitor, driven by the harness', () => {
  it('is refused outside headless mode', async () => {
    const mod = await freshModule();
    mod.initE2eHeadless({ env: {}, argv: [], isPackaged: false });
    const heard = vi.fn();
    fakes.powerMonitor.on('suspend', heard);
    expect(mod.e2ePower({ event: 'suspend' }).ok).toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it('emits suspend / lock-screen on the real powerMonitor and overrides the idle time', async () => {
    const mod = await freshModule();
    mod.initE2eHeadless({ env: { GUM_E2E_HEADLESS: '1' }, argv: [], isPackaged: false });
    const sleep = vi.fn();
    const winL = vi.fn();
    fakes.powerMonitor.on('suspend', sleep);
    fakes.powerMonitor.on('lock-screen', winL);
    expect(mod.e2ePower({ event: 'suspend' }).ok).toBe(true);
    expect(mod.e2ePower({ event: 'lock-screen' }).ok).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(winL).toHaveBeenCalledTimes(1);
    // Only the two events auto-lock arms on; nothing that would wake other listeners.
    expect(mod.e2ePower({ event: 'resume' })).toMatchObject({ ok: false });
    expect(fakes.powerMonitor.getSystemIdleTime()).toBe(3);
    expect(mod.e2ePower({ idleSeconds: 3_600 }).ok).toBe(true);
    expect(fakes.powerMonitor.getSystemIdleTime()).toBe(3_600);
    expect(mod.e2ePower({ idleSeconds: -1 })).toMatchObject({ ok: false });
    expect(mod.e2ePower({ idleSeconds: null }).ok).toBe(true);
    expect(fakes.powerMonitor.getSystemIdleTime()).toBe(3); // back to the real value
    const status = mod.e2eHeadlessStatus() as { power: { fired: Array<{ event: string }> }; calls: Array<{ api: string }> };
    expect(status.power.fired.map((f) => f.event)).toEqual(['suspend', 'lock-screen']);
    expect(status.calls.map((c) => c.api)).toContain('powerMonitor.emit');
  });
});

describe('isolation: the owner\'s services, clipboard, screen and files', () => {
  afterAll(async () => {
    const mod = await import('../e2eHeadless');
    mod.uninstallLoopbackGuard();
    rmSync(fakes.app.getPath('userData'), { recursive: true, force: true });
  });

  it('headless mode installs every isolation stub, and each one answers from the harness', async () => {
    fakes.app.listeners.clear();
    const mod = await freshModule();
    const savedFetch = globalThis.fetch;
    try {
      mod.initE2eHeadless({
        env: {
          GUM_E2E_HEADLESS: '1',
          GUM_E2E_LOOPBACK: JSON.stringify({ remap: { 8765: 41001 } }),
          GUM_E2E_REMOTE: JSON.stringify({ 'jimaku.cc': 'http://127.0.0.1:41002', 'evil.example': 'https://evil.example' }),
        },
        argv: [],
        isPackaged: false,
      });
    } finally {
      globalThis.fetch = savedFetch;
    }
    const { ses, state, route } = fakeSession();
    mod.guardSessionForE2e(ses as never);

    const iso = mod.e2eIsolationStatus() as { missing: string[]; stubs: Array<{ name: string; installed: boolean }> };
    expect(iso.stubs.map((s) => s.name)).toEqual([...mod.ISOLATION_STUBS]);
    expect(iso.missing).toEqual([]);

    // Clipboard: an in-memory buffer (the real methods throw if reached).
    const cb = fakes.clipboard as unknown as Record<string, (...a: unknown[]) => unknown>;
    cb.writeText('窓辺の猫');
    expect(cb.readText()).toBe('窓辺の猫');
    expect(cb.availableFormats()).toEqual(['text/plain']);
    expect((cb.readImage() as { isEmpty: () => boolean }).isEmpty()).toBe(true);
    cb.clear();
    expect(cb.readText()).toBe('');
    expect(mod.e2eClipboard({ text: 'from the harness' }).text).toBe('from the harness');
    expect(cb.readText()).toBe('from the harness');
    // …and the renderer's half goes through the same buffer over the shim's IPC.
    await fakes.ipcHandlers.get('e2e:clipboard:write')!({}, 'page copy');
    expect(await fakes.ipcHandlers.get('e2e:clipboard:read')!({})).toBe('page copy');

    // Screen: synthetic sources only, sized as asked, matched to the display; no windows.
    const getSources = (fakes.desktopCapturer as unknown as { getSources: (o: unknown) => Promise<Array<Record<string, unknown>>> }).getSources;
    const screens = await getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({ display_id: '2528732444' });
    expect((screens[0].thumbnail as { getSize: () => unknown }).getSize()).toEqual({ width: 1920, height: 1080 });
    expect(await getSources({ types: ['window'] })).toEqual([]);

    // Display media: whatever handler the app installs, a request that reaches the session is refused.
    const appHandler = vi.fn();
    (ses as unknown as { setDisplayMediaRequestHandler: (h: unknown) => void }).setDisplayMediaRequestHandler(appHandler);
    const granted = await new Promise((resolve) => state.displayHandler!({ frame: null }, resolve));
    expect(granted).toEqual({});
    expect(appHandler).not.toHaveBeenCalled();

    // Pages: a session preload that installs the main-world shim.
    expect(state.preloads).toHaveLength(1);
    expect(state.preloads[0]).toMatchObject({ type: 'frame' });
    const preload = readFileSync(String(state.preloads[0].filePath), 'utf8');
    expect(preload).toContain('executeInMainWorld');
    expect(preload).toContain('getDisplayMedia');
    expect(preload).toContain('e2e:clipboard:write');

    // Chromium requests: protected loopback ports refused, faked ones redirected, remote fakes too.
    expect(await route('http://127.0.0.1:8765/')).toEqual({ redirectURL: 'http://127.0.0.1:41001/' });
    expect(await route('ws://localhost:6677/')).toEqual({ cancel: true });
    expect(await route('http://127.0.0.1:39391/health')).toEqual({});
    expect(await route('https://jimaku.cc/api/entries/search?query=x')).toEqual({ redirectURL: 'http://127.0.0.1:41002/jimaku.cc/api/entries/search?query=x' });
    // A remote map entry that is not loopback was dropped, never followed.
    expect(await route('https://evil.example/')).toEqual({});

    // Files: the Recycle Bin only inside the run; the user folders point into the profile.
    const userData = fakes.app.getPath('userData');
    const victim = join(userData, 'victim.txt');
    mkdirSync(userData, { recursive: true });
    writeFileSync(victim, 'x');
    const trash = (fakes.shell as unknown as { trashItem: (p: string) => Promise<void> }).trashItem;
    await trash(victim);
    expect(existsSync(victim)).toBe(false);
    await expect(trash('C:\\Users\\someone\\Documents\\thesis.docx')).rejects.toThrow(/outside the run/);
    expect((mod.e2eHeadlessStatus() as { violations: Array<{ api: string }> }).violations.map((v) => v.api)).toContain('shell.trashItem outside the run');
    for (const name of ['videos', 'downloads', 'documents', 'desktop', 'music', 'pictures']) {
      expect(resolve(fakes.app.getPath(name)).startsWith(resolve(userData))).toBe(true);
    }
  });

  it('the loopback policy: owner ports are remapped or refused, everything else allowed', async () => {
    const mod = await freshModule();
    const config = mod.parseLoopbackConfig(JSON.stringify({ remap: { 8765: 50001 }, protect: { 9696: 'Prowlarr' } }));
    expect(mod.decideLoopback(config, '127.0.0.1', 8765)).toEqual({ verdict: 'remapped', to: 50001, service: 'AnkiConnect' });
    expect(mod.decideLoopback(config, 'localhost', 8080)).toEqual({ verdict: 'refused', service: 'qBittorrent WebUI' });
    expect(mod.decideLoopback(config, '[::1]', 6677)).toEqual({ verdict: 'refused', service: 'texthooker (Textractor WebSocket)' });
    expect(mod.decideLoopback(config, '127.0.0.1', 9696)).toEqual({ verdict: 'refused', service: 'Prowlarr' });
    expect(mod.decideLoopback(config, '127.0.0.1', 18791)).toEqual({ verdict: 'allowed' });
    expect(mod.decideLoopback(config, 'example.com', 8765)).toEqual({ verdict: 'allowed' });
    for (const port of [8765, 8080, 6677, 9001, 2333, 43211, 11434, 1234]) {
      expect(mod.decideLoopback(mod.parseLoopbackConfig(undefined), '127.0.0.1', port).verdict).toBe('refused');
    }
  });

  it('no real loopback port is contacted: every outgoing connection is recorded, remapped or refused', async () => {
    // Stand-ins for the owner's services, on ephemeral ports so the test never touches a
    // real one. Each counts the connections it ACCEPTS — the only proof that matters.
    const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
    const accepted = { owner: 0, ownerOther: 0, fake: 0 };
    const owner = createNetServer((s) => {
      accepted.owner += 1;
      s.destroy();
    });
    const ownerOther = createNetServer((s) => {
      accepted.ownerOther += 1;
      s.destroy();
    });
    const fake = createHttpServer((req, res) => {
      accepted.fake += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: 6, error: null, path: req.url }));
    });
    const ownerPort = await listen(owner);
    const otherPort = await listen(ownerOther);
    const fakePort = await listen(fake);
    const savedFetch = globalThis.fetch;
    try {
      const mod = await freshModule();
      mod.initE2eHeadless({
        env: {
          GUM_E2E_HEADLESS: '1',
          GUM_E2E_LOOPBACK: JSON.stringify({ remap: { [ownerPort]: fakePort }, protect: { [ownerPort]: 'AnkiConnect (stand-in)', [otherPort]: 'qBittorrent (stand-in)' } }),
        },
        argv: [],
        isPackaged: false,
      });
      mod.clearE2eRecords();
      // Node's fetch (undici) — what anki/client.ts uses.
      const res = await globalThis.fetch(`http://127.0.0.1:${ownerPort}/`, { method: 'POST', body: JSON.stringify({ action: 'version', version: 6 }) });
      expect(await res.json()).toMatchObject({ result: 6 });
      // node:http — what the qBittorrent client uses — by host name.
      const viaHttp = await new Promise<number>((resolve, reject) => {
        const req = httpRequest({ host: 'localhost', port: ownerPort, path: '/x', method: 'GET', agent: false }, (r) => {
          r.resume();
          resolve(r.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
      expect(viaHttp).toBe(200);
      // A protected port with no fake: refused before a connection exists.
      await expect(globalThis.fetch(`http://127.0.0.1:${otherPort}/api/v2/app/version`)).rejects.toThrow();
      const refusedSocket = await new Promise<string>((resolve) => {
        const s = netConnect({ host: '127.0.0.1', port: otherPort });
        s.on('connect', () => resolve('connected'));
        s.on('error', (err: NodeJS.ErrnoException) => resolve(String(err.code)));
      });
      expect(refusedSocket).toBe('ECONNREFUSED');
      // An unprotected loopback port (the harness's own fake, the bridge) is untouched.
      const direct = await globalThis.fetch(`http://127.0.0.1:${fakePort}/direct`);
      expect(direct.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));

      expect(accepted.owner).toBe(0);
      expect(accepted.ownerOther).toBe(0);
      expect(accepted.fake).toBe(3);
      const loop = (mod.e2eIsolationStatus() as { loopback: { connections: Array<{ port: number; verdict: string; via: string }>; leaked: number } }).loopback;
      expect(loop.leaked).toBe(0);
      expect(loop.connections.filter((c) => c.port === ownerPort).map((c) => c.verdict)).toEqual(['remapped', 'remapped']);
      expect(loop.connections.filter((c) => c.port === otherPort).map((c) => c.verdict)).toEqual(['refused', 'refused']);
      expect(loop.connections.filter((c) => c.port === fakePort).map((c) => c.verdict)).toEqual(['allowed']);
      expect(loop.connections.every((c) => c.via === 'node')).toBe(true);
    } finally {
      globalThis.fetch = savedFetch;
      for (const s of [owner, ownerOther, fake]) s.close();
    }
  });
});

describe('static: window factories and the boot order', () => {
  const posix = (p: string) => relative(REPO, p).split('\\').join('/');
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__') sourceFiles(full, out);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  it('every `new BrowserWindow(` site creates its window hidden (or hidden under e2e)', () => {
    const files = [resolve(REPO, 'src/main.ts'), ...sourceFiles(resolve(REPO, 'src/main'))];
    const offenders: string[] = [];
    let sites = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/new BrowserWindow\(/g)) {
        sites += 1;
        // The options literal: up to the first `});` after the constructor call.
        const rest = source.slice(m.index ?? 0);
        const literal = rest.slice(0, rest.indexOf('});') + 3);
        const hidden =
          /\bshow:\s*false\b/.test(literal) ||
          /\bshow:\s*!isE2eHeadless\(\)/.test(literal) ||
          /\.\.\.baseOverlayOptions\(\)/.test(literal);
        if (!hidden) offenders.push(`${posix(file)}:${source.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(sites).toBeGreaterThanOrEqual(15); // control: the scan sees the factories
    expect(offenders).toEqual([]);
    // The one shared options helper the scan trusts really does say `show: false`.
    const recorder = readFileSync(resolve(REPO, 'src/main/regionRecorder.ts'), 'utf8');
    const helper = recorder.slice(recorder.indexOf('function baseOverlayOptions'));
    expect(/show:\s*false/.test(helper.slice(0, helper.indexOf('\n}')))).toBe(true);
  });

  it('main.ts decides headless mode before the single-instance lock and before ready', () => {
    const main = readFileSync(resolve(REPO, 'src/main.ts'), 'utf8');
    const init = main.indexOf('initE2eHeadless();');
    expect(init).toBeGreaterThan(0);
    expect(init).toBeLessThan(main.indexOf('app.requestSingleInstanceLock()'));
    expect(init).toBeLessThan(main.indexOf('app.whenReady()'));
  });
});
