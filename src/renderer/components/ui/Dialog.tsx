/** Dialog — accessible modal (Escape to close, focus trap, labelled). Phase 1 · M5a. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { trapTab } from './focusTrap';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Close when the backdrop is clicked or Escape is pressed (default true). A
   * non-dismissable dialog closes only through its own buttons: Escape is
   * consumed (so nothing behind it reacts) but does not close it (risk4).
   */
  dismissable?: boolean;
  className?: string;
}

/**
 * Open dialogs, oldest first (risk4). Every dialog listens on `document`, so
 * with two open (a confirm over a settings dialog) one Escape used to close
 * both, and Tab was trapped by whichever registered last. Only the top-most
 * dialog handles keys now.
 */
const openDialogs: symbol[] = [];

/** How many dialogs are open (tests). */
export function openDialogCountForTests(): number {
  return openDialogs.length;
}

export function Dialog({ open, onClose, title, children, footer, dismissable = true, className = '' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // a11y3: held in a ref. Callers pass an inline arrow, and with onClose as a
  // dependency every parent re-render re-ran the effect: its cleanup bounced
  // focus to the opener and the re-run pulled it back to the panel, so a user
  // typing in a field inside the dialog lost their place on every re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    openDialogs.push(token);
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A dialog under another one is inert to the keyboard.
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!dismissableRef.current) {
          e.preventDefault();
          return;
        }
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        trapTab(e, panelRef.current);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = openDialogs.indexOf(token);
      if (at >= 0) openDialogs.splice(at, 1);
      if (prev?.isConnected) prev.focus();
    };
  }, [open]);

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
