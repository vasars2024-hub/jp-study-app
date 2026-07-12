/** Dropdown — a button that opens a menu of items. Phase 1 · M5b. */
import { useRef, useState, type ReactNode } from 'react';
import { ContextMenu, type MenuItem } from './ContextMenu';

export interface DropdownProps {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
}

export function Dropdown({ label, items, className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom + 4 });
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={['ui-btn', 'ui-focusable', className].filter(Boolean).join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {label}
        <span aria-hidden="true" style={{ opacity: 0.7 }}>▾</span>
      </button>
      <ContextMenu open={open} x={pos.x} y={pos.y} items={items} onClose={() => setOpen(false)} />
    </>
  );
}

export default Dropdown;
