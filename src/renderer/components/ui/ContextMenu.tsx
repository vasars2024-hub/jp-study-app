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
  /** Tooltip — for a disabled item, why it is disabled. */
  title?: string;
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
  const returnFocusTo = useRef<HTMLElement | null>(null);

  /**
   * Give the keyboard back what the menu borrowed.
   *
   * The open effect below moves focus INTO the menu, and nothing ever moved it out:
   * measured live 2026-08-25 on the Liquid Video window, opening a media card's
   * overflow menu and pressing Escape left `document.activeElement` as `BODY`, so a
   * keyboard user lands back at the top of the window with no way to resume where
   * they were. This runs BEFORE the positioning effect on purpose — declaration
   * order is effect order, so `document.activeElement` here is still the trigger
   * and not the menu's first item.
   *
   * The cleanup has to accept BOTH teardown shapes, because React sequences them
   * differently and only one of them leaves focus on `<body>`. On `open` → false
   * the component re-renders to `null`, so the DOM is already gone by the time the
   * cleanup runs; on a real unmount the cleanup runs FIRST and the focused menu
   * item is still attached. Testing only for `<body>` silently did nothing in the
   * second case.
   *
   * Deps are `[open]` alone: the positioning effect re-runs on every (x, y), and
   * capturing there would overwrite the trigger with a menu item on the first
   * reposition.
   */
  useLayoutEffect(() => {
    if (!open) return undefined;
    const active = document.activeElement;
    returnFocusTo.current =
      active && active !== document.body && active !== document.documentElement
        ? (active as HTMLElement)
        : null;
    const menuEl = ref.current;
    return () => {
      const prev = returnFocusTo.current;
      returnFocusTo.current = null;
      if (!prev?.isConnected || typeof prev.focus !== 'function') return;
      // Only reclaim focus the menu still owns. A selection that deliberately moved
      // it somewhere — a dialog it opened, a field it put into rename — keeps it.
      const now = document.activeElement;
      const menuOwnsIt = !now || now === document.body || now === document.documentElement
        || !!menuEl?.contains(now);
      if (!menuOwnsIt) return;
      prev.focus({ preventScroll: true });
    };
  }, [open]);

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
    // `preventScroll`, because this menu is `position: fixed` at coordinates that
    // are already clamped into the viewport — there is nothing for a scroll to
    // reveal, and the browser's scroll-into-view walks the menu's DOM ancestors
    // rather than its layout ones. Measured 2026-08-25 on the Liquid Media Center:
    // focusing the first item set the owning `.fwin`'s `scrollLeft` 0 → 186, and
    // every pixel of the window's content jumped 186px left until the menu closed
    // (`.mc-root` 111 → -75). The window is `overflow: hidden`, so the user could
    // not scroll it back. The same menu in the Standard window left `scrollLeft`
    // at 0 — the control that says this is a real difference and not the harness.
    el.querySelector<HTMLButtonElement>('.ui-menu__item:not([disabled])')?.focus({ preventScroll: true });
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
      // Same `preventScroll` as the open effect, and it is not redundant: with
      // only the first one fixed, the window sat still on open and then jumped
      // `scrollLeft` 0 → 189 on the first ArrowDown. Both call sites or neither.
      nodes[next]?.focus({ preventScroll: true });
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
            title={it.title}
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
