// Cloud-LLM linguistic analysis for the Translate view (formality variants,
// particle notes, Russian declension, Chinese measure words). One combined
// call per analyzed sentence, cached on disk next to the translation cache.
// Mirrors translate.ts's cache shape and registerXIpc() structure.
import { app, ipcMain } from 'electron';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import crypto from 'node:crypto';
import type { AiProviderId } from '../shared/mining';
import {
  TRANSLATE_ANALYSIS_PROMPT_VERSION,
  analysisCompleteness,
  buildAnalysisPrompt,
  buildAnalysisSchema,
  computeAnalysisFlags,
  parseAnalysisResponse,
  type TranslateAnalysisResult,
  type TranslateAnalyzeRequest,
  type TranslateAnalyzeResponse,
} from '../shared/translateAnalysisCore';
import { aiErrorCodeOf } from '../shared/aiErrorCodes';
import { hasTranslateConsent, isTranslateProviderId } from '../shared/translateProviders';
import { callAiProvider } from './aiProviderClient';
import { getAiProviderHealth } from './providerRuntime';
import { getConfiguredAiProvider } from './mining';
import { AI_FEATURES_OFF_MESSAGE, aiFeaturesEnabled } from './aiFeatureGate';
import { readTranslateProviderSettings } from './translateRouter';

interface AnalysisCacheFile {
  entries: Record<string, TranslateAnalysisResult>;
}

/** Bounded, so a long translating session cannot grow the file without limit. */
const MAX_CACHE_ENTRIES = 1000;

let analysisCache: AnalysisCacheFile | null = null;
let analysisCacheDirty = false;

function analysisCachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'translation-analysis-cache.json');
}

function loadAnalysisCache(): AnalysisCacheFile {
  if (analysisCache) return analysisCache;
  try {
    analysisCache = readJsonSync<AnalysisCacheFile>(analysisCachePath(), () => ({ entries: {} }), {
      validate: (v) => !!v && typeof v === 'object' && !!(v as AnalysisCacheFile).entries,
    });
  } catch {
    analysisCache = { entries: {} };
  }
  return analysisCache;
}

function flushAnalysisCache(): void {
  if (!analysisCache || !analysisCacheDirty) return;
  try {
    writeJsonAtomicSync(analysisCachePath(), analysisCache, { space: 0, backup: false });
    analysisCacheDirty = false;
  } catch {
    /* best-effort cache; ignore write failures */
  }
}

const norm = (text: string): string => text.trim().normalize('NFKC');

/**
 * Every prompt input is in the key. It used to hold only the translation, so
 * two different source sentences that translated to the same English ("Yes.")
 * shared one analysis — particle notes for the wrong Japanese sentence — and a
 * prompt change could never reach a sentence analyzed before it.
 *
 * `modelKey` is the provider AND its model (`analysisModelKey`): it used to be
 * the provider id alone, so switching OpenAI from one model to another, or
 * pointing the local server at a different model, kept serving the old model's
 * analyses as if the new one had written them.
 */
export function analysisCacheKey(req: TranslateAnalyzeRequest, modelKey: string): string {
  return crypto
    .createHash('sha256')
    .update([
      `v${TRANSLATE_ANALYSIS_PROMPT_VERSION}`,
      modelKey,
      req.source,
      req.target,
      req.explainIn || 'en',
      norm(req.sourceText),
      norm(req.translatedText),
      (req.jaParticleTokens ?? []).join('\u0001'),
    ].join('\0'))
    .digest('hex')
    .slice(0, 32);
}

function setCachedAnalysis(key: string, result: TranslateAnalysisResult): void {
  const entries = loadAnalysisCache().entries;
  delete entries[key];
  entries[key] = result;
  const keys = Object.keys(entries);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) delete entries[old];
  analysisCacheDirty = true;
}

/** Strings only, bounded: the request crosses from the renderer. */
function normalizeRequest(raw: unknown): TranslateAnalyzeRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const sourceText = str(r.sourceText, 4000);
  const translatedText = str(r.translatedText, 4000);
  if (!sourceText.trim() || !translatedText.trim()) return null;
  const tokens = Array.isArray(r.jaParticleTokens)
    ? r.jaParticleTokens.filter((t): t is string => typeof t === 'string').slice(0, 64).map((t) => t.slice(0, 16))
    : undefined;
  return {
    sourceText,
    translatedText,
    source: str(r.source, 8),
    target: str(r.target, 8),
    ...(tokens ? { jaParticleTokens: tokens } : {}),
    ...(typeof r.explainIn === 'string' && r.explainIn ? { explainIn: str(r.explainIn, 8) } : {}),
    ...(r.refresh === true ? { refresh: true } : {}),
  };
}

export interface TranslateAnalysisDeps {
  call?: typeof callAiProvider;
  provider?: () => { providerId: AiProviderId; apiKey: string };
  consented?: (providerId: AiProviderId) => boolean;
  enabled?: () => boolean;
  /** The model a provider id resolves to right now (cache key). */
  modelOf?: (providerId: AiProviderId) => string;
}

function providerModel(providerId: AiProviderId): string {
  try {
    return getAiProviderHealth(providerId).model;
  } catch {
    return '';
  }
}

/** `provider:model`, the same shape `aiStudyAssist.ts` keys its cache on. */
export function analysisModelKey(providerId: AiProviderId, model: string): string {
  return `${providerId}:${model.trim()}`;
}

function translateConsentFor(providerId: AiProviderId): boolean {
  try {
    return isTranslateProviderId(providerId) && hasTranslateConsent(readTranslateProviderSettings(), providerId);
  } catch {
    return false;
  }
}

/**
 * One analysis. Gated in this order, each before anything is sent: the "Use AI
 * features" switch, a key, and the Translate consent for that provider — the
 * same opt-in the Translate workbench asks before it sends a passage. The panel
 * used to run this automatically under every translation, offline ones
 * included, and so sent the sentence to a provider the user had never allowed.
 */
export async function analyzeTranslation(
  input: unknown,
  deps: TranslateAnalysisDeps = {},
): Promise<TranslateAnalyzeResponse> {
  if (!(deps.enabled ?? aiFeaturesEnabled)()) {
    return { ok: false, aiOff: true, code: 'ai-off', error: AI_FEATURES_OFF_MESSAGE };
  }
  const req = normalizeRequest(input);
  if (!req) return { ok: false, code: 'empty-input', error: 'Nothing to analyze.' };
  const { providerId, apiKey } = (deps.provider ?? getConfiguredAiProvider)();
  // Cloud-only by design: this breakdown needs a provider's JSON mode.
  if (!apiKey) return { ok: false, needsKey: true, code: 'no-key', error: 'No API key configured.' };
  if (!(deps.consented ?? translateConsentFor)(providerId)) {
    return { ok: false, needsConsent: true, code: 'consent', error: 'The provider is not allowed to receive translate text.' };
  }
  const flags = computeAnalysisFlags(req.source, req.target);
  const key = analysisCacheKey(req, analysisModelKey(providerId, (deps.modelOf ?? providerModel)(providerId)));
  if (!req.refresh) {
    const cached = loadAnalysisCache().entries[key];
    if (cached) return { ok: true, result: cached, cached: true };
  }
  try {
    const raw = await (deps.call ?? callAiProvider)(providerId, apiKey, buildAnalysisPrompt(req, flags), buildAnalysisSchema(flags), {
      itemCount: 6,
      timeoutMs: 45_000,
    });
    // Throws on a reply that is not a JSON object: nothing is cached for it.
    const result = parseAnalysisResponse(raw, flags);
    const completeness = analysisCompleteness(result, flags, req);
    if (completeness === 'empty') return { ok: false, code: 'invalid', error: 'The AI returned an empty analysis.' };
    // Only a complete analysis is cached; a partial one is shown and asked for again next time.
    if (completeness === 'complete') {
      setCachedAnalysis(key, result);
      flushAnalysisCache();
      return { ok: true, result };
    }
    return { ok: true, result, partial: true };
  } catch (err) {
    return { ok: false, code: aiErrorCodeOf(err), error: err instanceof Error ? err.message : String(err) };
  }
}

/** Test seam: forget the in-memory cache. */
export function resetTranslateAnalysisCacheForTests(): void {
  analysisCache = null;
  analysisCacheDirty = false;
}

export function registerTranslateAnalysisIpc(): void {
  ipcMain.handle('translate:analyze', (_e, req: unknown): Promise<TranslateAnalyzeResponse> => analyzeTranslation(req));
}
