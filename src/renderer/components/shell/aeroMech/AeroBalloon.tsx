/**
 * A notification-area balloon tip: a rounded glass bubble above the tray with
 * a tail pointing at it, a title with an info glyph, a close box and up to two
 * actions. It times out on its own (as balloons did), but never while the
 * pointer rests on it.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../../../i18n';

export interface AeroBalloonAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface AeroBalloonProps {
  title: string;
  icon: 'info' | 'shield';
  children: ReactNode;
  actions: AeroBalloonAction[];
  /** Distance from the desk's bottom edge (the taskbar height + a gap). */
  bottom: number;
  onClose: () => void;
  /** Click on the body itself (the classic "Click here to…"). */
  onBodyClick?: () => void;
  timeoutMs?: number;
}

export default function AeroBalloon({
  title,
  icon,
  children,
  actions,
  bottom,
  onClose,
  onBodyClick,
  timeoutMs = 14_000,
}: AeroBalloonProps) {
  const { t } = useT();
  const hovering = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let left = timeoutMs;
    const id = window.setInterval(() => {
      if (hovering.current || document.hidden) return;
      left -= 500;
      if (left <= 0) closeRef.current();
    }, 500);
    return () => window.clearInterval(id);
  }, [timeoutMs]);

  return (
    <div
      className="aero-mech-balloon"
      role="status"
      aria-live="polite"
      style={{ bottom }}
      onPointerEnter={() => {
        hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
      }}
    >
      <div className="aero-mech-balloon-head">
        <span className={`aero-mech-balloon-icon is-${icon}`} aria-hidden="true" />
        <strong>{title}</strong>
        <button
          type="button"
          className="aero-mech-balloon-close"
          onClick={onClose}
          title={t('aeroMech.balloon.close')}
          aria-label={t('aeroMech.balloon.close')}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {onBodyClick ? (
        <button type="button" className="aero-mech-balloon-body is-link" onClick={onBodyClick}>
          {children}
        </button>
      ) : (
        <div className="aero-mech-balloon-body">{children}</div>
      )}
      {actions.length > 0 && (
        <div className="aero-mech-balloon-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`aero-mech-btn${action.primary ? ' is-default' : ''}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
