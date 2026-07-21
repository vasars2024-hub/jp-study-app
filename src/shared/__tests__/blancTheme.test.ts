import { describe, expect, it } from 'vitest';
import {
  BLANC_THEME_PRESETS,
  BLANC_THEME_TOKENS,
  exportTheme,
  isSafeThemeColor,
  parseThemeExport,
  presetById,
  sanitizeThemeOverrides,
  themeOverridesToCss,
} from '../blancTheme';

describe('isSafeThemeColor', () => {
  it('accepts hex in every length', () => {
    for (const v of ['#fff', '#ffff', '#ff2e4d', '#ff2e4dcc']) expect(isSafeThemeColor(v)).toBe(true);
  });

  it('accepts rgb/rgba in comma and space syntax', () => {
    for (const v of ['rgb(255,46,77)', 'rgba(255, 46, 77, 0.5)', 'rgb(255 46 77)', 'rgb(255 46 77 / 0.5)']) {
      expect(isSafeThemeColor(v)).toBe(true);
    }
  });

  it('accepts hsl/hsla', () => {
    for (const v of ['hsl(350, 100%, 59%)', 'hsla(350deg 100% 59% / 0.4)']) {
      expect(isSafeThemeColor(v)).toBe(true);
    }
  });

  it('accepts the allowed keywords only', () => {
    expect(isSafeThemeColor('transparent')).toBe(true);
    expect(isSafeThemeColor('white')).toBe(true);
    // Real CSS colours, but not on the short allowlist — explicit beats clever.
    expect(isSafeThemeColor('rebeccapurple')).toBe(false);
  });

  it('rejects CSS injection attempts', () => {
    // The attack the allowlist exists to stop: close the declaration and the
    // rule, then hide the way out of Blanc.
    expect(isSafeThemeColor('red; } .blanc-taskbar { display: none')).toBe(false);
    expect(isSafeThemeColor('#fff; } .blanc-root { display: none')).toBe(false);
    expect(isSafeThemeColor('}')).toBe(false);
  });

  it('rejects functions that could smuggle a value or fetch a resource', () => {
    expect(isSafeThemeColor('url(http://x/y.png)')).toBe(false);
    expect(isSafeThemeColor('var(--anything)')).toBe(false);
    expect(isSafeThemeColor('calc(1px)')).toBe(false);
    expect(isSafeThemeColor('image-set("x.png")')).toBe(false);
    expect(isSafeThemeColor('rgb(var(--x))')).toBe(false);
  });

  it('rejects empty, overlong, and non-string values', () => {
    expect(isSafeThemeColor('')).toBe(false);
    expect(isSafeThemeColor('   ')).toBe(false);
    expect(isSafeThemeColor('#'.padEnd(80, 'f'))).toBe(false);
    expect(isSafeThemeColor(null)).toBe(false);
    expect(isSafeThemeColor(123)).toBe(false);
  });
});

describe('sanitizeThemeOverrides', () => {
  it('keeps known tokens with safe values', () => {
    expect(sanitizeThemeOverrides({ accent: '#ff2e4d', bg: '#000' })).toEqual({
      accent: '#ff2e4d',
      bg: '#000',
    });
  });

  it('drops unknown tokens', () => {
    // Prevents writing an arbitrary custom property name.
    expect(sanitizeThemeOverrides({ 'not-a-token': '#fff' })).toEqual({});
  });

  it('drops unsafe values but keeps the rest of the object', () => {
    expect(sanitizeThemeOverrides({ accent: '#fff', bg: 'red; } * { display:none' })).toEqual({
      accent: '#fff',
    });
  });

  it('handles non-objects', () => {
    for (const v of [null, undefined, 'x', 42, ['#fff']]) expect(sanitizeThemeOverrides(v)).toEqual({});
  });
});

describe('themeOverridesToCss', () => {
  it('emits a scoped rule', () => {
    const css = themeOverridesToCss({ accent: '#ff2e4d' });
    expect(css).toContain('.blanc-root {');
    expect(css).toContain('--blanc-accent: #ff2e4d;');
  });

  it('also scopes to :root so the page background follows the theme', () => {
    // Custom properties inherit downward only, and `body` is a parent of
    // `.blanc-root`. Without :root, theming left the page background on its
    // fallback while the panels changed — caught by rendering it.
    expect(themeOverridesToCss({ bg: '#141011' })).toContain(':root');
  });

  it('emits nothing when there is nothing to override', () => {
    expect(themeOverridesToCss({})).toBe('');
  });

  it('re-validates rather than trusting its input', () => {
    // Last line of defence before the string becomes CSS.
    const css = themeOverridesToCss({ accent: '#fff; } .blanc-taskbar { display: none' });
    expect(css).toBe('');
    expect(css).not.toContain('display');
  });
});

describe('presets', () => {
  it('every preset uses known tokens and safe values', () => {
    for (const preset of BLANC_THEME_PRESETS) {
      expect(sanitizeThemeOverrides(preset.overrides)).toEqual(preset.overrides);
    }
  });

  it('ships the blood preset the plan asked for', () => {
    const blood = presetById('blood');
    expect(blood).toBeDefined();
    expect(blood?.overrides.accent).toBeDefined();
  });

  it('default is a no-op so it falls through to blanc.css', () => {
    expect(presetById('default')?.overrides).toEqual({});
  });

  it('presets are partial, so new tokens do not need editing them', () => {
    const blood = presetById('blood');
    const covered = Object.keys(blood?.overrides ?? {}).length;
    expect(covered).toBeGreaterThan(0);
    expect(covered).toBeLessThan(BLANC_THEME_TOKENS.length + 1);
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    const exported = exportTheme('blood', { accent: '#ff2e4d' });
    const parsed = parseThemeExport(JSON.stringify(exported));
    expect(parsed).toEqual(exported);
  });

  it('rejects malformed or foreign JSON', () => {
    expect(parseThemeExport('not json')).toBeNull();
    expect(parseThemeExport('{}')).toBeNull();
    expect(parseThemeExport('{"version":2}')).toBeNull();
    expect(parseThemeExport('[]')).toBeNull();
  });

  it('sanitizes on import — a hostile file cannot inject CSS', () => {
    const parsed = parseThemeExport(
      '{"version":1,"preset":"x","overrides":{"accent":"#fff; } * { display:none","bg":"#000"}}',
    );
    expect(parsed?.overrides).toEqual({ bg: '#000' });
  });

  it('falls back to the default preset name when absent', () => {
    expect(parseThemeExport('{"version":1,"overrides":{}}')?.preset).toBe('default');
  });
});
