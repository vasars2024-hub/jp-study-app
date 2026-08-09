/**
 * The renderer half of permission-gated navigation.
 *
 * Thin on purpose. Every decision — is the section allowlisted, does live
 * context still back it, may it open — belongs to main, so this file's whole job
 * is to pass four ids across and normalize whatever comes back. It holds no
 * destination of its own, which is what keeps `agentNavigationBridge`'s "a
 * request names an action, never a destination" true at the call site and not
 * only in the type.
 */

import {
  agentNavigationFailure,
  normalizeAgentNavigationResult,
  type AgentNavigationRequest,
  type AgentNavigationResult,
} from '../shared/agentNavigationBridge';

interface AgentNavigationBridge {
  agentNavigationRun(request: AgentNavigationRequest): Promise<unknown>;
}

function bridge(): Partial<AgentNavigationBridge> | null {
  if (typeof window === 'undefined') return null;
  return (window as { api?: Partial<AgentNavigationBridge> }).api ?? null;
}

export async function runAgentNavigation(
  request: AgentNavigationRequest,
): Promise<AgentNavigationResult> {
  const api = bridge();
  if (typeof api?.agentNavigationRun !== 'function') {
    return agentNavigationFailure('bridge-unavailable');
  }
  try {
    return normalizeAgentNavigationResult(await api.agentNavigationRun(request));
  } catch {
    return agentNavigationFailure('open-failed');
  }
}
