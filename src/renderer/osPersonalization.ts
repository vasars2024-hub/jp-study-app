/**
 * Classic Study OS look preferences (density, radius, chrome, accent, dim…).
 * Applied as CSS variables / data attributes on <html>; small state in localStorage.
 */

import { writeLocalStorage, writeLocalStorageJson } from './localStorageWrite';

export type DensityId = 'compact' | 'comfortable' | 'spacious';
export type RadiusId = 'sharp' | 'soft' | 'round';
export type ChromeMaterialId = 'solid' | 'frosted';
export type ShadowStrengthId = 'none' | 'soft' | 'deep';
export type FontFamilyId = 'segoe' | 'system' | 'jp-first';

export interface OsPersonalization {
  /** 'preset' uses accentPreset id; 'custom' uses customAccent hex. */
  accentMode: 'preset' | 'custom';
  accentPreset: string;
  customAccent: string;
  density: DensityId;
  radius: RadiusId;
  chrome: ChromeMaterialId;
  shadow: ShadowStrengthId;
  fontFamily: FontFamilyId;
  /** 0–0.75 dim overlay on wallpaper for icon readability. */
  wallpaperDim: number;
  /** Follow OS light/dark (overrides manual theme while on). */
  autoTheme: boolean;
  /**
   * User CSS sandbox (also mirrored in customCss.ts storage for the style tag).
   * Kept here so "reset look" can clear it in one place.
   */
  customCssEnabled: boolean;
}

const KEY = 'jp-os-personalization-v1';
const EVENT = 'jp-os-personalization-changed';
const ACCENT_KEY = 'jp-os-accent';

export const ACCENT_PRESETS: { id: string; label: string; accent: string; light: string; deep: string }[] = [
  { id: 'crimson', label: 'Crimson', accent: '#ff2e4d', light: '#ff6b81', deep: '#d21734' },
  { id: 'scarlet', label: 'Scarlet', accent: '#ff3b30', light: '#ff7a72', deep: '#c81e14' },
  { id: 'rose', label: 'Rose', accent: '#ff4d6d', light: '#ff89a0', deep: '#d61f45' },
  { id: 'ruby', label: 'Ruby', accent: '#e01e37', light: '#ff5c72', deep: '#a5122a' },
  { id: 'ember', label: 'Ember', accent: '#ff5630', light: '#ff8a6b', deep: '#cc3311' },
  { id: 'violet', label: 'Violet', accent: '#a855f7', light: '#c084fc', deep: '#7e22ce' },
  { id: 'azure', label: 'Azure', accent: '#3b82f6', light: '#60a5fa', deep: '#1d4ed8' },
  { id: 'mint', label: 'Mint', accent: '#10b981', light: '#34d399', deep: '#047857' },
  { id: 'amber', label: 'Amber', accent: '#f59e0b', light: '#fbbf24', deep: '#b45309' },
];

const DEFAULTS: OsPersonalization = {
  accentMode: 'preset',
  accentPreset: 'crimson',
  customAccent: '#ff2e4d',
  density: 'comfortable',
  radius: 'soft',
  chrome: 'solid',
  shadow: 'soft',
  fontFamily: 'segoe',
  wallpaperDim: 0,
  autoTheme: false,
  customCssEnabled: true,
};

const RADIUS: Record<RadiusId, { sm: string; md: string; lg: string }> = {
  sharp: { sm: '2px', md: '4px', lg: '6px' },
  soft: { sm: '6px', md: '8px', lg: '12px' },
  round: { sm: '10px', md: '14px', lg: '20px' },
};

const DENSITY: Record<DensityId, { xs: string; sm: string; md: string; lg: string; xl: string; pad: string }> = {
  compact: { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px', pad: '6px 10px' },
  comfortable: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', pad: '8px 12px' },
  spacious: { xs: '6px', sm: '12px', md: '16px', lg: '22px', xl: '32px', pad: '10px 14px' },
};

const SHADOW: Record<ShadowStrengthId, { card: string; toolbar: string }> = {
  none: { card: 'none', toolbar: 'none' },
  soft: {
    card: '0 2px 12px rgba(0, 0, 0, 0.22)',
    toolbar: '0 1px 4px rgba(0, 0, 0, 0.16)',
  },
  deep: {
    card: '0 8px 28px rgba(0, 0, 0, 0.4)',
    toolbar: '0 2px 10px rgba(0, 0, 0, 0.28)',
  },
};

const FONT: Record<FontFamilyId, string> = {
  segoe: "'Segoe UI', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif",
  system: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  'jp-first': "'Yu Gothic UI', 'Noto Sans JP', 'Meiryo', 'Segoe UI', system-ui, sans-serif",
};

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.75, Math.max(0, n));
}

function mixHex(hex: string, toward: 'white' | 'black', amount: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = toward === 'white' ? 255 : 0;
  const m = (c: number) => Math.round(c + (t - c) * amount);
  const to = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to(m(r))}${to(m(g))}${to(m(b))}`;
}

export function applyAccentColors(accent: string, light?: string, deep?: string): void {
  const r = document.documentElement.style;
  const a = accent.startsWith('#') ? accent : `#${accent}`;
  r.setProperty('--accent', a);
  r.setProperty('--accent-2', light ?? mixHex(a, 'white', 0.28));
  r.setProperty('--red', a);
  r.setProperty('--red-deep', deep ?? mixHex(a, 'black', 0.22));
}

/** Inline custom properties this module owns, so it can hand them back. */
const ACCENT_VARS = ['--accent', '--accent-2', '--red', '--red-deep'];

/**
 * Themes that ship their own accent palette: Frutiger Aero and WIRED ARCHIVE.
 *
 * Both stamp `data-materials`, and both define `--accent`/`--accent-2` in their
 * stylesheets. Personalization writes those same properties INLINE on <html>,
 * and an inline property beats any stylesheet — so the Study OS accent (crimson
 * by default) was silently overriding both secret themes. Every `var(--accent)`
 * surface inside them rendered pink, which is why WIRED's locked cyan/amber
 * palette leaked red and Aero's aqua did too.
 */
function themeOwnsAccent(): boolean {
  if (typeof document === 'undefined') return false;
  const material = document.documentElement.getAttribute('data-materials');
  return material === 'aero' || material === 'wired';
}

function applyAccentFromSettings(s: OsPersonalization): void {
  if (themeOwnsAccent()) {
    // Release the inline properties so the theme's own stylesheet wins. They
    // are re-applied the moment the user returns to a Study OS theme.
    const st = document.documentElement.style;
    for (const v of ACCENT_VARS) st.removeProperty(v);
    return;
  }
  if (s.accentMode === 'custom') {
    applyAccentColors(s.customAccent);
    return;
  }
  const p = ACCENT_PRESETS.find((x) => x.id === s.accentPreset) ?? ACCENT_PRESETS[0];
  applyAccentColors(p.accent, p.light, p.deep);
}

export function loadPersonalization(): OsPersonalization {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OsPersonalization>;
      return {
        ...DEFAULTS,
        ...parsed,
        wallpaperDim: clampDim(parsed.wallpaperDim ?? DEFAULTS.wallpaperDim),
      };
    }
    // Migrate legacy accent key once.
    const legacy = localStorage.getItem(ACCENT_KEY);
    if (legacy && ACCENT_PRESETS.some((a) => a.id === legacy)) {
      return { ...DEFAULTS, accentPreset: legacy };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function applyPersonalization(s: OsPersonalization): void {
  const root = document.documentElement;
  const st = root.style;
  const dens = DENSITY[s.density] ?? DENSITY.comfortable;
  const rad = RADIUS[s.radius] ?? RADIUS.soft;
  const sh = SHADOW[s.shadow] ?? SHADOW.soft;

  st.setProperty('--space-xs', dens.xs);
  st.setProperty('--space-sm', dens.sm);
  st.setProperty('--space-md', dens.md);
  st.setProperty('--space-lg', dens.lg);
  st.setProperty('--space-xl', dens.xl);
  st.setProperty('--control-pad', dens.pad);

  st.setProperty('--radius-sm', rad.sm);
  st.setProperty('--radius-md', rad.md);
  st.setProperty('--radius-lg', rad.lg);

  st.setProperty('--shadow-card', sh.card);
  st.setProperty('--shadow-toolbar', sh.toolbar);

  st.setProperty('--font-body', FONT[s.fontFamily] ?? FONT.segoe);
  st.setProperty('--wallpaper-dim', String(clampDim(s.wallpaperDim)));

  root.dataset.chrome = s.chrome;
  root.dataset.density = s.density;
  root.dataset.radius = s.radius;
  root.dataset.shadow = s.shadow;

  applyAccentFromSettings(s);

  // Re-apply sandbox CSS only when enabled (content lives in customCss storage).
  if (s.customCssEnabled === false) {
    document.getElementById('jp-user-css')?.remove();
  } else {
    void import('./customCss').then(({ applyCustomCss, loadCustomCss }) => {
      applyCustomCss(loadCustomCss());
    });
  }
}

/** Apply OS light/dark when autoTheme is enabled — visual only; does not overwrite jp-os-theme. */
export function applyAutoThemeIfEnabled(s: OsPersonalization = loadPersonalization()): void {
  if (!s.autoTheme) return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  void import('./theme').then(({ applyTheme, DEFAULT_THEME_ID }) => {
    applyTheme(dark ? DEFAULT_THEME_ID : 'classic-light', { persist: false });
  });
}

export function savePersonalization(partial: Partial<OsPersonalization>): OsPersonalization {
  const prev = loadPersonalization();
  const next: OsPersonalization = {
    ...prev,
    ...partial,
    wallpaperDim: clampDim(partial.wallpaperDim ?? prev.wallpaperDim),
  };
  writeLocalStorageJson(KEY, next);
  if (next.accentMode === 'preset') writeLocalStorage(ACCENT_KEY, next.accentPreset);
  applyPersonalization(next);
  const autoTurnedOff = partial.autoTheme === false && prev.autoTheme;
  if (autoTurnedOff) {
    // Re-apply the persisted manual theme that auto-theme had been masking.
    void import('./theme').then(({ applyTheme, loadThemeId }) => {
      applyTheme(loadThemeId());
    });
  } else if (partial.autoTheme != null || next.autoTheme) {
    applyAutoThemeIfEnabled(next);
  }
  window.dispatchEvent(new CustomEvent<OsPersonalization>(EVENT, { detail: next }));
  return next;
}

let themeListenerBound = false;
let autoThemeMql: MediaQueryList | null = null;
let autoThemeHandler: (() => void) | null = null;

export function bootPersonalization(): void {
  const s = loadPersonalization();
  applyPersonalization(s);
  applyAutoThemeIfEnabled(s);
  if (autoThemeMql && autoThemeHandler) {
    autoThemeMql.removeEventListener('change', autoThemeHandler);
  }
  autoThemeMql = window.matchMedia('(prefers-color-scheme: dark)');
  autoThemeHandler = () => applyAutoThemeIfEnabled(loadPersonalization());
  autoThemeMql.addEventListener('change', autoThemeHandler);

  // Whether the theme owns the accent is decided by `data-materials`, which
  // only changes on a theme switch. Without this the inline accent stays
  // whatever it was at boot: entering a secret theme kept Study OS crimson,
  // and leaving one left the accent released and unstyled.
  if (!themeListenerBound) {
    themeListenerBound = true;
    void import('./theme/engine').then(({ onThemeChanged }) => {
      onThemeChanged(() => applyAccentFromSettings(loadPersonalization()));
    });
  }
}

export function onPersonalizationChanged(cb: (s: OsPersonalization) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<OsPersonalization>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Reset look prefs to defaults and clear the custom CSS sandbox. */
export function resetLook(): OsPersonalization {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ACCENT_KEY);
  } catch {
    /* ignore */
  }
  void import('./customCss').then(({ clearCustomCss }) => clearCustomCss());
  const next = { ...DEFAULTS };
  applyPersonalization(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<OsPersonalization>(EVENT, { detail: next }));
  return next;
}
