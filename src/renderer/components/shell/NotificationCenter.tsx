import { useEffect, useRef, useState } from 'react';
import {
  dismiss,
  getNotifications,
  markAllRead,
  markRead,
  onNotificationsChanged,
  setDnd,
  isDnd,
  type NotificationKind,
  type ShellNotification,
} from '../../notificationStore';
import { NOTIFICATION_TOGGLE_EVENT } from './NotificationBell';
import { useT } from '../../i18n';

function kindClass(kind: NotificationKind): string {
  if (kind === 'error') return 'os-notif-item--error';
  if (kind === 'warning') return 'os-notif-item--warning';
  if (kind === 'success') return 'os-notif-item--success';
  if (kind === 'info') return 'os-notif-item--info';
  return '';
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function NotificationRow({ item, onOpen }: { item: ShellNotification; onOpen: () => void }) {
  const { t } = useT();
  const open = async () => {
    markRead(item.id);
    if (item.actionUrl) {
      await window.api.openExternal(item.actionUrl);
    }
    onOpen();
  };

  return (
    <div className={`os-notif-item ${kindClass(item.kind)} ${item.read ? 'read' : ''}`}>
      <button type="button" className="os-notif-item-main" onClick={() => void open()}>
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <time>{formatWhen(item.createdAt)}</time>
      </button>
      <button type="button" className="os-notif-dismiss" title={t('notifications.dismiss')} onClick={() => dismiss(item.id)}>
        ×
      </button>
    </div>
  );
}

export default function NotificationCenter() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [dnd, setDndState] = useState(isDnd);
  const [, force] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => onNotificationsChanged(() => force((n) => n + 1)), []);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener(NOTIFICATION_TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(NOTIFICATION_TOGGLE_EVENT, toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!open) return null;

  const items = getNotifications();

  return (
    <div className="os-notif-backdrop">
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="os-notif-panel anim-slide-up"
        role="dialog"
        aria-label={t('notifications.title')}
      >
        <header className="os-notif-header">
          <span>{t('notifications.title')}</span>
          <div className="os-notif-header-actions">
            <label className="os-notif-dnd">
              <input
                type="checkbox"
                checked={dnd}
                onChange={(e) => {
                  setDnd(e.target.checked);
                  setDndState(e.target.checked);
                }}
              />
              <span>{t('notifications.quiet')}</span>
            </label>
            {items.length > 0 ? (
              <button type="button" className="os-notif-link" onClick={() => markAllRead()}>
                {t('notifications.markAllRead')}
              </button>
            ) : null}
          </div>
        </header>
        <div className="os-notif-list">
          {items.length === 0 ? (
            <p className="os-notif-empty">{t('notifications.empty')}</p>
          ) : (
            items.map((n) => (
              <NotificationRow key={n.id} item={n} onOpen={() => setOpen(false)} />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
