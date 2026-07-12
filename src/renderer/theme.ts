/**
 * Theme engine.
 *
 * A theme is a named set of color overrides applied by stamping
 * `data-theme="<id>"` on <html>. All component CSS reads colors through the
 * CSS variables defined in styles.css, so switching the attribute restyles
 * the whole app instantly — no reload, no per-component work.
 *
 * The selected theme id lives in localStorage (small UI state stays in
 * localStorage by design; heavy data lives in IndexedDB — see storage.ts).
 */

export interface ThemeDefinition {
  id: string;
  label: string;
  /** Swatch colors for the theme picker. */
  swatch: { bg: string; text: string; border: string };
  /** Light themes get darker shadows/grid lines via CSS, this is just meta. */
  light: boolean;
}

/** `data-theme` is omitted entirely for the default look. */
export const DEFAULT_THEME_ID = 'study-os';

export const THEMES: ThemeDefinition[] = [
  { id: 'study-os', label: 'Study OS (default)', swatch: { bg: '#0f0e13', text: '#f5f4f7', border: '#2d2b37' }, light: false },
  { id: 'classic-light', label: 'Classic Light', swatch: { bg: '#ffffff', text: '#1e1e1e', border: '#e0e0e0' }, light: true },
  { id: 'dark-nebula', label: 'Dark Nebula', swatch: { bg: '#0d0d1a', text: '#c0caf5', border: '#2a2a4a' }, light: false },
  { id: 'soft-sepia', label: 'Soft Sepia', swatch: { bg: '#fbf3e8', text: '#5b4637', border: '#d4c5a9' }, light: true },
  { id: 'ocean-blue', label: 'Ocean Blue', swatch: { bg: '#eef5ff', text: '#1a3a5c', border: '#b8d0e8' }, light: true },
  { id: 'high-contrast', label: 'High Contrast', swatch: { bg: '#000000', text: '#ffff00', border: '#ffffff' }, light: false },
  { id: 'mint-green', label: 'Mint Green', swatch: { bg: '#f0faf5', text: '#1f4e3d', border: '#b8e0cc' }, light: true },
  { id: 'rose-pine', label: 'Rose Pine', swatch: { bg: '#faf0ed', text: '#6e3a3a', border: '#e6d0cd' }, light: true },
  { id: 'oled-black', label: 'OLED Black', swatch: { bg: '#000000', text: '#e8e8e8', border: '#2a2a2a' }, light: false },
  { id: 'midnight-ink', label: 'Midnight Ink', swatch: { bg: '#0b1220', text: '#d7e3f4', border: '#1e2a3c' }, light: false },
  { id: 'paper', label: 'Paper', swatch: { bg: '#f7f4ef', text: '#2c2a26', border: '#ddd6cb' }, light: true },
  { id: 'cyberpunk', label: 'Cyberpunk', swatch: { bg: '#12081a', text: '#f0e6ff', border: '#3d1f5c' }, light: false },
  { id: 'forest-night', label: 'Forest Night', swatch: { bg: '#0c1410', text: '#d8ebe0', border: '#24352c' }, light: false },
];

const THEME_KEY = 'jp-os-theme';
const EVENT = 'jp-theme-changed';

export function loadThemeId(): string {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME_ID;
}

export function applyTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME_ID) {
    // Default = no attribute, so the base :root block wins untouched.
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme.id);
  }
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme.id }));
}

/** Apply the saved theme before first paint (called from main.tsx). */
export function bootTheme(): void {
  applyTheme(loadThemeId());
}

export function onThemeChanged(cb: (id: string) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
