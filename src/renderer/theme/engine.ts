/**
 * Frutiger Aero Platform — Theme Engine (authoritative) · Phase 1 · M2
 * -----------------------------------------------------------------------------
 * Formalises theming into one registry + a small, documented API. A theme is
 * still applied by stamping `data-theme="<id>"` on <html> (all component CSS
 * reads CSS variables, so switching restyles instantly), but themes now carry
 * richer metadata:
 *
 *   - kind        base | aero | anime | custom
 *   - hidden      excluded from the normal picker (e.g. the secret Aero theme)
 *   - materialSet stamped as `data-materials="<id>"` (enables glass in M3)
 *   - assetPack   future wallpapers/icons/sounds pack (resolved in M10)
 *   - dataAttrs   extra data-* attributes applied while the theme is active
 *   - version     bump when a theme's token contract changes (migration hook)
 *
 * `theme.ts` re-exports this module as a back-compat facade, so existing
 * imports (`THEMES`, `applyTheme`, `bootTheme`, `loadThemeId`, …) keep working.
 */

export type ThemeKind = 'base' | 'aero' | 'anime' | 'custom';

/** Reference to a swappable asset bundle (wallpapers / icons / sounds). Fully
 *  resolved in M10; here it is only carried as metadata. */
export interface AssetPackRef {
  id: string;
  wallpapers?: string;
  icons?: string;
  sounds?: string;
}

export interface Theme {
  id: string;
  label: string;
  kind: ThemeKind;
  /** Hidden themes never appear in the normal picker. */
  hidden?: boolean;
  /** Light vs dark base — CSS uses this for shadow/grid handling. */
  light: boolean;
  /** Swatch colors for pickers. */
  swatch: { bg: string; text: string; border: string };
  /** Contract version; bump to trigger future per-theme migrations. */
  version: number;
  /** Material set id → `data-materials="<id>"` on <html> while active. */
  materialSet?: string;
  /** Swappable asset pack (Anime Edition et al.). */
  assetPack?: AssetPackRef;
  /** Extra data-* attributes to stamp while active (auto-cleared on switch). */
  dataAttrs?: Record<string, string>;
}

/** `data-theme` is omitted entirely for the default look. */
export const DEFAULT_THEME_ID = 'study-os';

/** Bump when the ENGINE's persisted contract changes (not per-theme). */
export const THEME_ENGINE_VERSION = 1;

const THEME_KEY = 'jp-os-theme';
const ENGINE_VERSION_KEY = 'jp-os-theme-engine-v';
const EVENT = 'jp-theme-changed';

/** The 13 built-in themes (formerly the `THEMES` array in theme.ts). */
const BASE_THEMES: Theme[] = [
  { id: 'study-os', label: 'Study OS (default)', kind: 'base', version: 1, light: false, swatch: { bg: '#0f0e13', text: '#f5f4f7', border: '#2d2b37' } },
  { id: 'classic-light', label: 'Classic Light', kind: 'base', version: 1, light: true, swatch: { bg: '#ffffff', text: '#1e1e1e', border: '#e0e0e0' } },
  { id: 'dark-nebula', label: 'Dark Nebula', kind: 'base', version: 1, light: false, swatch: { bg: '#0d0d1a', text: '#c0caf5', border: '#2a2a4a' } },
  { id: 'soft-sepia', label: 'Soft Sepia', kind: 'base', version: 1, light: true, swatch: { bg: '#fbf3e8', text: '#5b4637', border: '#d4c5a9' } },
  { id: 'ocean-blue', label: 'Ocean Blue', kind: 'base', version: 1, light: true, swatch: { bg: '#eef5ff', text: '#1a3a5c', border: '#b8d0e8' } },
  { id: 'high-contrast', label: 'High Contrast', kind: 'base', version: 1, light: false, swatch: { bg: '#000000', text: '#ffff00', border: '#ffffff' } },
  { id: 'mint-green', label: 'Mint Green', kind: 'base', version: 1, light: true, swatch: { bg: '#f0faf5', text: '#1f4e3d', border: '#b8e0cc' } },
  { id: 'rose-pine', label: 'Rose Pine', kind: 'base', version: 1, light: true, swatch: { bg: '#faf0ed', text: '#6e3a3a', border: '#e6d0cd' } },
  { id: 'oled-black', label: 'OLED Black', kind: 'base', version: 1, light: false, swatch: { bg: '#000000', text: '#e8e8e8', border: '#2a2a2a' } },
  { id: 'midnight-ink', label: 'Midnight Ink', kind: 'base', version: 1, light: false, swatch: { bg: '#0b1220', text: '#d7e3f4', border: '#1e2a3c' } },
  { id: 'paper', label: 'Paper', kind: 'base', version: 1, light: true, swatch: { bg: '#f7f4ef', text: '#2c2a26', border: '#ddd6cb' } },
  { id: 'cyberpunk', label: 'Cyberpunk', kind: 'base', version: 1, light: false, swatch: { bg: '#12081a', text: '#f0e6ff', border: '#3d1f5c' } },
  { id: 'forest-night', label: 'Forest Night', kind: 'base', version: 1, light: false, swatch: { bg: '#0c1410', text: '#d8ebe0', border: '#24352c' } },
];

const registry = new Map<string, Theme>();
for (const t of BASE_THEMES) registry.set(t.id, t);

/** Register (or replace) a theme. Later phases add Frutiger Aero / Anime here. */
export function registerTheme(theme: Theme): void {
  registry.set(theme.id, theme);
}

export function getTheme(id: string): Theme | undefined {
  return registry.get(id);
}

export function isThemeRegistered(id: string): boolean {
  return registry.has(id);
}

/** All themes; hidden ones excluded unless `includeHidden` is set. */
export function listThemes(opts?: { includeHidden?: boolean }): Theme[] {
  const all = [...registry.values()];
  return opts?.includeHidden ? all : all.filter((t) => !t.hidden);
}

export function loadThemeId(): string {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && registry.has(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME_ID;
}

/** Keys we stamped for the previous theme, cleared before applying the next. */
let managedAttrs: string[] = [];

/** Apply a theme's extended attributes (materials / dataAttrs) to <html>. */
export function applyThemeAttributes(id: string): void {
  const root = document.documentElement;
  for (const k of managedAttrs) root.removeAttribute(k);
  managedAttrs = [];
  const theme = registry.get(id);
  if (!theme) return;
  if (theme.materialSet) {
    root.setAttribute('data-materials', theme.materialSet);
    managedAttrs.push('data-materials');
  }
  if (theme.dataAttrs) {
    for (const [k, v] of Object.entries(theme.dataAttrs)) {
      root.setAttribute(k, v);
      managedAttrs.push(k);
    }
  }
}

/**
 * Apply a theme: stamp `data-theme` (omitted for default), apply extended
 * attributes, persist, and broadcast. This is the single choke point for
 * theme changes, so any listener (React context) sees every switch.
 */
export function applyTheme(id: string): void {
  const theme = registry.get(id) ?? registry.get(DEFAULT_THEME_ID)!;
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME_ID) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme.id);
  }
  applyThemeAttributes(theme.id);
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme.id }));
}

/** Semantic alias — new code should prefer `setTheme`. */
export const setTheme = applyTheme;

/**
 * Forward-compat migration hook for the engine's persisted state. Currently a
 * no-op beyond recording the version marker; future engine changes can remap
 * stored ids / prefs here based on the previous value.
 */
export function runThemeMigrations(): void {
  try {
    const prev = Number.parseInt(localStorage.getItem(ENGINE_VERSION_KEY) ?? '0', 10) || 0;
    if (prev < THEME_ENGINE_VERSION) {
      // (no migrations yet)
      localStorage.setItem(ENGINE_VERSION_KEY, String(THEME_ENGINE_VERSION));
    }
  } catch {
    /* storage unavailable */
  }
}

/** Apply the saved theme before first paint (called from main.tsx via facade). */
export function bootThemeEngine(): void {
  runThemeMigrations();
  applyTheme(loadThemeId());
}

export function onThemeChanged(cb: (id: string) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
