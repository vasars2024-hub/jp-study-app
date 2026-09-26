/**
 * V11 / K11 round 2: the text colours the visual scan measured under 4.5:1 and
 * the targets it measured under 24px, pinned at their source.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** A stylesheet with its comments removed, so a rule is judged by its declarations. */
const css = (rel: string) =>
  readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('aero text contrast', () => {
  const aero = css('theme/frutiger-aero.css');
  const token = (name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(aero)?.[1] ?? '';

  it('--muted reads at 4.5:1 on the pale glass, the sidebar and the panel', () => {
    for (const ground of ['#9ed8f2', '#d2e5ed', '#f7fbf7']) {
      expect(ratio(token('muted'), ground), ground).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('status colours used as text are remapped for the light theme', () => {
    expect(aero).toMatch(/--warning-text: color-mix\(in srgb, var\(--warning\) 30%, var\(--text\)\)/);
    expect(aero).toMatch(/--danger-text: color-mix/);
  });

  it('window titles are dark ink, not white on the pale title bar', () => {
    const block = /\.fwin:not\(\.fwin-note\) \.fwin-title \{[^}]*\}/.exec(css('theme/aero-shell.css'))?.[0] ?? '';
    const color = /color: (#[0-9a-f]{6})/.exec(block)?.[1] ?? '#ffffff';
    expect(ratio(color, '#dbf5ff')).toBeGreaterThanOrEqual(4.5);
  });

  it('the active settings row and the group labels do not use white or opacity', () => {
    const apps = css('theme/aero-apps.css');
    expect(/\.os-set-nav-item\.active \{[^}]*color: var\(--text\)/.test(apps)).toBe(true);
    const label = /\.os-set-nav-group-label \{[^}]*\}/.exec(apps)?.[0] ?? '';
    expect(label).not.toMatch(/opacity/);
  });
});

describe('calendar and badges', () => {
  it('out-of-month days are not faded with opacity', () => {
    const rule = /\.cal-month-cell\.out \{[^}]*\}/.exec(css('styles.css'))?.[0] ?? '';
    expect(rule).not.toMatch(/opacity/);
  });

  it('the scraper tool badge has its own ground and a text-strength green', () => {
    const rule = /\.scr-tool-badge \{[^}]*\}/.exec(css('components/scraper/scraper.css'))?.[0] ?? '';
    expect(rule).toMatch(/background:/);
    expect(rule).toMatch(/color: color-mix\(in srgb, var\(--status-success\) \d+%, var\(--text\)\)/);
  });
});

describe('target size floor', () => {
  it('grade, immersion-mode and aero menu buttons are at least 24px tall', () => {
    const styles = css('styles.css');
    expect(/\.wk-grade-btn \{[^}]*min-height: 24px/.test(styles)).toBe(true);
    expect(/\.immersion-mode-btn \{[^}]*min-height: 24px/.test(styles)).toBe(true);
    const apps = css('theme/aero-apps.css');
    const menu = [...apps.matchAll(/\.ui-menubar__btn \{[^}]*\}/g)].map((m) => m[0]);
    expect(menu.some((r) => /min-height: 24px/.test(r))).toBe(true);
    expect(menu.some((r) => /min-height: 21px/.test(r))).toBe(false);
  });
});
