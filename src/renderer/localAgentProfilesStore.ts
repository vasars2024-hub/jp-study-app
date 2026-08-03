import {
  EMPTY_AGENT_PROFILE_STORE,
  normalizeAgentProfiles,
  setAgentProfileOperations,
  type AgentProfile,
  type AgentProfileStore,
} from '../shared/localAgentProfiles';
import type { AgentToolOperationId } from '../shared/localAgent';

const STORAGE_KEY = 'jp-study-local-agent-profiles-v1';
let fallback: AgentProfileStore = normalizeAgentProfiles(EMPTY_AGENT_PROFILE_STORE);

export function loadLocalAgentProfiles(): AgentProfileStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) fallback = normalizeAgentProfiles(JSON.parse(raw));
  } catch {
    // Keep the built-in profiles when local storage is unavailable.
  }
  return fallback;
}

export function saveLocalAgentProfiles(store: AgentProfileStore): AgentProfileStore {
  fallback = normalizeAgentProfiles(store);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch {
    // The current session still uses the normalized profile store.
  }
  window.dispatchEvent(new CustomEvent('jp-study-local-agent-profiles-changed', { detail: fallback }));
  return fallback;
}

/**
 * Persist a new allow-list for one profile. Slice 63 — the write the renderer never had.
 *
 * Takes the store rather than reading it back, so the value the caller is rendering is the value
 * that gets edited; `loadLocalAgentProfiles()` returns a module-level cache that a concurrent
 * write would have moved underneath it.
 *
 * Built-in and custom profiles both go through `setAgentProfileOperations`, which decides between
 * the delta form and a plain list. Nothing here should second-guess that — the delta rules live
 * next to the loader that reads them.
 */
export function setLocalAgentProfileOperations(
  store: AgentProfileStore,
  profileId: string,
  nextEnabled: readonly AgentToolOperationId[],
): AgentProfileStore {
  return saveLocalAgentProfiles({
    ...store,
    profiles: store.profiles.map((profile) => (
      profile.id === profileId ? setAgentProfileOperations(profile, nextEnabled) : profile
    )),
  });
}

export function createLocalAgentProfile(name: string): AgentProfileStore {
  const store = loadLocalAgentProfiles();
  const id = `custom-${Date.now().toString(36)}`;
  const profile: AgentProfile = {
    id,
    name: name.trim().slice(0, 100) || 'Custom assistant',
    description: 'Custom local assistant profile.',
    role: 'custom',
    preferredModelFileName: '',
    permission: 'read-only',
    enabledOperations: ['dictionary.lookup', 'dictionary.search-knowledge'],
    responseLength: 'balanced',
    explanationDepth: 'standard',
    language: 'english',
    teachingStyle: 'tutor',
    correctionStyle: 'gentle',
    enabled: true,
    builtIn: false,
  };
  return saveLocalAgentProfiles({
    version: 1,
    activeProfileId: id,
    profiles: [...store.profiles, profile],
  });
}
