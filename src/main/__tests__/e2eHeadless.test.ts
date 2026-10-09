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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const app = Object.assign(new FakeEmitter(), {
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
  return { app, shell, dialog, globalShortcut, Notification, Menu, BrowserWindow, FakeEmitter, autoUpdater };
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
