import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { LlamaChatSession } from 'node-llama-cpp';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { langSpec } from '../shared/langs';
import {
  buildBatchPrompt,
  buildSentencePrompt,
  buildStrictPrompt,
  cleanLlmOutput,
  parseBatchJson,
  type TranslateBatchItem,
} from '../shared/translateCore';

/** Any language code from shared/langs.ts (kept as an alias for callers). */
export type TransLang = string;

export type { TranslateBatchItem };

const MODEL_FILENAMES = [
  'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
  'Qwen3-1.7B-Q4_K_M.gguf',
  'qwen3-1.7b-q4_k_m.gguf',
];

const USER_MODEL = 'Qwen3-1.7B.gguf';

let session: LlamaChatSession | null = null;
let loadPromise: Promise<void> | null = null;
let translateChain: Promise<unknown> = Promise.resolve();
/** Set by `cancelTranslationBatch` so long EPUB/manga runs can stop between chunks. */
let batchCancelled = false;
let lastBatchWasCancelled = false;
let activeBatchAbort: AbortController | null = null;

const BATCH_SIZE = 8;
const BATCH_CONCURRENCY = 1;
/** Per-prompt inference budgets — a hung generation must not stall analyze. */
const BATCH_PROMPT_TIMEOUT_MS = 90_000;
const STRICT_PROMPT_TIMEOUT_MS = 45_000;
const SENTENCE_PROMPT_TIMEOUT_MS = 60_000;
const MODEL_LOAD_TIMEOUT_MS = 180_000;

interface TranslationCacheFile {
  entries: Record<string, string>;
}

// Load the cache once into memory and flush it once per batch (mirrors the gloss
// cache in dictionary.ts). The previous implementation read and re-parsed the
// whole JSON file on every getCachedTranslation and rewrote the whole file on
// every setCachedTranslation — thousands of full-file disk operations per
// analyze, which was the main source of the laggy mining UI.
let translationCache: TranslationCacheFile | null = null;
let translationCacheDirty = false;

function translationCachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'translation-cache.json');
}

function loadTranslationCache(): TranslationCacheFile {
  if (translationCache) return translationCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(translationCachePath(), 'utf-8')) as TranslationCacheFile;
    translationCache = parsed?.entries ? parsed : { entries: {} };
  } catch {
    translationCache = { entries: {} };
  }
  return translationCache;
}

/** Persist the in-memory cache to disk. Called once per batch, not per item. */
export function flushTranslationCache(): void {
  if (!translationCache || !translationCacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(translationCachePath()), { recursive: true });
    const tmp = `${translationCachePath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(translationCache), 'utf-8');
    fs.renameSync(tmp, translationCachePath());
    translationCacheDirty = false;
  } catch {
    /* best-effort cache; ignore write failures */
  }
}

export function translationCacheKey(text: string, source: TransLang, target: TransLang): string {
  const normalized = text.trim().normalize('NFKC');
  return crypto
    .createHash('sha256')
    .update(`${source}\0${target}\0${normalized}`)
    .digest('hex')
    .slice(0, 24);
}

export function getCachedTranslation(
  text: string,
  source: TransLang,
  target: TransLang,
): string | undefined {
  return loadTranslationCache().entries[translationCacheKey(text, source, target)];
}

export function setCachedTranslation(
  text: string,
  source: TransLang,
  target: TransLang,
  translated: string,
): void {
  loadTranslationCache().entries[translationCacheKey(text, source, target)] = translated;
  translationCacheDirty = true;
}

export interface RunTranslationBatchOptions {
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

/** Run one prompt with an abort-on-timeout (and batch-cancel) guard so generation can never hang. */
async function promptWithTimeout(
  s: LlamaChatSession,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  activeBatchAbort = controller;
  if (batchCancelled) {
    throw new Error('Translation cancelled');
  }
  const cancelPoll = setInterval(() => {
    if (batchCancelled) controller.abort();
  }, 250);

  const promptPromise = s.prompt(prompt, {
    maxTokens,
    signal: controller.signal,
    stopOnAbortSignal: true,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Translation prompt timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promptPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(cancelPoll);
    if (activeBatchAbort === controller) activeBatchAbort = null;
    // Best-effort: don't leave a late prompt resolution touching session state.
    void promptPromise.catch(() => undefined);
    resetSessionHistory(s);
  }
}

export function cancelTranslationBatch(): void {
  batchCancelled = true;
  activeBatchAbort?.abort();
}

async function translateBatchPrompt(items: TranslateBatchItem[]): Promise<Map<string, string>> {
  const s = await ensureSession();
  // Long literary lines need more tokens than glossary terms.
  const maxTokens = Math.min(4096, Math.max(512, items.length * 256));
  const raw = await promptWithTimeout(s, buildBatchPrompt(items), maxTokens, BATCH_PROMPT_TIMEOUT_MS);
  const expected = new Set(items.map((i) => i.id));
  return parseBatchJson(raw, expected);
}

/** Stricter one-item retry after validation rejected the batch output. */
async function translateStrictItem(item: TranslateBatchItem): Promise<string> {
  const s = await ensureSession();
  const raw = await promptWithTimeout(s, buildStrictPrompt(item), 200, STRICT_PROMPT_TIMEOUT_MS);
  return cleanLlmOutput(raw).replace(/^["'«]|["'»]$/g, '').trim();
}

async function translateBatchChunk(items: TranslateBatchItem[]): Promise<{ id: string; text: string }[]> {
  if (!items.length) return [];
  const out: { id: string; text: string }[] = [];
  const needsLlm: TranslateBatchItem[] = [];

  for (const item of items) {
    if (item.source === item.target || !item.text.trim()) {
      out.push({ id: item.id, text: item.text });
      continue;
    }
    if (item.strict) {
      needsLlm.push(item);
      continue;
    }
    const cached = getCachedTranslation(item.text, item.source, item.target);
    if (cached !== undefined && isValidCrossLangTranslation(item.source, item.target, item.text, cached)) {
      out.push({ id: item.id, text: cached });
    } else {
      needsLlm.push(item);
    }
  }

  if (needsLlm.length) {
    const strictItems = needsLlm.filter((i) => i.strict);
    const normalItems = needsLlm.filter((i) => !i.strict);

    const groups = new Map<string, TranslateBatchItem[]>();
    for (const item of normalItems) {
      const groupKey = `${item.source}:${item.target}`;
      const list = groups.get(groupKey) ?? [];
      list.push(item);
      groups.set(groupKey, list);
    }
    for (const group of groups.values()) {
      try {
        const mapped = await enqueue(() => translateBatchPrompt(group));
        for (const item of group) {
          const raw = mapped.get(item.id)?.trim() ?? '';
          const text = isValidCrossLangTranslation(item.source, item.target, item.text, raw)
            ? raw
            : '';
          if (text) {
            setCachedTranslation(item.text, item.source, item.target, text);
          }
          out.push({ id: item.id, text });
        }
      } catch {
        for (const item of group) {
          out.push({ id: item.id, text: '' });
        }
      }
    }

    for (const item of strictItems) {
      try {
        const raw = await enqueue(() => translateStrictItem(item));
        const text = isValidCrossLangTranslation(item.source, item.target, item.text, raw)
          ? raw
          : '';
        if (text) setCachedTranslation(item.text, item.source, item.target, text);
        out.push({ id: item.id, text });
      } catch {
        out.push({ id: item.id, text: '' });
      }
    }
  }

  return out;
}

export async function runTranslationBatch(
  items: TranslateBatchItem[],
  options?: RunTranslationBatchOptions,
): Promise<{ id: string; text: string }[]> {
  const deduped = new Map<string, TranslateBatchItem>();
  for (const item of items) {
    if (!item.id || !item.text.trim()) continue;
    deduped.set(item.id, item);
  }
  const list = [...deduped.values()];
  if (!list.length) return [];

  const chunks: TranslateBatchItem[][] = [];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    chunks.push(list.slice(i, i + BATCH_SIZE));
  }

  batchCancelled = false;
  lastBatchWasCancelled = false;
  const results: { id: string; text: string }[] = [];
  let ptr = 0;
  let done = 0;
  const isCancelled = (): boolean => batchCancelled || !!options?.shouldCancel?.();

  async function worker(): Promise<void> {
    while (ptr < chunks.length) {
      if (isCancelled()) {
        lastBatchWasCancelled = true;
        return;
      }
      const i = ptr++;
      if (i >= chunks.length) return;
      // Emit before the LLM call so the UI is not stuck at 0 while the first chunk runs.
      options?.onProgress?.(done, list.length);
      const chunkResults = await translateBatchChunk(chunks[i]);
      if (isCancelled()) {
        lastBatchWasCancelled = true;
        results.push(...chunkResults);
        done += chunks[i].length;
        options?.onProgress?.(done, list.length);
        return;
      }
      results.push(...chunkResults);
      done += chunks[i].length;
      options?.onProgress?.(done, list.length);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, chunks.length) }, () => worker()));
  } finally {
    if (batchCancelled) lastBatchWasCancelled = true;
    batchCancelled = false;
    flushTranslationCache();
  }
  return results;
}

/** True if the most recent `runTranslationBatch` stopped early due to cancel. */
export function didLastTranslationBatchCancel(): boolean {
  return lastBatchWasCancelled;
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function resolveModelPath(): string | null {
  const stored = path.join(app.getPath('userData'), 'models', USER_MODEL);
  if (fs.existsSync(stored)) return stored;

  const downloads = path.join(os.homedir(), 'Downloads');
  for (const name of MODEL_FILENAMES) {
    const candidate = path.join(downloads, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Whether the Qwen model file is present — checked before queuing LLM work. */
export function isTranslateAvailable(): boolean {
  return resolveModelPath() !== null;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/model not found|ENOENT|no such file/i.test(msg)) {
    return 'Qwen3 translation model not found. Place Qwen3-1.7B (Q4_K_M) in your Downloads folder, or copy it to the app data models folder.';
  }
  if (/llama|gguf|cuda|vulkan|backend|native/i.test(msg)) {
    return 'The Qwen3 translation engine could not start. Try restarting the app.';
  }
  return msg;
}

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[。．！？!?\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resetSessionHistory(s: LlamaChatSession): void {
  const anySession = s as LlamaChatSession & { resetChatHistory?: () => void; setChatHistory?: (h: []) => void };
  if (typeof anySession.resetChatHistory === 'function') {
    anySession.resetChatHistory();
  } else if (typeof anySession.setChatHistory === 'function') {
    anySession.setChatHistory([]);
  }
}

async function ensureSession(): Promise<LlamaChatSession> {
  if (session) return session;
  if (!loadPromise) {
    loadPromise = (async () => {
      const modelPath = resolveModelPath();
      if (!modelPath) {
        throw new Error('Qwen3 model not found');
      }

      broadcast('translate:progress', { status: 'init', progress: 0, file: path.basename(modelPath) });
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      broadcast('translate:progress', { status: 'progress', progress: 20, file: path.basename(modelPath) });

      const llama = await getLlama();
      broadcast('translate:progress', { status: 'progress', progress: 45, file: path.basename(modelPath) });

      const model = await llama.loadModel({ modelPath });
      broadcast('translate:progress', { status: 'progress', progress: 80, file: path.basename(modelPath) });

      const context = await model.createContext();
      session = new LlamaChatSession({ contextSequence: context.getSequence() });
      broadcast('translate:progress', { status: 'ready', progress: 100, file: path.basename(modelPath) });
    })();
    // A failed load must not poison every future attempt (e.g. the user drops
    // the model into Downloads after the first error).
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }

  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      loadPromise,
      new Promise<never>((_, reject) => {
        loadTimer = setTimeout(() => {
          reject(new Error(`Translation model load timed out after ${Math.round(MODEL_LOAD_TIMEOUT_MS / 1000)}s`));
        }, MODEL_LOAD_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    loadPromise = null;
    session = null;
    throw err;
  } finally {
    if (loadTimer) clearTimeout(loadTimer);
  }
  return session!;
}

/** Force-load the model so EPUB range jobs can show load progress before the first chapter. */
export async function ensureTranslateReady(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isTranslateAvailable()) {
      return { ok: false, error: friendlyError(new Error('Qwen3 model not found')) };
    }
    await ensureSession();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function translateSentence(text: string, source: TransLang, target: TransLang): Promise<string> {
  const s = await ensureSession();
  const raw = await promptWithTimeout(
    s,
    buildSentencePrompt(text, source, target),
    400,
    SENTENCE_PROMPT_TIMEOUT_MS,
  );
  const first = cleanLlmOutput(raw);
  if (isValidCrossLangTranslation(source, target, text, first)) return first;

  // The batch path has always validated its output and retried once with the
  // stricter prompt; this path did not, so a model that echoed its input — or
  // leaked kana into an English line — was returned as a finished translation
  // and was indistinguishable from a real one. Same treatment here.
  const strictRaw = await promptWithTimeout(
    s,
    buildStrictPrompt({ id: 's0', text, source, target }),
    200,
    STRICT_PROMPT_TIMEOUT_MS,
  );
  const strict = cleanLlmOutput(strictRaw).replace(/^["'«]|["'»]$/g, '').trim();
  return isValidCrossLangTranslation(source, target, text, strict) ? strict : '';
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = translateChain.then(fn, fn);
  translateChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Generic local-Qwen completion for Card Studio / sentence analysis.
 * Shares the Translate session so we never load two GGUFs at once.
 */
export async function runLocalQwenPrompt(
  prompt: string,
  options?: { maxTokens?: number; timeoutMs?: number },
): Promise<string> {
  if (!isTranslateAvailable()) {
    throw new Error(friendlyError(new Error('Qwen3 model not found')));
  }
  const maxTokens = Math.max(64, Math.min(8192, options?.maxTokens ?? 2048));
  const timeoutMs = Math.max(5_000, options?.timeoutMs ?? 90_000);
  return enqueue(async () => {
    const s = await ensureSession();
    // Independent of EPUB batch cancel — analysis/enrichment must not abort mid-flight
    // just because a translation batch was cancelled elsewhere.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const raw = await s.prompt(prompt, {
        maxTokens,
        signal: controller.signal,
        stopOnAbortSignal: true,
      });
      return extractJsonish(cleanLlmOutput(raw));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Local Qwen timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw err instanceof Error ? new Error(friendlyError(err)) : err;
    } finally {
      clearTimeout(timer);
      resetSessionHistory(s);
    }
  });
}

/** Prefer a JSON object/array if the model wrapped it in prose or fences. */
function extractJsonish(cleaned: string): string {
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) return cleaned.slice(objStart, objEnd + 1);
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) return cleaned.slice(arrStart, arrEnd + 1);
  return cleaned;
}

async function translateText(
  text: string,
  source: TransLang,
  target: TransLang,
  onPartial?: (progress: number) => void,
): Promise<string> {
  if (!text.trim()) return text;
  // A missing or unrecognized code used to fall into the `source === target`
  // branch below — `undefined === undefined` — and the source text came back as
  // a successful translation. A caller that misnames these fields (`from`/`to`
  // instead of `source`/`target`) has to hear about it, not receive its own
  // input with `ok: true`.
  // `langSpec` calls `.toLowerCase()`, so a non-string has to be rejected here
  // rather than handed to it — the missing-field case is exactly the one this
  // guard exists for.
  const known = (code: unknown): boolean => typeof code === 'string' && !!langSpec(code);
  if (!known(source) || !known(target)) {
    throw new Error(
      `Translation needs a known source and target language; got source="${source}" target="${target}".`,
    );
  }
  if (source === target) return text;

  const parts = sentences(text);
  if (parts.length === 0) return '';

  const out: string[] = [];
  let translatedCount = 0;
  for (let i = 0; i < parts.length; i++) {
    const translated = await enqueue(() => translateSentence(parts[i], source, target));
    // An untranslatable sentence is dropped rather than back-filled with its
    // own source text: a Japanese clause sitting inside an English paragraph
    // reads as part of the translation.
    if (translated) {
      out.push(translated);
      translatedCount += 1;
    }
    onPartial?.((i + 1) / parts.length);
  }
  if (translatedCount === 0) {
    throw new Error('The translation model returned no usable output for this text.');
  }
  return out.join(' ');
}

/**
 * Translate a block of text for the bilingual book build.
 *
 * Shares translateText's serialized queue, so a few hundred book pages cannot
 * starve an interactive translation the user is waiting on — the requests
 * interleave rather than one blocking the model outright.
 */
export async function translateForBook(
  text: string,
  source: TransLang,
  target: TransLang,
): Promise<string> {
  return translateText(text, source, target);
}

export function registerTranslateIpc(): void {
  ipcMain.handle('translate:status', () => {
    const modelPath = resolveModelPath();
    return {
      ready: session !== null,
      modelFound: modelPath !== null,
      modelPath,
    };
  });

  ipcMain.handle('translate:ensureReady', async () => ensureTranslateReady());

  ipcMain.handle(
    'translate:run',
    async (
      e,
      req: { id: number; text: string; source: string; target: string },
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      try {
        const text = await translateText(req.text, req.source, req.target, (progress) => {
          e.sender.send('translate:partial', { id: req.id, progress });
        });
        return { ok: true, text };
      } catch (err) {
        console.error('[translate]', err);
        return { ok: false, error: friendlyError(err) };
      }
    },
  );

  ipcMain.handle(
    'translate:runBatch',
    async (
      e,
      req: { items: TranslateBatchItem[] },
    ): Promise<{
      ok: boolean;
      results?: { id: string; text: string }[];
      error?: string;
      cancelled?: boolean;
    }> => {
      try {
        const results = await runTranslationBatch(req.items ?? [], {
          onProgress: (done, total) => {
            e.sender.send('translate:batchProgress', { done, total });
          },
        });
        if (didLastTranslationBatchCancel()) {
          return { ok: false, cancelled: true, results };
        }
        return { ok: true, results };
      } catch (err) {
        console.error('[translate:runBatch]', err);
        return { ok: false, error: friendlyError(err) };
      }
    },
  );

  ipcMain.handle('translate:cancelBatch', () => {
    cancelTranslationBatch();
    return { ok: true };
  });
}
