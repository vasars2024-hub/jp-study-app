/** Tabs — accessible tablist with roving arrow-key navigation. Phase 1 · M5a. */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs({ tabs, value, onChange, className = '', ...rest }: TabsProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const enabled = tabs.filter((t) => !t.disabled);
    const idx = enabled.findIndex((t) => t.id === value);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    const target = enabled[next];
    if (target) {
      onChange(target.id);
      ref.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`)?.focus();
    }
  };

  return (
    <div ref={ref} className={['ui-tabs', className].filter(Boolean).join(' ')} role="tablist" onKeyDown={onKeyDown} {...rest}>
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab-id={t.id}
            className="ui-tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
