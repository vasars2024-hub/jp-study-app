import { useEffect, useId, useState } from 'react';
import Icon from './Icons';

type Props = {
  title: string;
  children: React.ReactNode;
};

/** Compact ? button that opens a short explanation popover. */
export default function FieldHint({ title, children }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span className="field-hint-anchor">
      <button
        type="button"
        className="field-hint-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Explain: ${title}`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <>
          <button
            type="button"
            className="field-hint-backdrop"
            aria-label="Close explanation"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            className="field-hint-panel"
            role="dialog"
            aria-labelledby={`${panelId}-title`}
          >
            <div className="field-hint-panel-head">
              <strong id={`${panelId}-title`}>{title}</strong>
              <button
                type="button"
                className="field-hint-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="field-hint-body">{children}</div>
          </div>
        </>
      )}
    </span>
  );
}
