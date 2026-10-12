/**
 * The lock's public shape (lock3), shared by main (`main/lockscreenPin.ts`, the
 * only writer), the preload bridge and the renderer's Settings / lock screen.
 * Nothing secret lives here: never the recovery hash, never a PIN.
 */

export interface AutoLockOptions {
  /** Lock after this many minutes without keyboard or mouse input anywhere on the PC. 0 = never. */
  idleMinutes: number;
  /** Lock when the PC goes to sleep or hibernates. */
  onSleep: boolean;
  /** Lock when Windows itself locks (Win+L, the screen saver's lock). */
  onScreenLock: boolean;
}

export const AUTO_LOCK_IDLE_CHOICES: readonly number[] = [0, 1, 5, 10, 15, 30, 60];

export const DEFAULT_AUTO_LOCK: Readonly<AutoLockOptions> = Object.freeze({ idleMinutes: 0, onSleep: false, onScreenLock: false });

export function normalizeAutoLock(v: unknown): AutoLockOptions {
  if (!v || typeof v !== 'object') return { ...DEFAULT_AUTO_LOCK };
  const r = v as Partial<AutoLockOptions>;
  const idle = typeof r.idleMinutes === 'number' && AUTO_LOCK_IDLE_CHOICES.includes(r.idleMinutes) ? r.idleMinutes : 0;
  return { idleMinutes: idle, onSleep: r.onSleep === true, onScreenLock: r.onScreenLock === true };
}

/** What every window may know about the lock. */
export interface LockStatus {
  locked: boolean;
  /** Lock at launch. */
  enabled: boolean;
  hasPin: boolean;
  hasRecovery: boolean;
  autoLock: AutoLockOptions;
  /** The renderer mirror's copy (it seeds a profile whose lock file was lost). */
  pinHash: string;
}

export type LockMutationError = 'locked' | 'invalid' | 'wrong-pin' | 'no-pin' | 'no-recovery';

export interface LockMutationResult {
  ok: boolean;
  error?: LockMutationError;
  /** The shared attempt counter is paused for this long. */
  retryAfterMs?: number;
  /** A new recovery code, shown to the person exactly once. */
  recoveryCode?: string;
  status: LockStatus;
}
