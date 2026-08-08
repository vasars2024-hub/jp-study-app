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
 * runs, so these tests prove the shell really consumes the four channels.
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

function state(overrides: Partial<AgentWorkspaceState> = {}): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
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
    // The scope of this slice is stated on the surface, not only in a docblock.
    expect(text()).toContain('agent.notice.scope');
    expect(text()).toContain('agent.notice.retention');
    expect(host.querySelector('textarea, input')).toBeNull();

    const selected = host.querySelector('.agent-rail-entry.is-selected');
    expect(selected?.getAttribute('aria-current')).toBe('true');
    expect(selected?.textContent).toContain('Particle question');
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
});
