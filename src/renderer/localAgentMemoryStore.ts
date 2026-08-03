import {
  clearAgentMemory,
  deleteAgentMemory,
  EMPTY_AGENT_MEMORY,
  normalizeAgentMemory,
  upsertAgentMemory,
  type AgentMemoryCategory,
  type AgentMemoryStore,
  type AgentMemoryUpsert,
} from '../shared/localAgentMemory';

const STORAGE_KEY = 'jp-study-local-agent-memory-v1';
const CHANGE_EVENT = 'jp-study-local-agent-memory-changed';
let fallback: AgentMemoryStore = { ...EMPTY_AGENT_MEMORY, entries: [] };

export function loadLocalAgentMemory(): AgentMemoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) fallback = normalizeAgentMemory(JSON.parse(raw));
  } catch {
    // Keep the in-memory fallback when storage is unavailable or malformed.
  }
  return fallback;
}

function persist(store: AgentMemoryStore): AgentMemoryStore {
  fallback = normalizeAgentMemory(store);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch {
    // Memory remains usable for the current session if local storage is full.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: fallback }));
  return fallback;
}

export function saveLocalAgentMemory(
  input: AgentMemoryUpsert,
  now = Date.now(),
): AgentMemoryStore {
  return persist(upsertAgentMemory(loadLocalAgentMemory(), input, now));
}

export function removeLocalAgentMemory(id: string): AgentMemoryStore {
  return persist(deleteAgentMemory(loadLocalAgentMemory(), id));
}

export function resetLocalAgentMemory(category?: AgentMemoryCategory): AgentMemoryStore {
  return persist(clearAgentMemory(loadLocalAgentMemory(), category));
}

export function onLocalAgentMemoryChanged(
  listener: (store: AgentMemoryStore) => void,
): () => void {
  const handle = (event: Event) => {
    listener((event as CustomEvent<AgentMemoryStore>).detail);
  };
  window.addEventListener(CHANGE_EVENT, handle);
  return () => window.removeEventListener(CHANGE_EVENT, handle);
}

