/**
 * wid6 — alignment guides for placing widgets.
 *
 * Dragging snapped to an 8px grid and nothing else, so lining a clock up with
 * the calendar under it was a matter of squinting. While a widget is dragged
 * (or resized), its edges and centre now catch the edges and centres of the
 * other widgets and of the desk itself within SNAP_DISTANCE, and a guide line
 * shows what it caught — the PowerPoint/Figma behaviour. Holding Alt places
 * freely. This module is the geometry, kept pure so it is tested without a DOM.
 */

export const SNAP_DISTANCE = 6;

export interface AlignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A guide line in desk coordinates: vertical (`axis: 'x'`) at `at`, from `from` to `to` along y. */
export interface AlignGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface AlignResult {
  x: number;
  y: number;
  /** Whether each axis caught something (the caller keeps the exact value, not the grid). */
  snappedX: boolean;
  snappedY: boolean;
  guides: AlignGuide[];
}

type Line = { at: number; from: number; to: number };

/** The three lines of a rect along one axis: start, centre, end. */
function lines(r: AlignRect, axis: 'x' | 'y'): number[] {
  return axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h];
}

/** Target lines on one axis: every other widget's three, and the desk's edges and centre. */
function targets(others: readonly AlignRect[], desk: { width: number; height: number }, axis: 'x' | 'y'): Line[] {
  const out: Line[] = [];
  for (const o of others) {
    const span = axis === 'x' ? { from: o.y, to: o.y + o.h } : { from: o.x, to: o.x + o.w };
    for (const at of lines(o, axis)) out.push({ at, ...span });
  }
  const size = axis === 'x' ? desk.width : desk.height;
  const across = axis === 'x' ? desk.height : desk.width;
  for (const at of [0, size / 2, size]) out.push({ at, from: 0, to: across });
  return out;
}

/** The smallest move along one axis that lands one of `mine` on a target, if any is within reach. */
function bestDelta(mine: number[], candidates: Line[], threshold: number): number | null {
  let best: number | null = null;
  for (const m of mine) {
    for (const c of candidates) {
      const d = c.at - m;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

function guidesFor(rect: AlignRect, candidates: Line[], axis: 'x' | 'y'): AlignGuide[] {
  const mine = lines(rect, axis);
  const own = axis === 'x' ? { from: rect.y, to: rect.y + rect.h } : { from: rect.x, to: rect.x + rect.w };
  const out: AlignGuide[] = [];
  const seen = new Set<number>();
  for (const c of candidates) {
    if (!mine.some((m) => Math.abs(m - c.at) < 0.5)) continue;
    const at = Math.round(c.at * 2) / 2;
    const from = Math.min(own.from, c.from);
    const to = Math.max(own.to, c.to);
    if (seen.has(at)) {
      const g = out.find((x) => x.at === at);
      if (g) {
        g.from = Math.min(g.from, from);
        g.to = Math.max(g.to, to);
      }
      continue;
    }
    seen.add(at);
    out.push({ axis, at, from, to });
  }
  return out;
}

/**
 * Snap a dragged widget's position. `rect` is where the pointer put it; the
 * result moves it by at most `threshold` per axis and lists the guides it now
 * sits on.
 */
export function alignMove(
  rect: AlignRect,
  others: readonly AlignRect[],
  desk: { width: number; height: number },
  threshold: number = SNAP_DISTANCE,
): AlignResult {
  const tx = targets(others, desk, 'x');
  const ty = targets(others, desk, 'y');
  const dx = bestDelta(lines(rect, 'x'), tx, threshold);
  const dy = bestDelta(lines(rect, 'y'), ty, threshold);
  const snapped = { ...rect, x: rect.x + (dx ?? 0), y: rect.y + (dy ?? 0) };
  return {
    x: snapped.x,
    y: snapped.y,
    snappedX: dx !== null,
    snappedY: dy !== null,
    guides: [...(dx !== null ? guidesFor(snapped, tx, 'x') : []), ...(dy !== null ? guidesFor(snapped, ty, 'y') : [])],
  };
}

/**
 * Snap a resize: only the far edges move (the frame resizes from its bottom-right
 * corner), so only they catch. Never below `min`.
 */
export function alignResize(
  rect: AlignRect,
  others: readonly AlignRect[],
  desk: { width: number; height: number },
  min: { w: number; h: number },
  threshold: number = SNAP_DISTANCE,
): { w: number; h: number; snappedW: boolean; snappedH: boolean; guides: AlignGuide[] } {
  const tx = targets(others, desk, 'x');
  const ty = targets(others, desk, 'y');
  const dx = bestDelta([rect.x + rect.w], tx, threshold);
  const dy = bestDelta([rect.y + rect.h], ty, threshold);
  const w = Math.max(min.w, rect.w + (dx ?? 0));
  const h = Math.max(min.h, rect.h + (dy ?? 0));
  const snappedW = dx !== null && w === rect.w + dx;
  const snappedH = dy !== null && h === rect.h + dy;
  const sized = { ...rect, w, h };
  const edgeGuides = (axis: 'x' | 'y', candidates: Line[]): AlignGuide[] =>
    guidesFor(sized, candidates, axis).filter((g) => Math.abs(g.at - (axis === 'x' ? sized.x + sized.w : sized.y + sized.h)) < 0.5);
  return {
    w,
    h,
    snappedW,
    snappedH,
    guides: [...(snappedW ? edgeGuides('x', tx) : []), ...(snappedH ? edgeGuides('y', ty) : [])],
  };
}

/**
 * wid7: keep a resize inside the desk. The frame grows from its bottom-right
 * corner, so its far edges may not pass the desk's right and bottom edges —
 * dragging the grip past them used to leave the widget's lower half under the
 * taskbar or off-screen, where its own grip could no longer be reached. The
 * minimum size still wins over the desk (a widget placed near the edge keeps
 * its minimum rather than collapsing below it).
 */
export function clampResizeToDesk(
  rect: AlignRect,
  desk: { width: number; height: number },
  min: { w: number; h: number },
): { w: number; h: number } {
  const maxW = Math.max(min.w, desk.width - rect.x);
  const maxH = Math.max(min.h, desk.height - rect.y);
  return {
    w: Math.min(Math.max(rect.w, min.w), maxW),
    h: Math.min(Math.max(rect.h, min.h), maxH),
  };
}
