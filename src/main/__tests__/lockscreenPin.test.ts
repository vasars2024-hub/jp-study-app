// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: () => undefined } }));

import {
  anchoredClock,
  attemptsFromRecord,
  BASE_LOCKOUT_MS,
  CEILING_FAILURES,
  checkPinAttempt,
  createLockGate,
  FREE_ATTEMPTS,
  generateRecoveryCode,
  hashRecoveryCode,
  LOCK_RECORD_VERSION,
  hashPin,
  isScryptPinHash,
  lockoutMs,
  MAX_LOCKOUT_MS,
  normalizeRecoveryCode,
  pinMatches,
  recoveryCodeMatches,
  resetPinAttemptsForTests,
  verifyPinAttempt,
  type LockRecord,
} from '../lockscreenPin';

const legacy = (pin: string) => Buffer.from(`jp1:${pin.split('').reverse().join('')}`).toString('base64');

beforeEach(() => resetPinAttemptsForTests());

describe('lockscreen PIN hashing', () => {
  it('hashes with a salt and verifies only the right PIN', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(isScryptPinHash(a)).toBe(true);
    expect(a).not.toBe(b); // salted
    expect(a).not.toContain('1234');
    expect(pinMatches('1234', a)).toBe(true);
    expect(pinMatches('1235', a)).toBe(false);
    expect(pinMatches('12a4', a)).toBe(false);
  });

  it('accepts a legacy base64 PIN once and hands back an upgraded hash', () => {
    const res = verifyPinAttempt('4321', legacy('4321'));
    expect(res.ok).toBe(true);
    expect(res.upgradedHash && isScryptPinHash(res.upgradedHash)).toBe(true);
    expect(pinMatches('4321', res.upgradedHash!)).toBe(true);
    // A hashed value is not "upgraded" again.
    expect(verifyPinAttempt('4321', res.upgradedHash).upgradedHash).toBeUndefined();
  });
});

describe('attempt backoff', () => {
  it('locks entry after repeated misses, even for the right PIN, then recovers', () => {
    const stored = hashPin('0000');
    let now = 1_000_000;
    for (let i = 0; i < FREE_ATTEMPTS - 1; i += 1) {
      expect(verifyPinAttempt('1111', stored, now)).toEqual({ ok: false });
    }
    const locked = verifyPinAttempt('1111', stored, now);
    expect(locked.retryAfterMs).toBe(BASE_LOCKOUT_MS);
    // Right PIN during the lockout is not even checked.
    expect(verifyPinAttempt('0000', stored, now + 1000).ok).toBe(false);
    now += BASE_LOCKOUT_MS + 1;
    expect(verifyPinAttempt('0000', stored, now).ok).toBe(true);
  });

  it('doubles the wait up to a ceiling', () => {
    expect(lockoutMs(FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(FREE_ATTEMPTS)).toBe(BASE_LOCKOUT_MS);
    expect(lockoutMs(FREE_ATTEMPTS + 1)).toBe(BASE_LOCKOUT_MS * 2);
    expect(lockoutMs(FREE_ATTEMPTS + 20)).toBe(MAX_LOCKOUT_MS);
  });
});

function memoryStore(initial: LockRecord | null) {
  const s = { value: initial, writes: 0 };
  return {
    s,
    store: {
      read: () => s.value,
      write: (r: LockRecord) => {
        s.value = r;
        s.writes += 1;
      },
    },
  };
}

describe('main-owned lock gate', () => {
  it('starts locked from main\'s own record and only a verified PIN lifts it', () => {
    const { store } = memoryStore({ enabled: true, pinHash: hashPin('2468') });
    const gate = createLockGate(store);
    expect(gate.isLocked()).toBe(true);
    // A renderer cannot swap in its own hash, or a new config, while locked.
    const forged = hashPin('0000');
    expect(gate.verify('0000', forged).ok).toBe(false);
    expect(gate.syncConfig({ enabled: false, pinHash: '' }).ok).toBe(false);
    expect(gate.syncConfig({ enabled: true, pinHash: forged }).ok).toBe(false);
    expect(gate.isLocked()).toBe(true);
    expect(gate.verify('2468', forged).ok).toBe(true);
    expect(gate.isLocked()).toBe(false);
  });

  it('keeps the attempt backoff', () => {
    const gate = createLockGate(memoryStore({ enabled: true, pinHash: hashPin('2468') }).store);
    for (let i = 0; i < FREE_ATTEMPTS - 1; i += 1) gate.verify('1111', undefined, 1_000);
    expect(gate.verify('1111', undefined, 1_000).retryAfterMs).toBe(BASE_LOCKOUT_MS);
    expect(gate.verify('2468', undefined, 2_000).ok).toBe(false);
    expect(gate.isLocked()).toBe(true);
  });

  it('migrates an existing renderer PIN (legacy encoding) once and upgrades it in main', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store);
    expect(gate.isLocked()).toBe(false); // nothing known yet
    expect(gate.syncConfig({ enabled: true, pinHash: legacy('1357') }, true)).toEqual({ ok: true, locked: true });
    expect(gate.isLocked()).toBe(true);
    // Adopted while a lock is showing: main had no file, so entry starts at the ceiling.
    expect(gate.attempts().failures).toBe(CEILING_FAILURES);
    const res = gate.verify('1357', undefined, Date.now() + MAX_LOCKOUT_MS + 1);
    expect(res.ok).toBe(true);
    expect(isScryptPinHash(s.value!.pinHash)).toBe(true);
    expect(pinMatches('1357', s.value!.pinHash)).toBe(true);
  });

  it('a first verify adopts the renderer value when main has no record — at the backoff ceiling', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store);
    const stored = hashPin('9999');
    // A missing lock file is never a fresh set of guesses (risk4).
    const first = gate.verify('9999', stored, 1_000);
    expect(first.ok).toBe(false);
    expect(first.retryAfterMs).toBe(MAX_LOCKOUT_MS);
    expect(s.value?.pinHash).toBe(stored);
    expect(gate.verify('9999', stored, 1_000 + MAX_LOCKOUT_MS).ok).toBe(true);
    // Adopted once: a different renderer value is not taken over afterwards.
    gate.lock();
    expect(gate.verify('0000', hashPin('0000'), 2_000 + MAX_LOCKOUT_MS).ok).toBe(false);
  });

  it('lock3: a renderer can no longer swap the PIN of an existing record, even unlocked', () => {
    const { s, store } = memoryStore({ enabled: false, pinHash: '' });
    const gate = createLockGate(store, undefined, () => 1_000);
    expect(gate.lock()).toBe(false);
    const forged = hashPin('1111');
    // syncConfig used to save any hash while unlocked: the "renderer sets a new PIN" hole.
    expect(gate.syncConfig({ enabled: true, pinHash: forged }).ok).toBe(false);
    expect(gate.status().hasPin).toBe(false);
    // The PIN goes through main, which hashes it and hands back a recovery code once.
    const set = gate.setPin(null, '1111');
    expect(set.ok).toBe(true);
    expect(set.recoveryCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(s.value).toMatchObject({ enabled: false, v: LOCK_RECORD_VERSION, failures: 0, lockedUntil: 0 });
    expect(pinMatches('1111', s.value!.pinHash)).toBe(true);
    expect(isScryptPinHash(s.value!.recoveryHash ?? '')).toBe(true);
    expect(gate.isLocked()).toBe(false); // setting a PIN does not lock this session
    // "Lock now" needs a PIN, not the launch flag.
    expect(gate.lock()).toBe(true);
    // Garbage is never stored as a PIN.
    expect(createLockGate(memoryStore({ enabled: true, pinHash: 'nope' }).store).isLocked()).toBe(false);
  });
});

describe('lock3: PIN changes need the current PIN, through the shared backoff', () => {
  const T0 = 9_000_000;

  it('change, disable and clear refuse without the current PIN, and count the misses', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store, undefined, () => T0);
    gate.syncConfig({ enabled: false, pinHash: '' });
    expect(gate.setPin(null, '2468').ok).toBe(true);
    expect(gate.setEnabled(true).ok).toBe(true); // turning protection ON needs nothing
    expect(gate.status()).toMatchObject({ enabled: true, hasPin: true, hasRecovery: true, locked: false });
    // A passer-by at an unlocked app cannot take it over.
    expect(gate.setPin(null, '0000')).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(gate.setPin('1111', '0000')).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(gate.setEnabled(false)).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(gate.clearPin('9999')).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(gate.newRecoveryCode('')).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(gate.attempts().failures).toBe(FREE_ATTEMPTS);
    expect(s.value?.failures).toBe(FREE_ATTEMPTS);
    // Settings is no second guessing surface: the same backoff holds the right PIN too.
    const held = gate.setPin('2468', '1357', T0 + 1_000);
    expect(held).toMatchObject({ ok: false, error: 'wrong-pin' });
    expect(held.retryAfterMs).toBeGreaterThan(0);
    // After the wait, the current PIN works.
    const later = T0 + MAX_LOCKOUT_MS + 1;
    expect(gate.setPin('2468', '1357', later).ok).toBe(true);
    expect(gate.attempts().failures).toBe(0);
    expect(gate.verify('1357', undefined, later).ok).toBe(true);
    expect(gate.setEnabled(false, '1357', later).ok).toBe(true);
    expect(gate.clearPin('1357', later)).toMatchObject({ ok: true, status: { hasPin: false, enabled: false, hasRecovery: false } });
    expect(s.value).toMatchObject({ pinHash: '', enabled: false, recoveryHash: '' });
  });

  it('nothing about the PIN changes while locked', () => {
    const gate = createLockGate(memoryStore({ enabled: true, pinHash: hashPin('2468') }).store, undefined, () => T0);
    expect(gate.isLocked()).toBe(true);
    expect(gate.setPin('2468', '0000')).toMatchObject({ ok: false, error: 'locked' });
    expect(gate.clearPin('2468')).toMatchObject({ ok: false, error: 'locked' });
    expect(gate.setEnabled(false, '2468')).toMatchObject({ ok: false, error: 'locked' });
    expect(gate.setAutoLock({ idleMinutes: 0 })).toMatchObject({ ok: false, error: 'locked' });
    expect(gate.attempts().failures).toBe(0); // refused before any PIN was checked
  });

  it('the status every window can read never carries the recovery hash', () => {
    const gate = createLockGate(memoryStore(null).store, undefined, () => T0);
    gate.syncConfig({ enabled: false, pinHash: '' });
    gate.setPin(null, '2468');
    const status = gate.status() as unknown as Record<string, unknown>;
    expect(Object.keys(status).sort()).toEqual(['autoLock', 'enabled', 'hasPin', 'hasRecovery', 'locked', 'pinHash']);
    expect(JSON.stringify(status)).not.toContain(gate.record()!.recoveryHash!);
  });

  it('a renderer adopting a profile cannot plant a recovery code or auto-lock settings', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store, undefined, () => T0);
    gate.syncConfig({ enabled: true, pinHash: hashPin('1111'), recoveryHash: hashPin('0000'), autoLock: { idleMinutes: 5 } }, false);
    expect(s.value?.recoveryHash).toBe('');
    expect(gate.autoLock()).toEqual({ idleMinutes: 0, onSleep: false, onScreenLock: false });
  });
});

describe('lock3: recovery code', () => {
  const T0 = 4_000_000;

  it('is 80 bits of Crockford base32, and forgives case, dashes and look-alikes', () => {
    const code = generateRecoveryCode(Buffer.alloc(10, 0xff));
    expect(code).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    expect(normalizeRecoveryCode('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeRecoveryCode('o0il-1111-1111-1111')).toBe('0011111111111111');
    expect(normalizeRecoveryCode('short')).toBeNull();
    expect(normalizeRecoveryCode('UUUU-UUUU-UUUU-UUUU')).toBeNull(); // U is not in the alphabet
    const stored = hashRecoveryCode('ABCD-EFGH-JKMN-PQRS');
    expect(recoveryCodeMatches('abcd efgh jkmn pqrs', stored)).toBe(true);
    expect(recoveryCodeMatches('ABCD-EFGH-JKMN-PQRT', stored)).toBe(false);
  });

  it('unlocks a locked app once, removes the PIN, and is rate-limited like the PIN', () => {
    const { s, store } = memoryStore(null);
    const unlocks: boolean[] = [];
    const gate = createLockGate(store, (locked) => unlocks.push(locked), () => T0);
    gate.syncConfig({ enabled: false, pinHash: '' });
    const code = gate.setPin(null, '2468').recoveryCode!;
    gate.setEnabled(true);
    gate.lock();
    expect(gate.isLocked()).toBe(true);
    for (let i = 0; i < FREE_ATTEMPTS - 1; i += 1) expect(gate.recover('0000-0000-0000-0000').ok).toBe(false);
    const fifth = gate.recover('0000-0000-0000-0000');
    expect(fifth.retryAfterMs).toBe(BASE_LOCKOUT_MS);
    // Inside the wait even the right code is not checked.
    expect(gate.recover(code, T0 + 10).ok).toBe(false);
    expect(gate.isLocked()).toBe(true);
    const res = gate.recover(code.toLowerCase(), T0 + BASE_LOCKOUT_MS + 1);
    expect(res).toMatchObject({ ok: true, status: { locked: false, hasPin: false, enabled: false, hasRecovery: false } });
    expect(unlocks).toEqual([true, false]);
    expect(s.value).toMatchObject({ pinHash: '', recoveryHash: '', failures: 0 });
    // Spent.
    expect(gate.recover(code, T0 + BASE_LOCKOUT_MS + 2)).toMatchObject({ ok: false, error: 'no-recovery' });
  });

  it('a new recovery code needs the current PIN and retires the old one', () => {
    const gate = createLockGate(memoryStore(null).store, undefined, () => T0);
    gate.syncConfig({ enabled: false, pinHash: '' });
    const first = gate.setPin(null, '2468').recoveryCode!;
    // Changing the PIN keeps the code the person wrote down.
    expect(gate.setPin('2468', '1357').recoveryCode).toBeUndefined();
    const second = gate.newRecoveryCode('1357').recoveryCode!;
    expect(second).not.toBe(first);
    gate.lock();
    expect(gate.recover(first).ok).toBe(false);
    expect(gate.recover(second).ok).toBe(true);
  });
});

describe('lock3: clock changes', () => {
  it('the default clock is wall time at start plus monotonic time: a clock jump does not end a wait', () => {
    let wall = 50_000_000;
    let mono = 1_000;
    const clock = anchoredClock(() => wall, () => mono);
    expect(clock()).toBe(50_000_000);
    mono += 5_000;
    wall += 24 * 3_600_000; // someone moved the Windows clock a day ahead
    expect(clock()).toBe(50_005_000);
    wall -= 48 * 3_600_000; // ...and then a day back
    expect(clock()).toBe(50_005_000);
  });

  it('inside a session the backoff follows the anchored clock, not Date.now', () => {
    let mono = 0;
    const T0 = 70_000_000;
    const clock = anchoredClock(() => T0, () => mono);
    const gate = createLockGate(memoryStore({ enabled: true, pinHash: hashPin('2468') }).store, undefined, clock);
    for (let i = 0; i < FREE_ATTEMPTS; i += 1) gate.verify('1111');
    expect(gate.verify('2468').ok).toBe(false); // waiting
    mono += BASE_LOCKOUT_MS - 1_000;
    expect(gate.verify('2468').ok).toBe(false); // still waiting, whatever Date.now says
    mono += 2_000;
    expect(gate.verify('2468').ok).toBe(true);
  });
});

describe('lock3: auto-lock preferences live in main', () => {
  it('are normalized, refused while locked, and kept across a restart', () => {
    const { store } = memoryStore(null);
    const gate = createLockGate(store, undefined, () => 1);
    gate.syncConfig({ enabled: false, pinHash: '' });
    expect(gate.setAutoLock({ idleMinutes: 5, onSleep: true }).ok).toBe(true);
    expect(gate.setAutoLock({ idleMinutes: 7 }).ok).toBe(true); // not a choice: falls back to never
    expect(gate.autoLock()).toEqual({ idleMinutes: 0, onSleep: true, onScreenLock: false });
    expect(gate.setAutoLock({ onScreenLock: true, idleMinutes: 15 }).ok).toBe(true);
    expect(createLockGate(store, undefined, () => 2).autoLock()).toEqual({ idleMinutes: 15, onSleep: true, onScreenLock: true });
  });
});

describe('persisted attempt backoff (risk4)', () => {
  const T0 = 5_000_000;

  it('a restart is not a reset: the count and the deadline survive a new gate', () => {
    const { s, store } = memoryStore({ enabled: true, pinHash: hashPin('2468') });
    const first = createLockGate(store, undefined, () => T0);
    for (let i = 0; i < FREE_ATTEMPTS - 1; i += 1) expect(first.verify('1111', undefined, T0).ok).toBe(false);
    expect(s.value?.failures).toBe(FREE_ATTEMPTS - 1);
    // "Restart": a fresh gate over the same file gets no fresh free guesses.
    const second = createLockGate(store, undefined, () => T0);
    expect(second.attempts().failures).toBe(FREE_ATTEMPTS - 1);
    expect(second.verify('1111', undefined, T0).retryAfterMs).toBe(BASE_LOCKOUT_MS);
    expect(s.value?.lockedUntil).toBe(T0 + BASE_LOCKOUT_MS);
    const third = createLockGate(store, undefined, () => T0 + 1_000);
    const res = third.verify('2468', undefined, T0 + 1_000);
    expect(res.ok).toBe(false);
    expect(res.retryAfterMs).toBe(BASE_LOCKOUT_MS - 1_000);
    // After the wait, the right PIN works and the state is cleared on disk.
    expect(third.verify('2468', undefined, T0 + BASE_LOCKOUT_MS + 1).ok).toBe(true);
    expect(s.value).toMatchObject({ failures: 0, lockedUntil: 0, v: LOCK_RECORD_VERSION });
  });

  it('a damaged lock file starts locked at the ceiling', () => {
    const pinHash = hashPin('2468');
    const gate = createLockGate(
      { read: () => ({ enabled: true, pinHash }), write: () => undefined, damaged: () => true },
      undefined,
      () => T0,
    );
    expect(gate.isLocked()).toBe(true);
    expect(gate.attempts()).toEqual({ failures: CEILING_FAILURES, lockedUntil: T0 + MAX_LOCKOUT_MS });
    expect(gate.verify('2468', undefined, T0 + 10).retryAfterMs).toBe(MAX_LOCKOUT_MS - 10);
  });

  it('a store that throws on read is treated as damaged, not as empty', () => {
    const gate = createLockGate(
      {
        read: () => {
          throw new Error('EBUSY');
        },
        write: () => undefined,
      },
      undefined,
      () => T0,
    );
    expect(gate.attempts().failures).toBe(CEILING_FAILURES);
  });

  it('edited attempt fields are worth the ceiling; a pre-v2 record starts clean', () => {
    const pinHash = hashPin('1111');
    expect(attemptsFromRecord({ enabled: true, pinHash }, T0)).toEqual({ failures: 0, lockedUntil: 0 });
    for (const bad of [
      { v: 2, enabled: true, pinHash },
      { v: 2, enabled: true, pinHash, failures: -1, lockedUntil: 0 },
      { v: 2, enabled: true, pinHash, failures: 1.5, lockedUntil: 0 },
      { v: 2, enabled: true, pinHash, failures: 0, lockedUntil: 'soon' },
      { v: 99, enabled: true, pinHash, failures: 0, lockedUntil: 0 },
      { enabled: true, pinHash, failures: 0 },
    ]) {
      expect(attemptsFromRecord(bad, T0)).toEqual({ failures: CEILING_FAILURES, lockedUntil: T0 + MAX_LOCKOUT_MS });
    }
  });

  it('a deadline beyond the ceiling (clock moved back) is clamped to it', () => {
    const rec = { v: 2, enabled: true, pinHash: hashPin('1111'), failures: 7, lockedUntil: T0 + 10 * MAX_LOCKOUT_MS };
    expect(attemptsFromRecord(rec, T0).lockedUntil).toBe(T0 + MAX_LOCKOUT_MS);
    const step = checkPinAttempt('1111', rec.pinHash, { failures: 7, lockedUntil: T0 + 10 * MAX_LOCKOUT_MS }, T0);
    expect(step.result.retryAfterMs).toBe(MAX_LOCKOUT_MS);
  });

  it('the ceiling failure count really sits at the ceiling', () => {
    expect(lockoutMs(CEILING_FAILURES)).toBe(MAX_LOCKOUT_MS);
    expect(lockoutMs(CEILING_FAILURES - 1)).toBeLessThan(MAX_LOCKOUT_MS);
  });

  it('adopting while unlocked (a new PIN in Settings) starts clean', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store, undefined, () => T0);
    expect(gate.syncConfig({ enabled: true, pinHash: hashPin('1212') }, false)).toEqual({ ok: true, locked: false });
    expect(gate.attempts()).toEqual({ failures: 0, lockedUntil: 0 });
    expect(s.value?.failures).toBe(0);
  });
});