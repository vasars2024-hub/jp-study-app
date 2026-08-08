import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  agentExecutionFailure,
  normalizeAgentExecutionId,
  normalizeAgentExecutionRequest,
  type AgentExecutionFailureCode,
  type AgentExecutionResult,
} from '../shared/agentExecutionBridge';
import type {
  AgentConversation,
  AgentMessage,
  AgentWorkspaceState,
} from '../shared/agentWorkspace';
import {
  AiProviderRuntimeError,
  type AiProviderErrorCode,
} from './providerRuntime';
import {
  runAgentProviderPrompt,
  type AgentProviderExecutionOptions,
  type AgentProviderExecutionResult,
} from './agentProviderRouter';
import {
  getAgentWorkspaceStore,
  type AgentWorkspaceStore,
} from './agentWorkspaceStore';

type ProviderRunner = (
  policy: Parameters<typeof runAgentProviderPrompt>[0],
  prompt: string,
  options: AgentProviderExecutionOptions,
) => Promise<AgentProviderExecutionResult>;

export interface AgentExecutionIpcDependencies {
  resolveStore?: () => AgentWorkspaceStore;
  runProvider?: ProviderRunner;
  now?: () => number;
}

const PROVIDER_CODES = new Set<AiProviderErrorCode>([
  'cancelled',
  'timeout',
  'missing-credential',
  'persistent-cache-unavailable',
  'cloud-disabled',
  'sensitive-context',
  'input-budget',
  'cost-budget',
  'authentication',
  'rate-limit',
  'upstream',
  'network',
  'invalid-response',
]);

function messageIds(requestId: string): { user: string; assistant: string } {
  return {
    user: `request-${requestId}-user`,
    assistant: `request-${requestId}-assistant`,
  };
}

function replaceConversation(
  state: AgentWorkspaceState,
  conversation: AgentConversation,
): AgentWorkspaceState {
  return {
    ...state,
    activeConversationId: conversation.id,
    conversations: state.conversations.map((entry) => (
      entry.id === conversation.id ? conversation : entry
    )),
  };
}

function beginExecution(
  state: AgentWorkspaceState,
  conversationId: string,
  requestId: string,
  prompt: string,
  now: number,
): AgentWorkspaceState | null {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  const ids = messageIds(requestId);
  if (conversation.messages.some((message) => message.id === ids.user || message.id === ids.assistant)) {
    return null;
  }
  const contextIds = conversation.context.map((item) => item.id);
  const user: AgentMessage = {
    id: ids.user,
    conversationId,
    role: 'user',
    status: 'complete',
    text: prompt,
    createdAt: now,
    updatedAt: now,
    contextIds,
    attachments: [],
    cards: [],
  };
  const assistant: AgentMessage = {
    id: ids.assistant,
    conversationId,
    role: 'assistant',
    status: 'streaming',
    text: '',
    createdAt: now,
    updatedAt: now,
    contextIds,
    attachments: [],
    cards: [],
  };
  return replaceConversation(state, {
    ...conversation,
    title: conversation.messages.length === 0 ? prompt.slice(0, 80) : conversation.title,
    updatedAt: now,
    messages: [...conversation.messages, user, assistant],
  });
}

function finishExecution(
  state: AgentWorkspaceState,
  conversationId: string,
  requestId: string,
  now: number,
  update: Pick<AgentMessage, 'status' | 'text'> & Partial<Pick<AgentMessage, 'provider' | 'error'>>,
): AgentWorkspaceState | null {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  const assistantId = messageIds(requestId).assistant;
  if (!conversation.messages.some((message) => message.id === assistantId)) return null;
  return replaceConversation(state, {
    ...conversation,
    updatedAt: now,
    messages: conversation.messages.map((message) => (
      message.id === assistantId
        ? {
            ...message,
            ...update,
            updatedAt: now,
            ...(update.error ? { error: update.error } : {}),
          }
        : message
    )),
  });
}

function providerFailureCode(error: unknown, signal: AbortSignal): AgentExecutionFailureCode {
  if (signal.aborted) return 'cancelled';
  if (error instanceof AiProviderRuntimeError && PROVIDER_CODES.has(error.code)) {
    return error.code;
  }
  return 'provider-failed';
}

export function registerAgentExecutionIpc(
  dependencies: AgentExecutionIpcDependencies = {},
): void {
  const resolveStore = dependencies.resolveStore ?? getAgentWorkspaceStore;
  const runProvider = dependencies.runProvider ?? runAgentProviderPrompt;
  const now = dependencies.now ?? Date.now;
  const active = new Map<string, {
    controller: AbortController;
    conversationId: string;
    senderId: number;
  }>();
  const activeConversations = new Set<string>();

  ipcMain.handle(
    'agentExecution:run',
    async (event: IpcMainInvokeEvent, raw: unknown): Promise<AgentExecutionResult> => {
      const request = normalizeAgentExecutionRequest(raw);
      if (!request) return agentExecutionFailure('invalid-request');
      if (active.has(request.requestId) || activeConversations.has(request.conversationId)) {
        return agentExecutionFailure('busy', request.requestId);
      }

      let store: AgentWorkspaceStore;
      let started: AgentWorkspaceState;
      let context: AgentConversation['context'];
      try {
        store = resolveStore();
        const current = store.read();
        const conversation = current.conversations.find(
          (entry) => entry.id === request.conversationId,
        );
        if (!conversation) {
          return agentExecutionFailure('conversation-not-found', request.requestId, current);
        }
        context = conversation.context;
        const pending = beginExecution(
          current,
          request.conversationId,
          request.requestId,
          request.prompt,
          now(),
        );
        if (!pending) return agentExecutionFailure('invalid-request', request.requestId, current);
        started = store.write(pending);
      } catch {
        return agentExecutionFailure('store-failed', request.requestId);
      }

      const controller = new AbortController();
      active.set(request.requestId, {
        controller,
        conversationId: request.conversationId,
        senderId: event.sender.id,
      });
      activeConversations.add(request.conversationId);
      const ids = messageIds(request.requestId);

      try {
        const result = await runProvider(request.policy, request.prompt, {
          context,
          signal: controller.signal,
          allowLocalFallback: request.allowLocalFallback,
          onTextChunk: (text) => {
            if (!active.has(request.requestId) || !text) return;
            try {
              if (!event.sender.isDestroyed()) {
                event.sender.send('agentExecution:event', {
                  type: 'chunk',
                  requestId: request.requestId,
                  assistantMessageId: ids.assistant,
                  text,
                });
              }
            } catch {
              // A closed renderer must not cancel or fail the provider request.
            }
          },
        });
        try {
          const latest = store.read();
          const completed = finishExecution(
            latest,
            request.conversationId,
            request.requestId,
            now(),
            {
              status: 'complete',
              text: result.text,
              provider: result.provider,
            },
          );
          if (!completed) {
            return agentExecutionFailure('conversation-not-found', request.requestId, latest);
          }
          const state = store.write(completed);
          return {
            ok: true,
            requestId: request.requestId,
            assistantMessageId: ids.assistant,
            delivery: result.delivery,
            state,
          };
        } catch {
          return agentExecutionFailure('store-failed', request.requestId, started);
        }
      } catch (error) {
        const code = providerFailureCode(error, controller.signal);
        try {
          const latest = store.read();
          const failed = finishExecution(
            latest,
            request.conversationId,
            request.requestId,
            now(),
            {
              status: code === 'cancelled' ? 'cancelled' : 'failed',
              text: '',
              error: code,
            },
          );
          const state = failed ? store.write(failed) : latest;
          return agentExecutionFailure(code, request.requestId, state);
        } catch {
          return agentExecutionFailure('store-failed', request.requestId, started);
        }
      } finally {
        active.delete(request.requestId);
        activeConversations.delete(request.conversationId);
      }
    },
  );

  ipcMain.handle(
    'agentExecution:cancel',
    (event: IpcMainInvokeEvent, raw: unknown): { ok: true; cancelled: boolean } => {
      const requestId = normalizeAgentExecutionId(raw);
      if (!requestId) return { ok: true, cancelled: false };
      const running = active.get(requestId);
      if (!running || running.senderId !== event.sender.id) {
        return { ok: true, cancelled: false };
      }
      running.controller.abort();
      return { ok: true, cancelled: true };
    },
  );
}
