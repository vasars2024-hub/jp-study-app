import {
  agentExecutionFailure,
  normalizeAgentExecutionCancelResult,
  normalizeAgentExecutionEvent,
  normalizeAgentExecutionResult,
  type AgentExecutionCancelResult,
  type AgentExecutionEvent,
  type AgentExecutionRequest,
  type AgentExecutionResult,
} from '../shared/agentExecutionBridge';

interface AgentExecutionBridge {
  agentExecutionRun(request: AgentExecutionRequest): Promise<unknown>;
  agentExecutionCancel(requestId: string): Promise<unknown>;
  onAgentExecutionEvent(cb: (event: unknown) => void): () => void;
}

function bridge(): Partial<AgentExecutionBridge> | null {
  if (typeof window === 'undefined') return null;
  return (window as { api?: Partial<AgentExecutionBridge> }).api ?? null;
}

export async function executeAgentPrompt(
  request: AgentExecutionRequest,
  onEvent: (event: AgentExecutionEvent) => void,
): Promise<AgentExecutionResult> {
  const api = bridge();
  if (
    typeof api?.agentExecutionRun !== 'function'
    || typeof api.onAgentExecutionEvent !== 'function'
  ) {
    return agentExecutionFailure('bridge-unavailable', request.requestId);
  }
  const release = api.onAgentExecutionEvent((raw) => {
    const event = normalizeAgentExecutionEvent(raw);
    if (event?.requestId === request.requestId) onEvent(event);
  });
  try {
    return normalizeAgentExecutionResult(await api.agentExecutionRun(request));
  } catch {
    return agentExecutionFailure('provider-failed', request.requestId);
  } finally {
    release();
  }
}

export async function cancelAgentPrompt(
  requestId: string,
): Promise<AgentExecutionCancelResult> {
  const api = bridge();
  if (typeof api?.agentExecutionCancel !== 'function') {
    return { ok: true, cancelled: false };
  }
  try {
    return normalizeAgentExecutionCancelResult(await api.agentExecutionCancel(requestId));
  } catch {
    return { ok: true, cancelled: false };
  }
}
