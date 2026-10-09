// @vitest-environment jsdom
/**
 * a11y axe — axe-core (plus the house ARIA audit) over the Agent workspace: the
 * empty workspace, a populated conversation (context shelf, an answered
 * message with source and navigation cards), and the full view with its
 * optional panels expanded.
 */
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_WORKSPACE_SCHEMA_VERSION, type AgentWorkspaceState } from '../../shared/agentWorkspace';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

const EMPTY: AgentWorkspaceState = {
  version: AGENT_WORKSPACE_SCHEMA_VERSION,
  revision: 0,
  activeConversationId: null,
  conversations: [],
};

function populated(): AgentWorkspaceState {
  return {
    ...EMPTY,
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Particle question',
      mode: 'analyze',
      createdAt: 10,
      updatedAt: 20,
      pinned: true,
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
      }, {
        id: 'ctx-route',
        kind: 'route',
        label: 'Dictionary',
        preview: 'Where you were',
        source: { app: 'dictionary', route: 'entry/猫' },
        sensitivity: 'ordinary',
        retained: false,
        createdAt: 11,
      }],
      messages: [{
        id: 'msg-0',
        conversationId: 'chat-1',
        role: 'user',
        status: 'complete',
        text: 'What does は mark here?',
        createdAt: 11,
        updatedAt: 11,
        contextIds: ['ctx-1'],
        attachments: [],
        cards: [],
      }, {
        id: 'msg-1',
        conversationId: 'chat-1',
        role: 'assistant',
        status: 'complete',
        text: 'The particle **は** marks the topic.',
        createdAt: 12,
        updatedAt: 12,
        contextIds: ['ctx-1'],
        attachments: [],
        cards: [{
          id: 'navigation-card',
          kind: 'navigation',
          title: 'Dictionary suggestion',
          sourceContextIds: ['ctx-route'],
          actions: [{
            id: 'navigate',
            label: 'Open',
            effect: { type: 'navigate', section: 'dictionary', page: 'entry/猫' },
          }, {
            id: 'open',
            label: 'Open context',
            effect: { type: 'open-context', contextId: 'ctx-1' },
          }],
        }],
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
  } as AgentWorkspaceState;
}

function bridge(state: AgentWorkspaceState): void {
  stubBridge({
    agentWorkspaceLoad: { ok: true, state },
    agentWorkspaceSave: (next: AgentWorkspaceState) => Promise.resolve({ ok: true, state: next }),
    agentImageTake: { ok: true, images: [] },
    agentCardBatchTake: { ok: true, batch: null },
    agentNavigationRun: { ok: true, destination: { section: 'dictionary', page: 'entry/猫' }, opened: false },
    aiProviderHealth: [
      { providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash', credentialBucket: 'gemini', configured: true },
    ],
    listLibrary: [],
  });
}

beforeAll(() => {
  installJsdomShims();
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jp-study-local-agent-settings-v1', JSON.stringify({ version: 1 }));
});

afterEach(async () => {
  await cleanup();
});

async function mountShell(state: AgentWorkspaceState): Promise<HTMLDivElement> {
  bridge(state);
  const { default: AgentWorkspaceShell } = await import('../components/agent/AgentWorkspaceShell');
  const { host } = await mount(createElement(AgentWorkspaceShell), 80);
  return host;
}

describe('Agent workspace — axe-core', () => {
  it('an empty workspace', async () => {
    const host = await mountShell(EMPTY);
    expect(host.querySelector('nav.agent-rail'), 'conversation rail painted').not.toBeNull();
    expect(host.querySelector('.agent-empty-title')?.textContent?.length, 'empty state painted').toBeGreaterThan(3);
    expect(host.querySelectorAll('button').length, 'controls painted').toBeGreaterThan(2);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('a conversation with context, an answer and its cards', async () => {
    const host = await mountShell(populated());
    expect(host.textContent).toContain('Particle question');
    expect(host.textContent).toContain('窓辺の猫');
    expect(host.textContent).toContain('marks the topic');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the full view with its optional panels expanded', async () => {
    const host = await mountShell(populated());
    const toggles = host.querySelectorAll<HTMLButtonElement>('.agent-view-toggle-button');
    expect(toggles.length, 'simple/full toggle').toBe(2);
    await click(toggles[1]);
    expect(toggles[1].getAttribute('aria-pressed')).toBe('true');
    for (const cls of ['.agent-prompt-library-open', '.agent-capability-open', '.agent-governance-open']) {
      const opener = host.querySelector<HTMLButtonElement>(cls);
      expect(opener, cls).not.toBeNull();
      await click(opener);
      expect(opener?.getAttribute('aria-expanded'), cls).toBe('true');
    }
    host.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => { d.open = true; });
    await settle(30);
    expect(host.textContent).toContain('Particle question');
    expect(await a11yViolations(host)).toEqual([]);

    // The navigation card's review step, resolved by main.
    const review = host.querySelector<HTMLButtonElement>('.agent-card-navigate button');
    expect(review, 'navigation review button').not.toBeNull();
    await click(review);
    expect(host.querySelector('.agent-card-navigate-approve'), 'review step painted').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });
});
