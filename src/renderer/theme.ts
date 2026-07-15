/**
 * Theme — back-compat facade over the Theme Engine (Phase 1 · M2).
 *
 * The authoritative registry + logic now live in `./theme/engine.ts`. This
 * module preserves the original public surface (`THEMES`, `ThemeDefinition`,
 * `applyTheme`, `bootTheme`, `loadThemeId`, `onThemeChanged`, `DEFAULT_THEME_ID`)
 * so existing imports keep working, and also re-exports the richer engine API
 * for new code.
 */

import {
  DEFAULT_THEME_ID,
  bootThemeEngine,
  listThemes,
  type Theme,
} from './theme/engine';

// Rich engine API (preferred for new code).
export {
  DEFAULT_THEME_ID,
  THEME_ENGINE_VERSION,
  registerTheme,
  getTheme,
  isThemeRegistered,
  listThemes,
  loadThemeId,
  applyTheme,
  setTheme,
  applyThemeAttributes,
  onThemeChanged,
  runThemeMigrations,
} from './theme/engine';
export type { Theme, ThemeKind, AssetPackRef } from './theme/engine';

/**
 * Legacy theme shape used by existing pickers. A structural subset of the
 * engine's `Theme` (extra fields are ignored by consumers).
 */
export interface ThemeDefinition {
  id: string;
  label: string;
  swatch: { bg: string; text: string; border: string };
  light: boolean;
  hidden?: boolean;
}

/** Visible built-in themes, in the legacy shape (excludes hidden themes). */
export const THEMES: ThemeDefinition[] = listThemes().map((t: Theme) => ({
  id: t.id,
  label: t.label,
  swatch: t.swatch,
  light: t.light,
  hidden: t.hidden,
}));

/** Apply the saved theme before first paint (called from main.tsx). */
export function bootTheme(): void {
  bootThemeEngine();
}
