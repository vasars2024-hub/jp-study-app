/**
 * Test-only headless mode for the end-to-end harness (`tools/e2e/run.cjs`).
 *
 * The harness drives the REAL app — real main process, real renderer, real IPC — on
 * the owner's own machine, where nothing may appear on the desktop: no window, no tray
 * icon, no toast, no Explorer window, no browser tab, no system-wide hotkey. So when this
 * mode is on:
 *
 *  - every BrowserWindow stays hidden for its whole life. `show`/`showInactive`/`focus`/
 *    `maximize`/`restore`/`moveTop`/`setFullScreen`/`flashFrame` become no-ops on the
 *    instance (installed from `browser-window-created`, which Electron emits from inside
 *    the constructor, before the creating code can call any of them), and a `show` event
 *    that still slips through is hidden again and recorded as a violation;
 *  - the page is nevertheless RENDERED as visible: `incrementCapturerCount(…, stayHidden
 *    = false)` is Chromium's own "being captured" state, so `document.visibilityState` is
 *    `visible`, rAF runs and `capturePage()` returns real pixels without an OS window;
 *  - DevTools never open (the dev build opens them detached on boot);
 *  - shell `openExternal`/`openPath`/`showItemInFolder`/`beep`, native notifications,
 *    native context menus, OS dialogs, login-item / protocol-client writes and global
 *    shortcuts are stubbed to a log the harness reads back over the debug bridge;
 *  - web notifications are refused at the permission layer.
 *
 * It can only be turned on deliberately: `GUM_E2E_HEADLESS=1` in a dev (unpackaged) run,
 * or that variable PLUS an explicit `--e2e` argument in a packaged build — a stray
 * environment variable on a user's machine cannot hide their app.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  Notification,
  session,
  shell,
  type Session,
  type WebContents,
} from 'electron';

export const E2E_HEADLESS_ENV = 'GUM_E2E_HEADLESS';
export const E2E_ARGV_FLAG = '--e2e';

export interface E2eHeadlessInput {
  env: Record<string, string | undefined>;
  argv: readonly string[];
  isPackaged: boolean;
}

/**
 * Whether headless mode applies. Pure, so the "never by accident in production" rule is
 * testable without Electron: packaged builds need the env var AND the explicit flag.
 */
export function resolveE2eHeadless(input: E2eHeadlessInput): boolean {
  if ((input.env[E2E_HEADLESS_ENV] ?? '').trim() !== '1') return false;
  if (!input.isPackaged) return true;
  return input.argv.includes(E2E_ARGV_FLAG);
}

export interface E2eStubCall {
  ts: number;
  api: string;
  detail: string;
}

export type E2eDialogKind = 'open' | 'save' | 'message';

let active = false;
let installed = false;
const calls: E2eStubCall[] = [];
const violations: E2eStubCall[] = [];
const patchFailures: string[] = [];
const dialogQueue: Record<E2eDialogKind, unknown[]> = { open: [], save: [], message: [] };
const CALL_LIMIT = 500;

const shortcutCallbacks = new Map<string, () => void>();
/** Every off-machine request seen, in order (origin + path only). */
const network: E2eStubCall[] = [];
let trayMenu: Menu | null = null;

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  } catch {
    return true; // not a network URL at all (app://, media://, data:)
  }
}

function noteNetwork(via: string, url: string): void {
  if (!/^https?:/i.test(url) || isLoopback(url)) return;
  let shown = url;
  try {
    const u = new URL(url);
    shown = `${u.origin}${u.pathname}`;
  } catch {
    /* keep it as given */
  }
  network.push({ ts: Date.now(), api: via, detail: shown });
  if (network.length > CALL_LIMIT) network.splice(0, network.length - CALL_LIMIT);
}

/** Press a registered global chord the way Windows would. False when nothing holds it. */
export function fireE2eShortcut(accelerator: string): boolean {
  const callback = shortcutCallbacks.get(accelerator);
  if (!callback) return false;
  record('globalShortcut (pressed by the harness)', accelerator);
  callback();
  return true;
}

/**
 * The notification-area icon's stand-in under the harness: no icon on the desktop, but
 * the context menu the app builds is kept, so its rows can be clicked
 * (`clickE2eTrayItem`) through the very handlers a user's click runs.
 */
export function createE2eTray(): Record<string, unknown> {
  record('Tray (stand-in, no icon)');
  const stub: Record<string, unknown> = {
    setContextMenu: (menu: Menu | null) => {
      trayMenu = menu;
    },
    setToolTip: () => undefined,
    setImage: () => undefined,
    setTitle: () => undefined,
    on: () => stub,
    once: () => stub,
    popUpContextMenu: () => record('Tray.popUpContextMenu'),
    destroy: () => {
      trayMenu = null;
    },
    isDestroyed: () => false,
  };
  return stub;
}

type MenuItemLike = { label?: string; type?: string; submenu?: { items: MenuItemLike[] } | null; click?: (...a: unknown[]) => void };

function trayEntries(): Array<{ path: string; item: MenuItemLike }> {
  const out: Array<{ path: string; item: MenuItemLike }> = [];
  const walk = (items: MenuItemLike[], prefix: string) => {
    for (const item of items) {
      if (item.type === 'separator') continue;
      const path = prefix ? `${prefix} > ${item.label ?? ''}` : item.label ?? '';
      out.push({ path, item });
      if (item.submenu?.items) walk(item.submenu.items, path);
    }
  };
  walk(((trayMenu as unknown as { items?: MenuItemLike[] } | null)?.items) ?? [], '');
  return out;
}

export function e2eTrayItems(): string[] {
  return trayEntries().map((e) => e.path);
}

/** Click one tray row (by its label, or `Parent > Child`). False when there is none. */
export function clickE2eTrayItem(label: string): boolean {
  const hit = trayEntries().find((e) => e.path === label || e.item.label === label);
  if (!hit || typeof hit.item.click !== 'function') return false;
  record('Tray row (clicked by the harness)', hit.path);
  hit.item.click();
  return true;
}

/** True once `initE2eHeadless` decided this process is a headless harness run. */
export function isE2eHeadless(): boolean {
  return active;
}

function record(api: string, detail: unknown = ''): void {
  const entry = { ts: Date.now(), api, detail: typeof detail === 'string' ? detail : safeJson(detail) };
  calls.push(entry);
  if (calls.length > CALL_LIMIT) calls.splice(0, calls.length - CALL_LIMIT);
  console.log(`[e2e] stubbed ${api} ${entry.detail}`.trim());
}

function violation(api: string, detail: unknown = ''): void {
  const entry = { ts: Date.now(), api, detail: typeof detail === 'string' ? detail : safeJson(detail) };
  violations.push(entry);
  console.warn(`[e2e] VIOLATION ${api} ${entry.detail}`.trim());
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** Assign one property, recording (not throwing) when the host object refuses it. */
function patch<T extends object>(target: T, key: string, value: unknown, label: string): void {
  try {
    (target as Record<string, unknown>)[key] = value;
    if ((target as Record<string, unknown>)[key] !== value) throw new Error('assignment ignored');
  } catch {
    try {
      Object.defineProperty(target, key, { value, configurable: true, writable: true });
    } catch (err) {
      patchFailures.push(`${label}: ${String(err)}`);
    }
  }
}

/** Methods that would put a window on screen or take the foreground. */
const WINDOW_SURFACING_METHODS = [
  'show',
  'showInactive',
  'focus',
  'maximize',
  'restore',
  'moveTop',
  'setFullScreen',
  'setSimpleFullScreen',
  'setKiosk',
  'flashFrame',
] as const;

/** These would put the window on screen: under the harness they make it LOGICALLY shown. */
const SHOWING_METHODS: ReadonlySet<string> = new Set(['show', 'showInactive', 'maximize', 'restore']);

interface WindowLedger {
  /** The window's own (native) visibility — what the desktop actually has. */
  osVisible: () => boolean;
  /** Mark it shown the way a constructor without `show: false` would. */
  markShown: () => void;
}
const ledgers = new WeakMap<object, WindowLedger>();

/** Whether the OS has this window on screen (never the logical answer). */
export function osVisible(win: BrowserWindow): boolean {
  try {
    return (ledgers.get(win)?.osVisible ?? (() => win.isVisible()))();
  } catch {
    return false;
  }
}

/**
 * A window the app creates already shown (no `show: false`, e.g. an app pop-out) is
 * created hidden under the harness; this gives it the logical "shown" it would have had,
 * so hide/restore paths (the lock guard) see the same state as on a real desktop.
 */
export function e2eMarkCreatedShown(win: BrowserWindow): void {
  ledgers.get(win)?.markShown();
}

/**
 * Keep one window off screen for good, while its page renders as if visible.
 *
 * The app still has to SEE its own show/hide semantics, or every path that branches on
 * `isVisible()` (the lock guard hides visible content windows and restores exactly those)
 * would run a different branch than on a real desktop. So each window carries a logical
 * visibility: `show()`/`showInactive()`/`maximize()`/`restore()` set it and emit the
 * `show` event listeners expect, `hide()` clears it, and `isVisible()` answers it. The
 * OS window is never shown; `osVisible()` is the native answer the harness checks.
 */
export function neuterWindow(win: BrowserWindow): void {
  const nativeVisible = win.isVisible.bind(win);
  const nativeHide = win.hide.bind(win);
  let shown = false;
  let synthetic = false;
  const markShown = (): void => {
    if (shown) return;
    shown = true;
    synthetic = true;
    try {
      win.emit('show');
    } finally {
      synthetic = false;
    }
  };
  ledgers.set(win, { osVisible: nativeVisible, markShown });
  for (const method of WINDOW_SURFACING_METHODS) {
    patch(win, method, () => {
      record(`BrowserWindow.${method}`, `#${win.id}`);
      if (SHOWING_METHODS.has(method)) markShown();
    }, `BrowserWindow.${method}`);
  }
  patch(win, 'hide', () => {
    shown = false;
    nativeHide();
  }, 'BrowserWindow.hide');
  patch(win, 'isVisible', () => shown, 'BrowserWindow.isVisible');
  // A native path (taskbar, an Electron internal) that shows the window anyway: hide it
  // again on the spot and leave a record the harness turns into a FAIL.
  win.on('show', () => {
    if (synthetic) return;
    violation('BrowserWindow shown', `#${win.id} ${safeTitle(win)}`);
    try {
      win.hide();
    } catch {
      /* destroyed mid-event */
    }
  });
  if (nativeVisible()) {
    violation('BrowserWindow created visible', `#${win.id}`);
    nativeHide();
  }
  // A never-shown window already renders as visible (`paintWhenInitiallyHidden`, on by
  // default — measured on Electron 42: `visibilityState` 'visible', rAF running,
  // `capturePage()` real pixels). Throttling off keeps timers honest while it is unfocused.
  // (`incrementCapturerCount` no longer exists on Electron 42's WebContents.)
  try {
    win.webContents.setBackgroundThrottling(false);
  } catch (err) {
    patchFailures.push(`throttling #${win.id}: ${String(err)}`);
  }
}

function safeTitle(win: BrowserWindow): string {
  try {
    return win.getTitle();
  } catch {
    return '';
  }
}

function neuterContents(wc: WebContents): void {
  patch(wc, 'openDevTools', () => record('webContents.openDevTools', `#${wc.id}`), 'webContents.openDevTools');
  // `<input type=file>.click()` opens Chromium's own file chooser, which no `dialog` stub
  // reaches. CDP can intercept it: the chooser is reported (and recorded) instead of shown.
  const armFileChooserIntercept = (): void => {
    if (wc.isDestroyed()) return;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      void wc.debugger.sendCommand('Page.enable').then(() =>
        wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }),
      ).catch((err: unknown) => patchFailures.push(`file chooser #${wc.id}: ${String(err)}`));
    } catch (err) {
      patchFailures.push(`file chooser #${wc.id}: ${String(err)}`);
    }
  };
  wc.on('dom-ready', armFileChooserIntercept);
  wc.debugger.on('message', (_event, method) => {
    if (method === 'Page.fileChooserOpened') record('fileChooser (intercepted)', `#${wc.id}`);
  });
  // A bridge route that detaches the session takes the interception with it: re-arm.
  wc.debugger.on('detach', () => setTimeout(armFileChooserIntercept, 0));
  // The production build forwards no renderer console; the harness's app.log needs it.
  wc.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { message?: string; level?: string | number } | undefined;
    const message = typeof first?.message === 'string' ? first.message : String(args[2] ?? '');
    const level = first?.level ?? args[1] ?? '';
    if (message) console.log(`[e2e renderer #${wc.id} ${String(level)}] ${message.slice(0, 2000)}`);
  });
}

const guardedSessions = new WeakSet<Session>();

/**
 * Web notifications become OS toasts. Every permission handler the app installs on a
 * session is wrapped so `notifications` is refused before the app's own policy runs;
 * a session that never gets a handler refuses them too.
 */
export function guardSessionForE2e(ses: Session): void {
  if (guardedSessions.has(ses)) return;
  guardedSessions.add(ses);
  type ReqHandler = Parameters<Session['setPermissionRequestHandler']>[0];
  type CheckHandler = Parameters<Session['setPermissionCheckHandler']>[0];
  const setRequest = ses.setPermissionRequestHandler.bind(ses);
  const setCheck = ses.setPermissionCheckHandler.bind(ses);
  const wrapRequest = (handler: ReqHandler): ReqHandler =>
    (wc, permission, callback, details) => {
      if (permission === 'notifications') {
        record('permission.notifications', 'refused');
        callback(false);
        return;
      }
      if (handler) handler(wc, permission, callback, details);
      else callback(true);
    };
  const wrapCheck = (handler: CheckHandler): CheckHandler =>
    (wc, permission, origin, details) => {
      if (permission === 'notifications') return false;
      return handler ? handler(wc, permission, origin, details) : true;
    };
  // A download nobody handles (an `<a download>` export) opens Chromium's native Save As.
  // Under the harness it is saved straight into the temp profile instead, where the flow
  // can read the file back.
  // The Chromium half of the network witness (renderer fetches, net.fetch, subresources).
  // An observer only — `onCompleted` is free here (main.ts uses `onHeadersReceived`).
  try {
    ses.webRequest?.onCompleted?.({ urls: ['http://*/*', 'https://*/*'] }, (details) => {
      noteNetwork('net (chromium)', details.url);
    });
  } catch (err) {
    patchFailures.push(`network witness: ${String(err)}`);
  }
  ses.on('will-download', (_event, item) => {
    try {
      const dir = path.join(app.getPath('userData'), 'e2e-downloads');
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, path.basename(item.getFilename() || 'download'));
      if (!item.getSavePath()) item.setSavePath(target);
      record('download (saved without a dialog)', item.getSavePath());
    } catch (err) {
      patchFailures.push(`download: ${String(err)}`);
    }
  });
  patch(ses, 'setPermissionRequestHandler', (h: ReqHandler) => setRequest(wrapRequest(h)), 'session.setPermissionRequestHandler');
  patch(ses, 'setPermissionCheckHandler', (h: CheckHandler) => setCheck(wrapCheck(h)), 'session.setPermissionCheckHandler');
  setRequest(wrapRequest(null));
  setCheck(wrapCheck(null));
}

function dialogOptions(args: unknown[]): Record<string, unknown> {
  const opts = args.find((a) => a && typeof a === 'object' && !(a instanceof BrowserWindow));
  return (opts as Record<string, unknown>) ?? {};
}

function nextDialog(kind: E2eDialogKind): unknown {
  return dialogQueue[kind].shift();
}

function installDialogStubs(): void {
  const openResult = (args: unknown[]) => {
    const opts = dialogOptions(args);
    const queued = nextDialog('open') as { canceled?: boolean; filePaths?: string[] } | undefined;
    record('dialog.showOpenDialog', { title: opts.title, queued: Boolean(queued) });
    return queued ?? { canceled: true, filePaths: [] };
  };
  const saveResult = (args: unknown[]) => {
    const opts = dialogOptions(args);
    const queued = nextDialog('save') as { canceled?: boolean; filePath?: string } | undefined;
    record('dialog.showSaveDialog', { title: opts.title, defaultPath: opts.defaultPath, queued: Boolean(queued) });
    return queued ?? { canceled: true, filePath: '' };
  };
  const messageResult = (args: unknown[]) => {
    const opts = dialogOptions(args);
    const queued = nextDialog('message') as { response?: number; checkboxChecked?: boolean } | undefined;
    record('dialog.showMessageBox', { message: opts.message, queued: Boolean(queued) });
    const cancelId = typeof opts.cancelId === 'number' ? opts.cancelId : 0;
    return { response: cancelId, checkboxChecked: false, ...(queued ?? {}) };
  };
  patch(dialog, 'showOpenDialog', async (...a: unknown[]) => openResult(a), 'dialog.showOpenDialog');
  patch(dialog, 'showOpenDialogSync', (...a: unknown[]) => {
    const r = openResult(a) as { canceled?: boolean; filePaths?: string[] };
    return r.canceled ? undefined : r.filePaths;
  }, 'dialog.showOpenDialogSync');
  patch(dialog, 'showSaveDialog', async (...a: unknown[]) => saveResult(a), 'dialog.showSaveDialog');
  patch(dialog, 'showSaveDialogSync', (...a: unknown[]) => {
    const r = saveResult(a) as { canceled?: boolean; filePath?: string };
    return r.canceled ? '' : r.filePath;
  }, 'dialog.showSaveDialogSync');
  patch(dialog, 'showMessageBox', async (...a: unknown[]) => messageResult(a), 'dialog.showMessageBox');
  patch(dialog, 'showMessageBoxSync', (...a: unknown[]) => (messageResult(a) as { response: number }).response, 'dialog.showMessageBoxSync');
  patch(dialog, 'showErrorBox', (title: string, content: string) => record('dialog.showErrorBox', `${title}: ${content}`), 'dialog.showErrorBox');
}

/**
 * Decide, once, whether this process is a headless harness run, and if so install every
 * stub. Call at module top level of main.ts, before `app` is ready (the `ready` listener
 * below must run before the app's own permission policy is installed).
 */
export function initE2eHeadless(input: E2eHeadlessInput = {
  env: process.env,
  argv: process.argv,
  isPackaged: app.isPackaged,
}): boolean {
  if (installed) return active;
  installed = true;
  active = resolveE2eHeadless(input);
  if (!active) return false;
  console.log('[e2e] headless mode ON: windows stay hidden, OS side effects are stubbed');

  app.on('browser-window-created', (_event, win) => neuterWindow(win));
  app.on('web-contents-created', (_event, wc) => neuterContents(wc));
  app.on('session-created', (ses) => guardSessionForE2e(ses));
  // `ready` listeners run before any `whenReady().then` callback, so the default session
  // is wrapped before main.ts installs its permission policy on it.
  app.on('ready', () => guardSessionForE2e(session.defaultSession));

  patch(app, 'focus', (opts?: unknown) => record('app.focus', opts ?? ''), 'app.focus');
  patch(app, 'setLoginItemSettings', (s: unknown) => record('app.setLoginItemSettings', s), 'app.setLoginItemSettings');
  patch(app, 'setAsDefaultProtocolClient', (p: string) => {
    record('app.setAsDefaultProtocolClient', p);
    return false;
  }, 'app.setAsDefaultProtocolClient');
  patch(app, 'setJumpList', (l: unknown) => {
    record('app.setJumpList', l);
    return 'ok';
  }, 'app.setJumpList');
  patch(app, 'setUserTasks', () => {
    record('app.setUserTasks');
    return true;
  }, 'app.setUserTasks');

  patch(shell, 'openExternal', async (url: string) => record('shell.openExternal', url), 'shell.openExternal');
  patch(shell, 'openPath', async (p: string) => {
    record('shell.openPath', p);
    return '';
  }, 'shell.openPath');
  patch(shell, 'showItemInFolder', (p: string) => record('shell.showItemInFolder', p), 'shell.showItemInFolder');
  patch(shell, 'beep', () => record('shell.beep'), 'shell.beep');

  patch(Notification.prototype, 'show', function show(this: { title?: string }) {
    record('Notification.show', this?.title ?? '');
  }, 'Notification.prototype.show');
  patch(Menu.prototype, 'popup', () => record('Menu.popup'), 'Menu.prototype.popup');

  // "Registered but harmless": the app's own bookkeeping sees a held chord, Windows sees
  // nothing. The callback is kept, so the harness can press the chord (`fireE2eShortcut`)
  // exactly as Windows would deliver it.
  patch(globalShortcut, 'register', (accelerator: string, callback: () => void) => {
    record('globalShortcut.register', accelerator);
    if (typeof callback === 'function') shortcutCallbacks.set(accelerator, callback);
    return true;
  }, 'globalShortcut.register');
  patch(globalShortcut, 'registerAll', (accelerators: string[], callback: () => void) => {
    record('globalShortcut.registerAll', accelerators);
    for (const a of accelerators ?? []) if (typeof callback === 'function') shortcutCallbacks.set(a, callback);
  }, 'globalShortcut.registerAll');
  patch(globalShortcut, 'unregister', (accelerator: string) => {
    record('globalShortcut.unregister', accelerator);
    shortcutCallbacks.delete(accelerator);
  }, 'globalShortcut.unregister');
  patch(globalShortcut, 'unregisterAll', () => {
    record('globalShortcut.unregisterAll');
    shortcutCallbacks.clear();
  }, 'globalShortcut.unregisterAll');
  patch(globalShortcut, 'isRegistered', () => false, 'globalShortcut.isRegistered');

  // Squirrel's updater: an unpackaged or zip build never starts it, and under the harness
  // it could not run anyway. Any call is recorded, nothing is fetched or installed.
  if (autoUpdater) {
    patch(autoUpdater, 'checkForUpdates', () => record('autoUpdater.checkForUpdates'), 'autoUpdater.checkForUpdates');
    patch(autoUpdater, 'setFeedURL', (o: unknown) => record('autoUpdater.setFeedURL', o), 'autoUpdater.setFeedURL');
    patch(autoUpdater, 'quitAndInstall', () => record('autoUpdater.quitAndInstall'), 'autoUpdater.quitAndInstall');
  }

  // A network witness, not a block: every request main makes through Node's fetch is
  // recorded (origin + path, never the query), so a flow can assert that opening a
  // surface touched nothing. Chromium-side requests are witnessed per session below.
  const realFetch = globalThis.fetch;
  if (typeof realFetch === 'function') {
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      noteNetwork('net.fetch (main)', input instanceof Request ? input.url : String(input));
      return realFetch(input, init);
    }) as typeof fetch;
  }

  installDialogStubs();
  if (patchFailures.length) console.warn(`[e2e] patch failures: ${patchFailures.join('; ')}`);
  return true;
}

/** Queue the result the next OS dialog of that kind returns (debug bridge `/e2e`). */
export function queueE2eDialogResult(kind: E2eDialogKind, result: unknown): void {
  dialogQueue[kind].push(result);
}

export function clearE2eRecords(): void {
  calls.length = 0;
  violations.length = 0;
  network.length = 0;
}

/** What the harness reads back: what was stubbed, what slipped through, what is on screen. */
export function e2eHeadlessStatus(): Record<string, unknown> {
  const windows = BrowserWindow.getAllWindows().map((w) => ({
    id: w.id,
    /** What the desktop has: must always be false under the harness. */
    visible: w.isDestroyed() ? false : osVisible(w),
    /** What the app believes (its own show/hide calls). */
    shown: w.isDestroyed() ? false : w.isVisible(),
    url: w.isDestroyed() ? '' : w.webContents.getURL(),
  }));
  return {
    active,
    patchFailures: [...patchFailures],
    violations: [...violations],
    calls: [...calls],
    network: [...network],
    shortcuts: [...shortcutCallbacks.keys()],
    tray: e2eTrayItems(),
    pendingDialogs: { open: dialogQueue.open.length, save: dialogQueue.save.length, message: dialogQueue.message.length },
    windows,
    visibleWindows: windows.filter((w) => w.visible).length,
  };
}
