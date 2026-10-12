import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  MEDIA_STUDY_ASSISTANT_PROMPT_VERSION,
  buildMediaStudyAssistantPrompt,
  isCompleteMediaStudyAssistantResult,
  MEDIA_STUDY_ASSISTANT_SCHEMA,
  normalizeMediaStudyAssistantRequest,
  parseMediaStudyAssistantResult,
  type MediaStudyAssistantRequest,
  type MediaStudyAssistantResult,
} from '../shared/mediaStudyAssistant';
import { aiErrorCodeOf, type AiErrorCode } from '../shared/aiErrorCodes';
import type { AiProviderId } from '../shared/aiProviders';
import { callAiProvider } from './aiProviderClient';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { getConfiguredAiProvider } from './mining';
import {
  AI_CLOUD_FEATURE_OFF_MESSAGE,
  AI_FEATURES_OFF_MESSAGE,
  aiCloudAllowedFor,
  aiFeaturesEnabled,
} from './aiFeatureGate';
import { getAiProviderHealth } from './providerRuntime';

interface CacheFile {
  entries: Record<string, MediaStudyAssistantResult>;
}

/**
 * The persistent cache used to grow without limit. Bounded now, and kept in
 * least-recently-used order: a hit is moved to the young end, and the oldest
 * entries go first.
 */
const MAX_CACHE_ENTRIES = 400;

let cache: CacheFile | null = null;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'media-study-assistant-cache.json');
}

function loadCache(): CacheFile {
  if (cache) return cache;
  try {
    cache = readJsonSync<CacheFile>(cachePath(), () => ({ entries: {} }), {
      validate: (v) => !!v && typeof v === 'object' && !!(v as CacheFile).entries,
    });
  } catch {
    cache = { entries: {} };
  }
  return cache;
}

function saveCache(): void {
  if (!cache) return;
  try {
    writeJsonAtomicSync(cachePath(), cache, { space: 0, backup: false });
  } catch {
    // Cache persistence is optional; the result still returns to the caller.
  }
}

/**
 * The provider id names the model here (`gemini-2.5-flash`, `deepseek-v4-pro`),
 * and the prompt version is in the key, so a model or prompt change is never
 * answered with what a different one said.
 */
export function mediaStudyAssistantCacheKey(request: MediaStudyAssistantRequest, providerId: AiProviderId): string {
  return crypto.createHash('sha256')
    .update([
      `v${MEDIA_STUDY_ASSISTANT_PROMPT_VERSION}`,
      providerId,
      request.mode,
      request.text,
      request.context ?? '',
      request.jlptLevel ?? '',
      // Every prompt input is in the key: the same line asked by a zh learner, or
      // answered in another UI language, is a different answer.
      request.studyLang ?? 'ja',
      request.answerLang ?? 'en',
    ].join('\0'))
    .digest('hex')
    .slice(0, 32);
}

function remember(key: string, result: MediaStudyAssistantResult): void {
  const entries = loadCache().entries;
  delete entries[key];
  entries[key] = result;
  const keys = Object.keys(entries);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) delete entries[old];
  saveCache();
}

function recall(key: string): MediaStudyAssistantResult | undefined {
  const entries = loadCache().entries;
  const hit = entries[key];
  if (!hit) return undefined;
  // Recency only in memory: written out with the next store, not on every read.
  delete entries[key];
  entries[key] = hit;
  return hit;
}

export interface MediaStudyAssistResponse {
  ok: boolean;
  result?: MediaStudyAssistantResult;
  /** English, for logs. The panel shows `code`. */
  error?: string;
  code?: AiErrorCode;
  cached?: boolean;
  aiOff?: boolean;
  needsKey?: boolean;
  /** The answer lacks what its mode asked for: shown, not cached. */
  partial?: boolean;
}

export interface MediaStudyAssistDeps {
  call?: typeof callAiProvider;
  provider?: () => { providerId: AiProviderId; apiKey: string };
  enabled?: () => boolean;
  /** The assistant's cloud opt-in (Settings > AI). */
  cloudAllowed?: () => boolean;
  /**
   * Whether the provider can be called at all. A keyless local OpenAI-compatible
   * server (Ollama, LM Studio) has no key and is still configured by its URL, so
   * "no key" alone used to block it.
   */
  configured?: (providerId: AiProviderId, apiKey: string) => boolean;
}

function providerConfigured(providerId: AiProviderId, apiKey: string): boolean {
  if (apiKey) return true;
  try {
    return getAiProviderHealth(providerId).configured;
  } catch {
    return false;
  }
}

export async function assistMediaStudy(input: unknown, deps: MediaStudyAssistDeps = {}): Promise<MediaStudyAssistResponse> {
  if (!(deps.enabled ?? aiFeaturesEnabled)()) return { ok: false, aiOff: true, code: 'ai-off', error: AI_FEATURES_OFF_MESSAGE };
  const request = normalizeMediaStudyAssistantRequest(input);
  if (!request) return { ok: false, code: 'empty-input', error: 'A sentence is required.' };
  if (!(deps.cloudAllowed ?? (() => aiCloudAllowedFor('mediaAssistant')))()) {
    return { ok: false, code: 'consent', error: AI_CLOUD_FEATURE_OFF_MESSAGE };
  }
  const { providerId, apiKey } = (deps.provider ?? getConfiguredAiProvider)();
  if (!(deps.configured ?? providerConfigured)(providerId, apiKey)) {
    return { ok: false, needsKey: true, code: 'no-key', error: 'Add an AI provider key in Settings > AI to use this optional feature.' };
  }
  const key = mediaStudyAssistantCacheKey(request, providerId);
  if (!request.refresh) {
    const existing = recall(key);
    if (existing) return { ok: true, result: existing, cached: true };
  }
  try {
    const raw = await (deps.call ?? callAiProvider)(
      providerId,
      apiKey,
      buildMediaStudyAssistantPrompt(request),
      MEDIA_STUDY_ASSISTANT_SCHEMA,
      { itemCount: 8, timeoutMs: 60_000, feature: 'mediaAssistant' },
    );
    const result = parseMediaStudyAssistantResult(raw, request.mode);
    if (!isCompleteMediaStudyAssistantResult(result)) {
      if (!result.summary && !result.translation && !result.grammar.length && !result.vocabulary.length
        && !result.examples.length && !result.notes.length && !result.simplifiedJapanese) {
        return { ok: false, code: 'invalid', error: 'The AI returned an empty answer.' };
      }
      return { ok: true, result, cached: false, partial: true };
    }
    remember(key, result);
    return { ok: true, result, cached: false };
  } catch (error) {
    return { ok: false, code: aiErrorCodeOf(error), error: error instanceof Error ? error.message : String(error) };
  }
}

/** Test seam: forget the in-memory cache. */
export function resetMediaStudyAssistantCacheForTests(): void {
  cache = null;
}

export function registerMediaStudyAssistantIpc(): void {
  ipcMain.handle('media-study:assist', (_event, input: unknown): Promise<MediaStudyAssistResponse> => assistMediaStudy(input));
}
