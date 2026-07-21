/**
 * Notification Center (Phase 2 · M6) — a bottom-right glass flyout listing the
 * persistent notification history (notificationStore). Toggled by the taskbar
 * bell via the `shell:toggleNotifications` event. Escape / backdrop closes;
 * opening marks all read.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import { Notification, Toggle, useWiredMaterials } from '../ui';
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
import { openExtensionSettings } from '../../extensionBridgeUi';
import { useT } from '../../i18n';

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
  const { t } = useT();
  const wired = useWiredMaterials();
  const [open, setOpen] = useState(false);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const panelRef = useRef<HTMLElement>(null);
  // Wired teletype dismiss (§4): scan-collapse the entry, then archive it.
  const [closingIds, setClosingIds] = useState<ReadonlySet<number>>(new Set());
  const dismissEntry = (id: number) => {
    if (!wired || closingIds.has(id)) {
      dismiss(id);
      return;
    }
    setClosingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      dismiss(id);
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  };

  useEffect(() => onNotificationsChanged(force), []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    markAllRead();
    panelRef.current?.focus();
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
      <aside ref={panelRef} tabIndex={-1} className="os-flyout os-flyout--notifications anim-slide-up" role="dialog" aria-label={t('notifications.title')}>
        <header className="os-flyout-head">
          <span className="os-flyout-title">{t('notifications.title')}</span>
          <span className="os-flyout-spacer" />
          <Toggle
            checked={isDnd()}
            onChange={(e) => setDnd(e.currentTarget.checked)}
            label={t('notifications.quiet')}
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
            <div className="os-notif-empty type-body">{wired ? 'BULLETIN CHANNEL EMPTY / NO DISPATCHES' : t('notifications.empty')}</div>
          ) : (
            items.map((n) => (
              <div key={n.id} className={closingIds.has(n.id) ? 'wired-notif-closing' : undefined}>
              <Notification title={n.title} kind={uiKind(n.kind)} onClose={() => dismissEntry(n.id)}>
                {wired && (
                  <div className="wired-notif-meta">
                    <span>{`TX-${String(n.id % 10000).padStart(4, '0')}`}</span>
                    <span>{n.source ?? 'NODE'}</span>
                    <span>{n.priority?.toUpperCase() ?? 'NORMAL'}</span>
                    <span>
                      {n.kind === 'error'
                        ? 'RED'
                        : n.kind === 'warning'
                          ? 'AMBER'
                          : 'BLUE'}
                    </span>
                  </div>
                )}
                <span>{n.message}</span>
                <div className="os-notif-time type-status">{wired ? new Date(n.ts).toLocaleTimeString() : timeAgo(n.ts)}</div>
                {n.actionUrl || n.clientAction === 'extension-settings' ? (
                  <div className="os-notif-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm ui-focusable"
                      onClick={() => {
                        if (n.clientAction === 'extension-settings') {
                          openExtensionSettings();
                          setOpen(false);
                          return;
                        }
                        if (n.actionUrl) void window.api.openExternal(n.actionUrl);
                      }}
                    >
                      {n.clientAction === 'extension-settings'
                        ? t('notifications.openExtensionSettings')
                        : t('notifications.openLink')}
                    </button>
                  </div>
                ) : null}
              </Notification>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
