// @vitest-environment node
/**
 * AI fix C for the Agent chat router, against fake providers only:
 * - F1(c): saved words and review sessions never reach a cloud request unless
 *   the user allowed sharing study data; a local target still gets them.
 * - the per-feature cloud opt-in (`agentChat`) refuses before anything is sent;
 * - A6: a local timeout or cancel is reported as `timeout`/`cancelled`, not as
 *   a generic provider failure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextItem, AgentProviderPolicy } from '../../shared/agentWorkspace';
import * as providerRuntime from '../providerRuntime';
import * as translate from '../translate';
import { setAiCloudFeatureReader } from '../aiFeatureGate';
import { runAgentProviderPrompt } from '../agentProviderRouter';
import { AGENT_STUDY_DATA_REDACTION_NOTE } from '../../shared/agentCloudStudyDataGate';

function policy(target: AgentProviderPolicy['target']): AgentProviderPolicy {
  return {
    target,
    allowCloud: target.kind === 'cloud',
    excludeSensitiveContext: false,
    allowSensitiveContext: false,
    maxInputChars: 20_000,
    maxOutputTokens: 400,
    cache: 'off',
    retryAttempts: 0,
    timeoutMs: 20_000,
    streaming: false,
  };
}

const CLAUDE = policy({ kind: 'cloud', providerId: 'claude-sonnet-5-5' });
const LOCAL = policy({ kind: 'local', backend: 'local-qwen' });

function item(id: string, kind: AgentContextItem['kind'], preview: string): AgentContextItem {
  return {
    id,
    kind,
    label: `${kind} label`,
    preview,
    source: { app: 'flashcards' },
    sensitivity: 'ordinary',
    retained: false,
    createdAt: 1,
  };
}

const SHELF: AgentContextItem[] = [
  item('words', 'saved-words', '猫、犬、鳥'),
  item('session', 'study-session', '12 of 40 wrong'),
  item('passage', 'reading-passage', '雨が降っている。'),
];

function fakeCloud() {
  return vi.spyOn(providerRuntime, 'runCloudAiRequest').mockImplementation(async (request) => ({
    text: 'cloud answer',
    providerId: request.providerId,
    model: request.providerId,
    credentialBucket: 'anthropic',
    inputChars: request.prompt.length,
    startedAt: 1,
    completedAt: 2,
    attempts: 1,
    cached: false,
    delivery: 'buffered',
    usage: {},
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  setAiCloudFeatureReader(null);
});

describe('agent chat: study data and cloud consent', () => {
  it('withholds saved words and review sessions from a cloud request by default', async () => {
    const cloud = fakeCloud();
    const result = await runAgentProviderPrompt(CLAUDE, 'Quiz me.', { context: SHELF, feature: 'agentChat' });
    const sent = cloud.mock.calls[0][0].prompt;
    expect(sent).not.toContain('猫、犬、鳥');
    expect(sent).not.toContain('12 of 40 wrong');
    expect(sent).toContain('雨が降っている。');
    // The model is told material was withheld, and the disclosure lists only what was sent.
    expect(sent).toContain(AGENT_STUDY_DATA_REDACTION_NOTE);
    expect(result.provider.contextIds).toEqual(['passage']);
  });

  it('sends them once the user allowed sharing study data', async () => {
    const cloud = fakeCloud();
    const result = await runAgentProviderPrompt(CLAUDE, 'Quiz me.', { context: SHELF, shareStudyData: true });
    const sent = cloud.mock.calls[0][0].prompt;
    expect(sent).toContain('猫、犬、鳥');
    expect(sent).toContain('12 of 40 wrong');
    expect(sent).not.toContain(AGENT_STUDY_DATA_REDACTION_NOTE);
    expect(result.provider.contextIds).toEqual(['words', 'session', 'passage']);
  });

  it('keeps everything for the offline model, which sends nothing anywhere', async () => {
    const local = vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('local answer');
    await runAgentProviderPrompt(LOCAL, 'Quiz me.', { context: SHELF });
    expect(local.mock.calls[0][0]).toContain('猫、犬、鳥');
  });

  it('a cloud-to-local fallback still never sent study data to the cloud attempt', async () => {
    const cloud = vi.spyOn(providerRuntime, 'runCloudAiRequest').mockRejectedValue(
      new providerRuntime.AiProviderRuntimeError('no key', 'missing-credential'),
    );
    vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('local answer');
    const result = await runAgentProviderPrompt(CLAUDE, 'Quiz me.', { context: SHELF, allowLocalFallback: true });
    expect(cloud.mock.calls[0][0].prompt).not.toContain('猫、犬、鳥');
    expect(result.fallbackReason).toBe('missing-cloud-credential');
  });

  it('refuses a cloud target when the Agent cloud opt-in is off, before any request', async () => {
    setAiCloudFeatureReader((feature) => feature !== 'agentChat');
    const cloud = fakeCloud();
    await expect(runAgentProviderPrompt(CLAUDE, 'Hi', { feature: 'agentChat' }))
      .rejects.toMatchObject({ code: 'cloud-disabled' });
    expect(cloud).not.toHaveBeenCalled();
    // The offline model is not the cloud: the opt-in does not apply to it.
    vi.spyOn(translate, 'runLocalQwenPrompt').mockResolvedValue('ok');
    await expect(runAgentProviderPrompt(LOCAL, 'Hi', { feature: 'agentChat' })).resolves.toMatchObject({ text: 'ok' });
  });
});

describe('agent chat: local failures keep their meaning', () => {
  it('maps the local deadline to `timeout`', async () => {
    vi.spyOn(translate, 'runLocalQwenPrompt').mockRejectedValue(new Error('Local Qwen timed out after 20s.'));
    await expect(runAgentProviderPrompt(LOCAL, 'Hi')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('maps a stop press to `cancelled`', async () => {
    const controller = new AbortController();
    vi.spyOn(translate, 'runLocalQwenPrompt').mockImplementation(async () => {
      controller.abort();
      throw new Error('Local Qwen request was cancelled.');
    });
    await expect(runAgentProviderPrompt(LOCAL, 'Hi', { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'cancelled' });
  });
});
