import {
  normalizeAgentAutomations,
  type AgentAutomation,
} from '../shared/localAgentAutomation';

const STORAGE_KEY = 'jp-study-local-agent-automations-v1';
const CHANGE_EVENT = 'jp-study-local-agent-automations-changed';
let fallback: AgentAutomation[] = [];

export function loadLocalAgentAutomations(): AgentAutomation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) fallback = normalizeAgentAutomations(JSON.parse(raw));
  } catch {
    // Keep the in-memory schedule when storage is unavailable.
  }
  return fallback;
}

export function syncLocalAgentAutomations(): void {
  window.api.localAgentSyncAutomations(loadLocalAgentAutomations());
}

function persist(entries: AgentAutomation[]): AgentAutomation[] {
  fallback = normalizeAgentAutomations(entries);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch {
    // The current session still has a normalized schedule.
  }
  window.api.localAgentSyncAutomations(fallback);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: fallback }));
  return fallback;
}

export function saveLocalAgentAutomation(entry: AgentAutomation): AgentAutomation[] {
  const entries = loadLocalAgentAutomations().filter((candidate) => candidate.id !== entry.id);
  return persist([entry, ...entries]);
}

export function removeLocalAgentAutomation(id: string): AgentAutomation[] {
  return persist(loadLocalAgentAutomations().filter((entry) => entry.id !== id));
}

export function onLocalAgentAutomationsChanged(listener: (entries: AgentAutomation[]) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<AgentAutomation[]>).detail);
  window.addEventListener(CHANGE_EVENT, handle);
  return () => window.removeEventListener(CHANGE_EVENT, handle);
}
