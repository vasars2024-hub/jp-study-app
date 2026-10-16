// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyAiFeatureSettingsPatch,
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

/** The grammar, statistics, planning, onboarding and Blanc helpers (aiTutorCommon.ts): all OFF for the cloud. */
const TUTOR_FEATURES_OFF = {
  grammarExplain: false,
  grammarExamples: false,
  grammarProduction: false,
  grammarSighting: false,
  statsCoach: false,
  goalSuggest: false,
  eventParse: false,
  placementQuiz: false,
  settingsHelp: false,
  blancMistake: false,
  blancSummary: false,
};

/** Speaking and writing helpers (aiShadowing/aiConversation/aiWritingCorrection): all OFF for the cloud. */
const SPEAK_FEATURES_OFF = {
  shadowingFeedback: false,
  conversationPartner: false,
  writingCorrection: false,
  journalGrade: false,
};

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

  it('cloud opt-ins default per feature: buttons on, background subtitle translation off', () => {
    expect(normalizeAiFeatureSettings(undefined).cloudFeatures).toEqual({
      cardGen: true,
      mirror: true,
      subtitleTranslate: false,
      agentChat: true,
      mediaAssistant: true,
      subtitleFusion: true,
      ankiAdditions: true,
      // The optional study helpers start off for the cloud (local and fallback still work).
      whyWrong: false,
      exampleSentences: false,
      leechRescue: false,
      contextExplain: false,
      // The watching and reading helpers start off for the cloud as well.
      mediaBrief: false,
      linePick: false,
      readerExplain: false,
      readerSimplify: false,
      vnExplain: false,
      vnTranslate: false,
      studyCommand: false,
      // Grammar, statistics, planning, onboarding and Blanc helpers: off for the cloud too.
      ...TUTOR_FEATURES_OFF,
      ...SPEAK_FEATURES_OFF,
      // Reading text in pictures with AI sends the picture: off until the learner allows it.
      ocrVision: false,
    });
    const patched = applyAiFeatureSettingsPatch(normalizeAiFeatureSettings(undefined), {
      cloudFeatures: { subtitleTranslate: true, bogus: true, mirror: 'yes' },
    });
    expect(patched.cloudFeatures).toEqual({
      cardGen: true,
      mirror: true,
      subtitleTranslate: true,
      agentChat: true,
      mediaAssistant: true,
      subtitleFusion: true,
      ankiAdditions: true,
      whyWrong: false,
      exampleSentences: false,
      leechRescue: false,
      contextExplain: false,
      // The watching and reading helpers start off for the cloud as well.
      mediaBrief: false,
      linePick: false,
      readerExplain: false,
      readerSimplify: false,
      vnExplain: false,
      vnTranslate: false,
      studyCommand: false,
      ...TUTOR_FEATURES_OFF,
      ...SPEAK_FEATURES_OFF,
      // Reading text in pictures with AI sends the picture: off until the learner allows it.
      ocrVision: false,
    });
  });

  it('keeps provider options clean: no credentials in a URL, no spaces in a model', () => {
    const base = normalizeAiFeatureSettings(undefined);
    expect(applyAiFeatureSettingsPatch(base, { compatBaseUrl: 'http://localhost:11434/v1/chat/completions/' }).compatBaseUrl)
      .toBe('http://localhost:11434/v1');
    expect(applyAiFeatureSettingsPatch(base, { compatBaseUrl: 'http://user:pw@host/v1' }).compatBaseUrl).toBe('');
    expect(applyAiFeatureSettingsPatch(base, { compatBaseUrl: 'file:///etc/passwd' }).compatBaseUrl).toBe('');
    expect(applyAiFeatureSettingsPatch(base, { compatModel: 'qwen3:8b' }).compatModel).toBe('qwen3:8b');
    expect(applyAiFeatureSettingsPatch(base, { openaiModel: 'gpt 5' }).openaiModel).toBe('');
  });

  it('reads every provider bucket off the bridge, missing ones as unset', () => {
    const status = normalizeAiSetupStatus({ enabled: true, providerId: 'claude-opus-5-5', apiKeysSet: { anthropic: true } });
    expect(status?.providerId).toBe('claude-opus-5-5');
    expect(status?.apiKeysSet).toEqual({ gemini: false, deepseek: false, anthropic: true, openai: false, 'openai-compatible': false });
    expect(deriveAiReadiness(status!, AGENT_ON).cloudReady).toBe(true);
  });

  it('only an explicit false turns AI off in the stored switch', () => {
    expect(normalizeAiFeatureSettings(undefined).enabled).toBe(true);
    expect(normalizeAiFeatureSettings({ enabled: 'no' }).enabled).toBe(true);
    expect(normalizeAiFeatureSettings({ enabled: false }).enabled).toBe(false);
  });
});
