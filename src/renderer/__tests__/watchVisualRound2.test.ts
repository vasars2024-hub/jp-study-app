// @vitest-environment node
/**
 * V10, the Watch window's visual fixes:
 *
 * - one name: the Watch window's pop-out title is "Watch" (Start, taskbar and title bar
 *   already said so; its own header and pop-out said "Media Center");
 * - the always-visible download / "more" glyph sits in the card's corner, not over the
 *   centre, where it covered the title of a poster drawn from type;
 * - the "last import" line and the other green ink reach 4.5:1 in the light palettes
 *   (the dark default measured 1.76:1 on Classic Light).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { popoutLabel } from '../popoutLabels';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe('Watch visual fixes (V10)', () => {
  it('the Watch pop-out is titled Watch in every language', () => {
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const catalog = CATALOGS[lang] as Record<string, string>;
      const t = (key: string): string => catalog[key] ?? key;
      expect(popoutLabel(t, 'player')).toBe(catalog['palette.section.watch']);
    }
    expect(read('views/MediaCenterView.tsx')).toMatch(/gum-brand__name">\{t\('palette\.section\.watch'\)\}/);
  });

  it('the always-shown download glyph is in the corner, not over the poster title', () => {
    const css = read('components/media/gum/gum.css');
    const start = css.indexOf(".gum-ep-card__play[data-icon='download'],");
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toMatch(/left: 10px/);
    expect(block).toMatch(/top: 10px/);
    expect(block).not.toMatch(/50%/);
  });

  it('green ink in the light palettes reads at 4.5:1 or better on white', () => {
    const css = read('views/mediaCenter.css');
    const light = css.slice(css.indexOf(":root[data-theme='classic-light'] .mc-root,"));
    const green = /--mc-green: (#[0-9a-f]{6});/i.exec(light)?.[1];
    expect(green, 'the light block re-sources --mc-green').toBeTruthy();
    expect(contrast(green ?? '#ffffff', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // The dark default it replaces, for the record.
    expect(contrast('#69d8a1', '#ffffff')).toBeLessThan(2);
  });
});
