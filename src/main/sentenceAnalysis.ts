// Whole-sentence AI annotation behind the "AI OCR" mode of the Reading
// Lens and the browser extension. One call per sentence, cached on disk next to
// the translation-analysis cache. Mirrors translateAnalysis.ts's cache shape and
// registerXIpc() structure; the HTTP surface in extensionServer.ts calls
// analyzeSentence() directly so both entry points share the cache.
import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AiProviderId } from '../shared/mining';
import {
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
import { AI_FEATURES_OFF_MESSAGE, aiFeaturesEnabled } from './aiFeatureGate';

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
  /** True when the result came from the on-disk cache (no cloud/local call was made). */
  cached?: boolean;
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
  try {
    prefsCache = normalizeAnalysisPrefs(JSON.parse(fs.readFileSync(prefsPath(), 'utf-8')));
  } catch {
    prefsCache = normalizeAnalysisPrefs({});
  }
  return prefsCache;
}

export function writeAnalysisPrefs(raw: unknown): SentenceAnalysisPrefs {
  const next = normalizeAnalysisPrefs(raw);
  prefsCache = next;
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    const tmp = `${prefsPath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
    fs.renameSync(tmp, prefsPath());
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
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf-8')) as AnalysisCacheFile;
    cache = parsed?.entries ? parsed : { entries: {} };
  } catch {
    cache = { entries: {} };
  }
  return cache;
}

function flushCache(): void {
  if (!cache || !cacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    const tmp = `${cachePath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf-8');
    fs.renameSync(tmp, cachePath());
    cacheDirty = false;
  } catch {
    /* best-effort cache; ignore write failures */
  }
}

// Provider/engine, language and the preference fingerprint are all folded in: the
// same sentence explained in Russian, or at "brief" depth with examples off, is a
// different artifact, and serving the wrong one makes the settings look broken.
function cacheKey(
  sentence: string,
  lang: string,
  providerKey: string,
  prefsFingerprint: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${providerKey}\0${lang}\0${prefsFingerprint}\0${normalizeAnalysisText(sentence)}`)
    .digest('hex')
    .slice(0, 24);
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
export async function analyzeSentence(
  req: SentenceAnalyzeRequest,
): Promise<SentenceAnalyzeResponse> {
  // Preferences always come from the store, never from the caller: the
  // extension's HTTP route is reachable by anything on localhost, and a request
  // that could pick its own prompt would bypass the user's settings entirely.
  const prefs = readAnalysisPrefs();
  const sentence = normalizeAnalysisText(req.text);
  if (!isAnalyzableText(sentence)) {
    return { ok: false, error: 'Nothing to analyze — select a sentence first.', prefs };
  }
  const lang = String(req.lang || 'ja').slice(0, 8);
  const explainIn = resolveExplainLang(prefs, String(req.explainIn || 'en').slice(0, 8));
  if (!aiFeaturesEnabled()) {
    return { ok: false, aiOff: true, error: AI_FEATURES_OFF_MESSAGE, prefs };
  }
  const engine = getConfiguredAiEngine();
  const { providerId, apiKey } = getConfiguredAiProvider();

  if (engine === 'cloud' && !apiKey) {
    return {
      ok: false,
      needsKey: true,
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
        error: 'The offline AI model is not installed. Install it in Settings > AI, or switch to Cloud there.',
        prefs,
      };
    }
  }

  const providerKey: string = engine === 'local-qwen' ? 'local-qwen' : (providerId as AiProviderId);
  const key = cacheKey(sentence, lang, providerKey, analysisPrefsFingerprint(prefs, explainIn));
  const cached = loadCache().entries[key];
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
        },
      );
    } else {
      const schema = buildSentenceAnalysisSchema(prefs);
      raw = await callAiProvider(providerId, apiKey, prompt, schema, {
        itemCount: analysisItemCount(sentence),
        timeoutMs: 60_000,
      });
    }
    const result = parseSentenceAnalysis(raw, sentence);
    // Only successful parses are cached — network, auth and timeout failures
    // stay retryable, matching translateAnalysis.ts.
    const entries = loadCache().entries;
    entries[key] = result;
    trimCache(entries);
    cacheDirty = true;
    flushCache();
    return { ok: true, result, prefs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), prefs };
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
