// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_WORKSPACE_MODES,
  type AgentContextItem,
  type AgentProviderPolicy,
} from '../../shared/agentWorkspace';
import * as providerRuntime from '../providerRuntime';
import * as translate from '../translate';
import {
  agentModePreset,
  runAgentProviderPrompt,
  type AgentProviderHistoryMessage,
} from '../agentProviderRouter';

function history(index: number, text = `turn-${index}`) {
  return {
    id: `history-${index}`,
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    status: 'complete' as const,
    text,
  };
}

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

function attachment(contentText = 'attached study notes'): {
  id: string;
  kind: 'document';
  name: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: 'sensitive';
  retained: false;
  contentText: string;
} {
  return {
    id: 'attachment-1',
    kind: 'document',
    name: 'notes.txt',
    mimeType: 'text/plain',
    sizeBytes: contentText.length,
    sensitivity: 'sensitive',
    retained: false,
    contentText,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Agent provider router', () => {
  it('streams an explicitly local request through Qwen and discloses the real target', async () => {
    const chunks: string[] = [];
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (routedPrompt, options) => {
      expect(routedPrompt).toContain('Explain this.');
      expect(routedPrompt).toContain('[Context 1: Passage]');
      expect(routedPrompt).toContain('短い文');
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

  it('reports the delivery mode returned by an allowed cloud request', async () => {
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
      delivery: 'streamed',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 },
    });

    const result = await runAgentProviderPrompt(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
    }), 'Cloud prompt', { apiKey: 'key', context: [context()] });

    expect(result).toMatchObject({
      text: 'cloud answer',
      delivery: 'streamed',
      provider: {
        target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
        cloud: true,
        estimatedCostUsd: 0.001,
      },
    });
  });

  it('passes the cloud streaming callback only when policy streaming is enabled', async () => {
    const cloud = vi.spyOn(providerRuntime, 'runCloudAiRequest').mockImplementation(async (request) => {
      request.onTextChunk?.('cloud');
      return {
        text: 'cloud',
        providerId: 'deepseek-v4-flash',
        model: 'deepseek-v4-flash',
        credentialBucket: 'deepseek',
        inputChars: 6,
        startedAt: 100,
        completedAt: 120,
        attempts: 1,
        cached: false,
        delivery: request.onTextChunk ? 'streamed' : 'buffered',
        usage: {},
      };
    });
    const chunks: string[] = [];
    const cloudPolicy = policy({
      target: { kind: 'cloud', providerId: 'deepseek-v4-flash' },
      allowCloud: true,
    });

    const streamed = await runAgentProviderPrompt(cloudPolicy, 'Prompt', {
      onTextChunk: (chunk) => chunks.push(chunk),
    });
    const buffered = await runAgentProviderPrompt({ ...cloudPolicy, streaming: false }, 'Prompt', {
      onTextChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['cloud']);
    expect(streamed.delivery).toBe('streamed');
    expect(buffered.delivery).toBe('buffered');
    expect(cloud).toHaveBeenCalledTimes(2);
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

  it('includes accepted attachment metadata and content in the actual local prompt', async () => {
    let routed = '';
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (prompt) => {
      routed = prompt;
      return 'grounded answer';
    });

    const result = await runAgentProviderPrompt(policy(), 'Use the file.', {
      attachments: [attachment('一つの添付資料です。')],
    });

    expect(routed).toContain('Attached text/document content');
    expect(routed).toContain('Name: notes.txt');
    expect(routed).toContain('一つの添付資料です。');
    expect(result.provider.attachmentIds).toEqual(['attachment-1']);
    expect(result.provider.inputChars).toBe(routed.length);
  });

  it('includes the same attachment section in the actual cloud prompt after consent', async () => {
    let routed = '';
    vi.spyOn(providerRuntime, 'runCloudAiRequest').mockImplementation(async (request) => {
      routed = request.prompt;
      return {
        text: 'cloud answer',
        providerId: 'gemini-2.5-flash',
        model: 'gemini-2.5-flash',
        credentialBucket: 'gemini',
        inputChars: request.prompt.length,
        startedAt: 100,
        completedAt: 110,
        attempts: 1,
        cached: false,
        delivery: 'buffered',
        usage: {},
      };
    });

    const result = await runAgentProviderPrompt(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      allowSensitiveContext: true,
    }), 'Use the cloud file.', {
      apiKey: 'key',
      attachments: [attachment('cloud attachment content')],
    });

    expect(routed).toContain('cloud attachment content');
    expect(result.provider.attachmentIds).toEqual(['attachment-1']);
  });

  it('blocks sensitive cloud attachments without consent before the cloud runtime', async () => {
    const cloud = vi.spyOn(providerRuntime, 'runCloudAiRequest');
    const cloudPolicy = policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
    });

    await expect(runAgentProviderPrompt(cloudPolicy, 'Summarize the file.', {
      attachments: [attachment()],
    })).rejects.toMatchObject({ code: 'sensitive-context' });

    expect(cloud).not.toHaveBeenCalled();
  });

  it('counts attachment sections and contents in the final input budget', async () => {
    vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('ok');
    const file = attachment('x'.repeat(80));
    const prompt = 'Prompt';

    await expect(runAgentProviderPrompt(policy({ maxInputChars: prompt.length + 1 }), prompt, {
      attachments: [file],
    })).rejects.toMatchObject({ code: 'input-budget' });

    await expect(runAgentProviderPrompt(policy({ maxInputChars: prompt.length + 1 }), prompt))
      .resolves.toMatchObject({ text: 'ok' });
  });
});

describe('workflow-preset modes', () => {
  it('sends an ask conversation exactly the bytes it sent before modes existed', async () => {
    // `ask` is what every conversation normalizes to, so a preset here would be
    // boilerplate on every request the app has ever sent — tokens on the cloud
    // path, latency on the local one. Its absence is also what makes this slice
    // unable to regress the default: these two must be byte-identical.
    let withMode = '';
    let without = '';
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (routed) => {
      if (!withMode) withMode = routed; else without = routed;
      return 'ok';
    });

    await runAgentProviderPrompt(policy(), 'Explain this.', { mode: 'ask', context: [context()] });
    await runAgentProviderPrompt(policy(), 'Explain this.', { context: [context()] });
    expect(withMode).toBe(without);
  });

  it('leads with the preset and keeps the context shelf trailing', async () => {
    let routed = '';
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (prompt) => {
      routed = prompt;
      return 'ok';
    });

    await runAgentProviderPrompt(policy(), 'Where is it?', {
      mode: 'navigate',
      context: [context()],
    });

    // The preset frames how the rest is read, so it leads; the shelf is
    // reference material for the question, so it still trails.
    expect(routed.indexOf(agentModePreset('navigate'))).toBe(0);
    expect(routed.indexOf('Where is it?'))
      .toBeGreaterThan(routed.indexOf(agentModePreset('navigate')));
    expect(routed.indexOf('Selected Study OS context:'))
      .toBeGreaterThan(routed.indexOf('Where is it?'));
  });

  it('counts the preset in the disclosed input size and against the budget', async () => {
    // A disclosure that excluded the preset would understate what was actually
    // sent, and a budget check that skipped it could pass a request the provider
    // then rejects.
    vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('ok');
    const result = await runAgentProviderPrompt(policy(), 'Draft it.', { mode: 'create' });
    expect(result.provider.inputChars)
      .toBe(`${agentModePreset('create')}\n\nDraft it.`.length);

    const tight = policy({ maxInputChars: 'Draft it.'.length + 5 });
    await expect(runAgentProviderPrompt(tight, 'Draft it.', { mode: 'create' }))
      .rejects.toMatchObject({ code: 'input-budget' });
    // ...and the same prompt without the preset still fits, so the refusal above
    // is the preset's weight and not an unrelated budget change.
    await expect(runAgentProviderPrompt(tight, 'Draft it.')).resolves.toMatchObject({ text: 'ok' });
  });

  it('never lets a preset claim a capability this path does not have', () => {
    // This execution path runs one prompt and returns text: there is no tool
    // loop, so the Agent cannot open a surface and cannot run an automation.
    // `navigate` and `automate` are precisely the modes whose names imply
    // otherwise, and Track 3 requires the Agent never claim an action completed
    // when only a plan was produced. A preset that let the model narrate having
    // opened something would be that claim, authored by us.
    expect(agentModePreset('navigate')).toMatch(/cannot open/i);
    expect(agentModePreset('automate')).toMatch(/cannot execute/i);
    expect(agentModePreset('automate')).toMatch(/never report a step as done/i);
  });

  it('has a preset for every mode except ask, so a new mode cannot be forgotten', () => {
    for (const mode of AGENT_WORKSPACE_MODES) {
      if (mode === 'ask') expect(agentModePreset(mode)).toBe('');
      else expect(agentModePreset(mode).length).toBeGreaterThan(0);
    }
    // An unknown mode degrades to no preset rather than throwing — the store
    // normalizes to `ask`, but the router must not be the thing that breaks if
    // it ever sees something else.
    expect(agentModePreset(undefined)).toBe('');
  });

  it('sends the newest bounded conversation turns in order and discloses their ids', async () => {
    let routed = '';
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (prompt) => {
      routed = prompt;
      return 'ok';
    });
    const messages: AgentProviderHistoryMessage[] = Array.from(
      { length: 14 },
      (_, index) => history(index),
    );
    messages.splice(8, 0, {
      id: 'ignored-failed',
      role: 'assistant',
      status: 'failed',
      text: 'must not be sent',
    });

    const result = await runAgentProviderPrompt(policy({ maxInputChars: 20_000 }), 'Continue.', {
      history: messages,
      context: [context()],
    });

    expect(routed).not.toContain('turn-0');
    expect(routed).not.toMatch(/\nturn-1\n/);
    expect(routed).not.toContain('must not be sent');
    expect(routed.indexOf('turn-2')).toBeLessThan(routed.indexOf('turn-13'));
    expect(routed.indexOf('turn-13')).toBeLessThan(routed.indexOf('Current user request:'));
    expect(routed.indexOf('Continue.')).toBeLessThan(routed.indexOf('Selected Study OS context:'));
    expect(result.provider.historyMessageIds)
      .toEqual(Array.from({ length: 12 }, (_, index) => `history-${index + 2}`));
    expect(result.provider.inputChars).toBe(routed.length);
  });

  it('drops older history to fit the input budget without dropping the current request', async () => {
    let routed = '';
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async (prompt) => {
      routed = prompt;
      return 'ok';
    });
    const result = await runAgentProviderPrompt(policy({ maxInputChars: 520 }), 'Current question.', {
      history: [history(1, 'a'.repeat(300)), history(2, 'b'.repeat(300))],
    });

    expect(routed.length).toBeLessThanOrEqual(520);
    expect(routed).toContain('Current question.');
    expect(routed).toContain('b'.repeat(100));
    expect(routed).not.toContain('a'.repeat(100));
    expect(result.provider.historyMessageIds).toEqual(['history-2']);
  });
});
