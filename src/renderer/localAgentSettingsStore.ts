import {
  DEFAULT_LOCAL_AGENT_SETTINGS,
  normalizeLocalAgentSettings,
  type LocalAgentSettings,
} from '../shared/localAgentSettings';

const STORAGE_KEY = 'jp-study-local-agent-settings-v1';
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
  window.dispatchEvent(new CustomEvent('jp-study-local-agent-settings-changed', { detail: fallback }));
  return fallback;
}
