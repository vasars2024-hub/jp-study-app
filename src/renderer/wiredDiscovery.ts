const KEY = 'jp-wired-discovered-v1';
export const WIRED_DISCOVERY_EVENT = 'jp-wired-discovered-changed';

export function hasDiscoveredWired(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markWiredDiscovered(): boolean {
  try {
    if (localStorage.getItem(KEY) === '1') return false;
    localStorage.setItem(KEY, '1');
    window.dispatchEvent(new CustomEvent(WIRED_DISCOVERY_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function onWiredDiscoveryChanged(cb: (discovered: boolean) => void): () => void {
  const notify = () => cb(hasDiscoveredWired());
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) notify();
  };
  window.addEventListener(WIRED_DISCOVERY_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(WIRED_DISCOVERY_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
