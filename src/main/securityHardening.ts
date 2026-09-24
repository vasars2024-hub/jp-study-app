/**
 * App-wide Electron hardening (audit robust #4).
 *
 * Before: ~600 `ipcMain` handlers answered any sender (no frame or origin
 * check), no session had a permission handler (Electron's default grants every
 * request — any site in the Immersion browser got the microphone and
 * notifications without asking), and navigation / window.open guards existed
 * only on the windows that happened to call `attachNavGuards` — the companion
 * host, the PDF window and Immersion-browser popups had none.
 *
 * Three layers, all installed before any window or handler exists:
 *
 * 1. `installIpcSenderGuard` wraps `ipcMain.handle/on/…` once, so every handler
 *    registered afterwards only runs for the app's own top-level frames
 *    (app://bundle packaged, the Vite origin in dev). <webview> guests (the
 *    Immersion browser) and any other origin are refused; `invoke` rejects.
 * 2. `installWebContentsHardening` (`web-contents-created`): app windows cannot
 *    navigate away from the app or open windows (http(s) goes to the default
 *    browser); guests can browse the web but never open native windows (a popup
 *    loads in the same guest) and never navigate to a privileged scheme; every
 *    <webview> attach is forced to safe preferences.
 * 3. `permissionAllowed`: an allow-list per session. App origins get what the
 *    app uses — microphone (audio only, shadowing recordings), clipboard
 *    read/write, fullscreen, local fonts (subtitle renderer). The Immersion
 *    session gets fullscreen and clipboard write. Everything else is denied.
 */
import type { App, IpcMain, IpcMainEvent, IpcMainInvokeEvent, Session, WebContents } from 'electron';

export interface AppOriginPolicy {
  /** Origins whose top frame may call privileged IPC. */
  isAppOrigin(origin: string | null | undefined): boolean;
  /** URLs an app window may navigate to. */
  isAppUrl(url: string): boolean;
}

/**
 * `scheme://host[:port]` for any URL. Node's `URL#origin` is the string "null"
 * for non-special schemes such as `app:`, while Chromium reports `app://bundle`
 * as a custom standard scheme's origin — so it is computed by hand.
 */
export function urlOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.host) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function makeAppOriginPolicy(devServerUrl?: string | null): AppOriginPolicy {
  const origins = new Set<string>(['app://bundle']);
  let devOrigin: string | null = null;
  if (devServerUrl) {
    try {
      devOrigin = new URL(devServerUrl).origin;
      origins.add(devOrigin);
      // Vite answers on both names; Chromium reports whichever the URL used.
      const u = new URL(devServerUrl);
      if (u.hostname === 'localhost') origins.add(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ''}`);
      if (u.hostname === '127.0.0.1') origins.add(`${u.protocol}//localhost${u.port ? `:${u.port}` : ''}`);
    } catch {
      /* no dev origin */
    }
  }
  return {
    isAppOrigin: (origin) => typeof origin === 'string' && origins.has(origin),
    isAppUrl: (url) => {
      if (!url || url === 'about:blank') return true;
      if (url.startsWith('devtools://') || url.startsWith('chrome-devtools://')) return true;
      const origin = urlOrigin(url);
      return origin != null && origins.has(origin);
    },
  };
}

// ── 1. IPC sender guard ──────────────────────────────────────────────────────

export interface SenderInfo {
  senderType: string;
  frameOrigin: string | null;
  isTopFrame: boolean;
}

export function senderInfo(event: IpcMainEvent | IpcMainInvokeEvent): SenderInfo {
  let senderType = 'unknown';
  try {
    senderType = event.sender?.getType?.() ?? 'unknown';
  } catch {
    /* destroyed */
  }
  let frameOrigin: string | null = null;
  let isTopFrame = false;
  try {
    const frame = event.senderFrame;
    frameOrigin = frame?.origin ?? null;
    isTopFrame = Boolean(frame) && !frame?.parent;
  } catch {
    /* frame gone (navigated/destroyed) */
  }
  return { senderType, frameOrigin, isTopFrame };
}

export function isTrustedIpcSender(info: SenderInfo, policy: AppOriginPolicy): boolean {
  if (info.senderType === 'webview') return false;
  if (!info.isTopFrame) return false;
  return policy.isAppOrigin(info.frameOrigin);
}

type AnyListener = (event: never, ...args: never[]) => unknown;

/**
 * Wrap `ipcMain` so every handler registered from now on checks its sender.
 * Idempotent. `onBlocked` is told once per channel+origin.
 */
export function installIpcSenderGuard(
  ipc: IpcMain,
  policy: AppOriginPolicy,
  onBlocked: (channel: string, info: SenderInfo) => void,
): void {
  const marker = ipc as IpcMain & { __gumSenderGuard?: boolean };
  if (marker.__gumSenderGuard) return;
  marker.__gumSenderGuard = true;
  const reported = new Set<string>();
  const block = (channel: string, info: SenderInfo): void => {
    const key = `${channel}|${info.senderType}|${info.frameOrigin}`;
    if (reported.has(key)) return;
    reported.add(key);
    onBlocked(channel, info);
  };
  const wrappers = new WeakMap<AnyListener, AnyListener>();

  const guardInvoke = (channel: string, handler: AnyListener): AnyListener => {
    const wrapped = ((event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const info = senderInfo(event);
      if (!isTrustedIpcSender(info, policy)) {
        block(channel, info);
        throw new Error(`IPC "${channel}" refused: untrusted sender`);
      }
      return (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args);
    }) as AnyListener;
    return wrapped;
  };
  const guardOn = (channel: string, listener: AnyListener): AnyListener => {
    const existing = wrappers.get(listener);
    if (existing) return existing;
    const wrapped = ((event: IpcMainEvent, ...args: unknown[]) => {
      const info = senderInfo(event);
      if (!isTrustedIpcSender(info, policy)) {
        block(channel, info);
        return undefined;
      }
      return (listener as (e: IpcMainEvent, ...a: unknown[]) => unknown)(event, ...args);
    }) as AnyListener;
    wrappers.set(listener, wrapped);
    return wrapped;
  };

  const handle = ipc.handle.bind(ipc);
  const handleOnce = ipc.handleOnce.bind(ipc);
  const on = ipc.on.bind(ipc);
  const once = ipc.once.bind(ipc);
  const removeListener = ipc.removeListener.bind(ipc);
  const off = ipc.off.bind(ipc);

  ipc.handle = ((channel: string, handler: AnyListener) => handle(channel, guardInvoke(channel, handler) as never)) as IpcMain['handle'];
  ipc.handleOnce = ((channel: string, handler: AnyListener) =>
    handleOnce(channel, guardInvoke(channel, handler) as never)) as IpcMain['handleOnce'];
  ipc.on = ((channel: string, listener: AnyListener) => on(channel, guardOn(channel, listener) as never)) as IpcMain['on'];
  ipc.once = ((channel: string, listener: AnyListener) => once(channel, guardOn(channel, listener) as never)) as IpcMain['once'];
  ipc.removeListener = ((channel: string, listener: AnyListener) =>
    removeListener(channel, (wrappers.get(listener) ?? listener) as never)) as IpcMain['removeListener'];
  ipc.off = ((channel: string, listener: AnyListener) => off(channel, (wrappers.get(listener) ?? listener) as never)) as IpcMain['off'];
}

// ── 2. web contents ──────────────────────────────────────────────────────────

const GUEST_NAVIGABLE = /^(https?:|about:blank|data:|blob:)/i;

export function installWebContentsHardening(
  app: App,
  policy: AppOriginPolicy,
  deps: { openExternal: (url: string) => void; onBlocked?: (what: string, url: string) => void },
): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    if (contents.getType() === 'webview') {
      // Guests browse the web, but a popup is never a native window with no
      // guards: http(s) popups load in the same guest, anything else is dropped.
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void contents.loadURL(url).catch(() => undefined);
        return { action: 'deny' };
      });
      contents.on('will-navigate', (e, url) => {
        if (!GUEST_NAVIGABLE.test(url)) {
          e.preventDefault();
          deps.onBlocked?.('guest-navigation', url);
        }
      });
      contents.on('will-redirect', (e, url) => {
        if (!GUEST_NAVIGABLE.test(url)) e.preventDefault();
      });
      return;
    }
    // App windows. Per-window guards (attachNavGuards) may add their own
    // handlers; these are the floor every window gets.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) deps.openExternal(url);
      else deps.onBlocked?.('window-open', url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (e, url) => {
      if (policy.isAppUrl(url)) return;
      e.preventDefault();
      if (!/^https?:\/\//i.test(url)) deps.onBlocked?.('navigation', url);
    });
    contents.on('will-attach-webview', (e, webPreferences, params) => {
      const src = String(params.src ?? '');
      if (src && !GUEST_NAVIGABLE.test(src)) {
        e.preventDefault();
        deps.onBlocked?.('webview-src', src);
        return;
      }
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      // attachNavGuards (registered later on app windows) re-adds the vetted
      // Immersion guest bridge; nothing else may inject a preload into a guest.
      delete (webPreferences as { preload?: string }).preload;
    });
  });
}

// ── 3. permissions ───────────────────────────────────────────────────────────

export type SessionKind = 'app' | 'immersion' | 'other';

const APP_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'local-fonts']);
const IMMERSION_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

export function permissionAllowed(
  kind: SessionKind,
  permission: string,
  origin: string | null | undefined,
  policy: AppOriginPolicy,
  mediaTypes?: readonly string[],
): boolean {
  if (kind === 'app') {
    if (!policy.isAppOrigin(origin)) return false;
    if (!APP_PERMISSIONS.has(permission)) return false;
    // The microphone for shadowing recordings — never the camera.
    if (permission === 'media') return !!mediaTypes && mediaTypes.length > 0 && mediaTypes.every((t) => t === 'audio');
    return true;
  }
  if (kind === 'immersion') return IMMERSION_PERMISSIONS.has(permission);
  return false;
}

export function installPermissionPolicy(
  ses: Session,
  kind: SessionKind,
  policy: AppOriginPolicy,
  onDenied?: (permission: string, origin: string | null) => void,
): void {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = urlOrigin((details as { requestingUrl?: string }).requestingUrl) ?? urlOrigin(wc?.getURL());
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes;
    const ok = permissionAllowed(kind, permission, origin, policy, mediaTypes);
    if (!ok) onDenied?.(permission, origin);
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    const mediaType = (details as { mediaType?: string }).mediaType;
    const origin = urlOrigin(requestingOrigin) ?? requestingOrigin;
    return permissionAllowed(kind, permission, origin, policy, mediaType ? [mediaType] : permission === 'media' ? [] : undefined);
  });
}
