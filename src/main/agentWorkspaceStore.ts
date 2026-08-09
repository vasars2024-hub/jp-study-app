import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  emptyAgentWorkspaceState,
  normalizeAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceState,
} from '../shared/agentWorkspace';
import {
  getAgentSessionContextStore,
  type AgentSessionContextStore,
} from './agentSessionContext';

const WORKSPACE_FILE = 'workspace-v1.json';

export interface AgentWorkspaceStore {
  readonly filePath: string;
  read(): AgentWorkspaceState;
  write(value: unknown): AgentWorkspaceState;
  deleteConversation(conversationId: string): AgentWorkspaceState;
  clear(): AgentWorkspaceState;
}

function retainedMessage(message: AgentMessage, contextIds: Set<string>): AgentMessage {
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
      .filter((card) => card.sourceContextIds.every((id) => contextIds.has(id)))
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
      },
    } : {}),
  };
}

function retainedConversation(conversation: AgentConversation): AgentConversation {
  const context = conversation.context.filter((item) => item.retained);
  const contextIds = new Set(context.map((item) => item.id));
  return {
    ...conversation,
    context,
    messages: conversation.messages.map((message) => retainedMessage(message, contextIds)),
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
  const filePath = path.join(rootDirectory, 'agent', WORKSPACE_FILE);
  const write = (value: unknown): AgentWorkspaceState => {
    // Normalize once, then split. `absorb` needs the non-retained items that
    // `prepareAgentWorkspaceForPersistence` is about to discard, so it has to see
    // the document before the filter runs, not after.
    const whole = normalizeAgentWorkspaceState(value);
    const persisted = prepareAgentWorkspaceForPersistence(whole);
    atomicWrite(filePath, persisted);
    session.absorb(whole);
    return session.merge(persisted);
  };
  return {
    filePath,
    read: () => session.merge(readFile(filePath)),
    write,
    deleteConversation: (conversationId: string) => {
      // The *merged* document, not the file's. `write` re-derives the session half
      // from what it is handed, so passing the file's view would delete one
      // conversation and silently strip every other conversation's session-only
      // context on the way past.
      const current = session.merge(readFile(filePath));
      const conversations = current.conversations.filter((item) => item.id !== conversationId);
      const activeConversationId = current.activeConversationId === conversationId
        ? conversations[0]?.id ?? null
        : current.activeConversationId;
      return write({ ...current, activeConversationId, conversations });
    },
    clear: () => write(emptyAgentWorkspaceState()),
  };
}

let defaultStore: AgentWorkspaceStore | null = null;

export function getAgentWorkspaceStore(): AgentWorkspaceStore {
  if (!defaultStore) defaultStore = createAgentWorkspaceStore(app.getPath('userData'));
  return defaultStore;
}
