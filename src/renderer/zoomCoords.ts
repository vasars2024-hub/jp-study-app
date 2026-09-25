/**
 * Zoom-aware coordinate helpers.
 *
 * The app scales UI with CSS `zoom` on #root (see appZoom.ts). Chromium reports
 * pointer positions (clientX/clientY) in UNZOOMED physical viewport pixels,
 * while layout coordinates live in ZOOMED CSS pixels. Convert with getZoomFactor().
 */

import { getZoomFactor } from './appZoom';

export function zoomFactor(): number {
  return getZoomFactor();
}

export interface LayoutPoint {
  x: number;
  y: number;
}

/** Convert a pointer event's client coords into layout (zoomed) coords. */
export function toLayoutPoint(clientX: number, clientY: number): LayoutPoint {
  const z = zoomFactor();
  return { x: clientX / z, y: clientY / z };
}

/**
 * Clamp a menu/popup position so an estimated width×height box stays inside
 * the visible layout viewport.
 */
export function clampToViewport(point: LayoutPoint, width: number, height: number): LayoutPoint {
  const z = zoomFactor();
  const vw = window.innerWidth / z;
  const vh = window.innerHeight / z;
  return {
    x: Math.max(4, Math.min(point.x, vw - width - 4)),
    y: Math.max(4, Math.min(point.y, vh - height - 4)),
  };
}

/** A box in layout (zoomed CSS) pixels — what `style.left/top/width/height` inside #root mean. */
export interface LayoutRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Convert a `getBoundingClientRect()` box (viewport pixels, already scaled by the
 * #root zoom) into layout pixels. Anything placed with `position: fixed/absolute`
 * INSIDE #root must go through this: its `left/top` are multiplied by the zoom
 * again, so a raw client rect lands at 80% of the way to the anchor at 80% zoom.
 */
export function toLayoutRect(rect: { top: number; left: number; width: number; height: number }): LayoutRect {
  const z = zoomFactor();
  const top = rect.top / z;
  const left = rect.left / z;
  const width = rect.width / z;
  const height = rect.height / z;
  return { top, left, width, height, right: left + width, bottom: top + height };
}

/** The window's size in layout pixels (`innerWidth/innerHeight` are viewport pixels). */
export function layoutViewport(): { width: number; height: number } {
  const z = zoomFactor();
  return { width: window.innerWidth / z, height: window.innerHeight / z };
}
