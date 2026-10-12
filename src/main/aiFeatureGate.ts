/**
 * The "Use AI features" master switch and the per-feature cloud opt-ins, as
 * main's AI entry points see them.
 *
 * A registration rather than an import of the store, for the reason
 * `providerRuntime.ts` gives for its spend guard: the modules that consult this
 * are reachable from unit tests that never boot Electron, and a gate each of
 * them had to wire up would be skipped by the first one that forgot. `null`
 * until main registers the store at startup, which reads as "on" for the
 * switch and as each feature's documented default for the opt-ins.
 */

import type { AiProviderId } from '../shared/aiProviders';
import {
  AI_CLOUD_FEATURES,
  type AiCloudFeatureId,
  type AiEngineChoice,
} from '../shared/aiSetup';
import { AiProviderRuntimeError } from './providerRuntime';

let reader: (() => boolean) | null = null;
let cloudFeatureReader: ((feature: AiCloudFeatureId) => boolean) | null = null;
let configuredProviderReader: (() => AiProviderId) | null = null;

/**
 * The provider chosen in Settings > AI, for background features that must use
 * THE USER'S provider rather than the first one with a key (audit F1). Read
 * through a registration because the owner (the mining config) is a large
 * module the gate's consumers should not import.
 */
export function setConfiguredAiProviderReader(next: (() => AiProviderId) | null): void {
  configuredProviderReader = next;
}

/** The configured provider, or `null` before main registered it or when it cannot be read. */
export function configuredAiProviderId(): AiProviderId | null {
  if (!configuredProviderReader) return null;
  try {
    return configuredProviderReader();
  } catch {
    return null;
  }
}

export function setAiFeaturesReader(next: (() => boolean) | null): void {
  reader = next;
}

export function setAiCloudFeatureReader(next: ((feature: AiCloudFeatureId) => boolean) | null): void {
  cloudFeatureReader = next;
}

/** A switch that cannot be read is treated as on: failing closed would hide features the user chose. */
export function aiFeaturesEnabled(): boolean {
  if (!reader) return true;
  try {
    return reader();
  } catch {
    return true;
  }
}

function featureDefault(feature: AiCloudFeatureId): boolean {
  return AI_CLOUD_FEATURES.find((entry) => entry.id === feature)?.defaultAllowed ?? false;
}

/**
 * Whether `feature` may send text to a cloud provider. Unlike the master switch
 * this one fails CLOSED on an unreadable store for anything not allowed by
 * default: an opt-in that cannot be read is not an opt-in.
 */
export function aiCloudAllowedFor(feature: AiCloudFeatureId): boolean {
  if (!cloudFeatureReader) return featureDefault(feature);
  try {
    return cloudFeatureReader(feature);
  } catch {
    return featureDefault(feature);
  }
}

/** Plain English for logs and the extension route; the renderer shows its own translated text. */
export const AI_FEATURES_OFF_MESSAGE = 'AI features are turned off. Turn them on in Settings > AI.';

/** Plain English for logs; surfaces map the `cloud-disabled` code to their own text. */
export const AI_CLOUD_FEATURE_OFF_MESSAGE =
  'This feature is not allowed to use the cloud. Allow it in Settings > AI, or switch the engine to Offline.';

/**
 * The one check an AI entry point makes before doing any work, local OR cloud.
 *
 * - The master switch gates both engines: "Use AI features" off means the
 *   offline model is not run either (audit: `ai:enrichCard`/`ai:generateDeck`
 *   ran the local model with the switch off).
 * - A cloud engine additionally needs the feature's own opt-in.
 */
export function assertAiFeatureAllowed(feature: AiCloudFeatureId, engine: AiEngineChoice | 'local'): void {
  if (!aiFeaturesEnabled()) throw new AiProviderRuntimeError(AI_FEATURES_OFF_MESSAGE, 'ai-off');
  if (engine === 'cloud' && !aiCloudAllowedFor(feature)) {
    throw new AiProviderRuntimeError(AI_CLOUD_FEATURE_OFF_MESSAGE, 'cloud-disabled');
  }
}
