// The panel every Scraper page is built from.
//
// Not settings/SettingsCard — that one calls useSettings() and throws outside
// SettingsProvider, so it cannot be reused here.

import type { ReactNode } from 'react';
import StatusDot from './StatusDot';

export default function ScrCard({
  id,
  title,
  description,
  /** Feature id for the build-status dot; omit to hide the dot. */
  statusId,
  trailing,
  className = '',
  bodyClassName = '',
  children,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  statusId?: string;
  trailing?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`scr-card ${className}`} data-scr-card={id}>
      {(title || trailing) && (
        <header className="scr-card-head">
          <div className="scr-card-heading">
            <h3 className="scr-card-title">
              {title}
              {statusId && <StatusDot id={statusId} className="scr-card-dot" />}
            </h3>
            {description && <p className="scr-card-desc">{description}</p>}
          </div>
          {trailing && <div className="scr-card-trailing">{trailing}</div>}
        </header>
      )}
      <div className={`scr-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
