// Cloud-LLM linguistic analysis for the Translate view (formality variants,
// particle notes, Russian declension, Chinese measure words). One combined
// call per analyzed sentence, cached on disk next to the translation cache.
// Mirrors translate.ts's cache shape and registerXIpc() structure.
import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AiProviderId } from '../shared/mining';
import {
  buildAnalysisPrompt,
  buildAnalysisSchema,
  computeAnalysisFlags,
  parseAnalysisResponse,
  type TranslateAnalysisResult,
  type TranslateAnalyzeRequest,
} from '../shared/translateAnalysisCore';
import { callAiProvider } from './aiProviderClient';
import { getConfiguredAiProvider } from './mining';

interface AnalysisCacheFile {
  entries: Record<string, TranslateAnalysisResult>;
}

let analysisCache: AnalysisCacheFile | null = null;
let analysisCacheDirty = false;

function analysisCachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'translation-analysis-cache.json');
}

function loadAnalysisCache(): AnalysisCacheFile {
  if (analysisCache) return analysisCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(analysisCachePath(), 'utf-8')) as AnalysisCacheFile;
    analysisCache = parsed?.entries ? parsed : { entries: {} };
  } catch {
    analysisCache = { entries: {} };
  }
  return analysisCache;
}

function flushAnalysisCache(): void {
  if (!analysisCache || !analysisCacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(analysisCachePath()), { recursive: true });
    const tmp = `${analysisCachePath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(analysisCache), 'utf-8');
    fs.renameSync(tmp, analysisCachePath());
    analysisCacheDirty = false;
  } catch {
    /* best-effort cache; ignore write failures */
  }
}

// Same recipe as translationCacheKey in translate.ts, with the provider folded
// in — a different provider can produce a differently-shaped but valid result.
function analysisCacheKey(
  translatedText: string,
  source: string,
  target: string,
  providerId: AiProviderId,
): string {
  const normalized = translatedText.trim().normalize('NFKC');
  return crypto
    .createHash('sha256')
    .update(`${providerId}\0${source}\0${target}\0${normalized}`)
    .digest('hex')
    .slice(0, 24);
}

function getCachedAnalysis(
  translatedText: string,
  source: string,
  target: string,
  providerId: AiProviderId,
): TranslateAnalysisResult | undefined {
  return loadAnalysisCache().entries[analysisCacheKey(translatedText, source, target, providerId)];
}

function setCachedAnalysis(
  translatedText: string,
  source: string,
  target: string,
  providerId: AiProviderId,
  result: TranslateAnalysisResult,
): void {
  loadAnalysisCache().entries[analysisCacheKey(translatedText, source, target, providerId)] = result;
  analysisCacheDirty = true;
}

export function registerTranslateAnalysisIpc(): void {
  ipcMain.handle(
    'translate:analyze',
    async (
      _e,
      req: TranslateAnalyzeRequest,
    ): Promise<{ ok: boolean; result?: TranslateAnalysisResult; error?: string }> => {
      const { providerId, apiKey } = getConfiguredAiProvider();
      if (!apiKey) return { ok: false, error: 'No API key configured.' };
      const flags = computeAnalysisFlags(req.source, req.target);
      const cached = getCachedAnalysis(req.translatedText, req.source, req.target, providerId);
      if (cached) return { ok: true, result: cached };
      try {
        const prompt = buildAnalysisPrompt(req, flags);
        const schema = buildAnalysisSchema(flags);
        const raw = await callAiProvider(providerId, apiKey, prompt, schema, {
          itemCount: 6,
          timeoutMs: 45_000,
        });
        const result = parseAnalysisResponse(raw, flags);
        // Only successful calls are cached (even sparse ones) — thrown
        // network/auth/timeout errors stay retryable.
        setCachedAnalysis(req.translatedText, req.source, req.target, providerId, result);
        flushAnalysisCache();
        return { ok: true, result };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
