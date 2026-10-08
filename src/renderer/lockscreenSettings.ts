/**
 * Lockscreen — optional PIN gate at app launch.
 * Local-only UI lock. The PIN is stored as a salted scrypt hash computed in main
 * (older profiles hold a reversible encoding, upgraded on the next unlock), and
 * main backs off after repeated wrong PINs.
 */

export interface LockscreenSettings {
  /** When true, show the lockscreen on cold launch of the main window. */
  enabled: boolean;
  /** Obfuscated 4-digit PIN (empty = not set). */
  pinHash: string;
  /**
   * Soft accent for the lock panel. `auto` derives it from the live `--accent`
   * (written inline on <html> by osPersonalization) and the active theme's `--bg`,
   * so it re-tints on an accent or theme change with no code path at all — the
   * four fixed tints stay available for anyone who wants to pin one.
   */
  tint: LockscreenTint;
}

export const LOCKSCREEN_TINTS = ['auto', 'neutral', 'ember', 'slate', 'moss'] as const;

export type LockscreenTint = (typeof LOCKSCREEN_TINTS)[number];

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
};

/** Lightweight reversible obfuscation — enough to avoid plain PIN in localStorage dumps. */
export function encodePin(pin: string): string {
  const digits = pin.replace(/\D/g, '').slice(0, 4);
  if (digits.length !== 4) return '';
  return btoa(`jp1:${digits.split('').reverse().join('')}`);
}

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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLockscreen(patch: Partial<LockscreenSettings>): LockscreenSettings {
  const cur = loadLockscreen();
  const next: LockscreenSettings = { ...cur, ...patch };
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
  syncLockscreenToMain(next, false);
  return next;
}

/**
 * Main owns the lock and keeps its own copy of the PIN hash; this one is the
 * UI's mirror. Main adopts it once (profiles from before), then takes changes
 * only while unlocked.
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

/**
 * Store a new PIN. Main hashes it with scrypt; only where main is unreachable
 * (a harness without the bridge) does the legacy encoding stand in, and that
 * value is upgraded on the next successful unlock.
 */
export async function setLockscreenPin(pin: string): Promise<LockscreenSettings | null> {
  if (!isValidPin(pin)) return null;
  let hashed: string | null = null;
  try {
    hashed = (await window.api?.lockscreenHashPin?.(pin)) ?? null;
  } catch {
    hashed = null;
  }
  return saveLockscreen({ pinHash: hashed && isHashedPin(hashed) ? hashed : encodePin(pin) });
}

export function clearLockscreenPin(): LockscreenSettings {
  return saveLockscreen({ pinHash: '', enabled: false });
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
        saveLockscreen({ pinHash: res.upgradedHash });
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

/** True when the lockscreen should block the main shell right now. */
export function shouldShowLockscreen(): boolean {
  const s = loadLockscreen();
  if (!s.enabled || !s.pinHash) return false;
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
