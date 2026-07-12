/**
 * Notification Center (Phase 2 · M6) — a bottom-right glass flyout listing the
 * persistent notification history (notificationStore). Toggled by the taskbar
 * bell via the `shell:toggleNotifications` event. Escape / backdrop closes;
 * opening marks all read.
 */
import { useEffect, useReducer, useState } from 'react';
import { Notification, Toggle } from '../ui';
import {
  clearAll,
  dismiss,
  getNotifications,
  isDnd,
  markAllRead,
  onNotificationsChanged,
  setDnd,
  type NotificationKind,
} from '../../notificationStore';

const TOGGLE_EVENT = 'shell:toggleNotifications';

function uiKind(k: NotificationKind): 'default' | 'success' | 'warning' | 'error' {
  return k === 'info' ? 'default' : k;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => onNotificationsChanged(force), []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    markAllRead();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  const items = getNotifications();

  return (
    <>
      <div className="os-panel-backdrop" onMouseDown={() => setOpen(false)} />
      <aside className="os-flyout anim-slide-up" role="dialog" aria-label="Notifications">
        <header className="os-flyout-head">
          <span className="os-flyout-title">Notifications</span>
          <span className="os-flyout-spacer" />
          <Toggle
            checked={isDnd()}
            onChange={(e) => setDnd(e.currentTarget.checked)}
            label="Do Not Disturb"
          />
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost ui-focusable"
            onClick={clearAll}
            disabled={items.length === 0}
          >
            Clear all
          </button>
        </header>
        <div className="os-flyout-body">
          {items.length === 0 ? (
            <div className="os-notif-empty type-body">You're all caught up.</div>
          ) : (
            items.map((n) => (
              <Notification key={n.id} title={n.title} kind={uiKind(n.kind)} onClose={() => dismiss(n.id)}>
                {n.message}
                <div className="os-notif-time type-status">{timeAgo(n.ts)}</div>
              </Notification>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
