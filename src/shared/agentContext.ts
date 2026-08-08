/**
 * Producers for `AgentContextItem` — the shelf of "what the Agent can currently
 * see".
 *
 * The context pipeline was already complete except for its first link. The type,
 * `normalizeContext`, the privacy evaluation in `evaluateAgentProviderPrivacy`
 * and the prompt formatting in `main/agentProviderRouter.ts` all existed and
 * were tested, and `main/agentExecutionIpc.ts` already reads
 * `conversation.context` and hands it to the provider. But **no production code
 * ever built one**, so every conversation's `context` was permanently `[]`: the
 * shell's disclosure always read "no context", and the model never received the
 * word, passage or cue the user was looking at.
 *
 * This module is that first link, and it is deliberately shared rather than
 * renderer-only — `conversation.context` is main-owned state that crosses the
 * workspace bridge, so both sides need the same idea of what a well-formed item
 * is and what it costs.
 *
 * Two rules are encoded here rather than left to call sites:
 *
 * 1. **Sensitivity is a property of the kind, not of the caller's mood.** A
 *    producer may raise an item's sensitivity but never lower it below its
 *    kind's floor. Otherwise a surface could mark a reading passage `ordinary`
 *    and quietly walk it past the cloud privacy boundary that
 *    `evaluateAgentProviderPrivacy` exists to enforce.
 * 2. **Retention is opt-in and is refused for anything above `ordinary`.** The
 *    store already prunes non-retained context at the persistence boundary; this
 *    keeps a producer from marking personal content `retained` and writing it to
 *    disk in the first place.
 */

import {
  type AgentContextItem,
  type AgentContextKind,
  type AgentContextSource,
  type AgentConversation,
  type AgentSensitivity,
} from './agentWorkspace';

/**
 * How many items a conversation's shelf holds. The shelf is "what the agent can
 * see now", not a history — an unbounded one would silently grow the prompt,
 * and `agentProviderRouter` would then fail the request on the input budget
 * rather than on anything the user did.
 */
export const AGENT_CONTEXT_SHELF_LIMIT = 12;

/** Matches the bound `normalizeContext` applies, so nothing is silently trimmed later. */
export const AGENT_CONTEXT_PREVIEW_MAX = 8_000;
export const AGENT_CONTEXT_LABEL_MAX = 500;

const SENSITIVITY_RANK: Record<AgentSensitivity, number> = {
  ordinary: 0,
  personal: 1,
  sensitive: 2,
};

/**
 * The lowest sensitivity each kind may claim.
 *
 * `route` is the app's own navigation state and carries nothing of the user's.
 * A dictionary entry is reference data. Everything else is the user's own
 * material — what they are reading, watching, studying or have saved — and a
 * `file` is whatever they picked off disk, which is the least knowable of all.
 */
const SENSITIVITY_FLOOR: Record<AgentContextKind, AgentSensitivity> = {
  route: 'ordinary',
  'dictionary-entry': 'ordinary',
  'selected-text': 'personal',
  'reading-passage': 'personal',
  'media-cue': 'personal',
  'study-session': 'personal',
  'saved-words': 'personal',
  file: 'sensitive',
};

export function agentContextSensitivityFloor(kind: AgentContextKind): AgentSensitivity {
  return SENSITIVITY_FLOOR[kind];
}

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export interface AgentContextInput {
  kind: AgentContextKind;
  label: string;
  preview?: string;
  source: AgentContextSource;
  /** Raised to the kind's floor when lower. Defaults to the floor. */
  sensitivity?: AgentSensitivity;
  /** Honoured only for `ordinary` content; see the file header. */
  retained?: boolean;
  /**
   * Stable identity for "the same thing". Two lookups of the same word are one
   * shelf item, not two — so a producer supplies what makes it the same, and the
   * id is derived from that plus the kind.
   */
  identity: string;
  now: number;
}

/**
 * Builds a normalized item. Returns `null` when the input could not describe
 * anything — an empty label or identity, or a source with no app — rather than
 * inventing a placeholder that would occupy a shelf slot and say nothing.
 */
export function createAgentContextItem(input: AgentContextInput): AgentContextItem | null {
  const label = clamp(input.label, AGENT_CONTEXT_LABEL_MAX);
  const identity = clamp(input.identity, 200);
  const app = clamp(input.source.app, 120);
  if (!label || !identity || !app) return null;

  const floor = SENSITIVITY_FLOOR[input.kind];
  const requested = input.sensitivity ?? floor;
  const sensitivity = SENSITIVITY_RANK[requested] >= SENSITIVITY_RANK[floor] ? requested : floor;

  return {
    id: `${input.kind}:${identity}`,
    kind: input.kind,
    label,
    preview: clamp(input.preview ?? '', AGENT_CONTEXT_PREVIEW_MAX),
    source: {
      app,
      ...(clamp(input.source.route ?? '', 500) ? { route: clamp(input.source.route ?? '', 500) } : {}),
      ...(clamp(input.source.entityId ?? '', 500)
        ? { entityId: clamp(input.source.entityId ?? '', 500) }
        : {}),
    },
    sensitivity,
    // Retention is refused outright above `ordinary` rather than quietly
    // downgraded later by the store's persistence filter, so a producer cannot
    // believe it saved something that will not survive a restart.
    retained: input.retained === true && sensitivity === 'ordinary',
    createdAt: Math.max(0, Math.floor(input.now)),
  };
}

/**
 * Puts an item on a shelf: newest first, one entry per identity, bounded.
 *
 * Re-adding the same item moves it to the front and refreshes it rather than
 * duplicating — looking a word up twice is one context, and the second lookup is
 * the one that says it still matters.
 */
export function attachAgentContext(
  shelf: readonly AgentContextItem[],
  item: AgentContextItem,
): AgentContextItem[] {
  return [item, ...shelf.filter((existing) => existing.id !== item.id)]
    .slice(0, AGENT_CONTEXT_SHELF_LIMIT);
}

export function detachAgentContext(
  shelf: readonly AgentContextItem[],
  id: string,
): AgentContextItem[] {
  return shelf.filter((item) => item.id !== id);
}

/**
 * Whether two items say the same thing.
 *
 * `createdAt` is deliberately excluded. A producer builds a fresh object on
 * every gesture, so reference equality would report a change for a word already
 * sitting at the front of the shelf, and looking the same word up twice would
 * rewrite the main-owned workspace file for nothing. What the shelf shows and
 * what the model receives are identical in that case, and `createdAt` is
 * displayed nowhere — so the second lookup is genuinely a no-op.
 */
function sameContextItem(a: AgentContextItem, b: AgentContextItem): boolean {
  return (
    a.id === b.id
    && a.kind === b.kind
    && a.label === b.label
    && a.preview === b.preview
    && a.sensitivity === b.sensitivity
    && a.retained === b.retained
    && a.source.app === b.source.app
    && a.source.route === b.source.route
    && a.source.entityId === b.source.entityId
  );
}

/**
 * Attaches to a conversation, returning `null` when nothing would change — the
 * convention `agentShellModel.ts` uses so the shell can skip a pointless save
 * rather than rewriting the workspace file on every click.
 */
export function conversationWithAgentContext(
  conversation: AgentConversation,
  item: AgentContextItem,
  now: number,
): AgentConversation | null {
  const context = attachAgentContext(conversation.context, item);
  if (
    context.length === conversation.context.length
    && context.every((entry, index) => sameContextItem(entry, conversation.context[index]))
  ) {
    return null;
  }
  return { ...conversation, context, updatedAt: now };
}

export function conversationWithoutAgentContext(
  conversation: AgentConversation,
  id: string,
  now: number,
): AgentConversation | null {
  const context = detachAgentContext(conversation.context, id);
  if (context.length === conversation.context.length) return null;
  return { ...conversation, context, updatedAt: now };
}
