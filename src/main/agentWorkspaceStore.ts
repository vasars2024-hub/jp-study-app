import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  AGENT_WORKSPACE_RELATIVE_PATH,
  emptyAgentWorkspaceState,
  isAgentQueryProvenancedCard,
  normalizeAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceState,
} from '../shared/agentWorkspace';
import {
  getAgentSessionContextStore,
  type AgentSessionContextStore,
} from './agentSessionContext';

export interface AgentWorkspaceStore {
  readonly filePath: string;
  read(): AgentWorkspaceState;
  write(value: unknown): AgentWorkspaceState;
  compareAndWrite(value: unknown): AgentWorkspaceCompareAndWriteResult;
  deleteConversation(conversationId: string): AgentWorkspaceState;
  clear(): AgentWorkspaceState;
}

export type AgentWorkspaceCompareAndWriteResult =
  | { ok: true; state: AgentWorkspaceState }
  | { ok: false; state: AgentWorkspaceState };

function retainedMessage(
  message: AgentMessage,
  contextIds: Set<string>,
  messageIds: Set<string>,
): AgentMessage {
  const attachments = message.attachments.filter((attachment) => attachment.retained);
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  return {
    ...message,
    contextIds: message.contextIds.filter((id) => contextIds.has(id)),
    attachments,
    // A card is a derived result, not just a bag of context references. Its title,
    // summary and action payloads may all repeat material from the source item.
    // Filtering only `sourceContextIds` would therefore persist the derived text
    // after a session-only source was removed. Keep the whole card only when every
    // source it declares is retained; a producer that needs persistence must make
    // that provenance explicit instead of relying on field-by-field redaction.
    cards: message.cards
      .filter((card) => (
        // The one card that carries its own provenance — see
        // `isAgentQueryProvenancedCard`. Everything else must still name a
        // retained source for every id it declares.
        isAgentQueryProvenancedCard(card)
        || (
          card.sourceContextIds.length > 0
          && card.sourceContextIds.every((id) => contextIds.has(id))
        )
      ))
      .map((card) => ({
        ...card,
        actions: card.actions.filter((action) => (
          action.effect.type !== 'open-context' || contextIds.has(action.effect.contextId)
        )),
      })),
    ...(message.provider ? {
      provider: {
        ...message.provider,
        contextIds: message.provider.contextIds.filter((id) => contextIds.has(id)),
        attachmentIds: message.provider.attachmentIds.filter((id) => attachmentIds.has(id)),
        historyMessageIds: (message.provider.historyMessageIds ?? [])
          .filter((id) => id !== message.id && messageIds.has(id)),
      },
    } : {}),
  };
}

function retainedConversation(conversation: AgentConversation): AgentConversation {
  const context = conversation.context.filter((item) => item.retained);
  const contextIds = new Set(context.map((item) => item.id));
  const messageIds = new Set(conversation.messages.map((message) => message.id));
  return {
    ...conversation,
    context,
    messages: conversation.messages.map((message) => (
      retainedMessage(message, contextIds, messageIds)
    )),
  };
}

/**
 * Non-retained context and attachments may be used in the live request but
 * must not cross the process-restart boundary. References are pruned with the
 * underlying objects so a restored conversation never points at missing data.
 */
export function prepareAgentWorkspaceForPersistence(value: unknown): AgentWorkspaceState {
  const normalized = normalizeAgentWorkspaceState(value);
  return {
    ...normalized,
    conversations: normalized.conversations.map(retainedConversation),
  };
}

function readFile(filePath: string): AgentWorkspaceState {
  try {
    return prepareAgentWorkspaceForPersistence(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return emptyAgentWorkspaceState();
  }
}

function atomicWrite(filePath: string, state: AgentWorkspaceState): void {
  const directory = path.dirname(filePath);
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporary, filePath);
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // The destination was already committed or the temporary file vanished.
    }
  }
}

/**
 * A process restart cannot resume an in-flight provider call. Persisted pending
 * or streaming rows are therefore terminalized once, when the main-owned store
 * first opens the document, instead of presenting a permanent live status for a
 * request that no longer exists. Partial text is preserved if a future runtime
 * starts checkpointing chunks.
 */
export function recoverInterruptedAgentWorkspace(
  state: AgentWorkspaceState,
): AgentWorkspaceState {
  let changed = false;
  const conversations = state.conversations.map((conversation) => {
    let conversationChanged = false;
    const messages = conversation.messages.map((message) => {
      if (message.status !== 'pending' && message.status !== 'streaming') return message;
      changed = true;
      conversationChanged = true;
      return { ...message, status: 'failed' as const, error: 'provider-failed' };
    });
    return conversationChanged ? { ...conversation, messages } : conversation;
  });
  return changed
    ? { ...state, revision: state.revision + 1, conversations }
    : state;
}

/**
 * The store hands out whole conversations, but only the retained half reaches the
 * file. The session half lives in `agentSessionContext.ts`, in memory, and is
 * re-attached on the way out.
 *
 * Both halves are joined here rather than at each call site because `read` and
 * `write` are the only ways into the workspace: the IPC handlers, the
 * `agentWorkspace:changed` broadcast and the prompt builder in
 * `agentExecutionIpc` all go through them. Merging here is what lets a
 * session-only item reach the shelf *and* the provider request without a second
 * channel and without any consumer opting in.
 *
 * The file invariant stays structural: `atomicWrite` is still only ever handed
 * the output of `prepareAgentWorkspaceForPersistence`, so a non-retained item has
 * no path to disk even if the merge above it is wrong.
 */
export function createAgentWorkspaceStore(
  rootDirectory: string,
  session: AgentSessionContextStore = getAgentSessionContextStore(),
): AgentWorkspaceStore {
  const filePath = path.join(rootDirectory, ...AGENT_WORKSPACE_RELATIVE_PATH);
  let opened = false;
  const persisted = (): AgentWorkspaceState => {
    const state = readFile(filePath);
    if (opened) return state;
    opened = true;
    const recovered = recoverInterruptedAgentWorkspace(state);
    if (recovered !== state) atomicWrite(filePath, recovered);
    return recovered;
  };
  const current = (): AgentWorkspaceState => session.merge(persisted());
  const commit = (
    value: unknown,
    persistedCurrent: AgentWorkspaceState,
  ): AgentWorkspaceState => {
    // Normalize once, then split. `absorb` needs the non-retained items that
    // `prepareAgentWorkspaceForPersistence` is about to discard, so it has to see
    // the document before the filter runs, not after.
    const whole = {
      ...normalizeAgentWorkspaceState(value),
      // Main owns the token. A renderer can return the token it read but cannot
      // choose the next one, skip ahead or roll the document backwards.
      revision: persistedCurrent.revision + 1,
    };
    const persisted = prepareAgentWorkspaceForPersistence(whole);
    atomicWrite(filePath, persisted);
    session.absorb(whole);
    return session.merge(persisted);
  };
  const write = (value: unknown): AgentWorkspaceState => commit(value, persisted());
  return {
    filePath,
    read: current,
    write,
    compareAndWrite: (value: unknown) => {
      const incoming = normalizeAgentWorkspaceState(value);
      const persistedCurrent = persisted();
      if (incoming.revision !== persistedCurrent.revision) {
        return { ok: false, state: session.merge(persistedCurrent) };
      }
      return { ok: true, state: commit(incoming, persistedCurrent) };
    },
    deleteConversation: (conversationId: string) => {
      // The *merged* document, not the file's. `write` re-derives the session half
      // from what it is handed, so passing the file's view would delete one
      // conversation and silently strip every other conversation's session-only
      // context on the way past.
      const latest = current();
      const conversations = latest.conversations.filter((item) => item.id !== conversationId);
      const activeConversationId = latest.activeConversationId === conversationId
        ? conversations[0]?.id ?? null
        : latest.activeConversationId;
      return write({ ...latest, activeConversationId, conversations });
    },
    clear: () => write(emptyAgentWorkspaceState()),
  };
}

let defaultStore: AgentWorkspaceStore | null = null;

export function getAgentWorkspaceStore(): AgentWorkspaceStore {
  if (!defaultStore) defaultStore = createAgentWorkspaceStore(app.getPath('userData'));
  return defaultStore;
}
