/**
 * The task queue's renderer-facing API.
 *
 * The persistence moved to the main-owned operational store; this module kept
 * its exported shape so `LocalAgentPanel` needed no change to how it reads and
 * writes. What it no longer has is a `localStorage` key and a per-window
 * `fallback` variable — both now live once, in `agentOperationalClient.ts`, over
 * a document main owns.
 */

import { normalizeAgentTaskQueue, type AgentTaskQueue } from '../shared/localAgentTaskQueue';
import {
  AGENT_QUEUE_CHANGED_EVENT,
  getAgentTaskQueueSnapshot,
  setAgentTaskQueueSnapshot,
} from './agentOperationalClient';

export function loadLocalAgentTaskQueue(): AgentTaskQueue {
  return getAgentTaskQueueSnapshot();
}

export function saveLocalAgentTaskQueue(queue: AgentTaskQueue): AgentTaskQueue {
  return setAgentTaskQueueSnapshot(normalizeAgentTaskQueue(queue));
}

/**
 * New in this slice. The queue always dispatched a change event and nothing ever
 * listened, so a queue edit in one window was invisible in another — the exact
 * drift the move to main is meant to end.
 */
export function onLocalAgentTaskQueueChanged(
  listener: (queue: AgentTaskQueue) => void,
): () => void {
  const handle = (event: Event): void => {
    listener((event as CustomEvent<AgentTaskQueue>).detail);
  };
  window.addEventListener(AGENT_QUEUE_CHANGED_EVENT, handle);
  return () => window.removeEventListener(AGENT_QUEUE_CHANGED_EVENT, handle);
}
