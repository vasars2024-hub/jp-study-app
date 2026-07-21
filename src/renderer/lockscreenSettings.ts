/**
 * Lockscreen — optional PIN gate at app launch.
 * Local-only UI lock (not cryptographic security). PIN is stored obfuscated in localStorage.
 */

export interface LockscreenSettings {
  /** When true, show the lockscreen on cold launch of the main window. */
  enabled: boolean;
  /** Obfuscated 4-digit PIN (empty = not set). */
  pinHash: string;
  /** Soft accent for the lock panel. */
  tint: 'neutral' | 'ember' | 'slate' | 'moss';
}

const KEY = 'jp-study-lockscreen-v1';
const EVENT = 'jp-lockscreen-changed';
const SESSION_UNLOCKED = 'jp-lockscreen-unlocked';
const PENDING_AERO_BOOT_KEY = 'jp-aero-pending-boot';
const PENDING_WIRED_BOOT_KEY = 'jp-wired-pending-boot';

export const AERO_ENTRY_LOCKED_EVENT = 'shell:aeroEntryLocked';

const DEFAULTS: LockscreenSettings = {
  enabled: false,
  pinHash: '',
  tint: 'neutral',
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
      tint:
        p.tint === 'ember' || p.tint === 'slate' || p.tint === 'moss' || p.tint === 'neutral'
          ? p.tint
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
  return next;
}

export function setLockscreenPin(pin: string): LockscreenSettings | null {
  if (!isValidPin(pin)) return null;
  return saveLockscreen({ pinHash: encodePin(pin) });
}

export function clearLockscreenPin(): LockscreenSettings {
  return saveLockscreen({ pinHash: '', enabled: false });
}

export function verifyLockscreenPin(pin: string): boolean {
  const stored = decodePin(loadLockscreen().pinHash);
  return stored !== null && stored === pin;
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

/** Lock first on Secret OS entry; defer the Aero boot splash until after unlock. */
export function armLockscreenOnSecretEntry(): boolean {
  const s = loadLockscreen();
  if (!s.enabled || !s.pinHash) return false;
  clearLockscreenSession();
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
  return !!decodePin(loadLockscreen().pinHash);
}
