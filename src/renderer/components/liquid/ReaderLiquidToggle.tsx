import { useT } from '../../i18n';

/**
 * Liquid Workplace — L3.2. The Make Liquid / Return to standard affordance, in
 * the reader's own bar.
 *
 * The floating window carries this control as `.fwin-b-liquid` and the pop-out
 * as `.popout-btn-liquid`; both inline it because each has exactly one call
 * site. The reader has TWO — Novels and manga — and they are separate 2,000-line
 * components, so a shared control is what keeps the enable flow and its disable
 * path from drifting apart between them. It reuses the other two hosts' strings
 * and their `aria-pressed` contract for the same reason.
 *
 * `reader-btn-liquid` joins the shared state rule in `theme/liquid-window.css`
 * rather than restating it: the 16% accent fill there is a measured contrast
 * result against a chrome ground, and `.reader-bar` uses `var(--sidebar)` — the
 * same ground `.fwin-bar` and `.popout-bar` do.
 */
export default function ReaderLiquidToggle({
  liquid,
  onToggle,
}: {
  liquid: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  const label = liquid ? t('desktop.returnToStandard') : t('desktop.makeLiquid');
  return (
    <button
      type="button"
      className={`btn small reader-btn-liquid ${liquid ? 'is-liquid' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={liquid}
      onClick={onToggle}
    >
      {liquid ? '◆' : '◇'}
    </button>
  );
}
