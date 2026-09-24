/**
 * A toolbar disclosure: a native `<details>` (keyboard-operable and announced for
 * free) whose panel is a Liquid contextual surface — glass in Liquid presentation,
 * an opaque menu everywhere else.
 *
 * The panel is portalled to the media library's root and placed against the
 * trigger with the window's own box as the boundary: flipped above when there is
 * more room there, clamped inside left and right, and capped to the room it has
 * with its own scroll. Laid out in place it used to run past the window's right
 * and bottom edges, which put a horizontal scrollbar on the page and shifted it
 * ~15px, and clipped the end of the sort menu. Portalling to the Gum root (not to
 * `document.body`) keeps the Media Center tokens and the Liquid material, which
 * are scoped to the window.
 *
 * Dismissal is handled here rather than by `useDismissableDisclosure`, whose
 * "outside" test is containment in the `<details>` — which a portalled panel is not.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import GumIcon from './GumIcons';

export interface GumPopoverProps {
  /** Summary content: the control's visible label (and current value). */
  label: ReactNode;
  /** Accessible name when `label` alone would be ambiguous. */
  ariaLabel?: string;
  /** Marks the trigger as holding an active filter. */
  active?: boolean;
  className?: string;
  align?: 'start' | 'end';
  /** Panel width hint. */
  wide?: boolean;
  chevron?: boolean;
  /** Receives a `close` so an item can dismiss the menu after acting. */
  children: (close: () => void) => ReactNode;
}

const EDGE = 8;
const GAP = 8;
const MIN_HEIGHT = 140;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where a panel goes, as a pure function of three boxes (all in client pixels), so
 * the geometry can be tested without a layout engine.
 */
export function placePopover(
  trigger: { left: number; right: number; top: number; bottom: number },
  bound: { left: number; right: number; top: number; bottom: number },
  panel: { width: number; height: number },
  align: 'start' | 'end',
): { left: number; top: number; maxHeight: number; maxWidth: number; placement: 'below' | 'above' } {
  const maxWidth = Math.max(0, bound.right - bound.left - EDGE * 2);
  const width = Math.min(panel.width, maxWidth);
  const preferred = align === 'end' ? trigger.right - width : trigger.left;
  const left = Math.max(bound.left + EDGE, Math.min(preferred, bound.right - EDGE - width));
  const below = bound.bottom - trigger.bottom - GAP - EDGE;
  const above = trigger.top - bound.top - GAP - EDGE;
  const placement = panel.height <= below || below >= above ? 'below' : 'above';
  const room = Math.max(MIN_HEIGHT, placement === 'below' ? below : above);
  const height = Math.min(panel.height, room);
  const top = placement === 'below' ? trigger.bottom + GAP : trigger.top - GAP - height;
  return { left, top, maxHeight: room, maxWidth, placement };
}

export default function GumPopover({
  label,
  ariaLabel,
  active,
  className = '',
  align = 'start',
  wide,
  chevron = true,
  children,
}: GumPopoverProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const close = useCallback((): void => {
    if (ref.current) ref.current.open = false;
  }, []);

  // The portal target: the media library's root, found once the details is mounted.
  useLayoutEffect(() => {
    if (!open) return;
    setHost((current) => current ?? (ref.current?.closest('.gum-root') as HTMLElement | null) ?? null);
  }, [open]);

  const place = useCallback((): void => {
    const details = ref.current;
    const panel = panelRef.current;
    const root = host;
    if (!details || !panel || !root) return;
    const summary = details.querySelector('summary');
    if (!summary) return;
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width === 0 && rootRect.height === 0) return;
    // Measure the natural size first: no stale cap or offset from the previous placement
    // (an absolute box near the right edge shrink-wraps to the room left of it).
    panel.style.maxHeight = '';
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.maxWidth = `min(440px, ${Math.max(0, rootRect.width - EDGE * 2)}px)`;
    const next = placePopover(
      summary.getBoundingClientRect(),
      rootRect,
      { width: panel.offsetWidth, height: panel.scrollHeight },
      align,
    );
    // Absolute inside the root (`position: relative`), so root-relative coordinates.
    panel.style.left = `${Math.round(next.left - rootRect.left)}px`;
    panel.style.top = `${Math.round(next.top - rootRect.top)}px`;
    panel.style.maxHeight = `${Math.floor(next.maxHeight)}px`;
    panel.dataset.placement = next.placement;
  }, [host, align]);

  useLayoutEffect(() => {
    if (open && host) place();
  });

  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const schedule = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      close();
      ref.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    const ro = typeof ResizeObserver === 'function' && panelRef.current ? new ResizeObserver(schedule) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      ro?.disconnect();
    };
  }, [open, host, place, close]);

  // A portalled panel is not next to its summary in the tab order, so Tab walks
  // into it from the summary and back out of it at either end.
  const onSummaryKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab' || event.shiftKey || !open || !host) return;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    if (!first) return;
    event.preventDefault();
    first.focus();
  };
  const onPanelKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab' || !host) return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!items.length) return;
    const atStart = event.shiftKey && document.activeElement === items[0];
    const atEnd = !event.shiftKey && document.activeElement === items[items.length - 1];
    if (!atStart && !atEnd) return;
    event.preventDefault();
    const summary = ref.current?.querySelector('summary');
    if (atEnd) close();
    summary?.focus();
  };

  const panel = open ? (
    <ContextualSurface
      ref={panelRef}
      className="gum-pop__panel"
      data-align={align}
      data-wide={wide ? 'true' : undefined}
      data-portal={host ? 'true' : undefined}
      onKeyDown={onPanelKey}
    >
      {children(close)}
    </ContextualSurface>
  ) : null;

  return (
    <details
      ref={ref}
      className={`gum-pop ${className}`.trim()}
      data-active={active ? 'true' : undefined}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="gum-pop__trigger" aria-label={ariaLabel} onKeyDown={onSummaryKey}>
        {label}
        {chevron && <GumIcon name="chevron-down" size={12} className="gum-pop__chev" />}
      </summary>
      {panel && (host ? createPortal(panel, host) : panel)}
    </details>
  );
}
