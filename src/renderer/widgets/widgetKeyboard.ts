/**
 * wid5 — moving and resizing a widget without a pointer.
 *
 * The frame's drag and resize were pointer-only: a keyboard user could add a
 * widget and never place it. "Move or resize" in the widget's menu now enters a
 * keyboard mode (the Windows Alt+Space pattern): arrow keys move, Shift+arrows
 * resize, Ctrl makes either step five times larger, Enter keeps the result and
 * Escape puts the widget back where it was. This module is the arithmetic, kept
 * pure so it is tested without a DOM.
 */

export const WIDGET_GRID = 8;
export const WIDGET_BIG_STEP = 5;

export interface WidgetGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NudgeBounds {
  /** Usable desk width and height (taskbar already subtracted). */
  width: number;
  height: number;
}

export type NudgeKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export function isNudgeKey(key: string): key is NudgeKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

/**
 * The geometry after one key press. Moves keep at least 60 x 30 px of the
 * widget on the desk (the same margin the pointer drag keeps); resizes never go
 * below `min` and never past the desk's far edge.
 */
export function nudgeWidget(
  geom: WidgetGeometry,
  key: NudgeKey,
  mods: { shift: boolean; ctrl: boolean },
  bounds: NudgeBounds,
  min: { w: number; h: number },
): WidgetGeometry {
  const step = WIDGET_GRID * (mods.ctrl ? WIDGET_BIG_STEP : 1);
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  if (mods.shift) {
    const maxW = Math.max(min.w, bounds.width - geom.x);
    const maxH = Math.max(min.h, bounds.height - geom.y);
    return {
      ...geom,
      w: Math.min(maxW, Math.max(min.w, geom.w + dx)),
      h: Math.min(maxH, Math.max(min.h, geom.h + dy)),
    };
  }
  return {
    ...geom,
    x: Math.min(Math.max(0, geom.x + dx), Math.max(0, bounds.width - 60)),
    y: Math.min(Math.max(0, geom.y + dy), Math.max(0, bounds.height - 30)),
  };
}
