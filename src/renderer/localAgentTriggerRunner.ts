/**
 * One renderer, one claim, one run.
 *
 * `main/localAgentScheduler.ts` delivers a due automation to exactly one
 * *claiming* webContents, and records a fire that reached nobody as `missed`.
 * That solved the between-windows half of the problem. It cannot solve the
 * within-window half, and two defects live there:
 *
 * - **The claim is per `webContents.id`, so it does not nest.** Main keeps a
 *   `Set<number>`; a second surface in the same window claiming is a no-op, and
 *   the first of the two to unmount releases the claim out from under the other.
 *   The remaining surface stays subscribed to `localAgent:trigger` and stops
 *   receiving anything, and main then records every later fire as `missed`
 *   while a live handler sits there waiting.
 * - **A push is per-window, so every subscriber in it hears the fire.** Two
 *   surfaces that both plan the automation would each plan and each enqueue it —
 *   the same fan-out duplication the scheduler's claim registry removed between
 *   windows, reintroduced inside one.
 *
 * This module is the renderer-side counterpart. It owns the *only*
 * `onLocalAgentTrigger` subscription and the *only* claim/release pair in the
 * renderer, refcounted across handlers, and it dispatches each fire to exactly
 * one of them.
 *
 * Which one is decided by `kind`, not by mount order alone:
 *
 * - `interactive` — a surface the user is looking at, which shows the objective
 *   and the plan as it happens. Blanc's agent panel is one.
 * - `background` — the always-mounted host that exists so an automation still
 *   runs when no agent surface is open. It must never take a fire away from an
 *   interactive surface that could show it, so it ranks below.
 *
 * Within one kind the earliest registration wins, mirroring main's insertion
 * order tie-break, so the choice is deterministic rather than dependent on
 * React's mount ordering.
 */

import type { AgentAutomation } from '../shared/localAgentAutomation';

export type AgentTriggerHandlerKind = 'interactive' | 'background';

export type AgentTriggerHandler = (entry: AgentAutomation) => void;

interface Registration {
  kind: AgentTriggerHandlerKind;
  /** Monotonic registration sequence; the within-kind tie-break. */
  seq: number;
  handler: AgentTriggerHandler;
}

const registrations = new Set<Registration>();
let unsubscribe: (() => void) | null = null;
let seqCounter = 0;

/** Ranked low-to-high; the smallest wins. */
const KIND_RANK: Record<AgentTriggerHandlerKind, number> = {
  interactive: 0,
  background: 1,
};

/**
 * The single registration a fire is delivered to, or `null` when none is
 * registered. Exported for tests: asserting the choice directly is cheaper and
 * far less brittle than asserting it through two mounted React trees.
 */
export function selectLocalAgentTriggerHandler(): AgentTriggerHandler | null {
  let best: Registration | null = null;
  for (const candidate of registrations) {
    if (!best) {
      best = candidate;
      continue;
    }
    const bestRank = KIND_RANK[best.kind];
    const rank = KIND_RANK[candidate.kind];
    if (rank < bestRank || (rank === bestRank && candidate.seq < best.seq)) best = candidate;
  }
  return best?.handler ?? null;
}

function dispatch(entry: AgentAutomation): void {
  const handler = selectLocalAgentTriggerHandler();
  if (!handler) return;
  // A throwing handler must not tear down the subscription — the next fire has
  // to keep arriving, and the surface that threw is the one that reports it.
  try {
    handler(entry);
  } catch {
    /* the handler owns its own error surface */
  }
}

/**
 * Registers a handler and returns its unregister.
 *
 * The first registration subscribes and claims; the last unregister releases.
 * Both IPC calls are fire-and-forget with their rejections swallowed: a claim
 * that fails leaves the fire recorded as `missed`, which is the honest state,
 * and there is nothing a renderer can usefully do about it beyond not crashing.
 */
export function registerLocalAgentTriggerHandler(
  kind: AgentTriggerHandlerKind,
  handler: AgentTriggerHandler,
): () => void {
  seqCounter += 1;
  const registration: Registration = { kind, seq: seqCounter, handler };
  registrations.add(registration);
  if (registrations.size === 1) {
    unsubscribe = window.api?.onLocalAgentTrigger?.((entry) => dispatch(entry)) ?? null;
    void window.api?.localAgentClaimTriggers?.().catch(() => undefined);
  }
  let released = false;
  return () => {
    // Idempotent: React 18 StrictMode double-invokes cleanups in development,
    // and a second decrement would release a claim other handlers still need.
    if (released) return;
    released = true;
    registrations.delete(registration);
    if (registrations.size > 0) return;
    unsubscribe?.();
    unsubscribe = null;
    void window.api?.localAgentReleaseTriggers?.().catch(() => undefined);
  };
}

/** Test seam. Production code never needs to drop every handler at once. */
export function resetLocalAgentTriggerHandlersForTesting(): void {
  registrations.clear();
  unsubscribe?.();
  unsubscribe = null;
  seqCounter = 0;
}
