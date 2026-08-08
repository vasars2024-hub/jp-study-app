/**
 * Renderer side of the Agent workspace bridge.
 *
 * Every call resolves to an `AgentWorkspaceResult`; none of them reject. The
 * shell has a recoverable error state and no way to recover from a thrown
 * promise mid-render, so a missing preload method, a rejected invoke and a
 * malformed reply all land in the same typed failure.
 *
 * This is the only renderer module that touches the workspace bridge — there is
 * no second, renderer-owned copy of the workspace. Conversation state lives in
 * the main-process file and nowhere else.
 */

import type { AgentWorkspaceState } from '../shared/agentWorkspace';
import {
  agentWorkspaceFailure,
  isAgentWorkspaceSavePayload,
  normalizeAgentWorkspaceResult,
  type AgentWorkspaceResult,
} from '../shared/agentWorkspaceBridge';

interface AgentWorkspaceBridge {
  agentWorkspaceLoad(): Promise<unknown>;
  agentWorkspaceSave(state: AgentWorkspaceState): Promise<unknown>;
  agentWorkspaceDeleteConversation(conversationId: string): Promise<unknown>;
  agentWorkspaceClear(): Promise<unknown>;
  onAgentWorkspaceChanged(callback: (state: unknown) => void): () => void;
}

type BridgeMethod = keyof AgentWorkspaceBridge;

/**
 * `window.api` is declared by `window.d.ts`, but this runs in a window that may
 * predate the preload that carries these methods (a pop-out opened before an
 * upgrade, or a harness). A missing method is a state to render, not a crash.
 */
function bridgeMethod<K extends BridgeMethod>(name: K): AgentWorkspaceBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<AgentWorkspaceBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as AgentWorkspaceBridge[K]) : null;
}

async function call(
  invoke: (() => Promise<unknown>) | null,
  onThrow: 'read-failed' | 'write-failed',
): Promise<AgentWorkspaceResult> {
  if (!invoke) return agentWorkspaceFailure('bridge-unavailable');
  try {
    return normalizeAgentWorkspaceResult(await invoke());
  } catch {
    // An invoke rejects when the channel has no handler or main threw before
    // its own try/catch. Neither is worth surfacing verbatim.
    return agentWorkspaceFailure(onThrow);
  }
}

export function loadAgentWorkspace(): Promise<AgentWorkspaceResult> {
  const method = bridgeMethod('agentWorkspaceLoad');
  return call(method && (() => method()), 'read-failed');
}

export function saveAgentWorkspace(state: AgentWorkspaceState): Promise<AgentWorkspaceResult> {
  const method = bridgeMethod('agentWorkspaceSave');
  return call(method && (() => method(state)), 'write-failed');
}

export function deleteAgentConversation(conversationId: string): Promise<AgentWorkspaceResult> {
  const method = bridgeMethod('agentWorkspaceDeleteConversation');
  return call(method && (() => method(conversationId)), 'write-failed');
}

export function clearAgentWorkspace(): Promise<AgentWorkspaceResult> {
  const method = bridgeMethod('agentWorkspaceClear');
  return call(method && (() => method()), 'write-failed');
}

/**
 * Subscribes to main's committed-workspace push.
 *
 * The pushed state is re-derived through the same normalizer as a reply, for the
 * reason in `agentWorkspaceBridge.ts`: a renderer must not assume what crossed
 * the boundary is what this file describes. A push that cannot be understood is
 * dropped rather than delivered as an empty workspace, which the consumer would
 * otherwise adopt over correct content it already holds.
 *
 * Returns a no-op unsubscribe when the preload predates the channel, so a caller
 * can always store the result and call it on unmount.
 */
export function onAgentWorkspaceChanged(
  listener: (state: AgentWorkspaceState) => void,
): () => void {
  const method = bridgeMethod('onAgentWorkspaceChanged');
  if (!method) return () => undefined;
  return method((raw) => {
    const result = normalizeAgentWorkspaceResult({ ok: true, state: raw });
    if (result.ok && isAgentWorkspaceSavePayload(raw)) listener(result.state);
  });
}
