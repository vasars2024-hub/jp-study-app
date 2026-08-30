// The panel every Scraper page is built from.
//
// Not settings/SettingsCard — that one calls useSettings() and throws outside
// SettingsProvider, so it cannot be reused here.

import { useEffect, useRef, type ReactNode } from 'react';
import StatusDot from './StatusDot';
import { useScraperFocusId } from './ScraperContext';

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
  // A card with an `id` anchors itself, matching settings/SettingsCard. Search
  // navigates by SCRAPER_REGISTRY id and every registry id names a card, so
  // deriving the highlight here means a searchable panel lands on itself rather
  // than dumping the user at the top of a page with eleven cards on it. Measured
  // before this existed: `navigate('profiles', 'profile-history')` scrolled
  // nowhere and highlighted 0 of 11.
  const focusId = useScraperFocusId();
  const focused = id != null && focusId === id;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  return (
    <section
      ref={ref}
      className={`scr-card ${className}${focused ? ' is-highlight' : ''}`}
      data-scr-card={id}
    >
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
