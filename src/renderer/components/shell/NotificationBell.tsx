/**
 * NotificationBell (Phase 2 · M3) — the taskbar tray bell. Self-manages its
 * unread badge from the notification store and toggles the Notification Center
 * via `shell:toggleNotifications`. Dropped into the shell's `.os-tray`.
 */
import { useEffect, useReducer } from 'react';
import { isDnd, onNotificationsChanged, unreadCount } from '../../notificationStore';

export default function NotificationBell() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onNotificationsChanged(force), []);

  const count = unreadCount();
  const showBadge = count > 0 && !isDnd();

  return (
    <button
      type="button"
      className="os-tray-btn os-tray-btn-bell"
      title="Notifications"
      aria-label={showBadge ? `Notifications, ${count} unread` : 'Notifications'}
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
