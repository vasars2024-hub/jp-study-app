/** Progress — determinate or indeterminate bar. Phase 1 · M5a. */
import type { HTMLAttributes } from 'react';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–1. Omit for an indeterminate bar. */
  value?: number;
}

export function Progress({ value, className = '', ...rest }: ProgressProps) {
  const indeterminate = value == null;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={['ui-progress', indeterminate ? 'ui-progress--indeterminate' : '', className].filter(Boolean).join(' ')}
      role="progressbar"
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
