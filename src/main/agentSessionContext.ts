/**
 * The session-only half of the Agent workspace.
 *
 * `prepareAgentWorkspaceForPersistence` drops every context item that is not
 * `retained`, which is correct — session-only material must not cross a process
 * restart. But the only route from a producer to the shelf ran *through* that
 * filter, so a `selected-text`, `reading-passage` or `media-cue` item was built
 * correctly by `shared/agentContext.ts` and then silently dropped by the save.
 * Retention is refused above `ordinary` on purpose, so those kinds could never
 * opt out of the drop either. The result was a shelf that could only ever show
 * reference data.
 *
 * This module is the missing half: the non-retained items, held **in main and in
 * memory only**. Nothing here touches `fs`. The store merges the two halves on
 * read and splits them again on write, so every existing consumer — the shell,
 * the `agentWorkspace:changed` broadcast, and the prompt builder in
 * `agentExecutionIpc` — sees whole conversations without knowing there are two
 * sources. No new IPC channel exists, because none is needed.
 *
 * Why main rather than the renderer, when the data is deliberately not durable:
 * the Agent's state is main-owned with no renderer copy, and two of the three
 * consumers are in main. A renderer-held copy would also not reach a pop-out,
 * which is the defect the change broadcast just finished fixing.
 */

import type { AgentContextItem, AgentWorkspaceState } from '../shared/agentWorkspace';

/**
 * Matches the per-conversation context cap in `normalizeAgentWorkspaceState`, so
 * the merged view cannot exceed what the normalizer would accept on the way back
 * in. The conversation cap is a memory backstop, not a product limit — a real
 * workspace is far smaller, and the oldest entries are the ones to lose.
 */
const MAX_ITEMS_PER_CONVERSATION = 100;
const MAX_CONVERSATIONS = 200;

export interface AgentSessionContextStore {
  /**
   * Replaces the session half from a whole workspace document, and forgets every
   * conversation the document does not mention.
   *
   * Replace rather than union: removing an item from the shelf reaches us as a
   * save that simply no longer lists it, and a union would make removal
   * impossible. Forgetting absent conversations is what makes `deleteConversation`
   * and `clear` collect their session entries for free — both of them write a
   * document with the conversation gone.
   */
  absorb(state: AgentWorkspaceState): void;
  /** The persisted half plus the session half, per conversation. */
  merge(persisted: AgentWorkspaceState): AgentWorkspaceState;
  /** Test seam: how many conversations currently hold session context. */
  size(): number;
}

export function createAgentSessionContextStore(): AgentSessionContextStore {
  const byConversation = new Map<string, AgentContextItem[]>();

  const absorb = (state: AgentWorkspaceState): void => {
    const seen = new Set<string>();
    for (const conversation of state.conversations) {
      seen.add(conversation.id);
      const sessionOnly = conversation.context
        .filter((item) => !item.retained)
        .slice(0, MAX_ITEMS_PER_CONVERSATION);
      if (sessionOnly.length === 0) byConversation.delete(conversation.id);
      else byConversation.set(conversation.id, sessionOnly);
    }
    for (const id of [...byConversation.keys()]) {
      if (!seen.has(id)) byConversation.delete(id);
    }
    // Insertion order is oldest-first, so the oldest conversations are the ones
    // that fall off the backstop.
    while (byConversation.size > MAX_CONVERSATIONS) {
      const oldest = byConversation.keys().next();
      if (oldest.done) break;
      byConversation.delete(oldest.value);
    }
  };

  const merge = (persisted: AgentWorkspaceState): AgentWorkspaceState => {
    if (byConversation.size === 0) return persisted;
    return {
      ...persisted,
      conversations: persisted.conversations.map((conversation) => {
        const sessionOnly = byConversation.get(conversation.id);
        if (!sessionOnly || sessionOnly.length === 0) return conversation;
        // Retained items first, then session-only. The split loses the original
        // interleaving, and the shelf is identity-keyed and bounded rather than
        // order-sensitive, so this is stable after one round trip instead of
        // pretending to reconstruct an order the file never stored.
        const retainedIds = new Set(conversation.context.map((item) => item.id));
        const additions = sessionOnly.filter((item) => !retainedIds.has(item.id));
        if (additions.length === 0) return conversation;
        return {
          ...conversation,
          context: [...conversation.context, ...additions]
            .slice(0, MAX_ITEMS_PER_CONVERSATION),
        };
      }),
    };
  };

  return { absorb, merge, size: () => byConversation.size };
}

/**
 * One session store per process, alongside the one workspace store. It is
 * deliberately not exported as a mutable singleton the way a cache would be:
 * `createAgentWorkspaceStore` takes it as a dependency so a test can hold its
 * own.
 */
let defaultStore: AgentSessionContextStore | null = null;

export function getAgentSessionContextStore(): AgentSessionContextStore {
  if (!defaultStore) defaultStore = createAgentSessionContextStore();
  return defaultStore;
}
