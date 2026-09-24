// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  agentModelInstalled,
  deriveAiReadiness,
  normalizeAiFeatureSettings,
  normalizeAiSetupStatus,
  pendingAiSetupStatus,
  preferredAgentTarget,
  type AiSetupStatus,
} from '../aiSetup';

const AGENT_ON = { enabled: true, backend: 'local-gguf' as const, modelFileName: '' };

function status(over: Partial<AiSetupStatus> = {}): AiSetupStatus {
  return { ...pendingAiSetupStatus(), ...over };
}

const SMALL_MODEL = { fileName: 'Qwen3-1.7B-Q8_0.gguf', sizeBytes: 1, location: 'app-models' as const };

describe('AI readiness', () => {
  it('a first-time user with nothing set up is not ready and cannot plan', () => {
    const readiness = deriveAiReadiness(status(), AGENT_ON);
    expect(readiness).toMatchObject({ enabled: true, ready: false, agentModelReady: false, agentCanPlan: false });
  });

  it('a cloud key alone makes the cloud engine ready and lets the Agent plan', () => {
    const readiness = deriveAiReadiness(status({ apiKeysSet: { gemini: true, deepseek: false } }), AGENT_ON);
    expect(readiness).toMatchObject({ ready: true, cloudReady: true, agentModelReady: false, agentCanPlan: true });
  });

  it('keys are per provider: a DeepSeek key does not make Gemini ready', () => {
    const readiness = deriveAiReadiness(status({ apiKeysSet: { gemini: false, deepseek: true } }), AGENT_ON);
    expect(readiness.cloudReady).toBe(false);
  });

  it('the offline engine needs the installed model', () => {
    const offline = status({ engine: 'local-qwen' });
    expect(deriveAiReadiness(offline, AGENT_ON).ready).toBe(false);
    expect(deriveAiReadiness({ ...offline, localModelInstalled: true, models: [SMALL_MODEL] }, AGENT_ON).ready)
      .toBe(true);
  });

  it('the master switch makes nothing ready', () => {
    const off = deriveAiReadiness(
      status({ enabled: false, apiKeysSet: { gemini: true, deepseek: true }, localModelInstalled: true }),
      AGENT_ON,
    );
    expect(off).toMatchObject({ enabled: false, ready: false, agentCanPlan: false });
  });

  it('a picked Agent model must actually be on disk', () => {
    expect(agentModelInstalled([SMALL_MODEL], '')).toBe(true);
    expect(agentModelInstalled([SMALL_MODEL], 'qwen3-1.7b-q8_0.gguf')).toBe(true);
    expect(agentModelInstalled([SMALL_MODEL], 'Qwen3-14B.gguf')).toBe(false);
  });
});

describe('the Agent starts on whatever can run', () => {
  it('goes to the cloud provider when there is a key and no model (the first-message failure)', () => {
    const readiness = deriveAiReadiness(
      status({ engine: 'local-qwen', apiKeysSet: { gemini: true, deepseek: false } }),
      AGENT_ON,
    );
    expect(preferredAgentTarget(readiness)).toBe('gemini-2.5-flash');
  });

  it('goes local when the model is there and the cloud has no key', () => {
    const readiness = deriveAiReadiness(status({ models: [SMALL_MODEL], localModelInstalled: true }), AGENT_ON);
    expect(preferredAgentTarget(readiness)).toBe('local');
  });

  it('keeps the configured engine when it can run', () => {
    const readiness = deriveAiReadiness(
      status({ engine: 'cloud', providerId: 'deepseek-v4-pro', apiKeysSet: { gemini: false, deepseek: true }, models: [SMALL_MODEL] }),
      AGENT_ON,
    );
    expect(preferredAgentTarget(readiness)).toBe('deepseek-v4-pro');
  });
});

describe('what crosses the bridge', () => {
  it('treats a malformed status as no answer rather than throwing', () => {
    expect(normalizeAiSetupStatus(null)).toBeNull();
    expect(normalizeAiSetupStatus({ engine: 'cloud' })).toBeNull();
    expect(normalizeAiSetupStatus({ enabled: false, providerId: 'nonsense', models: [null, SMALL_MODEL] }))
      .toMatchObject({ enabled: false, providerId: 'gemini-2.5-flash', models: [SMALL_MODEL] });
  });

  it('only an explicit false turns AI off in the stored switch', () => {
    expect(normalizeAiFeatureSettings(undefined).enabled).toBe(true);
    expect(normalizeAiFeatureSettings({ enabled: 'no' }).enabled).toBe(true);
    expect(normalizeAiFeatureSettings({ enabled: false }).enabled).toBe(false);
  });
});
