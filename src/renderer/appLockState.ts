/**
 * Main's lock, as every renderer sees it (risk4).
 *
 * Main owns the lock (`main/lockscreenPin.ts`) and tells every window about each
 * transition on `lockscreen:state` (`main/lockGuard.ts`). This mirror lets code
 * that makes noise or raises OS banners — the sound engine, calendar reminders —
 * hold back while locked without each one wiring IPC. It never draws a PIN pad;
 * App.tsx / Blanc keep doing that from `onLockscreenLocked`.
 *
 * Unknown until main answers, and unknown counts as unlocked: a renderer without
 * the bridge (tests, the dev harness) behaves as before.
 */

type Listener = (locked: boolean) => void;

let locked = false;
let installed = false;
const listeners = new Set<Listener>();
const whenUnlocked = new Map<string, () => void>();

function setLocked(next: boolean): void {
  if (next === locked) return;
  locked = next;
  for (const fn of [...listeners]) {
    try {
      fn(next);
    } catch {
      /* one listener never stops the others */
    }
  }
  if (!next) {
    const queued = [...whenUnlocked.values()];
    whenUnlocked.clear();
    for (const fn of queued) {
      try {
        fn();
      } catch {
        /* a held task's failure never blocks the rest */
      }
    }
  }
}

interface LockBridge {
  lockscreenIsLocked?(): Promise<boolean>;
  onLockscreenState?(cb: (locked: boolean) => void): () => void;
  onLockscreenLocked?(cb: () => void): () => void;
  onLockscreenUnlocked?(cb: () => void): () => void;
}

/** Wire the mirror to main once per window. Safe to call repeatedly. */
export function installAppLockState(bridge?: LockBridge): void {
  if (installed) return;
  const api: LockBridge | undefined =
    bridge ?? (typeof window !== 'undefined' ? (window as unknown as { api?: LockBridge }).api : undefined);
  if (!api) return;
  installed = true;
  try {
    api.onLockscreenState?.((next) => setLocked(next));
    api.onLockscreenLocked?.(() => setLocked(true));
    api.onLockscreenUnlocked?.(() => setLocked(false));
    void api.lockscreenIsLocked?.()
      .then((value) => {
        if (value === true) setLocked(true);
      })
      .catch(() => undefined);
  } catch {
    /* no bridge: stays unlocked */
  }
}

export function isAppLockedInRenderer(): boolean {
  installAppLockState();
  return locked;
}

export function onAppLockChanged(fn: Listener): () => void {
  installAppLockState();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Run `fn` now when unlocked, else once the unlock arrives (latest per key wins).
 * Returns true when it was held.
 */
export function runWhenUnlocked(key: string, fn: () => void): boolean {
  installAppLockState();
  if (!locked) {
    fn();
    return false;
  }
  whenUnlocked.set(key, fn);
  return true;
}

/** Test seam: forget the bridge and the state. */
export function __resetAppLockStateForTests(next = false): void {
  installed = false;
  listeners.clear();
  whenUnlocked.clear();
  locked = next;
}

/** Test seam: drive a transition as main would. */
export function __setAppLockedForTests(next: boolean): void {
  setLocked(next);
}
