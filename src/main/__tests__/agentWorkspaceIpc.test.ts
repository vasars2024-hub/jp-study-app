// @vitest-environment node
/**
 * Handler behaviour for the Agent workspace bridge.
 *
 * The assertions that matter are the destructive ones. `store.write` normalizes,
 * and normalization of an unknown schema version is the *empty* workspace — so a
 * handler that forwarded a malformed payload would answer "saved" while erasing
 * every stored conversation. That path is pinned here, against a real store on a
 * real temp directory rather than a double, because the guarantee being checked
 * is what ends up on disk.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  duplicates: [] as string[],
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      // Electron keeps the *first* registration and warns about the second, so a
      // duplicate is recorded rather than silently overwritten.
      if (registry.handlers.has(channel)) registry.duplicates.push(channel);
      else registry.handlers.set(channel, handler);
    },
  },
}));

import { AGENT_WORKSPACE_CHANNELS } from '../../shared/agentWorkspaceBridge';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import { createAgentWorkspaceStore, type AgentWorkspaceStore } from '../agentWorkspaceStore';
import { registerAgentWorkspaceIpc } from '../agentWorkspaceIpc';

let root = '';
let store: AgentWorkspaceStore;

const invoke = (channel: string, ...args: unknown[]): unknown => {
  const handler = registry.handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({}, ...args);
};

function workspace(activeConversationId = 'chat-1') {
  return {
    version: 1,
    activeConversationId,
    conversations: [{
      id: 'chat-1',
      title: 'First',
      mode: 'ask',
      createdAt: 10,
      updatedAt: 20,
      pinned: false,
      archived: false,
      context: [{
        id: 'ctx-session',
        kind: 'selected-text',
        label: 'Session only',
        preview: 'secret',
        source: { app: 'reading' },
        sensitivity: 'sensitive',
        retained: false,
        createdAt: 10,
      }],
      messages: [],
    }, {
      id: 'chat-2',
      title: 'Second',
      mode: 'study',
      createdAt: 30,
      updatedAt: 40,
      pinned: false,
      archived: false,
      context: [],
      messages: [],
    }],
  };
}

beforeEach(() => {
  registry.handlers.clear();
  registry.duplicates.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-ipc-'));
  store = createAgentWorkspaceStore(root);
  registerAgentWorkspaceIpc(() => store);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Agent workspace IPC', () => {
  it('registers each declared channel exactly once', () => {
    expect([...registry.handlers.keys()].sort())
      .toEqual([...Object.values(AGENT_WORKSPACE_CHANNELS)].sort());
    expect(registry.duplicates).toEqual([]);
  });

  it('loads the store and reports a read failure as a code, never a path', () => {
    expect(invoke(AGENT_WORKSPACE_CHANNELS.load))
      .toEqual({ ok: true, state: emptyAgentWorkspaceState() });

    registry.handlers.clear();
    registerAgentWorkspaceIpc(() => {
      throw new Error(`EACCES: permission denied, open '${root}/agent/workspace-v1.json'`);
    });
    const failed = invoke(AGENT_WORKSPACE_CHANNELS.load);
    expect(failed).toEqual({ ok: false, code: 'read-failed' });
    expect(JSON.stringify(failed)).not.toContain(root);
  });

  it('saves through the one store and drops session-only context on the way', () => {
    const result = invoke(AGENT_WORKSPACE_CHANNELS.save, workspace()) as {
      ok: boolean;
      state: { conversations: { id: string; context: unknown[] }[] };
    };
    expect(result.ok).toBe(true);
    expect(result.state.conversations[0].context).toEqual([]);
    // Same store, not a second one: the handler's answer is what the store reads.
    expect(store.read()).toEqual(result.state);
  });

  it('refuses a foreign schema instead of overwriting history with an empty file', () => {
    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());
    const before = store.read();
    expect(before.conversations).toHaveLength(2);

    for (const payload of [
      { version: 99, conversations: [] },
      { conversations: [] },
      'not an object',
      null,
      [],
    ]) {
      expect(invoke(AGENT_WORKSPACE_CHANNELS.save, payload))
        .toEqual({ ok: false, code: 'invalid-request' });
    }
    expect(store.read()).toEqual(before);
  });

  it('deletes only on a usable id and reselects deterministically', () => {
    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());
    for (const bad of [undefined, 42, '', '   ', { id: 'chat-1' }]) {
      expect(invoke(AGENT_WORKSPACE_CHANNELS.deleteConversation, bad))
        .toEqual({ ok: false, code: 'invalid-request' });
    }
    expect(store.read().conversations).toHaveLength(2);

    const deleted = invoke(AGENT_WORKSPACE_CHANNELS.deleteConversation, 'chat-1') as {
      ok: boolean;
      state: { activeConversationId: string | null; conversations: { id: string }[] };
    };
    expect(deleted.state.conversations.map((item) => item.id)).toEqual(['chat-2']);
    expect(deleted.state.activeConversationId).toBe('chat-2');
  });

  it('clears history to the canonical empty state', () => {
    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());
    expect(invoke(AGENT_WORKSPACE_CHANNELS.clear))
      .toEqual({ ok: true, state: emptyAgentWorkspaceState() });
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
  });

  it('answers a write failure with a code rather than letting it reach the renderer', () => {
    registry.handlers.clear();
    registerAgentWorkspaceIpc(() => ({
      filePath: `${root}/agent/workspace-v1.json`,
      read: () => emptyAgentWorkspaceState(),
      write: () => { throw new Error('ENOSPC: no space left on device'); },
      deleteConversation: () => { throw new Error('EBUSY: resource busy'); },
      clear: () => { throw new Error('EPERM: operation not permitted'); },
    }));
    expect(invoke(AGENT_WORKSPACE_CHANNELS.save, workspace()))
      .toEqual({ ok: false, code: 'write-failed' });
    expect(invoke(AGENT_WORKSPACE_CHANNELS.deleteConversation, 'chat-1'))
      .toEqual({ ok: false, code: 'write-failed' });
    expect(invoke(AGENT_WORKSPACE_CHANNELS.clear))
      .toEqual({ ok: false, code: 'write-failed' });
  });
});
