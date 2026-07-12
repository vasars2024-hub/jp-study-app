/** Toolbar + Spacer/Separator. Phase 1 · M5a. */
import type { HTMLAttributes } from 'react';

export function Toolbar({ className = '', role = 'toolbar', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['ui-toolbar', className].filter(Boolean).join(' ')} role={role} {...rest} />;
}

export function ToolbarSpacer() {
  return <span className="ui-toolbar__spacer" aria-hidden="true" />;
}

export function ToolbarSeparator() {
  return <span className="ui-toolbar__sep" role="separator" aria-orientation="vertical" />;
}

export default Toolbar;
