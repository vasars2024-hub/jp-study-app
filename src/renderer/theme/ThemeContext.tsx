/**
 * ThemeContext — React access to the Theme Engine (Phase 1 · M2).
 * -----------------------------------------------------------------------------
 * A thin wrapper over `./engine`. It does NOT own theme state (the engine +
 * localStorage do); it subscribes to the `jp-theme-changed` broadcast so React
 * consumers re-render on any switch, whoever triggered it.
 *
 * Adoption is optional — primitives in `components/ui/*` (M5) use `useTheme`;
 * existing features are unaffected. Wrap the tree once in <ThemeProvider>.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  type Theme,
  getTheme,
  listThemes,
  loadThemeId,
  onThemeChanged,
  setTheme as engineSetTheme,
} from './engine';

export interface ThemeContextValue {
  /** Active theme id (e.g. 'study-os', 'frutiger-aero'). */
  themeId: string;
  /** Active theme metadata, if registered. */
  theme: Theme | undefined;
  /** All selectable themes (hidden themes excluded). */
  themes: Theme[];
  /** Switch themes (routes through the engine → persists + broadcasts). */
  setTheme: (id: string) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [themeId, setThemeId] = useState<string>(() => loadThemeId());

  useEffect(() => onThemeChanged(setThemeId), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      theme: getTheme(themeId),
      themes: listThemes(),
      setTheme: engineSetTheme,
    }),
    [themeId],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Access the theme context. Throws if used outside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme() must be used within <ThemeProvider>');
  return v;
}

/** Non-throwing variant for components that may render outside the provider. */
export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeCtx);
}
