import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { useT } from '../../i18n';

/** The ancestor that would actually move if this card were scrolled to. */
function nearestScroller(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const overflowY = getComputedStyle(n).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      return n;
    }
  }
  return null;
}

export default function SettingsCard({
  id,
  title,
  description,
  trailing,
  children,
  advanced,
  /** Defaults to the translated "Advanced" label; resolved at render, not in
      the default parameter, since `t` isn't available at that point. */
  advancedLabel,
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
  const { advancedMode, focusSettingId } = useSettings();
  const { t } = useT();
  // A card with an `id` anchors itself: settings search navigates by
  // `SettingsRegistryEntry.id`, and every registry id is meant to name a card.
  // Deriving it here means a searchable setting lands on its own card without
  // each page repeating `highlight={focusSettingId === '...'}` — the drift this
  // gate exists to catch. ORed, never defaulted, so the ~109 explicit call sites
  // keep working and a card that highlights on some *other* id keeps doing so.
  const focused = Boolean(highlight) || (id != null && focusSettingId === id);
  const advLabel = advancedLabel ?? t('settings.nav.advanced');
  const [openAdv, setOpenAdv] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (advancedMode) setOpenAdv(true);
  }, [advancedMode]);

  useEffect(() => {
    if (!focused || !ref.current) return undefined;
    const el = ref.current;
    const scroller = nearestScroller(el);
    const before = scroller ? scroller.scrollTop : window.scrollY;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // A smooth scroll is a REQUEST, not a guarantee, and here it is refused.
    // Measured live 2026-08-31 in this Electron renderer with OS reduced-motion
    // off: `behavior: 'smooth'` moved this pane 0 px while the identical `auto`
    // call moved it 7,233 px, and a freshly created plain scroller in the same
    // document ignored smooth too — so it is the environment, not this pane.
    // The cost was invisible and total: a card reached from settings search or
    // the command palette stayed ~7,400 px below the fold for the whole 2.2 s
    // its highlight lasts, which is indistinguishable from the search having
    // dumped you at the top of the page.
    //
    // So: ask for smooth, then check. Only if the SCROLLER has not moved at all
    // AND the card is still entirely out of view does this land it outright — a
    // smooth scroll that is working has always moved by now and is left alone
    // to finish. The scroller is what gets compared, not the card's own rect:
    // the first attempt tested `rect.top` and never fired, because the page was
    // still settling and shifted the card 19 px on its own.
    const settle = window.setTimeout(() => {
      const now = scroller ? scroller.scrollTop : window.scrollY;
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom <= 0 || r.top >= window.innerHeight;
      if (offscreen && now === before) el.scrollIntoView({ block: 'nearest' });
    }, 300);
    return () => window.clearTimeout(settle);
  }, [focused]);

  if (advancedOnly && !advancedMode) return null;

  return (
    <section
      ref={ref}
      className={`os-set-card${focused ? ' is-highlight' : ''}${advancedOnly ? ' os-set-card-adv' : ''}`}
      data-setting-id={id}
      aria-labelledby={titleId}
    >
      <header className="os-set-card-head">
        <div className="os-set-card-text">
          <h3 id={titleId} className="os-set-card-title">
            {title}
            {advancedOnly && (
              <span className="os-set-adv-badge">{t('settings.card.advancedBadge')}</span>
            )}
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
            {openAdv
              ? t('settings.card.hideAdvanced', { label: advLabel })
              : t('settings.card.showAdvanced', { label: advLabel })}
          </button>
          {openAdv && <div className="os-set-card-advanced-body">{advanced}</div>}
        </div>
      )}
      {advanced && !advancedMode && (
        <p className="muted os-set-card-adv-hint">{t('settings.card.advancedLocked')}</p>
      )}
    </section>
  );
}
