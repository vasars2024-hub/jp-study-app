// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: () => undefined } }));

import {
  BASE_LOCKOUT_MS,
  createLockGate,
  FREE_ATTEMPTS,
  hashPin,
  isScryptPinHash,
  lockoutMs,
  MAX_LOCKOUT_MS,
  pinMatches,
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
    const res = gate.verify('1357');
    expect(res.ok).toBe(true);
    expect(isScryptPinHash(s.value!.pinHash)).toBe(true);
    expect(pinMatches('1357', s.value!.pinHash)).toBe(true);
  });

  it('a first verify adopts the renderer value when main has no record', () => {
    const { s, store } = memoryStore(null);
    const gate = createLockGate(store);
    const stored = hashPin('9999');
    expect(gate.verify('9999', stored).ok).toBe(true);
    expect(s.value?.pinHash).toBe(stored);
    // Adopted once: a different renderer value is not taken over afterwards.
    gate.lock();
    expect(gate.verify('0000', hashPin('0000')).ok).toBe(false);
  });

  it('settings changes apply while unlocked; lock() re-arms only with a PIN', () => {
    const { s, store } = memoryStore({ enabled: false, pinHash: '' });
    const gate = createLockGate(store);
    expect(gate.lock()).toBe(false);
    const h = hashPin('1111');
    expect(gate.syncConfig({ enabled: true, pinHash: h }).ok).toBe(true);
    expect(s.value).toEqual({ enabled: true, pinHash: h });
    expect(gate.isLocked()).toBe(false); // enabling does not lock this session
    expect(gate.lock()).toBe(true);
    // Garbage is never stored as a PIN.
    expect(createLockGate(memoryStore({ enabled: true, pinHash: 'nope' }).store).isLocked()).toBe(false);
  });
});