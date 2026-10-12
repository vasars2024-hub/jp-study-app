/**
 * Lockscreen — optional PIN gate at app launch.
 * Local-only UI lock. The PIN is stored as a salted scrypt hash computed in main
 * (older profiles hold a reversible encoding, upgraded on the next unlock), and
 * main backs off after repeated wrong PINs.
 *
 * lock3: main is the only writer of the PIN and the launch flag. `enabled` and
 * `pinHash` here are a MIRROR of main's record (`refreshLockscreenMirror`), kept
 * so the first frame knows whether to draw the lock and so a profile whose lock
 * file was lost is re-adopted at the backoff ceiling. Changing the PIN, clearing
 * it or turning the launch lock off goes through main with the current PIN.
 * The study options (`study`, `answerToUnlock`) and the tint are this window's
 * own presentation choices and never weaken the PIN.
 */
import type { AutoLockOptions, LockMutationResult, LockStatus } from '../shared/lockStatus';
import { t } from './i18n';

export interface LockscreenSettings {
  /** When true, show the lockscreen on cold launch of the main window. */
  enabled: boolean;
  /** Mirror of main's PIN hash (empty = not set). */
  pinHash: string;
  /**
   * Soft accent for the lock panel. `auto` derives it from the live `--accent`
   * (written inline on <html> by osPersonalization) and the active theme's `--bg`,
   * so it re-tints on an accent or theme change with no code path at all — the
   * four fixed tints stay available for anyone who wants to pin one.
   */
  tint: LockscreenTint;
  /**
   * What the lock screen shows about study. `count`: how many cards are due (a
   * number, nothing from the cards). `card`: one card's front from the deck,
   * which anyone at the screen can read. `off`: nothing.
   */
  study: LockscreenStudyMode;
  /** Recall one card (multiple choice) before the PIN pad. Without a PIN, the card alone opens Gum. */
  answerToUnlock: boolean;
}

export const LOCKSCREEN_TINTS = ['auto', 'neutral', 'ember', 'slate', 'moss'] as const;

export type LockscreenTint = (typeof LOCKSCREEN_TINTS)[number];

export const LOCKSCREEN_STUDY_MODES = ['off', 'count', 'card'] as const;

export type LockscreenStudyMode = (typeof LOCKSCREEN_STUDY_MODES)[number];

const KEY = 'jp-study-lockscreen-v1';
const EVENT = 'jp-lockscreen-changed';
const SESSION_UNLOCKED = 'jp-lockscreen-unlocked';
const PENDING_AERO_BOOT_KEY = 'jp-aero-pending-boot';
const PENDING_WIRED_BOOT_KEY = 'jp-wired-pending-boot';

export const AERO_ENTRY_LOCKED_EVENT = 'shell:aeroEntryLocked';

const DEFAULTS: LockscreenSettings = {
  enabled: false,
  pinHash: '',
  tint: 'auto',
  study: 'count',
  answerToUnlock: false,
};

/** The pre-scrypt reversible encoding, still accepted once (main upgrades it). */
export function decodePin(hash: string): string | null {
  if (!hash) return null;
  try {
    const raw = atob(hash);
    if (!raw.startsWith('jp1:')) return null;
    const digits = raw.slice(4).split('').reverse().join('');
    return /^\d{4}$/.test(digits) ? digits : null;
  } catch {
    return null;
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function loadLockscreen(): LockscreenSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<LockscreenSettings>;
    return {
      enabled: !!p.enabled,
      pinHash: typeof p.pinHash === 'string' ? p.pinHash : '',
      tint: LOCKSCREEN_TINTS.includes(p.tint as LockscreenTint)
        ? (p.tint as LockscreenTint)
        : DEFAULTS.tint,
      study: LOCKSCREEN_STUDY_MODES.includes(p.study as LockscreenStudyMode)
        ? (p.study as LockscreenStudyMode)
        : DEFAULTS.study,
      answerToUnlock: p.answerToUnlock === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeLockscreen(next: LockscreenSettings): LockscreenSettings {
  // Enabling without a PIN is not allowed — keep previous enabled state.
  if (next.enabled && !next.pinHash) {
    next.enabled = false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * The window's own lock-screen choices: tint and the study options. The PIN and
 * the launch flag are main's (`setLockscreenPin`, `setLockscreenEnabled`); a
 * patch naming them here is ignored.
 */
export function saveLockscreen(
  patch: Partial<Pick<LockscreenSettings, 'tint' | 'study' | 'answerToUnlock'>>,
): LockscreenSettings {
  const cur = loadLockscreen();
  const next: LockscreenSettings = {
    ...cur,
    ...(patch.tint !== undefined ? { tint: patch.tint } : {}),
    ...(patch.study !== undefined ? { study: patch.study } : {}),
    ...(patch.answerToUnlock !== undefined ? { answerToUnlock: patch.answerToUnlock } : {}),
  };
  return writeLockscreen(next);
}

/** Copy main's truth into the mirror (after every change, and at boot). */
function applyMainStatus(status: LockStatus | null | undefined): LockscreenSettings {
  if (!status) return loadLockscreen();
  const cur = loadLockscreen();
  return writeLockscreen({ ...cur, enabled: status.enabled, pinHash: status.pinHash });
}

/** Ask main for the lock's state and refresh the mirror. Null without a bridge. */
export async function refreshLockscreenMirror(): Promise<LockStatus | null> {
  try {
    const status = (await window.api?.lockscreenStatus?.()) ?? null;
    if (status) applyMainStatus(status);
    return status;
  } catch {
    return null;
  }
}

/**
 * Main owns the lock and keeps its own copy of the PIN hash; this one is the
 * UI's mirror. Main adopts it once (profiles from before main kept it) and
 * never afterwards.
 */
export function syncLockscreenToMain(s: LockscreenSettings = loadLockscreen(), rendererLocked = false): void {
  try {
    const sync = typeof window !== 'undefined' ? window.api?.lockscreenSyncConfig : undefined;
    void sync?.({ enabled: s.enabled, pinHash: s.pinHash }, rendererLocked).catch(() => undefined);
  } catch {
    /* no bridge (tests, a harness) */
  }
}

/** A salted scrypt hash from main (`main/lockscreenPin.ts`). */
export function isHashedPin(stored: string): boolean {
  return stored.startsWith('scrypt1:');
}

/** A change main made (or refused), with the mirror already refreshed. */
export interface LockscreenChange {
  ok: boolean;
  error?: LockMutationResult['error'] | 'unavailable';
  retryAfterMs?: number;
  /** Shown once: main keeps only its hash. */
  recoveryCode?: string;
  settings: LockscreenSettings;
}

async function mutate(call: (() => Promise<LockMutationResult>) | null): Promise<LockscreenChange> {
  if (!call) return { ok: false, error: 'unavailable', settings: loadLockscreen() };
  try {
    const res = await call();
    const settings = applyMainStatus(res?.status);
    return {
      ok: res?.ok === true,
      ...(res?.error ? { error: res.error } : {}),
      ...(res?.retryAfterMs ? { retryAfterMs: res.retryAfterMs } : {}),
      ...(res?.recoveryCode ? { recoveryCode: res.recoveryCode } : {}),
      settings,
    };
  } catch {
    return { ok: false, error: 'unavailable', settings: loadLockscreen() };
  }
}

const bridge = () => (typeof window !== 'undefined' ? window.api : undefined);

/**
 * Set or change the PIN in main (scrypt there). A PIN already set must be
 * given as `current`; the first PIN comes back with a recovery code.
 */
export function setLockscreenPin(current: string | null, next: string): Promise<LockscreenChange> {
  if (!isValidPin(next)) return Promise.resolve({ ok: false, error: 'invalid', settings: loadLockscreen() });
  const api = bridge();
  const call = api?.lockscreenSetPin;
  return mutate(call ? () => call(current, next) : null);
}

/** Remove the PIN (needs the current one); the launch lock and recovery code go with it. */
export function clearLockscreenPin(current: string): Promise<LockscreenChange> {
  const api = bridge();
  const call = api?.lockscreenClearPin;
  return mutate(call ? () => call(current) : null);
}

/** Lock at launch. Turning it off needs the current PIN. */
export function setLockscreenEnabled(on: boolean, current?: string): Promise<LockscreenChange> {
  const api = bridge();
  const call = api?.lockscreenSetEnabled;
  return mutate(call ? () => call(on, current) : null);
}

export function newLockscreenRecoveryCode(current: string): Promise<LockscreenChange> {
  const api = bridge();
  const call = api?.lockscreenNewRecoveryCode;
  return mutate(call ? () => call(current) : null);
}

/** A forgotten PIN: the recovery code removes it (and unlocks main). */
export function recoverLockscreen(code: string): Promise<LockscreenChange> {
  const api = bridge();
  const call = api?.lockscreenRecover;
  return mutate(call ? () => call(code) : null);
}

export function setLockscreenAutoLock(options: Partial<AutoLockOptions>): Promise<LockscreenChange> {
  const api = bridge();
  const call = api?.lockscreenSetAutoLock;
  return mutate(call ? () => call(options) : null);
}

export interface LockscreenVerifyResult {
  ok: boolean;
  /** Too many wrong PINs: entry is locked for this long. */
  retryAfterMs?: number;
}

/**
 * Check a PIN. Main does the comparison (constant-time, with backoff after
 * repeated misses) and returns an upgraded hash when the stored value was the
 * old reversible encoding, which replaces it here.
 */
export async function verifyLockscreenPinDetailed(pin: string): Promise<LockscreenVerifyResult> {
  const stored = loadLockscreen().pinHash;
  if (!isValidPin(pin)) return { ok: false };
  const verify = typeof window !== 'undefined' ? window.api?.lockscreenVerifyPin : undefined;
  // Main checks against its own record (and lifts its lock on success);
  // `stored` only seeds a profile main has never seen.
  if (verify) {
    try {
      const res = await verify(pin, stored);
      if (res.ok && res.upgradedHash && isHashedPin(res.upgradedHash)) {
        writeLockscreen({ ...loadLockscreen(), pinHash: res.upgradedHash });
      }
      return { ok: res.ok === true, ...(res.retryAfterMs ? { retryAfterMs: res.retryAfterMs } : {}) };
    } catch {
      /* bridge unavailable: fall through to the legacy check */
    }
  }
  if (!stored || isHashedPin(stored)) return { ok: false };
  const legacy = decodePin(stored);
  return { ok: legacy !== null && legacy === pin };
}

export async function verifyLockscreenPin(pin: string): Promise<boolean> {
  return (await verifyLockscreenPinDetailed(pin)).ok;
}

/**
 * True when the lockscreen should block the main shell right now: the PIN lock
 * at launch, or — with no PIN at all — the "answer a card" study gate, which
 * is a study habit and not a lock (main is never locked behind it).
 */
export function shouldShowLockscreen(): boolean {
  const s = loadLockscreen();
  const pinGate = s.enabled && !!s.pinHash;
  const studyGate = !s.pinHash && s.answerToUnlock;
  if (!pinGate && !studyGate) return false;
  try {
    if (sessionStorage.getItem(SESSION_UNLOCKED) === '1') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function markLockscreenUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_UNLOCKED, '1');
  } catch {
    /* ignore */
  }
}

export function clearLockscreenSession(): void {
  try {
    sessionStorage.removeItem(SESSION_UNLOCKED);
  } catch {
    /* ignore */
  }
}

/**
 * "Lock Gum now" (palette, Shortcuts, Settings). Main arms the lock and every
 * window follows; without a PIN there is nothing to lock, which is said.
 */
export async function lockGumNow(): Promise<boolean> {
  let locked = false;
  try {
    locked = (await window.api?.lockscreenLock?.())?.locked === true;
  } catch {
    locked = false;
  }
  if (!locked) {
    try {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('lock3.lockNow.needPin'), kind: 'warn' } }));
    } catch {
      /* no window */
    }
  }
  return locked;
}

/** Re-arm main's lock too, so it guards every way back into the app (tray, hotkeys, file open). */
function armMainLock(): void {
  try {
    const lock = typeof window !== 'undefined' ? window.api?.lockscreenLock : undefined;
    void lock?.().catch(() => undefined);
  } catch {
    /* no bridge */
  }
}

/** Lock first on Secret OS entry; defer the Aero boot splash until after unlock. */
export function armLockscreenOnSecretEntry(): boolean {
  const s = loadLockscreen();
  if (!s.enabled || !s.pinHash) return false;
  clearLockscreenSession();
  armMainLock();
  try {
    sessionStorage.setItem(PENDING_AERO_BOOT_KEY, '1');
  } catch {
    return false;
  }
  return true;
}

export function consumePendingAeroBoot(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_AERO_BOOT_KEY) !== '1') return false;
    sessionStorage.removeItem(PENDING_AERO_BOOT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function armLockscreenOnWiredEntry(): boolean {
  const s = loadLockscreen();
  if (!s.enabled || !s.pinHash) return false;
  clearLockscreenSession();
  armMainLock();
  try {
    sessionStorage.setItem(PENDING_WIRED_BOOT_KEY, '1');
  } catch {
    return false;
  }
  return true;
}

export function consumePendingWiredBoot(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_WIRED_BOOT_KEY) !== '1') return false;
    sessionStorage.removeItem(PENDING_WIRED_BOOT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function onLockscreenChanged(cb: (s: LockscreenSettings) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<LockscreenSettings>).detail;
    cb(d && typeof d === 'object' ? d : loadLockscreen());
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function hasLockscreenPin(): boolean {
  const stored = loadLockscreen().pinHash;
  return isHashedPin(stored) || !!decodePin(stored);
}
