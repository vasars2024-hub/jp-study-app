/**
 * Agent memory's renderer-facing API.
 *
 * Persistence moved to the main-owned operational store. The exported shape is
 * unchanged, so `MemoryPage` and `agentToolRegistry` are untouched; the
 * `localStorage` key and the per-window `fallback` are gone, and
 * `onLocalAgentMemoryChanged` now also fires for an edit made in another window.
 */

import {
  clearAgentMemory,
  deleteAgentMemory,
  upsertAgentMemory,
  type AgentMemoryCategory,
  type AgentMemoryStore,
  type AgentMemoryUpsert,
} from '../shared/localAgentMemory';
import {
  AGENT_MEMORY_CHANGED_EVENT,
  getAgentMemorySnapshot,
  setAgentMemorySnapshot,
} from './agentOperationalClient';

export function loadLocalAgentMemory(): AgentMemoryStore {
  return getAgentMemorySnapshot();
}

export function saveLocalAgentMemory(
  input: AgentMemoryUpsert,
  now = Date.now(),
): AgentMemoryStore {
  return setAgentMemorySnapshot(upsertAgentMemory(getAgentMemorySnapshot(), input, now));
}

export function removeLocalAgentMemory(id: string): AgentMemoryStore {
  return setAgentMemorySnapshot(deleteAgentMemory(getAgentMemorySnapshot(), id));
}

export function resetLocalAgentMemory(category?: AgentMemoryCategory): AgentMemoryStore {
  return setAgentMemorySnapshot(clearAgentMemory(getAgentMemorySnapshot(), category));
}

export function onLocalAgentMemoryChanged(
  listener: (store: AgentMemoryStore) => void,
): () => void {
  const handle = (event: Event): void => {
    listener((event as CustomEvent<AgentMemoryStore>).detail);
  };
  window.addEventListener(AGENT_MEMORY_CHANGED_EVENT, handle);
  return () => window.removeEventListener(AGENT_MEMORY_CHANGED_EVENT, handle);
}
