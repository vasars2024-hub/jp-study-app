/**
 * Automations' renderer-facing API.
 *
 * Two things changed with the move to the main-owned operational store.
 *
 * The `localStorage` key is gone, as it is for the queue and memory. And
 * `syncLocalAgentAutomations()` is gone with it: it existed to push the
 * renderer's copy of the schedule into the main scheduler over
 * `localAgent:syncAutomations`, because main had no way to read it. Main now
 * owns the schedule and `main/localAgentScheduler.ts` subscribes to the store
 * directly, so the schedule is live whether or not a window is open — and there
 * is no longer a renderer copy that could disagree with it.
 */

import {
  normalizeAgentAutomations,
  type AgentAutomation,
} from '../shared/localAgentAutomation';
import {
  AGENT_AUTOMATIONS_CHANGED_EVENT,
  getAgentAutomationsSnapshot,
  setAgentAutomationsSnapshot,
} from './agentOperationalClient';

export function loadLocalAgentAutomations(): AgentAutomation[] {
  return [...getAgentAutomationsSnapshot()];
}

function persist(entries: AgentAutomation[]): AgentAutomation[] {
  return setAgentAutomationsSnapshot(normalizeAgentAutomations(entries));
}

export function saveLocalAgentAutomation(entry: AgentAutomation): AgentAutomation[] {
  const entries = loadLocalAgentAutomations().filter((candidate) => candidate.id !== entry.id);
  return persist([entry, ...entries]);
}

export function removeLocalAgentAutomation(id: string): AgentAutomation[] {
  return persist(loadLocalAgentAutomations().filter((entry) => entry.id !== id));
}

export function onLocalAgentAutomationsChanged(
  listener: (entries: AgentAutomation[]) => void,
): () => void {
  const handle = (event: Event): void => listener((event as CustomEvent<AgentAutomation[]>).detail);
  window.addEventListener(AGENT_AUTOMATIONS_CHANGED_EVENT, handle);
  return () => window.removeEventListener(AGENT_AUTOMATIONS_CHANGED_EVENT, handle);
}
