/**
 * AppChrome — the single theme seam for XP–Aero application chrome.
 * Phase 4 · M1.
 * -----------------------------------------------------------------------------
 * Wraps an application's content with a menu bar above and a status bar below —
 * but ONLY while the secret Aero material set is active. In every other theme
 * it renders its children unchanged (no wrapper element at all), so the default
 * Study OS keeps its Fluent minimalism and the app's DOM is byte-identical.
 *
 * This is the one sanctioned structural theme branch (theme/material/edition
 * boundary). Applications must not add their own theme or display-mode checks.
 *
 * Gating reads the `data-materials` attribute directly + subscribes to the
 * engine's theme broadcast, so it works without <ThemeProvider> (which is not
 * force-wrapped) and in every host: FloatingWindow, pop-out, focus shell.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { onThemeChanged } from '../../theme/engine';
import { MenuBar, type MenuBarMenu } from './MenuBar';
import { StatusBar } from './StatusBar';

export type AppMaterialSet = 'aero' | 'wired' | null;

function readMaterialSet(): AppMaterialSet {
  if (typeof document === 'undefined') return null;
  const material = document.documentElement.getAttribute('data-materials');
  return material === 'aero' || material === 'wired' ? material : null;
}

/** True while the secret Aero material set is active; updates on theme switch. */
export function useAeroMaterials(): boolean {
  const [material, setMaterial] = useState(readMaterialSet);
  useEffect(() => onThemeChanged(() => setMaterial(readMaterialSet())), []);
  return material === 'aero';
}

export function useWiredMaterials(): boolean {
  const [material, setMaterial] = useState(readMaterialSet);
  useEffect(() => onThemeChanged(() => setMaterial(readMaterialSet())), []);
  return material === 'wired';
}

export function useAppMaterialSet(): AppMaterialSet {
  const [material, setMaterial] = useState(readMaterialSet);
  useEffect(() => onThemeChanged(() => setMaterial(readMaterialSet())), []);
  return material;
}

export interface AppChromeProps {
  /** Menu-bar definition; omit for apps without menus. */
  menus?: MenuBarMenu[];
  /** Trailing menu-bar content (e.g. a compact search field). */
  menuEnd?: ReactNode;
  /** Status-bar content (StatusBarField / StatusBarSpacer); omit to hide. */
  status?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function AppChrome({ menus, menuEnd, status, className = '', children }: AppChromeProps) {
  const material = useAppMaterialSet();
  if (!material) return <>{children}</>;
  return (
    <div
      className={['ui-app-chrome', `ui-app-chrome--${material}`, className].filter(Boolean).join(' ')}
      data-app-chrome=""
      data-app-material={material}
    >
      {menus && menus.length > 0 && <MenuBar menus={menus} end={menuEnd} />}
      <div className="ui-app-chrome__body">{children}</div>
      {status != null && <StatusBar>{status}</StatusBar>}
    </div>
  );
}

export default AppChrome;
