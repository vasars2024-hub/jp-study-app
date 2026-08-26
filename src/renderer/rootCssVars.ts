/**
 * Custom-property writes to `<html>`, coalesced to one per frame.
 *
 * Measured live on 2026-08-26 through the debug bridge, on a desk with 10 open
 * `.fwin` windows (3,438 elements, 10,458 CSS rules, 249 custom properties
 * visible at `:root`):
 *
 *   | operation on `<html>`                         | median forced style+layout |
 *   | --------------------------------------------- | -------------------------- |
 *   | class toggle that matches no rule              |  0.5 ms                    |
 *   | non-inherited property (`outline-offset`)      |  0.5 ms                    |
 *   | `setProperty` re-writing the SAME value        |  0.0 ms                    |
 *   | `setProperty` of ONE custom property no rule   | 69.3 ms                    |
 *   | reads                                          |                            |
 *   | three custom properties in one task            | 70.3 ms                    |
 *   | the real `--app-border-*` triple               | 87.0 ms                    |
 *   | a full `data-theme` swap                       | 92.5 ms                    |
 *
 * Two things follow, and they are why this module exists.
 *
 * First: the cost is **custom-property inheritance**, not selector matching and
 * not the theme. Changing any custom property on `:root` — even one that no
 * rule reads — makes every element recompute its inherited style, so the cost
 * is linear in open-window element count (8.8 ms with every window's subtree
 * skipped, 83.2 ms with all ten live). A theme swap is only expensive because
 * it changes custom properties; the attribute itself is ~0.5 ms.
 *
 * Second: Chromium already discards a `setProperty` that does not change the
 * value, so writing unchanged properties is free — but writing a *changed* one
 * inside an input handler is not. `<input type="range">` fires `change` per
 * tick, so an appearance slider was paying ~87 ms of synchronous recalc per
 * tick and dragging it froze the desk.
 *
 * So: diff against the last value written, and batch the survivors into a
 * single rAF flush. rAF rather than a microtask because a microtask still runs
 * inside the same input task — a slider sampled above the display rate would
 * still force two recalcs in one frame.
 */

type VarMap = Record<string, string | null>;

/** Last value this module wrote for each property; `null` means removed. */
const applied = new Map<string, string | null>();
const pending = new Map<string, string | null>();
let frame = 0;

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

function write(el: HTMLElement, name: string, value: string | null): void {
  if (value === null) el.style.removeProperty(name);
  else el.style.setProperty(name, value);
  applied.set(name, value);
}

/**
 * Apply everything queued. Safe to call when nothing is pending. Exported so
 * tests and teardown paths do not have to wait for a frame that a hidden
 * window will never paint.
 */
export function flushRootVars(): void {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (!pending.size) return;
  const el = root();
  if (!el) {
    pending.clear();
    return;
  }
  for (const [name, value] of pending) {
    if (applied.get(name) === value) continue;
    write(el, name, value);
  }
  pending.clear();
}

/**
 * Queue custom properties for the next frame. A property whose value already
 * matches the last one written is dropped here rather than at flush time, so a
 * settings apply that changes nothing schedules no frame at all.
 *
 * A `null` value removes the property.
 */
export function setRootVars(vars: VarMap): void {
  const el = root();
  if (!el) return;
  let queued = false;
  for (const [name, value] of Object.entries(vars)) {
    if (applied.get(name) === value && !pending.has(name)) continue;
    pending.set(name, value);
    queued = true;
  }
  if (!queued || frame) return;
  // A hidden window gets no frames, so a queued write would never land — and it
  // has no frame budget worth protecting either. Apply straight away instead.
  if (typeof document !== 'undefined' && document.hidden) {
    flushRootVars();
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = 0;
    flushRootVars();
  });
}

/**
 * Apply immediately, bypassing the frame. For boot, which runs before first
 * paint and must not leave the desk one frame un-themed.
 */
export function setRootVarsNow(vars: VarMap): void {
  const el = root();
  if (!el) return;
  for (const [name, value] of Object.entries(vars)) {
    pending.delete(name);
    if (applied.get(name) === value) continue;
    write(el, name, value);
  }
}

/** Test seam: forget what we believe the DOM holds. */
export function resetRootVarsForTest(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  applied.clear();
  pending.clear();
}
