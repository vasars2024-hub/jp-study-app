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
 * This module is the missing half: the non-retained items and result cards
 * derived from them, held **in main and in memory only**. Nothing here touches
 * `fs`. The store merges the two halves on read and splits them again on write,
 * so every existing consumer — the shell, the `agentWorkspace:changed`
 * broadcast, and the prompt builder in `agentExecutionIpc` — sees whole
 * conversations without knowing there are two sources. No new IPC channel
 * exists, because none is needed.
 *
 * Why main rather than the renderer, when the data is deliberately not durable:
 * the Agent's state is main-owned with no renderer copy, and two of the three
 * consumers are in main. A renderer-held copy would also not reach a pop-out,
 * which is the defect the change broadcast just finished fixing.
 */

import type {
  AgentAttachment,
  AgentContextItem,
  AgentResultCard,
  AgentWorkspaceState,
} from '../shared/agentWorkspace';

/**
 * Matches the per-conversation context cap in `normalizeAgentWorkspaceState`, so
 * the merged view cannot exceed what the normalizer would accept on the way back
 * in. The conversation cap is a memory backstop, not a product limit — a real
 * workspace is far smaller, and the oldest entries are the ones to lose.
 */
const MAX_ITEMS_PER_CONVERSATION = 100;
const MAX_MESSAGES_PER_CONVERSATION = 2_000;
const MAX_CARDS_PER_MESSAGE = 100;
const MAX_ATTACHMENTS_PER_MESSAGE = 50;
const MAX_CONVERSATIONS = 200;

interface AgentSessionConversation {
  context: AgentContextItem[];
  cardsByMessage: Map<string, AgentResultCard[]>;
  attachmentsByMessage: Map<string, AgentAttachment[]>;
  providerAttachmentIdsByMessage: Map<string, string[]>;
}

function sessionAttachmentMetadata(attachment: AgentAttachment): AgentAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(attachment.sizeBytes !== undefined ? { sizeBytes: attachment.sizeBytes } : {}),
    // A session overlay never needs a local path, and all execution attachments
    // are forced into the sensitive/non-retained lane before they reach here.
    sensitivity: 'sensitive',
    retained: false,
  };
}

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
  let byConversation = new Map<string, AgentSessionConversation>();

  /**
   * Rebuilt from the document rather than mutated in place, which is what makes
   * the cap safe.
   *
   * An earlier version mutated a long-lived Map: `set` on an existing key keeps
   * its position while a re-inserted key lands at the end, so once past the cap
   * the survivors became the next eviction victims and the dropped set *rotated
   * on every save*. `normalizeAgentWorkspaceState` allows 500 conversations
   * against this module's 200, so that state is reachable rather than theoretical.
   * Rebuilding makes the contents a pure function of the last document: no
   * rotation, and "forget every conversation the document does not mention"
   * falls out for free instead of needing its own pass.
   *
   * The active conversation is absorbed first so the cap can never evict the one
   * the user is looking at.
   */
  const absorb = (state: AgentWorkspaceState): void => {
    const next = new Map<string, AgentSessionConversation>();
    const active = state.conversations.filter((entry) => entry.id === state.activeConversationId);
    const rest = state.conversations.filter((entry) => entry.id !== state.activeConversationId);
    for (const conversation of [...active, ...rest]) {
      if (next.size >= MAX_CONVERSATIONS) break;
      const context = conversation.context
        .filter((item) => !item.retained)
        .slice(0, MAX_ITEMS_PER_CONVERSATION);

      const contextIds = new Set(conversation.context.map((item) => item.id));
      const sessionContextIds = new Set(context.map((item) => item.id));
      const sessionAttachmentIds = new Set(
        conversation.messages.flatMap((message) => (
          message.attachments.filter((attachment) => !attachment.retained)
            .map((attachment) => attachment.id)
        )),
      );
      const cardsByMessage = new Map<string, AgentResultCard[]>();
      const attachmentsByMessage = new Map<string, AgentAttachment[]>();
      const providerAttachmentIdsByMessage = new Map<string, string[]>();
      for (const message of conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)) {
        const attachments: AgentAttachment[] = [];
        const attachmentIds = new Set<string>();
        for (const attachment of message.attachments) {
          if (attachment.retained || attachmentIds.has(attachment.id)) continue;
          attachmentIds.add(attachment.id);
          attachments.push(sessionAttachmentMetadata(attachment));
          if (attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
        }
        if (attachments.length > 0) {
          attachmentsByMessage.set(message.id, attachments);
        }
        const providerAttachmentIds = [...new Set(message.provider?.attachmentIds ?? [])]
          // A provider disclosure belongs to the assistant row, while the
          // request metadata belongs to the user row. Match across the
          // conversation so the disclosure survives the same session split.
          .filter((id) => sessionAttachmentIds.has(id));
        if (providerAttachmentIds.length > 0) {
          providerAttachmentIdsByMessage.set(message.id, providerAttachmentIds);
        }
        const cards: AgentResultCard[] = [];
        const cardIds = new Set<string>();
        for (const card of message.cards) {
          if (cards.length >= MAX_CARDS_PER_MESSAGE) break;
          if (cardIds.has(card.id)) continue;
          if (
            card.sourceContextIds.length === 0
            || !card.sourceContextIds.some((id) => sessionContextIds.has(id))
            || !card.sourceContextIds.every((id) => contextIds.has(id))
          ) continue;
          cardIds.add(card.id);
          cards.push(card);
        }
        if (cards.length > 0) cardsByMessage.set(message.id, cards);
      }
      if (context.length === 0 && attachmentsByMessage.size === 0) continue;
      next.set(conversation.id, {
        context,
        cardsByMessage,
        attachmentsByMessage,
        providerAttachmentIdsByMessage,
      });
    }
    byConversation = next;
  };

  const merge = (persisted: AgentWorkspaceState): AgentWorkspaceState => {
    if (byConversation.size === 0) return persisted;
    return {
      ...persisted,
      conversations: persisted.conversations.map((conversation) => {
        const sessionOnly = byConversation.get(conversation.id);
        if (!sessionOnly) return conversation;
        // Retained items first, then session-only. The split loses the original
        // interleaving, and the shelf is identity-keyed and bounded rather than
        // order-sensitive, so this is stable after one round trip instead of
        // pretending to reconstruct an order the file never stored.
        const retainedIds = new Set(conversation.context.map((item) => item.id));
        const additions = sessionOnly.context.filter((item) => !retainedIds.has(item.id));
        const messages = conversation.messages.map((message) => {
          const sessionCards = sessionOnly.cardsByMessage.get(message.id);
          const sessionAttachments = sessionOnly.attachmentsByMessage.get(message.id);
          const sessionProviderAttachmentIds = sessionOnly.providerAttachmentIdsByMessage
            .get(message.id);
          let nextMessage = message;

          if (sessionCards && sessionCards.length > 0) {
            // A retained card with the same identity is file-owned. Keeping it and
            // refusing the session duplicate makes the split deterministic even if
            // a malformed producer reuses an id for two provenance sets.
            const persistedCardIds = new Set(message.cards.map((card) => card.id));
            const cardAdditions = sessionCards.filter((card) => !persistedCardIds.has(card.id));
            if (cardAdditions.length > 0) {
              nextMessage = {
                ...nextMessage,
                cards: [...message.cards, ...cardAdditions].slice(0, MAX_CARDS_PER_MESSAGE),
              };
            }
          }

          if (sessionAttachments && sessionAttachments.length > 0) {
            // A retained attachment with the same identity is file-owned. This
            // mirrors the card rule and makes repeated reads idempotent.
            const persistedAttachmentIds = new Set(message.attachments.map((item) => item.id));
            const attachmentAdditions = sessionAttachments
              .filter((attachment) => !persistedAttachmentIds.has(attachment.id));
            if (attachmentAdditions.length > 0) {
              nextMessage = {
                ...nextMessage,
                attachments: [...message.attachments, ...attachmentAdditions]
                  .slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
              };
            }
          }

          if (nextMessage.provider && sessionProviderAttachmentIds
            && sessionProviderAttachmentIds.length > 0) {
            const persistedAttachmentIds = new Set(nextMessage.provider.attachmentIds);
            const attachmentIds = [
              ...nextMessage.provider.attachmentIds,
              ...sessionProviderAttachmentIds.filter((id) => !persistedAttachmentIds.has(id)),
            ].slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
            if (attachmentIds.length !== nextMessage.provider.attachmentIds.length) {
              nextMessage = {
                ...nextMessage,
                provider: { ...nextMessage.provider, attachmentIds },
              };
            }
          }

          return nextMessage;
        });
        const messagesChanged = messages.some((message, index) => (
          message !== conversation.messages[index]
        ));
        if (additions.length === 0 && !messagesChanged) return conversation;
        return {
          ...conversation,
          context: [...conversation.context, ...additions]
            .slice(0, MAX_ITEMS_PER_CONVERSATION),
          ...(messagesChanged ? { messages } : {}),
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
