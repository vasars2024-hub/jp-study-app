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
 *  - web notifications are refused at the permission layer;
 *  - ISOLATION from the owner's real services and data (`installLoopbackGuard` and the
 *    stubs after it): every outgoing loopback connection — Node sockets in main (undici
 *    `fetch`, `http`, the texthooker WebSocket) and Chromium requests in every session —
 *    is witnessed, the well-known local service ports (AnkiConnect 8765, qBittorrent's
 *    WebUI 8080, texthookers 6677/9001/2333, Seanime 43211, Ollama 11434, LM Studio 1234)
 *    are remapped to the harness's fakes (`GUM_E2E_LOOPBACK`) or refused before a byte is
 *    sent; the clipboard (main `clipboard`, renderer `navigator.clipboard`,
 *    `execCommand('copy')`, `webContents.copy/paste`) is an in-memory buffer;
 *    `desktopCapturer` answers synthetic screens (`GUM_E2E_SCREEN_IMAGE`), every page's
 *    `getDisplayMedia`/`getUserMedia` answers a synthetic canvas + tone stream, and a
 *    display-media request that still reaches a session is refused; `shell.trashItem`
 *    only moves files inside the run's own profile; and the user folders (Videos,
 *    Downloads, Documents …) point into the temp profile.
 *
 * It can only be turned on deliberately: `GUM_E2E_HEADLESS=1` in a dev (unpackaged) run,
 * or that variable PLUS an explicit `--e2e` argument in a packaged build — a stray
 * environment variable on a user's machine cannot hide their app.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  app,
  autoUpdater,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  session,
  shell,
  type NativeImage,
  type Session,
  type WebContents,
} from 'electron';
import { E2E_SHIM_CHANNELS } from '../shared/e2eShimChannels';

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
  guardSessionLoopback(ses);
  installedIsolation.add('loopback guard (chromium sessions)');
  guardSessionCapture(ses);
  installedIsolation.add('display media (sessions)');
  guardSessionShim(ses);
  installedIsolation.add('clipboard (pages)');
  installedIsolation.add('display media (pages)');
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

// ---------------------------------------------------------------------------
// Isolation: the owner's local services, clipboard, screen and files.
// ---------------------------------------------------------------------------

/**
 * Loopback ports where a real service of the owner's may be listening. Under the harness
 * a connection to one is remapped to the harness's fake for it, or refused before it is
 * made — a fresh profile only ever knows these defaults, so they are the whole list.
 */
export const PROTECTED_LOOPBACK_PORTS: Readonly<Record<number, string>> = {
  8765: 'AnkiConnect',
  8080: 'qBittorrent WebUI',
  6677: 'texthooker (Textractor WebSocket)',
  9001: 'texthooker (Agent / exSTATic)',
  2333: 'texthooker (LunaTranslator)',
  43211: 'Seanime (installed copy)',
  11434: 'Ollama',
  1234: 'LM Studio',
};

export interface LoopbackGuardConfig {
  /** Port -> the fake's port. A remapped connection goes to the fake instead. */
  remap: Record<number, number>;
  /** Port -> what lives there. Contacting one that is not remapped is refused. */
  protect: Record<number, string>;
}

export interface LoopbackConnection {
  ts: number;
  /** `node` (a socket in main) or `chromium` (a session's request). */
  via: 'node' | 'chromium';
  host: string;
  port: number;
  /** `allowed`, `remapped` (to `to`) or `refused`. */
  verdict: 'allowed' | 'remapped' | 'refused';
  to?: number;
  service?: string;
}

/** `GUM_E2E_LOOPBACK` = `{"remap":{"8765":51234},"protect":{"9100":"x"}}`, merged onto the defaults. */
export function parseLoopbackConfig(raw: string | undefined): LoopbackGuardConfig {
  const config: LoopbackGuardConfig = { remap: {}, protect: { ...PROTECTED_LOOPBACK_PORTS } };
  if (!raw || !raw.trim()) return config;
  try {
    const parsed = JSON.parse(raw) as { remap?: Record<string, unknown>; protect?: Record<string, unknown> };
    for (const [from, to] of Object.entries(parsed.remap ?? {})) {
      const a = Number(from);
      const b = Number(to);
      if (Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0) config.remap[a] = b;
    }
    for (const [port, label] of Object.entries(parsed.protect ?? {})) {
      const p = Number(port);
      if (Number.isInteger(p) && p > 0) config.protect[p] = String(label);
    }
  } catch (err) {
    patchFailures.push(`GUM_E2E_LOOPBACK unreadable: ${String(err)}`);
  }
  return config;
}

function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127\./.test(h) || h === '::ffff:127.0.0.1';
}

const loopbackLog: LoopbackConnection[] = [];

function noteLoopback(entry: Omit<LoopbackConnection, 'ts'>): void {
  loopbackLog.push({ ts: Date.now(), ...entry });
  if (loopbackLog.length > CALL_LIMIT) loopbackLog.splice(0, loopbackLog.length - CALL_LIMIT);
  if (entry.verdict === 'refused') {
    console.warn(`[e2e] refused a loopback connection to ${entry.service ?? 'a protected service'} on ${entry.host}:${entry.port} (${entry.via})`);
  }
}

/** What the guard does with one loopback target. Pure, so the policy is testable alone. */
export function decideLoopback(config: LoopbackGuardConfig, host: string, port: number): Pick<LoopbackConnection, 'verdict' | 'to' | 'service'> {
  if (!isLoopbackHost(host)) return { verdict: 'allowed' };
  const to = config.remap[port];
  const service = config.protect[port];
  if (to) return { verdict: 'remapped', to, ...(service ? { service } : {}) };
  if (service) return { verdict: 'refused', service };
  return { verdict: 'allowed' };
}

let activeLoopbackConfig: LoopbackGuardConfig = parseLoopbackConfig(undefined);

/**
 * The Node half: wrap `net.Socket.prototype.connect`, which every TCP client in main goes
 * through (undici's `fetch` and WebSocket, `http.request`, `tls.connect`). A remapped
 * target is rewritten before the connection exists; a refused one fails the way a closed
 * port does (ECONNREFUSED), asynchronously, without a SYN ever leaving the process.
 * Returns the disposer (tests); installing twice is a no-op.
 */
type GuardedSocketProto = {
  connect: (...args: unknown[]) => unknown;
  __gumE2eGuard?: {
    original: (...args: unknown[]) => unknown;
    /** The newest installer's configuration and log (a re-imported module re-points them). */
    holder: { config: LoopbackGuardConfig; note: (entry: Omit<LoopbackConnection, 'ts'>) => void };
  };
};

/** Take the socket guard out again (tests; the app never does). */
export function uninstallLoopbackGuard(): void {
  const proto = net.Socket.prototype as unknown as GuardedSocketProto;
  if (!proto.__gumE2eGuard) return;
  proto.connect = proto.__gumE2eGuard.original;
  delete proto.__gumE2eGuard;
}

export function installLoopbackGuard(config: LoopbackGuardConfig): () => void {
  activeLoopbackConfig = config;
  const proto = net.Socket.prototype as unknown as GuardedSocketProto;
  if (proto.__gumE2eGuard) {
    // One guard per process: a second install (a re-imported module in tests) only
    // re-points it at the newest configuration.
    proto.__gumE2eGuard.holder.config = config;
    proto.__gumE2eGuard.holder.note = noteLoopback;
    return uninstallLoopbackGuard;
  }
  const original = proto.connect;
  const holder = { config, note: noteLoopback };
  const guarded = function connect(this: net.Socket, ...args: unknown[]): unknown {
    // `net.connect()` hands over its normalized `[options, cb]` array; direct callers pass
    // `(options, cb)`, `(port, host, cb)` or `(path, cb)` (a pipe: not ours to judge).
    const normalized = Array.isArray(args[0]) ? (args[0] as unknown[]) : null;
    let options: Record<string, unknown> | null = null;
    if (normalized && normalized[0] && typeof normalized[0] === 'object') options = normalized[0] as Record<string, unknown>;
    else if (!normalized && args[0] && typeof args[0] === 'object') options = args[0] as Record<string, unknown>;
    let port: number | null = null;
    let host = 'localhost';
    if (options) {
      // Node's own rule: a truthy `path` is a pipe; http hands over `path: null`, undici
      // `path: undefined` and the port as a string.
      if (!options.path && options.port !== undefined && options.port !== null) {
        port = Number(options.port);
        host = String(options.host ?? 'localhost');
      }
    } else if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^\d+$/.test(args[0]))) {
      port = Number(args[0]);
      host = typeof args[1] === 'string' ? args[1] : 'localhost';
    }
    if (port !== null && Number.isFinite(port) && isLoopbackHost(host)) {
      const decision = decideLoopback(holder.config, host, port);
      holder.note({ via: 'node', host, port, ...decision });
      if (decision.verdict === 'refused') {
        const err = Object.assign(new Error(`connect ECONNREFUSED ${host}:${port} (e2e: ${decision.service} is the owner's, not the harness's)`), {
          code: 'ECONNREFUSED',
          errno: -4078,
          syscall: 'connect',
          address: host,
          port,
        });
        process.nextTick(() => this.destroy(err));
        return this;
      }
      if (decision.verdict === 'remapped' && decision.to) {
        if (options) {
          const next = { ...options, port: decision.to, host: '127.0.0.1' };
          if (normalized) normalized[0] = next;
          else args[0] = next;
        } else {
          args[0] = decision.to;
          if (typeof args[1] === 'string') args[1] = '127.0.0.1';
        }
      }
    }
    return original.apply(this, args);
  };
  proto.connect = guarded;
  proto.__gumE2eGuard = { original, holder };
  return uninstallLoopbackGuard;
}

/**
 * Remote hosts the harness fakes (`GUM_E2E_REMOTE` = `{"jimaku.cc":"http://127.0.0.1:5123"}`):
 * a request to `https://jimaku.cc/api/x?q` goes to `<fake>/jimaku.cc/api/x?q` instead.
 */
let remoteMap: Record<string, string> = {};

export function parseRemoteMap(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [host, base] of Object.entries(parsed)) {
      const b = String(base ?? '');
      // Only ever onto loopback: a typo must not send a request somewhere new.
      if (/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(b)) out[host.toLowerCase()] = b.replace(/\/$/, '');
    }
    return out;
  } catch (err) {
    patchFailures.push(`GUM_E2E_REMOTE unreadable: ${String(err)}`);
    return {};
  }
}

/** The fake's URL for `url`, or null when its host is not faked. */
export function remapRemote(url: string, map: Record<string, string> = remoteMap): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const base = map[u.hostname.toLowerCase()];
    return base ? `${base}/${u.hostname.toLowerCase()}${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

/** The Chromium half, per session: renderer fetches, `net.fetch`, WebSockets, subresources. */
function guardSessionLoopback(ses: Session): void {
  try {
    ses.webRequest?.onBeforeRequest?.(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (details, callback) => {
        let u: URL;
        try {
          u = new URL(details.url);
        } catch {
          callback({});
          return;
        }
        if (!isLoopbackHost(u.hostname)) {
          const moved = remapRemote(details.url);
          if (moved) {
            record('net (chromium) -> harness fake', `${u.host} -> ${new URL(moved).host}`);
            callback({ redirectURL: moved });
            return;
          }
          callback({});
          return;
        }
        const port = Number(u.port || (u.protocol === 'https:' || u.protocol === 'wss:' ? 443 : 80));
        const decision = decideLoopback(activeLoopbackConfig, u.hostname, port);
        noteLoopback({ via: 'chromium', host: u.hostname, port, ...decision });
        if (decision.verdict === 'refused') {
          callback({ cancel: true });
          return;
        }
        if (decision.verdict === 'remapped' && decision.to) {
          u.hostname = '127.0.0.1';
          u.port = String(decision.to);
          callback({ redirectURL: u.toString() });
          return;
        }
        callback({});
      },
    );
  } catch (err) {
    patchFailures.push(`loopback guard (session): ${String(err)}`);
  }
}

// ----- clipboard: an in-memory buffer -------------------------------------------------

interface ClipboardBuffer {
  text: string;
  html: string;
  rtf: string;
  image: NativeImage | null;
  bookmark: { title: string; url: string };
  findText: string;
  buffers: Map<string, Buffer>;
  reads: number;
  writes: number;
}
const clip: ClipboardBuffer = {
  text: '',
  html: '',
  rtf: '',
  image: null,
  bookmark: { title: '', url: '' },
  findText: '',
  buffers: new Map(),
  reads: 0,
  writes: 0,
};

function clipClear(): void {
  clip.text = '';
  clip.html = '';
  clip.rtf = '';
  clip.image = null;
  clip.bookmark = { title: '', url: '' };
  clip.buffers.clear();
}

/** What a harness flow sees / sets as "the clipboard" (debug bridge `/e2e clipboard`). */
export function e2eClipboard(set?: { text?: string; imagePath?: string; clear?: boolean }): Record<string, unknown> {
  if (set?.clear) clipClear();
  if (typeof set?.text === 'string') {
    clipClear();
    clip.text = set.text;
  }
  if (set?.imagePath) {
    clipClear();
    try {
      clip.image = nativeImage.createFromPath(set.imagePath);
    } catch (err) {
      patchFailures.push(`clipboard image: ${String(err)}`);
    }
  }
  return {
    text: clip.text,
    html: clip.html,
    hasImage: Boolean(clip.image && !clip.image.isEmpty()),
    reads: clip.reads,
    writes: clip.writes,
  };
}

function emptyImage(): NativeImage {
  try {
    return nativeImage.createEmpty();
  } catch {
    return null as unknown as NativeImage;
  }
}

function installClipboardStubs(): void {
  if (!clipboard) {
    patchFailures.push('clipboard: module missing');
    return;
  }
  const read = <T>(api: string, value: () => T) => () => {
    clip.reads += 1;
    record(`clipboard.${api}`);
    return value();
  };
  const write = (api: string, apply: (v: unknown) => void) => (v: unknown) => {
    clip.writes += 1;
    record(`clipboard.${api}`, typeof v === 'string' ? `${v.length} chars` : '');
    apply(v);
  };
  patch(clipboard, 'readText', read('readText', () => clip.text), 'clipboard.readText');
  patch(clipboard, 'writeText', write('writeText', (v) => { clipClear(); clip.text = String(v ?? ''); }), 'clipboard.writeText');
  patch(clipboard, 'readHTML', read('readHTML', () => clip.html), 'clipboard.readHTML');
  patch(clipboard, 'writeHTML', write('writeHTML', (v) => { clip.html = String(v ?? ''); }), 'clipboard.writeHTML');
  patch(clipboard, 'readRTF', read('readRTF', () => clip.rtf), 'clipboard.readRTF');
  patch(clipboard, 'writeRTF', write('writeRTF', (v) => { clip.rtf = String(v ?? ''); }), 'clipboard.writeRTF');
  patch(clipboard, 'readImage', read('readImage', () => clip.image ?? emptyImage()), 'clipboard.readImage');
  patch(clipboard, 'writeImage', write('writeImage', (v) => { clip.image = (v as NativeImage) ?? null; }), 'clipboard.writeImage');
  patch(clipboard, 'readBookmark', read('readBookmark', () => ({ ...clip.bookmark })), 'clipboard.readBookmark');
  patch(clipboard, 'writeBookmark', (title: string, url: string) => {
    clip.writes += 1;
    record('clipboard.writeBookmark');
    clip.bookmark = { title: String(title ?? ''), url: String(url ?? '') };
  }, 'clipboard.writeBookmark');
  patch(clipboard, 'readFindText', read('readFindText', () => clip.findText), 'clipboard.readFindText');
  patch(clipboard, 'writeFindText', write('writeFindText', (v) => { clip.findText = String(v ?? ''); }), 'clipboard.writeFindText');
  patch(clipboard, 'readBuffer', (format: string) => {
    clip.reads += 1;
    record('clipboard.readBuffer', format);
    return clip.buffers.get(format) ?? Buffer.alloc(0);
  }, 'clipboard.readBuffer');
  patch(clipboard, 'writeBuffer', (format: string, buffer: Buffer) => {
    clip.writes += 1;
    record('clipboard.writeBuffer', format);
    clip.buffers.set(format, Buffer.from(buffer ?? []));
  }, 'clipboard.writeBuffer');
  patch(clipboard, 'availableFormats', () => {
    const formats: string[] = [];
    if (clip.text) formats.push('text/plain');
    if (clip.html) formats.push('text/html');
    if (clip.rtf) formats.push('text/rtf');
    if (clip.image && !clip.image.isEmpty()) formats.push('image/png');
    formats.push(...clip.buffers.keys());
    return formats;
  }, 'clipboard.availableFormats');
  patch(clipboard, 'has', (format: string) => {
    const f = String(format ?? '');
    if (/text\/plain|^text$/i.test(f)) return Boolean(clip.text);
    if (/html/i.test(f)) return Boolean(clip.html);
    if (/image/i.test(f)) return Boolean(clip.image && !clip.image.isEmpty());
    return clip.buffers.has(f);
  }, 'clipboard.has');
  patch(clipboard, 'clear', () => {
    record('clipboard.clear');
    clipClear();
  }, 'clipboard.clear');
  patch(clipboard, 'read', (format: string) => {
    clip.reads += 1;
    return clip.buffers.get(format)?.toString('utf8') ?? '';
  }, 'clipboard.read');
  patch(clipboard, 'write', (data: { text?: string; html?: string; rtf?: string; image?: NativeImage; bookmark?: string }) => {
    clip.writes += 1;
    record('clipboard.write');
    clipClear();
    clip.text = data?.text ?? '';
    clip.html = data?.html ?? '';
    clip.rtf = data?.rtf ?? '';
    clip.image = data?.image ?? null;
    if (data?.bookmark) clip.bookmark = { title: data.bookmark, url: data.text ?? '' };
  }, 'clipboard.write');
}

// ----- screen: synthetic sources ----------------------------------------------------

let screenImagePath = '';
let screenImage: NativeImage | null = null;

/** The picture every synthetic screen shows (a PNG path; '' = a plain grey frame). */
export function setE2eScreenImage(file: string): boolean {
  screenImagePath = file;
  screenImage = null;
  if (!file) return true;
  try {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return false;
    screenImage = img;
    return true;
  } catch (err) {
    patchFailures.push(`screen image: ${String(err)}`);
    return false;
  }
}

function syntheticFrame(width: number, height: number): NativeImage {
  if (width <= 0 || height <= 0) return emptyImage();
  try {
    if (screenImage && !screenImage.isEmpty()) {
      const size = screenImage.getSize();
      return size.width === width && size.height === height ? screenImage : screenImage.resize({ width, height, quality: 'best' });
    }
    const w = Math.min(width, 64);
    const h = Math.min(height, 64);
    const bitmap = Buffer.alloc(w * h * 4, 0x80);
    for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = 0xff;
    return nativeImage.createFromBitmap(bitmap, { width: w, height: h }).resize({ width, height });
  } catch {
    return emptyImage();
  }
}

const captureLog = { getSources: 0, displayMediaRefused: 0, shimNotes: [] as string[] };

function installCaptureStubs(): void {
  if (!desktopCapturer) {
    patchFailures.push('desktopCapturer: module missing');
    return;
  }
  // No real pixels ever: every screen is the harness's picture, and there are no windows
  // to list (a window source would name the owner's open windows).
  patch(desktopCapturer, 'getSources', async (opts: { types?: string[]; thumbnailSize?: { width: number; height: number } }) => {
    captureLog.getSources += 1;
    record('desktopCapturer.getSources', { types: opts?.types, image: screenImagePath ? path.basename(screenImagePath) : 'grey' });
    if (!(opts?.types ?? []).includes('screen')) return [];
    const size = opts?.thumbnailSize ?? { width: 150, height: 150 };
    let displays: Array<{ id: number }> = [];
    try {
      displays = screen.getAllDisplays();
    } catch {
      displays = [{ id: 0 }];
    }
    return displays.map((d, i) => ({
      id: `screen:e2e-${i}:0`,
      name: `E2E synthetic screen ${i + 1}`,
      display_id: String(d.id),
      thumbnail: syntheticFrame(size.width, size.height),
      appIcon: null,
    }));
  }, 'desktopCapturer.getSources');
}

/** A display-media request that reaches a session anyway is refused: no real screen, ever. */
function guardSessionCapture(ses: Session): void {
  const set = (ses as unknown as { setDisplayMediaRequestHandler?: (...a: unknown[]) => void }).setDisplayMediaRequestHandler;
  if (typeof set !== 'function') return;
  const refuse = (_request: unknown, callback: (streams: Record<string, unknown>) => void) => {
    captureLog.displayMediaRefused += 1;
    record('session display-media request (refused: the page shim answers instead)');
    callback({});
  };
  patch(ses, 'setDisplayMediaRequestHandler', () => {
    record('session.setDisplayMediaRequestHandler (kept refusing)');
    set.call(ses, refuse);
  }, 'session.setDisplayMediaRequestHandler');
  try {
    set.call(ses, refuse);
  } catch (err) {
    patchFailures.push(`display media handler: ${String(err)}`);
  }
}

/**
 * Runs in every page's MAIN world before its own scripts (a session preload calls it
 * through `contextBridge.executeInMainWorld`): `navigator.clipboard` and
 * `execCommand('copy'|'cut'|'paste')` use the harness buffer; `getDisplayMedia` and
 * `getUserMedia` answer a synthetic testsrc-like canvas stream (moving colour bars, a
 * frame counter) plus a 440 Hz tone, so the recorder and the caption capture run
 * end to end without the screen, a microphone or the system audio.
 */
export function e2ePageShim(bridge: {
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
  note: (what: string) => void;
}): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__gumE2eShim) return;
  const state = { displayMedia: 0, userMedia: 0, clipboardWrites: 0, clipboardReads: 0 };
  Object.defineProperty(w, '__gumE2eShim', { value: state, configurable: false });
  const define = (target: object, key: string, value: unknown) => {
    try {
      Object.defineProperty(target, key, { value, configurable: true, writable: true });
    } catch {
      /* frozen host object: the session-level refusals still hold */
    }
  };
  const cb = navigator.clipboard;
  if (cb) {
    define(cb, 'writeText', async (text: string) => {
      state.clipboardWrites += 1;
      await bridge.writeText(String(text ?? ''));
    });
    define(cb, 'readText', async () => {
      state.clipboardReads += 1;
      return String((await bridge.readText()) ?? '');
    });
    define(cb, 'write', async (items: Array<{ types: string[]; getType: (t: string) => Promise<Blob> }>) => {
      state.clipboardWrites += 1;
      for (const item of items ?? []) {
        if (item.types.includes('text/plain')) {
          await bridge.writeText(await (await item.getType('text/plain')).text());
          return;
        }
      }
      bridge.note('navigator.clipboard.write without text/plain: kept in the page, never the OS');
    });
    define(cb, 'read', async () => {
      state.clipboardReads += 1;
      const text = String((await bridge.readText()) ?? '');
      const Item = (window as unknown as { ClipboardItem?: new (d: Record<string, Blob>) => unknown }).ClipboardItem;
      return Item ? [new Item({ 'text/plain': new Blob([text], { type: 'text/plain' }) })] : [];
    });
  }
  const exec = Document.prototype.execCommand;
  define(Document.prototype, 'execCommand', function execCommand(this: Document, command: string, ...rest: unknown[]) {
    const c = String(command ?? '').toLowerCase();
    if (c === 'copy' || c === 'cut') {
      const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      let text = '';
      if (active && typeof active.selectionStart === 'number' && typeof active.value === 'string') {
        text = active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0);
      } else {
        text = String(document.getSelection() ?? '');
      }
      state.clipboardWrites += 1;
      void bridge.writeText(text);
      if (c === 'cut' && active && typeof active.setRangeText === 'function') active.setRangeText('');
      return true;
    }
    if (c === 'paste') return false;
    return exec.call(this, command, ...(rest as [boolean, string]));
  });

  const tone = (): MediaStreamTrack | null => {
    try {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      osc.frequency.value = 440;
      const gain = ac.createGain();
      gain.gain.value = 0.1;
      const dst = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dst);
      osc.start();
      void ac.resume?.();
      return dst.stream.getAudioTracks()[0] ?? null;
    } catch {
      return null;
    }
  };
  const bars = (width = 1280, height = 720): MediaStreamTrack | null => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext('2d');
      if (!g) return null;
      const colours = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      let frame = 0;
      const draw = () => {
        frame += 1;
        const bw = width / colours.length;
        colours.forEach((c, i) => {
          g.fillStyle = c;
          g.fillRect(i * bw, 0, bw + 1, height * 0.7);
        });
        g.fillStyle = '#101010';
        g.fillRect(0, height * 0.7, width, height * 0.3);
        g.fillStyle = '#ffffff';
        g.fillRect(((frame * 8) % (width + 80)) - 80, height * 0.74, 80, 80);
        g.font = `${Math.round(height / 12)}px monospace`;
        g.fillText(`GUM E2E ${String(frame).padStart(5, '0')}`, 24, height * 0.95);
      };
      draw();
      setInterval(draw, 33);
      return (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(30).getVideoTracks()[0] ?? null;
    } catch {
      return null;
    }
  };
  const synthetic = (wantVideo: boolean, wantAudio: boolean): MediaStream => {
    const tracks: MediaStreamTrack[] = [];
    if (wantVideo) {
      const v = bars();
      if (v) tracks.push(v);
    }
    if (wantAudio) {
      const a = tone();
      if (a) tracks.push(a);
    }
    return new MediaStream(tracks);
  };
  const md = navigator.mediaDevices;
  if (md) {
    define(md, 'getDisplayMedia', async (constraints?: { video?: unknown; audio?: unknown }) => {
      state.displayMedia += 1;
      bridge.note('getDisplayMedia (synthetic)');
      return synthetic(constraints?.video !== false, Boolean(constraints?.audio));
    });
    define(md, 'getUserMedia', async (constraints?: { video?: unknown; audio?: unknown }) => {
      state.userMedia += 1;
      bridge.note('getUserMedia (synthetic)');
      return synthetic(Boolean(constraints?.video), Boolean(constraints?.audio));
    });
  }
}

/** The session preload that installs `e2ePageShim` in each page's main world. */
function shimPreloadSource(): string {
  return `'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const bridge = {
  readText: () => ipcRenderer.invoke(${JSON.stringify(E2E_SHIM_CHANNELS.clipboardRead)}),
  writeText: (t) => ipcRenderer.invoke(${JSON.stringify(E2E_SHIM_CHANNELS.clipboardWrite)}, String(t ?? '')),
  note: (what) => ipcRenderer.send(${JSON.stringify(E2E_SHIM_CHANNELS.note)}, String(what ?? '')),
};
const shim = ${e2ePageShim.toString()};
try {
  if (process.contextIsolated && contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: shim, args: [bridge] });
  else shim(bridge);
} catch (err) {
  ipcRenderer.send(${JSON.stringify(E2E_SHIM_CHANNELS.note)}, 'shim failed: ' + String(err));
}
`;
}

let shimPreloadPath = '';

function writeShimPreload(): string {
  if (shimPreloadPath) return shimPreloadPath;
  try {
    const dir = path.join(app.getPath('userData'), 'e2e');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'page-shim-preload.js');
    fs.writeFileSync(file, shimPreloadSource());
    shimPreloadPath = file;
  } catch (err) {
    patchFailures.push(`page shim preload: ${String(err)}`);
  }
  return shimPreloadPath;
}

function guardSessionShim(ses: Session): void {
  const file = writeShimPreload();
  const register = (ses as unknown as { registerPreloadScript?: (s: Record<string, unknown>) => string }).registerPreloadScript;
  if (!file || typeof register !== 'function') {
    patchFailures.push('page shim: session.registerPreloadScript unavailable');
    return;
  }
  try {
    register.call(ses, { type: 'frame', id: 'gum-e2e-page-shim', filePath: file });
  } catch (err) {
    patchFailures.push(`page shim register: ${String(err)}`);
  }
}

function installShimIpc(): void {
  if (!ipcMain) return;
  try {
    ipcMain.handle(E2E_SHIM_CHANNELS.clipboardRead, () => {
      clip.reads += 1;
      record('navigator.clipboard.readText (buffer)');
      return clip.text;
    });
    ipcMain.handle(E2E_SHIM_CHANNELS.clipboardWrite, (_event, text: unknown) => {
      clip.writes += 1;
      record('navigator.clipboard.writeText (buffer)', `${String(text ?? '').length} chars`);
      clipClear();
      clip.text = String(text ?? '');
    });
    ipcMain.on(E2E_SHIM_CHANNELS.note, (_event, what: unknown) => {
      captureLog.shimNotes.push(String(what));
      if (captureLog.shimNotes.length > 100) captureLog.shimNotes.shift();
      record('page shim', String(what));
    });
  } catch (err) {
    patchFailures.push(`shim ipc: ${String(err)}`);
  }
}

// ----- files: the Recycle Bin and the user folders -------------------------------------

function insideRun(target: string): boolean {
  const roots: string[] = [];
  try {
    roots.push(app.getPath('userData'));
  } catch {
    /* no app (tests) */
  }
  const runArg = process.argv.find((a) => a.startsWith('--e2e-run='));
  if (runArg) roots.push(runArg.slice('--e2e-run='.length));
  const resolved = path.resolve(target).toLowerCase();
  return roots.some((root) => {
    const r = path.resolve(root).toLowerCase();
    return resolved === r || resolved.startsWith(r + path.sep);
  });
}

function installFileStubs(): void {
  // "Move to the Recycle Bin" without the Recycle Bin: a file of the run's own profile is
  // moved aside into it (so a restore check could still find it); anything else is left
  // exactly where it is and the attempt is a violation.
  patch(shell, 'trashItem', async (target: string) => {
    if (!insideRun(String(target ?? ''))) {
      violation('shell.trashItem outside the run', String(target));
      throw new Error('e2e: refused to trash a path outside the run');
    }
    const bin = path.join(app.getPath('userData'), 'e2e-trash');
    fs.mkdirSync(bin, { recursive: true });
    const dest = path.join(bin, `${Date.now()}-${path.basename(target)}`);
    try {
      fs.renameSync(target, dest);
    } catch (err) {
      // Windows refuses to move an open file; the real trashItem fails the same way.
      record('shell.trashItem failed (file busy?)', `${target}: ${String(err)}`);
      throw err;
    }
    record('shell.trashItem (moved inside the run)', dest);
  }, 'shell.trashItem');
  patch(shell, 'writeShortcutLink', (p: string) => {
    record('shell.writeShortcutLink', p);
    return true;
  }, 'shell.writeShortcutLink');
  // The user folders: the recorder's default is Videos\Gum Recordings, exports default to
  // Downloads. Under the harness they are folders of the temp profile.
  try {
    const home = path.join(app.getPath('userData'), 'e2e-home');
    for (const name of ['desktop', 'documents', 'downloads', 'music', 'pictures', 'videos'] as const) {
      const dir = path.join(home, name);
      fs.mkdirSync(dir, { recursive: true });
      app.setPath(name, dir);
    }
    record('user folders redirected', home);
  } catch (err) {
    patchFailures.push(`user folders: ${String(err)}`);
  }
}

function neuterContentsIsolation(wc: WebContents): void {
  // `webContents.copy()` & co. drive Chromium's native clipboard commands.
  const viaPage = (command: 'copy' | 'cut' | 'paste') => () => {
    record(`webContents.${command} (buffer)`, `#${wc.id}`);
    void wc.executeJavaScript(`document.execCommand(${JSON.stringify(command)})`, true).catch(() => undefined);
  };
  patch(wc, 'copy', viaPage('copy'), 'webContents.copy');
  patch(wc, 'cut', viaPage('cut'), 'webContents.cut');
  patch(wc, 'paste', viaPage('paste'), 'webContents.paste');
  patch(wc, 'pasteAndMatchStyle', viaPage('paste'), 'webContents.pasteAndMatchStyle');
  patch(wc, 'copyImageAt', () => record('webContents.copyImageAt (dropped)'), 'webContents.copyImageAt');
  // The session preload installs the page shim before the page's own scripts. A page it
  // did not reach (a session created without it, a preload refused) gets it at dom-ready,
  // with a page-local clipboard — late, but never the OS clipboard or the real screen —
  // and the miss is recorded so the harness can see it.
  wc.on('dom-ready', () => {
    if (wc.isDestroyed()) return;
    const fallback = `(() => { if (window.__gumE2eShim) return 'present';
      let buffer = '';
      (${e2ePageShim.toString()})({
        readText: async () => buffer,
        writeText: async (t) => { buffer = String(t); },
        note: () => undefined,
      });
      return 'fallback'; })()`;
    void wc.executeJavaScript(fallback, true).then((how: unknown) => {
      if (how === 'fallback') {
        captureLog.shimNotes.push(`page shim installed late (dom-ready) in #${wc.id} ${safeUrl(wc)}`);
        record('page shim (late, dom-ready)', `#${wc.id}`);
      }
    }).catch(() => undefined);
  });
}

function safeUrl(wc: WebContents): string {
  try {
    return wc.getURL().slice(0, 120);
  } catch {
    return '';
  }
}

/** Which isolation stubs are in place (the harness's boot flow and the unit test read it). */
export const ISOLATION_STUBS = [
  'loopback guard (node sockets)',
  'loopback guard (chromium sessions)',
  'clipboard (main)',
  'clipboard (pages)',
  'desktopCapturer.getSources',
  'display media (pages)',
  'display media (sessions)',
  'shell.trashItem',
  'shell.openPath',
  'user folders',
] as const;
const installedIsolation = new Set<string>();

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
  app.on('web-contents-created', (_event, wc) => {
    neuterContents(wc);
    neuterContentsIsolation(wc);
  });
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
  // A host the harness fakes (`GUM_E2E_REMOTE`: subtitle / metadata providers) is
  // answered by its fake instead.
  remoteMap = parseRemoteMap(input.env.GUM_E2E_REMOTE);
  const realFetch = globalThis.fetch;
  if (typeof realFetch === 'function') {
    globalThis.fetch = ((target: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = target instanceof Request ? target.url : String(target);
      const moved = remapRemote(url);
      if (moved) {
        record('net.fetch (main) -> harness fake', `${new URL(url).host} -> ${new URL(moved).host}`);
        return realFetch(target instanceof Request ? new Request(moved, target) : moved, init);
      }
      noteNetwork('net.fetch (main)', url);
      return realFetch(target, init);
    }) as typeof fetch;
  }

  // Isolation from the owner's own services, clipboard, screen and files.
  installLoopbackGuard(parseLoopbackConfig(input.env.GUM_E2E_LOOPBACK));
  installedIsolation.add('loopback guard (node sockets)');
  installClipboardStubs();
  installedIsolation.add('clipboard (main)');
  if (input.env.GUM_E2E_SCREEN_IMAGE) setE2eScreenImage(String(input.env.GUM_E2E_SCREEN_IMAGE));
  installCaptureStubs();
  installedIsolation.add('desktopCapturer.getSources');
  installShimIpc();
  installFileStubs();
  installedIsolation.add('shell.trashItem');
  installedIsolation.add('shell.openPath');
  installedIsolation.add('user folders');

  installDialogStubs();
  if (patchFailures.length) console.warn(`[e2e] patch failures: ${patchFailures.join('; ')}`);
  return true;
}

// ---- powerMonitor (lock4) ------------------------------------------------------------
//
// Auto-lock (`lockAutoArm.ts`) listens to Electron's real `powerMonitor`. The harness
// cannot put the owner's PC to sleep, lock their Windows session or stop them typing,
// so it drives the same object instead: an event is EMITTED on the real powerMonitor
// (exactly what Electron's native side does when Windows reports it, so every listener
// main registered hears it), and the system idle time the auto-lock poll reads can be
// overridden. Nothing here reaches Windows. Only the two events auto-lock arms on are
// allowed; `resume` / `unlock-screen` would only wake things the harness does not test.

const E2E_POWER_EVENTS: readonly string[] = ['suspend', 'lock-screen'];

let idleOverrideSeconds: number | null = null;
let idlePatched = false;
const powerFired: Array<{ event: string; ts: number }> = [];

export interface E2ePowerRequest {
  /** `suspend` or `lock-screen`, emitted on the real powerMonitor. */
  event?: unknown;
  /** Seconds `powerMonitor.getSystemIdleTime()` answers from now on; null = the real value. */
  idleSeconds?: unknown;
}

export function e2ePowerStatus(): Record<string, unknown> {
  return { idleOverrideSeconds, fired: [...powerFired] };
}

/** The debug bridge's `/e2e` action `power`. Refused unless headless mode is on. */
export function e2ePower(req: E2ePowerRequest): { ok: boolean; error?: string; power: Record<string, unknown> } {
  if (!active) return { ok: false, error: 'e2e headless mode is off', power: e2ePowerStatus() };
  if (req.idleSeconds !== undefined) {
    const v = req.idleSeconds;
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      return { ok: false, error: 'idleSeconds must be a number >= 0 or null', power: e2ePowerStatus() };
    }
    if (!idlePatched) {
      const real = powerMonitor.getSystemIdleTime.bind(powerMonitor);
      patch(powerMonitor, 'getSystemIdleTime', () => idleOverrideSeconds ?? real(), 'powerMonitor.getSystemIdleTime');
      idlePatched = true;
    }
    idleOverrideSeconds = v as number | null;
    record('powerMonitor.idleOverride', idleOverrideSeconds ?? 'real');
  }
  if (req.event !== undefined) {
    const event = String(req.event);
    if (!E2E_POWER_EVENTS.includes(event)) {
      return { ok: false, error: `event must be one of ${E2E_POWER_EVENTS.join(', ')}`, power: e2ePowerStatus() };
    }
    powerFired.push({ event, ts: Date.now() });
    record('powerMonitor.emit', event);
    (powerMonitor as unknown as { emit(e: string): boolean }).emit(event);
  }
  return { ok: true, power: e2ePowerStatus() };
}

/** Queue the result the next OS dialog of that kind returns (debug bridge `/e2e`). */
export function queueE2eDialogResult(kind: E2eDialogKind, result: unknown): void {
  dialogQueue[kind].push(result);
}

export function clearE2eRecords(): void {
  calls.length = 0;
  violations.length = 0;
  network.length = 0;
  loopbackLog.length = 0;
  powerFired.length = 0;
}

/** The isolation half of the status: what is stubbed, and every loopback connection seen. */
export function e2eIsolationStatus(): Record<string, unknown> {
  const refused = loopbackLog.filter((c) => c.verdict === 'refused');
  const remapped = loopbackLog.filter((c) => c.verdict === 'remapped');
  const ports = [...new Set(loopbackLog.map((c) => c.port))].sort((a, b) => a - b);
  return {
    stubs: ISOLATION_STUBS.map((name) => ({ name, installed: installedIsolation.has(name) })),
    missing: ISOLATION_STUBS.filter((name) => !installedIsolation.has(name)),
    loopback: {
      config: activeLoopbackConfig,
      ports,
      connections: [...loopbackLog],
      refused: refused.length,
      remapped: remapped.length,
      /** A protected port contacted WITHOUT the guard turning it into the fake or a refusal: must be 0. */
      leaked: loopbackLog.filter((c) => activeLoopbackConfig.protect[c.port] && c.verdict === 'allowed').length,
    },
    remote: remoteMap,
    clipboard: e2eClipboard(),
    capture: { getSources: captureLog.getSources, displayMediaRefused: captureLog.displayMediaRefused, screenImage: screenImagePath },
    shimNotes: [...captureLog.shimNotes],
  };
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
    power: e2ePowerStatus(),
    pendingDialogs: { open: dialogQueue.open.length, save: dialogQueue.save.length, message: dialogQueue.message.length },
    windows,
    visibleWindows: windows.filter((w) => w.visible).length,
    isolation: e2eIsolationStatus(),
  };
}
