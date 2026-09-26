/**
 * Settings › Companions: each pack's sprite sits inside its tile's icon chip.
 * The design system's chip is 36px; the 44px sprite spilled past its rounded
 * square on every side (measured on the packaged build: 40px of content in a
 * 36px box). The gallery's chip must hold the sprite. jsdom has no layout, so
 * the two sizes are read from the stylesheets.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const CARD = read('components/settings/pages/CompanionPacksCard.css');

function px(css: string, selector: string, prop: 'width' | 'height'): number {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`\\b${prop}:\\s*(\\d+)px`).exec(body);
  if (!m) throw new Error(`no ${prop} on ${selector}`);
  return Number(m[1]);
}

describe('companion pack gallery', () => {
  it('its icon chip is at least as large as the sprite drawn in it', () => {
    for (const prop of ['width', 'height'] as const) {
      expect(px(CARD, '.companion-pack-gallery .ui-tile__icon', prop)).toBeGreaterThanOrEqual(px(CARD, '.companion-pack-preview', prop));
    }
  });
});
