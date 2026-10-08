/**
 * Aero mechanics — the user's switches.
 *
 * One small persisted record, the same shape of store as
 * `aeroFeatureSettings.ts`: a window-local event for this renderer and the
 * `storage` event for a Settings pop-out. Everything defaults ON except the
 * screensaver delay, which defaults to five minutes, because each mechanic is
 * already gated to Aero and to the user not being busy.
 */
import { MIN_BALLOON_INTERVAL_MIN, SCREENSAVER_MINUTES } from './aeroMechLogic';
import { writeLocalStorage, writeLocalStorageJson } from '../localStorageWrite';

export interface AeroMechSettings {
  /** Memory Defragmenter entry points (Start menu, balloon "Review now"). */
  defrag: boolean;
  /** Vocabulary Update window + its "updates are available" balloon. */
  updates: boolean;
  updateBalloon: boolean;
  /** Study screensaver; `screensaverMinutes` 0 also means off. */
  screensaver: boolean;
  screensaverMinutes: number;
  /** "Did you know?" balloon tips. */
  balloons: boolean;
  balloonIntervalMin: number;
  /** Welcome Center on the first Aero boot of the day. */
  welcome: boolean;
}

export const BALLOON_INTERVALS = [10, 20, 30, 60, 120] as const;

export const AERO_MECH_DEFAULTS: AeroMechSettings = {
  defrag: true,
  updates: true,
  updateBalloon: true,
  screensaver: true,
  screensaverMinutes: 5,
  balloons: true,
  balloonIntervalMin: 20,
  welcome: true,
};

const KEY = 'jp-aero-mechanics-v1';
const EVENT = 'aero:mechanics-settings-changed';

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeAeroMechSettings(raw: Partial<AeroMechSettings> | null | undefined): AeroMechSettings {
  const src = raw && typeof raw === 'object' ? raw : {};
  const minutes = Number(src.screensaverMinutes);
  const interval = Number(src.balloonIntervalMin);
  return {
    defrag: bool(src.defrag, AERO_MECH_DEFAULTS.defrag),
    updates: bool(src.updates, AERO_MECH_DEFAULTS.updates),
    updateBalloon: bool(src.updateBalloon, AERO_MECH_DEFAULTS.updateBalloon),
    screensaver: bool(src.screensaver, AERO_MECH_DEFAULTS.screensaver),
    screensaverMinutes: (SCREENSAVER_MINUTES as readonly number[]).includes(minutes)
      ? minutes
      : AERO_MECH_DEFAULTS.screensaverMinutes,
    balloons: bool(src.balloons, AERO_MECH_DEFAULTS.balloons),
    balloonIntervalMin: Number.isFinite(interval)
      ? Math.min(240, Math.max(MIN_BALLOON_INTERVAL_MIN, Math.round(interval)))
      : AERO_MECH_DEFAULTS.balloonIntervalMin,
    welcome: bool(src.welcome, AERO_MECH_DEFAULTS.welcome),
  };
}

export function loadAeroMechSettings(): AeroMechSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeAeroMechSettings(raw ? (JSON.parse(raw) as Partial<AeroMechSettings>) : null);
  } catch {
    return { ...AERO_MECH_DEFAULTS };
  }
}

export function saveAeroMechSettings(patch: Partial<AeroMechSettings>): AeroMechSettings {
  const next = normalizeAeroMechSettings({ ...loadAeroMechSettings(), ...patch });
  // The guarded writer reports a refused write instead of dropping it.
  writeLocalStorageJson(KEY, next);
  window.dispatchEvent(new CustomEvent<AeroMechSettings>(EVENT, { detail: next }));
  return next;
}

export function onAeroMechSettingsChanged(cb: (settings: AeroMechSettings) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<AeroMechSettings>).detail);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === KEY) cb(loadAeroMechSettings());
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}

/* ------------------------------------------------- small persisted markers */

const MARK_PREFIX = 'jp-aero-mech-mark:';

/** A tiny string marker (last balloon time, last welcome day…). */
export function readMark(name: string): string | null {
  try {
    return localStorage.getItem(MARK_PREFIX + name);
  } catch {
    return null;
  }
}

export function writeMark(name: string, value: string): void {
  writeLocalStorage(MARK_PREFIX + name, value);
}

/* ------------------------------------------------------- opening windows */

export type AeroMechApp = 'defrag' | 'update' | 'welcome';

export interface AeroMechOpenDetail {
  app: AeroMechApp;
  /** Defrag only: put this card at the front of the pass. */
  focusCardId?: string;
}

export const AERO_MECH_OPEN_EVENT = 'aero-mech:open';

export function openAeroMechApp(detail: AeroMechOpenDetail): void {
  window.dispatchEvent(new CustomEvent<AeroMechOpenDetail>(AERO_MECH_OPEN_EVENT, { detail }));
}
