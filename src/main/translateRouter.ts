/**
 * Routes an interactive translation to the engine the user chose for its
 * language pair: the offline model (default), a larger offline model, or an
 * opt-in cloud provider — and back to the offline model when a cloud provider
 * cannot answer.
 *
 * Nothing in this module sends text anywhere unless BOTH are true, checked here
 * in main rather than trusted from the renderer:
 *
 *   1. the provider is a cloud provider the user explicitly consented to
 *      (`TranslateProviderSettings.consent`, written only by the consent IPC);
 *   2. it has a key in the vault (or the documented env override).
 *
 * And what is sent is the passage plus only the glossary terms that occur in
 * it — never the glossary as a whole, the history, or anything about the deck.
 *
 * Cloud spending reuses the app's existing controls: LLM providers go through
 * `runCloudAiRequest` (per-request cost cap, monthly ceiling, ledger, retries),
 * and DeepL — which is not an LLM and has no body for that runtime to build —
 * asks the same monthly ceiling through `cloudSpendAllows` and is paced by the
 * same `RateLimiter` the metadata providers use.
 *
 * The offline engine is injected (`TranslateRouterDeps.local`) rather than
 * imported: `translate.ts` owns the model and registers the IPC, and passing
 * its runner in keeps the dependency one-way and the router testable without
 * a model.
 */
import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import type { AiProviderId } from '../shared/aiProviders';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { installedFileNameFor, LOCAL_AGENT_MODEL_CATALOG } from '../shared/localAgentModels';
import {
  MAX_SENSE_HINTS,
  splitTranslationSentences,
  type TranslateSegment,
  type TranslateSenseHint,
  type TranslateStyle,
} from '../shared/translateCore';
import {
  applyGlossaryPostEdit,
  glossaryCoverage,
  mergeGlossaryHints,
  protectGlossaryForDeepl,
  sanitizeGlossaryTerms,
  unprotectDeeplOutput,
  GLOSSARY_IGNORE_TAG,
  type TranslateGlossaryTerm,
} from '../shared/translateGlossary';
import {
  CLOUD_TRANSLATE_MAX_CHARS,
  CLOUD_TRANSLATE_SYSTEM_PROMPT,
  LARGE_TRANSLATE_MODEL_IDS,
  TRANSLATE_PAIR_CHOICE,
  TRANSLATE_PROVIDERS,
  buildCloudTranslatePrompt,
  createCloudLineStream,
  deeplApiBase,
  deeplEstimatedCostUsd,
  deeplLangCode,
  defaultTranslateProviderSettings,
  hasTranslateConsent,
  isCloudTranslateProvider,
  isTranslateProviderId,
  joinTranslatedSentences,
  normalizeTranslateProviderSettings,
  parseCloudTranslateLines,
  parseDeeplTranslations,
  providerForPair,
  translateFallbackCodeFor,
  withPairProvider,
  withTranslateConsent,
  type TranslateEngineAttempt,
  type TranslateFallbackCode,
  type TranslateProviderAvailability,
  type TranslateProviderId,
  type TranslateProviderSettings,
  type TranslateProviderSnapshot,
  type TranslateResultMeta,
} from '../shared/translateProviders';
import { TranslateResultCache, translateCacheKey } from '../shared/translateCache';
import {
  deeplOptionsCacheVariant,
  deeplRequestFields,
  normalizeDeeplOptions,
  type DeeplOptions,
} from '../shared/translateDeeplOptions';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { readSecret } from './credentials/vault';
import { listLocalModelFiles, resolveQwenSmallModelPath } from './localModelFiles';
import { RateLimiter } from './providers/providerHttp';
import {
  AiProviderRuntimeError,
  cloudSpendAllows,
  getAiProviderHealth,
  recordCloudSpend,
  runCloudAiRequest,
} from './providerRuntime';

/** One finished sentence, reported the moment it exists (progressive display). */
export type TranslateSegmentListener = (index: number, segment: TranslateSegment, total: number) => void;

export interface LocalTranslateArgs {
  text: string;
  source: string;
  target: string;
  hints: TranslateSenseHint[];
  style: TranslateStyle;
  /** A GGUF other than the default small model: the higher-quality local tier. */
  modelFileName?: string;
  onSegment?: TranslateSegmentListener;
  /** The user's cancel (risk4); the runner stops between sentences. */
  signal?: AbortSignal;
}

export type LocalTranslateRunner = (args: LocalTranslateArgs) => Promise<{ text: string; segments: TranslateSegment[] }>;

export interface TranslateRouterDeps {
  local: LocalTranslateRunner;
  /** Whether the default offline model is on disk (the fallback's precondition). */
  localAvailable?: () => boolean;
  /** File name of an installed larger model, or null. */
  largeModel?: () => string | null;
  settings?: () => TranslateProviderSettings;
  readDeeplKey?: () => string;
  /** DeepL's formality and context (`translate/deepl-options.json`). */
  deeplOptions?: () => DeeplOptions;
  /** File name of the default offline model, part of its cache key. */
  smallModel?: () => string | null;
  cloudConfigured?: (id: AiProviderId) => boolean;
  runCloud?: typeof runCloudAiRequest;
  fetchImpl?: typeof fetch;
  spendAllows?: (estimatedCostUsd: number | undefined) => boolean;
  /** Adds a completed DeepL request to the monthly ledger (risk4). */
  recordSpend?: (providerId: 'deepl', costUsd: number | undefined) => void;
  /** Skips the pacing delay; tests only. */
  unpaced?: boolean;
  /**
   * Whether the computer has a network connection (Electron's `net.isOnline`).
   * A cloud engine is not even tried while offline: the reason shown is
   * "you are offline", not a timeout thirty seconds later. Absent = assume online.
   */
  isOnline?: () => boolean;
  /**
   * The interactive result cache (`shared/translateCache.ts`). Absent = no
   * caching, which is what every caller but the Translate IPC wants.
   */
  cache?: TranslateResultCache | null;
}

export interface RoutedTranslateRequest {
  text: string;
  source: string;
  target: string;
  hints?: TranslateSenseHint[];
  style?: TranslateStyle;
  /**
   * A provider id, or `'pair'` for the pair's saved choice (the workbench).
   * Absent means offline: other surfaces never inherit the workbench's cloud choice.
   */
  provider?: unknown;
  /** The renderer's glossary terms. Sanitized here, and only those in the passage are used. */
  glossary?: unknown;
  onSegment?: TranslateSegmentListener;
  /**
   * The user's cancel (risk4). Reaches every engine (the local runner between
   * sentences, the cloud request's fetch), and a cancelled request is never
   * retried on the offline fallback: cancel means stop, not "try elsewhere".
   */
  signal?: AbortSignal;
  /** Skip the cache lookup (the result still refreshes it): "translate this again". */
  fresh?: boolean;
}

/** The user cancelled the translation; nothing is retried or fallen back to. */
export class TranslateCancelledError extends Error {
  constructor() {
    super('Translation cancelled.');
    this.name = 'TranslateCancelledError';
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new TranslateCancelledError();
}

/** The timeout and the user's cancel as one signal, whichever comes first. */
function withCancel(timeoutMs: number, signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  const anyOf = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyOf === 'function') return anyOf([timeout, signal]);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal.aborted || timeout.aborted) controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

export interface RoutedTranslateResult {
  text: string;
  segments: TranslateSegment[];
  meta: TranslateResultMeta;
}

/**
 * A translation that could not be produced by the chosen engine nor by the fallback.
 *
 * `provider`/`code` are the engine the learner asked for and why it failed;
 * `attempts` is every engine tried, in order, so a cloud failure followed by an
 * offline model that could not stand in reads as both, not as whichever came last.
 */
export class TranslateRouteError extends Error {
  readonly attempts: TranslateEngineAttempt[];

  constructor(
    readonly provider: TranslateProviderId,
    readonly code: TranslateFallbackCode,
    message?: string,
    attempts?: TranslateEngineAttempt[],
  ) {
    super(message ?? `Translation with ${provider} failed (${code}).`);
    this.name = 'TranslateRouteError';
    this.attempts = attempts?.length ? attempts : [{ provider, code }];
  }
}

function routeCode(error: unknown, online = true): TranslateFallbackCode {
  if (error instanceof TranslateRouteError) return error.code;
  if (error instanceof AiProviderRuntimeError) {
    const code = translateFallbackCodeFor(error.code);
    return code === 'network' && !online ? 'offline' : code;
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return online ? 'timeout' : 'offline';
  // `fetch` rejects with a TypeError when the request never got a response.
  if (error instanceof TypeError) return online ? 'network' : 'offline';
  return 'other';
}

/** Why the offline model could not stand in. Its errors are English prose; this is all the UI needs. */
function localFailureCode(error: unknown): TranslateFallbackCode {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/not (?:installed|found)|no (?:translation )?model|missing/i.test(message)) return 'not-installed';
  return 'other';
}

// ---------------------------------------------------------------------------
// Settings store
// ---------------------------------------------------------------------------

let settingsCache: TranslateProviderSettings | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'translate', 'providers.json');
}

export function readTranslateProviderSettings(): TranslateProviderSettings {
  if (settingsCache) return settingsCache;
  try {
    settingsCache = normalizeTranslateProviderSettings(
      readJsonSync<unknown>(settingsPath(), () => defaultTranslateProviderSettings()),
    );
  } catch {
    // No userData (a unit test, a broken profile): defaults for this session, never a failed translation.
    settingsCache = defaultTranslateProviderSettings();
  }
  return settingsCache;
}

function writeTranslateProviderSettings(next: TranslateProviderSettings): void {
  settingsCache = next;
  try {
    writeJsonAtomicSync(settingsPath(), next, { space: 2 });
  } catch {
    /* kept in memory for this session; the choice still applies until restart */
  }
}

/** Test seam: forget the cached settings so the next read goes to disk. */
export function resetTranslateProviderSettingsCache(): void {
  settingsCache = null;
  deeplOptionsCache = null;
}

// DeepL's formality and context live in their own file: they are DeepL's alone, and the
// provider settings file is shared with every engine.
let deeplOptionsCache: DeeplOptions | null = null;

function deeplOptionsPath(): string {
  return path.join(app.getPath('userData'), 'translate', 'deepl-options.json');
}

export function readDeeplOptions(): DeeplOptions {
  if (deeplOptionsCache) return deeplOptionsCache;
  try {
    deeplOptionsCache = normalizeDeeplOptions(readJsonSync<unknown>(deeplOptionsPath(), () => ({})));
  } catch {
    deeplOptionsCache = normalizeDeeplOptions(null);
  }
  return deeplOptionsCache;
}

export function writeDeeplOptions(raw: unknown): DeeplOptions {
  const next = normalizeDeeplOptions(raw);
  deeplOptionsCache = next;
  try {
    writeJsonAtomicSync(deeplOptionsPath(), next, { space: 2 });
  } catch {
    /* kept in memory for this session */
  }
  return next;
}

function defaultSmallModel(): string | null {
  const small = resolveQwenSmallModelPath();
  return small ? path.basename(small) : null;
}

// ---------------------------------------------------------------------------
// What is installed / configured
// ---------------------------------------------------------------------------

/** The installed larger Qwen3 model the "higher quality" tier would run, or null. */
export function resolveLargeTranslateModelFile(installedFileNames?: readonly string[]): string | null {
  const installed = installedFileNames ?? listLocalModelFiles().map((model) => model.fileName);
  for (const id of LARGE_TRANSLATE_MODEL_IDS) {
    const spec = LOCAL_AGENT_MODEL_CATALOG.find((model) => model.id === id);
    const name = spec ? installedFileNameFor(spec, installed) : null;
    if (name) return name;
  }
  return null;
}

function deeplKey(): string {
  try {
    return readSecret('deepl', 'apiKey').trim();
  } catch {
    return '';
  }
}

function cloudKeyConfigured(id: AiProviderId): boolean {
  try {
    return getAiProviderHealth(id).configured;
  } catch {
    return false;
  }
}

export function translateProviderSnapshot(): TranslateProviderSnapshot {
  const settings = readTranslateProviderSettings();
  const small = resolveQwenSmallModelPath();
  const large = resolveLargeTranslateModelFile();
  const providers: TranslateProviderAvailability[] = TRANSLATE_PROVIDERS.map((def) => {
    const consented = hasTranslateConsent(settings, def.id);
    if (def.id === 'local') {
      return small
        ? { id: def.id, ready: true, consented, modelFileName: path.basename(small) }
        : { id: def.id, ready: false, reason: 'not-installed', consented };
    }
    if (def.id === 'local-large') {
      return large
        ? { id: def.id, ready: true, consented, modelFileName: large }
        : { id: def.id, ready: false, reason: 'not-installed', consented };
    }
    const ready = def.id === 'deepl' ? Boolean(deeplKey()) : cloudKeyConfigured(def.id as AiProviderId);
    return ready ? { id: def.id, ready, consented } : { id: def.id, ready, reason: 'no-key', consented };
  });
  return { settings, providers };
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

const limiters = new Map<string, RateLimiter>();

async function pace(id: TranslateProviderId, deps: TranslateRouterDeps): Promise<void> {
  if (deps.unpaced) return;
  let limiter = limiters.get(id);
  if (!limiter) {
    // A person translating by hand never needs more than this; a runaway clipboard
    // watcher or a stuck key repeat does, and is exactly what this stops.
    limiter = new RateLimiter(2, 40);
    limiters.set(id, limiter);
  }
  await limiter.take();
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

interface EngineInput {
  text: string;
  sentences: string[];
  source: string;
  target: string;
  style: TranslateStyle;
  hints: TranslateSenseHint[];
  terms: TranslateGlossaryTerm[];
  onSegment?: TranslateSegmentListener;
  signal?: AbortSignal;
  /** DeepL's request options, read once per request (so the cache key and the body agree). */
  deepl?: DeeplOptions;
}

/** An engine's answer. `missing` lists the sentences (0-based) it could not translate. */
interface EngineResult {
  text: string;
  segments: TranslateSegment[];
  missing?: number[];
}

async function translateWithCloudLlm(
  providerId: AiProviderId,
  input: EngineInput,
  deps: TranslateRouterDeps,
  fresh = false,
): Promise<EngineResult> {
  if (!(deps.cloudConfigured ?? cloudKeyConfigured)(providerId)) throw new TranslateRouteError(providerId, 'no-key');
  const { sentences, source, target } = input;
  const total = sentences.length;
  const results: string[] = sentences.map(() => '');
  const accept = (index: number, text: string): void => {
    if (results[index] || !isValidCrossLangTranslation(source, target, sentences[index], text)) return;
    results[index] = text;
    input.onSegment?.(index, { source: sentences[index], target: text }, total);
  };
  const ask = async (indices: number[], onLine: (index: number, text: string) => void, retry: boolean): Promise<void> => {
    const subset = indices.map((index) => sentences[index]);
    const stream = createCloudLineStream(subset.length, (n, text) => onLine(indices[n], text));
    await pace(providerId, deps);
    const response = await (deps.runCloud ?? runCloudAiRequest)({
      providerId,
      prompt: buildCloudTranslatePrompt(subset, source, target, input.style, input.hints),
      systemPrompt: CLOUD_TRANSLATE_SYSTEM_PROMPT,
      // Generous: Gemini spends part of this on thinking, and a cut-off answer is a
      // failed translation. The preflight prices the worst case against the ceiling.
      maxOutputTokens: Math.min(16_384, 2_048 + subset.join('').length * 6),
      temperature: 0.2,
      retryAttempts: 1,
      timeoutMs: 90_000,
      // The runtime's session cache would hand back the same incomplete reply
      // for a retry or a "translate again": both go to the provider.
      cache: retry || fresh ? 'off' : 'session',
      onTextChunk: (chunk) => stream.push(chunk),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    stream.flush();
    // A cache hit, or a provider that answered unstreamed, delivers everything here.
    for (const [n, text] of parseCloudTranslateLines(response.text, subset.length)) onLine(indices[n], text);
  };
  await ask(sentences.map((_, index) => index), accept, false);
  if (results.every((text) => !text)) throw new TranslateRouteError(providerId, 'invalid');
  // A reply that skipped sentences is not a translation of the passage. The
  // skipped ones are asked for once more on their own; whatever is still
  // missing after that is reported, never papered over.
  let missing = results.flatMap((text, index) => (text ? [] : [index]));
  if (missing.length) {
    throwIfCancelled(input.signal);
    try {
      await ask(missing, accept, true);
    } catch {
      if (input.signal?.aborted) throw new TranslateCancelledError();
      // The first answer stands, marked partial; the retry's failure is not the passage's.
    }
    missing = results.flatMap((text, index) => (text ? [] : [index]));
  }
  const segments = sentences.map((sentence, index) => ({ source: sentence, target: results[index] }));
  return { text: joinTranslatedSentences(results, target), segments, ...(missing.length ? { missing } : {}) };
}

function deeplStatusCode(status: number): TranslateFallbackCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status === 456) return 'quota';
  if (status === 413 || status === 414) return 'too-long';
  if (status >= 500) return 'network';
  return 'other';
}

async function translateWithDeepl(
  input: EngineInput,
  deps: TranslateRouterDeps,
): Promise<{ text: string; segments: TranslateSegment[] }> {
  const key = (deps.readDeeplKey ?? deeplKey)().trim();
  if (!key) throw new TranslateRouteError('deepl', 'no-key');
  const sourceLang = deeplLangCode(input.source, 'source');
  const targetLang = deeplLangCode(input.target, 'target');
  if (!sourceLang || !targetLang) throw new TranslateRouteError('deepl', 'unsupported');
  const { sentences, terms } = input;
  // One text, one sentence per line: DeepL keeps the passage's context across
  // sentences, and the newlines it preserves give the alignment back.
  const joined = sentences.map((sentence) => sentence.replace(/\s*\n\s*/g, ' ')).join('\n');
  // DeepL bills source characters; the plan (Free `:fx` key, or Pro) sets the
  // rate. Priced from what is actually sent, checked against the monthly
  // ceiling first and added to the ledger once DeepL accepts it (risk4).
  const costUsd = deeplEstimatedCostUsd(key, Math.max(joined.length, input.text.length));
  if (!(deps.spendAllows ?? cloudSpendAllows)(costUsd)) {
    throw new TranslateRouteError('deepl', 'spend');
  }
  const body: Record<string, unknown> = {
    text: [terms.length ? protectGlossaryForDeepl(joined, terms) : joined],
    source_lang: sourceLang,
    target_lang: targetLang,
    preserve_formatting: true,
    // The learner's formality and context (Translate > Engine > DeepL options). They were stored
    // nowhere and sent never, so every DeepL translation was DeepL's default register.
    ...deeplRequestFields(input.deepl ?? (deps.deeplOptions ?? readDeeplOptions)()),
    ...(terms.length ? { tag_handling: 'xml', ignore_tags: [GLOSSARY_IGNORE_TAG] } : {}),
  };
  await pace('deepl', deps);
  throwIfCancelled(input.signal);
  const response = await (deps.fetchImpl ?? fetch)(`${deeplApiBase(key)}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: withCancel(30_000, input.signal),
  });
  if (!response.ok) throw new TranslateRouteError('deepl', deeplStatusCode(response.status));
  // Accepted means billed, whatever the body turns out to hold. A ledger that
  // cannot be written is a bookkeeping loss, never a failed translation.
  try {
    (deps.recordSpend ?? recordCloudSpend)('deepl', costUsd);
  } catch {
    /* the guard logs its own failures */
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new TranslateRouteError('deepl', 'invalid');
  }
  const translated = parseDeeplTranslations(json, 1);
  if (!translated) throw new TranslateRouteError('deepl', 'invalid');
  const text = terms.length ? unprotectDeeplOutput(translated[0]) : translated[0].trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const segments: TranslateSegment[] = lines.length === sentences.length
    ? sentences.map((sentence, index) => ({ source: sentence, target: lines[index] }))
    : [{ source: input.text, target: lines.join(' ') }];
  if (!segments.some((segment) => isValidCrossLangTranslation(input.source, input.target, segment.source, segment.target))) {
    throw new TranslateRouteError('deepl', 'invalid');
  }
  segments.forEach((segment, index) => input.onSegment?.(index, segment, segments.length));
  return { text: joinTranslatedSentences(segments.map((segment) => segment.target), input.target), segments };
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

function finish(
  raw: { text: string; segments: TranslateSegment[] },
  terms: TranslateGlossaryTerm[],
  target: string,
  meta: TranslateResultMeta,
): RoutedTranslateResult {
  if (!terms.length) return { text: raw.text, segments: raw.segments, meta };
  const segments = raw.segments.map((segment) => ({
    source: segment.source,
    target: segment.target ? applyGlossaryPostEdit(segment.target, terms, target) : segment.target,
  }));
  const text = segments.length
    ? joinTranslatedSentences(segments.map((segment) => segment.target), target)
    : applyGlossaryPostEdit(raw.text, terms, target);
  return { text, segments, meta: { ...meta, glossary: glossaryCoverage(text, terms) } };
}

export async function routeTranslation(
  req: RoutedTranslateRequest,
  deps: TranslateRouterDeps,
): Promise<RoutedTranslateResult> {
  const settings = (deps.settings ?? readTranslateProviderSettings)();
  const { text, source, target } = req;
  const style: TranslateStyle = req.style === 'literal' ? 'literal' : 'natural';
  // An explicit engine, the pair's saved engine when the workbench asks for it,
  // and offline for every other surface (see `TRANSLATE_PAIR_CHOICE`).
  const requested: TranslateProviderId = isTranslateProviderId(req.provider)
    ? req.provider
    : req.provider === TRANSLATE_PAIR_CHOICE
      ? providerForPair(settings, source, target)
      : 'local';
  // Only the terms that occur in this passage — a glossary is the learner's, and
  // the parts unrelated to this text have no business leaving the device.
  const terms = sanitizeGlossaryTerms(req.glossary).filter((term) => text.includes(term.source));
  const hints = mergeGlossaryHints(terms, req.hints, MAX_SENSE_HINTS);
  const localAvailable = deps.localAvailable ?? ((): boolean => resolveQwenSmallModelPath() !== null);

  const signal = req.signal;
  throwIfCancelled(signal);
  const online = (): boolean => {
    try {
      return deps.isOnline ? deps.isOnline() !== false : true;
    } catch {
      return true;
    }
  };
  const runLocal = async (modelFileName?: string) => {
    throwIfCancelled(signal);
    try {
      return await deps.local({
        text, source, target, hints, style, onSegment: req.onSegment,
        ...(modelFileName ? { modelFileName } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throwIfCancelled(signal);
      throw error;
    }
  };

  // ---- cache ----
  const cache = deps.cache ?? null;
  // `variant` is whatever else decides the answer besides the passage: the model file of a local
  // engine (the default one's too, so installing another small model is not served the old one's
  // answers) and DeepL's formality and context.
  const deeplOptions = requested === 'deepl' ? (deps.deeplOptions ?? readDeeplOptions)() : undefined;
  const smallModel = (): string => {
    try {
      return (deps.smallModel ?? defaultSmallModel)() ?? '';
    } catch {
      return '';
    }
  };
  const variantFor = (provider: TranslateProviderId, modelFileName?: string): string | undefined => {
    if (modelFileName) return modelFileName;
    if (provider === 'local') return smallModel() || undefined;
    if (provider === 'deepl' && deeplOptions) return deeplOptionsCacheVariant(deeplOptions) || undefined;
    return undefined;
  };
  const keyFor = (provider: TranslateProviderId, modelFileName?: string): string => {
    const variant = variantFor(provider, modelFileName);
    return translateCacheKey({
      provider, source, target, style, text, terms, hints, ...(variant ? { modelFileName: variant } : {}),
    });
  };
  const fromCache = (provider: TranslateProviderId, modelFileName?: string): RoutedTranslateResult | null => {
    if (!cache || req.fresh) return null;
    const hit = cache.get(keyFor(provider, modelFileName));
    if (!hit) return null;
    // The progressive display gets every sentence at once, as if it had streamed.
    hit.segments.forEach((segment, index) => req.onSegment?.(index, segment, hit.segments.length));
    return { text: hit.text, segments: hit.segments, meta: { ...hit.meta, cached: true } };
  };
  const remember = (provider: TranslateProviderId, result: RoutedTranslateResult, modelFileName?: string): void => {
    if (!cache || !result.text.trim()) return;
    // Stored as the engine's own answer: no fallback story, no cache flag.
    const meta: TranslateResultMeta = { provider, ...(result.meta.glossary ? { glossary: result.meta.glossary } : {}) };
    cache.set(keyFor(provider, modelFileName), { text: result.text, segments: result.segments, meta });
  };

  /**
   * The offline model standing in after `attempts` failed. A stand-in that
   * fails too is reported with the whole chain — the cloud engine's reason and
   * the offline model's — never only the last one.
   */
  const fallBackToLocal = async (attempts: TranslateEngineAttempt[]): Promise<RoutedTranslateResult> => {
    const [first] = attempts;
    try {
      const done = finish(await runLocal(), terms, target, {
        provider: 'local', fallbackFrom: first.provider, fallbackCode: first.code, attempts,
      });
      // A real offline translation of this passage: the next offline request hits.
      remember('local', done);
      return done;
    } catch (error) {
      if (error instanceof TranslateCancelledError || signal?.aborted) throw new TranslateCancelledError();
      throw new TranslateRouteError(first.provider, first.code, undefined, [
        ...attempts,
        { provider: 'local', code: localFailureCode(error) },
      ]);
    }
  };

  if (requested === 'local') {
    const hit = fromCache('local');
    if (hit) return hit;
    const done = finish(await runLocal(), terms, target, { provider: 'local' });
    remember('local', done);
    return done;
  }

  if (requested === 'local-large') {
    const large = (deps.largeModel ?? resolveLargeTranslateModelFile)();
    if (large) {
      const hit = fromCache('local-large', large);
      if (hit) return hit;
      const done = finish(await runLocal(large), terms, target, { provider: 'local-large' });
      remember('local-large', done, large);
      return done;
    }
    const attempts: TranslateEngineAttempt[] = [{ provider: 'local-large', code: 'not-installed' }];
    if (!settings.fallbackToLocal) throw new TranslateRouteError('local-large', 'not-installed');
    if (!localAvailable()) {
      throw new TranslateRouteError('local-large', 'not-installed', undefined, [...attempts, { provider: 'local', code: 'not-installed' }]);
    }
    return fallBackToLocal(attempts);
  }

  // Cloud. Consent is checked before anything else, so a refused request has
  // not touched the network, the key, the limiter or the ledger.
  try {
    if (!isCloudTranslateProvider(requested) || !hasTranslateConsent(settings, requested)) {
      throw new TranslateRouteError(requested, 'consent');
    }
    if (text.length > CLOUD_TRANSLATE_MAX_CHARS) throw new TranslateRouteError(requested, 'too-long');
    const hit = fromCache(requested);
    if (hit) return hit;
    // Offline: say so now instead of a timeout half a minute from now.
    if (!online()) throw new TranslateRouteError(requested, 'offline');
    const sentences = splitTranslationSentences(text);
    if (!sentences.length) return { text: '', segments: [], meta: { provider: requested } };
    const input: EngineInput = {
      text,
      sentences,
      source,
      target,
      style,
      hints,
      terms,
      onSegment: req.onSegment,
      ...(signal ? { signal } : {}),
      ...(deeplOptions ? { deepl: deeplOptions } : {}),
    };
    const raw: EngineResult = requested === 'deepl'
      ? await translateWithDeepl(input, deps)
      : await translateWithCloudLlm(requested as AiProviderId, input, deps, req.fresh === true);
    throwIfCancelled(signal);
    const missing = raw.missing ?? [];
    const done = finish(raw, terms, target, {
      provider: requested,
      ...(missing.length ? { partial: { missing, total: sentences.length } } : {}),
    });
    // An incomplete answer is shown as such and never cached: the next request asks again.
    if (!missing.length) remember(requested, done);
    return done;
  } catch (error) {
    // Cancelled: stop. Never re-run the passage on the offline fallback.
    if (error instanceof TranslateCancelledError || signal?.aborted) throw new TranslateCancelledError();
    const code = routeCode(error, online());
    const attempts: TranslateEngineAttempt[] = [{ provider: requested, code }];
    const failed = (chain: TranslateEngineAttempt[]): TranslateRouteError => (
      error instanceof TranslateRouteError && chain.length === 1
        ? error
        : new TranslateRouteError(requested, code, error instanceof TranslateRouteError ? error.message : undefined, chain)
    );
    if (!settings.fallbackToLocal) throw failed(attempts);
    if (!localAvailable()) throw failed([...attempts, { provider: 'local', code: 'not-installed' }]);
    return fallBackToLocal(attempts);
  }
}

/**
 * The Translate workbench's cache, shared by every window (main owns it so a
 * passage translated in one window is instant in another). See
 * `shared/translateCache.ts` for its bounds.
 */
export const workbenchTranslateCache = new TranslateResultCache();

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function broadcastProviders(snapshot: TranslateProviderSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('translate:providersChanged', snapshot);
    } catch {
      /* a closing window */
    }
  }
}

function update(next: TranslateProviderSettings): TranslateProviderSnapshot {
  writeTranslateProviderSettings(next);
  const snapshot = translateProviderSnapshot();
  broadcastProviders(snapshot);
  return snapshot;
}

export function registerTranslateProviderIpc(): void {
  ipcMain.handle('translate:providers', (): TranslateProviderSnapshot => translateProviderSnapshot());

  ipcMain.handle(
    'translate:setPairProvider',
    (_event, source: unknown, target: unknown, provider: unknown): TranslateProviderSnapshot => {
      const settings = readTranslateProviderSettings();
      if (typeof source !== 'string' || typeof target !== 'string' || !isTranslateProviderId(provider)) {
        return translateProviderSnapshot();
      }
      // A cloud choice without consent is refused here, not only hidden in the UI.
      if (!hasTranslateConsent(settings, provider)) return translateProviderSnapshot();
      return update(withPairProvider(settings, source, target, provider));
    },
  );

  ipcMain.handle(
    'translate:setProviderConsent',
    (_event, provider: unknown, granted: unknown): TranslateProviderSnapshot => {
      if (!isCloudTranslateProvider(provider)) return translateProviderSnapshot();
      return update(withTranslateConsent(readTranslateProviderSettings(), provider, granted === true, Date.now()));
    },
  );

  ipcMain.handle('translate:deeplOptions', (): DeeplOptions => readDeeplOptions());
  ipcMain.handle('translate:setDeeplOptions', (_event, options: unknown): DeeplOptions => writeDeeplOptions(options));

  ipcMain.handle('translate:setFallback', (_event, on: unknown): TranslateProviderSnapshot => {
    return update({ ...readTranslateProviderSettings(), fallbackToLocal: on !== false });
  });
}
