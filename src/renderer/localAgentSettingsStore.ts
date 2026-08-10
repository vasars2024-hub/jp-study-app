import {
  DEFAULT_LOCAL_AGENT_SETTINGS,
  normalizeLocalAgentSettings,
  type LocalAgentSettings,
} from '../shared/localAgentSettings';

const STORAGE_KEY = 'jp-study-local-agent-settings-v1';
const CHANGED_EVENT = 'jp-study-local-agent-settings-changed';
let fallback: LocalAgentSettings = { ...DEFAULT_LOCAL_AGENT_SETTINGS };

export function loadLocalAgentSettings(): LocalAgentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) fallback = normalizeLocalAgentSettings(JSON.parse(raw));
  } catch {
    // Keep safe in-memory defaults when browser storage is unavailable.
  }
  return fallback;
}

export function saveLocalAgentSettings(patch: Partial<LocalAgentSettings>): LocalAgentSettings {
  fallback = normalizeLocalAgentSettings({ ...loadLocalAgentSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch {
    // The current session still uses the normalized in-memory value.
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: fallback }));
  return fallback;
}

/**
 * Observes settings edits in this renderer and in sibling Electron windows.
 * Same-window writes use the custom event; native `storage` covers every other
 * window sharing the renderer partition.
 */
export function onLocalAgentSettingsChanged(
  listener: (settings: LocalAgentSettings) => void,
): () => void {
  const onChanged = (event: Event): void => {
    listener((event as CustomEvent<LocalAgentSettings>).detail);
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return;
    try {
      fallback = event.newValue
        ? normalizeLocalAgentSettings(JSON.parse(event.newValue))
        : { ...DEFAULT_LOCAL_AGENT_SETTINGS };
    } catch {
      fallback = { ...DEFAULT_LOCAL_AGENT_SETTINGS };
    }
    listener(fallback);
  };
  window.addEventListener(CHANGED_EVENT, onChanged);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChanged);
    window.removeEventListener('storage', onStorage);
  };
}
