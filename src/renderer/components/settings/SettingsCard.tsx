import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export default function SettingsCard({
  id,
  title,
  description,
  trailing,
  children,
  advanced,
  advancedLabel = 'Advanced',
  highlight,
}: {
  id?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  children?: ReactNode;
  advanced?: ReactNode;
  advancedLabel?: string;
  highlight?: boolean;
}) {
  const [openAdv, setOpenAdv] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!highlight || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlight]);

  return (
    <section
      ref={ref}
      className={`os-set-card${highlight ? ' is-highlight' : ''}`}
      data-setting-id={id}
      aria-labelledby={titleId}
    >
      <header className="os-set-card-head">
        <div className="os-set-card-text">
          <h3 id={titleId} className="os-set-card-title">
            {title}
          </h3>
          {description && <p className="os-set-card-desc muted">{description}</p>}
        </div>
        {trailing && <div className="os-set-card-trailing">{trailing}</div>}
      </header>
      {children && <div className="os-set-card-body">{children}</div>}
      {advanced && (
        <div className="os-set-card-advanced">
          <button
            type="button"
            className="os-set-card-advanced-toggle"
            aria-expanded={openAdv}
            onClick={() => setOpenAdv((o) => !o)}
          >
            {openAdv ? 'Hide' : 'Show'} {advancedLabel}
          </button>
          {openAdv && <div className="os-set-card-advanced-body">{advanced}</div>}
        </div>
      )}
    </section>
  );
}
