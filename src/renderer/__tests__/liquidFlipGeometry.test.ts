/**
 * V12 layout jumps (Gum filter bar, Game Arena): switching a window to Liquid is
 * presentation only, so a region that takes `.lq-contextual`'s material must keep its box.
 * `.lq-contextual` in a Liquid window adds an inset and a 1px edge; these regions either pay
 * it back with an equal negative margin (the Gum toolbar) or carry the same inset and a
 * transparent edge in both presentations (Game Arena). jsdom has no layout, so the
 * declarations are compared at their source.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (rel: string) =>
  readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(sheet: string, selectorTail: string): string {
  const at = sheet.indexOf(`${selectorTail} {`);
  expect(at, selectorTail).toBeGreaterThanOrEqual(0);
  return sheet.slice(at, sheet.indexOf('}', at));
}

const px = (body: string, prop: string): number => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?\\d+)px`).exec(body);
  return m ? Number(m[1]) : Number.NaN;
};

describe('Liquid flip keeps geometry', () => {
  it('the Gum toolbar card grows outward by exactly its padding and edge', () => {
    const body = rule(css('components/media/gum/gum.css'), '.gum-toolbar.lq-contextual');
    const liquidEdge = /border:\s*1px solid/.test(rule(css('theme/liquid-window.css'), ') .lq-contextual')) ? 1 : 0;
    expect(liquidEdge).toBe(1);
    expect(px(body, 'margin')).toBe(-(px(body, 'padding') + liquidEdge));
  });

  it('Game Arena header and stage rows carry the Liquid inset and edge conventionally', () => {
    const liquid = rule(css('theme/liquid-window.css'), ') .lq-contextual');
    expect(liquid).toMatch(/padding:\s*var\(--lq-space-3\)/);
    expect(liquid).toMatch(/border:\s*1px solid/);
    const arena = css('components/games/gameArenaLiquid.css');
    const shared = rule(arena, '.game-stage .lq-contextual');
    expect(arena).toMatch(/\.game-arena > \.game-arena-top\.lq-contextual,\s*\n\.game-stage \.lq-contextual \{/);
    expect(shared).toMatch(/padding:\s*var\(--lq-space-3\)/);
    expect(shared).toMatch(/border:\s*1px solid transparent/);
    // In Liquid the edge colour is the material's again, at a specificity above the rule above.
    expect(arena).toMatch(/\.seanime-host\.workspace-liquid\) \.game-arena \.lq-contextual \{\s*border-color: var\(--lq-liquid-border\)/);
  });
});
