import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import crypto from 'node:crypto';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { langSpec } from '../shared/langs';
import { acquireLlamaSession, isLlamaSessionLost, type LlamaSessionHandle } from './llamaHost';
import {
  LocalModelMissingError,
  findLocalModelFile,
  resolveQwenSmallModelPath,
} from './localModelFiles';
import {
  buildBatchPrompt,
  buildSentencePrompt,
  buildStrictPrompt,
  cleanLlmOutput,
  looksLikeSenseHintEcho,
  parseBatchJson,
  sanitizeSenseHints,
  sanitizeTranslateStyle,
  splitTranslationSentences,
  type TranslateBatchItem,
  type TranslateSegment,
  type TranslateSenseHint,
  type TranslateStyle,
} from '../shared/translateCore';
import {
  classifyTranslateError,
  summarizeTranslateFailure,
  type TranslateBatchFailure,
  type TranslateBatchItemResult,
} from '../shared/translateBatchFailure';
import type { TranslateResultMeta, TranslateRouteFailure } from '../shared/translateProviders';
import { registerTranslateProviderIpc, routeTranslation, TranslateRouteError } from './translateRouter';

/** Any language code from shared/langs.ts (kept as an alias for callers). */
export type TransLang = string;

export type { TranslateBatchItem };

/**
 * The chat session, and — since 2026-08-24 — a handle rather than an object.
 *
 * There used to be two references here: a `LlamaChatSession` and, beside it, the `LlamaContextLease`
 * holding the weights and the KV cache, because a session alone cannot free anything. Both now live
 * in the local-model utility process and this is the string id that names them, so releasing is one
 * call and nothing native is reachable from this module at all. See `llamaHost.ts`.
 */
let session: LlamaSessionHandle | null = null;
let loadPromise: Promise<void> | null = null;
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
/** Deadline multiplier for the higher-quality tier's larger model (8B+ is several times slower per token). */
const LARGE_MODEL_TIMEOUT_SCALE = 4;
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
    translationCache = readJsonSync<TranslationCacheFile>(translationCachePath(), () => ({ entries: {} }), {
      validate: (v) => !!v && typeof v === 'object' && !!(v as TranslationCacheFile).entries,
    });
  } catch {
    // A best-effort cache: no userData path (or an unreadable one) means an
    // in-memory cache for this session, never a failed translation.
    translationCache = { entries: {} };
  }
  return translationCache;
}

/** Persist the in-memory cache to disk. Called once per batch, not per item. */
export function flushTranslationCache(): void {
  if (!translationCache || !translationCacheDirty) return;
  try {
    writeJsonAtomicSync(translationCachePath(), translationCache, { space: 0, backup: false });
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
async function countPromptTokens(prompt: string, on: LlamaSessionHandle | null = session): Promise<number> {
  try {
    // Asynchronous only because the tokenizer now answers from the model host; it is still the
    // exact tokenizer the generation will use, not a second copy loaded to count with.
    const tokens = await on?.countTokens(prompt);
    if (typeof tokens === 'number') return tokens;
  } catch (err) {
    // A host that stopped answering (deadline) or died (session lost) is not a tokenizer that
    // could not count: prompting it next would fail the same way, only later.
    if (isLlamaSessionLost(err) || (err instanceof Error && err.name === 'TimeoutError')) throw err;
    /* Otherwise fall through to the estimate; a tokenizer failure must not fail the request. */
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
async function fitOutputBudget(
  prompt: string,
  requested: number,
  on: LlamaSessionHandle | null = session,
): Promise<number> {
  const promptTokens = await countPromptTokens(prompt, on);
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
  s: LlamaSessionHandle,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  activeBatchAbort = controller;
  if (batchCancelled) {
    throw new Error('Translation cancelled');
  }
  // The deadline and the cancel poll are armed BEFORE the tokenizer is asked, not after: a host
  // that stopped answering used to hang in `countTokens`, outside every guard, and the serial
  // queue behind it with it.
  let rejectCancel: (err: Error) => void = () => undefined;
  const cancelPromise = new Promise<never>((_, reject) => {
    rejectCancel = reject;
  });
  const cancelPoll = setInterval(() => {
    if (!batchCancelled) return;
    controller.abort();
    rejectCancel(new Error('Translation cancelled'));
  }, 250);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Translation prompt timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  void cancelPromise.catch(() => undefined);
  void timeoutPromise.catch(() => undefined);

  let promptPromise: Promise<string> | null = null;
  activeTranslations += 1;
  try {
    // Every batch, strict-retry and single-sentence prompt in this module funnels through here, so
    // this is the one place that can hold all four of them inside the context.
    const fitted = await Promise.race([fitOutputBudget(prompt, maxTokens, s), timeoutPromise, cancelPromise]);
    promptPromise = s.prompt(prompt, { maxTokens: fitted, signal: controller.signal });
    return await Promise.race([promptPromise, timeoutPromise, cancelPromise]);
  } catch (err) {
    dropLostSession(s, err);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(cancelPoll);
    if (activeBatchAbort === controller) activeBatchAbort = null;
    // Best-effort: don't leave a late prompt resolution touching session state.
    void promptPromise?.catch(() => undefined);
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

async function translateBatchChunk(items: TranslateBatchItem[]): Promise<TranslateBatchItemResult[]> {
  if (!items.length) return [];
  const out: TranslateBatchItemResult[] = [];
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
            out.push({ id: item.id, text });
          } else {
            // The model answered, but not with a translation of this line.
            out.push({ id: item.id, text: '', reason: 'rejected' });
          }
        }
      } catch (err) {
        // Still an empty string per item — a long run must not sink on one
        // chunk — but the reason travels with it, so a reader can say WHY.
        const failure = classifyTranslateError(err);
        for (const item of group) {
          out.push({ id: item.id, text: '', ...failure });
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
        out.push(text ? { id: item.id, text } : { id: item.id, text: '', reason: 'rejected' });
      } catch (err) {
        out.push({ id: item.id, text: '', ...classifyTranslateError(err) });
      }
    }
  }

  return out;
}

export async function runTranslationBatch(
  items: TranslateBatchItem[],
  options?: RunTranslationBatchOptions,
): Promise<TranslateBatchItemResult[]> {
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
  const results: TranslateBatchItemResult[] = [];
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

/**
 * The file names and folders are `localModelFiles.ts`'s, shared with the Agent: this module used to
 * keep its own shorter list, so a model the Agent could load was "not found" here and the reverse.
 */
function resolveModelPath(): string | null {
  return resolveQwenSmallModelPath();
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

/**
 * The catalog key for an error this module words itself, so the renderer can
 * say it in the interface language (the English sentence stays as fallback
 * and for logs). A platform message has no key and is passed on verbatim.
 */
export function friendlyErrorKey(err: unknown): string | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  if (isLlamaSessionLost(err)) return 'translate.error.engineRestarted';
  if (err instanceof Error && err.name === 'TimeoutError') return 'translate.error.timeout';
  if (/timed out after/i.test(msg)) return 'translate.error.timeout';
  if (err instanceof LocalModelMissingError || /model not found|ENOENT|no such file/i.test(msg)) return 'translate.error.modelMissing';
  if (/llama|gguf|cuda|vulkan|backend|native/i.test(msg)) return 'translate.error.engineFailed';
  return undefined;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (isLlamaSessionLost(err)) return 'The offline model restarted. Try again.';
  if (err instanceof LocalModelMissingError || /model not found|ENOENT|no such file/i.test(msg)) {
    return 'The offline AI model is not installed. Install Qwen3-1.7B in Settings > AI.';
  }
  if (/llama|gguf|cuda|vulkan|backend|native/i.test(msg)) {
    return 'The Qwen3 translation engine could not start. Try restarting the app.';
  }
  return msg;
}

function sentences(text: string): string[] {
  return splitTranslationSentences(text);
}

/**
 * Clears the chat history, and deliberately does NOT wait for the host to confirm it.
 *
 * Every call site is a `finally` whose job is to leave the session clean for the next prompt, and
 * the ordering that guarantees still holds across the process boundary: the request is posted
 * synchronously here, the channel is FIFO, and the host applies a reset without yielding, so any
 * prompt posted after this call is handled after it. Awaiting would only add a round trip to the
 * end of every translation.
 */
function resetSessionHistory(s: LlamaSessionHandle): void {
  void s.resetHistory().catch(() => undefined);
}

/**
 * Gives the model and the KV cache back — the GBs. Exported for the tests and for shutdown;
 * everything else reaches it through `scheduleIdleUnload`.
 *
 * RELEASED, not disposed, and the ordering that used to matter here is no longer this module's to
 * get right: the host owns the innermost-first teardown, keeps the cache resident through its grace
 * window so a user whose next lookup lands just past this deadline pays nothing, and ends its own
 * process once both pools go empty. Best effort, as before — a failed release must not take the
 * module down — and the module-level references are cleared either way, so the next
 * `ensureSession()` rebuilds rather than handing back a session over a released context.
 */
export async function unloadTranslationModel(): Promise<void> {
  if (idleUnloadTimer) {
    clearTimeout(idleUnloadTimer);
    idleUnloadTimer = null;
  }
  const handle = session;
  session = null;
  loadPromise = null;
  try {
    await handle?.release();
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

/**
 * Forgets the cached session when the host that held it is gone (it exited, or it stopped
 * answering and was replaced), so the next request acquires a fresh one instead of sending a dead
 * id to a new child and getting the restart message forever.
 */
function dropLostSession(s: LlamaSessionHandle, err?: unknown): void {
  const lost = s.isLost?.() === true || isLlamaSessionLost(err);
  if (!lost || session !== s) return;
  session = null;
  loadPromise = null;
}

async function ensureSession(): Promise<LlamaSessionHandle> {
  if (session?.isLost?.()) dropLostSession(session);
  if (session) return session;
  if (!loadPromise) {
    loadPromise = (async () => {
      const modelPath = resolveModelPath();
      if (!modelPath) {
        throw new LocalModelMissingError();
      }

      broadcast('translate:progress', { status: 'init', progress: 0, file: path.basename(modelPath) });
      broadcast('translate:progress', { status: 'progress', progress: 20, file: path.basename(modelPath) });
      // The weights AND the KV cache are borrowed, not owned, and neither is in this process:
      // `localAgent.ts` resolves the same GGUF from the same roots, so the host holds one 1.2 GB
      // copy between the two modules rather than one each, and its pools keep both briefly after a
      // release — which turns a lookup landing just past the idle unload into a free reacquire
      // instead of a native cycle costing ~1,223 handles and ~2.5 GB. See `llamaHost.ts`.
      broadcast('translate:progress', { status: 'progress', progress: 45, file: path.basename(modelPath) });
      // The host releases everything it allocated if any step of the build fails, so this cannot
      // leave weights or a cache unreachable on the failure branch.
      session = await acquireLlamaSession(modelPath, TRANSLATE_CONTEXT_SIZE);
      broadcast('translate:progress', { status: 'progress', progress: 80, file: path.basename(modelPath) });
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
export async function ensureTranslateReady(): Promise<{ ok: boolean; error?: string; errorKey?: string }> {
  try {
    if (!isTranslateAvailable()) {
      return { ok: false, error: friendlyError(new LocalModelMissingError()), errorKey: 'translate.error.modelMissing' };
    }
    await ensureSession();
    return { ok: true };
  } catch (err) {
    const errorKey = friendlyErrorKey(err);
    return { ok: false, error: friendlyError(err), ...(errorKey ? { errorKey } : {}) };
  }
}

async function translateSentence(
  text: string,
  source: TransLang,
  target: TransLang,
  hints?: readonly TranslateSenseHint[],
  style: TranslateStyle = 'natural',
  /** A borrowed larger model's session (the higher-quality tier); the shared small one otherwise. */
  on?: LlamaSessionHandle,
): Promise<string> {
  const s = on ?? await ensureSession();
  // A larger model generates several times slower per token; its deadlines scale with it.
  const scale = on ? LARGE_MODEL_TIMEOUT_SCALE : 1;
  const raw = await promptWithTimeout(
    s,
    buildSentencePrompt(text, source, target, hints, style),
    400,
    SENTENCE_PROMPT_TIMEOUT_MS * scale,
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
    STRICT_PROMPT_TIMEOUT_MS * scale,
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

export interface LocalQwenPromptOptions {
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onTextChunk?: (text: string) => void;
  /**
   * Return the model's whole reply instead of the JSON fragment inside it.
   *
   * Every original caller asked for JSON and wanted the object even when the model wrapped it in
   * prose, so the fragment was the default. A chat reply is the opposite: "Here is an example:" and
   * a code block is the answer, and cutting it down to the block silently discarded the rest.
   */
  raw?: boolean;
  /**
   * A GGUF file other than the translation model — the Agent's own configured model. Missing on
   * disk is a `LocalModelMissingError`, never a quiet fallback to a different model.
   */
  modelFileName?: string;
}

/**
 * A session for `modelFileName` when it names a different file from the translation model.
 *
 * Borrowed for one prompt and released straight after: the host keeps the weights and the KV cache
 * resident through its grace window, so a conversation does not reload between turns, and this
 * module never ends up holding two multi-GB models past the request that needed the second one.
 */
async function borrowSessionFor(modelFileName: string | undefined): Promise<{
  session: LlamaSessionHandle;
  borrowed: boolean;
}> {
  const wanted = modelFileName?.trim();
  if (wanted) {
    const modelPath = findLocalModelFile(wanted);
    if (!modelPath) throw new LocalModelMissingError();
    if (path.resolve(modelPath).toLocaleLowerCase() !== (resolveModelPath() ?? '').toLocaleLowerCase()) {
      return { session: await acquireLlamaSession(modelPath, TRANSLATE_CONTEXT_SIZE), borrowed: true };
    }
  } else if (!isTranslateAvailable()) {
    throw new LocalModelMissingError();
  }
  return { session: await ensureSession(), borrowed: false };
}

/**
 * Generic local-Qwen completion for Card Studio / sentence analysis / the Agent's local chat.
 * Shares the Translate session so we never load two GGUFs at once — unless the caller names a
 * different model, which is then borrowed for the one prompt.
 */
export async function runLocalQwenPrompt(
  prompt: string,
  options?: LocalQwenPromptOptions,
): Promise<string> {
  if (!options?.modelFileName?.trim() && !isTranslateAvailable()) {
    throw new LocalModelMissingError();
  }
  const requestedTokens = Math.max(64, Math.min(8192, options?.maxTokens ?? 2048));
  const timeoutMs = Math.max(5_000, options?.timeoutMs ?? 90_000);
  return enqueue(async () => {
    const { session: s, borrowed } = await borrowSessionFor(options?.modelFileName);
    // Independent of EPUB batch cancel — analysis/enrichment must not abort mid-flight
    // just because a translation batch was cancelled elsewhere.
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(options?.signal?.reason);
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      if (options?.signal?.aborted) {
        throw new Error('Local Qwen request was cancelled.');
      }
      options?.signal?.addEventListener('abort', abort, { once: true });
      // Armed before the tokenizer is asked: a host that stopped answering must hit this deadline,
      // not hang the queue in `countTokens`.
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(Object.assign(new Error('timed out'), { name: 'AbortError' }));
        }, timeoutMs);
      });
      void expired.catch(() => undefined);
      const aborted = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        controller.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
      void aborted.catch(() => undefined);
      // After the session exists, so the weights — and therefore the real tokenizer — are loaded.
      // The callers of this function are the ones that could ask for a whole context of output.
      const maxTokens = await Promise.race([fitOutputBudget(prompt, requestedTokens, s), expired, aborted]);
      const raw = await s.prompt(prompt, {
        maxTokens,
        signal: controller.signal,
        onTextChunk: options?.onTextChunk,
      });
      const cleaned = cleanLlmOutput(raw);
      return options?.raw ? cleaned : extractJsonish(cleaned);
    } catch (err) {
      if (!borrowed) dropLostSession(s, err);
      if (err instanceof Error && err.name === 'AbortError') {
        if (!timedOut) throw new Error('Local Qwen request was cancelled.');
        throw new Error(`Local Qwen timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      // The typed failure survives: the Agent and the analysis panels branch on it.
      if (err instanceof LocalModelMissingError) throw err;
      throw err instanceof Error ? new Error(friendlyError(err)) : err;
    } finally {
      if (timer) clearTimeout(timer);
      options?.signal?.removeEventListener('abort', abort);
      resetSessionHistory(s);
      if (borrowed) void s.release().catch(() => undefined);
    }
  });
}

/**
 * Prefer a JSON object/array if the model wrapped it in prose or fences.
 *
 * Only for callers that asked for JSON. Exported so the chat path's test can show what it is
 * protected from.
 */
export function extractJsonish(cleaned: string): string {
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
  return (await translateTextDetailed(text, source, target, onPartial, hints)).text;
}

/**
 * The passage translation plus the sentence pairs it was built from.
 *
 * The model already translates one sentence at a time; the alignment used to be
 * thrown away by the final `join`. Keeping it is what lets the Translate view
 * show source and translation side by side, sentence by sentence, and mine one
 * sentence rather than the whole paste.
 */
export interface TranslateDetailedOptions {
  /**
   * A GGUF other than the default small model — the "higher quality" tier. It is
   * borrowed for this passage and released after, like `runLocalQwenPrompt`'s.
   * Missing on disk is a `LocalModelMissingError`, never a quiet fallback.
   */
  modelFileName?: string;
  /** Each sentence the moment it is translated, so the UI can show it before the passage ends. */
  onSegment?: (index: number, segment: TranslateSegment, total: number) => void;
}

export async function translateTextDetailed(
  text: string,
  source: TransLang,
  target: TransLang,
  onPartial?: (progress: number) => void,
  hints?: readonly TranslateSenseHint[],
  style: TranslateStyle = 'natural',
  options?: TranslateDetailedOptions,
): Promise<{ text: string; segments: TranslateSegment[] }> {
  if (!text.trim()) return { text, segments: [] };
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
  if (source === target) return { text, segments: [] };

  const parts = sentences(text);
  if (parts.length === 0) return { text: '', segments: [] };

  const out: string[] = [];
  const segments: TranslateSegment[] = [];
  let translatedCount = 0;
  const borrowed = options?.modelFileName ? await borrowSessionFor(options.modelFileName) : null;
  try {
    for (let i = 0; i < parts.length; i++) {
      // Hints apply to every sentence of the passage: a pin is recorded against a
      // headword, not an offset, so a word pinned once is pinned wherever the
      // splitter happens to have cut.
      const translated = await enqueue(() => translateSentence(
        parts[i], source, target, hints, style, borrowed?.borrowed ? borrowed.session : undefined,
      ));
      // An untranslatable sentence is dropped rather than back-filled with its
      // own source text: a Japanese clause sitting inside an English paragraph
      // reads as part of the translation.
      if (translated) {
        out.push(translated);
        translatedCount += 1;
      }
      const segment = { source: parts[i], target: translated };
      segments.push(segment);
      onPartial?.((i + 1) / parts.length);
      try {
        options?.onSegment?.(i, segment, parts.length);
      } catch {
        /* a display listener must never change what is translated */
      }
    }
  } finally {
    if (borrowed?.borrowed) void borrowed.session.release().catch(() => undefined);
  }
  if (translatedCount === 0) {
    throw new Error('The translation model returned no usable output for this text.');
  }
  return { text: out.join(' '), segments };
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
  // The provider choice, consent and fallback channels live with the router.
  registerTranslateProviderIpc();

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
        style?: unknown;
        /** An explicit engine for this request; otherwise the pair's saved choice (translateRouter). */
        provider?: unknown;
        /** Glossary terms; main keeps only the ones that occur in `text`. */
        glossary?: unknown;
      },
    ): Promise<{
      ok: boolean;
      text?: string;
      segments?: TranslateSegment[];
      meta?: TranslateResultMeta;
      error?: string;
      errorKey?: string;
      failure?: TranslateRouteFailure;
    }> => {
      // Each sentence goes to the window the moment it exists: the local model
      // finishes one at a time, a streamed cloud reply one line at a time.
      const onSegment = (index: number, segment: TranslateSegment, total: number): void => {
        try {
          e.sender.send('translate:partial', {
            id: req.id,
            progress: total > 0 ? (index + 1) / total : 1,
            segment: { index, total, source: segment.source, target: segment.target },
          });
        } catch {
          /* the window closed mid-translation */
        }
      };
      try {
        // Sanitized rather than trusted: the hints reach the prompt verbatim, so
        // an unbounded list from a renderer would crowd out the passage itself.
        const hints = sanitizeSenseHints(req.senseHints);
        const known = (code: unknown): boolean => typeof code === 'string' && !!langSpec(code);
        if (typeof req.text !== 'string' || !known(req.source) || !known(req.target) || req.source === req.target) {
          // The router only adds engines; the offline path's own validation and
          // same-language answer stay exactly what they were.
          const { text, segments } = await translateTextDetailed(
            req.text, req.source, req.target, undefined, hints, sanitizeTranslateStyle(req.style),
          );
          return segments.length ? { ok: true, text, segments } : { ok: true, text };
        }
        const routed = await routeTranslation({
          text: req.text,
          source: req.source,
          target: req.target,
          hints,
          style: sanitizeTranslateStyle(req.style),
          provider: req.provider,
          glossary: req.glossary,
          onSegment,
        }, {
          local: (args) => translateTextDetailed(args.text, args.source, args.target, undefined, args.hints, args.style, {
            ...(args.modelFileName ? { modelFileName: args.modelFileName } : {}),
            ...(args.onSegment ? { onSegment: args.onSegment } : {}),
          }),
          localAvailable: isTranslateAvailable,
        });
        return {
          ok: true,
          text: routed.text,
          ...(routed.segments.length ? { segments: routed.segments } : {}),
          meta: routed.meta,
        };
      } catch (err) {
        console.error('[translate]', err);
        if (err instanceof TranslateRouteError) {
          return {
            ok: false,
            error: err.message,
            errorKey: 'xlate2.error.cloud',
            failure: { provider: err.provider, code: err.code },
          };
        }
        const errorKey = friendlyErrorKey(err);
        return { ok: false, error: friendlyError(err), ...(errorKey ? { errorKey } : {}) };
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
      results?: TranslateBatchItemResult[];
      error?: string;
      cancelled?: boolean;
      /** Set when nothing translated: why, so the caller can offer the right fix. */
      failure?: TranslateBatchFailure;
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
        const failure = summarizeTranslateFailure(results);
        return { ok: true, results, ...(failure ? { failure } : null) };
      } catch (err) {
        console.error('[translate:runBatch]', err);
        return { ok: false, error: friendlyError(err), failure: classifyTranslateError(err) };
      }
    },
  );

  ipcMain.handle('translate:cancelBatch', () => {
    cancelTranslationBatch();
    return { ok: true };
  });
}
