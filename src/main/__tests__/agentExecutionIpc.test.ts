// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EXECUTION_CHANNELS,
  defaultAgentExecutionPolicy,
} from '../../shared/agentExecutionBridge';
import { AiProviderRuntimeError } from '../providerRuntime';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
}));

import { registerAgentExecutionIpc } from '../agentExecutionIpc';
import { createAgentWorkspaceStore, type AgentWorkspaceStore } from '../agentWorkspaceStore';

let root = '';
let store: AgentWorkspaceStore;
const sent: Array<{ channel: string; payload: unknown }> = [];

function workspace() {
  return {
    version: 1,
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'First',
      mode: 'ask',
      createdAt: 10,
      updatedAt: 20,
      pinned: false,
      archived: false,
      context: [{
        id: 'ctx-1',
        kind: 'reading-passage',
        label: 'Passage',
        preview: '短い文',
        source: { app: 'reading' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 10,
      }],
      messages: [],
    }],
  };
}

function request(requestId = 'run-1') {
  return {
    requestId,
    conversationId: 'chat-1',
    prompt: 'Explain this.',
    policy: defaultAgentExecutionPolicy(),
    allowLocalFallback: false,
  };
}

const event = {
  sender: {
    id: 1,
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
  },
};

const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const handler = registry.handlers.get(channel);
  if (!handler) throw new Error(`No handler for ${channel}`);
  return await handler(event, ...args);
};

beforeEach(() => {
  registry.handlers.clear();
  sent.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-execution-ipc-'));
  store = createAgentWorkspaceStore(root);
  store.write(workspace());
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Agent execution IPC', () => {
  it('registers only the two invoke channels', () => {
    registerAgentExecutionIpc({
      resolveStore: () => store,
      runProvider: vi.fn(),
    });
    expect([...registry.handlers.keys()].sort()).toEqual([
      AGENT_EXECUTION_CHANNELS.cancel,
      AGENT_EXECUTION_CHANNELS.run,
    ].sort());
  });

  it('streams through the requesting renderer and commits both messages', async () => {
    registerAgentExecutionIpc({
      resolveStore: () => store,
      now: (() => {
        let value = 100;
        return () => value++;
      })(),
      runProvider: async (_policy, prompt, options) => {
        expect(prompt).toBe('Explain this.');
        expect(options.context?.map((item) => item.id)).toEqual(['ctx-1']);
        options.onTextChunk?.('first');
        options.onTextChunk?.(' second');
        return {
          text: 'first second',
          delivery: 'streamed',
          usage: {},
          provider: {
            target: { kind: 'local', backend: 'local-qwen' },
            cloud: false,
            contextIds: ['ctx-1'],
            attachmentIds: [],
            inputChars: 13,
            startedAt: 100,
            completedAt: 101,
          },
        };
      },
    });

    const result = await invoke(AGENT_EXECUTION_CHANNELS.run, request()) as {
      ok: boolean;
      state: ReturnType<AgentWorkspaceStore['read']>;
    };
    expect(result.ok).toBe(true);
    expect(sent).toEqual([
      {
        channel: AGENT_EXECUTION_CHANNELS.event,
        payload: {
          type: 'chunk',
          requestId: 'run-1',
          assistantMessageId: 'request-run-1-assistant',
          text: 'first',
        },
      },
      {
        channel: AGENT_EXECUTION_CHANNELS.event,
        payload: {
          type: 'chunk',
          requestId: 'run-1',
          assistantMessageId: 'request-run-1-assistant',
          text: ' second',
        },
      },
    ]);
    const messages = result.state.conversations[0].messages;
    expect(result.state.conversations[0].title).toBe('Explain this.');
    expect(messages.map((message) => [message.role, message.status, message.text])).toEqual([
      ['user', 'complete', 'Explain this.'],
      ['assistant', 'complete', 'first second'],
    ]);
    expect(store.read()).toEqual(result.state);
  });

  it('persists a closed provider failure code and never its error message', async () => {
    const secretPath = path.join(root, 'keys.txt');
    registerAgentExecutionIpc({
      resolveStore: () => store,
      runProvider: async () => {
        throw new AiProviderRuntimeError(`Bad key in ${secretPath}`, 'authentication');
      },
    });

    const result = await invoke(AGENT_EXECUTION_CHANNELS.run, request()) as {
      ok: boolean;
      code: string;
      state: ReturnType<AgentWorkspaceStore['read']>;
    };
    expect(result).toMatchObject({ ok: false, code: 'authentication' });
    expect(result.state.conversations[0].messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'failed',
      error: 'authentication',
    });
    expect(JSON.stringify(result)).not.toContain(secretPath);
  });

  it('cancels the exact active request and persists cancelled status', async () => {
    registerAgentExecutionIpc({
      resolveStore: () => store,
      runProvider: async (_policy, _prompt, options) => await new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new AiProviderRuntimeError('cancelled', 'cancelled'));
        }, { once: true });
      }),
    });

    const running = invoke(AGENT_EXECUTION_CHANNELS.run, request('run-cancel'));
    await Promise.resolve();
    expect(await invoke(AGENT_EXECUTION_CHANNELS.cancel, 'run-cancel'))
      .toEqual({ ok: true, cancelled: true });
    const result = await running as {
      ok: boolean;
      code: string;
      state: ReturnType<AgentWorkspaceStore['read']>;
    };
    expect(result).toMatchObject({ ok: false, code: 'cancelled' });
    expect(result.state.conversations[0].messages.at(-1)?.status).toBe('cancelled');
    expect(await invoke(AGENT_EXECUTION_CHANNELS.cancel, 'run-cancel'))
      .toEqual({ ok: true, cancelled: false });
  });

  it('scopes cancellation to the renderer that started the request', async () => {
    registerAgentExecutionIpc({
      resolveStore: () => store,
      runProvider: async (_policy, _prompt, options) => await new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    });

    const running = invoke(AGENT_EXECUTION_CHANNELS.run, request('run-owner'));
    await Promise.resolve();
    const cancel = registry.handlers.get(AGENT_EXECUTION_CHANNELS.cancel);
    expect(cancel).toBeDefined();
    expect(cancel?.({ sender: { ...event.sender, id: 2 } }, 'run-owner'))
      .toEqual({ ok: true, cancelled: false });
    expect(cancel?.(event, 'run-owner'))
      .toEqual({ ok: true, cancelled: true });
    await expect(running).resolves.toMatchObject({ ok: false, code: 'cancelled' });
  });

  it('serializes execution for one conversation so store writes cannot race', async () => {
    let release: (() => void) | undefined;
    registerAgentExecutionIpc({
      resolveStore: () => store,
      runProvider: async () => await new Promise((resolve) => {
        release = () => resolve({
          text: 'done',
          delivery: 'buffered',
          usage: {},
          provider: {
            target: { kind: 'local', backend: 'local-qwen' },
            cloud: false,
            contextIds: ['ctx-1'],
            attachmentIds: [],
            inputChars: 13,
            startedAt: 100,
            completedAt: 101,
          },
        });
      }),
    });

    const first = invoke(AGENT_EXECUTION_CHANNELS.run, request('run-first'));
    await vi.waitFor(() => expect(store.read().conversations[0].messages).toHaveLength(2));
    await expect(invoke(AGENT_EXECUTION_CHANNELS.run, request('run-second')))
      .resolves.toMatchObject({ ok: false, code: 'busy' });
    release?.();
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(store.read().conversations[0].messages).toHaveLength(2);
  });

  it('refuses malformed, missing and duplicate requests before a provider runs', async () => {
    const provider = vi.fn();
    registerAgentExecutionIpc({ resolveStore: () => store, runProvider: provider });
    expect(await invoke(AGENT_EXECUTION_CHANNELS.run, { prompt: 'x' }))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(await invoke(AGENT_EXECUTION_CHANNELS.run, {
      ...request(),
      conversationId: 'missing',
    })).toMatchObject({ ok: false, code: 'conversation-not-found' });
    store.write({
      ...workspace(),
      conversations: [{
        ...workspace().conversations[0],
        messages: [{
          id: 'request-run-1-user',
          conversationId: 'chat-1',
          role: 'user',
          status: 'complete',
          text: 'old',
          createdAt: 1,
          updatedAt: 1,
          contextIds: [],
          attachments: [],
          cards: [],
        }],
      }],
    });
    expect(await invoke(AGENT_EXECUTION_CHANNELS.run, request()))
      .toMatchObject({ ok: false, code: 'invalid-request' });
    expect(provider).not.toHaveBeenCalled();
  });
});
