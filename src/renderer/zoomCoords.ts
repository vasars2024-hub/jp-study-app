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
