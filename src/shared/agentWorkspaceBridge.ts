/**
 * The typed contract between the main-owned Agent workspace store
 * (`main/agentWorkspaceStore.ts`) and its renderer consumer.
 *
 * Slice 6 deliberately shipped the store with no IPC because a channel without a
 * renderer consumer is a dead channel the architecture gate rejects. This module
 * is the other half, and it lands in the same checkpoint as the shell that calls
 * it — see `renderer/agentWorkspaceClient.ts` and
 * `renderer/components/agent/AgentWorkspaceShell.tsx`.
 *
 * Two rules shape the shapes below:
 *
 * 1. **Failures carry a code, never prose.** A main-process error message can
 *    contain a user-data path or an `fs` errno string, and the renderer cannot
 *    translate it either. So the boundary returns one of a closed set of codes
 *    and the shell resolves it through `t('agent.error.<code>')`.
 * 2. **Both directions are untrusted.** `normalizeAgentWorkspaceResult` exists
 *    because a renderer must not assume the reply it got is the reply this file
 *    describes; the state inside it is re-normalized by
 *    `normalizeAgentWorkspaceState`, exactly as the store does on its own reads.
 */

import {
  AGENT_WORKSPACE_SCHEMA_VERSION,
  normalizeAgentWorkspaceState,
  type AgentWorkspaceState,
} from './agentWorkspace';

/**
 * Channel ids, in one place so the parity test can assert that the handler, the
 * preload method, the renderer declaration and the client call site all agree.
 * The call sites themselves still spell the literal out, the way every other
 * channel in this repo does, so `tools/architecture-audit.cjs` can see both ends.
 */
export const AGENT_WORKSPACE_CHANNELS = {
  load: 'agentWorkspace:load',
  save: 'agentWorkspace:save',
  deleteConversation: 'agentWorkspace:deleteConversation',
  clear: 'agentWorkspace:clear',
  /**
   * Main → renderer, added once the workspace acquired a second writer.
   *
   * The shell loaded once on mount, which was correct while it was the only
   * thing that ever wrote. A contextual hand-off (`renderer/agentContextHandoff.ts`)
   * broke that: it writes context straight into the store, and an Agent that was
   * already open went on reporting "0 conversations" while the file held one —
   * measured live. Re-opening the route only focuses the window, so the route
   * change could not be the signal either.
   *
   * The push goes to *every* window including the one that wrote. Excluding the
   * sender would look like a saving of one render, but it is the sender that has
   * the same-window hand-off problem — the producer and the shell are both in
   * the Study OS window — so excluding it would leave the original defect in
   * place and only fix the pop-out. Re-applying the state a window already holds
   * is idempotent.
   */
  changed: 'agentWorkspace:changed',
} as const;

export type AgentWorkspaceChannel =
  (typeof AGENT_WORKSPACE_CHANNELS)[keyof typeof AGENT_WORKSPACE_CHANNELS];

/**
 * `bridge-unavailable` is renderer-only: it means `window.api` does not carry
 * the method, which is what a stale preload or a non-Electron host looks like.
 * The other three can only originate in main.
 */
export type AgentWorkspaceFailureCode =
  | 'invalid-request'
  | 'read-failed'
  | 'write-failed'
  | 'bridge-unavailable';

export interface AgentWorkspaceSuccess {
  ok: true;
  state: AgentWorkspaceState;
}

export interface AgentWorkspaceFailure {
  ok: false;
  code: AgentWorkspaceFailureCode;
}

export type AgentWorkspaceResult = AgentWorkspaceSuccess | AgentWorkspaceFailure;

const FAILURE_CODES = new Set<AgentWorkspaceFailureCode>([
  'invalid-request',
  'read-failed',
  'write-failed',
  'bridge-unavailable',
]);

/** Conversation ids are opaque strings; the store bounds everything else. */
const CONVERSATION_ID_MAX = 240;

export function agentWorkspaceSuccess(state: AgentWorkspaceState): AgentWorkspaceSuccess {
  return { ok: true, state };
}

export function agentWorkspaceFailure(code: AgentWorkspaceFailureCode): AgentWorkspaceFailure {
  return { ok: false, code };
}

/** `null` for anything that is not a usable id, so a handler can refuse it. */
export function normalizeAgentConversationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().slice(0, CONVERSATION_ID_MAX);
  return id || null;
}

/**
 * Guards a save before it reaches the store.
 *
 * This is not defensive decoration. `prepareAgentWorkspaceForPersistence`
 * answers an unknown `version` with the *empty* workspace, which is correct for
 * a read (fail closed) and destructive for a write: a renderer that posted a
 * malformed document would silently overwrite real history with nothing. So a
 * save must present the current schema version before the store is allowed to
 * see it at all.
 */
export function isAgentWorkspaceSavePayload(value: unknown): value is { version: number } {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { version?: unknown }).version === AGENT_WORKSPACE_SCHEMA_VERSION
  );
}

/**
 * Re-derives a result from whatever actually crossed the bridge. An unknown
 * shape becomes `read-failed` rather than a thrown renderer exception, because
 * the shell has a recoverable error state and no way to recover from a throw.
 */
export function normalizeAgentWorkspaceResult(value: unknown): AgentWorkspaceResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return agentWorkspaceFailure('read-failed');
  }
  const raw = value as { ok?: unknown; code?: unknown; state?: unknown };
  if (raw.ok === true) return agentWorkspaceSuccess(normalizeAgentWorkspaceState(raw.state));
  if (raw.ok === false && FAILURE_CODES.has(raw.code as AgentWorkspaceFailureCode)) {
    return agentWorkspaceFailure(raw.code as AgentWorkspaceFailureCode);
  }
  return agentWorkspaceFailure('read-failed');
}
