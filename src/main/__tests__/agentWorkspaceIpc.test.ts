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

interface FakeWindow {
  destroyed: boolean;
  throwsOnSend: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  duplicates: [] as string[],
  windows: [] as FakeWindow[],
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
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        send: (channel: string, payload: unknown) => {
          if (window.throwsOnSend) throw new Error('window closed during send');
          window.sent.push({ channel, payload });
        },
      },
    })),
  },
}));

import { AGENT_WORKSPACE_CHANNELS } from '../../shared/agentWorkspaceBridge';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import { createAgentSessionContextStore } from '../agentSessionContext';
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
    revision: 0,
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

function makeWindow(): FakeWindow {
  const window: FakeWindow = { destroyed: false, throwsOnSend: false, sent: [] };
  registry.windows.push(window);
  return window;
}

beforeEach(() => {
  registry.handlers.clear();
  registry.duplicates.length = 0;
  registry.windows.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-ipc-'));
  // Its own session half — the default is a process singleton, so sharing it
  // would carry one test's session-only context into the next.
  store = createAgentWorkspaceStore(root, createAgentSessionContextStore());
  registerAgentWorkspaceIpc(() => store);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Agent workspace IPC', () => {
  it('registers each declared request channel exactly once', () => {
    // `changed` is a main → renderer push and deliberately has no handler; every
    // other declared channel must have exactly one.
    const { changed, ...requestChannels } = AGENT_WORKSPACE_CHANNELS;
    expect(changed).toBe('agentWorkspace:changed');
    expect([...registry.handlers.keys()].sort())
      .toEqual([...Object.values(requestChannels)].sort());
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

  it('saves through the one store and answers with session-only context the file never gets', () => {
    const result = invoke(AGENT_WORKSPACE_CHANNELS.save, workspace()) as {
      ok: boolean;
      state: { conversations: { id: string; context: { id: string }[] }[] };
    };
    expect(result.ok).toBe(true);
    // This assertion was inverted when the session transport landed. It used to
    // read `toEqual([])`, because the save filter was the only thing standing
    // between a producer and the shelf and it dropped everything non-retained.
    // The reply now carries the live document; the *file* is what stays
    // retained-only, and that is asserted on the bytes below.
    expect(result.state.conversations[0].context.map((item) => item.id)).toEqual(['ctx-session']);
    // Same store, not a second one: the handler's answer is what the store reads.
    expect(store.read()).toEqual(result.state);

    const raw = fs.readFileSync(store.filePath, 'utf8');
    expect(raw).not.toContain('ctx-session');
    expect(JSON.parse(raw).conversations[0].context).toEqual([]);
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

  it('returns the latest state and stays silent when a stale save loses the race', () => {
    const first = invoke(AGENT_WORKSPACE_CHANNELS.save, workspace()) as {
      ok: true;
      state: ReturnType<typeof workspace>;
    };
    const window = makeWindow();
    const stale = invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());

    expect(stale).toEqual({ ok: false, code: 'conflict', state: first.state });
    expect(store.read()).toEqual(first.state);
    expect(window.sent).toEqual([]);
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
    const cleared = invoke(AGENT_WORKSPACE_CHANNELS.clear) as {
      ok: true;
      state: ReturnType<typeof emptyAgentWorkspaceState>;
    };
    expect(cleared).toMatchObject({
      ok: true,
      state: { revision: 2, activeConversationId: null, conversations: [] },
    });
    expect(store.read()).toEqual(cleared.state);
  });

  it('answers a write failure with a code rather than letting it reach the renderer', () => {
    registry.handlers.clear();
    registerAgentWorkspaceIpc(() => ({
      filePath: `${root}/agent/workspace-v1.json`,
      read: () => emptyAgentWorkspaceState(),
      write: () => { throw new Error('ENOSPC: no space left on device'); },
      compareAndWrite: () => { throw new Error('ENOSPC: no space left on device'); },
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

/**
 * The change push.
 *
 * The shell was the workspace's only writer until a contextual hand-off started
 * writing context straight into the store, which left an already-open Agent
 * reporting "0 conversations" against a file that held one. The push closes
 * that, and it deliberately reaches the writing window too — the hand-off and
 * the shell share the Study OS window, so excluding the sender would fix only
 * the pop-out and leave the original defect standing.
 */
describe('Agent workspace change broadcast', () => {
  it('announces a save to every window, the writer included', () => {
    const a = makeWindow();
    const b = makeWindow();

    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());

    for (const window of [a, b]) {
      expect(window.sent).toHaveLength(1);
      expect(window.sent[0].channel).toBe(AGENT_WORKSPACE_CHANNELS.changed);
    }
    // The payload is the committed document, so a receiver can adopt it without
    // a second round trip.
    expect(a.sent[0].payload).toEqual(store.read());
  });

  it('announces a conversation delete and a clear', () => {
    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());
    const window = makeWindow();

    invoke(AGENT_WORKSPACE_CHANNELS.deleteConversation, 'chat-1');
    expect(window.sent).toHaveLength(1);
    expect((window.sent[0].payload as { conversations: unknown[] }).conversations)
      .toHaveLength(1);

    invoke(AGENT_WORKSPACE_CHANNELS.clear);
    expect(window.sent).toHaveLength(2);
    expect((window.sent[1].payload as { conversations: unknown[] }).conversations)
      .toEqual([]);
  });

  it('stays silent when a write was refused', () => {
    const window = makeWindow();
    invoke(AGENT_WORKSPACE_CHANNELS.save, { version: 99, conversations: [] });
    invoke(AGENT_WORKSPACE_CHANNELS.deleteConversation, '   ');
    // Announcing a change that never happened would make every window re-read
    // for nothing, and would report the refusal as a success.
    expect(window.sent).toEqual([]);
  });

  it('stays silent when the store threw', () => {
    const window = makeWindow();
    registry.handlers.clear();
    registerAgentWorkspaceIpc(() => ({
      ...store,
      compareAndWrite: () => {
        throw new Error('ENOSPC');
      },
    }));
    expect(invoke(AGENT_WORKSPACE_CHANNELS.save, workspace()))
      .toEqual({ ok: false, code: 'write-failed' });
    expect(window.sent).toEqual([]);
  });

  it('does not send to a destroyed window', () => {
    const gone = makeWindow();
    gone.destroyed = true;
    invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());
    expect(gone.sent).toEqual([]);
  });

  it('does not turn one observer failure into a failed committed write', () => {
    const closing = makeWindow();
    closing.throwsOnSend = true;
    const healthy = makeWindow();

    const result = invoke(AGENT_WORKSPACE_CHANNELS.save, workspace());

    expect(result).toMatchObject({ ok: true, state: { revision: 1 } });
    expect(healthy.sent).toHaveLength(1);
    expect(closing.sent).toEqual([]);
    expect(store.read()).toEqual((result as { state: unknown }).state);
  });

  it('does not announce a plain load', () => {
    const window = makeWindow();
    invoke(AGENT_WORKSPACE_CHANNELS.load);
    expect(window.sent).toEqual([]);
  });
});
