/**
 * Main arms the lock by itself (lock3): after a stretch with no keyboard or
 * mouse input anywhere on the PC, when the PC goes to sleep, and when Windows
 * locks. Each is an opt-in in Settings -> Lockscreen, stored in main's lock
 * record (`lockscreenPin.ts` `autoLock`), so a renderer cannot switch it off
 * while the app is locked. Nothing here can unlock.
 *
 * Idle is the SYSTEM idle time (`powerMonitor.getSystemIdleTime`), not Gum's
 * own: leaving the PC is what the lock is for. Watching a video without touching
 * anything counts as idle too, which Settings says next to the choice.
 *
 * No `electron` import: the power monitor is passed in, so the policy runs
 * under plain vitest. main.ts hands it Electron's `powerMonitor`.
 */
import type { AutoLockOptions } from '../shared/lockStatus';

export type AutoLockReason = 'idle' | 'sleep' | 'screen-lock';

export interface PowerMonitorLike {
  on(event: 'suspend' | 'lock-screen', listener: () => void): unknown;
  getSystemIdleTime(): number;
}

export interface LockAutoArmDeps {
  power: PowerMonitorLike;
  options(): AutoLockOptions;
  /** True when a PIN exists (without one there is nothing to arm). */
  canLock(): boolean;
  isLocked(): boolean;
  /** Arm the lock; returns whether it is locked now. */
  lock(reason: AutoLockReason): boolean;
  setInterval?(fn: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
  log?(message: string): void;
}

export const IDLE_POLL_MS = 15_000;

export interface LockAutoArm {
  /** One idle check now (the poll's body; tests call it directly). */
  checkIdle(): boolean;
  stop(): void;
}

export function installLockAutoArm(deps: LockAutoArmDeps): LockAutoArm {
  const setI = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearI = deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const arm = (reason: AutoLockReason): boolean => {
    try {
      if (deps.isLocked() || !deps.canLock()) return false;
      const did = deps.lock(reason);
      if (did) deps.log?.(`auto-lock: ${reason}`);
      return did;
    } catch {
      return false;
    }
  };
  const safeOptions = (): AutoLockOptions | null => {
    try {
      return deps.options();
    } catch {
      return null;
    }
  };
  deps.power.on('suspend', () => {
    if (safeOptions()?.onSleep) arm('sleep');
  });
  deps.power.on('lock-screen', () => {
    if (safeOptions()?.onScreenLock) arm('screen-lock');
  });
  const checkIdle = (): boolean => {
    const minutes = safeOptions()?.idleMinutes ?? 0;
    if (minutes <= 0) return false;
    let idleSeconds = 0;
    try {
      idleSeconds = deps.power.getSystemIdleTime();
    } catch {
      return false;
    }
    if (idleSeconds < minutes * 60) return false;
    return arm('idle');
  };
  const timer = setI(checkIdle, IDLE_POLL_MS);
  // A poll must never keep the process alive on its own.
  (timer as { unref?: () => void } | undefined)?.unref?.();
  return {
    checkIdle,
    stop: () => clearI(timer),
  };
}
