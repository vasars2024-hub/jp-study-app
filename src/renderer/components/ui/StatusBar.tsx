/**
 * StatusBar — compact application status strip (fields + spacer). Phase 4 · M1.
 * Not a live region by default (row counts etc. update too often to announce);
 * mark an individual field `live` when its changes should reach screen readers.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export function StatusBar({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['ui-statusbar', className].filter(Boolean).join(' ')} {...rest} />;
}

export function StatusBarField({
  children,
  live = false,
  className = '',
  title,
}: {
  children: ReactNode;
  /** Announce changes politely to assistive tech. */
  live?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={['ui-statusbar__field', className].filter(Boolean).join(' ')}
      role={live ? 'status' : undefined}
      title={title}
    >
      {children}
    </span>
  );
}

export function StatusBarSpacer() {
  return <span className="ui-statusbar__spacer" aria-hidden="true" />;
}

export default StatusBar;
