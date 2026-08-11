/**
 * Renderer side of the card-batch staging bridge.
 *
 * Two calls at the two ends of one gesture, exactly as
 * `agentImageStagingClient.ts` has them: the Agent's `flashcard.generate-cards`
 * adapter stages the batch it produced, and AI Card Studio claims it into its
 * own preview editor. Neither rejects — a window whose preload predates these
 * methods, a rejected invoke and a malformed reply all land in the same typed
 * failure.
 *
 * A claim that finds nothing is `ok` with a `null` batch rather than a failure:
 * the studio claims on every mount and the overwhelmingly common answer is "no
 * batch is waiting". Treating that as an error would light a banner on a form
 * the user opened by hand.
 */

import {
  normalizeAgentCardBatchStageResult,
  normalizeAgentCardBatchTakeResult,
  type AgentCardBatchStageRequest,
  type AgentCardBatchStageResult,
  type AgentCardBatchTakeResult,
} from '../shared/agentCardBatchStaging';

interface AgentCardBatchStagingBridge {
  agentCardBatchStage(request: AgentCardBatchStageRequest): Promise<unknown>;
  agentCardBatchTake(): Promise<unknown>;
  onAgentCardBatchStaged(callback: () => void): () => void;
}

function bridgeMethod<K extends keyof AgentCardBatchStagingBridge>(
  name: K,
): AgentCardBatchStagingBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<AgentCardBatchStagingBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function'
    ? (method.bind(api) as AgentCardBatchStagingBridge[K])
    : null;
}

export async function stageAgentCardBatch(
  request: AgentCardBatchStageRequest,
): Promise<AgentCardBatchStageResult> {
  const method = bridgeMethod('agentCardBatchStage');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeAgentCardBatchStageResult(await method(request));
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

export async function takeAgentCardBatch(): Promise<AgentCardBatchTakeResult> {
  const method = bridgeMethod('agentCardBatchTake');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeAgentCardBatchTakeResult(await method());
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

/**
 * Subscribes to main's "a batch is waiting" announcement.
 *
 * Returns a no-op unsubscribe when the bridge is absent, so the studio can wire
 * it from an effect without branching — a window whose preload predates this
 * method simply never hears about a batch, which is the same outcome as there
 * being none, and it still claims on its next mount.
 */
export function onAgentCardBatchStaged(callback: () => void): () => void {
  const method = bridgeMethod('onAgentCardBatchStaged');
  if (!method) return () => undefined;
  try {
    return method(() => callback());
  } catch {
    return () => undefined;
  }
}
