/**
 * App-level Focus Mode — distraction-free shell (library, reader, dict, Anki, mini music).
 * When on, DesktopShell / living layer are not mounted.
 */

const KEY = 'jp-study-focus-mode-v1';
const EVENT = 'jp-focus-mode-changed';

export function loadFocusMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function isFocusMode(): boolean {
  return loadFocusMode();
}

export function setFocusMode(on: boolean): boolean {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (on) {
    // Best-effort: hide OS companion host while focused (prefs kept).
    try {
      void window.api?.companionHostSetEnabled?.(false);
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { on } }));
  } catch {
    /* ignore */
  }
  return on;
}

export function toggleFocusMode(): boolean {
  return setFocusMode(!loadFocusMode());
}

export function onFocusModeChanged(cb: (on: boolean) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<{ on?: boolean }>).detail;
    cb(typeof d?.on === 'boolean' ? d.on : loadFocusMode());
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
