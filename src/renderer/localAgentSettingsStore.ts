import {
  DEFAULT_LOCAL_AGENT_SETTINGS,
  normalizeLocalAgentSettings,
  type LocalAgentSettings,
} from '../shared/localAgentSettings';

const STORAGE_KEY = 'jp-study-local-agent-settings-v1';
const CHANGED_EVENT = 'jp-study-local-agent-settings-changed';

/**
 * Synchronous cache of the last settings this renderer saw.
 *
 * It is only a cache while storage is readable: every load re-reads the key,
 * and a key that is gone means "no settings", which is the defaults — never the
 * previous value. Holding on to the previous value is what left the Agent
 * switched off after the key was removed in this window. The cache is the
 * answer only when storage itself throws.
 */
let fallback: LocalAgentSettings = { ...DEFAULT_LOCAL_AGENT_SETTINGS };
/** The raw string `fallback` was built from; `undefined` until the first read. */
let lastRaw: string | null | undefined;

function parse(raw: string | null): LocalAgentSettings {
  if (raw === null) return { ...DEFAULT_LOCAL_AGENT_SETTINGS };
  try {
    return normalizeLocalAgentSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_LOCAL_AGENT_SETTINGS };
  }
}

function publish(settings: LocalAgentSettings): void {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: settings }));
}

export function loadLocalAgentSettings(): LocalAgentSettings {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory value when browser storage is unavailable.
    return fallback;
  }
  if (raw === lastRaw) return fallback;
  const outOfBand = lastRaw !== undefined;
  lastRaw = raw;
  fallback = parse(raw);
  if (outOfBand) {
    // The key changed in this window without going through `save` (removed by a
    // reset, or written directly): the native `storage` event never fires for
    // the window that made the change, so tell this window's subscribers here.
    // Deferred because loads run inside React render and state initializers.
    const settings = fallback;
    queueMicrotask(() => {
      if (fallback === settings) publish(settings);
    });
  }
  return fallback;
}

export function saveLocalAgentSettings(patch: Partial<LocalAgentSettings>): LocalAgentSettings {
  fallback = normalizeLocalAgentSettings({ ...loadLocalAgentSettings(), ...patch });
  const serialized = JSON.stringify(fallback);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    lastRaw = serialized;
  } catch {
    // The current session still uses the normalized in-memory value.
  }
  publish(fallback);
  return fallback;
}

/**
 * Removes the stored settings and returns every subscriber in this window to
 * the defaults. Sibling windows hear the removal through the `storage` event.
 */
export function resetLocalAgentSettings(): LocalAgentSettings {
  try {
    localStorage.removeItem(STORAGE_KEY);
    lastRaw = null;
  } catch {
    // Storage unavailable: the in-memory reset below is all there is.
  }
  fallback = { ...DEFAULT_LOCAL_AGENT_SETTINGS };
  publish(fallback);
  return fallback;
}

/**
 * Observes settings edits in this renderer and in sibling Electron windows.
 * Same-window writes use the custom event; native `storage` covers every other
 * window sharing the renderer partition, including a removed key
 * (`newValue === null`) and a `localStorage.clear()` (`key === null`).
 */
export function onLocalAgentSettingsChanged(
  listener: (settings: LocalAgentSettings) => void,
): () => void {
  const onChanged = (event: Event): void => {
    listener((event as CustomEvent<LocalAgentSettings>).detail);
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const raw = event.key === null ? null : event.newValue;
    lastRaw = raw;
    fallback = parse(raw);
    listener(fallback);
  };
  window.addEventListener(CHANGED_EVENT, onChanged);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChanged);
    window.removeEventListener('storage', onStorage);
  };
}
