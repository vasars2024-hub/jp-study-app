// @vitest-environment jsdom
/**
 * The Agent shell, rendered.
 *
 * Client render with `createElement`, as `videoCoreMiningPanelStructure.test.ts`
 * does and for the same reasons: `vitest.config.ts` is root config this track
 * does not own, `.test.tsx` is not in its include globs, and the surface derives
 * its state in an effect, so a static render would assert nothing.
 *
 * `../i18n` is mocked to the key itself. Not for convenience — at this commit
 * `shared/i18n/catalogs/en.ts` imports six split catalog modules that exist only
 * as uncommitted files in the primary tree, so importing the real hook here
 * fails to resolve before a single assertion runs (the same inherited breakage
 * takes `i18n.test.ts` and `tools/i18n-check.cjs` down). Echoing the key also
 * makes each assertion name the string it expects, which a rendered English
 * sentence would not.
 *
 * The bridge is NOT mocked: `window.api` is stubbed and the production client
 * runs, so these tests prove the shell consumes the production workspace and
 * execution clients.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      (vars && 'count' in vars ? `${key}=${vars.count}` : key),
    lang: 'en',
  }),
}));

import { AGENT_WORKSPACE_SCHEMA_VERSION, type AgentWorkspaceState } from '../../shared/agentWorkspace';
import { agentExecutionMessageIds } from '../../shared/agentExecutionBridge';
import AgentWorkspaceShell from '../components/agent/AgentWorkspaceShell';

interface BridgeCall {
  method: string;
  args: unknown[];
}

let host: HTMLDivElement;
let root: Root;
let calls: BridgeCall[];
let stored: AgentWorkspaceState;
let loadResult: unknown = null;
let executionListener: ((event: unknown) => void) | null;
let workspaceListener: ((state: unknown) => void) | null;

function state(overrides: Partial<AgentWorkspaceState> = {}): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    activeConversationId: null,
    conversations: [],
    ...overrides,
  };
}

function populated(): AgentWorkspaceState {
  return state({
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Particle question',
      mode: 'analyze',
      createdAt: 10,
      updatedAt: 20,
      pinned: false,
      archived: false,
      context: [{
        id: 'ctx-1',
        kind: 'reading-passage',
        label: 'Passage',
        preview: '窓辺の猫',
        source: { app: 'reading' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 10,
      }],
      messages: [{
        id: 'msg-1',
        conversationId: 'chat-1',
        role: 'assistant',
        status: 'complete',
        text: 'The particle marks the topic.',
        createdAt: 12,
        updatedAt: 12,
        contextIds: ['ctx-1'],
        attachments: [],
        cards: [],
        provider: {
          target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
          cloud: true,
          contextIds: ['ctx-1'],
          attachmentIds: [],
          inputChars: 20,
          startedAt: 12,
        },
      }],
    }, {
      id: 'chat-2',
      title: 'Second thread',
      mode: 'ask',
      createdAt: 5,
      updatedAt: 6,
      pinned: false,
      archived: false,
      context: [],
      messages: [],
    }],
  });
}

/** A stand-in for main: it answers from `stored` and records what it was asked. */
function installBridge(): void {
  calls = [];
  executionListener = null;
  workspaceListener = null;
  const record = (method: string, handle: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(handle(...args));
    };
  (window as unknown as { api: Record<string, unknown> }).api = {
    agentWorkspaceLoad: record('load', () => loadResult ?? { ok: true, state: stored }),
    agentWorkspaceSave: record('save', (next) => {
      stored = next as AgentWorkspaceState;
      return { ok: true, state: stored };
    }),
    agentWorkspaceDeleteConversation: record('delete', (id) => {
      stored = {
        ...stored,
        activeConversationId: null,
        conversations: stored.conversations.filter((item) => item.id !== id),
      };
      return { ok: true, state: stored };
    }),
    agentWorkspaceClear: record('clear', () => {
      stored = state();
      return { ok: true, state: stored };
    }),
    onAgentWorkspaceChanged: (cb: (state: unknown) => void) => {
      workspaceListener = cb;
      return () => {
        workspaceListener = null;
      };
    },
    onAgentExecutionEvent: (cb: (event: unknown) => void) => {
      executionListener = cb;
      return () => {
        executionListener = null;
      };
    },
    agentExecutionRun: record('execute', (raw) => ({
      ok: false,
      code: 'provider-failed',
      requestId: (raw as { requestId: string }).requestId,
      state: stored,
    })),
    agentExecutionCancel: record('cancelExecution', () => ({ ok: true, cancelled: true })),
  };
}

const text = (): string => host.textContent ?? '';
const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
const buttonWith = (label: string): HTMLButtonElement => {
  const found = buttons().find((button) => button.textContent?.includes(label));
  if (!found) throw new Error(`no button containing "${label}" in: ${text()}`);
  return found;
};

async function mount(): Promise<void> {
  await act(async () => {
    root.render(createElement(AgentWorkspaceShell));
  });
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

async function setTextarea(value: string): Promise<void> {
  const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      ?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function selectFile(name: string, content: string): Promise<void> {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const selected = {
    name,
    type: 'text/plain',
    size: new TextEncoder().encode(content).length,
    text: async () => content,
  } as File;
  Object.defineProperty(input, 'files', { configurable: true, value: [selected] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  stored = state();
  loadResult = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  installBridge();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('Agent workspace shell', () => {
  it('loads once on mount and labels the surface for a screen reader', async () => {
    await mount();
    expect(calls.map((call) => call.method)).toEqual(['load']);
    expect(host.querySelector('.agent-shell')?.getAttribute('aria-label'))
      .toBe('agent.shell.aria');
    expect(host.querySelector('.agent-rail')?.getAttribute('aria-label'))
      .toBe('agent.rail.aria');
  });

  it('offers the empty state, then creates and saves a real conversation', async () => {
    await mount();
    expect(text()).toContain('agent.state.emptyTitle');

    await click(buttonWith('agent.state.emptyAction'));

    const save = calls.find((call) => call.method === 'save');
    expect(save).toBeTruthy();
    const saved = save?.args[0] as AgentWorkspaceState;
    expect(saved.version).toBe(AGENT_WORKSPACE_SCHEMA_VERSION);
    expect(saved.conversations).toHaveLength(1);
    expect(saved.activeConversationId).toBe(saved.conversations[0].id);
    expect(saved.conversations[0].title).toBe('agent.conversation.untitled');
    // The store's answer is what renders, so the surface shows the saved thread.
    expect(text()).toContain('agent.conversation.empty');
  });

  it('renders the selected conversation with its retention and cloud disclosure', async () => {
    stored = populated();
    await mount();

    expect(text()).toContain('Particle question');
    expect(text()).toContain('The particle marks the topic.');
    expect(text()).toContain('agent.mode.analyze');
    expect(text()).toContain('agent.message.role.assistant');
    expect(text()).toContain('agent.message.providerCloud');
    expect(text()).toContain('agent.context.retained');
    // Provider and retention boundaries are stated on the surface.
    expect(text()).toContain('agent.notice.scope');
    expect(text()).toContain('agent.notice.retention');
    expect(host.querySelector('textarea')).not.toBeNull();
    expect(host.querySelector('select')?.getAttribute('value')).toBeNull();
    expect(text()).toContain('agent.execute.localNotice');

    const selected = host.querySelector('.agent-rail-entry.is-selected');
    expect(selected?.getAttribute('aria-current')).toBe('true');
    expect(selected?.textContent).toContain('Particle question');
  });

  it('opens a card source by scrolling to and focusing its exact context shelf item', async () => {
    stored = populated();
    stored.conversations[0].messages[0].cards = [{
      id: 'card-1',
      kind: 'reading',
      title: 'Passage source',
      sourceContextIds: ['ctx-1'],
      actions: [{
        id: 'open-source',
        label: 'Model supplied label',
        effect: { type: 'open-context', contextId: 'ctx-1' },
      }, {
        id: 'navigate',
        label: 'Do not navigate',
        effect: { type: 'navigate', section: 'dictionary' },
      }],
    }];
    await mount();

    const contextItem = host.querySelector<HTMLElement>('[data-agent-context="ctx-1"]');
    const scrollIntoView = vi.fn();
    Object.defineProperty(contextItem, 'scrollIntoView', { value: scrollIntoView });
    const action = buttonWith('agent.context.source');

    expect(text()).not.toContain('Model supplied label');
    expect(text()).not.toContain('Do not navigate');
    expect(text()).toContain('agent.card.actionsPending=1');
    await click(action);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    });
    expect(document.activeElement).toBe(contextItem);
    expect(contextItem?.classList.contains('is-opened')).toBe(true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['load']);
  });

  it('keeps navigation suggestions inert and resolves provenance from live selected context', async () => {
    stored = populated();
    stored.conversations[0].context[0] = {
      ...stored.conversations[0].context[0],
      label: 'Live selected passage',
      source: { app: 'live-reader' },
    };
    stored.conversations[1].context = [{
      id: 'ctx-other',
      kind: 'dictionary-entry',
      label: 'Other conversation source',
      preview: '別',
      source: { app: 'dictionary' },
      sensitivity: 'ordinary',
      retained: true,
      createdAt: 5,
    }];
    stored.conversations[0].messages[0].cards = [{
      id: 'navigation-card',
      kind: 'navigation',
      title: 'Dictionary suggestion',
      sourceContextIds: ['ctx-1', 'ctx-other', 'ctx-stale'],
      actions: [{
        id: 'navigate',
        label: 'Model-authored route label',
        effect: { type: 'navigate', section: 'dictionary', page: 'entry' },
      }],
    }];
    await mount();

    const card = host.querySelector<HTMLElement>('.agent-card');
    const pending = card?.querySelector<HTMLElement>('.agent-card-pending');
    const sources = card?.querySelector<HTMLElement>('.agent-card-sources');
    expect(pending?.textContent).toBe('agent.card.actionsPending=1');
    expect(card?.querySelectorAll('button')).toHaveLength(0);
    expect(card?.textContent).not.toContain('Model-authored route label');
    expect(sources?.getAttribute('aria-label')).toBe('agent.context.title');
    expect(sources?.textContent).toContain('Live selected passage');
    expect(sources?.textContent).toContain('agent.context.source');
    expect(sources?.textContent).not.toContain('Other conversation source');
    expect(host.textContent).not.toContain('ctx-stale');
    expect(calls.map((call) => call.method)).toEqual(['load']);
  });

  it('announces stale or undeclared card context without moving focus or mutating state', async () => {
    stored = populated();
    stored.conversations[0].messages[0].cards = [{
      id: 'stale-card',
      kind: 'reading',
      title: 'Stale source',
      sourceContextIds: ['ctx-gone'],
      actions: [{
        id: 'open-stale',
        label: 'Stale model label',
        effect: { type: 'open-context', contextId: 'ctx-gone' },
      }],
    }, {
      id: 'unproven-card',
      kind: 'reading',
      title: 'Missing provenance',
      sourceContextIds: [],
      actions: [{
        id: 'open-unproven',
        label: 'Unproven model label',
        effect: { type: 'open-context', contextId: 'ctx-1' },
      }],
    }];
    await mount();

    const cardActions = [...host.querySelectorAll<HTMLButtonElement>('.agent-card-action')];
    expect(cardActions).toHaveLength(2);
    await click(cardActions[0]);
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.invalid-request');
    expect(host.querySelector('.agent-context-item.is-opened')).toBeNull();

    await click(cardActions[1]);
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.invalid-request');
    expect(host.querySelector('.agent-context-item.is-opened')).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['load']);
  });

  it('moves rail focus with the arrow keys', async () => {
    stored = populated();
    await mount();
    const entries = [...host.querySelectorAll<HTMLElement>('[data-agent-conversation]')];
    expect(entries).toHaveLength(2);

    entries[0].focus();
    await act(async () => {
      host.querySelector('.agent-rail-list')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(entries[1]);
  });

  it('switches conversations through the store rather than local state', async () => {
    stored = populated();
    await mount();
    const other = [...host.querySelectorAll<HTMLElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-2');
    await click(other as HTMLButtonElement);

    const save = calls.find((call) => call.method === 'save');
    expect((save?.args[0] as AgentWorkspaceState).activeConversationId).toBe('chat-2');
    expect(text()).toContain('Second thread');
  });

  it('pins through the bridge and announces the pressed state', async () => {
    stored = populated();
    await mount();
    const pin = buttons().find((button) => button.getAttribute('aria-label') === 'agent.rail.pin');
    expect(pin?.getAttribute('aria-pressed')).toBe('false');
    await click(pin as HTMLButtonElement);
    expect((calls.at(-1)?.args[0] as AgentWorkspaceState).conversations
      .find((item) => item.id === 'chat-1')?.pinned).toBe(true);
  });

  it('will not delete or clear without a second, explicit confirmation', async () => {
    stored = populated();
    await mount();

    await click(buttonWith('agent.conversation.delete'));
    expect(calls.some((call) => call.method === 'delete')).toBe(false);
    await click(buttonWith('agent.conversation.deleteConfirm'));
    expect(calls.filter((call) => call.method === 'delete')).toEqual([
      { method: 'delete', args: ['chat-1'] },
    ]);

    await click(buttonWith('agent.rail.clear'));
    expect(calls.some((call) => call.method === 'clear')).toBe(false);
    await click(buttonWith('agent.rail.clearConfirm'));
    expect(calls.some((call) => call.method === 'clear')).toBe(true);
    expect(text()).toContain('agent.state.emptyTitle');
  });

  it('shows a recoverable error, and retrying calls the bridge again', async () => {
    loadResult = { ok: false, code: 'read-failed' };
    await mount();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('agent.error.read-failed');
    expect(text()).not.toContain('agent.state.emptyTitle');

    loadResult = null;
    stored = populated();
    await click(buttonWith('agent.state.retry'));
    expect(calls.filter((call) => call.method === 'load')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Particle question');
  });

  it('keeps a loaded conversation on screen when a write fails', async () => {
    stored = populated();
    await mount();
    (window as unknown as { api: Record<string, unknown> }).api.agentWorkspaceSave =
      () => Promise.resolve({ ok: false, code: 'write-failed' });

    const pin = buttons().find((button) => button.getAttribute('aria-label') === 'agent.rail.pin');
    await click(pin as HTMLButtonElement);

    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.write-failed');
    expect(text()).toContain('Particle question');
  });

  it('renders one live exchange when main announces the persisted placeholders', async () => {
    stored = populated();
    await mount();
    let releaseProvider = (): void => undefined;
    let announcePending = (): void => undefined;
    let finishRun = (): void => undefined;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      announcePending = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finishRun = resolve;
    });
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => {
        const request = raw as { requestId: string; conversationId: string; prompt: string };
        const ids = agentExecutionMessageIds(request.requestId);
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => (
            conversation.id === request.conversationId
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      id: ids.user,
                      conversationId: conversation.id,
                      role: 'user' as const,
                      status: 'complete' as const,
                      text: request.prompt,
                      createdAt: 30,
                      updatedAt: 30,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                    {
                      id: ids.assistant,
                      conversationId: conversation.id,
                      role: 'assistant' as const,
                      status: 'streaming' as const,
                      text: '',
                      createdAt: 31,
                      updatedAt: 31,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                  ],
                }
              : conversation
          )),
        };
        workspaceListener?.(stored);
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: ids.assistant,
          text: 'Progressive answer',
        });
        announcePending();
        await providerGate;
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (
              message.id === ids.assistant
                ? { ...message, status: 'complete' as const, text: 'Progressive answer' }
                : message
            )),
          })),
        };
        finishRun();
        return {
          ok: true,
          requestId: request.requestId,
          assistantMessageId: ids.assistant,
          delivery: 'streamed' as const,
          state: stored,
        };
      };

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        ?.call(textarea, 'Explain は');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith('agent.execute.send').click();
      await pending;
    });

    const prompts = [...host.querySelectorAll('.agent-message-text')]
      .filter((node) => node.textContent === 'Explain は');
    expect(prompts).toHaveLength(1);
    expect(host.querySelectorAll('.agent-status-streaming')).toHaveLength(1);
    expect(text()).toContain('Progressive answer');
    expect(host.querySelector('.agent-live-exchange')).toBeNull();

    await act(async () => {
      releaseProvider();
      await finished;
    });
  });

  it('streams a prompt through the execution bridge and renders the committed result', async () => {
    stored = populated();
    await mount();
    let executedPrompt = '';
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => {
        const request = raw as { requestId: string; conversationId: string; prompt: string };
        executedPrompt = request.prompt;
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          text: 'Streamed ',
        });
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          text: 'answer',
        });
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => (
            conversation.id === request.conversationId
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      id: 'user-live',
                      conversationId: conversation.id,
                      role: 'user' as const,
                      status: 'complete' as const,
                      text: request.prompt,
                      createdAt: 30,
                      updatedAt: 30,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                    {
                      id: 'assistant-live',
                      conversationId: conversation.id,
                      role: 'assistant' as const,
                      status: 'complete' as const,
                      text: 'Streamed answer',
                      createdAt: 31,
                      updatedAt: 31,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                      provider: {
                        target: { kind: 'local' as const, backend: 'local-qwen' as const },
                        cloud: false,
                        contextIds: [],
                        attachmentIds: [],
                        inputChars: 12,
                        startedAt: 30,
                        completedAt: 31,
                      },
                    },
                  ],
                }
              : conversation
          )),
        };
        return {
          ok: true,
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          delivery: 'streamed',
          state: stored,
        };
      };

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        ?.call(textarea, 'Explain は');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonWith('agent.execute.send'));

    expect(executedPrompt).toBe('Explain は');
    expect(text()).toContain('Explain は');
    expect(text()).toContain('Streamed answer');
    expect(text()).toContain('agent.message.providerLocal');
  });

  it('sends selected text locally and keeps the file and prompt after a failed request', async () => {
    stored = populated();
    await mount();
    await selectFile('private-notes.txt', '秘密のノート');
    await setTextarea('Use my notes');

    expect(text()).toContain('private-notes.txt');
    expect(text()).toContain('agent.attachment.sessionOnly');
    expect(host.querySelector('.agent-attachment-consent')).toBeNull();
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      attachments: Array<Record<string, unknown>>;
      policy: { allowSensitiveContext: boolean };
    };
    expect(request.policy.allowSensitiveContext).toBe(false);
    expect(request.attachments).toMatchObject([{
      kind: 'text',
      name: 'private-notes.txt',
      sensitivity: 'sensitive',
      retained: false,
      contentText: '秘密のノート',
    }]);
    expect(request.attachments[0]).not.toHaveProperty('localPath');
    expect(text()).toContain('private-notes.txt');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Use my notes');
  });

  it('blocks cloud attachment sending until the visible per-request consent is checked', async () => {
    stored = populated();
    await mount();
    await selectFile('cloud-notes.txt', 'send only with consent');
    await setTextarea('Summarize this');

    const provider = host.querySelector('.agent-composer select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        ?.call(provider, 'gemini-2.5-flash');
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const send = buttonWith('agent.execute.send');
    expect(send.disabled).toBe(true);
    expect(text()).toContain('agent.attachment.cloudConsent');
    expect(calls.some((call) => call.method === 'execute')).toBe(false);

    const consent = host.querySelector('.agent-attachment-consent input') as HTMLInputElement;
    await act(async () => {
      consent.click();
    });
    expect(buttonWith('agent.execute.send').disabled).toBe(false);
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      policy: { target: { kind: string }; allowSensitiveContext: boolean };
      attachments: unknown[];
    };
    expect(request.policy).toMatchObject({
      target: { kind: 'cloud' },
      allowSensitiveContext: true,
    });
    expect(request.attachments).toHaveLength(1);
  });

  it('clears selected files only after a successful request', async () => {
    stored = populated();
    await mount();
    await selectFile('done.txt', 'finished content');
    await setTextarea('Finish this');
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => ({
        ok: true,
        requestId: (raw as { requestId: string }).requestId,
        assistantMessageId: 'assistant-done',
        delivery: 'buffered',
        state: stored,
      });

    await click(buttonWith('agent.execute.send'));
    expect(text()).not.toContain('done.txt');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
});
