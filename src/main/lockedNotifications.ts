/**
 * Native (OS) notifications, gated on the lock (risk4).
 *
 * A system banner is drawn by the OS over whatever is on screen, so while Gum is
 * locked it would read study content (a scrape result, a series name) out past
 * the PIN pad. Every `new Notification(` in main goes through here: while locked
 * a notice is held (the newest `MAX_HELD_NOTICES`), and the unlock shows what was
 * held, silently — the moment it was raised has passed, and a burst of chimes
 * on unlock is noise. `lockWindowMatrix.test.ts` fails when a `new Notification(`
 * appears anywhere else in main.
 */
import { Notification } from 'electron';
import { appLocked, deferWhileLocked } from './lockGuard';

export interface NativeNoticeOptions {
  title: string;
  body: string;
  silent?: boolean;
}

export type NativeNoticeOutcome = 'shown' | 'held' | 'unsupported';

export const MAX_HELD_NOTICES = 5;

export interface NativeNoticeDeps {
  isSupported(): boolean;
  show(options: NativeNoticeOptions): void;
  isLocked(): boolean;
  /** Runs `fn` once the app unlocks (lockGuard's `deferWhileLocked`). */
  deferUntilUnlocked(key: string, fn: () => void): boolean;
}

const electronDeps: NativeNoticeDeps = {
  isSupported: () => Notification.isSupported(),
  show: (options) => new Notification(options).show(),
  isLocked: () => appLocked(),
  deferUntilUnlocked: (key, fn) => deferWhileLocked(key, fn),
};

let deps: NativeNoticeDeps = electronDeps;
const held: NativeNoticeOptions[] = [];

const HOLD_KEY = 'native-notifications';

function flushHeld(): void {
  // Re-locked before the deferred task ran: keep holding.
  if (deps.isLocked()) {
    deps.deferUntilUnlocked(HOLD_KEY, flushHeld);
    return;
  }
  const pending = held.splice(0, held.length);
  if (!pending.length || !deps.isSupported()) return;
  for (const notice of pending) {
    try {
      deps.show({ ...notice, silent: true });
    } catch {
      /* losing a held notice never breaks the unlock */
    }
  }
}

/** Show an OS notification now, or hold it until the unlock. Throws only what Electron throws. */
export function showNativeNotification(options: NativeNoticeOptions): NativeNoticeOutcome {
  if (deps.isLocked()) {
    held.push({ ...options });
    while (held.length > MAX_HELD_NOTICES) held.shift();
    deps.deferUntilUnlocked(HOLD_KEY, flushHeld);
    return 'held';
  }
  if (!deps.isSupported()) return 'unsupported';
  deps.show(options);
  return 'shown';
}

/** Test seam. */
export function __setNativeNoticeDepsForTests(next: NativeNoticeDeps | null): void {
  deps = next ?? electronDeps;
  held.length = 0;
}

export function heldNativeNoticeCount(): number {
  return held.length;
}
