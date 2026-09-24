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
import { providerKeyBucket } from './aiProviders';
import type { LocalAgentModelInfo } from './localAgentRuntime';

/** The Settings page id every "Set up AI" link opens. */
export const AI_SETTINGS_PAGE_ID = 'ai';

export type AiEngineChoice = 'cloud' | 'local-qwen';

/** The master switch, main-owned (`userData/ai/settings-v1.json`). */
export interface AiFeatureSettings {
  version: 1;
  /** "Use AI features". On by default: nothing loads until a feature is used. */
  enabled: boolean;
}

export const DEFAULT_AI_FEATURE_SETTINGS: AiFeatureSettings = { version: 1, enabled: true };

export function normalizeAiFeatureSettings(value: unknown): AiFeatureSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AI_FEATURE_SETTINGS };
  const raw = value as Partial<AiFeatureSettings>;
  // Only an explicit `false` turns AI off; a damaged file must not silently
  // hide every AI feature the user was relying on.
  return { version: 1, enabled: raw.enabled !== false };
}

/** Everything main knows about AI setup, in one reply. */
export interface AiSetupStatus {
  enabled: boolean;
  engine: AiEngineChoice;
  providerId: AiProviderId;
  apiKeysSet: AiApiKeysSet;
  /** The small offline model (Qwen3-1.7B) that translation, cards and analysis use. */
  localModelInstalled: boolean;
  /** Every GGUF the Agent's model picker can offer. */
  models: LocalAgentModelInfo[];
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

/** The status a window shows before main has answered: nothing assumed ready. */
export function pendingAiSetupStatus(): AiSetupStatus {
  return {
    enabled: true,
    engine: 'cloud',
    providerId: 'gemini-2.5-flash',
    apiKeysSet: { gemini: false, deepseek: false },
    localModelInstalled: false,
    models: [],
  };
}
