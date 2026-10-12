/**
 * Lockscreen PIN hashing and verification, in main.
 *
 * The PIN used to sit in localStorage as reversible base64 (`btoa("jp1:" +
 * reversed digits)`), so anyone with the profile folder had it. It is now a
 * salted scrypt hash computed here (the renderer has no `crypto.scrypt`), and a
 * legacy value is accepted once and upgraded transparently on the next
 * successful unlock. Failed attempts back off: after 5 misses each further miss
 * locks entry for 30 s, doubling to a 5-minute ceiling. The count and the
 * deadline are persisted in main's lock file, so a restart is not a reset, and a
 * missing or damaged file starts at the ceiling (risk4). A 4-digit PIN is still
 * only 10,000 values — the backoff is what makes guessing slow, the hash is what
 * keeps the PIN itself out of a copied profile.
 *
 * lock3 — main is the only writer of the PIN now:
 *  - Changing or clearing the PIN, and turning "lock at launch" off, need the
 *    current PIN (`setPin` / `clearPin` / `setEnabled`), checked against the
 *    same attempt counter as the lock screen, so Settings is not a second,
 *    unthrottled guessing surface. `syncConfig` only adopts a profile main has
 *    never seen; it can no longer swap the hash of an existing record.
 *  - A recovery code (80 bits, shown once when the first PIN is set) is the way
 *    back from a forgotten PIN. It is hashed like the PIN, rate-limited by the
 *    same backoff, and using it removes the PIN instead of revealing it.
 *  - The gate's clock is the wall clock read once at start plus monotonic time
 *    since (`anchoredClock`): moving the Windows clock forward during a session
 *    does not shorten a wait, and moving it back is clamped to the ceiling.
 *  - Auto-lock preferences (idle minutes, on sleep, on screen lock) live in the
 *    same record, so a renderer cannot turn them off while locked.
 */
import { ipcMain } from 'electron';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  DEFAULT_AUTO_LOCK,
  normalizeAutoLock,
  type AutoLockOptions,
  type LockMutationResult,
  type LockStatus,
} from '../shared/lockStatus';

const PREFIX = 'scrypt1';
const KEY_LEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Wall-clock time that moves only with monotonic time after it is created. Read
 * once at start (a restart trusts the clock it boots with; a deadline further
 * than the ceiling is clamped), then immune to clock changes for the session.
 */
export function anchoredClock(wall: () => number = Date.now, mono: () => number = () => performance.now()): () => number {
  const wall0 = wall();
  const mono0 = mono();
  return () => wall0 + Math.max(0, mono() - mono0);
}

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

/** Constant-time check of any secret against a `scrypt1:` value. */
function scryptMatches(secret: string, stored: string): boolean {
  const [, saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length !== KEY_LEN) return false;
  const actual = scryptSync(secret, Buffer.from(saltB64, 'base64'), KEY_LEN, SCRYPT_OPTS);
  return timingSafeEqual(actual, expected);
}

/** Constant-time check of `pin` against a stored value (hashed or legacy). */
export function pinMatches(pin: string, stored: string): boolean {
  if (!isValidLockPin(pin) || !stored) return false;
  if (isScryptPinHash(stored)) return scryptMatches(pin, stored);
  const legacy = decodeLegacyPin(stored);
  if (!legacy) return false;
  return timingSafeEqual(Buffer.from(legacy), Buffer.from(pin));
}

// ---- Recovery code ----------------------------------------------------------

/** Crockford base32: no I, L, O or U, so a code read aloud or retyped survives. */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 16;

/** 80 random bits as `XXXX-XXXX-XXXX-XXXX`. */
export function generateRecoveryCode(bytes: Buffer = randomBytes(10)): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  out = out.slice(0, RECOVERY_CODE_LENGTH);
  return (out.match(/.{1,4}/g) ?? []).join('-');
}

/** What the person typed, in the form that was hashed: case, dashes and look-alikes forgiven. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of s) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return s;
}

export function hashRecoveryCode(code: string, salt: Buffer = randomBytes(16)): string {
  const normalized = normalizeRecoveryCode(code) ?? '';
  const hash = scryptSync(normalized, salt, KEY_LEN, SCRYPT_OPTS);
  return `${PREFIX}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function recoveryCodeMatches(code: unknown, stored: string): boolean {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized || !isScryptPinHash(stored)) return false;
  return scryptMatches(normalized, stored);
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

/**
 * The attempt counter and the backoff deadline (risk4). These used to live only
 * in this module's memory, so every restart handed out another 5 free guesses;
 * the lock gate now persists them in main's lock file next to the PIN hash.
 */
export interface LockAttempts {
  failures: number;
  /** Epoch ms; entry is refused before this. 0 = no backoff. */
  lockedUntil: number;
}

export const NO_ATTEMPTS: Readonly<LockAttempts> = Object.freeze({ failures: 0, lockedUntil: 0 });

/** The smallest failure count whose next miss already sits at the ceiling. */
export const CEILING_FAILURES: number = (() => {
  let f = FREE_ATTEMPTS;
  while (lockoutMs(f) < MAX_LOCKOUT_MS) f += 1;
  return f;
})();

/**
 * What a missing or damaged attempt record is worth: the longest wait, never a
 * fresh set of guesses. Deleting or corrupting the lock file must not reset it.
 */
export function ceilingAttempts(now: number): LockAttempts {
  return { failures: CEILING_FAILURES, lockedUntil: now + MAX_LOCKOUT_MS };
}

/**
 * One PIN attempt against `attempts`, returning the next attempt state. Pure:
 * the caller decides where the state lives. A deadline further away than the
 * ceiling (the clock was moved back) is clamped to the ceiling.
 */
/**
 * One attempt at ANY lock secret (the PIN, the current PIN in Settings, a
 * recovery code) against the one shared counter. `matches` is only called
 * outside a wait, so a paused entry costs no scrypt and reveals nothing.
 */
export function checkSecretAttempt(
  matches: () => boolean,
  attempts: LockAttempts,
  now: number,
): { ok: boolean; retryAfterMs?: number; attempts: LockAttempts } {
  const lockedUntil = Math.min(attempts.lockedUntil, now + MAX_LOCKOUT_MS);
  if (now < lockedUntil) {
    return { ok: false, retryAfterMs: lockedUntil - now, attempts: { failures: attempts.failures, lockedUntil } };
  }
  let ok = false;
  try {
    ok = matches();
  } catch {
    ok = false;
  }
  if (!ok) {
    const failures = attempts.failures + 1;
    const wait = lockoutMs(failures);
    if (wait > 0) return { ok: false, retryAfterMs: wait, attempts: { failures, lockedUntil: now + wait } };
    return { ok: false, attempts: { failures, lockedUntil: 0 } };
  }
  return { ok: true, attempts: { ...NO_ATTEMPTS } };
}

export function checkPinAttempt(
  pin: unknown,
  stored: unknown,
  attempts: LockAttempts,
  now = Date.now(),
): { result: PinVerifyResult; attempts: LockAttempts } {
  const step = checkSecretAttempt(
    () => typeof stored === 'string' && isValidLockPin(pin) && pinMatches(pin, stored),
    attempts,
    now,
  );
  if (!step.ok) {
    return {
      result: { ok: false, ...(step.retryAfterMs !== undefined ? { retryAfterMs: step.retryAfterMs } : {}) },
      attempts: step.attempts,
    };
  }
  return {
    result: {
      ok: true,
      ...(typeof stored === 'string' && !isScryptPinHash(stored) ? { upgradedHash: hashPin(pin as string) } : {}),
    },
    attempts: { ...NO_ATTEMPTS },
  };
}

let moduleAttempts: LockAttempts = { ...NO_ATTEMPTS };

/** Process-local attempt state (kept for callers without a lock gate). */
export function verifyPinAttempt(pin: unknown, stored: unknown, now = Date.now()): PinVerifyResult {
  const { result, attempts } = checkPinAttempt(pin, stored, moduleAttempts, now);
  moduleAttempts = attempts;
  return result;
}

export function resetPinAttemptsForTests(): void {
  moduleAttempts = { ...NO_ATTEMPTS };
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
  /** Format 2 carries the attempt state below; a record without `v` predates it. */
  v?: number;
  failures?: number;
  lockedUntil?: number;
  /** lock3: scrypt hash of the recovery code ('' = none). */
  recoveryHash?: string;
  /** lock3: when main arms the lock by itself. */
  autoLock?: AutoLockOptions;
}

export const LOCK_RECORD_VERSION = 2;

export interface LockRecordStore {
  read(): LockRecord | null;
  write(record: LockRecord): void;
  /**
   * True when the last `read` could not trust the file (restored from its
   * last-good copy, or unreadable): the attempt state is then the ceiling.
   */
  damaged?(): boolean;
}

function isStorablePinHash(v: unknown): v is string {
  return typeof v === 'string' && (isScryptPinHash(v) || decodeLegacyPin(v) !== null);
}

function asLockRecord(v: unknown): LockRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<LockRecord>;
  const pinHash = isStorablePinHash(r.pinHash) ? r.pinHash : '';
  // A recovery code exists only alongside a PIN: it is the way back to one.
  const recoveryHash = pinHash && typeof r.recoveryHash === 'string' && isScryptPinHash(r.recoveryHash) ? r.recoveryHash : '';
  return { enabled: r.enabled === true && pinHash !== '', pinHash, recoveryHash, autoLock: normalizeAutoLock(r.autoLock) };
}

/**
 * The attempt state stored in a lock record. A record from before format 2 has
 * none and starts clean (it was written before attempts were persisted); a
 * format-2 record whose fields are missing or malformed was edited, and is worth
 * the ceiling, not a reset.
 */
export function attemptsFromRecord(v: unknown, now: number): LockAttempts {
  if (!v || typeof v !== 'object') return ceilingAttempts(now);
  const r = v as Partial<LockRecord>;
  if (r.v === undefined && r.failures === undefined && r.lockedUntil === undefined) return { ...NO_ATTEMPTS };
  const failures = r.failures;
  const lockedUntil = r.lockedUntil;
  if (
    r.v !== LOCK_RECORD_VERSION
    || typeof failures !== 'number' || !Number.isInteger(failures) || failures < 0 || failures > 1_000_000
    || typeof lockedUntil !== 'number' || !Number.isFinite(lockedUntil) || lockedUntil < 0
  ) {
    return ceilingAttempts(now);
  }
  return { failures, lockedUntil: Math.min(lockedUntil, now + MAX_LOCKOUT_MS) };
}

export interface LockGate {
  isLocked(): boolean;
  /**
   * Arm the lock now (Lock now, Secret OS entry, the lock widget, auto-lock).
   * Needs a PIN; "lock at launch" (`enabled`) is not required. No-op without one.
   */
  lock(): boolean;
  /**
   * A renderer's mirror, adopted ONLY when main has no record yet (a profile
   * from before main kept the PIN; `rendererLocked` says whether that window is
   * showing the lock). Once main has a record it never takes a PIN or the
   * launch setting from a renderer: those go through the calls below.
   */
  syncConfig(config: unknown, rendererLocked?: unknown): { ok: boolean; locked: boolean };
  /** Check a PIN against main's own record; success lifts the lock. */
  verify(pin: unknown, legacyStored?: unknown, now?: number): PinVerifyResult;
  /** Set or change the PIN. A PIN already set must be given as `current`. */
  setPin(current: unknown, next: unknown, now?: number): LockMutationResult;
  /** Remove the PIN (and with it the launch lock and the recovery code). */
  clearPin(current: unknown, now?: number): LockMutationResult;
  /** Lock at launch. Turning it OFF needs the current PIN. */
  setEnabled(on: unknown, current?: unknown, now?: number): LockMutationResult;
  /** Replace the recovery code (the old one stops working). */
  newRecoveryCode(current: unknown, now?: number): LockMutationResult;
  /** A forgotten PIN: the recovery code removes it and lifts the lock. */
  recover(code: unknown, now?: number): LockMutationResult;
  setAutoLock(options: unknown): LockMutationResult;
  autoLock(): AutoLockOptions;
  status(): LockStatus;
  record(): LockRecord | null;
  /** The persisted attempt state (for tests and diagnostics). */
  attempts(): LockAttempts;
}

/**
 * `onChange` hears every transition after creation (armed, lifted, adopted) —
 * main.ts hands it to the lock guard (`lockGuard.ts`) so arming hides content
 * windows and lifting restores them. The state at creation is not a transition.
 *
 * `clock` defaults to `anchoredClock()`: wall time at start, monotonic after.
 */
export function createLockGate(
  store: LockRecordStore,
  onChange?: (locked: boolean) => void,
  clock: () => number = anchoredClock(),
): LockGate {
  let raw: unknown = null;
  let damaged = false;
  try {
    raw = store.read();
    damaged = store.damaged?.() === true;
  } catch {
    damaged = true;
  }
  let record = asLockRecord(raw);
  // A damaged file is never a reset: whatever it held, entry starts at the ceiling.
  let attempts: LockAttempts = damaged ? ceilingAttempts(clock()) : record ? attemptsFromRecord(raw, clock()) : { ...NO_ATTEMPTS };
  let lockedState = Boolean(record?.enabled && record.pinHash);
  const setLocked = (next: boolean) => {
    if (next === lockedState) return;
    lockedState = next;
    try {
      onChange?.(next);
    } catch {
      /* a listener's failure never changes the lock */
    }
  };
  const save = (next: LockRecord) => {
    const pinHash = next.pinHash;
    record = {
      enabled: next.enabled && pinHash !== '',
      pinHash,
      recoveryHash: pinHash ? next.recoveryHash ?? '' : '',
      autoLock: normalizeAutoLock(next.autoLock),
    };
    try {
      store.write({ ...record, v: LOCK_RECORD_VERSION, failures: attempts.failures, lockedUntil: attempts.lockedUntil });
    } catch {
      /* kept in memory for this session */
    }
  };
  const status = (): LockStatus => ({
    locked: lockedState,
    enabled: Boolean(record?.enabled && record.pinHash),
    hasPin: Boolean(record?.pinHash),
    hasRecovery: Boolean(record?.pinHash && record.recoveryHash),
    autoLock: normalizeAutoLock(record?.autoLock),
    pinHash: record?.pinHash ?? '',
  });
  const result = (ok: boolean, extra: Partial<Omit<LockMutationResult, 'ok' | 'status'>> = {}): LockMutationResult => ({
    ok,
    ...extra,
    status: status(),
  });
  const base = (): LockRecord => record ?? { enabled: false, pinHash: '', recoveryHash: '', autoLock: { ...DEFAULT_AUTO_LOCK } };
  /**
   * The current PIN, as Settings asks for it: same counter, same backoff as the
   * lock screen. Returns null when it matched, else the refusal.
   */
  const checkCurrent = (current: unknown, now: number): LockMutationResult | null => {
    const stored = record?.pinHash;
    if (!stored) return null;
    const before = attempts;
    const step = checkSecretAttempt(() => isValidLockPin(current) && pinMatches(current, stored), attempts, now);
    attempts = step.attempts;
    if (step.ok) {
      if (before.failures !== 0 || before.lockedUntil !== 0) save(base());
      return null;
    }
    if (step.attempts.failures !== before.failures || step.attempts.lockedUntil !== before.lockedUntil) save(base());
    return result(false, { error: 'wrong-pin', ...(step.retryAfterMs !== undefined ? { retryAfterMs: step.retryAfterMs } : {}) });
  };
  return {
    isLocked: () => lockedState,
    lock() {
      if (record?.pinHash) setLocked(true);
      return lockedState;
    },
    syncConfig(config, rendererLocked) {
      const parsed = asLockRecord(config);
      if (!parsed) return { ok: false, locked: lockedState };
      if (record) return { ok: false, locked: lockedState };
      // Only the PIN and the launch flag are adopted; never a recovery code or
      // auto-lock preferences a renderer made up.
      const next: LockRecord = { enabled: parsed.enabled, pinHash: parsed.pinHash };
      const lockedNow = next.enabled && rendererLocked === true;
      // Main has no record but a renderer is showing a lock: the file was
      // removed (or never written). Either way it is worth the ceiling.
      attempts = lockedNow ? ceilingAttempts(clock()) : { ...NO_ATTEMPTS };
      save(next);
      setLocked(lockedNow);
      return { ok: true, locked: lockedState };
    },
    setPin(current, nextPin, now = clock()) {
      if (lockedState) return result(false, { error: 'locked' });
      if (!isValidLockPin(nextPin)) return result(false, { error: 'invalid' });
      const refused = checkCurrent(current, now);
      if (refused) return refused;
      const cur = base();
      const firstPin = !cur.pinHash;
      // The first PIN comes with a recovery code; a change keeps the one the
      // person already wrote down.
      const recoveryCode = firstPin || !cur.recoveryHash ? generateRecoveryCode() : undefined;
      save({
        ...cur,
        pinHash: hashPin(nextPin),
        recoveryHash: recoveryCode ? hashRecoveryCode(recoveryCode) : cur.recoveryHash,
      });
      return result(true, recoveryCode ? { recoveryCode } : {});
    },
    clearPin(current, now = clock()) {
      if (lockedState) return result(false, { error: 'locked' });
      if (!record?.pinHash) return result(false, { error: 'no-pin' });
      const refused = checkCurrent(current, now);
      if (refused) return refused;
      save({ ...base(), enabled: false, pinHash: '', recoveryHash: '' });
      return result(true);
    },
    setEnabled(on, current, now = clock()) {
      if (lockedState) return result(false, { error: 'locked' });
      if (on !== true && on !== false) return result(false, { error: 'invalid' });
      if (!record?.pinHash) return result(false, { error: 'no-pin' });
      if (on === record.enabled) return result(true);
      // Turning protection OFF is a change the owner makes, not a passer-by.
      if (!on) {
        const refused = checkCurrent(current, now);
        if (refused) return refused;
      }
      save({ ...base(), enabled: on });
      return result(true);
    },
    newRecoveryCode(current, now = clock()) {
      if (lockedState) return result(false, { error: 'locked' });
      if (!record?.pinHash) return result(false, { error: 'no-pin' });
      const refused = checkCurrent(current, now);
      if (refused) return refused;
      const recoveryCode = generateRecoveryCode();
      save({ ...base(), recoveryHash: hashRecoveryCode(recoveryCode) });
      return result(true, { recoveryCode });
    },
    recover(code, now = clock()) {
      const stored = record?.recoveryHash;
      if (!record?.pinHash || !stored) return result(false, { error: 'no-recovery' });
      const before = attempts;
      const step = checkSecretAttempt(() => recoveryCodeMatches(code, stored), attempts, now);
      attempts = step.attempts;
      if (!step.ok) {
        if (step.attempts.failures !== before.failures || step.attempts.lockedUntil !== before.lockedUntil) save(base());
        return result(false, { error: 'wrong-pin', ...(step.retryAfterMs !== undefined ? { retryAfterMs: step.retryAfterMs } : {}) });
      }
      // The code is spent: the PIN it recovers from is removed (never shown),
      // and the person sets a new one, which issues a new code.
      save({ ...base(), enabled: false, pinHash: '', recoveryHash: '' });
      setLocked(false);
      return result(true);
    },
    setAutoLock(options) {
      if (lockedState) return result(false, { error: 'locked' });
      if (!options || typeof options !== 'object') return result(false, { error: 'invalid' });
      save({ ...base(), autoLock: normalizeAutoLock({ ...normalizeAutoLock(record?.autoLock), ...(options as object) }) });
      return result(true);
    },
    autoLock: () => normalizeAutoLock(record?.autoLock),
    status,
    verify(pin, legacyStored, now = clock()) {
      // A profile main never saw: adopt the renderer's stored value once — at
      // the ceiling, since a missing lock file is never a fresh set of guesses.
      if (!record && isStorablePinHash(legacyStored)) {
        attempts = ceilingAttempts(now);
        save({ enabled: true, pinHash: legacyStored });
      }
      const step = checkPinAttempt(pin, record?.pinHash || undefined, attempts, now);
      const changed = step.attempts.failures !== attempts.failures || step.attempts.lockedUntil !== attempts.lockedUntil;
      attempts = step.attempts;
      const res = step.result;
      if (res.ok) {
        setLocked(false);
        if (record) save(res.upgradedHash ? { ...record, pinHash: res.upgradedHash } : record);
      } else if (changed && record) {
        save(record);
      }
      return res;
    },
    record: () => record,
    attempts: () => ({ ...attempts }),
  };
}

export function registerLockscreenPinIpc(gate: LockGate): void {
  // `stored` from the renderer is only a migration source now — never the value checked against.
  ipcMain.handle('lockscreen:verifyPin', (_event, pin: unknown, stored: unknown): PinVerifyResult =>
    gate.verify(pin, stored));
  ipcMain.handle('lockscreen:syncConfig', (_event, config: unknown, rendererLocked: unknown) =>
    gate.syncConfig(config, rendererLocked));
  ipcMain.handle('lockscreen:isLocked', (): boolean => gate.isLocked());
  // lock3: main is the only writer of the PIN, the launch flag and auto-lock.
  ipcMain.handle('lockscreen:status', (): LockStatus => gate.status());
  ipcMain.handle('lockscreen:setPin', (_event, current: unknown, next: unknown) => gate.setPin(current, next));
  ipcMain.handle('lockscreen:clearPin', (_event, current: unknown) => gate.clearPin(current));
  ipcMain.handle('lockscreen:setEnabled', (_event, on: unknown, current: unknown) => gate.setEnabled(on, current));
  ipcMain.handle('lockscreen:newRecoveryCode', (_event, current: unknown) => gate.newRecoveryCode(current));
  ipcMain.handle('lockscreen:recover', (_event, code: unknown) => gate.recover(code));
  ipcMain.handle('lockscreen:setAutoLock', (_event, options: unknown) => gate.setAutoLock(options));
}
