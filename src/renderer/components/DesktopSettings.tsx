/**
 * Study OS Settings app — adapter.
 * UI lives in `./settings/SettingsApp` (search, grouped nav, cards, home, shortcuts).
 */
import { lazy, Suspense } from 'react';
import { LiquidLoading } from './liquid/LiquidLoading';
import type { SettingsWallProps, WallChoice } from './settings/types';
import { bootPersonalization, savePersonalization } from '../osPersonalization';
import { bootDesktopPrefs } from '../desktopPrefs';
import { getReduceMotion } from '../displayPrefs';

export type { WallChoice };


/** @deprecated Prefer savePersonalization — kept for any external callers. */
export function applyAccent(id: string): void {
  savePersonalization({ accentMode: 'preset', accentPreset: id });
}

export function applyMotion(reduce: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

/** Apply saved OS look on startup (called before React renders). */
export function bootOsLook(): void {
  try {
    bootPersonalization();
    bootDesktopPrefs();
    applyMotion(getReduceMotion());
  } catch {
    /* ignore */
  }
}

/**
 * Lazy (perf2). `main.tsx` imports this module for `bootOsLook` alone, and the
 * static import here used to drag the whole Settings app — every page, the
 * agent tool registry behind the AI page, and through it the ~2 MB grammar
 * corpus — into every window's boot. AppSection already loads it this way.
 */
const SettingsApp = lazy(() => import('./settings/SettingsApp'));

export default function DesktopSettings(props: SettingsWallProps) {
  return (
    <Suspense fallback={<LiquidLoading layout="study" />}>
      <SettingsApp {...props} />
    </Suspense>
  );
}
