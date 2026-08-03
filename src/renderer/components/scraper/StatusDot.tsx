// Build-status indicator. Red / yellow / green, but never colour alone:
// the glyph differs per state (hollow ring / half-filled / solid + tick) so
// the meaning survives greyscale, colour-blindness and a themed accent.

import { statusOf, type FeatureStatus } from './featureStatus';
import { sx } from './strings';

const LABEL: Record<FeatureStatus, 'build.shell' | 'build.untested' | 'build.ready'> = {
  shell: 'build.shell',
  untested: 'build.untested',
  ready: 'build.ready',
};

const HINT: Record<FeatureStatus, 'build.shellHint' | 'build.untestedHint' | 'build.readyHint'> = {
  shell: 'build.shellHint',
  untested: 'build.untestedHint',
  ready: 'build.readyHint',
};

export function statusLabel(status: FeatureStatus): string {
  return sx(LABEL[status]);
}

export function statusHint(status: FeatureStatus): string {
  return sx(HINT[status]);
}

export default function StatusDot({
  id,
  status,
  size = 8,
  showLabel = false,
  className = '',
}: {
  /** Feature id to look up. Ignored when `status` is passed directly. */
  id?: string;
  status?: FeatureStatus;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const resolved: FeatureStatus = status ?? statusOf(id ?? '');
  const label = statusLabel(resolved);
  const hint = statusHint(resolved);

  const dot = (
    <span
      className={`scr-dot scr-dot--${resolved}`}
      style={{ '--scr-dot-size': `${size}px` } as React.CSSProperties}
      aria-hidden={showLabel || undefined}
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : `${label} — ${hint}`}
    />
  );

  if (!showLabel) return className ? <span className={className}>{dot}</span> : dot;

  return (
    <span className={`scr-dot-row ${className}`} title={hint}>
      {dot}
      <span className="scr-dot-label">{label}</span>
    </span>
  );
}
