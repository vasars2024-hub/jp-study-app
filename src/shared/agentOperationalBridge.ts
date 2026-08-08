/**
 * The typed contract between the main-owned Agent operational store
 * (`main/agentOperationalStore.ts`) and its renderer consumer
 * (`renderer/agentOperationalClient.ts`).
 *
 * Shaped the same way as `agentWorkspaceBridge.ts`, for the same two reasons:
 *
 * 1. **Failures carry a code, never prose.** A main-process error message can
 *    contain a user-data path or an `fs` errno string, and the renderer could not
 *    translate it anyway. The boundary returns one of a closed set of codes.
 * 2. **Both directions are untrusted.** `normalizeAgentOperationalResult`
 *    re-derives whatever actually crossed, and the state inside it is
 *    re-normalized exactly as the store does on its own reads.
 *
 * The one addition over the workspace bridge is `agentOperational:changed`, a
 * main → renderer push. The workspace has a single owning surface; the queue,
 * memory and automations are read by the Blanc panel, the settings Memory page
 * and the tool registry at once, in as many windows as the user has open. A
 * write in one of them has to reach the others, and main is the only place that
 * knows a write happened.
 */

import {
  AGENT_OPERATIONAL_SCHEMA_VERSION,
  normalizeAgentOperationalState,
  type AgentOperationalState,
} from './agentOperationalState';

/**
 * Channel ids in one place so a parity test can assert the handler, the preload
 * method, the renderer declaration and the client call site agree. Call sites
 * still spell the literal out, as every other channel in this repo does, so
 * `tools/architecture-audit.cjs` can see both ends.
 */
export const AGENT_OPERATIONAL_CHANNELS = {
  load: 'agentOperational:load',
  save: 'agentOperational:save',
  migrateLegacy: 'agentOperational:migrateLegacy',
  changed: 'agentOperational:changed',
} as const;

export type AgentOperationalChannel =
  (typeof AGENT_OPERATIONAL_CHANNELS)[keyof typeof AGENT_OPERATIONAL_CHANNELS];

/**
 * `bridge-unavailable` is renderer-only: `window.api` does not carry the method,
 * which is what a stale preload or a non-Electron host looks like. The other
 * three can only originate in main.
 */
export type AgentOperationalFailureCode =
  | 'invalid-request'
  | 'read-failed'
  | 'write-failed'
  | 'bridge-unavailable';

export interface AgentOperationalSuccess {
  ok: true;
  state: AgentOperationalState;
}

export interface AgentOperationalFailure {
  ok: false;
  code: AgentOperationalFailureCode;
}

export type AgentOperationalResult = AgentOperationalSuccess | AgentOperationalFailure;

const FAILURE_CODES = new Set<AgentOperationalFailureCode>([
  'invalid-request',
  'read-failed',
  'write-failed',
  'bridge-unavailable',
]);

export function agentOperationalSuccess(state: AgentOperationalState): AgentOperationalSuccess {
  return { ok: true, state };
}

export function agentOperationalFailure(
  code: AgentOperationalFailureCode,
): AgentOperationalFailure {
  return { ok: false, code };
}

/**
 * Guards a save before it reaches the store.
 *
 * `normalizeAgentOperationalState` answers an unknown `version` with the *empty*
 * document, which is correct for a read (fail closed) and destructive for a
 * write: a renderer posting a malformed payload would silently replace the real
 * queue, memory and schedule with nothing. So a save must present the current
 * schema version before the store is allowed to see it at all.
 */
export function isAgentOperationalSavePayload(value: unknown): value is { version: number } {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { version?: unknown }).version === AGENT_OPERATIONAL_SCHEMA_VERSION
  );
}

/**
 * A legacy migration payload is *not* version-guarded the way a save is: by
 * definition it carries the old unversioned documents. It only has to be an
 * object; each section is normalized by its own existing normalizer, and
 * `adoptLegacyAgentOperationalState` refuses to overwrite anything non-empty.
 */
export function isLegacyAgentOperationalPayload(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Re-derives a result from whatever actually crossed the bridge. An unknown
 * shape becomes `read-failed` rather than a thrown renderer exception, because
 * the consumers have a recoverable path and no way to recover from a throw.
 */
export function normalizeAgentOperationalResult(value: unknown): AgentOperationalResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return agentOperationalFailure('read-failed');
  }
  const raw = value as { ok?: unknown; code?: unknown; state?: unknown };
  if (raw.ok === true) return agentOperationalSuccess(normalizeAgentOperationalState(raw.state));
  if (raw.ok === false && FAILURE_CODES.has(raw.code as AgentOperationalFailureCode)) {
    return agentOperationalFailure(raw.code as AgentOperationalFailureCode);
  }
  return agentOperationalFailure('read-failed');
}
