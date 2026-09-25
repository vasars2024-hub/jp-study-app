/**
 * Focus hand-back for the shell's temporary surfaces (flyouts, sheets, windows).
 *
 * Round-2 a11y audit K7: Escape in Quick Settings / Notifications, closing a
 * window and closing a study sheet all left `document.activeElement` on `<body>`,
 * so a keyboard user was thrown back to the top of the document with nothing
 * focused. The rule every surface here follows is the same one `ui/ContextMenu`
 * already uses:
 *
 *  - remember what had focus when the surface opened (its opener);
 *  - on close, hand focus back ONLY if the surface still owns it — focus inside
 *    the closing surface, or already lost to `<body>`. A close that the user
 *    caused by clicking something else keeps that something else focused;
 *  - if the opener is gone (unmounted, hidden, disabled), fall back to the next
 *    sensible target the caller names.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Elements that a person can land on with Tab or that the shell deliberately focuses. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** The element that has focus right now, or `null` when nothing meaningful does. */
export function captureFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return null;
  return active instanceof HTMLElement ? active : null;
}

/** Can `el` take focus right now? Detached, disabled or hidden elements cannot. */
export function isFocusable(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected || typeof el.focus !== 'function') return false;
  if ((el as HTMLButtonElement).disabled) return false;
  // `display: none` on the element or an ancestor (a minimised window) — jsdom has no
  // layout, so walk the inline styles and `hidden` rather than trusting offsetParent.
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hidden || node.style.display === 'none') return false;
  }
  return true;
}

/** True when focus is on nothing, or inside `container` (so the container still owns it). */
export function focusIsLostOrInside(container: Element | null | undefined): boolean {
  if (typeof document === 'undefined') return false;
  const now = document.activeElement;
  if (!now || now === document.body || now === document.documentElement) return true;
  return !!container && container.contains(now);
}

/**
 * Hand focus back after a surface closed. `fallbacks` are tried in order when the
 * opener cannot take focus. Returns the element that received focus, if any.
 */
export function restoreFocus(
  opener: HTMLElement | null | undefined,
  options: { container?: Element | null; fallbacks?: Array<() => HTMLElement | null | undefined> } = {},
): HTMLElement | null {
  if (!focusIsLostOrInside(options.container)) return null;
  // Fallbacks are resolved lazily: one may query the DOM, which is only worth doing
  // once everything before it has failed.
  const sources: Array<() => HTMLElement | null | undefined> = [() => opener, ...(options.fallbacks ?? [])];
  for (const source of sources) {
    const el = source();
    if (!isFocusable(el)) continue;
    // Never "restore" into the surface that is closing.
    if (options.container && options.container.contains(el)) continue;
    el.focus({ preventScroll: true });
    if (document.activeElement === el) return el;
  }
  return null;
}

/**
 * The first control worth landing on inside `root`, skipping anything matched by
 * `skip` (e.g. a window's caption buttons). `null` when there is none yet — a lazily
 * loaded app body, say — in which case callers focus the container itself.
 */
export function firstMeaningfulControl(root: Element, skip?: string): HTMLElement | null {
  const autofocus = root.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
  if (autofocus && isFocusable(autofocus) && !(skip && autofocus.closest(skip))) return autofocus;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (skip && el.closest(skip)) continue;
    if (isFocusable(el)) return el;
  }
  return null;
}

/**
 * Hook form for a surface that is mounted while open. Captures the opener when
 * `open` turns true and hands focus back when it turns false or the component
 * unmounts. A layout effect, so the cleanup runs while the surface's DOM is still
 * attached and "focus is inside the surface" can still be answered.
 */
export function useFocusReturn(
  open: boolean,
  containerRef: RefObject<Element | null>,
  fallback?: () => HTMLElement | null | undefined,
): void {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  useLayoutEffect(() => {
    if (!open) return undefined;
    const opener = captureFocus();
    // The container node is read at open time: by cleanup, a re-render to `null`
    // may already have cleared the ref.
    const container = containerRef.current;
    return () => {
      const fb = fallbackRef.current;
      restoreFocus(opener, { container, fallbacks: fb ? [fb] : [] });
    };
  }, [open, containerRef]);
}
