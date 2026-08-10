// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentWorkspaceState } from '../../shared/agentWorkspace';

vi.mock('../i18n', () => ({
  useT: () => ({
    lang: 'en',
    t: (key: string, vars?: Record<string, string | number>) => (
      vars?.name ? `${key}:${vars.name}` : key
    ),
  }),
}));

let stored: AgentWorkspaceState;
let listener: ((state: AgentWorkspaceState) => void) | null;
let updateCalls: number;

vi.mock('../agentWorkspaceClient', () => ({
  loadAgentWorkspace: () => Promise.resolve({ ok: true, state: stored }),
  onAgentWorkspaceChanged: (next: (state: AgentWorkspaceState) => void) => {
    listener = next;
    return () => { listener = null; };
  },
  updateAgentWorkspace: async (
    base: AgentWorkspaceState,
    transform: (state: AgentWorkspaceState) => AgentWorkspaceState | null,
  ) => {
    updateCalls += 1;
    stored = transform(base) ?? base;
    listener?.(stored);
    return { ok: true, state: stored };
  },
}));

import { AgentPromptLibrary } from '../components/agent/AgentPromptLibrary';

describe('AgentPromptLibrary', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    stored = {
      version: 1,
      revision: 4,
      activeConversationId: null,
      conversations: [],
      prompts: [{
        id: 'prompt-1',
        title: 'Explain grammar',
        text: 'Explain with two examples',
        createdAt: 10,
        updatedAt: 20,
      }],
    };
    listener = null;
    updateCalls = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('loads saved prompts and sends exact text to the composer callback', async () => {
    const onUse = vi.fn();
    await act(async () => {
      root.render(createElement(AgentPromptLibrary, { onUse }));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Explain grammar');
    expect(host.textContent).toContain('Explain with two examples');
    const use = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'agent.promptLibrary.use');
    await act(async () => use?.click());
    expect(onUse).toHaveBeenCalledWith('Explain with two examples');
  });

  it('requires an inline confirmation before deleting and commits through the workspace updater', async () => {
    await act(async () => {
      root.render(createElement(AgentPromptLibrary, { onUse: () => undefined }));
      await Promise.resolve();
    });
    const button = (key: string) => [...host.querySelectorAll('button')]
      .find((entry) => entry.textContent === key);

    await act(async () => button('agent.promptLibrary.delete')?.click());
    expect(host.textContent).toContain('agent.promptLibrary.deleteQuestion');
    expect(updateCalls).toBe(0);

    await act(async () => {
      button('agent.promptLibrary.confirmDelete')?.click();
      await Promise.resolve();
    });
    expect(updateCalls).toBe(1);
    expect(stored.prompts).toEqual([]);
    expect(host.textContent).toContain('agent.promptLibrary.empty');
  });
});
