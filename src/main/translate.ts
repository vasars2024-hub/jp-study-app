import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { LlamaChatSession } from 'node-llama-cpp';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
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

const BATCH_SIZE = 40;
const BATCH_CONCURRENCY = 3;
/** Per-prompt inference budgets — a hung generation must not stall analyze. */
const BATCH_PROMPT_TIMEOUT_MS = 120_000;
const STRICT_PROMPT_TIMEOUT_MS = 45_000;
const SENTENCE_PROMPT_TIMEOUT_MS = 60_000;

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

/** Run one prompt with an abort-on-timeout guard so generation can never hang. */
async function promptWithTimeout(
  s: LlamaChatSession,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await s.prompt(prompt, {
      maxTokens,
      signal: controller.signal,
      stopOnAbortSignal: true,
    });
  } finally {
    clearTimeout(timer);
    resetSessionHistory(s);
  }
}

async function translateBatchPrompt(items: TranslateBatchItem[]): Promise<Map<string, string>> {
  const s = await ensureSession();
  const raw = await promptWithTimeout(s, buildBatchPrompt(items), 2048, BATCH_PROMPT_TIMEOUT_MS);
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

  const results: { id: string; text: string }[] = [];
  let ptr = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (ptr < chunks.length) {
      if (options?.shouldCancel?.()) return;
      const i = ptr++;
      const chunkResults = await translateBatchChunk(chunks[i]);
      results.push(...chunkResults);
      done += chunks[i].length;
      options?.onProgress?.(done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, chunks.length) }, () => worker()));
  flushTranslationCache();
  return results;
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
  await loadPromise;
  return session!;
}

async function translateSentence(text: string, source: TransLang, target: TransLang): Promise<string> {
  const s = await ensureSession();
  const raw = await promptWithTimeout(
    s,
    buildSentencePrompt(text, source, target),
    400,
    SENTENCE_PROMPT_TIMEOUT_MS,
  );
  return cleanLlmOutput(raw);
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = translateChain.then(fn, fn);
  translateChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function translateText(
  text: string,
  source: TransLang,
  target: TransLang,
  onPartial?: (progress: number) => void,
): Promise<string> {
  if (source === target || !text.trim()) return text;

  const parts = sentences(text);
  if (parts.length === 0) return '';

  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const translated = await enqueue(() => translateSentence(parts[i], source, target));
    out.push(translated);
    onPartial?.((i + 1) / parts.length);
  }
  return out.join(' ');
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
      _e,
      req: { items: TranslateBatchItem[] },
    ): Promise<{ ok: boolean; results?: { id: string; text: string }[]; error?: string }> => {
      try {
        const results = await runTranslationBatch(req.items ?? []);
        return { ok: true, results };
      } catch (err) {
        console.error('[translate:runBatch]', err);
        return { ok: false, error: friendlyError(err) };
      }
    },
  );
}
