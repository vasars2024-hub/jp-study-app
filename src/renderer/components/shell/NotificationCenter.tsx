/**
 * Notification Center (Phase 2 · M6) — a bottom-right glass flyout listing the
 * persistent notification history (notificationStore). Toggled by the taskbar
 * bell via the `shell:toggleNotifications` event. Escape / backdrop closes;
 * opening marks all read.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { openExtensionSettings, openShortcutSettings } from '../../extensionBridgeUi';
import { openSectionSurface } from '../../sectionSurface';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useFocusReturn } from './focusReturn';

const TOGGLE_EVENT = 'shell:toggleNotifications';

function uiKind(k: NotificationKind): 'default' | 'success' | 'warning' | 'error' {
  return k === 'info' ? 'default' : k;
}

function useTimeAgo() {
  const { t, lang } = useT();
  return useCallback(
    (ts: number) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return t('notifications.time.justNow');
      const m = Math.floor(s / 60);
      if (m < 60) return t('notifications.time.minutes', { count: m });
      const h = Math.floor(m / 60);
      if (h < 24) return t('notifications.time.hours', { count: h });
      return t('notifications.time.days', { count: Math.floor(h / 24) });
    },
    // t is identity-stable by design (useT wraps it in useCallback([]));
    // depending on lang forces recompute when the user switches language.
    [lang]
  );
}

export default function NotificationCenter() {
  const { t, lang } = useT();
  const wired = useWiredMaterials();
  const timeAgo = useTimeAgo();
  const [open, setOpen] = useState(false);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const panelRef = useRef<HTMLElement>(null);
  // Wired teletype dismiss (§4): scan-collapse the entry, then archive it.
  const [closingIds, setClosingIds] = useState<ReadonlySet<number>>(new Set());
  // Track pending dismiss timers for cleanup on unmount.
  const dismissTimers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of dismissTimers.current) window.clearTimeout(id);
      dismissTimers.current = [];
    };
  }, []);

  const dismissEntry = useCallback(
    (id: number) => {
      if (!wired || closingIds.has(id)) {
        dismiss(id);
        return;
      }
      setClosingIds((prev) => new Set(prev).add(id));
      const timer = window.setTimeout(() => {
        dismiss(id);
        setClosingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        dismissTimers.current = dismissTimers.current.filter((t) => t !== timer);
      }, 200);
      dismissTimers.current.push(timer);
    },
    [wired, closingIds]
  );

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

  // Same hand-back as Quick Settings (round-2 audit K7): Escape used to leave focus
  // on <body>. Back to the opener, or to the bell when the opener is gone.
  useFocusReturn(open, panelRef, () =>
    document.querySelector<HTMLElement>('[data-shell-opener="notifications"]'),
  );

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
            {t('notifications.clearAll')}
          </button>
        </header>
        <div className="os-flyout-body" role="log" aria-label={t('notifications.listLabel')}>
          {items.length === 0 ? (
            <div className="os-notif-empty type-body">{wired ? t('wired.bulletin.empty') : t('notifications.empty')}</div>
          ) : (
            items.map((n) => {
              // A notice posted with catalog keys follows the live language; the
              // stored text is only the fallback for entries without them.
              const title = n.i18n?.title ? t(n.i18n.title, n.i18n.vars) : n.title;
              const message = n.i18n ? t(n.i18n.message, n.i18n.vars) : n.message;
              return (
              <div key={n.id} className={closingIds.has(n.id) ? 'wired-notif-closing' : undefined}>
              <Notification
                title={title}
                kind={uiKind(n.kind)}
                // Named by what it dismisses. Every row's ✕ announced the bare
                // word "Dismiss", so a screen reader walking a list of five
                // notifications heard the same button five times and had no way
                // to tell which one it was about to throw away (D152). Same
                // idiom the taskbar already uses for `desktop.task.close`.
                //
                // `title` is OPTIONAL on a notification and the app's own
                // entries mostly omit it — the first live check of this fix read
                // the accessible name as the literal "Dismiss: {title}", because
                // `interpolate` leaves a placeholder standing when its value is
                // undefined (`i18n/core.ts:83`). The message is the row's real
                // identity; the bare word is the last resort, not the first.
                dismissLabel={
                  title || message
                    ? t('notifications.dismissNamed', { title: title || message })
                    : t('notifications.dismiss')
                }
                onClose={() => dismissEntry(n.id)}
              >
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
                <span>{message}</span>
                <div className="os-notif-time type-status">{wired ? new Date(n.ts).toLocaleTimeString(LANG_TAGS[lang]) : timeAgo(n.ts)}</div>
                {n.actionUrl || n.clientAction ? (
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
                        if (n.clientAction === 'open-calendar') {
                          openSectionSurface('calendar');
                          setOpen(false);
                          return;
                        }
                        if (n.clientAction === 'open-shortcuts') {
                          openShortcutSettings();
                          setOpen(false);
                          return;
                        }
                        if (n.actionUrl) void window.api.openExternal(n.actionUrl);
                      }}
                    >
                      {n.clientAction === 'extension-settings'
                        ? t('notifications.openExtensionSettings')
                        : n.clientAction === 'open-calendar'
                          ? t('calendar.reminder.open')
                          : n.clientAction === 'open-shortcuts'
                            ? t('shortcut.notice.refused.open')
                            : t('notifications.openLink')}
                    </button>
                  </div>
                ) : null}
              </Notification>
              </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
