import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMediaStudyAssistantPrompt,
  MEDIA_STUDY_ASSISTANT_SCHEMA,
  normalizeMediaStudyAssistantRequest,
  parseMediaStudyAssistantResult,
  type MediaStudyAssistantResult,
} from '../shared/mediaStudyAssistant';
import { callAiProvider } from './aiProviderClient';
import { getConfiguredAiProvider } from './mining';
import { AI_FEATURES_OFF_MESSAGE, aiFeaturesEnabled } from './aiFeatureGate';

interface CacheFile {
  entries: Record<string, MediaStudyAssistantResult>;
}

let cache: CacheFile | null = null;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'media-study-assistant-cache.json');
}

function loadCache(): CacheFile {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as CacheFile;
    cache = parsed?.entries ? parsed : { entries: {} };
  } catch {
    cache = { entries: {} };
  }
  return cache;
}

function saveCache(): void {
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    const temporary = `${cachePath()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cache), 'utf8');
    fs.renameSync(temporary, cachePath());
  } catch {
    // Cache persistence is optional; the result still returns to the caller.
  }
}

export function registerMediaStudyAssistantIpc(): void {
  ipcMain.handle('media-study:assist', async (_event, input: unknown): Promise<{
    ok: boolean;
    result?: MediaStudyAssistantResult;
    error?: string;
    cached?: boolean;
    aiOff?: boolean;
    needsKey?: boolean;
  }> => {
    if (!aiFeaturesEnabled()) return { ok: false, aiOff: true, error: AI_FEATURES_OFF_MESSAGE };
    const request = normalizeMediaStudyAssistantRequest(input);
    if (!request) return { ok: false, error: 'A valid Japanese sentence is required.' };
    const { providerId, apiKey } = getConfiguredAiProvider();
    if (!apiKey) return { ok: false, needsKey: true, error: 'Add an AI provider key in Settings > AI to use this optional feature.' };
    const key = crypto.createHash('sha256')
      .update(`${providerId}\0${request.mode}\0${request.text}\0${request.context ?? ''}\0${request.jlptLevel ?? ''}`)
      .digest('hex')
      .slice(0, 32);
    const existing = loadCache().entries[key];
    if (existing) return { ok: true, result: existing, cached: true };
    try {
      const raw = await callAiProvider(
        providerId,
        apiKey,
        buildMediaStudyAssistantPrompt(request),
        MEDIA_STUDY_ASSISTANT_SCHEMA,
        { itemCount: 8, timeoutMs: 60_000 },
      );
      const result = parseMediaStudyAssistantResult(raw, request.mode);
      loadCache().entries[key] = result;
      saveCache();
      return { ok: true, result, cached: false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
