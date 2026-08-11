import {
  EMPTY_AGENT_PROFILE_STORE,
  normalizeAgentProfiles,
  setAgentProfileOperations,
  type AgentProfile,
  type AgentProfileStore,
} from '../shared/localAgentProfiles';
import type { AgentToolOperationId } from '../shared/localAgent';

const STORAGE_KEY = 'jp-study-local-agent-profiles-v1';
const CHANGED_EVENT = 'jp-study-local-agent-profiles-changed';
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
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: fallback }));
  return fallback;
}

/**
 * Observes profile edits in this renderer and in sibling Electron windows.
 *
 * A same-window `localStorage` write does not emit the native `storage` event,
 * while that event is the only notification a different window receives. The
 * custom event and the native event are therefore complementary, not duplicate
 * paths. Native payloads are normalized before they replace the module cache so
 * the next synchronous reader sees the same profile store as the listener.
 */
export function onLocalAgentProfilesChanged(
  listener: (store: AgentProfileStore) => void,
): () => void {
  const onChanged = (event: Event): void => {
    listener((event as CustomEvent<AgentProfileStore>).detail);
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return;
    try {
      fallback = event.newValue
        ? normalizeAgentProfiles(JSON.parse(event.newValue))
        : normalizeAgentProfiles(EMPTY_AGENT_PROFILE_STORE);
    } catch {
      fallback = normalizeAgentProfiles(EMPTY_AGENT_PROFILE_STORE);
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

/**
 * Make one profile the active one, and enable it in the same write.
 *
 * `normalizeAgentProfiles` accepts `activeProfileId` only when the named profile is `enabled`, and
 * falls back to the built-in default otherwise. So writing `activeProfileId` alone — which is what
 * every caller did before this existed — silently activates a DIFFERENT profile whenever the chosen
 * one happens to be disabled, and the picker that made the request reports success. Enabling here
 * makes the write mean what the caller asked for.
 *
 * Takes the store rather than reading it back, for the same reason `setLocalAgentProfileOperations`
 * does: the value the caller is rendering is the value that gets edited.
 */
export function activateLocalAgentProfile(
  store: AgentProfileStore,
  profileId: string,
): AgentProfileStore {
  return saveLocalAgentProfiles({
    ...store,
    activeProfileId: profileId,
    profiles: store.profiles.map((profile) => (
      profile.id === profileId && !profile.enabled ? { ...profile, enabled: true } : profile
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
