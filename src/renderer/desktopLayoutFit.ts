/**
 * Fitting a saved desktop layout into the viewport that is about to show it (B4).
 *
 * Extracted from `components/DesktopShell.tsx` 2026-08-12. It is pure geometry
 * with no React and no DOM, but living inside the shell made it effectively
 * untestable: importing `DesktopShell.tsx` under vitest's `environment: 'node'`
 * dies in `playerBus.ts:182` (`document.createElement('audio')` at module eval,
 * reached via `VisualizerCanvas.tsx`), and under `jsdom` it dies one step later
 * on `window.api.playerWindowId()`. A prior note claiming "it is exported, so it
 * is unit-testable without mounting the shell" was wrong for exactly that reason.
 * Here it imports in node with no stubbing at all.
 */
import type { DesktopLayout, IconSnapshot, WidgetSnapshot, WindowSnapshot } from '../shared/desktop';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The scale a fit applies, and the space it applies it from.
 *
 * A layout that has never recorded the viewport it was authored against still
 * has to FIT. Treating "unknown" as "same as here" and returning early let a
 * 1264x773 window sit inside an 880x563 desktop, overflowing it with no way to
 * reach the far edge — seen on a desktop torn off the taskbar, whose window
 * geometry came from a much larger shell.
 *
 * Unknown origin means proportional scaling is not available (there is no
 * ratio to scale by), but clamping into the viewport always is.
 */
export function fitScale(
  layout: Pick<DesktopLayout, 'authoredW' | 'authoredH'>,
  viewport: { w: number; h: number },
  mode: 'clamp' | 'proportional',
): { known: boolean; rescaled: boolean; sx: number; sy: number; authoredW: number; authoredH: number } {
  const { w: vw, h: vh } = viewport;
  const known = typeof layout.authoredW === 'number' && typeof layout.authoredH === 'number';
  const authoredW = layout.authoredW ?? vw;
  const authoredH = layout.authoredH ?? vh;
  const sameViewport = known && authoredW === vw && authoredH === vh;
  const effectiveMode = known && !sameViewport ? mode : 'clamp';
  const rescaled = effectiveMode === 'proportional';
  const sx = rescaled ? vw / Math.max(1, authoredW) : 1;
  const sy = rescaled ? vh / Math.max(1, authoredH) : 1;
  return { known, rescaled, sx, sy, authoredW, authoredH };
}

/**
 * Pull a layout authored on one monitor into the viewport of another (B4).
 *
 * Geometry here is absolute pixels. Hydrating a 3440x1440 layout onto a 1920x1080
 * monitor would otherwise put half the windows and every right-hand icon off
 * screen with no way to reach them. Two modes:
 *
 * - `proportional` — scale positions by the viewport ratio, preserving the
 *   arrangement. Sizes are scaled too, but never below their minimums.
 * - `clamp` (default) — keep sizes, just pull anything out of bounds back in.
 *   Less clever, but it never shrinks a window the user sized deliberately.
 */
export function clampLayoutToViewport(
  layout: DesktopLayout,
  viewport: { w: number; h: number },
  mode: 'clamp' | 'proportional' = 'clamp',
): DesktopLayout {
  const { w: vw, h: vh } = viewport;
  if (vw <= 0 || vh <= 0) return layout;

  /*
   * No early return on `sameViewport` (see `fitScale`).
   *
   * `authoredW/H` is bookkeeping, and bookkeeping can be wrong: a hydrate that
   * ran before the desk had been laid out skipped the fit but still committed
   * the current viewport as the authored size. The layout then claims "authored
   * at 880x515" while holding a 1264px window, and an early return trusts the
   * claim and leaves the window overflowing its desk permanently.
   *
   * The bound below is an invariant — nothing may be wider or taller than the
   * desk it lives on — so it is enforced every time. The maps preserve object
   * identity when nothing changes, so re-running costs nothing.
   */
  const { known, rescaled, sx, sy } = fitScale(layout, viewport, mode);

  const MIN_W = 240;
  const MIN_H = 140;

  /** One window-sized rect, pulled into this viewport. Identity-preserving. */
  const fitRect = <T extends { x: number; y: number; w: number; h: number }>(rect: T): T => {
    const w = Math.max(MIN_W, Math.min(vw, Math.round(rect.w * sx)));
    const h = Math.max(MIN_H, Math.min(vh, Math.round(rect.h * sy)));
    // Keep at least a title bar's worth reachable, never a negative origin.
    const x = Math.max(0, Math.min(Math.round(rect.x * sx), Math.max(0, vw - w)));
    const y = Math.max(0, Math.min(Math.round(rect.y * sy), Math.max(0, vh - h)));
    return rect.x === x && rect.y === y && rect.w === w && rect.h === h ? rect : { ...rect, x, y, w, h };
  };

  const windows = layout.windows.map((win) => {
    const live = fitRect(win);
    /*
     * The rects a window is restored INTO have to fit too, and until 2026-09-01
     * neither did. `restoreRect` is where un-maximizing lands and
     * `presentation.standardRect` is where Return to standard lands, so a fit
     * that moves only the live rect hands the user a window that is on-screen
     * now and off-screen the moment they use either control. Measured on this
     * profile's own desktop 4, authored 880x393 and hydrated into a 642x385 desk
     * window: the maximized `scraper` clamped correctly to 642x385, then its
     * Maximize button restored it to the untouched 820x580 at 94,54 — 272px past
     * the right edge and 249px past the bottom, under `overflow: hidden` with no
     * scrollbar, taking the resize grip with it. Same class as the zoom re-fit
     * defect L11 bullet 2 closed; same omission, one map further down.
     *
     * They take the SAME bound as the live rect rather than a looser one: a
     * restore target that only half-fits is the same unreachable window. In
     * clamp mode (sx = sy = 1) a rect that already fits is returned by identity,
     * so this is a no-op for every layout that was never cross-monitor.
     *
     * `standardRect` stays parseable by construction — `parsePresentation`
     * rejects w/h <= 0 and the floor here is MIN_W/MIN_H — so a clamped window
     * keeps its way back rather than being downgraded to conventional.
     */
    const restoreRect = win.restoreRect ? fitRect(win.restoreRect) : win.restoreRect;
    const standardRect = win.presentation?.standardRect
      ? fitRect(win.presentation.standardRect)
      : win.presentation?.standardRect;
    if (
      live === win &&
      restoreRect === win.restoreRect &&
      standardRect === win.presentation?.standardRect
    ) {
      return win;
    }
    // Spread only what the window actually had. `restoreRect: undefined` on a
    // window that never carried one still ADDS the key, and decision (1) of
    // `shared/liquidWindowState.ts` is that the conventional window is the
    // ABSENCE of these fields — a blob that grows them differs from itself on
    // disk for every pre-L3 layout in existence.
    return {
      ...live,
      ...(restoreRect ? { restoreRect } : {}),
      ...(win.presentation
        ? { presentation: { ...win.presentation, ...(standardRect ? { standardRect } : {}) } }
        : {}),
    };
  });

  const icons = layout.icons.map((icon) => {
    const x = Math.max(0, Math.min(Math.round(icon.x * sx), Math.max(0, vw - 72)));
    const y = Math.max(0, Math.min(Math.round(icon.y * sy), Math.max(0, vh - 88)));
    return icon.x === x && icon.y === y ? icon : { ...icon, x, y };
  });

  const widgets = layout.widgets.map((widget) => {
    const w = Math.max(120, Math.min(vw, Math.round(widget.w * sx)));
    const h = Math.max(80, Math.min(vh, Math.round(widget.h * sy)));
    const x = Math.max(0, Math.min(Math.round(widget.x * sx), Math.max(0, vw - w)));
    const y = Math.max(0, Math.min(Math.round(widget.y * sy), Math.max(0, vh - h)));
    return widget.x === x && widget.y === y && widget.w === w && widget.h === h
      ? widget
      : { ...widget, x, y, w, h };
  });

  /*
   * `authoredW/H` means "the viewport these coordinates are expressed in". Only
   * a proportional pass makes that this viewport: it multiplies every coordinate
   * by vw/authoredW, so afterwards the layout genuinely IS authored at vw x vh.
   *
   * A clamp pass does not. `sx = sy = 1`, so a window that already fits is
   * returned byte-for-byte unchanged, still expressed in the space it came from.
   * Re-stamping it to vw x vh there was a lie with teeth: open a 1264x821 desk
   * once in an 880x507 secondary window and it would claim it was authored at
   * 880x507, so a later proportional open back at 1264x821 scaled everything up
   * by ~1.44x against an origin that had never been true. Preserving the real
   * origin makes that same reopen a 1.0x no-op.
   *
   * The unknown-origin case still stamps: there was no origin to protect, the
   * layout has now been fitted here, and recording that beats leaving it blank.
   */
  return {
    ...layout,
    windows,
    icons,
    widgets,
    authoredW: rescaled || !known ? vw : layout.authoredW,
    authoredH: rescaled || !known ? vh : layout.authoredH,
  };
}

/**
 * What one fit remembered, so the next fit can be derived from what the user
 * authored rather than from what the previous fit produced.
 *
 * A fit is not invertible on its own. `fitRect` floors a window at MIN_W x MIN_H
 * and caps it at the viewport, and both bounds throw information away: a 260x220
 * note fitted proportionally into a half-size desk (200% zoom) lands on the
 * 240x140 floor, and fitting THAT back into the full desk multiplies the floor —
 * 480x302, written to disk, measured live 2026-09-02 (boss audit
 * `audit-20260902-121014-bab1b330`, Finding 3). In clamp mode the cap does the
 * same thing in the other direction: a 960x680 window capped to a 632x355 desk
 * is 632x355 forever, because a clamp of a rect that fits is the identity.
 *
 * So a fit remembers, per window, the rect it fitted FROM (`base`, expressed in
 * `authoredW x authoredH`) and the rect it fitted TO (`fitted`, expressed in
 * `viewport`). The next fit asks each live window whether it still holds the
 * rect this fit gave it. If it does, the user has not touched it and its base
 * rect is the truth; if it does not, the user re-authored it in this viewport
 * and the live rect is carried back by the inverse of `sx`/`sy` — which is the
 * identity in clamp mode, exactly as clamp-mode coordinates are defined.
 */
export interface FitMemory {
  /** The space the base rects are expressed in. */
  authoredW: number;
  authoredH: number;
  /** The forward scale the fit applied (both 1 for a clamp). */
  sx: number;
  sy: number;
  /** The viewport the fitted rects are expressed in. */
  viewport: { w: number; h: number };
  rects: Map<string, { base: Rect; fitted: Rect }>;
}

function rectOf(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Record what `clampLayoutToViewport(source, viewport, mode)` did to each window. */
export function rememberFit(
  source: DesktopLayout,
  fitted: DesktopLayout,
  viewport: { w: number; h: number },
  mode: 'clamp' | 'proportional',
): FitMemory {
  const scale = fitScale(source, viewport, mode);
  const fittedById = new Map(fitted.windows.map((w) => [w.id, w]));
  const rects = new Map<string, { base: Rect; fitted: Rect }>();
  for (const win of source.windows) {
    rects.set(win.id, { base: rectOf(win), fitted: rectOf(fittedById.get(win.id) ?? win) });
  }
  return {
    authoredW: scale.authoredW,
    authoredH: scale.authoredH,
    sx: scale.sx,
    sy: scale.sy,
    viewport: { w: viewport.w, h: viewport.h },
    rects,
  };
}

/**
 * Express live windows in the space a remembered fit was derived from.
 *
 * Size and position are judged separately: a note the user dragged but never
 * resized keeps its authored size and takes its dragged position, rather than
 * having its floored size scaled up because one coordinate moved. A window the
 * memory has never seen (opened while zoomed) is carried back by the inverse
 * scale, which is what its coordinates mean in this viewport. Without a memory
 * there is nothing to invert and the live rects are returned as they are.
 */
export function toAuthoredSpace(live: WindowSnapshot[], memory: FitMemory | null): WindowSnapshot[] {
  if (!memory) return live;
  const { sx, sy } = memory;
  return live.map((win) => {
    const m = memory.rects.get(win.id);
    const sizeKept = !!m && win.w === m.fitted.w && win.h === m.fitted.h;
    const posKept = !!m && win.x === m.fitted.x && win.y === m.fitted.y;
    const w = m && sizeKept ? m.base.w : Math.round(win.w / sx);
    const h = m && sizeKept ? m.base.h : Math.round(win.h / sy);
    const x = m && posKept ? m.base.x : Math.round(win.x / sx);
    const y = m && posKept ? m.base.y : Math.round(win.y / sy);
    return win.x === x && win.y === y && win.w === w && win.h === h ? win : { ...win, x, y, w, h };
  });
}

/** The subset of a layout whose numbers `authoredW/H` is a claim about. */
export interface LayoutGeometry {
  windows: WindowSnapshot[];
  icons: IconSnapshot[];
  widgets: WidgetSnapshot[];
}

/**
 * Everything positional in a layout, and nothing else.
 *
 * Distinct from the shell's `layoutSignature`, which also covers notes text and
 * the wallpaper so it can recognise a commit echoing back from main. Those are
 * not geometry: picking a new wallpaper does not re-author a desk's coordinates,
 * so it must not be allowed to move `authoredW/H`.
 */
export function layoutGeometrySignature(layout: LayoutGeometry): string {
  return JSON.stringify({
    windows: layout.windows.map((w) => [w.id, w.x, w.y, w.w, w.h, !!w.maximized]),
    icons: layout.icons.map((i) => [i.id, i.x, i.y]),
    widgets: layout.widgets.map((g) => [g.id, g.x, g.y, g.w, g.h]),
  });
}

/**
 * Which viewport a commit is allowed to claim these coordinates were authored in.
 *
 * `clampLayoutToViewport` already answers this correctly for the hydrate itself,
 * but it is not the only writer: every commit rebuilds the layout from React
 * state and stamps whatever viewport is live at that moment. The very first such
 * commit fires immediately after hydrate (the `hydrating` guard is cleared in a
 * microtask, before React runs the debounced commit effect), so a clamp-mode
 * open used to re-stamp the desk anyway and undo the fit's careful answer.
 *
 * The rule, and the one genuine judgement call in it:
 *
 * - **Nothing hydrated, or a degenerate origin** — there is no origin to protect;
 *   the live viewport is the best thing to record.
 * - **Geometry unchanged since hydrate** — this is the post-hydrate echo. The
 *   coordinates are still exactly the ones the fit returned, so they are still
 *   in the space it said they were. Keep the hydrated origin.
 * - **Geometry changed** — the user has arranged windows *in this viewport*, and
 *   those coordinates really are this viewport's now. Stamp the live size. The
 *   alternative (never re-stamping in clamp mode) would send a desk rearranged
 *   on a 1920 monitor back to its 3440 origin unscaled the next time it opened
 *   proportionally, which is the worse of the two failures: it discards work the
 *   user can see, in exchange for bookkeeping only the opt-in proportional mode
 *   ever reads.
 */
export function resolveAuthoredViewport(opts: {
  /** `authoredW/H` as the fit returned it at the last hydrate, if there was one. */
  hydrated: { w: number; h: number } | null;
  /** The viewport right now. */
  live: { w: number; h: number };
  /** Has anything positional moved since that hydrate? */
  geometryChanged: boolean;
}): { w: number; h: number } {
  const { hydrated, live, geometryChanged } = opts;
  if (!hydrated || hydrated.w <= 0 || hydrated.h <= 0) return live;
  if (geometryChanged) return live;
  return hydrated;
}
