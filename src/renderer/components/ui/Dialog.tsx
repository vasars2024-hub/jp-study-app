/** Dialog — accessible modal (Escape to close, focus trap, labelled). Phase 1 · M5a. */
import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Close when the backdrop is clicked (default true). */
  dismissable?: boolean;
  className?: string;
}

export function Dialog({ open, onClose, title, children, footer, dismissable = true, className = '' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        // Minimal focus trap within the panel.
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-overlay anim-fade" onMouseDown={dismissable ? onClose : undefined}>
      <div
        ref={panelRef}
        className={['ui-dialog', 'anim-dialog', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="ui-dialog__head">
            <div className="ui-dialog__title" id={titleId}>
              {title}
            </div>
          </div>
        )}
        <div className="ui-dialog__body">{children}</div>
        {footer != null && <div className="ui-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

export default Dialog;
