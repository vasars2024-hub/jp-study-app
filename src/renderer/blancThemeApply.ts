// Applies a Blanc theme to the document (Pillar 4).
//
// The theme is a set of CSS custom properties layered over `.blanc-root`, so it
// is injected as a single <style> element rather than written onto the element
// inline: inline styles would have to be re-applied to every root, and they lose
// to `.blanc-root.is-dark`'s own declarations, which are a class rule.
//
// The element is appended last in <head>, so it wins over blanc.css at equal
// specificity — that is the point, and it is safe because the *values* are
// allowlist-validated in shared/blancTheme.ts. Nothing here trusts its input:
// `themeOverridesToCss` re-validates before emitting.

import {
  presetById,
  themeOverridesToCss,
  type BlancThemeOverrides,
} from '../shared/blancTheme';

const STYLE_ID = 'blanc-theme-overrides';

/**
 * Resolve preset + user overrides into the final token map.
 *
 * User overrides win per-token, so picking "Blood" and then changing only the
 * accent keeps the rest of Blood rather than reverting to the defaults.
 */
export function resolveTheme(preset: string, overrides: BlancThemeOverrides): BlancThemeOverrides {
  return { ...(presetById(preset)?.overrides ?? {}), ...overrides };
}

/** Write (or clear) the theme style element. Safe to call on every change. */
export function applyBlancTheme(preset: string, overrides: BlancThemeOverrides): void {
  if (typeof document === 'undefined') return;
  const css = themeOverridesToCss(resolveTheme(preset, overrides));
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!css) {
    // Remove rather than leave an empty tag, so "default" is indistinguishable
    // from never having themed at all.
    el?.remove();
    return;
  }

  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  } else if (el !== document.head.lastElementChild) {
    // Keep it last: another stylesheet appended later would otherwise win ties.
    document.head.appendChild(el);
  }
  el.textContent = css;
}
