/**
 * NotificationBell (Phase 2 · M3) — the taskbar tray bell. Self-manages its
 * unread badge from the notification store and toggles the Notification Center
 * via `shell:toggleNotifications`. Dropped into the shell's `.os-tray`.
 */
import { useEffect, useReducer } from 'react';
import { isDnd, onNotificationsChanged, unreadCount } from '../../notificationStore';
import { useT } from '../../i18n';

export default function NotificationBell() {
  const { t } = useT();
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onNotificationsChanged(force), []);

  const count = unreadCount();
  const dnd = isDnd();
  const showBadge = count > 0 && !dnd;

  return (
    <button
      type="button"
      className="os-tray-btn os-tray-btn-bell"
      title={dnd ? t('notifications.title.dnd') : t('notifications.title')}
      aria-label={showBadge ? `${t('notifications.title')}, ${count}` : t('notifications.title')}
      // The bell opens the Notification Center, which owns its own open state, so this
      // declares the popup without claiming an expanded state it cannot read.
      aria-haspopup="dialog"
      data-shell-opener="notifications"
      onClick={() => window.dispatchEvent(new CustomEvent('shell:toggleNotifications'))}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {showBadge && <span className="os-tray-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
