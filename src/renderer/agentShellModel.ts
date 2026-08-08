/**
 * Everything the Agent shell decides, kept out of the component.
 *
 * `vitest.config.ts` runs `src/renderer/__tests__/**` and the repo's React
 * proofs are deliberately thin, so any rule worth pinning has to be reachable
 * without mounting a tree. These functions are pure: state in, state or a
 * derived view out, no `window`, no bridge, no `t()`. The component composes
 * them and renders.
 *
 * Every transform returns `null` when it would change nothing, so the shell can
 * skip a pointless save rather than rewriting the file on every click.
 */

import {
  AGENT_WORKSPACE_SCHEMA_VERSION,
  type AgentConversation,
  type AgentContextItem,
  type AgentWorkspaceMode,
  type AgentWorkspaceState,
} from '../shared/agentWorkspace';
import type { AgentWorkspaceFailureCode } from '../shared/agentWorkspaceBridge';
import {
  conversationWithAgentContext,
  conversationWithoutAgentContext,
} from '../shared/agentContext';

export type AgentShellPhase = 'loading' | 'error' | 'empty' | 'ready';

export interface AgentContextDisclosure {
  /** Context that survives a restart, because the store keeps `retained` items. */
  retained: number;
  /** Live-only context: usable in a request, never written to disk. */
  sessionOnly: number;
  /** Items the privacy boundary refuses to send to a cloud provider by default. */
  sensitive: number;
}

export interface AgentConversationSummary {
  id: string;
  title: string;
  mode: AgentWorkspaceMode;
  updatedAt: number;
  pinned: boolean;
  messageCount: number;
  context: AgentContextDisclosure;
  /** True when any stored message discloses a cloud provider as its target. */
  usedCloud: boolean;
}

export function agentContextDisclosure(
  context: readonly AgentContextItem[],
): AgentContextDisclosure {
  return {
    retained: context.filter((item) => item.retained).length,
    sessionOnly: context.filter((item) => !item.retained).length,
    sensitive: context.filter((item) => item.sensitivity === 'sensitive').length,
  };
}

function summarize(conversation: AgentConversation): AgentConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    updatedAt: conversation.updatedAt,
    pinned: conversation.pinned,
    messageCount: conversation.messages.length,
    context: agentContextDisclosure(conversation.context),
    usedCloud: conversation.messages.some((message) => message.provider?.cloud === true),
  };
}

/**
 * Rail order: pinned first, then most recently touched. The `id` tiebreak keeps
 * the order stable when two conversations share a timestamp, which the store's
 * millisecond stamps make likely for anything created in one gesture.
 */
export function agentConversationSummaries(
  state: AgentWorkspaceState,
): AgentConversationSummary[] {
  return state.conversations
    .filter((conversation) => !conversation.archived)
    .map(summarize)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
      return a.id.localeCompare(b.id);
    });
}

export function agentSelectedConversation(
  state: AgentWorkspaceState,
): AgentConversation | null {
  if (!state.activeConversationId) return null;
  return state.conversations.find(
    (conversation) => conversation.id === state.activeConversationId,
  ) ?? null;
}

/**
 * `error` is reserved for "we never got a workspace at all". A failure with a
 * state already in hand is not this phase — the file did not change, so the
 * shell keeps showing what it last read and puts the failure in a banner beside
 * it. Collapsing to `error` there would throw away correct content, and
 * collapsing to `empty` would report "no conversations" when the truth is "we
 * could not find out": two different answers the surface must not conflate.
 */
export function agentShellPhase(input: {
  loading: boolean;
  failure: AgentWorkspaceFailureCode | null;
  state: AgentWorkspaceState | null;
}): AgentShellPhase {
  if (input.loading) return 'loading';
  if (!input.state) return input.failure ? 'error' : 'empty';
  if (agentConversationSummaries(input.state).length === 0) return 'empty';
  return 'ready';
}

export function agentWorkspaceWithSelection(
  state: AgentWorkspaceState,
  conversationId: string,
): AgentWorkspaceState | null {
  if (state.activeConversationId === conversationId) return null;
  if (!state.conversations.some((conversation) => conversation.id === conversationId)) return null;
  return { ...state, activeConversationId: conversationId };
}

/**
 * `title` arrives translated from the shell — this module never calls `t()`, and
 * `now` is injected so the result is assertable.
 */
export function agentWorkspaceWithNewConversation(
  state: AgentWorkspaceState,
  conversation: { id: string; title: string; mode?: AgentWorkspaceMode; now: number },
): AgentWorkspaceState | null {
  const id = conversation.id.trim();
  if (!id || state.conversations.some((existing) => existing.id === id)) return null;
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    activeConversationId: id,
    conversations: [
      ...state.conversations,
      {
        id,
        title: conversation.title,
        mode: conversation.mode ?? 'ask',
        createdAt: conversation.now,
        updatedAt: conversation.now,
        pinned: false,
        archived: false,
        context: [],
        messages: [],
      },
    ],
  };
}

/**
 * Attaches context to a conversation — the active one, or the one named.
 *
 * The `conversationId` is optional because the hand-off case has no conversation
 * yet: a user asking the Agent about a word from the Dictionary has not opened a
 * chat first. Rather than making every producer deal with that, this creates one
 * and selects it, so "attach context" means the same thing from an empty
 * workspace as from a busy one.
 */
export function agentWorkspaceWithContextAttached(
  state: AgentWorkspaceState,
  item: AgentContextItem,
  options: { conversationId?: string | null; newConversation: { id: string; title: string }; now: number },
): AgentWorkspaceState | null {
  const targetId = options.conversationId ?? state.activeConversationId;
  const target = targetId
    ? state.conversations.find((conversation) => conversation.id === targetId) ?? null
    : null;

  if (!target) {
    const created = agentWorkspaceWithNewConversation(state, {
      id: options.newConversation.id,
      title: options.newConversation.title,
      now: options.now,
    });
    if (!created) return null;
    return agentWorkspaceWithContextAttached(created, item, {
      conversationId: options.newConversation.id,
      newConversation: options.newConversation,
      now: options.now,
    });
  }

  const next = conversationWithAgentContext(target, item, options.now);
  // Already the front item with the same content: selecting it is still worth a
  // save when it is not the active conversation, but rewriting it is not.
  if (!next) {
    return state.activeConversationId === target.id
      ? null
      : { ...state, activeConversationId: target.id };
  }
  return {
    ...state,
    activeConversationId: target.id,
    conversations: state.conversations.map((conversation) => (
      conversation.id === target.id ? next : conversation
    )),
  };
}

export function agentWorkspaceWithContextDetached(
  state: AgentWorkspaceState,
  conversationId: string,
  contextId: string,
  now: number,
): AgentWorkspaceState | null {
  const target = state.conversations.find((conversation) => conversation.id === conversationId);
  if (!target) return null;
  const next = conversationWithoutAgentContext(target, contextId, now);
  if (!next) return null;
  return {
    ...state,
    conversations: state.conversations.map((conversation) => (
      conversation.id === conversationId ? next : conversation
    )),
  };
}

export function agentWorkspaceWithPinToggled(
  state: AgentWorkspaceState,
  conversationId: string,
  now: number,
): AgentWorkspaceState | null {
  const target = state.conversations.find((conversation) => conversation.id === conversationId);
  if (!target) return null;
  return {
    ...state,
    conversations: state.conversations.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, pinned: !conversation.pinned, updatedAt: now }
        : conversation
    )),
  };
}

/**
 * Roving-tabindex target for Up/Down in the conversation rail. Wraps, because a
 * list that silently stops at the end reads as a broken key rather than a limit.
 * Returns `null` only when there is nothing to move to.
 */
export function agentRailFocusTarget(
  ids: readonly string[],
  currentId: string | null,
  delta: number,
): string | null {
  if (ids.length === 0) return null;
  const current = currentId ? ids.indexOf(currentId) : -1;
  if (current < 0) return delta >= 0 ? ids[0] : ids[ids.length - 1];
  const next = ((current + delta) % ids.length + ids.length) % ids.length;
  return ids[next] ?? null;
}
