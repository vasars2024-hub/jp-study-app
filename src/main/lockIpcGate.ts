/**
 * The lock, at the IPC layer (lock3).
 *
 * `lockGuard.ts` hides windows and refuses the paths that would show content;
 * this closes the other door. Every `ipcMain` handler registered after
 * `installIpcLockGate` is wrapped (the same way `securityHardening.ts` wraps
 * them for the sender check), so while Gum is locked NO handler runs for a
 * renderer except the short list below. A renderer that flipped its own
 * `locked` state, a hidden pop-out, or DevTools in a dev build can call any
 * `window.api` function it likes: the handler that would read or write the
 * user's data does not run.
 *
 * Refused, but not lost:
 *  - an `invoke` is HELD — its promise stays pending and the handler runs, with
 *    the same arguments, once the PIN is entered (`deferWhileLocked`). Boot-time
 *    hydration and polls in the windows behind the lock therefore resume on
 *    unlock instead of failing, and a poll cannot spin while it waits. Past
 *    `MAX_HELD_INVOKES` a call is rejected outright with `IPC_LOCKED_MESSAGE`.
 *  - a `send` (fire-and-forget) keeps only its LATEST message per window and
 *    channel, delivered on unlock; anything beyond `MAX_HELD_MESSAGES` is dropped.
 *
 * Open while locked: the lock's own channels, which enforce their own rules
 * (mutations refuse while locked, PIN and recovery checks share one backoff),
 * the window openers that already refuse while locked (so they answer "no" now
 * instead of opening something on unlock), and plumbing that carries no user
 * data out. `lockIpcGate.test.ts` walks every channel main registers and fails
 * on an entry here that no longer exists or has no reason.
 */
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { appLocked, deferWhileLocked } from './lockGuard';

/** Prefixes open while locked, with the reason. */
export const IPC_OPEN_WHILE_LOCKED_PREFIXES: Readonly<Record<string, string>> = Object.freeze({
  'lockscreen:':
    "the lock's own surface: state reads, the PIN and recovery checks (one shared, persisted backoff), and mutations that refuse while locked",
});

/** Exact channels open while locked, with the reason. */
export const IPC_OPEN_WHILE_LOCKED: Readonly<Record<string, string>> = Object.freeze({
  'diagnostics:logRendererError': "write-only into Gum's own diagnostic log; an error on the lock screen must still be recorded",
  'i18n:setLang': "main mirrors the UI language for its menus and banners; carries no study data",
  'shell:getWindowChromeMode': "the lock window's own frame style",
  'shell:getWindowBorderless': "the lock window's own frame style",
  'app:toggle': 'shows or hides the window; while locked that only ever brings the PIN pad forward (LOCK_SAFE_COMMANDS)',
  'globalCommands:run':
    'refuses while locked by itself: fire() runs only LOCK_SAFE_COMMANDS; held, a shortcut pressed while locked would run on unlock',
  'app:relaunch': 'refuses while locked by itself (refuseRestartWhileLocked); held, it would restart Gum on unlock',
  'popout:open': 'refuses while locked by itself (createPopoutWindow); held, it would open a window on unlock',
  'mini:open': 'refuses while locked by itself (createMiniWidgetWindow)',
  'mini:isOpen': 'whether a window exists; no study data',
  'mini:focusMain': 'brings the main window, i.e. its PIN pad, forward',
  'blanc:open': 'Blanc is a lock surface: it opens on its own PIN pad',
  'blanc:isOpen': 'whether a window exists; no study data',
  'deskwin:openDesktop': 'refuses while locked by itself (openSpawnedDesktop)',
  'companionHost:focusMain': 'brings the main window, i.e. its PIN pad, forward',
  // Main-owned background pipelines that the lock lets finish (Settings ->
  // Lockscreen says so): a recording or a captions capture already running when
  // the lock engaged. These flow from main's own hidden worker windows into main;
  // holding them would corrupt the stream, and nothing is shown to anyone.
  'recorder:host-chunk': "the hidden recording host's encoded chunks, written to the file main is already recording",
  'recorder:host-event': "the hidden recording host's progress and errors",
  'captions:host-reply': "the hidden live-captions capture host answering main",
  'captions:host-status': "the hidden live-captions capture host's state",
  'captions:host-utterance': "the hidden live-captions capture host's transcript lines (shown only after unlock: the captions bar is deferred)",
  'transcription:chunk-reply': "a transcription job main started before the lock, finishing in the background",
});

export function ipcChannelOpenWhileLocked(channel: string): boolean {
  if (Object.prototype.hasOwnProperty.call(IPC_OPEN_WHILE_LOCKED, channel)) return true;
  return Object.keys(IPC_OPEN_WHILE_LOCKED_PREFIXES).some((prefix) => channel.startsWith(prefix));
}

export const MAX_HELD_INVOKES = 256;
export const MAX_HELD_MESSAGES = 128;
export const IPC_LOCKED_MESSAGE = 'Gum is locked';

export function ipcLockedError(channel: string): Error {
  const err = new Error(`IPC "${channel}" refused: ${IPC_LOCKED_MESSAGE}`);
  (err as Error & { code?: string }).code = 'GUM_LOCKED';
  return err;
}

export interface IpcLockGateDeps {
  isLocked(): boolean;
  /** Run `fn` on unlock (lockGuard's `deferWhileLocked`); false when not locked. */
  deferUntilUnlocked(key: string, fn: () => void): boolean;
  log?(message: string): void;
}

export interface IpcLockGate {
  /** Every channel registered through the gate (diagnostics, the test). */
  registered(): string[];
  heldInvokes(): number;
  heldMessages(): number;
  /** Channels refused since the last unlock, in first-refusal order. */
  refusedSinceUnlock(): string[];
  /** Deliver what was held, if unlocked (normally run by the deferral). */
  flush(): void;
}

type AnyListener = (event: never, ...args: never[]) => unknown;

interface SenderLike {
  id?: number;
  isDestroyed?(): boolean;
}

function senderOf(event: IpcMainEvent | IpcMainInvokeEvent): SenderLike | null {
  try {
    return (event.sender as unknown as SenderLike) ?? null;
  } catch {
    return null;
  }
}

function senderGone(sender: SenderLike | null): boolean {
  try {
    return Boolean(sender?.isDestroyed?.());
  } catch {
    return true;
  }
}

const DEFAULT_DEPS: IpcLockGateDeps = {
  isLocked: () => appLocked(),
  deferUntilUnlocked: (key, fn) => deferWhileLocked(key, fn),
};

const FLUSH_KEY = 'ipc-lock-gate';

/**
 * Wrap `ipc` so every handler registered from now on is held while locked.
 * Idempotent (returns the first install's handle).
 */
export function installIpcLockGate(ipc: IpcMain, partial: Partial<IpcLockGateDeps> = {}): IpcLockGate {
  const marker = ipc as IpcMain & { __gumLockGate?: IpcLockGate };
  if (marker.__gumLockGate) return marker.__gumLockGate;
  const deps: IpcLockGateDeps = { ...DEFAULT_DEPS, ...partial };
  const locked = (): boolean => {
    try {
      return deps.isLocked();
    } catch {
      // The lock state cannot be read: fail closed for data, never for the lock UI.
      return true;
    }
  };
  const log = (message: string): void => {
    try {
      deps.log?.(message);
    } catch {
      /* logging never changes a decision */
    }
  };

  const channels = new Set<string>();
  interface HeldInvoke {
    channel: string;
    sender: SenderLike | null;
    run: () => unknown;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }
  const invokes: HeldInvoke[] = [];
  const messages = new Map<string, { sender: SenderLike | null; run: () => void }>();
  const refused: string[] = [];
  const refusedSet = new Set<string>();

  const noteRefused = (channel: string): void => {
    if (refusedSet.has(channel)) return;
    refusedSet.add(channel);
    refused.push(channel);
    log(`held ipc ${channel} until unlock`);
  };

  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = deps.deferUntilUnlocked(FLUSH_KEY, flush);
  };

  function flush(): void {
    scheduled = false;
    if (locked()) {
      // Re-locked before the deferred task ran: keep holding.
      if (invokes.length || messages.size) schedule();
      return;
    }
    const queued = invokes.splice(0, invokes.length);
    const sends = [...messages.values()];
    messages.clear();
    refused.length = 0;
    refusedSet.clear();
    for (const item of queued) {
      if (senderGone(item.sender)) {
        item.reject(ipcLockedError(item.channel));
        continue;
      }
      Promise.resolve()
        .then(item.run)
        .then(item.resolve, item.reject);
    }
    for (const item of sends) {
      if (senderGone(item.sender)) continue;
      try {
        item.run();
      } catch (err) {
        log(`held message failed on unlock: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (queued.length || sends.length) log(`released ${queued.length} held call(s), ${sends.length} message(s)`);
  }

  const guardInvoke = (channel: string, handler: AnyListener): AnyListener => {
    channels.add(channel);
    if (ipcChannelOpenWhileLocked(channel)) return handler;
    return ((event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const run = () => (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args);
      if (!locked()) return run();
      noteRefused(channel);
      if (invokes.length >= MAX_HELD_INVOKES) {
        log(`refused ipc ${channel}: ${MAX_HELD_INVOKES} calls already held`);
        throw ipcLockedError(channel);
      }
      return new Promise((resolve, reject) => {
        invokes.push({ channel, sender: senderOf(event), run, resolve, reject });
        schedule();
      });
    }) as AnyListener;
  };

  const wrappers = new WeakMap<AnyListener, AnyListener>();
  const guardOn = (channel: string, listener: AnyListener): AnyListener => {
    channels.add(channel);
    if (ipcChannelOpenWhileLocked(channel)) return listener;
    const existing = wrappers.get(listener);
    if (existing) return existing;
    const wrapped = ((event: IpcMainEvent, ...args: unknown[]) => {
      const run = () => (listener as (e: IpcMainEvent, ...a: unknown[]) => unknown)(event, ...args);
      if (!locked()) return run();
      noteRefused(channel);
      const sender = senderOf(event);
      const key = `${sender?.id ?? '?'}|${channel}`;
      if (!messages.has(key) && messages.size >= MAX_HELD_MESSAGES) return undefined;
      // Latest wins: a stream of state snapshots collapses to the one that matters.
      messages.delete(key);
      messages.set(key, { sender, run });
      schedule();
      return undefined;
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

  const gate: IpcLockGate = {
    registered: () => [...channels].sort(),
    heldInvokes: () => invokes.length,
    heldMessages: () => messages.size,
    refusedSinceUnlock: () => [...refused],
    flush,
  };
  marker.__gumLockGate = gate;
  return gate;
}
