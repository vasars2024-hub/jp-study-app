/**
 * Liquid Workplace — the shared loading state.
 *
 * Replaces the per-host placeholders (`<div className="blanc-loading">Loading...</div>`
 * in App.tsx, the bare `seanime-host-state` paragraph in the Media workspace) with
 * one centred swirl, so a Suspense fallback reads the same in every shell.
 *
 * `layout` names the region the fallback stands in for. It only tunes how much
 * room the indicator claims (`study` sits on the dark player band, `reading` and
 * `library` on the work surface); the indicator itself is identical. All colour
 * comes from the shell's `--accent` / `--lq-*` tokens, so Study OS, Aero, Wired
 * and Blanc each paint it in their own ink.
 *
 * Accessibility: `role="status"` with a visible-to-AT label, and the swirl is
 * `aria-hidden` decoration. Under reduced motion it stops rotating and pulses
 * opacity instead (see `liquidLoading.css`).
 */
import { useT } from '../../i18n';
import './liquidLoading.css';

export type LiquidLoadingLayout = 'library' | 'study' | 'reading';

type LiquidLoadingProps = {
  layout?: LiquidLoadingLayout;
  /** Overrides the default "Loading…" label announced to assistive tech. */
  label?: string;
};

export function LiquidLoading({ layout = 'library', label }: LiquidLoadingProps) {
  const { t } = useT();
  const text = label ?? t('common.loading');
  return (
    <div className="lq-loading" data-layout={layout} role="status" aria-live="polite">
      <svg className="lq-loading__swirl" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="lq-loading__track" cx="24" cy="24" r="20" />
        <circle className="lq-loading__arc" cx="24" cy="24" r="20" />
        <circle className="lq-loading__arc lq-loading__arc--inner" cx="24" cy="24" r="12" />
      </svg>
      <span className="lq-loading__label">{text}</span>
    </div>
  );
}
