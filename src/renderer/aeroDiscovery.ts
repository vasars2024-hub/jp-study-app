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

/**
 * The locked "treasure" companion is a hint to the Aero theme, shown until the
 * theme is found. It could not be hidden, so on a fresh install a pet that
 * refuses every click sat on the desktop for good. Hiding it is a per-machine
 * choice kept next to the discovery flag; it re-renders through the same event.
 */
const TREASURE_HIDDEN_KEY = 'jp-treasure-companion-hidden';

export function isTreasureCompanionHidden(): boolean {
  try {
    return localStorage.getItem(TREASURE_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTreasureCompanionHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(TREASURE_HIDDEN_KEY, '1');
    else localStorage.removeItem(TREASURE_HIDDEN_KEY);
  } catch {
    /* storage unavailable: the pet simply stays as it was */
  }
  window.dispatchEvent(new CustomEvent(AERO_DISCOVERY_EVENT));
}

/** Whether the locked treasure companion should be on the desktop at all. */
export function showsTreasureCompanion(): boolean {
  return !hasDiscoveredAero() && !isTreasureCompanionHidden();
}

/** React to discovery in this window or from another renderer (e.g. settings pop-out). */
export function onAeroDiscoveryChanged(cb: (discovered: boolean) => void): () => void {
  const notify = () => cb(hasDiscoveredAero());
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === TREASURE_HIDDEN_KEY) notify();
  };
  window.addEventListener(AERO_DISCOVERY_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AERO_DISCOVERY_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
