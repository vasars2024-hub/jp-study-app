import {
  EMPTY_AGENT_TASK_QUEUE,
  normalizeAgentTaskQueue,
  type AgentTaskQueue,
} from '../shared/localAgentTaskQueue';

const STORAGE_KEY = 'jp-study-local-agent-task-queue-v1';
let fallback: AgentTaskQueue = { ...EMPTY_AGENT_TASK_QUEUE };

export function loadLocalAgentTaskQueue(): AgentTaskQueue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) fallback = normalizeAgentTaskQueue(JSON.parse(raw));
  } catch {
    // Keep the in-memory queue when storage is unavailable.
  }
  return fallback;
}

export function saveLocalAgentTaskQueue(queue: AgentTaskQueue): AgentTaskQueue {
  fallback = normalizeAgentTaskQueue(queue);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback)); } catch { /* session-only queue */ }
  window.dispatchEvent(new CustomEvent('jp-study-local-agent-task-queue-changed', { detail: fallback }));
  return fallback;
}
