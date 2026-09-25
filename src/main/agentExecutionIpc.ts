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
import { resolveAgentNavigationQuery } from '../shared/agentNavigationIndex';
import { pendingAgentStepApprovalReference } from '../shared/agentStepApproval';
import {
  EMPTY_AGENT_TASK_QUEUE,
  type AgentTaskQueue,
} from '../shared/localAgentTaskQueue';
import { getAgentOperationalStore } from './agentOperationalStore';
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
  /**
   * The live task queue, read once per completed reply so an approval card can
   * name a step that is actually waiting. Injected rather than imported at the
   * call site because the operational store touches `app.getPath`, which a unit
   * test has no business booting.
   */
  resolveTaskQueue?: () => AgentTaskQueue;
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
  'spend-budget',
  'authentication',
  'rate-limit',
  'upstream',
  'network',
  'vision-unsupported',
  'local-model-missing',
  'ai-off',
  'invalid-response',
  'output-truncated',
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

/**
 * The navigation card for a question that named its own destination.
 *
 * Nothing here is authored from provider text: the effect's coordinates come
 * from the static index, and the card's title is the user's own prompt, already
 * persisted verbatim as the message that produced this reply. That matters twice
 * — it introduces no untranslated UI copy into `workspace-v1.json`, and it makes
 * the card say what was *asked*, leaving the destination itself to be re-derived
 * and shown at review time.
 */
function indexNavigationCards(
  assistantMessageId: string,
  prompt: string,
): AgentResultCard[] {
  // Resolved from the *stored* text, not the raw prompt. The two differ once a
  // long question is truncated, and a card whose effect was derived from more
  // words than it persisted would refuse itself at approval time.
  const title = prompt.trim().slice(0, 120);
  if (!title) return [];
  const answer = resolveAgentNavigationQuery(title);
  // `null` covers "matched nothing" and "matched two places equally well". A
  // suggestion is offered only when the index is certain.
  if (!answer) return [];
  return [{
    id: `${assistantMessageId}-navigation-index-1`,
    kind: 'navigation',
    title,
    // Empty on purpose. The stored question is this card's provenance, and
    // `resolveAgentNavigation` re-runs the lookup on it rather than reading the
    // destination off the effect.
    sourceContextIds: [],
    actions: [{
      id: `${assistantMessageId}-navigate-index-1`,
      label: title,
      effect: {
        type: 'navigate',
        section: answer.section,
        ...(answer.page ? { page: answer.page } : {}),
        ...(answer.controlId ? { controlId: answer.controlId } : {}),
        ...(answer.highlight ? { highlight: true } : {}),
        ...(answer.filesScope ? { filesScope: answer.filesScope } : {}),
        query: title,
      },
    }],
  }];
}

function resultCardsForContext(
  assistantMessageId: string,
  conversationId: string,
  context: readonly AgentContextItem[],
  providerContextIds: readonly string[],
  queue: AgentTaskQueue,
  prompt: string,
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
  // A cold "where do I change X?" has nothing on the shelf at all. That used to
  // end the producer here; it is now exactly the case the index card exists for.
  // The approval card is not lost by returning early — its selector requires at
  // least one live disclosed context id, which is the same thing `source` is.
  if (!source) return indexNavigationCards(assistantMessageId, prompt);
  const cards: AgentResultCard[] = [];
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
    },
    // A save rides on the source card rather than getting a card of its own:
    // it acts on exactly the item that card already shows, and a second card
    // repeating the same title would suggest a second thing to look at.
    //
    // Only a dictionary entry. `agentSave.ts` refuses every other kind because
    // the rest are session-only material, and a producer that offered the button
    // anyway would be offering one that always fails — the dead control the
    // navigation producer refuses to emit for the same reason.
    ...(source.kind === 'dictionary-entry' ? [{
      id: `${assistantMessageId}-save-1`,
      label: source.label,
      effect: {
        type: 'save' as const,
        entityType: 'flashcard',
        // The context id, not the word. The gate reads the term and the gloss
        // out of the live item, so a stored string can never become the row.
        entityId: source.id,
      },
    }] : [])],
  };
  cards.push(sourceCard);

  // One approval card when a queued task is blocked on the user, and none
  // otherwise. Everything the user will read at review time — the objective, the
  // step, the operation — is re-derived from the live queue by
  // `resolveAgentStepApproval`; only the two ids are stored, for the same reason
  // the navigation effect stores a section and not a destination. The card's
  // provenance and title come from the task origin that intersects this reply,
  // never from an unrelated newest context. The title is still an
  // already-persisted context label, so approving a step introduces no new copy
  // of task text into `workspace-v1.json`.
  const pending = pendingAgentStepApprovalReference(queue, {
    conversationId,
    contextIds: context.filter((item) => disclosed.has(item.id)).map((item) => item.id),
  });
  if (pending) {
    // The selector only returns ids from the live context array passed above.
    // Still fail closed if a future refactor violates that contract rather than
    // borrowing the unrelated material/route card title.
    const approvalSource = context.find((item) => item.id === pending.sourceContextIds[0]);
    if (approvalSource) {
      cards.push({
        id: `${assistantMessageId}-approval-1`,
        kind: 'plan',
        title: approvalSource.label,
        sourceContextIds: pending.sourceContextIds,
        actions: [{
          id: `${assistantMessageId}-approve-step-1`,
          label: approvalSource.label,
          // A typed suggestion only. The grant is gated in the renderer behind
          // review and explicit approval, and re-authorized against the live
          // profile by `resolveAgentStepApproval` before anything is offered.
          effect: { type: 'approve-step', taskId: pending.taskId, stepId: pending.stepId },
        }],
      });
    }
  }

  // No suggestion for a place the app cannot open. `source.app` is free-form
  // producer metadata — the media producers emit `media`, which is not a window —
  // and a card that could only ever fail its allowlist check at review time is a
  // dead control, not a suggestion.
  //
  // Falling through to the index rather than returning bare cards is what lets
  // "what does this word mean, and where do I turn on pitch accent?" answer both
  // halves: the shelf names the material, the question names the place.
  if (!route || !isAgentNavigableSection(route.source.app)) {
    return [...cards, ...indexNavigationCards(assistantMessageId, prompt)];
  }
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
        // Exact Settings coordinates are authored from the disclosed route
        // context, never from provider text. The resolver still requires the
        // persisted and live values to agree before main delivers the link.
        ...(route.source.controlId ? { controlId: route.source.controlId } : {}),
        ...(route.source.highlight === true ? { highlight: true } : {}),
      },
    }],
  };
  return [...cards, navigationCard];
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
  const resolveTaskQueueSource = dependencies.resolveTaskQueue
    ?? (() => getAgentOperationalStore().read().queue);
  // A queue that cannot be read is an empty queue, not a failed reply. The
  // approval card is an offer; losing it costs the user one button they can
  // reach from the queue anyway, and failing the whole execution over it would
  // trade a real answer for a missing suggestion. Keep the catch around the
  // injected seam too so tests and alternate stores obey the production rule.
  const resolveTaskQueue = (): AgentTaskQueue => {
    try {
      return resolveTaskQueueSource();
    } catch {
      return EMPTY_AGENT_TASK_QUEUE;
    }
  };
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
          const latestConversation = latest.conversations.find(
            (entry) => entry.id === request.conversationId,
          );
          if (!latestConversation) {
            return agentExecutionFailure('conversation-not-found', request.requestId, latest);
          }
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
                request.conversationId,
                // Context may be removed while the provider is running. Result
                // cards and causal approval selection must use what is live at
                // completion, not the request snapshot used for the provider.
                latestConversation.context,
                result.provider.contextIds,
                resolveTaskQueue(),
                request.prompt,
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
