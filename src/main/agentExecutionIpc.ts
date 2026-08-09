import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  agentExecutionMessageIds,
  agentExecutionFailure,
  normalizeAgentExecutionId,
  normalizeAgentExecutionRequest,
  type AgentExecutionAttachment,
  type AgentExecutionFailureCode,
  type AgentExecutionResult,
} from '../shared/agentExecutionBridge';
import type {
  AgentAttachment,
  AgentConversation,
  AgentContextItem,
  AgentMessage,
  AgentResultCard,
  AgentWorkspaceState,
} from '../shared/agentWorkspace';
import { isAgentNavigableSection } from '../shared/agentNavigation';
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
import { broadcastAgentWorkspace } from './agentWorkspaceIpc';

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

/**
 * Result cards are compact views of the exact context used by a successful
 * request, not another model output. A reply gets the newest actually-disclosed
 * context card and, for a route with a concrete destination, one typed but
 * non-executing navigation suggestion.
 */
const RESULT_CARD_KIND: Record<AgentContextItem['kind'], AgentResultCard['kind']> = {
  route: 'navigation',
  'selected-text': 'generic',
  'dictionary-entry': 'dictionary',
  'reading-passage': 'reading',
  'media-cue': 'media',
  'study-session': 'generic',
  'saved-words': 'flashcards',
  file: 'generic',
};

/**
 * The newest disclosed item matching a predicate.
 *
 * On equal timestamps the later shelf item wins, which keeps the selection
 * deterministic even for contexts captured in the same millisecond.
 */
function newestDisclosed(
  context: readonly AgentContextItem[],
  disclosed: ReadonlySet<string>,
  accept: (item: AgentContextItem) => boolean,
): AgentContextItem | undefined {
  let newest: AgentContextItem | undefined;
  for (const item of context) {
    if (!disclosed.has(item.id) || !accept(item)) continue;
    if (!newest || item.createdAt >= newest.createdAt) newest = item;
  }
  return newest;
}

function resultCardsForContext(
  assistantMessageId: string,
  context: readonly AgentContextItem[],
  providerContextIds: readonly string[],
): AgentResultCard[] {
  const disclosed = new Set(providerContextIds);
  // The two cards answer different questions and are chosen independently.
  //
  // They used to share one "newest disclosed" item, which meant a route context
  // could only ever produce a navigation suggestion by *displacing* the source
  // card for the material. Now that hand-offs attach the place beside the
  // material — a word and the Dictionary it was looked up in, in the same
  // gesture and the same millisecond — that tie decided which of the two the
  // user got to see, which is not a decision a timestamp should be making.
  const material = newestDisclosed(context, disclosed, (item) => item.kind !== 'route');
  const route = newestDisclosed(context, disclosed, (item) => item.kind === 'route');
  const source = material ?? route;
  if (!source) return [];
  const sourceCard: AgentResultCard = {
    id: `${assistantMessageId}-context-1`,
    kind: RESULT_CARD_KIND[source.kind],
    title: source.label,
    ...(source.preview ? { summary: source.preview } : {}),
    // Exact singleton provenance lets persistence drop this whole derived card
    // whenever its retained or session-only source is absent from the latest
    // conversation written after the provider finishes.
    sourceContextIds: [source.id],
    actions: [{
      id: `${assistantMessageId}-open-context-1`,
      // Renderer-side resolution supplies localized action chrome; keeping the
      // persisted label source-derived avoids introducing untranslated UI text.
      label: source.label,
      effect: { type: 'open-context', contextId: source.id },
    }],
  };
  // No suggestion for a place the app cannot open. `source.app` is free-form
  // producer metadata — the media producers emit `media`, which is not a window —
  // and a card that could only ever fail its allowlist check at review time is a
  // dead control, not a suggestion.
  if (!route || !isAgentNavigableSection(route.source.app)) return [sourceCard];
  const navigationCard: AgentResultCard = {
    id: `${assistantMessageId}-navigation-1`,
    kind: 'navigation',
    title: route.label,
    ...(route.preview ? { summary: route.preview } : {}),
    sourceContextIds: [route.id],
    actions: [{
      id: `${assistantMessageId}-navigate-1`,
      label: route.label,
      // This is a typed suggestion only. Execution is gated in
      // `main/agentNavigationIpc.ts` behind review and explicit approval, and it
      // re-derives the destination from live context rather than trusting this.
      // Provider output never reaches the effect.
      effect: {
        type: 'navigate',
        section: route.source.app,
        // A whole section is a destination on its own — main opens sections, not
        // pages — so a route context without a sub-page still names somewhere
        // real. The page rides along only when the producer knew one.
        ...(route.source.route ? { page: route.source.route } : {}),
      },
    }],
  };
  return [sourceCard, navigationCard];
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
  attachments: readonly AgentExecutionAttachment[],
  now: number,
): AgentWorkspaceState | null {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  const ids = agentExecutionMessageIds(requestId);
  if (conversation.messages.some((message) => message.id === ids.user || message.id === ids.assistant)) {
    return null;
  }
  const contextIds = conversation.context.map((item) => item.id);
  const messageAttachments: AgentAttachment[] = attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(attachment.sizeBytes !== undefined ? { sizeBytes: attachment.sizeBytes } : {}),
    // Content is request-only. Message metadata remains sensitive and session
    // only even if a renderer submits a broader shape.
    sensitivity: 'sensitive',
    retained: false,
  }));
  const user: AgentMessage = {
    id: ids.user,
    conversationId,
    role: 'user',
    status: 'complete',
    text: prompt,
    createdAt: now,
    updatedAt: now,
    contextIds,
    attachments: messageAttachments,
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
  update: Pick<AgentMessage, 'status' | 'text'>
    & Partial<Pick<AgentMessage, 'provider' | 'error' | 'cards'>>,
): AgentWorkspaceState | null {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  const assistantId = agentExecutionMessageIds(requestId).assistant;
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
      let history: AgentConversation['messages'];
      // Read beside `context`, from the same conversation snapshot, so the preset
      // that shapes the request is the one the conversation carried when it was
      // sent — not whatever it may be changed to while the provider runs.
      let mode: AgentConversation['mode'];
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
        history = conversation.messages;
        mode = conversation.mode;
        const pending = beginExecution(
          current,
          request.conversationId,
          request.requestId,
          request.prompt,
          request.attachments,
          now(),
        );
        if (!pending) return agentExecutionFailure('invalid-request', request.requestId, current);
        started = store.write(pending);
        // Running a prompt is a workspace mutation like any other, so it has to
        // announce itself or a second window keeps showing the conversation as it
        // was before the message was sent.
        broadcastAgentWorkspace(started);
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
      const ids = agentExecutionMessageIds(request.requestId);

      try {
        const result = await runProvider(request.policy, request.prompt, {
          context,
          attachments: request.attachments,
          history,
          mode,
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
              cards: resultCardsForContext(
                ids.assistant,
                context,
                result.provider.contextIds,
              ),
            },
          );
          if (!completed) {
            return agentExecutionFailure('conversation-not-found', request.requestId, latest);
          }
          const state = store.write(completed);
          broadcastAgentWorkspace(state);
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
          // Only when a write actually happened: `latest` is an unchanged read, and
          // announcing it would report a change that never occurred.
          if (failed) broadcastAgentWorkspace(state);
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
