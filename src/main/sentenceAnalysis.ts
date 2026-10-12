// Whole-sentence AI annotation behind the "AI OCR" mode of the Reading
// Lens and the browser extension. One call per sentence, cached on disk next to
// the translation-analysis cache. Mirrors translateAnalysis.ts's cache shape and
// registerXIpc() structure; the HTTP surface in extensionServer.ts calls
// analyzeSentence() directly so both entry points share the cache.
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import crypto from 'node:crypto';
import type { AiProviderId } from '../shared/mining';
import { aiErrorCodeOf, type AiErrorCode } from '../shared/aiErrorCodes';
import {
  SENTENCE_ANALYSIS_PROMPT_VERSION,
  analysisItemCount,
  buildSentenceAnalysisPrompt,
  buildSentenceAnalysisSchema,
  isAnalyzableText,
  normalizeAnalysisText,
  parseSentenceAnalysis,
  type SentenceAnalysisResult,
  type SentenceAnalyzeRequest,
} from '../shared/sentenceAnalysisCore';
import {
  analysisPrefsFingerprint,
  normalizeAnalysisPrefs,
  resolveExplainLang,
  type SentenceAnalysisPrefs,
} from '../shared/sentenceAnalysisPrefs';
import type { AnalysisSnapshot } from '../shared/analysisSnapshot';
import { callAiProvider } from './aiProviderClient';
import { getConfiguredAiEngine, getConfiguredAiProvider } from './mining';
import type { AiCloudFeatureId } from '../shared/aiSetup';
import {
  AI_CLOUD_FEATURE_OFF_MESSAGE,
  AI_FEATURES_OFF_MESSAGE,
  aiCloudAllowedFor,
  aiFeaturesEnabled,
} from './aiFeatureGate';

export interface SentenceAnalyzeResponse {
  ok: boolean;
  result?: SentenceAnalysisResult;
  error?: string;
  /** True when the failure is "no API key" — callers show a setup link, not a retry. */
  needsKey?: boolean;
  /** True when local-qwen is selected but the GGUF file is missing. */
  needsLocalModel?: boolean;
  /** True when "Use AI features" is off in Settings > AI; the surface hides itself. */
  aiOff?: boolean;
  /** True when the caller named a cloud opt-in (`AnalyzeSentenceOptions.feature`) and it is off. */
  needsConsent?: boolean;
  /** True when the result came from the on-disk cache (no cloud/local call was made). */
  cached?: boolean;
  /** Why it failed, as a code the surface says in the UI language (`error` is English, for logs). */
  code?: AiErrorCode;
  /**
   * The preferences the analysis was produced under. Echoed so the caller does
   * not have to fetch them separately to know which sections to render, or
   * whether to auto-mine and auto-snapshot.
   */
  prefs?: SentenceAnalysisPrefs;
}

// ---- preferences -----------------------------------------------------------
//
// Stored in the main process rather than renderer localStorage because three
// surfaces need the same copy: the Reading Lens window, the Settings window,
// and the extension's HTTP route (which has no renderer at all). A single
// owner also means the extension cannot be handed stale preferences.

let prefsCache: SentenceAnalysisPrefs | null = null;

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'mining', 'sentence-analysis-prefs.json');
}

export function readAnalysisPrefs(): SentenceAnalysisPrefs {
  if (prefsCache) return prefsCache;
  prefsCache = normalizeAnalysisPrefs(
    readJsonSync<unknown>(prefsPath(), {}, { validate: (v) => !!v && typeof v === 'object' }),
  );
  return prefsCache;
}

export function writeAnalysisPrefs(raw: unknown): SentenceAnalysisPrefs {
  const next = normalizeAnalysisPrefs(raw);
  prefsCache = next;
  try {
    writeJsonAtomicSync(prefsPath(), next);
  } catch {
    /* the in-memory copy still applies for this session */
  }
  // Every open window renders from these, including the Lens overlay, which is
  // a separate BrowserWindow and would otherwise keep the old sections until
  // it was reopened.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('sentence:prefsChanged', next);
  }
  return next;
}

interface AnalysisCacheFile {
  entries: Record<string, SentenceAnalysisResult>;
}

/** Cap the file so a heavy OCR session cannot grow it without bound. */
const MAX_CACHE_ENTRIES = 1500;

let cache: AnalysisCacheFile | null = null;
let cacheDirty = false;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'sentence-analysis-cache.json');
}

function loadCache(): AnalysisCacheFile {
  if (cache) return cache;
  cache = readJsonSync<AnalysisCacheFile>(cachePath(), () => ({ entries: {} }), {
    validate: (v) => !!v && typeof v === 'object' && !!(v as AnalysisCacheFile).entries,
  });
  return cache;
}

function flushCache(): void {
  if (!cache || !cacheDirty) return;
  try {
    writeJsonAtomicSync(cachePath(), cache, { space: 0, backup: false });
    cacheDirty = false;
  } catch {
    /* best-effort cache; ignore write failures */
  }
}

// Provider/engine, language and the preference fingerprint are all folded in: the
// same sentence explained in Russian, or at "brief" depth with examples off, is a
// different artifact, and serving the wrong one makes the settings look broken.
// So are the prompt version and every other prompt input — the surrounding
// context and the learner level — which the key used to leave out, so a
// sentence first analyzed without context was served that answer forever after.
export function sentenceAnalysisCacheKey(
  sentence: string,
  lang: string,
  providerKey: string,
  prefsFingerprint: string,
  context = '',
  learnerLevel = '',
): string {
  return crypto
    .createHash('sha256')
    .update([
      `v${SENTENCE_ANALYSIS_PROMPT_VERSION}`,
      providerKey,
      lang,
      prefsFingerprint,
      normalizeAnalysisText(sentence),
      normalizeAnalysisText(context),
      learnerLevel.trim(),
    ].join('\0'))
    .digest('hex')
    .slice(0, 32);
}

function trimCache(entries: Record<string, SentenceAnalysisResult>): void {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  // Insertion order is the only recency signal a plain object carries, and it is
  // good enough here — the oldest analyses are the least likely to be re-opened.
  for (const key of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) delete entries[key];
}

/**
 * Analyze one sentence, answering from the disk cache when possible.
 *
 * Shared by the IPC handler (Reading Lens, in-app callers) and the extension's
 * HTTP route, so an OCR in the browser and the same line read by the Lens hit
 * the same cached analysis.
 */
export interface AnalyzeSentenceOptions {
  /** Aborts the model call (the extension's Cancel); the reply is then `code: 'cancelled'`. */
  signal?: AbortSignal;
  /** Overrides the configured engine: the extension's breakdown prefers the offline model. */
  engine?: 'cloud' | 'local-qwen';
  /**
   * The Settings > AI cloud opt-in this call is checked against. Without one the
   * call behaves as it always has (the Reading Lens and the in-app callers).
   */
  feature?: AiCloudFeatureId;
}

export async function analyzeSentence(
  req: SentenceAnalyzeRequest,
  options: AnalyzeSentenceOptions = {},
): Promise<SentenceAnalyzeResponse> {
  // Preferences always come from the store, never from the caller: the
  // extension's HTTP route is reachable by anything on localhost, and a request
  // that could pick its own prompt would bypass the user's settings entirely.
  const prefs = readAnalysisPrefs();
  const sentence = normalizeAnalysisText(req.text);
  if (!isAnalyzableText(sentence)) {
    return { ok: false, code: 'empty-input', error: 'Nothing to analyze — select a sentence first.', prefs };
  }
  const lang = String(req.lang || 'ja').slice(0, 8);
  const explainIn = resolveExplainLang(prefs, String(req.explainIn || 'en').slice(0, 8));
  if (!aiFeaturesEnabled()) {
    return { ok: false, aiOff: true, code: 'ai-off', error: AI_FEATURES_OFF_MESSAGE, prefs };
  }
  const engine = options.engine ?? getConfiguredAiEngine();
  const { providerId, apiKey } = getConfiguredAiProvider();

  if (engine === 'cloud' && options.feature && !aiCloudAllowedFor(options.feature)) {
    return { ok: false, needsConsent: true, code: 'consent', error: AI_CLOUD_FEATURE_OFF_MESSAGE, prefs };
  }
  if (engine === 'cloud' && !apiKey) {
    return {
      ok: false,
      needsKey: true,
      code: 'no-key',
      error: 'No AI API key configured. Add one in Settings > AI.',
      prefs,
    };
  }
  if (engine === 'local-qwen') {
    const { isTranslateAvailable } = await import('./translate');
    if (!isTranslateAvailable()) {
      return {
        ok: false,
        needsLocalModel: true,
        code: 'no-local-model',
        error: 'The offline AI model is not installed. Install it in Settings > AI, or switch to Cloud there.',
        prefs,
      };
    }
  }

  const providerKey: string = engine === 'local-qwen' ? 'local-qwen' : (providerId as AiProviderId);
  const context = typeof req.context === 'string' ? req.context.slice(0, 2000) : '';
  const learnerLevel = typeof req.learnerLevel === 'string' && req.learnerLevel
    ? req.learnerLevel.slice(0, 16)
    : prefs.learnerLevel ?? '';
  const key = sentenceAnalysisCacheKey(
    sentence, lang, providerKey, analysisPrefsFingerprint(prefs, explainIn), context, learnerLevel,
  );
  // "Re-analyze" sends `refresh`: it used to answer from this cache every time,
  // so the button did nothing once a sentence had been analyzed.
  const cached = req.refresh === true ? undefined : loadCache().entries[key];
  if (cached) return { ok: true, result: cached, cached: true, prefs };

  try {
    const prompt = buildSentenceAnalysisPrompt({ ...req, text: sentence, lang, explainIn }, prefs);
    let raw: string;
    if (engine === 'local-qwen') {
      const { runLocalQwenPrompt } = await import('./translate');
      raw = await runLocalQwenPrompt(
        `${prompt}\n\nRespond with a single JSON object only — no markdown fences, no commentary.`,
        {
          maxTokens: Math.min(8192, Math.max(2048, analysisItemCount(sentence) * 450)),
          timeoutMs: 120_000,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
    } else {
      const schema = buildSentenceAnalysisSchema(prefs);
      raw = await callAiProvider(providerId, apiKey, prompt, schema, {
        itemCount: analysisItemCount(sentence),
        timeoutMs: 60_000,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.feature ? { feature: options.feature } : {}),
      });
    }
    if (options.signal?.aborted) return { ok: false, code: 'cancelled', prefs };
    // Throws on malformed JSON and on an analysis with neither a translation nor
    // an annotation, so neither is ever cached.
    const result = parseSentenceAnalysis(raw, sentence);
    // Only successful parses are cached — network, auth and timeout failures
    // stay retryable, matching translateAnalysis.ts. Re-set rather than
    // overwritten in place, so a refreshed entry moves to the young end and
    // `trimCache` evicts the least recently written.
    const entries = loadCache().entries;
    delete entries[key];
    entries[key] = result;
    trimCache(entries);
    cacheDirty = true;
    flushCache();
    return { ok: true, result, prefs };
  } catch (err) {
    if (options.signal?.aborted) return { ok: false, code: 'cancelled', prefs };
    return { ok: false, code: aiErrorCodeOf(err), error: err instanceof Error ? err.message : String(err), prefs };
  }
}

/**
 * Hand a snapshot to whichever window owns the notebook.
 *
 * The notebook timeline lives in renderer storage, so the extension — which
 * reaches the app over HTTP and has no renderer of its own — cannot write to it
 * directly. Broadcasting is how every other extension-originated record already
 * gets in (see `extension:translation-result`), and it keeps the notebook's
 * single writer in the renderer.
 */
export function broadcastSnapshot(snapshot: AnalysisSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('sentence:snapshot', snapshot);
  }
}

export function registerSentenceAnalysisIpc(): void {
  ipcMain.handle('sentence:analyze', (_e, req: SentenceAnalyzeRequest) => analyzeSentence(req));
  ipcMain.handle('sentence:getPrefs', (): SentenceAnalysisPrefs => readAnalysisPrefs());
  ipcMain.handle(
    'sentence:setPrefs',
    (_e, prefs: unknown): SentenceAnalysisPrefs => writeAnalysisPrefs(prefs),
  );
}
