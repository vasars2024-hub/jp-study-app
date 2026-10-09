/**
 * The lock screen's half of main's lock gate (main/lockGuard.ts): when main
 * refuses a shortcut, a tray row or an extension request because Gum is locked,
 * it sends `lockscreen:blocked` to the visible lock surfaces and this turns it
 * into a toast. Mounted by every PIN pad (Study OS, the floating widget, Blanc).
 */
import { useEffect } from 'react';
import { t } from './i18n';
import { showOsToast } from './components/ToastHost';

const KEY_BY_KIND: Record<string, string> = {
  command: 'lock2.blocked.command',
  tray: 'lock2.blocked.command',
  extension: 'lock2.blocked.extension',
  window: 'lock2.blocked.window',
};

export function lockBlockedMessage(kind: string): string {
  return t(KEY_BY_KIND[kind] ?? 'lock2.blocked.window');
}

export function useLockBlockedToasts(): void {
  useEffect(() => {
    const subscribe = typeof window !== 'undefined' ? window.api?.onLockscreenBlocked : undefined;
    if (!subscribe) return undefined;
    return subscribe((notice) => showOsToast(lockBlockedMessage(notice?.kind ?? ''), 'warn'));
  }, []);
}
