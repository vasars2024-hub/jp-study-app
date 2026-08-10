/**
 * Renderer side of the capture staging bridge.
 *
 * Two calls, at the two ends of one gesture: the capturing surface stages, the
 * Agent shell claims. Neither rejects — a window that predates the preload
 * carrying these methods, a rejected invoke and a malformed reply all land in
 * the same typed failure, following `agentWorkspaceClient.ts`.
 *
 * A claim that finds nothing is `ok` with an empty list, not a failure: the
 * shell calls it on every conversation selection and the overwhelmingly common
 * answer is "no capture is waiting".
 */

import {
  normalizeAgentImageStageResult,
  normalizeAgentImageTakeResult,
  type AgentImageStageRequest,
  type AgentImageStageResult,
  type AgentImageTakeResult,
} from '../shared/agentImageStaging';

interface AgentImageStagingBridge {
  agentImageStage(request: AgentImageStageRequest): Promise<unknown>;
  agentImageTake(conversationId: string): Promise<unknown>;
  onAgentImageStaged(callback: (conversationId: string) => void): () => void;
}

function bridgeMethod<K extends keyof AgentImageStagingBridge>(
  name: K,
): AgentImageStagingBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<AgentImageStagingBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as AgentImageStagingBridge[K]) : null;
}

export async function stageAgentImage(
  request: AgentImageStageRequest,
): Promise<AgentImageStageResult> {
  const method = bridgeMethod('agentImageStage');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeAgentImageStageResult(await method(request));
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

export async function takeAgentImages(conversationId: string): Promise<AgentImageTakeResult> {
  const method = bridgeMethod('agentImageTake');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeAgentImageTakeResult(await method(conversationId));
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

/**
 * Subscribes to main's "a capture is waiting" announcement.
 *
 * Returns a no-op unsubscribe when the bridge is absent, so a caller can wire it
 * from an effect without branching — a window whose preload predates this method
 * simply never hears about a capture, which is the same outcome as there being
 * none.
 */
export function onAgentImageStaged(
  callback: (conversationId: string) => void,
): () => void {
  const method = bridgeMethod('onAgentImageStaged');
  if (!method) return () => undefined;
  try {
    return method((conversationId) => callback(String(conversationId)));
  } catch {
    return () => undefined;
  }
}
