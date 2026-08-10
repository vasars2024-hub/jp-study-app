// @vitest-environment node
/**
 * The handler that is allowed to open a window.
 *
 * Everything here is asserted against `opened` — the sections the injected
 * opener was actually called with — rather than against the returned code alone.
 * A refusal that still opened something would pass a code-only assertion, and
 * that is the exact failure this gate exists to prevent.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentNavigationDestination } from '../../shared/agentNavigation';
import { AGENT_NAVIGATION_CHANNELS } from '../../shared/agentNavigationBridge';
import type { AgentWorkspaceState } from '../../shared/agentWorkspace';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const registry = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

import {
  registerAgentNavigationIpc,
  setAgentNavigationOpener,
} from '../agentNavigationIpc';
import { createAgentSessionContextStore } from '../agentSessionContext';
import { createAgentWorkspaceStore, type AgentWorkspaceStore } from '../agentWorkspaceStore';

let root = '';
let store: AgentWorkspaceStore;
let opened: AgentNavigationDestination[];

function workspace(): AgentWorkspaceState {
  return {
    version: 1,
    revision: 0,
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Thread',
      mode: 'navigate',
      createdAt: 10,
      updatedAt: 20,
      pinned: false,
      archived: false,
      context: [{
        id: 'ctx-route',
        kind: 'route',
        label: 'Dictionary',
        preview: 'Where you were',
        source: { app: 'dictionary', route: 'entry/猫' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 10,
      }],
      messages: [{
        id: 'msg-1',
        conversationId: 'chat-1',
        role: 'assistant',
        status: 'complete',
        text: 'Reply',
        createdAt: 12,
        updatedAt: 12,
        contextIds: ['ctx-route'],
        attachments: [],
        cards: [{
          id: 'card-1',
          kind: 'navigation',
          title: 'Suggestion',
          sourceContextIds: ['ctx-route'],
          actions: [{
            id: 'act-1',
            label: 'Model-authored label',
            effect: { type: 'navigate', section: 'dictionary', page: 'entry/猫' },
          }],
        }],
      }],
    }],
  };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'chat-1',
  messageId: 'msg-1',
  cardId: 'card-1',
  actionId: 'act-1',
  approved: true,
  ...overrides,
});

const invoke = async (payload: unknown): Promise<unknown> => {
  const handler = registry.handlers.get(AGENT_NAVIGATION_CHANNELS.run);
  if (!handler) throw new Error('navigation handler is not registered');
  return await handler({}, payload);
};

function register(
  open?: (destination: AgentNavigationDestination) => boolean | Promise<boolean>,
): void {
  registerAgentNavigationIpc({
    resolveStore: () => store,
    openSection: (destination) => {
      opened.push(destination);
      return open ? open(destination) : true;
    },
  });
}

function useExactSettingsDestination(): AgentNavigationDestination {
  const destination: AgentNavigationDestination = {
    section: 'settings',
    page: 'appearance',
    controlId: 'theme',
    highlight: true,
  };
  const state = store.read();
  state.conversations[0].context[0].label = 'Theme setting';
  state.conversations[0].context[0].source = {
    app: destination.section,
    route: destination.page,
    controlId: destination.controlId,
    highlight: true,
  };
  state.conversations[0].messages[0].cards[0].actions[0].effect = {
    type: 'navigate',
    ...destination,
  };
  store.write(state);
  return destination;
}

beforeEach(() => {
  registry.handlers.clear();
  opened = [];
  setAgentNavigationOpener(null);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-navigation-ipc-'));
  store = createAgentWorkspaceStore(root, createAgentSessionContextStore());
  store.write(workspace());
});

afterEach(() => {
  setAgentNavigationOpener(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Agent navigation IPC', () => {
  it('registers exactly one invoke channel', () => {
    register();
    expect([...registry.handlers.keys()]).toEqual([AGENT_NAVIGATION_CHANNELS.run]);
  });

  it('resolves the destination for review without opening anything', async () => {
    register();
    expect(await invoke(request({ approved: false }))).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: false,
    });
    expect(opened).toEqual([]);
  });

  it('opens exactly the resolved section once approved', async () => {
    register();
    expect(await invoke(request())).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    });
    expect(opened).toEqual([{ section: 'dictionary', page: 'entry/猫' }]);
  });

  it('delivers one exact registered Settings page/control/highlight destination', async () => {
    const destination = useExactSettingsDestination();
    register();

    expect(await invoke(request({ approved: false }))).toEqual({
      ok: true,
      destination,
      opened: false,
    });
    expect(opened).toEqual([]);

    expect(await invoke(request())).toEqual({
      ok: true,
      destination,
      opened: true,
    });
    expect(opened).toEqual([destination]);
  });

  it('refuses a request that tries to name its own destination', async () => {
    register();
    expect(await invoke(request({ section: 'settings' })))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(await invoke(request({ page: 'anything' })))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(opened).toEqual([]);
  });

  it('refuses once the live provenance context is gone', async () => {
    const state = store.read();
    state.conversations[0].context = [];
    store.write(state);
    register();
    // Not `stale-provenance`: removing the source context makes the store drop
    // the derived card with it, so the refusal lands one step earlier than the
    // resolver. Both fail closed; asserting the code the store actually produces
    // is what keeps this test honest about which guard fired.
    expect(await invoke(request())).toEqual({ ok: false, code: 'action-not-found' });
    expect(opened).toEqual([]);
  });

  it('refuses when the context survives but no longer points where the card said', async () => {
    const state = store.read();
    state.conversations[0].context[0].source = { app: 'dictionary', route: 'entry/犬' };
    store.write(state);
    register();
    expect(await invoke(request())).toEqual({ ok: false, code: 'stale-provenance' });
    expect(opened).toEqual([]);
  });

  it('refuses when the live context stops describing a place at all', async () => {
    const state = store.read();
    state.conversations[0].context[0].kind = 'dictionary-entry';
    store.write(state);
    register();
    expect(await invoke(request())).toEqual({ ok: false, code: 'stale-provenance' });
    expect(opened).toEqual([]);
  });

  it('refuses a stored destination the allowlist does not have', async () => {
    const state = store.read();
    state.conversations[0].context[0].source = { app: 'admin', route: 'delete-everything' };
    state.conversations[0].messages[0].cards[0].actions[0].effect = {
      type: 'navigate',
      section: 'admin',
      page: 'delete-everything',
    };
    store.write(state);
    register();
    expect(await invoke(request())).toEqual({ ok: false, code: 'unknown-section' });
    expect(opened).toEqual([]);
  });

  it('refuses an unknown conversation, message, card or action', async () => {
    register();
    expect(await invoke(request({ conversationId: 'chat-9' })))
      .toEqual({ ok: false, code: 'conversation-not-found' });
    expect(await invoke(request({ messageId: 'msg-9' })))
      .toEqual({ ok: false, code: 'action-not-found' });
    expect(await invoke(request({ cardId: 'card-9' })))
      .toEqual({ ok: false, code: 'action-not-found' });
    expect(await invoke(request({ actionId: 'act-9' })))
      .toEqual({ ok: false, code: 'action-not-found' });
    expect(opened).toEqual([]);
  });

  it('reports an opener that refuses, rather than claiming a window exists', async () => {
    register(() => false);
    expect(await invoke(request())).toEqual({ ok: false, code: 'open-failed' });
    expect(opened).toEqual([{ section: 'dictionary', page: 'entry/猫' }]);
  });

  it('reports an opener that throws as a failure, not as a crash', async () => {
    register(() => {
      throw new Error('no display');
    });
    expect(await invoke(request())).toEqual({ ok: false, code: 'open-failed' });
  });

  it('refuses a second approval of the same action while the first is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    register(async () => {
      await gate;
      return true;
    });
    const first = invoke(request());
    const second = await invoke(request());
    expect(second).toEqual({ ok: false, code: 'busy' });
    release?.();
    expect(await first).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    });
    expect(opened).toEqual([{ section: 'dictionary', page: 'entry/猫' }]);
  });

  it('allows a retry after the first attempt failed', async () => {
    let attempt = 0;
    register(() => {
      attempt += 1;
      return attempt > 1;
    });
    expect(await invoke(request())).toEqual({ ok: false, code: 'open-failed' });
    expect(await invoke(request())).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    });
    expect(opened).toEqual([
      { section: 'dictionary', page: 'entry/猫' },
      { section: 'dictionary', page: 'entry/猫' },
    ]);
  });

  it('reports a missing opener rather than silently succeeding', async () => {
    registerAgentNavigationIpc({ resolveStore: () => store });
    expect(await invoke(request())).toEqual({ ok: false, code: 'bridge-unavailable' });
  });

  it('uses the opener handed over by the main entry point', async () => {
    setAgentNavigationOpener((destination) => {
      opened.push(destination);
      return true;
    });
    registerAgentNavigationIpc({ resolveStore: () => store });
    expect(await invoke(request())).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    });
    expect(opened).toEqual([{ section: 'dictionary', page: 'entry/猫' }]);
  });

  it('reports a store that cannot be read', async () => {
    registerAgentNavigationIpc({
      resolveStore: () => {
        throw new Error('unreadable');
      },
      openSection: (destination) => {
        opened.push(destination);
        return true;
      },
    });
    expect(await invoke(request())).toEqual({ ok: false, code: 'store-failed' });
    expect(opened).toEqual([]);
  });
});
