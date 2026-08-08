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

/**
 * Switches a conversation's workflow preset.
 *
 * The mode was a display-only field for four slices: the type carried all six,
 * the normalizer validated them and the shell rendered the chip, but nothing
 * ever wrote one, so every conversation was `ask` forever. This is the write.
 *
 * `updatedAt` moves because the rail sorts on it and a mode switch is a real
 * edit the user just made — the conversation should not stay buried under
 * others it was more recently touched than.
 */
export function agentWorkspaceWithMode(
  state: AgentWorkspaceState,
  conversationId: string,
  mode: AgentWorkspaceMode,
  now: number,
): AgentWorkspaceState | null {
  const target = state.conversations.find((conversation) => conversation.id === conversationId);
  if (!target || target.mode === mode) return null;
  return {
    ...state,
    conversations: state.conversations.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, mode, updatedAt: now }
        : conversation
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

export interface AgentHistoryMatch {
  conversationId: string;
  title: string;
  /**
   * Archived conversations are findable here even though the rail hides them.
   * Searching history is precisely when someone wants the one they put away, so
   * excluding them would make the feature useless at its main job — but the flag
   * travels so the surface can mark it rather than pretending it is on the rail.
   */
  archived: boolean;
  updatedAt: number;
  /** How many stored messages matched, so a long chat reads as one row honestly. */
  messageMatches: number;
  /** True when the conversation's own title matched. */
  titleMatched: boolean;
  /** A bounded excerpt around the newest match, or the title when only it matched. */
  snippet: string;
}

/** Matches `localAgentKnowledge`'s idiom so two agent surfaces fold text alike. */
function foldForSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

/**
 * A bounded excerpt centred on the match.
 *
 * The whole message would defeat the purpose — a result list has to be scannable,
 * and a stored assistant reply can be thousands of characters. Ellipses are added
 * only on the side actually cut.
 */
function snippetAround(text: string, at: number, queryLength: number, span = 48): string {
  const start = Math.max(0, at - span);
  const end = Math.min(text.length, at + queryLength + span);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/**
 * Searches stored conversation history.
 *
 * **Substring, not tokens.** Japanese has no required word spaces, so splitting a
 * query into words would fail on exactly the queries this app exists to serve —
 * `localAgentKnowledge.terms()` already documents the same problem and falls back
 * the same way. Both sides are NFKC-folded and lowercased, so a half-width
 * katakana or full-width ASCII query finds text stored in the other form.
 *
 * **One row per conversation.** A single long chat would otherwise flood the
 * result list and bury every other conversation that matched once. The count
 * travels instead, and the snippet comes from the newest matching message.
 *
 * **Context is deliberately not searched.** The shelf is what the Agent can see
 * *now*, not what was said — and session-only items do not survive a restart, so
 * a result pointing at one would vanish between launches. History means the
 * stored messages and the title.
 *
 * An empty or whitespace-only query returns `[]` rather than everything, so the
 * surface can treat "no query" as "show the normal rail" without a second flag.
 */
export function agentHistorySearch(
  state: AgentWorkspaceState,
  query: string,
): AgentHistoryMatch[] {
  const needle = foldForSearch(query.trim());
  if (!needle) return [];

  const matches: AgentHistoryMatch[] = [];
  for (const conversation of state.conversations) {
    const titleMatched = foldForSearch(conversation.title).includes(needle);

    let messageMatches = 0;
    let snippet = '';
    // Newest first, so the first hit found is the one worth showing.
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
      const text = conversation.messages[index]?.text ?? '';
      const at = foldForSearch(text).indexOf(needle);
      if (at < 0) continue;
      messageMatches += 1;
      if (!snippet) snippet = snippetAround(text, at, needle.length);
    }

    if (!titleMatched && messageMatches === 0) continue;
    matches.push({
      conversationId: conversation.id,
      title: conversation.title,
      archived: conversation.archived,
      updatedAt: conversation.updatedAt,
      messageMatches,
      titleMatched,
      snippet: snippet || conversation.title,
    });
  }

  // Most recently touched first, with the same `id` tiebreak the rail uses so a
  // shared millisecond stamp does not reorder results between renders.
  return matches.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.conversationId.localeCompare(b.conversationId);
  });
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
