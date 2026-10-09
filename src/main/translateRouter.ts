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
  type TranslateFallbackCode,
  type TranslateProviderAvailability,
  type TranslateProviderId,
  type TranslateProviderSettings,
  type TranslateProviderSnapshot,
  type TranslateResultMeta,
} from '../shared/translateProviders';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { readSecret } from './credentials/vault';
import { listLocalModelFiles, resolveQwenSmallModelPath } from './localModelFiles';
import { RateLimiter } from './providers/providerHttp';
import { AiProviderRuntimeError, cloudSpendAllows, getAiProviderHealth, runCloudAiRequest } from './providerRuntime';

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
  cloudConfigured?: (id: AiProviderId) => boolean;
  runCloud?: typeof runCloudAiRequest;
  fetchImpl?: typeof fetch;
  spendAllows?: (estimatedCostUsd: number | undefined) => boolean;
  /** Skips the pacing delay; tests only. */
  unpaced?: boolean;
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
}

export interface RoutedTranslateResult {
  text: string;
  segments: TranslateSegment[];
  meta: TranslateResultMeta;
}

/** A translation that could not be produced by the chosen engine nor by the fallback. */
export class TranslateRouteError extends Error {
  constructor(
    readonly provider: TranslateProviderId,
    readonly code: TranslateFallbackCode,
    message?: string,
  ) {
    super(message ?? `Translation with ${provider} failed (${code}).`);
    this.name = 'TranslateRouteError';
  }
}

function routeCode(error: unknown): TranslateFallbackCode {
  if (error instanceof TranslateRouteError) return error.code;
  if (error instanceof AiProviderRuntimeError) return translateFallbackCodeFor(error.code);
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  if (error instanceof TypeError) return 'network';
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
}

async function translateWithCloudLlm(
  providerId: AiProviderId,
  input: EngineInput,
  deps: TranslateRouterDeps,
): Promise<{ text: string; segments: TranslateSegment[] }> {
  if (!(deps.cloudConfigured ?? cloudKeyConfigured)(providerId)) throw new TranslateRouteError(providerId, 'no-key');
  const { sentences, source, target } = input;
  const total = sentences.length;
  const results: string[] = sentences.map(() => '');
  const accept = (index: number, text: string): void => {
    if (results[index] || !isValidCrossLangTranslation(source, target, sentences[index], text)) return;
    results[index] = text;
    input.onSegment?.(index, { source: sentences[index], target: text }, total);
  };
  const stream = createCloudLineStream(total, accept);
  await pace(providerId, deps);
  const response = await (deps.runCloud ?? runCloudAiRequest)({
    providerId,
    prompt: buildCloudTranslatePrompt(sentences, source, target, input.style, input.hints),
    systemPrompt: CLOUD_TRANSLATE_SYSTEM_PROMPT,
    // Generous: Gemini spends part of this on thinking, and a cut-off answer is a
    // failed translation. The preflight prices the worst case against the ceiling.
    maxOutputTokens: Math.min(16_384, 2_048 + input.text.length * 6),
    temperature: 0.2,
    retryAttempts: 1,
    timeoutMs: 90_000,
    cache: 'session',
    onTextChunk: (chunk) => stream.push(chunk),
  });
  stream.flush();
  // A cache hit, or a provider that answered unstreamed, delivers everything here.
  for (const [index, text] of parseCloudTranslateLines(response.text, total)) accept(index, text);
  if (results.every((text) => !text)) throw new TranslateRouteError(providerId, 'invalid');
  const segments = sentences.map((sentence, index) => ({ source: sentence, target: results[index] }));
  return { text: joinTranslatedSentences(results, target), segments };
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
  if (!(deps.spendAllows ?? cloudSpendAllows)(deeplEstimatedCostUsd(key, input.text.length))) {
    throw new TranslateRouteError('deepl', 'spend');
  }
  const { sentences, terms } = input;
  // One text, one sentence per line: DeepL keeps the passage's context across
  // sentences, and the newlines it preserves give the alignment back.
  const joined = sentences.map((sentence) => sentence.replace(/\s*\n\s*/g, ' ')).join('\n');
  const body: Record<string, unknown> = {
    text: [terms.length ? protectGlossaryForDeepl(joined, terms) : joined],
    source_lang: sourceLang,
    target_lang: targetLang,
    preserve_formatting: true,
    ...(terms.length ? { tag_handling: 'xml', ignore_tags: [GLOSSARY_IGNORE_TAG] } : {}),
  };
  await pace('deepl', deps);
  const response = await (deps.fetchImpl ?? fetch)(`${deeplApiBase(key)}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new TranslateRouteError('deepl', deeplStatusCode(response.status));
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

  const runLocal = (modelFileName?: string) => deps.local({
    text, source, target, hints, style, onSegment: req.onSegment,
    ...(modelFileName ? { modelFileName } : {}),
  });

  if (requested === 'local') return finish(await runLocal(), terms, target, { provider: 'local' });

  if (requested === 'local-large') {
    const large = (deps.largeModel ?? resolveLargeTranslateModelFile)();
    if (large) return finish(await runLocal(large), terms, target, { provider: 'local-large' });
    if (!settings.fallbackToLocal || !localAvailable()) throw new TranslateRouteError('local-large', 'not-installed');
    return finish(await runLocal(), terms, target, {
      provider: 'local', fallbackFrom: 'local-large', fallbackCode: 'not-installed',
    });
  }

  // Cloud. Consent is checked before anything else, so a refused request has
  // not touched the network, the key, the limiter or the ledger.
  try {
    if (!isCloudTranslateProvider(requested) || !hasTranslateConsent(settings, requested)) {
      throw new TranslateRouteError(requested, 'consent');
    }
    if (text.length > CLOUD_TRANSLATE_MAX_CHARS) throw new TranslateRouteError(requested, 'too-long');
    const sentences = splitTranslationSentences(text);
    if (!sentences.length) return { text: '', segments: [], meta: { provider: requested } };
    const input: EngineInput = { text, sentences, source, target, style, hints, terms, onSegment: req.onSegment };
    const raw = requested === 'deepl'
      ? await translateWithDeepl(input, deps)
      : await translateWithCloudLlm(requested as AiProviderId, input, deps);
    return finish(raw, terms, target, { provider: requested });
  } catch (error) {
    const code = routeCode(error);
    if (!settings.fallbackToLocal || !localAvailable()) {
      throw error instanceof TranslateRouteError ? error : new TranslateRouteError(requested, code);
    }
    return finish(await runLocal(), terms, target, { provider: 'local', fallbackFrom: requested, fallbackCode: code });
  }
}

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

  ipcMain.handle('translate:setFallback', (_event, on: unknown): TranslateProviderSnapshot => {
    return update({ ...readTranslateProviderSettings(), fallbackToLocal: on !== false });
  });
}
