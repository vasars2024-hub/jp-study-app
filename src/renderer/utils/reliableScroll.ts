/**
 * SMOOTH SCROLLING IS REFUSED IN THIS RENDERER. This module is the recovery.
 *
 * `scrollIntoView({behavior:'smooth'})` is a REQUEST, not a guarantee, and measured live on
 * 2026-08-31 in this Electron renderer with the OS reporting `prefers-reduced-motion:
 * no-preference`, it is refused outright: the settings pane moved **0 px** on the smooth call
 * and **7,233 px** on the identical `auto` call, `pane.scrollTo({behavior:'smooth'})` also
 * moved 0, and a freshly created plain scroller in the same document ignored smooth too. So it
 * is the environment, not any one pane.
 *
 * The cost is invisible and total. A settings card reached from search or the command palette
 * stayed ~7,400 px below the fold for the whole 2.2 s its highlight lasted — from the user's
 * seat, indistinguishable from the search having dumped them at the top of the page. Eleven
 * product call sites across ten files asked for smooth exactly the same way.
 *
 * The recovery, and it is deliberately conservative: ask for smooth, then CHECK. Only if the
 * scroller has not moved AT ALL and the target is still entirely out of view does this land it
 * outright. A smooth scroll that is genuinely working has always moved by the settle deadline
 * and is left alone to finish, so this stays correct if the environment is ever fixed.
 *
 * Two traps are baked in rather than left for a caller to rediscover:
 *  - THE SCROLLER IS WHAT GETS COMPARED, never the element's own rect. The first attempt at the
 *    settings fix gated on `rect.top === before` and never fired, because the page was still
 *    settling and shifted the card 19 px by itself. That false fix was measured failing before
 *    the real one was written.
 *  - BOTH AXES COUNT. A horizontal strip (the flashcards review carousel) has no vertical
 *    overflow at all, so an overflow-Y-only scroller search walks straight past it to the page
 *    and then compares the wrong number.
 */

/** The nearest ancestor that would actually move if `el` were scrolled to, in EITHER axis. */
export function nearestScroller(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const scrollsY =
      (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1;
    const scrollsX =
      (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1;
    if (scrollsY || scrollsX) return n;
  }
  return null;
}

type Pos = { top: number; left: number };

function positionOf(scroller: HTMLElement | null): Pos {
  if (scroller) return { top: scroller.scrollTop, left: scroller.scrollLeft };
  return { top: window.scrollY, left: window.scrollX };
}

function entirelyOutside(
  r: { top: number; bottom: number; left: number; right: number },
  box: { top: number; bottom: number; left: number; right: number },
): boolean {
  return r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right;
}

/** Out of the window, or clipped away by its own scroller — either one means unseen. */
function outOfView(el: HTMLElement, scroller: HTMLElement | null): boolean {
  const r = el.getBoundingClientRect();
  const viewport = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  if (entirelyOutside(r, viewport)) return true;
  return scroller ? entirelyOutside(r, scroller.getBoundingClientRect()) : false;
}

/** How long to wait before deciding the smooth request was ignored, in ms. */
export const SCROLL_SETTLE_MS = 300;

/**
 * a11y2: smooth scrolling is motion. Under the OS "reduce motion" setting, the
 * app's own Reduced/Disabled motion, or animation level None, a jump is what
 * the user asked for — and it also skips the settle wait above.
 */
export function prefersReducedScroll(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('reduce-motion')) return true;
  if (root.dataset.motionMode === 'disabled' || root.dataset.displayAnim === 'none') return true;
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The `behavior` every programmatic scroll in the app should ask for. */
export function preferredScrollBehavior(): ScrollBehavior {
  return prefersReducedScroll() ? 'auto' : 'smooth';
}

/**
 * `el.scrollIntoView({behavior:'smooth', ...options})`, but it actually arrives.
 *
 * Returns a cancel function; call it from an effect cleanup so an unmounted component cannot
 * scroll the surface out from under whatever replaced it.
 */
export function scrollIntoViewReliably(
  el: HTMLElement | null | undefined,
  options: ScrollIntoViewOptions = { block: 'nearest' },
  settleMs: number = SCROLL_SETTLE_MS,
): () => void {
  if (!el) return () => undefined;
  if (prefersReducedScroll()) {
    const instant = { ...options };
    delete instant.behavior;
    el.scrollIntoView(instant);
    return () => undefined;
  }
  const scroller = nearestScroller(el);
  const before = positionOf(scroller);
  el.scrollIntoView({ behavior: 'smooth', ...options });
  const settle = window.setTimeout(() => {
    const now = positionOf(scroller);
    if (now.top !== before.top || now.left !== before.left) return;
    if (!outOfView(el, scroller)) return;
    const instant = { ...options };
    delete instant.behavior;
    el.scrollIntoView(instant);
  }, settleMs);
  return () => window.clearTimeout(settle);
}

/**
 * `scroller.scrollTo({behavior:'smooth', ...})`, but it actually arrives. Here the scroller IS
 * the element, so the target position is known and "did nothing" is checked against it directly.
 */
export function scrollToReliably(
  scroller: HTMLElement | null | undefined,
  options: ScrollToOptions,
  settleMs: number = SCROLL_SETTLE_MS,
): () => void {
  if (!scroller) return () => undefined;
  if (prefersReducedScroll()) {
    const instant = { ...options };
    delete instant.behavior;
    scroller.scrollTo(instant);
    return () => undefined;
  }
  const before = positionOf(scroller);
  scroller.scrollTo({ behavior: 'smooth', ...options });
  const settle = window.setTimeout(() => {
    const now = positionOf(scroller);
    if (now.top !== before.top || now.left !== before.left) return;
    const wantsTop = options.top != null && Math.abs(now.top - options.top) > 1;
    const wantsLeft = options.left != null && Math.abs(now.left - options.left) > 1;
    if (!wantsTop && !wantsLeft) return;
    const instant = { ...options };
    delete instant.behavior;
    scroller.scrollTo(instant);
  }, settleMs);
  return () => window.clearTimeout(settle);
}
