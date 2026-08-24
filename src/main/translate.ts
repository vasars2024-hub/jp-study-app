import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { LlamaChatSession } from 'node-llama-cpp';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { langSpec } from '../shared/langs';
import { acquireLlamaContext, type LlamaContextLease } from './llamaContextPool';
import {
  buildBatchPrompt,
  buildSentencePrompt,
  buildStrictPrompt,
  cleanLlmOutput,
  looksLikeSenseHintEcho,
  parseBatchJson,
  sanitizeSenseHints,
  type TranslateBatchItem,
  type TranslateSenseHint,
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
/**
 * The native handles behind `session`. Kept because a `LlamaChatSession` alone cannot free
 * anything: the model weights and the KV cache belong to the model and context objects, and
 * without a reference to them nothing in this module could ever release the several GB they hold.
 *
 * The weights are a LEASE rather than a model now — `localAgent.ts` resolves the same GGUF from the
 * same roots, so the two modules used to hold a copy each. See `llamaModelPool.ts`.
 *
 * One lease covers both since 2026-08-24: `llamaContextPool.ts` owns the context as well as the
 * weights, because rebuilding the 8,192-token KV cache on every idle unload turned out to be the
 * larger half of the per-cycle bill (+1,298.5 MB against a 1,223 MB model file).
 */
let loadedContext: LlamaContextLease | null = null;
let idleUnloadTimer: ReturnType<typeof setTimeout> | null = null;
let activeTranslations = 0;
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
/**
 * Measured 2026-08-24, and the reason this constant exists at all. `createContext()` with no
 * size asks node-llama-cpp for the model's full trained context — 32,768 tokens for Qwen3-1.7B —
 * and the KV cache for that is several times the 1,223 MB model file. Loading it took main's
 * private bytes 3,447.7 -> 9,618.8 MB in 15 s, and after the local agent's own copy idle-unloaded
 * the process settled at 7,222 MB and stayed there: defect D1's plateau, exactly.
 *
 * 8,192 matches `DEFAULT_LOCAL_AGENT_SETTINGS.contextSize` and is far above what this module can
 * actually use — the longest prompt it builds is a chunk of `BATCH_SIZE` = 8 sentences.
 */
const TRANSLATE_CONTEXT_SIZE = 8_192;
/**
 * Tokens held back inside `TRANSLATE_CONTEXT_SIZE` for everything `tokenize()` cannot see: the chat
 * template's role markers, BOS/EOS, and the sampler's lookahead. Deliberately generous — the cost of
 * over-reserving is a slightly shorter completion, the cost of under-reserving is the silent context
 * shift described on `fitOutputBudget`.
 */
const CHAT_TEMPLATE_RESERVE_TOKENS = 192;
/** Below this, a completion is not worth attempting; the request is refused rather than truncated. */
const MIN_USABLE_OUTPUT_TOKENS = 64;
/** Same budget the local agent uses, for the same reason: a cached model is GBs of native memory. */
const IDLE_UNLOAD_MS = 5 * 60_000;

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

/**
 * Exact whenever the weights are loaded, because it is the same tokenizer the generation will use.
 * The character fallback only fires if the native call is unavailable or throws, and it deliberately
 * OVER-counts Latin text (really ~4 chars/token) while sitting close to the truth on Japanese
 * (~1.2): over-counting shortens a completion, under-counting causes the defect below.
 */
function countPromptTokens(prompt: string): number {
  const model = loadedContext?.model as unknown as { tokenize?: (text: string) => unknown } | undefined;
  try {
    const tokens = model?.tokenize?.(prompt);
    if (Array.isArray(tokens)) return tokens.length;
  } catch {
    /* Fall through to the estimate; a tokenizer failure must not fail the request. */
  }
  return Math.ceil(prompt.length / 1.5);
}

/**
 * node-llama-cpp does not REJECT a prompt whose completion cannot fit the context — it CONTEXT
 * SHIFTS, discarding the oldest part of the chat history to make room. Every prompt in this module
 * is single-turn, so "the oldest part" is the instruction and the source text: the model then
 * produces a fluent answer about material it can no longer see. Nothing throws and nothing is
 * marked; the caller gets confident prose instead of an error.
 *
 * It was reachable by construction, not only in theory. `sentenceAnalysis.ts:212` and
 * `mining.ts:1408` both ask for up to `Math.min(8192, ...)` OUTPUT tokens against an 8,192-token
 * context, leaving zero room for the prompt that asked for them.
 *
 * So the budget is computed rather than trusted, and a prompt with no room left is an explicit
 * failure the user can act on.
 */
function fitOutputBudget(prompt: string, requested: number): number {
  const promptTokens = countPromptTokens(prompt);
  const room = TRANSLATE_CONTEXT_SIZE - promptTokens - CHAT_TEMPLATE_RESERVE_TOKENS;
  if (room < MIN_USABLE_OUTPUT_TOKENS) {
    throw new Error(
      `This text is too long for the offline translator: it needs about ${promptTokens} of the ` +
        `${TRANSLATE_CONTEXT_SIZE} tokens it can hold at once. Try a shorter selection.`,
    );
  }
  return Math.min(requested, room);
}

/** Run one prompt with an abort-on-timeout (and batch-cancel) guard so generation can never hang. */
async function promptWithTimeout(
  s: LlamaChatSession,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  // Every batch, strict-retry and single-sentence prompt in this module funnels through here, so
  // this is the one place that can hold all four of them inside the context.
  const fitted = fitOutputBudget(prompt, maxTokens);
  const controller = new AbortController();
  activeBatchAbort = controller;
  if (batchCancelled) {
    throw new Error('Translation cancelled');
  }
  const cancelPoll = setInterval(() => {
    if (batchCancelled) controller.abort();
  }, 250);

  const promptPromise = s.prompt(prompt, {
    maxTokens: fitted,
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

  activeTranslations += 1;
  try {
    return await Promise.race([promptPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(cancelPoll);
    if (activeBatchAbort === controller) activeBatchAbort = null;
    // Best-effort: don't leave a late prompt resolution touching session state.
    void promptPromise.catch(() => undefined);
    resetSessionHistory(s);
    activeTranslations -= 1;
    // Every inference in this module goes through here, so this is the one place that knows the
    // model has just stopped being needed. Re-arming on each completion means a long EPUB run
    // keeps pushing the deadline out instead of unloading between chapters.
    scheduleIdleUnload();
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

/**
 * Whether the model is loaded right now. Distinct from `isTranslateAvailable`, which only asks
 * whether the file is on disk: since the runtime idle-unloads, "available" and "resident" are no
 * longer the same question.
 */
export function isTranslateReady(): boolean {
  return session !== null;
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

/**
 * Releases the native model and context — the GBs. Exported for the tests and for shutdown;
 * everything else reaches it through `scheduleIdleUnload`.
 *
 * The `Llama` backend is deliberately NOT released here and that is the fix, not an omission: see
 * `llamaBackend.ts` for the handle counts that ruled out disposing it per cycle. Innermost first,
 * because the context holds the KV cache and belongs to the model. Disposing is best effort in the
 * same way `localAgent.ts`'s is — a failed native teardown must not take the module down — but the
 * module-level references are cleared either way, so the next `ensureSession()` rebuilds rather
 * than handing back a session over a disposed context.
 *
 * The model is RELEASED rather than disposed. This module no longer owns the weights: if the agent
 * still holds the same GGUF the release costs nothing, and if nobody does the pool disposes them
 * once its grace window expires. That is why the context must go first — a disposed model under a
 * live context is freed native memory, and the pool cannot see contexts it does not own.
 */
export async function unloadTranslationModel(): Promise<void> {
  if (idleUnloadTimer) {
    clearTimeout(idleUnloadTimer);
    idleUnloadTimer = null;
  }
  const lease = loadedContext;
  session = null;
  loadPromise = null;
  loadedContext = null;
  try {
    // RELEASED, not disposed. The pool keeps the KV cache resident through its grace window, so a
    // user whose next lookup lands just past this deadline pays nothing instead of rebuilding
    // 1,298 MB of cache — the whole point of `llamaContextPool.ts`.
    await lease?.release();
  } catch {
    /* Native cleanup is best effort; the next load still builds a fresh runtime. */
  }
}

/**
 * Arms the unload. Called after every translation rather than on a timer, so an idle process never
 * holds the model and a busy one never has it pulled out from under a batch.
 */
function scheduleIdleUnload(): void {
  if (idleUnloadTimer) clearTimeout(idleUnloadTimer);
  idleUnloadTimer = setTimeout(() => {
    idleUnloadTimer = null;
    if (activeTranslations === 0 && !loadPromise && session) void unloadTranslationModel();
  }, IDLE_UNLOAD_MS);
  // A pending unload must not keep the app alive at quit.
  idleUnloadTimer.unref?.();
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
      const { LlamaChatSession } = await import('node-llama-cpp');
      broadcast('translate:progress', { status: 'progress', progress: 20, file: path.basename(modelPath) });

      // The weights AND the KV cache are borrowed, not owned: `localAgent.ts` resolves the same
      // GGUF from the same roots, so this is one 1.2 GB copy between the two modules rather than
      // one each, and the pool holds both briefly after release — which turns a lookup landing
      // just past the idle unload into a free reacquire instead of a native cycle that costs
      // ~1,223 handles and ~2.5 GB. See `llamaContextPool.ts`.
      broadcast('translate:progress', { status: 'progress', progress: 45, file: path.basename(modelPath) });
      // The pool releases everything it allocated if any step of the build fails, so unlike the
      // two-call version this cannot leave weights or a cache unreachable on the failure branch.
      const lease = await acquireLlamaContext(modelPath, TRANSLATE_CONTEXT_SIZE);
      loadedContext = lease;
      broadcast('translate:progress', { status: 'progress', progress: 80, file: path.basename(modelPath) });

      session = new LlamaChatSession({ contextSequence: lease.sequence });
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
    // The load may have got as far as the model or the context before failing or timing out. Both
    // are GBs of native memory, so this releases them rather than only dropping the reference —
    // `unloadTranslationModel` clears `loadPromise` and `session` on the way through.
    await unloadTranslationModel();
    throw err;
  } finally {
    if (loadTimer) clearTimeout(loadTimer);
    // Cleared on SUCCESS too, which it never used to be. `loadPromise` exists only to dedupe
    // concurrent loads, and `session` is already assigned by the time this runs, so a caller
    // arriving now takes the `if (session)` early return rather than starting a second load.
    // Leaving it set made `scheduleIdleUnload`'s `!loadPromise` guard permanently false: measured
    // on the live app, the model was still resident at 3,290 MB 460 s after a 300 s deadline.
    loadPromise = null;
  }
  // A caller that loads and then never prompts (`ensureTranslateReady`, or a batch the user
  // cancels before the first chunk) would otherwise pin the model forever.
  scheduleIdleUnload();
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

async function translateSentence(
  text: string,
  source: TransLang,
  target: TransLang,
  hints?: readonly TranslateSenseHint[],
): Promise<string> {
  const s = await ensureSession();
  const raw = await promptWithTimeout(
    s,
    buildSentencePrompt(text, source, target, hints),
    400,
    SENTENCE_PROMPT_TIMEOUT_MS,
  );
  const first = cleanLlmOutput(raw);
  // A constrained prompt gives a small model one more way to fail: repeating the
  // constraint block back instead of translating. That output is fluent target
  // language with none of the source in it, so the cross-language validator
  // passes it — the echo has to be rejected by name.
  const usable = (candidate: string): boolean =>
    isValidCrossLangTranslation(source, target, text, candidate)
    && !looksLikeSenseHintEcho(candidate, hints);
  if (usable(first)) return first;

  // The batch path has always validated its output and retried once with the
  // stricter prompt; this path did not, so a model that echoed its input — or
  // leaked kana into an English line — was returned as a finished translation
  // and was indistinguishable from a real one. Same treatment here.
  const strictRaw = await promptWithTimeout(
    s,
    buildStrictPrompt({ id: 's0', text, source, target }, hints),
    200,
    STRICT_PROMPT_TIMEOUT_MS,
  );
  const strict = cleanLlmOutput(strictRaw).replace(/^["'«]|["'»]$/g, '').trim();
  return usable(strict) ? strict : '';
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
  options?: {
    maxTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTextChunk?: (text: string) => void;
  },
): Promise<string> {
  if (!isTranslateAvailable()) {
    throw new Error(friendlyError(new Error('Qwen3 model not found')));
  }
  const requestedTokens = Math.max(64, Math.min(8192, options?.maxTokens ?? 2048));
  const timeoutMs = Math.max(5_000, options?.timeoutMs ?? 90_000);
  return enqueue(async () => {
    const s = await ensureSession();
    // After `ensureSession`, so the weights — and therefore the real tokenizer — are loaded. The
    // callers of this function are the ones that could ask for a whole context of output.
    const maxTokens = fitOutputBudget(prompt, requestedTokens);
    // Independent of EPUB batch cancel — analysis/enrichment must not abort mid-flight
    // just because a translation batch was cancelled elsewhere.
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(options?.signal?.reason);
    if (options?.signal?.aborted) {
      resetSessionHistory(s);
      throw new Error('Local Qwen request was cancelled.');
    }
    options?.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const raw = await s.prompt(prompt, {
        maxTokens,
        signal: controller.signal,
        stopOnAbortSignal: true,
        onTextChunk: options?.onTextChunk,
      });
      return extractJsonish(cleanLlmOutput(raw));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (!timedOut) throw new Error('Local Qwen request was cancelled.');
        throw new Error(`Local Qwen timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw err instanceof Error ? new Error(friendlyError(err)) : err;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', abort);
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
  hints?: readonly TranslateSenseHint[],
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
    // Hints apply to every sentence of the passage: a pin is recorded against a
    // headword, not an offset, so a word pinned once is pinned wherever the
    // splitter happens to have cut.
    const translated = await enqueue(() => translateSentence(parts[i], source, target, hints));
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
      ready: isTranslateReady(),
      modelFound: modelPath !== null,
      modelPath,
    };
  });

  ipcMain.handle('translate:ensureReady', async () => ensureTranslateReady());

  ipcMain.handle(
    'translate:run',
    async (
      e,
      req: {
        id: number;
        text: string;
        source: string;
        target: string;
        senseHints?: unknown;
      },
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      try {
        // Sanitized rather than trusted: the hints reach the prompt verbatim, so
        // an unbounded list from a renderer would crowd out the passage itself.
        const hints = sanitizeSenseHints(req.senseHints);
        const text = await translateText(req.text, req.source, req.target, (progress) => {
          e.sender.send('translate:partial', { id: req.id, progress });
        }, hints);
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
