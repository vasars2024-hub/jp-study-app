/**
 * The IPC contract for permission-gated navigation.
 *
 * The shape is the security property, so it is worth stating plainly: **a
 * request names an action, never a destination.** A renderer submits four ids
 * and one boolean. Main looks the action up in its own store, re-resolves the
 * destination from live context, and only then decides whether anything opens.
 * There is no field a compromised or buggy renderer could set to reach a section
 * the stored card does not already point at.
 *
 * `normalizeAgentNavigationRequest` enforces that by *refusing* — not stripping —
 * a payload carrying anything destination-shaped. Silently dropping a `section`
 * field would let a caller believe it had asked for something it had not; a
 * refusal makes the mistake visible at the boundary, and the same idiom already
 * guards attachment payloads in `agentExecutionBridge.ts`.
 *
 * `approved` is likewise not a hint. `false` resolves and returns the
 * destination for the review step and is guaranteed to open nothing; `true` is
 * the user's explicit approval of a destination they have already been shown.
 */

import {
  isAgentNavigableSection,
  type AgentNavigationDestination,
  type AgentNavigationFailureCode,
} from './agentNavigation';

export const AGENT_NAVIGATION_CHANNELS = {
  run: 'agentNavigation:run',
} as const;

export interface AgentNavigationRequest {
  conversationId: string;
  messageId: string;
  cardId: string;
  actionId: string;
  /** `false` resolves for review only. `true` is the approval to open. */
  approved: boolean;
}

export interface AgentNavigationSuccess {
  ok: true;
  destination: AgentNavigationDestination;
  /** `false` for a review resolution, which never opens a window. */
  opened: boolean;
}

export interface AgentNavigationFailure {
  ok: false;
  code: AgentNavigationFailureCode;
}

export type AgentNavigationResult = AgentNavigationSuccess | AgentNavigationFailure;

const FAILURE_CODES = new Set<AgentNavigationFailureCode>([
  'invalid-request',
  'conversation-not-found',
  'action-not-found',
  'not-navigable',
  'unknown-section',
  'stale-provenance',
  'busy',
  'open-failed',
  'store-failed',
  'bridge-unavailable',
]);

/**
 * Fields that would express a destination. Their presence is a request to be
 * trusted about where to go, which this channel does not do at any value.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'section',
  'page',
  'destination',
  'route',
  'url',
  'target',
  'controlId',
  'effect',
];

const ID_MAX = 240;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, ID_MAX) : '';
}

export function agentNavigationFailure(
  code: AgentNavigationFailureCode,
): AgentNavigationFailure {
  return { ok: false, code };
}

export function normalizeAgentNavigationRequest(
  value: unknown,
): AgentNavigationRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (FORBIDDEN_REQUEST_FIELDS.some((field) => Object.hasOwn(raw, field))) return null;
  const conversationId = boundedId(raw.conversationId);
  const messageId = boundedId(raw.messageId);
  const cardId = boundedId(raw.cardId);
  const actionId = boundedId(raw.actionId);
  if (!conversationId || !messageId || !cardId || !actionId) return null;
  // Anything other than a literal `true` is not an approval. An absent, string
  // or truthy-object `approved` resolves for review instead of opening.
  return { conversationId, messageId, cardId, actionId, approved: raw.approved === true };
}

export function normalizeAgentNavigationResult(value: unknown): AgentNavigationResult {
  const raw = record(value);
  if (raw.ok === true) {
    const destination = record(raw.destination);
    if (isAgentNavigableSection(destination.section)) {
      const page = typeof destination.page === 'string' ? destination.page.slice(0, 500) : '';
      return {
        ok: true,
        destination: { section: destination.section, ...(page ? { page } : {}) },
        opened: raw.opened === true,
      };
    }
  }
  if (raw.ok === false && FAILURE_CODES.has(raw.code as AgentNavigationFailureCode)) {
    return agentNavigationFailure(raw.code as AgentNavigationFailureCode);
  }
  return agentNavigationFailure('invalid-request');
}
