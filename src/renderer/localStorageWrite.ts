/**
 * localStorage writes that surface failures instead of failing silently.
 * Appearance / living-environment prefs were being lost across restarts when
 * setItem threw (quota) while the in-session UI still looked updated.
 *
 * **Audit item 5.7's hardening lives here.** 5.7 was "the Scraper and other new
 * features don't remember", and the cause was that `localStorage` had filled to
 * 51.62 MB, so writes were being refused. The reason nobody could see it: a
 * refused write raises `QuotaExceededError`, and across the renderer that
 * exception is caught and dropped at the overwhelming majority of call sites —
 * 50 of them with a comment naming quota explicitly. No exception, no log, no UI
 * signal; the value simply is not there next time, and it reads as "memory
 * problems" spread across unrelated features rather than as one storage fault.
 *
 * So a failure through this module now leaves three traces instead of one:
 *
 * 1. the toast it always raised, throttled;
 * 2. a `logBlanc` entry carrying the key, its size, and the **whole-store
 *    footprint measured at the moment of failure** — which is the number that
 *    turns "a write failed" into "the store is full, and here is what is in it";
 * 3. `getLastStorageWriteFailure()`, so a settings surface can show it after the
 *    toast has gone.
 *
 * Measuring costs a pass over every key, so it shares the toast's cooldown: a
 * storm of failures produces one diagnostic, not one per write.
 */

import { logBlanc } from './blancConsole';
import { t } from './i18n';
import {
  entryBytes,
  isQuotaExceededError,
  measureStorage,
  type StorageFootprint,
} from '../shared/storageHealth';

let lastToastAt = 0;
const TOAST_COOLDOWN_MS = 4000;

/** Why a value did not persist. `serialize` never reached storage at all. */
export type StorageWriteFailureKind = 'quota' | 'serialize' | 'other';

export interface StorageWriteFailure {
  key: string;
  kind: StorageWriteFailureKind;
  /** UTF-16 bytes the write would have added. 0 when serialization failed. */
  bytes: number;
  at: number;
  /** The store as measured at failure time, or null when the cooldown skipped it. */
  footprint: StorageFootprint | null;
}

let lastFailure: StorageWriteFailure | null = null;

/** The most recent write that did not land, or null since the last clear. */
export function getLastStorageWriteFailure(): StorageWriteFailure | null {
  return lastFailure;
}

export function clearLastStorageWriteFailure(): void {
  lastFailure = null;
}

function measureNow(): StorageFootprint | null {
  try {
    return measureStorage(localStorage);
  } catch {
    // No storage to measure is itself a failure mode; do not mask the original.
    return null;
  }
}

function notifyWriteFailed(): void {
  try {
    window.dispatchEvent(
      new CustomEvent('os:toast', {
        detail: { message: t('settings.memory.writeFailed'), kind: 'err' },
      }),
    );
  } catch {
    /* no window / toast host yet */
  }
}

function recordFailure(key: string, kind: StorageWriteFailureKind, bytes: number): void {
  const now = Date.now();
  const diagnose = now - lastToastAt >= TOAST_COOLDOWN_MS;

  // A value that would not serialize never reached the store, so measuring the
  // store would attach a number that has nothing to do with the failure.
  const footprint = diagnose && kind !== 'serialize' ? measureNow() : null;
  lastFailure = { key, kind, bytes, at: now, footprint };

  if (!diagnose) return;
  lastToastAt = now;

  logBlanc(
    'error',
    'system',
    kind === 'serialize'
      ? `Could not serialize "${key}"; nothing was written`
      : `localStorage write of "${key}" was refused (${kind})`,
    {
      key,
      kind,
      bytes,
      totalBytes: footprint?.totalBytes ?? null,
      keyCount: footprint?.keyCount ?? null,
      largest: footprint?.largest.slice(0, 5) ?? null,
    },
  );
  notifyWriteFailed();
}

/** Persist a string; returns false when the write did not land. */
export function writeLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    recordFailure(key, isQuotaExceededError(err) ? 'quota' : 'other', entryBytes(key, value));
    return false;
  }
}

/** Persist JSON; returns false when the write did not land. */
export function writeLocalStorageJson(key: string, value: unknown): boolean {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    // A circular or unserializable value is not a storage problem, and calling
    // it one sends the next reader to look at a store that is fine.
    recordFailure(key, 'serialize', 0);
    return false;
  }
  return writeLocalStorage(key, text);
}
