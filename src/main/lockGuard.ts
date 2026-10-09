/**
 * The lock as a main-process gate (lock2).
 *
 * `lockscreenPin.ts` decides WHETHER the app is locked; this module enforces it
 * on everything main owns, so no renderer has to be trusted to cover itself:
 *
 *  - Every BrowserWindow is adopted when it is created (`app.on('browser-window-created')`
 *    in main.ts). While locked, a window that is not a lock surface and is shown
 *    is hidden again at once, and remembered so the unlock can put it back. The
 *    lock surfaces are the PIN widget (`lock`) and the two windows whose renderer
 *    draws its own PIN pad over its content — the Study OS main window and Blanc
 *    (`gated`); those are told `lockscreen:locked` whenever they appear locked.
 *  - Engaging the lock hides every visible content window (pop-outs, secondary
 *    desktops, the Lens, captions bar, companion surfaces, VN reader, detached
 *    blocks...) and the unlock restores exactly those.
 *  - Paths that would CREATE a content window ask `refuseWhileLocked` /
 *    `deferWhileLocked` first; a deferred one (secondary desktops, the companion
 *    host) runs on unlock. `lockWindowMatrix.test.ts` enumerates every place main
 *    constructs a BrowserWindow and fails when one is added without a policy.
 *  - Global commands (`globalCommands.ts` `fire`) and the extension server's
 *    content routes refuse while locked; a refusal raises a toast on the lock
 *    screen (`lockscreen:blocked`), throttled per kind.
 *  - In a packaged build DevTools close as soon as they open, on every
 *    webContents (windows and `<webview>` guests alike).
 *
 * It is a STUDY lock, not a security boundary: the app ships without asar, so
 * anyone with write access to the install folder can edit main.js, and Chromium
 * honours `--remote-debugging-port` before any of this runs. Settings -> Lockscreen
 * says so in-app (`lock2.note.*`).
 *
 * No `electron` import: the window and webContents shapes are structural, so the
 * guard runs under plain vitest with stubs, and modules that consult it
 * (extension server, global commands, window factories) stay importable in
 * their own tests without a configured guard — unconfigured means unlocked.
 */

export type LockWindowRole = 'lock' | 'gated' | 'content';

export interface GuardWebContents {
  send(channel: string, ...args: unknown[]): void;
  on(event: 'devtools-opened', listener: () => void): unknown;
  isDevToolsOpened(): boolean;
  closeDevTools(): void;
  isDestroyed(): boolean;
}

export interface GuardWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  showInactive(): void;
  on(event: 'show', listener: () => void): unknown;
  webContents: GuardWebContents;
}

/** Where a refusal came from; the action string carries it as `<kind>:<detail>`. */
export type LockBlockKind = 'command' | 'tray' | 'extension' | 'window';

export interface LockBlockNotice {
  kind: LockBlockKind;
  action: string;
}

/**
 * Commands that only ever bring the lock UI forward (main.ts routes them through
 * `showLockUiIfLocked`), so they stay live while locked. Everything else a chord,
 * the tray or the radial wheel can run is refused.
 */
export const LOCK_SAFE_COMMANDS: ReadonlySet<string> = new Set(['app.toggle', 'app.focus', 'app.restart']);

/**
 * Extension routes that reveal nothing: liveness, the pairing pull (it needs the
 * token or the pairing window, which cannot be opened while locked) and the pure
 * URL classifier. Every other route answers `423 { code: 'locked' }`.
 */
export const EXTENSION_ROUTES_OPEN_WHILE_LOCKED: ReadonlySet<string> = new Set([
  '/health',
  '/v1/health',
  '/v1/extension-settings',
  '/v1/page-kind',
]);

export function extensionRouteAllowedWhileLocked(pathname: string): boolean {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return EXTENSION_ROUTES_OPEN_WHILE_LOCKED.has(p);
}

/** The body every refused extension route answers with (HTTP 423 Locked). */
export const EXTENSION_LOCKED_BODY = Object.freeze({ ok: false, code: 'locked', error: 'Gum is locked' });
export const EXTENSION_LOCKED_STATUS = 423;

/** Same kind within this window: one toast. Extension pages poll, so theirs is long. */
export const BLOCK_NOTICE_THROTTLE_MS: Readonly<Record<LockBlockKind, number>> = {
  command: 1_500,
  tray: 1_500,
  window: 1_500,
  extension: 60_000,
};

export function blockKindOf(action: string): LockBlockKind {
  const prefix = action.split(':', 1)[0];
  return prefix === 'command' || prefix === 'tray' || prefix === 'extension' ? prefix : 'window';
}

export interface LockGuardDeps<W extends GuardWindow = GuardWindow> {
  isLocked(): boolean;
  roleOf(win: W): LockWindowRole;
  windows(): readonly W[];
  /**
   * Surface a refusal. Not called for `window:` refusals — those are automatic
   * (a layout restore, a scheduled job) and would only be noise on the lock screen.
   */
  notifyBlocked(notice: LockBlockNotice): void;
  /** False in a packaged build: DevTools close the moment they open. */
  devToolsAllowed: boolean;
  log?(message: string): void;
  now?(): number;
}

export interface LockGuard<W extends GuardWindow = GuardWindow> {
  isLocked(): boolean;
  /** Install the show gate on a new window (`browser-window-created`). */
  adopt(win: W): void;
  /** Install the DevTools gate on any webContents (`web-contents-created`). */
  adoptWebContents(wc: GuardWebContents): void;
  /** The lock was just armed: hide content, flip gated windows to their PIN pad. */
  engage(): void;
  /** The lock was just lifted: restore what was hidden, run what was deferred. */
  release(): void;
  /** True (and noted) when `action` must not happen because the app is locked. */
  refuse(action: string): boolean;
  /** True when locked: `fn` runs on unlock instead (latest per key wins). */
  defer(key: string, fn: () => void): boolean;
  /** For tests and diagnostics. */
  hiddenCount(): number;
  deferredKeys(): string[];
}

export function createLockGuard<W extends GuardWindow>(deps: LockGuardDeps<W>): LockGuard<W> {
  const hidden = new Set<W>();
  const deferred = new Map<string, () => void>();
  const lastNotice = new Map<LockBlockKind, number>();
  const now = deps.now ?? Date.now;
  const locked = (): boolean => {
    try {
      return deps.isLocked();
    } catch {
      return false;
    }
  };
  const log = (message: string) => {
    try {
      deps.log?.(message);
    } catch {
      /* logging never breaks the gate */
    }
  };

  const closeDevTools = (wc: GuardWebContents) => {
    if (deps.devToolsAllowed) return;
    try {
      if (!wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools();
    } catch {
      /* a webContents mid-teardown */
    }
  };

  const tellLocked = (win: W) => {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('lockscreen:locked');
    } catch {
      /* not loaded yet: it asks `lockscreen:isLocked` itself when it mounts */
    }
  };

  /** Apply the lock to one window. Returns true when it was hidden. */
  const gateWindow = (win: W): boolean => {
    if (win.isDestroyed()) return false;
    const role = deps.roleOf(win);
    if (role === 'lock') return false;
    if (role === 'gated') {
      tellLocked(win);
      return false;
    }
    if (!win.isVisible()) return false;
    try {
      win.hide();
    } catch {
      return false;
    }
    hidden.add(win);
    return true;
  };

  return {
    isLocked: locked,
    adopt(win) {
      win.on('show', () => {
        if (!locked()) return;
        if (gateWindow(win)) log('hid a window shown while locked');
      });
    },
    adoptWebContents(wc) {
      if (deps.devToolsAllowed) return;
      wc.on('devtools-opened', () => closeDevTools(wc));
    },
    engage() {
      let count = 0;
      for (const win of deps.windows()) {
        if (gateWindow(win)) count += 1;
        if (!win.isDestroyed()) closeDevTools(win.webContents);
      }
      log(`engaged; hid ${count} window(s)`);
    },
    release() {
      const toShow = [...hidden];
      hidden.clear();
      for (const win of toShow) {
        try {
          if (!win.isDestroyed()) win.showInactive();
        } catch {
          /* gone meanwhile */
        }
      }
      const queued = [...deferred.values()];
      deferred.clear();
      for (const fn of queued) {
        try {
          fn();
        } catch (err) {
          log(`deferred task failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      log(`released; restored ${toShow.length} window(s), ran ${queued.length} deferred task(s)`);
    },
    refuse(action) {
      if (!locked()) return false;
      const kind = blockKindOf(action);
      log(`refused ${action}`);
      if (kind !== 'window') {
        const at = now();
        const last = lastNotice.get(kind) ?? -Infinity;
        if (at - last >= BLOCK_NOTICE_THROTTLE_MS[kind]) {
          lastNotice.set(kind, at);
          try {
            deps.notifyBlocked({ kind, action });
          } catch {
            /* the refusal stands even if the toast cannot be shown */
          }
        }
      }
      return true;
    },
    defer(key, fn) {
      if (!locked()) return false;
      deferred.set(key, fn);
      log(`deferred ${key} until unlock`);
      return true;
    },
    hiddenCount: () => hidden.size,
    deferredKeys: () => [...deferred.keys()],
  };
}

// ---- The process-wide guard ------------------------------------------------
// main.ts installs one; feature modules consult it through these helpers.

let active: LockGuard<GuardWindow> | null = null;

export function installLockGuard(guard: LockGuard<GuardWindow> | null): void {
  active = guard;
}

/** Is the app locked right now? False until main.ts installs the guard. */
export function appLocked(): boolean {
  return active ? active.isLocked() : false;
}

/**
 * Call first on any path that would show content: `if (refuseWhileLocked('window:lens')) return;`.
 * Action strings are `<kind>:<detail>` — `command:`, `tray:`, `extension:` raise a
 * toast on the lock screen, `window:` is refused quietly.
 */
export function refuseWhileLocked(action: string): boolean {
  return active ? active.refuse(action) : false;
}

/** Like `refuseWhileLocked`, but `fn` runs once the app unlocks. */
export function deferWhileLocked(key: string, fn: () => void): boolean {
  return active ? active.defer(key, fn) : false;
}
