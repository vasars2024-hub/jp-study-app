/**
 * Secret OS recovery mode.
 *
 * This is deliberately a presentation flag, not a reset. It never edits the
 * environment, display, sound, companion, wallpaper, or study-data stores; the
 * user's normal preferences become effective again as soon as it is disabled.
 */
export interface AeroSafeModeState {
  version: 1;
  enabled: boolean;
}

const KEY = 'jp-os-aero-safe-mode-v1';
const EVENT = 'jp-os-aero-safe-mode-changed';
const DEFAULT_STATE: AeroSafeModeState = { version: 1, enabled: false };
let storageSyncCleanup: (() => void) | null = null;

function stateFromRaw(raw: string | null): AeroSafeModeState {
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const value = JSON.parse(raw) as Partial<AeroSafeModeState>;
    if (value.version !== 1 || typeof value.enabled !== 'boolean') return { ...DEFAULT_STATE };
    return { version: 1, enabled: value.enabled };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function applyState(state: AeroSafeModeState): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.aeroSafeMode = state.enabled ? 'on' : 'off';
}

function notify(state: AeroSafeModeState): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AeroSafeModeState>(EVENT, { detail: state }));
}

export function loadAeroSafeMode(): AeroSafeModeState {
  try {
    return stateFromRaw(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setAeroSafeMode(enabled: boolean): AeroSafeModeState {
  const next: AeroSafeModeState = { version: 1, enabled };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* The runtime fallback still applies for this window. */
  }
  applyState(next);
  notify(next);
  return next;
}

export function bootAeroSafeMode(): void {
  applyState(loadAeroSafeMode());
  startAeroSafeModeSync();
}

export function startAeroSafeModeSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (storageSyncCleanup) return storageSyncCleanup;
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY) return;
    const next = stateFromRaw(event.newValue);
    applyState(next);
    notify(next);
  };
  window.addEventListener('storage', onStorage);
  const cleanup = (): void => {
    if (storageSyncCleanup !== cleanup) return;
    window.removeEventListener('storage', onStorage);
    storageSyncCleanup = null;
  };
  storageSyncCleanup = cleanup;
  return cleanup;
}

export function onAeroSafeModeChanged(cb: (state: AeroSafeModeState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  startAeroSafeModeSync();
  const handler = (event: Event): void => cb((event as CustomEvent<AeroSafeModeState>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** True only when recovery mode is enabled and Secret OS is actually active. */
export function isAeroSafeModeApplied(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.materials === 'aero' && root.dataset.aeroSafeMode === 'on';
}
