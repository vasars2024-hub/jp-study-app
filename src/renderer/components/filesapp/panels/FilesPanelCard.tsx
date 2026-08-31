/**
 * A card for the Files app's system panels — the Liquid-language counterpart of
 * `SettingsCard`.
 *
 * It exists rather than reusing `SettingsCard` for two reasons, both structural:
 *
 * 1. `SettingsCard` calls `useSettings()`, which **throws** outside
 *    `SettingsProvider`. The Files app is not a Settings host, and wrapping it
 *    in a fake controller so a card can read `advancedMode` would make the Files
 *    app depend on the very page gate 8 removes.
 * 2. Gate 8's search half needs an anchor: a search hit that used to scroll to
 *    `data-setting-id` must still land on the right card here. `data-panel-card-id`
 *    is that anchor, and `focused` drives the same scroll-into-view behaviour, so
 *    the hit lands on the row rather than merely on the app.
 *
 * Presentation is `--lq-*` tokens only (see `filesApp.css`'s note) — no literal
 * colour, and no `os-set-*` class, so nothing here inherits Settings chrome.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface FilesPanelCardProps {
  /**
   * The anchor id. Deliberately the SAME string the old settings registry used
   * (`system-memory`, `backup`, `factory-reset`, …) so a repointed search entry
   * needs no translation table between the two worlds.
   */
  id: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  children?: ReactNode;
  /** True when a search hit named this card. Scrolls it into view once. */
  focused?: boolean;
}

export function FilesPanelCard({
  id,
  title,
  description,
  trailing,
  children,
  focused,
}: FilesPanelCardProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!focused || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  return (
    <section
      ref={ref}
      className={`fa-panel-card${focused ? ' is-highlight' : ''}`}
      data-panel-card-id={id}
      aria-labelledby={titleId}
    >
      <header className="fa-panel-card-head">
        <div className="fa-panel-card-text">
          <h3 id={titleId} className="fa-panel-card-title">
            {title}
          </h3>
          {description ? <p className="fa-panel-card-desc">{description}</p> : null}
        </div>
        {trailing ? <div className="fa-panel-card-trailing">{trailing}</div> : null}
      </header>
      {children ? <div className="fa-panel-card-body">{children}</div> : null}
    </section>
  );
}

export default FilesPanelCard;
