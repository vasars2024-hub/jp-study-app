// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EXECUTION_CHANNELS,
  defaultAgentExecutionPolicy,
  type AgentExecutionRequest,
} from '../../shared/agentExecutionBridge';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import {
  cancelAgentPrompt,
  executeAgentPrompt,
} from '../agentExecutionClient';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), 'utf8');

function request(): AgentExecutionRequest {
  return {
    requestId: 'run-1',
    conversationId: 'chat-1',
    prompt: 'Explain this',
    policy: defaultAgentExecutionPolicy(),
    allowLocalFallback: false,
    attachments: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'api');
});

describe('Agent execution bridge parity', () => {
  it('keeps every declared channel paired across main, preload and the client', () => {
    const main = read('src/main/agentExecutionIpc.ts');
    const preload = read('src/preload.ts');
    const client = read('src/renderer/agentExecutionClient.ts');
    const declaration = read('src/renderer/window.d.ts');
    for (const channel of Object.values(AGENT_EXECUTION_CHANNELS)) {
      expect(main, `main missing ${channel}`).toContain(channel);
      expect(preload, `preload missing ${channel}`).toContain(channel);
    }
    for (const method of [
      'agentExecutionRun',
      'agentExecutionCancel',
      'onAgentExecutionEvent',
    ]) {
      expect(preload, `preload missing ${method}`).toContain(method);
      expect(client, `client missing ${method}`).toContain(method);
      expect(declaration, `window declaration missing ${method}`).toContain(method);
    }
  });
});

describe('Agent execution renderer client', () => {
  it('sends the centralized session-cache policy through the renderer bridge', () => {
    expect(request().policy.cache).toBe('session');
  });

  it('subscribes before invoke, filters foreign chunks and releases afterward', async () => {
    let listener: ((event: unknown) => void) | null = null;
    const release = vi.fn();
    const api = {
      onAgentExecutionEvent: vi.fn((cb: (event: unknown) => void) => {
        listener = cb;
        return release;
      }),
      agentExecutionRun: vi.fn(async () => {
        listener?.({
          type: 'chunk',
          requestId: 'other',
          assistantMessageId: 'a-0',
          text: 'ignore',
        });
        listener?.({
          type: 'chunk',
          requestId: 'run-1',
          assistantMessageId: 'a-1',
          text: 'part',
        });
        return {
          ok: true,
          requestId: 'run-1',
          assistantMessageId: 'a-1',
          delivery: 'streamed',
          state: emptyAgentWorkspaceState(),
        };
      }),
    };
    Object.defineProperty(window, 'api', { configurable: true, value: api });
    const chunks: string[] = [];

    const result = await executeAgentPrompt(request(), (event) => chunks.push(event.text));

    expect(chunks).toEqual(['part']);
    expect(result).toMatchObject({ ok: true, delivery: 'streamed' });
    expect(api.onAgentExecutionEvent).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the bridge is absent or returns malformed data', async () => {
    await expect(executeAgentPrompt(request(), vi.fn()))
      .resolves.toEqual({ ok: false, code: 'bridge-unavailable', requestId: 'run-1' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        onAgentExecutionEvent: () => () => undefined,
        agentExecutionRun: async () => ({ ok: true, secret: 'wrong shape' }),
      },
    });
    await expect(executeAgentPrompt(request(), vi.fn()))
      .resolves.toEqual({ ok: false, code: 'provider-failed' });
  });

  it('normalizes cancellation and treats a missing cancel method as not running', async () => {
    await expect(cancelAgentPrompt('run-1')).resolves.toEqual({ ok: true, cancelled: false });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        agentExecutionCancel: async () => ({ ok: true, cancelled: true, extra: 'dropped' }),
      },
    });
    await expect(cancelAgentPrompt('run-1')).resolves.toEqual({ ok: true, cancelled: true });
  });
});
