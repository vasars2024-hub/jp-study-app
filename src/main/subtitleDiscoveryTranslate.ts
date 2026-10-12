/**
 * Machine-translates a whole subtitle track, keeping its timing.
 *
 * Used by the automation queue in two directions:
 *   Japanese → helper language, when a Japanese track exists and no helper-line
 *     track does (the ordinary anime case: Jimaku has Japanese only).
 *   helper language → Japanese, when only an English track exists and the audio
 *     is not Japanese, so Whisper cannot hear a Japanese line to transcribe.
 *
 * Engines are the app's existing ones, nothing new: the provider chosen in
 * Settings > AI through `providerRuntime` (with the user's key and monthly spend
 * ceiling, and ONLY after the user opted in to cloud subtitle translation),
 * else the offline Qwen model through `runLocalQwenPrompt`, which
 * shares the translator's serialized queue so an interactive translation is
 * never stuck behind a whole episode. Lines already translated anywhere in the
 * app are read from the shared translation cache and cost nothing.
 *
 * Prompting, parsing and assembly are pure and live in
 * `shared/subtitleDiscoveryTranslate.ts`.
 */

import type { AiProviderId } from '../shared/aiProviders';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { hasTranslateConsent } from '../shared/translateProviders';
import { parseStudySubtitles, parseSubtitles } from '../shared/subtitleCues';
import type { SubtitleTranslationEnginePreference } from '../shared/subtitleDiscoveryIpc';
import {
  SUBTITLE_TRANSLATION_SYSTEM_PROMPT,
  assembleTranslatedSrt,
  buildSubtitleTranslationPrompt,
  chunkTranslationUnits,
  contextBefore,
  parseSubtitleTranslationReply,
  subtitleTranslationUnits,
  type SubtitleTranslationUnit,
} from '../shared/subtitleDiscoveryTranslate';
import { AiProviderRuntimeError, getAiProviderHealth, runCloudAiRequest } from './providerRuntime';
import {
  AI_FEATURES_OFF_MESSAGE,
  AI_CLOUD_FEATURE_OFF_MESSAGE,
  aiCloudAllowedFor,
  aiFeaturesEnabled,
  configuredAiProviderId,
} from './aiFeatureGate';
import {
  flushTranslationCache,
  getCachedTranslation,
  isTranslateAvailable,
  runLocalQwenPrompt,
  setCachedTranslation,
} from './translate';
import { readTranslateProviderSettings } from './translateRouter';

export type SubtitleTranslationEngine =
  | { kind: 'cloud'; providerId: AiProviderId; label: string }
  | { kind: 'local'; label: 'local-qwen' };

/**
 * What the engine choice depends on, injectable so the consent rules are
 * testable without a profile on disk.
 */
export interface SubtitleEngineDeps {
  /** "Use AI features" (Settings > AI). Off means no engine at all, offline included. */
  aiEnabled(): boolean;
  /** The provider chosen in Settings > AI — never "the first one with a key". */
  configuredProvider(): AiProviderId | null;
  /** A usable credential exists (a key, or a local server's URL and model). */
  providerConfigured(id: AiProviderId): boolean;
  /**
   * The user opted in to sending subtitle lines to this provider: the
   * "Subtitle translation" cloud toggle in Settings > AI, or the Translate
   * workbench's consent for the same provider.
   */
  cloudAllowed(id: AiProviderId): boolean;
  localAvailable(): boolean;
}

function translateConsentFor(id: AiProviderId): boolean {
  try {
    // The router owns the Translate settings file; this module only reads it.
    return hasTranslateConsent(readTranslateProviderSettings(), id);
  } catch {
    return false;
  }
}

/** Whether subtitle lines may go to this cloud provider right now. */
export function subtitleCloudAllowed(id: AiProviderId): boolean {
  return aiCloudAllowedFor('subtitleTranslate') || translateConsentFor(id);
}

const DEFAULT_ENGINE_DEPS: SubtitleEngineDeps = {
  aiEnabled: aiFeaturesEnabled,
  configuredProvider: configuredAiProviderId,
  providerConfigured: (id) => {
    try {
      return getAiProviderHealth(id).configured;
    } catch {
      return false;
    }
  },
  cloudAllowed: subtitleCloudAllowed,
  localAvailable: isTranslateAvailable,
};

/** Lines per request. A cloud model takes a whole scene; the 1.7B local model does best with a few. */
const CLOUD_CHUNK = 40;
const LOCAL_CHUNK = 10;
/** A track longer than this is not a subtitle track; refuse rather than spend on it. */
const MAX_UNITS = 3000;

/**
 * Cloud refusals that no retry of the next chunk can fix. The run stops on the
 * first one rather than sending the rest of the episode to the same refusal.
 */
const FATAL_CLOUD_CODES = new Set([
  'missing-credential',
  'authentication',
  'spend-budget',
  'cost-budget',
  'cloud-disabled',
  'sensitive-context',
  'ai-off',
  'unknown-provider',
]);

/**
 * The engine a translation may use now, or null when none may run.
 *
 * Nothing runs with "Use AI features" off — the offline model included. The
 * cloud is used only for the provider chosen in Settings > AI, only when it is
 * set up, and only when the user opted in to sending subtitle lines there
 * (audit F1: `auto` used to pick the first provider with a key and send whole
 * episodes with no opt-in). Otherwise `auto` falls back to the offline model.
 */
export function resolveSubtitleTranslationEngine(
  preference: SubtitleTranslationEnginePreference,
  deps: SubtitleEngineDeps = DEFAULT_ENGINE_DEPS,
): SubtitleTranslationEngine | null {
  if (!deps.aiEnabled()) return null;
  if (preference !== 'local') {
    const providerId = deps.configuredProvider();
    if (providerId && deps.cloudAllowed(providerId) && deps.providerConfigured(providerId)) {
      return { kind: 'cloud', providerId, label: providerId };
    }
  }
  if (preference !== 'cloud' && deps.localAvailable()) return { kind: 'local', label: 'local-qwen' };
  return null;
}

export interface TranslateTrackOptions {
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface TranslatedTrack {
  srt: string;
  translated: number;
  total: number;
  engine: string;
  /** Why the run stopped early, when it did. */
  stoppedBy?: string;
}

/**
 * The subtitle namespace of the shared translation cache, versioned.
 *
 * v1 (`<lang>#subtitle`) stored EVERY engine's lines under the offline model's
 * key, so a cloud translation was served later as "offline" — after the user
 * withdrew the cloud opt-in, or switched provider. Those entries cannot be told
 * apart from genuine offline ones (the key is a hash), so the namespace moved:
 * v1 entries are never read again, whichever engine wrote them.
 */
export const SUBTITLE_TRANSLATION_CACHE_VERSION = 2;

export function subtitleCacheSource(source: string): string {
  return `${source}#subtitle.v${SUBTITLE_TRANSLATION_CACHE_VERSION}`;
}

/** Whose answers a run may read and write: the provider id for the cloud, `local` for the offline model. */
export function subtitleCacheScope(engine: SubtitleTranslationEngine): string {
  return engine.kind === 'cloud' ? engine.providerId : 'local';
}

async function askEngine(engine: SubtitleTranslationEngine, prompt: string, lines: number): Promise<string> {
  // Re-checked per chunk, at send time: a run that started before the user
  // switched AI off, or withdrew the opt-in, stops at the next chunk instead of
  // finishing the episode.
  if (!aiFeaturesEnabled()) throw new AiProviderRuntimeError(AI_FEATURES_OFF_MESSAGE, 'ai-off');
  if (engine.kind === 'cloud') {
    if (!subtitleCloudAllowed(engine.providerId)) {
      throw new AiProviderRuntimeError(AI_CLOUD_FEATURE_OFF_MESSAGE, 'cloud-disabled');
    }
    const result = await runCloudAiRequest({
      providerId: engine.providerId,
      prompt,
      systemPrompt: SUBTITLE_TRANSLATION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: Math.min(8192, 256 + lines * 120),
      temperature: 0.2,
      retryAttempts: 2,
      timeoutMs: 120_000,
    });
    return result.text;
  }
  return runLocalQwenPrompt(prompt, { maxTokens: Math.min(2048, 128 + lines * 90), timeoutMs: 120_000 });
}

/**
 * Translates `raw` (any format the app parses) from `source` into `target`.
 *
 * Returns null when the track holds nothing translatable. A returned track may be
 * partial — the caller decides with `translationIsUsable` whether it is worth
 * keeping.
 */
export async function translateSubtitleTrack(
  raw: string,
  source: string,
  target: string,
  engine: SubtitleTranslationEngine,
  options: TranslateTrackOptions = {},
): Promise<TranslatedTrack | null> {
  // The study split for a Japanese source: a dual-language `.ass` carries a whole
  // Chinese track beside the Japanese one, and translating both into one English
  // line would print every line twice.
  const cues = source.toLowerCase().startsWith('ja') ? parseStudySubtitles(raw).cues : parseSubtitles(raw);
  const units = subtitleTranslationUnits(cues);
  if (!units.length || units.length > MAX_UNITS) return null;

  // Namespaced so a subtitle line never borrows a glossary entry's "meaning only"
  // answer for the same text, and the reverse; scoped by engine so a cloud line
  // is never served later as the offline model's, nor one provider's as another's.
  const cacheSource = subtitleCacheSource(source);
  const scope = subtitleCacheScope(engine);
  const translations = new Map<string, string>();
  const pending: SubtitleTranslationUnit[] = [];
  for (const unit of units) {
    const hit = getCachedTranslation(unit.text, cacheSource, target, scope);
    if (hit && isValidCrossLangTranslation(source, target, unit.text, hit)) translations.set(unit.id, hit);
    else pending.push(unit);
  }

  let stoppedBy: string | undefined;
  try {
    for (const chunk of chunkTranslationUnits(pending, engine.kind === 'cloud' ? CLOUD_CHUNK : LOCAL_CHUNK)) {
      if (options.isCancelled?.()) {
        stoppedBy = 'cancelled';
        break;
      }
      let reply = '';
      try {
        reply = await askEngine(
          engine,
          buildSubtitleTranslationPrompt(chunk, source, target, contextBefore(units, chunk)),
          chunk.length,
        );
      } catch (error) {
        if (error instanceof AiProviderRuntimeError && FATAL_CLOUD_CODES.has(error.code)) {
          stoppedBy = error.code;
          break;
        }
        // One bad chunk (a timeout, a malformed reply) costs its lines, not the track.
        continue;
      }
      const parsed = parseSubtitleTranslationReply(reply, chunk);
      for (const unit of chunk) {
        const text = parsed.get(unit.id);
        if (!text || !isValidCrossLangTranslation(source, target, unit.text, text)) continue;
        translations.set(unit.id, text);
        setCachedTranslation(unit.text, cacheSource, target, text, scope);
      }
      options.onProgress?.(translations.size, units.length);
    }
  } finally {
    flushTranslationCache();
  }

  const assembled = assembleTranslatedSrt(units, translations);
  return { ...assembled, engine: engine.label, ...(stoppedBy ? { stoppedBy } : {}) };
}
