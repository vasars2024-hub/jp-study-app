/** Sheet — edge-anchored slide-over panel (Escape/backdrop to close). Phase 1 · M5b. */
import { useEffect, useId, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: 'right' | 'left' | 'bottom';
  title?: ReactNode;
  children: ReactNode;
  dismissable?: boolean;
  className?: string;
}

export function Sheet({ open, onClose, side = 'right', title, children, dismissable = true, className = '' }: SheetProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const anim = side === 'left' ? 'anim-slide-right' : side === 'bottom' ? 'anim-slide-up' : 'anim-slide-left';

  return (
    <div className="ui-overlay anim-fade" onMouseDown={dismissable ? onClose : undefined}>
      <div
        className={['ui-sheet', `ui-sheet--${side}`, anim, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="ui-dialog__head">
            <div className="ui-dialog__title" id={titleId}>
              {title}
            </div>
          </div>
        )}
        <div className="ui-dialog__body" style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Sheet;
