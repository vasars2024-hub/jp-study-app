/**
 * ContextMenu — controlled menu at (x, y). Phase 1 · M5a.
 * Zoom-corrected positioning + viewport clamp, click-outside / Escape to close,
 * and arrow-key navigation.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { appZoomFactor } from './zoom';

export interface MenuItem {
  id?: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position (correct for zoom, clamp into the viewport) after layout.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const z = appZoomFactor();
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const w = rect.width / z;
    const h = rect.height / z;
    let px = x / z;
    let py = y / z;
    if (px + w > vw) px = Math.max(4, vw - w - 4);
    if (py + h > vh) py = Math.max(4, vh - h - 4);
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.querySelector<HTMLButtonElement>('.ui-menu__item:not([disabled])')?.focus();
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('.ui-menu__item:not([disabled])') ?? [],
      );
      if (nodes.length === 0) return;
      const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % nodes.length : (idx - 1 + nodes.length) % nodes.length;
      nodes[next]?.focus();
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="ui-menu anim-scale-in" role="menu" style={{ left: x, top: y }}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={it.id ?? `sep-${i}`} className="ui-menu__sep" role="separator" />
        ) : (
          <button
            key={it.id ?? `item-${i}`}
            type="button"
            role="menuitem"
            className={['ui-menu__item', it.danger ? 'ui-menu__item--danger' : ''].filter(Boolean).join(' ')}
            disabled={it.disabled}
            onClick={() => {
              it.onSelect?.();
              onClose();
            }}
          >
            {it.icon}
            <span style={{ flex: 1 }}>{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

export default ContextMenu;
