import { describe, expect, it } from 'vitest';
import {
  agentExecutionFailure,
  defaultAgentExecutionPolicy,
  normalizeAgentExecutionCancelResult,
  normalizeAgentExecutionEvent,
  normalizeAgentExecutionRequest,
  normalizeAgentExecutionResult,
} from '../agentExecutionBridge';
import { emptyAgentWorkspaceState } from '../agentWorkspace';

describe('Agent execution bridge contract', () => {
  it('builds an explicit local-only default policy', () => {
    expect(defaultAgentExecutionPolicy()).toMatchObject({
      target: { kind: 'local', backend: 'local-qwen' },
      allowCloud: false,
      allowSensitiveContext: false,
      cache: 'off',
      streaming: true,
    });
  });

  it('builds an explicit cloud policy only when the user selects a provider', () => {
    expect(defaultAgentExecutionPolicy('gemini-2.5-flash')).toMatchObject({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      cache: 'off',
    });
  });

  it('rejects empty, foreign-provider and persistent-cache requests', () => {
    const base = {
      requestId: 'run-1',
      conversationId: 'chat-1',
      prompt: 'Explain this',
      policy: defaultAgentExecutionPolicy(),
      allowLocalFallback: false,
    };
    expect(normalizeAgentExecutionRequest(base)).toEqual(base);
    expect(normalizeAgentExecutionRequest({ ...base, prompt: '   ' })).toBeNull();
    expect(normalizeAgentExecutionRequest({
      ...base,
      policy: { ...base.policy, cache: 'persistent' },
    })).toBeNull();
    expect(normalizeAgentExecutionRequest({
      ...base,
      policy: { ...base.policy, target: { kind: 'cloud', providerId: 'future-ai' } },
    })).toBeNull();
  });

  it('refuses a cloud target whose cloud consent bit is false', () => {
    expect(normalizeAgentExecutionRequest({
      requestId: 'run-1',
      conversationId: 'chat-1',
      prompt: 'Explain this',
      policy: {
        ...defaultAgentExecutionPolicy('deepseek-v4-flash'),
        allowCloud: false,
      },
      allowLocalFallback: false,
    })).toBeNull();
  });

  it('bounds streamed events and rejects malformed event shapes', () => {
    expect(normalizeAgentExecutionEvent({
      type: 'chunk',
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      text: 'part',
    })).toEqual({
      type: 'chunk',
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      text: 'part',
    });
    expect(normalizeAgentExecutionEvent({ type: 'chunk', requestId: 'run-1' })).toBeNull();
  });

  it('normalizes success state and closed failure codes', () => {
    const state = emptyAgentWorkspaceState();
    expect(normalizeAgentExecutionResult({
      ok: true,
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      delivery: 'streamed',
      state,
    })).toEqual({
      ok: true,
      requestId: 'run-1',
      assistantMessageId: 'assistant-1',
      delivery: 'streamed',
      state,
    });
    expect(normalizeAgentExecutionResult({
      ok: false,
      requestId: 'run-1',
      code: 'authentication',
      state,
    })).toEqual(agentExecutionFailure('authentication', 'run-1', state));
    expect(normalizeAgentExecutionResult({ ok: false, code: 'future-error' }))
      .toEqual(agentExecutionFailure('provider-failed'));
  });

  it('normalizes cancellation without exposing arbitrary reply data', () => {
    expect(normalizeAgentExecutionCancelResult({ ok: true, cancelled: true }))
      .toEqual({ ok: true, cancelled: true });
    expect(normalizeAgentExecutionCancelResult({ ok: false, cancelled: true, secret: 'x' }))
      .toEqual({ ok: true, cancelled: false });
  });
});
