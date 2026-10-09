import { useId, useState, type ReactNode } from 'react';

export default function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className = '',
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`collapse-section ${open ? 'is-open' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="collapse-header"
        aria-expanded={open}
        // The panel is unmounted while closed, so pointing at it then would
        // name an id that does not exist (an invalid idref).
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="collapse-chevron" aria-hidden />
        <span className="collapse-titles">
          <span className="collapse-title">{title}</span>
          {!open && summary && <span className="collapse-summary muted">{summary}</span>}
        </span>
      </button>
      {open && (
        <div className="collapse-body" id={panelId}>
          {children}
        </div>
      )}
    </section>
  );
}
