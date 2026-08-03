/**
 * Study OS Settings app — adapter.
 * UI lives in `./settings/SettingsApp` (search, grouped nav, cards, home, shortcuts).
 */
import SettingsApp from './settings/SettingsApp';
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

export default function DesktopSettings(props: SettingsWallProps) {
  return <SettingsApp {...props} />;
}
