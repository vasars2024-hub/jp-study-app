/** Progress — determinate or indeterminate bar. Phase 1 · M5a. */
import type { HTMLAttributes } from 'react';
import { useT } from '../../i18n';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–1. Omit for an indeterminate bar. */
  value?: number;
}

export function Progress({ value, className = '', ...rest }: ProgressProps) {
  const { t } = useT();
  const indeterminate = value == null;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(1, value)) * 100;
  // a11y3: a progressbar must have an accessible name (axe aria-progressbar-name,
  // serious). Callers that know what is progressing pass `aria-label` or
  // `aria-labelledby`; the rest are at least announced as "Progress, 42%".
  const named = Boolean(rest['aria-label'] || rest['aria-labelledby']);
  return (
    <div
      className={['ui-progress', indeterminate ? 'ui-progress--indeterminate' : '', className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-label={named ? undefined : t('a11y3.progress')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      {...rest}
    >
      <div className="ui-progress__bar" style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

export default Progress;
