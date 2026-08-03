import type { MediaHubItemState } from '../shared/mediaHub';

const KEY = 'jp-media-hub-item-state-v1';
type Store = Record<string, MediaHubItemState>;

function read(): Store {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Store : {};
  } catch { return {}; }
}

export function loadMediaHubState(): Store { return read(); }

export function saveMediaHubState(state: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage is optional */ }
}
