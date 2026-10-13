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
 *  - a `send` (fire-and-forget) on a snapshot channel keeps only its LATEST
 *    message per window and channel, delivered on unlock. A reply or an
 *    acknowledgement (`*-reply`, `*-ack`: one per request id) is not a snapshot:
 *    every one is kept, in order (`ipcSendIsSnapshot`). Anything beyond
 *    `MAX_HELD_MESSAGES` held sends is dropped.
 *  - lock4: on unlock both drain from ONE queue in arrival order, at most
 *    `HELD_DRAIN_CONCURRENCY` invokes at a time (a call still running after
 *    `HELD_SLOT_RELEASE_MS` frees its slot), and a call made while the queue is
 *    still draining takes its place at the back instead of overtaking it.
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

/**
 * Whether a newer `send` on `channel` makes an older held one from the same window
 * worthless ("latest wins"). True for state snapshots (`player:publish`,
 * `companionHost:pushState`, `lens:setInteractive`, …). False for a reply or an
 * acknowledgement: each `*-reply` answers ONE request id and each `*-ack` settles
 * one pending operation, so collapsing two would leave a caller waiting forever.
 */
export function ipcSendIsSnapshot(channel: string): boolean {
  return !/[-:](?:reply|ack)$/i.test(channel);
}

export const MAX_HELD_INVOKES = 256;
export const MAX_HELD_MESSAGES = 128;
/** lock4: held invokes running at once while the queue drains after an unlock. */
export const HELD_DRAIN_CONCURRENCY = 4;
/** lock4: a held invoke still running after this long stops counting against the limit. */
export const HELD_SLOT_RELEASE_MS = 1_000;
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
  /**
   * lock4: ONE queue, in arrival order, for both kinds. On unlock it drains in
   * that order: a held `send` is delivered when its turn comes, and at most
   * `HELD_DRAIN_CONCURRENCY` held invokes run at once (the next starts when one
   * settles), so 256 hydration calls from the windows behind the lock no longer
   * all hit the database in the same tick. A newer `send` from the same window
   * on the same snapshot channel supersedes the older one, which leaves the
   * queue; a reply or ack is never superseded (`key` null).
   */
  type Held =
    | {
        kind: 'invoke';
        channel: string;
        sender: SenderLike | null;
        run: () => unknown;
        resolve: (value: unknown) => void;
        reject: (reason: unknown) => void;
      }
    | { kind: 'send'; key: string | null; sender: SenderLike | null; run: () => void };
  const queue: Held[] = [];
  /** The latest held snapshot `send` per window and channel (each one is also in `queue`). */
  const latestSend = new Map<string, Held>();
  /** Held sends of both kinds (the cap counts them all). */
  let heldSendCount = 0;
  let heldInvokeCount = 0;
  let running = 0;
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

  /** Run what is queued, in order, while unlocked and while a slot is free. */
  function pump(): void {
    for (let head = queue[0]; head; head = queue[0]) {
      if (locked()) {
        // Re-locked mid-drain: the rest waits for the next unlock.
        schedule();
        return;
      }
      if (head.kind === 'invoke' && running >= HELD_DRAIN_CONCURRENCY) return;
      queue.shift();
      if (head.kind === 'send') {
        heldSendCount -= 1;
        if (head.key !== null && latestSend.get(head.key) === head) latestSend.delete(head.key);
        if (senderGone(head.sender)) continue;
        try {
          head.run();
        } catch (err) {
          log(`held message failed on unlock: ${err instanceof Error ? err.message : String(err)}`);
        }
        continue;
      }
      heldInvokeCount -= 1;
      // A const, so the narrowing to an invoke holds inside the callbacks below.
      const call = head;
      if (senderGone(call.sender)) {
        call.reject(ipcLockedError(call.channel));
        continue;
      }
      running += 1;
      // A call that is still running after HELD_SLOT_RELEASE_MS gives its slot
      // up (it keeps running): a long-lived handler cannot stall the line.
      let slotHeld = true;
      const releaseSlot = (): void => {
        if (!slotHeld) return;
        slotHeld = false;
        running -= 1;
      };
      const slotTimer = setTimeout(() => {
        releaseSlot();
        pump();
      }, HELD_SLOT_RELEASE_MS);
      (slotTimer as { unref?: () => void }).unref?.();
      let out: unknown;
      try {
        out = call.run();
      } catch (err) {
        out = Promise.reject(err);
      }
      Promise.resolve(out).then(
        (value) => {
          clearTimeout(slotTimer);
          releaseSlot();
          call.resolve(value);
          pump();
        },
        (reason) => {
          clearTimeout(slotTimer);
          releaseSlot();
          call.reject(reason);
          pump();
        },
      );
    }
  }

  function flush(): void {
    scheduled = false;
    if (locked()) {
      // Re-locked before the deferred task ran: keep holding.
      if (queue.length) schedule();
      return;
    }
    refused.length = 0;
    refusedSet.clear();
    if (queue.length) log(`releasing ${heldInvokeCount} held call(s), ${heldSendCount} message(s) in order`);
    pump();
  }

  const guardInvoke = (channel: string, handler: AnyListener): AnyListener => {
    channels.add(channel);
    if (ipcChannelOpenWhileLocked(channel)) return handler;
    return ((event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const run = () => (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args);
      const isLocked = locked();
      // Unlocked with nothing waiting: straight through, synchronously.
      if (!isLocked && !queue.length) return run();
      if (isLocked) {
        noteRefused(channel);
        if (heldInvokeCount >= MAX_HELD_INVOKES) {
          log(`refused ipc ${channel}: ${MAX_HELD_INVOKES} calls already held`);
          throw ipcLockedError(channel);
        }
      }
      // Locked, or unlocked while the held calls still drain: take a place in
      // line so a call made after the unlock never overtakes one made before.
      return new Promise((resolve, reject) => {
        queue.push({ kind: 'invoke', channel, sender: senderOf(event), run, resolve, reject });
        heldInvokeCount += 1;
        if (isLocked) schedule();
        else pump();
      });
    }) as AnyListener;
  };

  const wrappers = new WeakMap<AnyListener, AnyListener>();
  const guardOn = (channel: string, listener: AnyListener): AnyListener => {
    channels.add(channel);
    if (ipcChannelOpenWhileLocked(channel)) return listener;
    const existing = wrappers.get(listener);
    if (existing) return existing;
    const snapshot = ipcSendIsSnapshot(channel);
    const wrapped = ((event: IpcMainEvent, ...args: unknown[]) => {
      const run = () => (listener as (e: IpcMainEvent, ...a: unknown[]) => unknown)(event, ...args);
      const isLocked = locked();
      if (!isLocked && !queue.length) return run();
      if (isLocked) noteRefused(channel);
      const sender = senderOf(event);
      const key = snapshot ? `${sender?.id ?? '?'}|${channel}` : null;
      const older = key !== null ? latestSend.get(key) : undefined;
      if (!older && isLocked && heldSendCount >= MAX_HELD_MESSAGES) return undefined;
      // Latest wins, for snapshots only: a stream of state snapshots collapses to
      // the one that matters, and the superseded one leaves the line (no
      // duplicate delivery). Replies and acks each keep their own place.
      if (older) {
        const at = queue.indexOf(older);
        if (at >= 0) {
          queue.splice(at, 1);
          heldSendCount -= 1;
        }
      }
      const entry: Held = { kind: 'send', key, sender, run };
      if (key !== null) latestSend.set(key, entry);
      heldSendCount += 1;
      queue.push(entry);
      if (isLocked) schedule();
      else pump();
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
    heldInvokes: () => heldInvokeCount,
    heldMessages: () => heldSendCount,
    refusedSinceUnlock: () => [...refused],
    flush,
  };
  marker.__gumLockGate = gate;
  return gate;
}
