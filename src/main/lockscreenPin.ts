/**
 * Lockscreen PIN hashing and verification, in main.
 *
 * The PIN used to sit in localStorage as reversible base64 (`btoa("jp1:" +
 * reversed digits)`), so anyone with the profile folder had it. It is now a
 * salted scrypt hash computed here (the renderer has no `crypto.scrypt`), and a
 * legacy value is accepted once and upgraded transparently on the next
 * successful unlock. Failed attempts back off: after 5 misses each further miss
 * locks entry for 30 s, doubling to a 5-minute ceiling. A 4-digit PIN is still
 * only 10,000 values — the backoff is what makes guessing slow, the hash is what
 * keeps the PIN itself out of a copied profile.
 */
import { ipcMain } from 'electron';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PREFIX = 'scrypt1';
const KEY_LEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

export const FREE_ATTEMPTS = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 5 * 60_000;

export function isValidLockPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export function hashPin(pin: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(pin, salt, KEY_LEN, SCRYPT_OPTS);
  return `${PREFIX}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function isScryptPinHash(stored: string): boolean {
  return stored.startsWith(`${PREFIX}:`);
}

/** The legacy reversible encoding (`lockscreenSettings.ts` before hashing). */
export function decodeLegacyPin(stored: string): string | null {
  try {
    const raw = Buffer.from(stored, 'base64').toString('utf8');
    if (!raw.startsWith('jp1:')) return null;
    const digits = raw.slice(4).split('').reverse().join('');
    return /^\d{4}$/.test(digits) ? digits : null;
  } catch {
    return null;
  }
}

/** Constant-time check of `pin` against a stored value (hashed or legacy). */
export function pinMatches(pin: string, stored: string): boolean {
  if (!isValidLockPin(pin) || !stored) return false;
  if (isScryptPinHash(stored)) {
    const [, saltB64, hashB64] = stored.split(':');
    if (!saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, 'base64');
    if (expected.length !== KEY_LEN) return false;
    const actual = scryptSync(pin, Buffer.from(saltB64, 'base64'), KEY_LEN, SCRYPT_OPTS);
    return timingSafeEqual(actual, expected);
  }
  const legacy = decodeLegacyPin(stored);
  if (!legacy) return false;
  return timingSafeEqual(Buffer.from(legacy), Buffer.from(pin));
}

/** How long entry stays locked after `failures` consecutive misses. */
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** (failures - FREE_ATTEMPTS));
}

export interface PinVerifyResult {
  ok: boolean;
  /** Entry is locked for this long; the attempt was not even checked. */
  retryAfterMs?: number;
  /** A legacy value matched: store this hash in its place. */
  upgradedHash?: string;
}

let failures = 0;
let lockedUntil = 0;

export function verifyPinAttempt(pin: unknown, stored: unknown, now = Date.now()): PinVerifyResult {
  if (now < lockedUntil) return { ok: false, retryAfterMs: lockedUntil - now };
  const ok = typeof stored === 'string' && isValidLockPin(pin) && pinMatches(pin, stored);
  if (!ok) {
    failures += 1;
    const wait = lockoutMs(failures);
    if (wait > 0) {
      lockedUntil = now + wait;
      return { ok: false, retryAfterMs: wait };
    }
    return { ok: false };
  }
  failures = 0;
  lockedUntil = 0;
  return {
    ok: true,
    ...(typeof stored === 'string' && !isScryptPinHash(stored) ? { upgradedHash: hashPin(pin as string) } : {}),
  };
}

export function resetPinAttemptsForTests(): void {
  failures = 0;
  lockedUntil = 0;
}

/**
 * The lock record main keeps for itself. The renderer's copy (localStorage) is
 * only a mirror for its UI: the PIN is checked against this one, and the lock
 * is lifted only here. Profiles from before main kept it adopt the renderer's
 * record once (`syncConfig` / the first `verify`), so existing PINs keep working.
 */
export interface LockRecord {
  enabled: boolean;
  pinHash: string;
}

export interface LockRecordStore {
  read(): LockRecord | null;
  write(record: LockRecord): void;
}

function isStorablePinHash(v: unknown): v is string {
  return typeof v === 'string' && (isScryptPinHash(v) || decodeLegacyPin(v) !== null);
}

function asLockRecord(v: unknown): LockRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<LockRecord>;
  const pinHash = isStorablePinHash(r.pinHash) ? r.pinHash : '';
  return { enabled: r.enabled === true && pinHash !== '', pinHash };
}

export interface LockGate {
  isLocked(): boolean;
  /** Re-arm the lock (Secret OS entry, the lock widget). No-op without a PIN. */
  lock(): boolean;
  /**
   * The renderer's settings. Adopted once when main has no record yet (then
   * `rendererLocked` says whether that window is showing the lock); afterwards
   * applied only while unlocked — a locked app takes no config from a renderer.
   */
  syncConfig(config: unknown, rendererLocked?: unknown): { ok: boolean; locked: boolean };
  /** Check a PIN against main's own record; success lifts the lock. */
  verify(pin: unknown, legacyStored?: unknown, now?: number): PinVerifyResult;
  record(): LockRecord | null;
}

export function createLockGate(store: LockRecordStore): LockGate {
  let record = asLockRecord(store.read());
  let locked = Boolean(record?.enabled && record.pinHash);
  const save = (next: LockRecord) => {
    record = next;
    try {
      store.write(next);
    } catch {
      /* kept in memory for this session */
    }
  };
  return {
    isLocked: () => locked,
    lock() {
      if (record?.enabled && record.pinHash) locked = true;
      return locked;
    },
    syncConfig(config, rendererLocked) {
      const next = asLockRecord(config);
      if (!next) return { ok: false, locked };
      if (!record) {
        save(next);
        locked = next.enabled && rendererLocked === true;
        return { ok: true, locked };
      }
      if (locked) return { ok: false, locked };
      save(next);
      return { ok: true, locked };
    },
    verify(pin, legacyStored, now = Date.now()) {
      // A profile main never saw: adopt the renderer's stored value once.
      if (!record && isStorablePinHash(legacyStored)) save({ enabled: true, pinHash: legacyStored });
      const res = verifyPinAttempt(pin, record?.pinHash || undefined, now);
      if (res.ok) {
        locked = false;
        if (res.upgradedHash && record) save({ ...record, pinHash: res.upgradedHash });
      }
      return res;
    },
    record: () => record,
  };
}

export function registerLockscreenPinIpc(gate: LockGate): void {
  ipcMain.handle('lockscreen:hashPin', (_event, pin: unknown): string | null => (isValidLockPin(pin) ? hashPin(pin) : null));
  // `stored` from the renderer is only a migration source now — never the value checked against.
  ipcMain.handle('lockscreen:verifyPin', (_event, pin: unknown, stored: unknown): PinVerifyResult =>
    gate.verify(pin, stored));
  ipcMain.handle('lockscreen:syncConfig', (_event, config: unknown, rendererLocked: unknown) =>
    gate.syncConfig(config, rendererLocked));
  ipcMain.handle('lockscreen:isLocked', (): boolean => gate.isLocked());
}
