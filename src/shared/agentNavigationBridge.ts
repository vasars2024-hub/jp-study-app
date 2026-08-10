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
  isAgentNavigationDestination,
  type AgentNavigationDestination,
  type AgentNavigationFailureCode,
} from './agentNavigation';

export const AGENT_NAVIGATION_CHANNELS = {
  run: 'agentNavigation:run',
  settingsDelivery: 'agentNavigation:settings-delivery',
} as const;

/** Destination-only payload main delivers to an already-authorized Settings window. */
export type AgentSettingsNavigationLink = AgentNavigationDestination & {
  section: 'settings';
  page: string;
};

/**
 * Why Settings refused one delivery.
 *
 * The distinction is the whole finality rule. `invalid` is a judgement about the
 * *destination* — it failed the registry check — and nothing about asking again
 * would change it. `not-ready` is a statement about this *window*: it cannot
 * answer yet. Collapsing the two is what made an approved cold open report
 * failure while the correct page sat open on screen.
 */
export type AgentSettingsDeliveryRefusal = 'invalid' | 'not-ready';

/**
 * In-process acknowledgement added by main's delivery script. It cannot cross
 * IPC and is never renderer input to the navigation run channel.
 */
export interface AgentSettingsNavigationDelivery extends AgentSettingsNavigationLink {
  handled: () => void;
  accept: () => void;
  /** An unqualified refusal is treated as `invalid`, and so is final. */
  reject: (refusal?: AgentSettingsDeliveryRefusal) => void;
}

/** What one delivery attempt resolved to, as main's injected script reports it. */
export type AgentSettingsDeliveryOutcome =
  | 'accepted'
  /** Settings judged the destination itself unusable. */
  | 'invalid'
  /** Settings took the event but cannot acknowledge yet, or went quiet. */
  | 'not-ready'
  /** No listener claimed the event — Settings has not mounted it yet. */
  | 'unhandled';

export type AgentSettingsDeliveryDecision = 'accept' | 'retry' | 'fail';

/**
 * How long main keeps re-offering one destination to a Settings window, measured
 * from the load rather than counted in attempts, and how long it waits on a
 * window that took the event and then went quiet.
 *
 * Sized from measurement, not taste. A cold pop-out on this machine needed about
 * 3.2 s to load and a further ~2 s before React had mounted the listener, and an
 * occluded window throttles its own timers to roughly one tick per second — so a
 * budget in the low seconds fails the exact case it exists to serve.
 */
export const AGENT_SETTINGS_DELIVERY_BUDGET_MS = 8000;
export const AGENT_SETTINGS_DELIVERY_ATTEMPT_MS = 3000;

/**
 * The finality rule, kept here as one pure function so it is testable without
 * Electron and cannot drift between main and its tests.
 *
 * An `invalid` refusal fails immediately and is never reconsidered — a
 * destination Settings has judged unusable must not become a success because
 * main asked a second time. Everything else is a window that is not ready, and
 * is retried until the budget runs out and then fails honestly.
 */
export function agentSettingsDeliveryDecision(
  outcome: AgentSettingsDeliveryOutcome,
  elapsedMs: number,
  budgetMs: number = AGENT_SETTINGS_DELIVERY_BUDGET_MS,
): AgentSettingsDeliveryDecision {
  if (outcome === 'accepted') return 'accept';
  if (outcome === 'invalid') return 'fail';
  return elapsedMs < budgetMs ? 'retry' : 'fail';
}

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
    if (isAgentNavigationDestination(destination)) {
      return {
        ok: true,
        destination: {
          section: destination.section,
          ...(destination.page ? { page: destination.page.slice(0, 500) } : {}),
          ...(destination.controlId ? { controlId: destination.controlId.slice(0, 240) } : {}),
          ...(destination.highlight === true ? { highlight: true } : {}),
        },
        opened: raw.opened === true,
      };
    }
  }
  if (raw.ok === false && FAILURE_CODES.has(raw.code as AgentNavigationFailureCode)) {
    return agentNavigationFailure(raw.code as AgentNavigationFailureCode);
  }
  return agentNavigationFailure('invalid-request');
}
