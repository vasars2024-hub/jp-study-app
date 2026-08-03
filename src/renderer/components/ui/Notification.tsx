/** Notification — a persistent inline notice with optional actions. Phase 1 · M5b. */
import type { ReactNode } from 'react';
import type { ToastKind } from './Toast';

export interface NotificationProps {
  title?: ReactNode;
  children?: ReactNode;
  kind?: ToastKind;
  icon?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  dismissLabel?: string;
  className?: string;
}

export function Notification({ title, children, kind = 'default', icon, actions, onClose, dismissLabel, className = '' }: NotificationProps) {
  return (
    <div
      className={['ui-notification', kind !== 'default' ? `ui-notification--${kind}` : '', className]
        .filter(Boolean)
        .join(' ')}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {icon}
      <div className="ui-notification__body">
        {title != null && <div className="ui-notification__title">{title}</div>}
        {children != null && <div className="ui-notification__msg">{children}</div>}
        {actions != null && <div className="ui-notification__actions">{actions}</div>}
      </div>
      {onClose && (
        <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-focusable" aria-label={dismissLabel} onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}

export default Notification;
