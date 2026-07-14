// Track Aero theme discovery for unlocking secret features.
const KEY = 'jp-aero-discovered';
export const AERO_DISCOVERY_EVENT = 'jp-aero-discovered-changed';

export function hasDiscoveredAero(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markAeroDiscovered(): boolean {
  try {
    if (localStorage.getItem(KEY) === '1') return false;
    localStorage.setItem(KEY, '1');
    window.dispatchEvent(new CustomEvent(AERO_DISCOVERY_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** React to discovery in this window or from another renderer (e.g. settings pop-out). */
export function onAeroDiscoveryChanged(cb: (discovered: boolean) => void): () => void {
  const notify = () => cb(hasDiscoveredAero());
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) notify();
  };
  window.addEventListener(AERO_DISCOVERY_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AERO_DISCOVERY_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
