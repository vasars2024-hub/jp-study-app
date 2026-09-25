/**
 * Round-2 visual audit, stylesheet-level fixes that have no behaviour to render:
 * - V6: no `scrollbar-width` / `scrollbar-color` on `*`. Chromium honours those standard
 *   properties and then ignores every `::-webkit-scrollbar` rule, so the themed thin thumb
 *   was the native bar with arrow buttons (and `transparent` hid it until hover).
 * - V8: the visualizer settings label is a floor, not a fixed width, and the accent
 *   swatches wrap.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, '../styles.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('scrollbars (V6)', () => {
  it('no universal rule sets the standard scrollbar properties', () => {
    const universal = [...CSS.matchAll(/(^|\n)(\*(?::[a-z-]+)?(?:,\s*\*(?::[a-z-]+)?)*)\s*\{([^}]*)\}/g)];
    for (const m of universal) {
      expect(m[3], `rule ${m[2]}`).not.toMatch(/scrollbar-(width|color)/);
    }
    // The webkit styling it used to override is still there.
    expect(CSS).toMatch(/\*::-webkit-scrollbar \{/);
  });
});

describe('settings rows (V8)', () => {
  it('the visualizer label may grow, and the accent row wraps', () => {
    expect(block('.os-viz-label')).toMatch(/min-width: 62px/);
    expect(block('.os-viz-label')).not.toMatch(/\n {2}width:/);
    expect(block('.os-accent-row')).toMatch(/flex-wrap: wrap/);
  });
});
