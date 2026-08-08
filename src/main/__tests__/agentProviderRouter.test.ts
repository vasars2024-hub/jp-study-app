// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextItem, AgentProviderPolicy } from '../../shared/agentWorkspace';
import * as providerRuntime from '../providerRuntime';
import * as translate from '../translate';
import { runAgentProviderPrompt } from '../agentProviderRouter';

function policy(overrides: Partial<AgentProviderPolicy> = {}): AgentProviderPolicy {
  return {
    target: { kind: 'local', backend: 'local-qwen' },
    allowCloud: false,
    allowSensitiveContext: false,
    maxInputChars: 10_000,
    maxOutputTokens: 800,
    cache: 'session',
    retryAttempts: 1,
    timeoutMs: 20_000,
    streaming: true,
    ...overrides,
  };
}

function context(sensitivity: AgentContextItem['sensitivity'] = 'ordinary'): AgentContextItem {
  return {
    id: 'ctx-1',
    kind: 'reading-passage',
    label: 'Passage',
    preview: '短い文',
    source: { app: 'reading' },
    sensitivity,
    retained: false,
    createdAt: 100,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Agent provider router', () => {
  it('streams an explicitly local request through Qwen and discloses the real target', async () => {
    const chunks: string[] = [];
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (_prompt, options) => {
      options?.onTextChunk?.('first');
      options?.onTextChunk?.(' second');
      return 'first second';
    });

    const result = await runAgentProviderPrompt(policy(), 'Explain this.', {
      context: [context('sensitive')],
      onTextChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['first', ' second']);
    expect(result).toMatchObject({
      text: 'first second',
      delivery: 'streamed',
      provider: {
        target: { kind: 'local', backend: 'local-qwen' },
        cloud: false,
        contextIds: ['ctx-1'],
      },
    });
  });

  it('runs an allowed cloud request without claiming token streaming', async () => {
    vi.spyOn(providerRuntime, 'runCloudAiRequest').mockResolvedValue({
      text: 'cloud answer',
      providerId: 'gemini-2.5-flash',
      model: 'gemini-2.5-flash',
      credentialBucket: 'gemini',
      inputChars: 12,
      startedAt: 100,
      completedAt: 150,
      attempts: 1,
      cached: false,
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 },
    });

    const result = await runAgentProviderPrompt(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
    }), 'Cloud prompt', { apiKey: 'key', context: [context()] });

    expect(result).toMatchObject({
      text: 'cloud answer',
      delivery: 'buffered',
      provider: {
        target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
        cloud: true,
        estimatedCostUsd: 0.001,
      },
    });
  });

  it('uses local Qwen for a missing cloud key only when fallback is explicit', async () => {
    vi.spyOn(providerRuntime, 'runCloudAiRequest').mockRejectedValue(
      new providerRuntime.AiProviderRuntimeError('missing', 'missing-credential'),
    );
    const local = vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('local answer');
    const cloudPolicy = policy({
      target: { kind: 'cloud', providerId: 'deepseek-v4-flash' },
      allowCloud: true,
    });

    await expect(runAgentProviderPrompt(cloudPolicy, 'Prompt'))
      .rejects.toMatchObject({ code: 'missing-credential' });
    const result = await runAgentProviderPrompt(cloudPolicy, 'Prompt', { allowLocalFallback: true });

    expect(local).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      text: 'local answer',
      fallbackReason: 'missing-cloud-credential',
      provider: { target: { kind: 'local', backend: 'local-qwen' }, cloud: false },
    });
  });

  it('refuses undisclosed sensitive cloud context before either runtime runs', async () => {
    const cloud = vi.spyOn(providerRuntime, 'runCloudAiRequest');
    const local = vi.spyOn(translate, 'runLocalQwenPrompt');

    await expect(runAgentProviderPrompt(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
    }), 'Prompt', { context: [context('sensitive')], allowLocalFallback: true }))
      .rejects.toMatchObject({ code: 'sensitive-context' });

    expect(cloud).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
  });
});
