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
    cards: message.cards.map((card) => ({
      ...card,
      sourceContextIds: card.sourceContextIds.filter((id) => contextIds.has(id)),
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

export function createAgentWorkspaceStore(rootDirectory: string): AgentWorkspaceStore {
  const filePath = path.join(rootDirectory, 'agent', WORKSPACE_FILE);
  const write = (value: unknown): AgentWorkspaceState => {
    const state = prepareAgentWorkspaceForPersistence(value);
    atomicWrite(filePath, state);
    return state;
  };
  return {
    filePath,
    read: () => readFile(filePath),
    write,
    deleteConversation: (conversationId: string) => {
      const current = readFile(filePath);
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
