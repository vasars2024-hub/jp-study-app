/**
 * Renderer side of the main-owned monthly spend ledger.
 *
 * Deliberately much smaller than `agentOperationalClient.ts`, and the difference
 * is the whole point of the separate store: there is no `save`, so there is no
 * optimistic snapshot, no single-flight coalescing loop and no adoption of a
 * legacy key. The renderer has exactly two writes — set the ceiling, erase the
 * record — and both return the authoritative snapshot main just wrote, so the
 * caller's own reply is the only cache it needs.
 *
 * Every reply and every push is re-derived through `normalizeAgentSpendResult` /
 * `normalizeAgentSpendSnapshot`, which recompute the period totals from the
 * normalized rows. A total that crossed the boundary as a number could disagree
 * with the rows printed beside it; a total recomputed here cannot.
 */

import {
  agentSpendFailure,
  normalizeAgentSpendResult,
  normalizeAgentSpendSnapshot,
  type AgentSpendResult,
  type AgentSpendSnapshotPayload,
} from '../shared/agentSpendBridge';

interface AgentSpendBridge {
  agentSpendLoad(): Promise<unknown>;
  agentSpendSetBudget(budgetUsd: number | null): Promise<unknown>;
  agentSpendClear(): Promise<unknown>;
  onAgentSpendChanged(callback: (snapshot: unknown) => void): () => void;
}

type BridgeMethod = keyof AgentSpendBridge;

/**
 * A window that predates the preload carrying these methods — a pop-out opened
 * before an upgrade, or a test harness — degrades to `bridge-unavailable`
 * rather than throwing. That code is renderer-only and the surface says so in
 * plain words; it must never be reported as "no spending recorded".
 */
function bridgeMethod<K extends BridgeMethod>(name: K): AgentSpendBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<AgentSpendBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as AgentSpendBridge[K]) : null;
}

async function call(
  invoke: (() => Promise<unknown>) | null,
  onThrow: 'read-failed' | 'write-failed',
): Promise<AgentSpendResult> {
  if (!invoke) return agentSpendFailure('bridge-unavailable');
  try {
    return normalizeAgentSpendResult(await invoke());
  } catch {
    // An invoke rejects when the channel has no handler, or main threw before
    // its own try/catch. Neither is worth surfacing verbatim.
    return agentSpendFailure(onThrow);
  }
}

export function loadAgentSpend(): Promise<AgentSpendResult> {
  const method = bridgeMethod('agentSpendLoad');
  return call(method && (() => method()), 'read-failed');
}

/**
 * `null` withdraws the ceiling and is a legitimate request; `0` is a different,
 * equally legitimate one meaning "refuse every priced cloud request". The
 * boundary in main refuses anything else outright rather than normalizing it,
 * so a malformed value arrives back here as `invalid-request` with the previous
 * ceiling still standing — which is the behaviour the surface reports.
 */
export function setAgentSpendBudget(budgetUsd: number | null): Promise<AgentSpendResult> {
  const method = bridgeMethod('agentSpendSetBudget');
  return call(method && (() => method(budgetUsd)), 'write-failed');
}

/** Erases the recorded totals. It does not withdraw the ceiling — main keeps it. */
export function clearAgentSpend(): Promise<AgentSpendResult> {
  const method = bridgeMethod('agentSpendClear');
  return call(method && (() => method()), 'write-failed');
}

/**
 * Main pushes the whole snapshot after any change, including ones no renderer
 * asked for — a request main itself made and charged for. Returns an
 * unsubscribe, and a no-op unsubscribe when the bridge is absent, so a caller's
 * cleanup path never has to test for it.
 */
export function onAgentSpendChanged(
  callback: (snapshot: AgentSpendSnapshotPayload) => void,
): () => void {
  const method = bridgeMethod('onAgentSpendChanged');
  if (!method) {
    return () => {
      // Nothing was subscribed, so nothing is torn down. The caller still gets a
      // callable, which is what keeps its cleanup path free of a null check.
    };
  }
  return method((snapshot) => callback(normalizeAgentSpendSnapshot(snapshot)));
}
