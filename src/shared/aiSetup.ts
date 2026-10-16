/**
 * One answer to "can this AI feature run, and if not, what does the user do".
 *
 * Before this module the question had a different answer in every surface: AI
 * Card Studio read the engine and the key bucket, the Agent read provider health
 * and nothing about the model, sentence analysis found out from main after the
 * request, and the Translate analysis panel read a flat "some key is set" flag.
 * Twelve entry points, three provider pickers, three places to paste a key — and
 * no way to say "I do not want AI at all".
 *
 * The rule every surface now follows, derived here and nowhere else:
 *
 * - **Off** (`enabled: false`): the feature is not offered. Buttons are hidden,
 *   not greyed out — a switched-off feature is not a broken one.
 * - **Not ready**: the feature shows the one "Set up AI" affordance, which opens
 *   Settings > AI. Never a paragraph naming some other window.
 * - **Ready**: it runs.
 *
 * Pure, so the rule is testable without a window.
 */

import type { AiApiKeysSet, AiProviderId } from './aiProviders';
import {
  AI_PROVIDERS,
  normalizeAiModelName,
  normalizeApiKeysSet,
  normalizeCompatibleBaseUrl,
  providerKeyBucket,
} from './aiProviders';
import type { LocalAgentModelInfo } from './localAgentRuntime';

/** The Settings page id every "Set up AI" link opens. */
export const AI_SETTINGS_PAGE_ID = 'ai';

export type AiEngineChoice = 'cloud' | 'local-qwen';

/**
 * The features that may send text to a cloud provider, each with its own
 * opt-in (Settings > AI > "What may use the cloud").
 *
 * A row here is only added together with the main-process check that enforces
 * it (`assertAiFeatureAllowed` in `main/aiFeatureGate.ts`): a toggle that does
 * not stop anything would be a false promise.
 *
 * `defaultAllowed` follows what the feature did before the toggle existed.
 * Features the user starts by pressing a button after choosing the Cloud engine
 * keep working; anything that runs in the BACKGROUND starts off, because the
 * user never pressed anything for it (audit F1: subtitle auto-translate sent
 * whole episodes to the first keyed provider with no opt-in at all).
 */
export type AiCloudFeatureId =
  | 'cardGen'
  | 'mirror'
  | 'subtitleTranslate'
  | 'agentChat'
  | 'mediaAssistant'
  | 'subtitleFusion'
  | 'ankiAdditions'
  | 'whyWrong'
  | 'exampleSentences'
  | 'leechRescue'
  | 'contextExplain'
  // Watching and reading (`shared/aiImmerseCommon.ts`, enforced in `main/aiImmerseAssist.ts`).
  | 'mediaBrief'
  | 'linePick'
  | 'readerExplain'
  | 'readerSimplify'
  | 'vnExplain'
  | 'vnTranslate'
  | 'studyCommand'
  // Grammar, statistics, planning, onboarding and the Blanc study tools
  // (`shared/aiTutorCommon.ts`, enforced in `main/aiTutorAssist.ts`).
  | 'grammarExplain'
  | 'grammarExamples'
  | 'grammarProduction'
  | 'grammarSighting'
  | 'statsCoach'
  | 'goalSuggest'
  | 'eventParse'
  | 'placementQuiz'
  | 'settingsHelp'
  | 'blancMistake'
  | 'blancSummary'
  // Speaking and writing (`shared/aiShadowing.ts`, `aiConversation.ts`,
  // `aiWritingCorrection.ts`; enforced in `main/aiSpeakAssist.ts`).
  | 'shadowingFeedback'
  | 'conversationPartner'
  | 'writingCorrection'
  | 'journalGrade'
  | 'ocrVision';

export interface AiCloudFeatureDefinition {
  id: AiCloudFeatureId;
  /** i18n keys, resolved at render time. */
  labelKey: string;
  descKey: string;
  defaultAllowed: boolean;
}

export const AI_CLOUD_FEATURES: readonly AiCloudFeatureDefinition[] = [
  { id: 'cardGen', labelKey: 'aiProv.feature.cardGen', descKey: 'aiProv.feature.cardGen.desc', defaultAllowed: true },
  { id: 'mirror', labelKey: 'aiProv.feature.mirror', descKey: 'aiProv.feature.mirror.desc', defaultAllowed: true },
  { id: 'subtitleTranslate', labelKey: 'aiProv.feature.subtitleTranslate', descKey: 'aiProv.feature.subtitleTranslate.desc', defaultAllowed: false },
  // The four below each run only after the user picks a cloud target or presses
  // a button (the Agent's send/plan, an assistant mode, "Fuse", "Generate"), so
  // they keep working by default; the toggle is how to stop them.
  { id: 'agentChat', labelKey: 'aiAgent.feature.agentChat', descKey: 'aiAgent.feature.agentChat.desc', defaultAllowed: true },
  { id: 'mediaAssistant', labelKey: 'aiAgent.feature.mediaAssistant', descKey: 'aiAgent.feature.mediaAssistant.desc', defaultAllowed: true },
  { id: 'subtitleFusion', labelKey: 'aiAgent.feature.subtitleFusion', descKey: 'aiAgent.feature.subtitleFusion.desc', defaultAllowed: true },
  { id: 'ankiAdditions', labelKey: 'aiAgent.feature.ankiAdditions', descKey: 'aiAgent.feature.ankiAdditions.desc', defaultAllowed: true },
  // The optional study helpers (`shared/aiStudyCommon.ts`, enforced in
  // `main/aiStudyAssist.ts`). New, so they start OFF for the cloud: each has a
  // deterministic fallback and runs on the offline model without any opt-in, and
  // sending card text or known words to a provider waits for the user to allow it.
  { id: 'whyWrong', labelKey: 'aiStudy.feature.whyWrong', descKey: 'aiStudy.feature.whyWrong.desc', defaultAllowed: false },
  { id: 'exampleSentences', labelKey: 'aiStudy.feature.exampleSentences', descKey: 'aiStudy.feature.exampleSentences.desc', defaultAllowed: false },
  { id: 'leechRescue', labelKey: 'aiStudy.feature.leechRescue', descKey: 'aiStudy.feature.leechRescue.desc', defaultAllowed: false },
  { id: 'contextExplain', labelKey: 'aiStudy.feature.contextExplain', descKey: 'aiStudy.feature.contextExplain.desc', defaultAllowed: false },
  // The optional helpers for watching and reading (`shared/aiImmerseCommon.ts`,
  // enforced in `main/aiImmerseAssist.ts`). New, so they start OFF for the cloud
  // for the same reason as the study helpers above: each has a deterministic
  // fallback and runs on the offline model without any opt-in.
  { id: 'mediaBrief', labelKey: 'aiImmerse.feature.mediaBrief', descKey: 'aiImmerse.feature.mediaBrief.desc', defaultAllowed: false },
  { id: 'linePick', labelKey: 'aiImmerse.feature.linePick', descKey: 'aiImmerse.feature.linePick.desc', defaultAllowed: false },
  { id: 'readerExplain', labelKey: 'aiImmerse.feature.readerExplain', descKey: 'aiImmerse.feature.readerExplain.desc', defaultAllowed: false },
  { id: 'readerSimplify', labelKey: 'aiImmerse.feature.readerSimplify', descKey: 'aiImmerse.feature.readerSimplify.desc', defaultAllowed: false },
  { id: 'vnExplain', labelKey: 'aiImmerse.feature.vnExplain', descKey: 'aiImmerse.feature.vnExplain.desc', defaultAllowed: false },
  { id: 'vnTranslate', labelKey: 'aiImmerse.feature.vnTranslate', descKey: 'aiImmerse.feature.vnTranslate.desc', defaultAllowed: false },
  { id: 'studyCommand', labelKey: 'aiImmerse.feature.studyCommand', descKey: 'aiImmerse.feature.studyCommand.desc', defaultAllowed: false },
  // Grammar, statistics, planning, onboarding and the Blanc study tools
  // (`shared/aiTutorCommon.ts`, enforced in `main/aiTutorAssist.ts`). New, so
  // every one starts OFF for the cloud: each has a deterministic fallback and
  // runs on the offline model without any opt-in.
  { id: 'grammarExplain', labelKey: 'aiTutor.feature.grammarExplain', descKey: 'aiTutor.feature.grammarExplain.desc', defaultAllowed: false },
  { id: 'grammarExamples', labelKey: 'aiTutor.feature.grammarExamples', descKey: 'aiTutor.feature.grammarExamples.desc', defaultAllowed: false },
  { id: 'grammarProduction', labelKey: 'aiTutor.feature.grammarProduction', descKey: 'aiTutor.feature.grammarProduction.desc', defaultAllowed: false },
  { id: 'grammarSighting', labelKey: 'aiTutor.feature.grammarSighting', descKey: 'aiTutor.feature.grammarSighting.desc', defaultAllowed: false },
  { id: 'statsCoach', labelKey: 'aiTutor.feature.statsCoach', descKey: 'aiTutor.feature.statsCoach.desc', defaultAllowed: false },
  { id: 'goalSuggest', labelKey: 'aiTutor.feature.goalSuggest', descKey: 'aiTutor.feature.goalSuggest.desc', defaultAllowed: false },
  { id: 'eventParse', labelKey: 'aiTutor.feature.eventParse', descKey: 'aiTutor.feature.eventParse.desc', defaultAllowed: false },
  { id: 'placementQuiz', labelKey: 'aiTutor.feature.placementQuiz', descKey: 'aiTutor.feature.placementQuiz.desc', defaultAllowed: false },
  { id: 'settingsHelp', labelKey: 'aiTutor.feature.settingsHelp', descKey: 'aiTutor.feature.settingsHelp.desc', defaultAllowed: false },
  { id: 'blancMistake', labelKey: 'aiTutor.feature.blancMistake', descKey: 'aiTutor.feature.blancMistake.desc', defaultAllowed: false },
  { id: 'blancSummary', labelKey: 'aiTutor.feature.blancSummary', descKey: 'aiTutor.feature.blancSummary.desc', defaultAllowed: false },
  // Speaking and writing (`main/aiSpeakAssist.ts`). New, so OFF for the cloud:
  // the shadowing score, the scripted drills and the journal word check work
  // without a model, and the offline model needs no opt-in. The recording itself
  // never leaves the device; only text does, and only after this opt-in.
  { id: 'shadowingFeedback', labelKey: 'aiSpeak.feature.shadowingFeedback', descKey: 'aiSpeak.feature.shadowingFeedback.desc', defaultAllowed: false },
  { id: 'conversationPartner', labelKey: 'aiSpeak.feature.conversationPartner', descKey: 'aiSpeak.feature.conversationPartner.desc', defaultAllowed: false },
  { id: 'writingCorrection', labelKey: 'aiSpeak.feature.writingCorrection', descKey: 'aiSpeak.feature.writingCorrection.desc', defaultAllowed: false },
  { id: 'journalGrade', labelKey: 'aiSpeak.feature.journalGrade', descKey: 'aiSpeak.feature.journalGrade.desc', defaultAllowed: false },
  { id: 'ocrVision', labelKey: 'aiProv.feature.ocrVision', descKey: 'aiProv.feature.ocrVision.desc', defaultAllowed: false },
];

export type AiCloudFeatureConsent = Record<AiCloudFeatureId, boolean>;

export function defaultAiCloudFeatureConsent(): AiCloudFeatureConsent {
  const out = {} as AiCloudFeatureConsent;
  for (const feature of AI_CLOUD_FEATURES) out[feature.id] = feature.defaultAllowed;
  return out;
}

export function isAiCloudFeatureId(value: unknown): value is AiCloudFeatureId {
  return AI_CLOUD_FEATURES.some((feature) => feature.id === value);
}

function normalizeCloudFeatures(value: unknown): AiCloudFeatureConsent {
  const out = defaultAiCloudFeatureConsent();
  if (!value || typeof value !== 'object') return out;
  const raw = value as Partial<Record<string, unknown>>;
  for (const feature of AI_CLOUD_FEATURES) {
    if (typeof raw[feature.id] === 'boolean') out[feature.id] = raw[feature.id] as boolean;
  }
  return out;
}

/**
 * Per-provider choices that are not secrets: the OpenAI model, and the local
 * OpenAI-compatible server (Ollama, LM Studio). Keys stay in the vault.
 */
export interface AiProviderOptions {
  /** Model sent to api.openai.com. Empty means the entry's default. */
  openaiModel: string;
  /** e.g. `http://localhost:11434/v1`. Empty means "not configured". */
  compatBaseUrl: string;
  /** e.g. `qwen3:8b`. Required by every compatible server. */
  compatModel: string;
}

export const DEFAULT_AI_PROVIDER_OPTIONS: AiProviderOptions = {
  openaiModel: '',
  compatBaseUrl: '',
  compatModel: '',
};

export function normalizeAiProviderOptions(value: unknown): AiProviderOptions {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<string, unknown>>;
  return {
    openaiModel: normalizeAiModelName(raw.openaiModel),
    compatBaseUrl: normalizeCompatibleBaseUrl(raw.compatBaseUrl),
    compatModel: normalizeAiModelName(raw.compatModel),
  };
}

/** The master switch and the cloud opt-ins, main-owned (`userData/ai/settings-v1.json`). */
export interface AiFeatureSettings extends AiProviderOptions {
  version: 1;
  /** "Use AI features". On by default: nothing loads until a feature is used. */
  enabled: boolean;
  /** Which features may use the cloud engine. */
  cloudFeatures: AiCloudFeatureConsent;
}

export const DEFAULT_AI_FEATURE_SETTINGS: AiFeatureSettings = {
  version: 1,
  enabled: true,
  cloudFeatures: defaultAiCloudFeatureConsent(),
  ...DEFAULT_AI_PROVIDER_OPTIONS,
};

export function normalizeAiFeatureSettings(value: unknown): AiFeatureSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AI_FEATURE_SETTINGS, cloudFeatures: defaultAiCloudFeatureConsent() };
  }
  const raw = value as Partial<AiFeatureSettings>;
  return {
    version: 1,
    // Only an explicit `false` turns AI off; a damaged file must not silently
    // hide every AI feature the user was relying on.
    enabled: raw.enabled !== false,
    cloudFeatures: normalizeCloudFeatures(raw.cloudFeatures),
    ...normalizeAiProviderOptions(raw),
  };
}

/** A partial update from Settings > AI. Unknown fields are ignored. */
export interface AiFeatureSettingsPatch extends Partial<AiProviderOptions> {
  cloudFeatures?: Partial<AiCloudFeatureConsent>;
}

/** Applies a patch that crossed the bridge; anything malformed is dropped, not stored. */
export function applyAiFeatureSettingsPatch(current: AiFeatureSettings, patch: unknown): AiFeatureSettings {
  if (!patch || typeof patch !== 'object') return current;
  const raw = patch as Partial<Record<string, unknown>>;
  const options = normalizeAiProviderOptions({ ...current, ...raw });
  const cloudFeatures = { ...current.cloudFeatures };
  if (raw.cloudFeatures && typeof raw.cloudFeatures === 'object') {
    const incoming = raw.cloudFeatures as Partial<Record<string, unknown>>;
    for (const feature of AI_CLOUD_FEATURES) {
      if (typeof incoming[feature.id] === 'boolean') cloudFeatures[feature.id] = incoming[feature.id] as boolean;
    }
  }
  return { ...current, ...options, cloudFeatures };
}

/** Everything main knows about AI setup, in one reply. */
export interface AiSetupStatus extends AiProviderOptions {
  enabled: boolean;
  engine: AiEngineChoice;
  providerId: AiProviderId;
  apiKeysSet: AiApiKeysSet;
  /** The small offline model (Qwen3-1.7B) that translation, cards and analysis use. */
  localModelInstalled: boolean;
  /** Every GGUF the Agent's model picker can offer. */
  models: LocalAgentModelInfo[];
  cloudFeatures: AiCloudFeatureConsent;
}

/** What the Agent's own settings contribute; a subset so this stays renderer-free. */
export interface AiAgentSetupInput {
  enabled: boolean;
  backend: 'local-gguf' | 'disabled';
  modelFileName: string;
}

export interface AiReadiness {
  /** The master switch. `false` means hide every AI entry point. */
  enabled: boolean;
  engine: AiEngineChoice;
  providerId: AiProviderId;
  /** A key is saved for the configured cloud provider. */
  cloudReady: boolean;
  /** The small offline model is installed. */
  localReady: boolean;
  /** The configured engine can run right now. What most surfaces check. */
  ready: boolean;
  /** The Agent's model (the one picked, or any installed one) is on disk. */
  agentModelReady: boolean;
  agentEnabled: boolean;
  /** The Agent can make an action plan: enabled, and a local model or a cloud key to plan with. */
  agentCanPlan: boolean;
}

export function aiKeySetFor(providerId: AiProviderId, keys: AiApiKeysSet): boolean {
  return Boolean(keys[providerKeyBucket(providerId)]);
}

/**
 * Whether the Agent's model is on disk, answered from the same list the picker
 * shows. A picked file must be in it; with no pick, any GGUF will do, because
 * main chooses per role from whatever is installed.
 */
export function agentModelInstalled(
  models: readonly LocalAgentModelInfo[],
  modelFileName: string,
): boolean {
  const wanted = modelFileName.trim().toLocaleLowerCase();
  if (!wanted) return models.length > 0;
  return models.some((model) => model.fileName.toLocaleLowerCase() === wanted);
}

export function deriveAiReadiness(status: AiSetupStatus, agent: AiAgentSetupInput): AiReadiness {
  const cloudReady = aiKeySetFor(status.providerId, status.apiKeysSet);
  const localReady = status.localModelInstalled;
  const agentModelReady = agentModelInstalled(status.models, agent.modelFileName);
  const agentEnabled = agent.enabled && agent.backend !== 'disabled';
  return {
    enabled: status.enabled,
    engine: status.engine,
    providerId: status.providerId,
    cloudReady,
    localReady,
    ready: status.enabled && (status.engine === 'cloud' ? cloudReady : localReady),
    agentModelReady,
    agentEnabled,
    agentCanPlan: status.enabled && agentEnabled && (agentModelReady || cloudReady),
  };
}

/**
 * Which target the Agent should start on: the configured engine when it can
 * run, otherwise whichever side can. A user with a cloud key and no model used
 * to land on "Local" and meet a failure on their first message.
 */
export function preferredAgentTarget(readiness: AiReadiness): 'local' | AiProviderId {
  const configured: 'local' | AiProviderId = readiness.engine === 'cloud' ? readiness.providerId : 'local';
  const configuredReady = configured === 'local' ? readiness.agentModelReady : readiness.cloudReady;
  if (configuredReady) return configured;
  if (configured === 'local' && readiness.cloudReady) return readiness.providerId;
  if (configured !== 'local' && readiness.agentModelReady) return 'local';
  return configured;
}

/**
 * Re-derives a status that crossed the bridge. Anything that is not an object
 * with a boolean switch is `null` — "no answer yet" — never a thrown render.
 */
export function normalizeAiSetupStatus(value: unknown): AiSetupStatus | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiSetupStatus>;
  if (typeof raw.enabled !== 'boolean') return null;
  const fallback = pendingAiSetupStatus();
  return {
    enabled: raw.enabled,
    engine: raw.engine === 'local-qwen' ? 'local-qwen' : 'cloud',
    providerId: typeof raw.providerId === 'string' && AI_PROVIDERS.some((provider) => provider.id === raw.providerId)
      ? raw.providerId
      : fallback.providerId,
    apiKeysSet: normalizeApiKeysSet(raw.apiKeysSet),
    localModelInstalled: raw.localModelInstalled === true,
    models: Array.isArray(raw.models)
      ? raw.models.filter((model): model is LocalAgentModelInfo => (
        Boolean(model) && typeof model.fileName === 'string' && typeof model.sizeBytes === 'number'
      ))
      : [],
    cloudFeatures: normalizeCloudFeatures(raw.cloudFeatures),
    ...normalizeAiProviderOptions(raw),
  };
}

/** The status a window shows before main has answered: nothing assumed ready. */
export function pendingAiSetupStatus(): AiSetupStatus {
  return {
    enabled: true,
    engine: 'cloud',
    providerId: 'gemini-2.5-flash',
    apiKeysSet: normalizeApiKeysSet(null),
    localModelInstalled: false,
    models: [],
    cloudFeatures: defaultAiCloudFeatureConsent(),
    ...DEFAULT_AI_PROVIDER_OPTIONS,
  };
}
