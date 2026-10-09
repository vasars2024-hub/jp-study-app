import { useLayoutEffect, useState } from 'react';
import { ensureThemeSheets, isThemeSheetApplied, type ThemeSheetId } from './themeSheets';

/**
 * For the few surfaces that render a secret shell's styling outside that
 * shell: the Special settings page (both consoles, once discovered), the
 * diagnostics card on Settings Home under Aero (a WIRED sheet), and the two
 * study gadgets that are ordinary widgets in every theme. Their rules live in
 * the material sheets (themeSheets.ts), which load per active theme now.
 *
 * Layout effect, so a sheet already fetched lands before the first paint.
 * Returns whether every requested sheet is applied; callers may hold their
 * body back until then, but none has to.
 */
export function useThemeSheets(ids: readonly ThemeSheetId[], enabled = true): boolean {
  const key = enabled ? ids.join('|') : '';
  const [ready, setReady] = useState(() => !key || ids.every(isThemeSheetApplied));
  useLayoutEffect(() => {
    if (!key) {
      setReady(true);
      return undefined;
    }
    const wanted = key.split('|') as ThemeSheetId[];
    if (wanted.every(isThemeSheetApplied)) {
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    void ensureThemeSheets(wanted).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return ready;
}
