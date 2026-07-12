/** Sidebar — vertical navigation list. Phase 1 · M5b. */
import type { ReactNode } from 'react';

export interface SidebarItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SidebarProps {
  items: SidebarItem[];
  value?: string;
  onSelect?: (id: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function Sidebar({ items, value, onSelect, header, footer, className = '', ...rest }: SidebarProps) {
  return (
    <nav className={['ui-sidebar', className].filter(Boolean).join(' ')} {...rest}>
      {header != null && <div className="ui-sidebar__header">{header}</div>}
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="ui-sidebar__item"
          aria-current={value === it.id}
          disabled={it.disabled}
          onClick={() => onSelect?.(it.id)}
        >
          {it.icon}
          <span style={{ flex: 1 }}>{it.label}</span>
        </button>
      ))}
      {footer != null && <div className="ui-sidebar__footer">{footer}</div>}
    </nav>
  );
}

export default Sidebar;
