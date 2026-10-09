// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AERO_VIEWPORT_HEIGHT,
  AERO_VIEWPORT_WIDTH,
  resolveAeroViewportGeometry,
} from '../aeroViewport';

/**
 * Native Fill regression: the `[data-aero-fill='on']` frame rule used to set
 * `inset: 0` followed by `left: auto; top: auto; width: auto; height: auto`.
 * With an auto edge an absolutely positioned box shrink-wraps, and the base Aero
 * frame rule's `contain: layout paint size` makes its intrinsic size zero — so
 * the whole desktop (taskbar included) collapsed to 0×0. jsdom does no layout,
 * so the stylesheet is read as text, as in shellLayerScale.test.ts.
 */

const STYLES_CSS = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');

/** Declarations of the first rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = STYLES_CSS.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`Rule not found: ${selector}`);
  const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const decls: Record<string, string> = {};
  for (const part of body.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    decls[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return decls;
}

describe('Aero Native Fill frame CSS', () => {
  const fill = ruleBody(":root[data-materials='aero'][data-aero-fill='on'] .os-viewport-frame");
  const classic = ruleBody(":root[data-materials='aero'] .os-viewport-frame");

  it('pins every edge of the frame to the stage (no auto edge)', () => {
    expect(fill.inset).toBe('0');
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      if (edge in fill) expect(fill[edge]).not.toBe('auto');
    }
  });

  it('gives the frame a definite full-window size instead of auto (contain: size => 0)', () => {
    expect(classic.contain).toMatch(/\bsize\b/);
    expect(fill.width).toBe('100%');
    expect(fill.height).toBe('100%');
    expect(fill.transform).toBe('none');
  });

  it('leaves the default 4:3 stage untouched', () => {
    expect(classic.left).toBe('50%');
    expect(classic.top).toBe('50%');
    expect(classic.width).toBe(`${AERO_VIEWPORT_WIDTH}px`);
    expect(classic.height).toBe(`${AERO_VIEWPORT_HEIGHT}px`);
    expect(classic.transform).toBe('translate(-50%, -50%) scale(var(--os-viewport-scale, 1))');
  });
});

describe('resolveAeroViewportGeometry', () => {
  it('native fill consumes the whole stage with no letterbox', () => {
    expect(resolveAeroViewportGeometry(1920, 1080, true)).toEqual({
      mode: 'native',
      scale: 1,
      renderedWidth: 1920,
      renderedHeight: 1080,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('classic mode letterboxes a 16:9 window to a centred 4:3 stage', () => {
    const g = resolveAeroViewportGeometry(1920, 1080, false);
    expect(g.mode).toBe('classic-4-3');
    expect(g.scale).toBeCloseTo(1080 / 960);
    expect(g.renderedWidth).toBeCloseTo(1440);
    expect(g.renderedHeight).toBeCloseTo(1080);
    expect(g.offsetX).toBeCloseTo(240);
    expect(g.offsetY).toBe(0);
  });
});
