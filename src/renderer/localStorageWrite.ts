/**
 * localStorage writes that surface failures instead of failing silently.
 * Appearance / living-environment prefs were being lost across restarts when
 * setItem threw (quota) while the in-session UI still looked updated.
 */

import { t } from './i18n';

let lastToastAt = 0;
const TOAST_COOLDOWN_MS = 4000;

function notifyWriteFailed(): void {
  const now = Date.now();
  if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
  lastToastAt = now;
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

/** Persist a string; returns false when the write did not land. */
export function writeLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    notifyWriteFailed();
    return false;
  }
}

/** Persist JSON; returns false when the write did not land. */
export function writeLocalStorageJson(key: string, value: unknown): boolean {
  try {
    return writeLocalStorage(key, JSON.stringify(value));
  } catch {
    notifyWriteFailed();
    return false;
  }
}
