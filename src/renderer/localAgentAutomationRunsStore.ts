/**
 * Automation runs, renderer-facing — and read-only, which is what makes this
 * module different from every other store next to it.
 *
 * Main writes a run when a scheduled automation comes due, because main is the
 * only place that knows whether the trigger it fired reached a handler. There is
 * deliberately no save path here: `retainMainOwnedSections` in
 * `shared/agentOperationalState.ts` discards whatever a renderer's save carries
 * in this section, so a setter would be a control that silently does nothing.
 */

import {
  latestAgentAutomationRun,
  type AgentAutomationRun,
  type AgentAutomationRunLog,
} from '../shared/localAgentAutomationRuns';
import {
  AGENT_AUTOMATION_RUNS_CHANGED_EVENT,
  getAgentAutomationRunsSnapshot,
} from './agentOperationalClient';

export function loadLocalAgentAutomationRuns(): AgentAutomationRunLog {
  return getAgentAutomationRunsSnapshot();
}

export function loadLatestLocalAgentAutomationRun(
  automationId: string,
): AgentAutomationRun | null {
  return latestAgentAutomationRun(getAgentAutomationRunsSnapshot(), automationId);
}

export function onLocalAgentAutomationRunsChanged(
  listener: (log: AgentAutomationRunLog) => void,
): () => void {
  // The pushed detail is the raw section, which can be absent on a document
  // written before the section existed. Re-reading through the snapshot getter
  // normalizes it, so a subscriber never has to handle `undefined`.
  const handle = (): void => listener(getAgentAutomationRunsSnapshot());
  window.addEventListener(AGENT_AUTOMATION_RUNS_CHANGED_EVENT, handle);
  return () => window.removeEventListener(AGENT_AUTOMATION_RUNS_CHANGED_EVENT, handle);
}
