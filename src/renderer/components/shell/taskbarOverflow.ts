/**
 * Taskbar overflow (shell2).
 *
 * `.os-task-wins` scrolls horizontally with its scrollbar hidden, which left
 * two holes once more windows were open than fit: a mouse wheel (vertical)
 * did nothing over the bar, and the window that just took focus — from
 * Ctrl+Tab, a click on the desk, a notification — could sit scrolled out of
 * sight, so the bar no longer said which window was in front. Both answers
 * are pure arithmetic, kept here so they can be tested without a layout.
 */

/** Horizontal pixels a wheel tick should scroll the strip by, or null to leave the event alone. */
export function wheelScrollDelta(deltaX: number, deltaY: number, scrollWidth: number, clientWidth: number): number | null {
  if (scrollWidth <= clientWidth + 1) return null; // nothing hidden
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return null; // a trackpad already scrolls sideways
  return deltaY;
}

interface Span {
  left: number;
  right: number;
}

/**
 * How far to move `scrollLeft` so `item` is fully inside `strip`. Rects are in
 * viewport pixels; `scale` converts them to the strip's own CSS pixels (app
 * zoom renders the strip larger or smaller than its layout width).
 */
export function revealScrollDelta(strip: Span, item: Span, scale = 1): number {
  const s = scale > 0 && Number.isFinite(scale) ? scale : 1;
  if (item.left < strip.left) return (item.left - strip.left) / s;
  if (item.right > strip.right) {
    // An item wider than the strip shows its start.
    const overflow = Math.min(item.right - strip.right, item.left - strip.left);
    return overflow / s;
  }
  return 0;
}

/** Scroll the active task button into view inside its strip without touching any ancestor. */
export function revealActiveTask(strip: HTMLElement | null): void {
  if (!strip) return;
  const active = strip.querySelector<HTMLElement>('.os-task-win.active');
  if (!active) return;
  const stripRect = strip.getBoundingClientRect();
  const itemRect = active.getBoundingClientRect();
  const scale = strip.clientWidth > 0 ? stripRect.width / strip.clientWidth : 1;
  const delta = revealScrollDelta(stripRect, itemRect, scale);
  // `scrollIntoView` would also scroll the `overflow: hidden` ancestors of the
  // shell (#root), which is the drift the shell's own guards forbid.
  if (delta) strip.scrollLeft += delta;
}
