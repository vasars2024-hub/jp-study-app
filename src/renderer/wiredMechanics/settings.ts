/**
 * Switches for the WIRED study mechanics (Settings > Special > Wired
 * mechanics). Separate from `terminalModeSettings` — that store is the shell's
 * look and sound; this one is how studying behaves inside the archive.
 *
 * Everything defaults on except nothing intrusive: intercepts are rate-limited
 * to one per 30 minutes by default and only fire when the user returns from
 * being idle.
 */

export type WiredCursorPreset = 'navi' | 'reticle';

export const INTERCEPT_INTERVALS_MIN = [15, 30, 60, 120] as const;
export type InterceptIntervalMin = (typeof INTERCEPT_INTERVALS_MIN)[number];

export interface WiredMechanicsSettings {
  /** Layer descent: track depth, show the layer, play crossing transmissions. */
  layerDescent: boolean;
  /** Signal decrypt review console. */
  signalDecrypt: boolean;
  /** Navi terminal console (TTY). */
  naviTerminal: boolean;
  /** Idle-return dictation intercepts. */
  intercepts: boolean;
  /** Minimum minutes between two intercepts. */
  interceptIntervalMin: InterceptIntervalMin;
  /** Desktop text that reflects real recent activity. */
  wiredRemembers: boolean;
  /** Cursor preset (reticle needs LAYER:08). */
  cursor: WiredCursorPreset;
}

export const WIRED_MECH_SETTINGS_KEY = 'jp-wired-mechanics-v1';
const EVENT = 'wired:mechanics-settings-changed';

export const WIRED_MECH_DEFAULTS: WiredMechanicsSettings = {
  layerDescent: true,
  signalDecrypt: true,
  naviTerminal: true,
  intercepts: true,
  interceptIntervalMin: 30,
  wiredRemembers: true,
  cursor: 'navi',
};

export function normalizeWiredMechanicsSettings(raw: unknown): WiredMechanicsSettings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<WiredMechanicsSettings>) : {};
  const interval = INTERCEPT_INTERVALS_MIN.includes(r.interceptIntervalMin as InterceptIntervalMin)
    ? (r.interceptIntervalMin as InterceptIntervalMin)
    : WIRED_MECH_DEFAULTS.interceptIntervalMin;
  return {
    layerDescent: r.layerDescent !== false,
    signalDecrypt: r.signalDecrypt !== false,
    naviTerminal: r.naviTerminal !== false,
    intercepts: r.intercepts !== false,
    interceptIntervalMin: interval,
    wiredRemembers: r.wiredRemembers !== false,
    cursor: r.cursor === 'reticle' ? 'reticle' : 'navi',
  };
}

export function loadWiredMechanicsSettings(): WiredMechanicsSettings {
  try {
    const raw = localStorage.getItem(WIRED_MECH_SETTINGS_KEY);
    return raw ? normalizeWiredMechanicsSettings(JSON.parse(raw)) : { ...WIRED_MECH_DEFAULTS };
  } catch {
    return { ...WIRED_MECH_DEFAULTS };
  }
}

export function saveWiredMechanicsSettings(patch: Partial<WiredMechanicsSettings>): WiredMechanicsSettings {
  const next = normalizeWiredMechanicsSettings({ ...loadWiredMechanicsSettings(), ...patch });
  try {
    localStorage.setItem(WIRED_MECH_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* session-only when storage is locked */
  }
  try {
    window.dispatchEvent(new CustomEvent<WiredMechanicsSettings>(EVENT, { detail: next }));
  } catch {
    /* non-browser context */
  }
  return next;
}

export function onWiredMechanicsSettingsChanged(cb: (s: WiredMechanicsSettings) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<WiredMechanicsSettings>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
