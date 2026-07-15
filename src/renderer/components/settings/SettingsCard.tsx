import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useSettings } from './SettingsContext';

export default function SettingsCard({
  id,
  title,
  description,
  trailing,
  children,
  advanced,
  advancedLabel = 'Advanced',
  highlight,
  /** Hide this entire card unless Advanced Mode is on. */
  advancedOnly,
}: {
  id?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  children?: ReactNode;
  advanced?: ReactNode;
  advancedLabel?: string;
  highlight?: boolean;
  advancedOnly?: boolean;
}) {
  const { advancedMode } = useSettings();
  const [openAdv, setOpenAdv] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (advancedMode) setOpenAdv(true);
  }, [advancedMode]);

  useEffect(() => {
    if (!highlight || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlight]);

  if (advancedOnly && !advancedMode) return null;

  return (
    <section
      ref={ref}
      className={`os-set-card${highlight ? ' is-highlight' : ''}${advancedOnly ? ' os-set-card-adv' : ''}`}
      data-setting-id={id}
      aria-labelledby={titleId}
    >
      <header className="os-set-card-head">
        <div className="os-set-card-text">
          <h3 id={titleId} className="os-set-card-title">
            {title}
            {advancedOnly && <span className="os-set-adv-badge">Advanced</span>}
          </h3>
          {description && <p className="os-set-card-desc muted">{description}</p>}
        </div>
        {trailing && <div className="os-set-card-trailing">{trailing}</div>}
      </header>
      {children && <div className="os-set-card-body">{children}</div>}
      {advanced && advancedMode && (
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
      {advanced && !advancedMode && (
        <p className="muted os-set-card-adv-hint">Turn on Advanced in the left rail to edit more options here.</p>
      )}
    </section>
  );
}
