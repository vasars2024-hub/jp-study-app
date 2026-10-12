/**
 * The optional AI study helpers (docs/AI_AUDIT.md N1, N2, N3, N5) in main:
 * "Why was I wrong?", i+1 example sentences, leech rescue and "Explain in context".
 *
 * One runner, four feature specs. Every request goes through the same steps
 * (the `mediaStudyAssistant.ts` template):
 *
 *   1. the "Use AI features" switch — off means `aiOff`, and the surface hides;
 *   2. the request is normalized, never trusted;
 *   3. the configured engine: the OFFLINE model needs no opt-in, only its file;
 *      a CLOUD provider needs this feature's own opt-in (Settings > AI) and a key;
 *   4. the cache of validated answers, keyed by feature, prompt version, model
 *      and every prompt input;
 *   5. the call, cancellable from the renderer by request id;
 *   6. zod validates the shape, the feature's own checks validate the content,
 *      and only an answer that passes both is cached or returned.
 *
 * Failures are shared error codes (`shared/aiErrorCodes.ts`), never prose.
 */
import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import { z, type ZodType, type ZodTypeDef } from 'zod';
import { aiErrorCodeOf, type AiErrorCode } from '../shared/aiErrorCodes';
import type { AiProviderId } from '../shared/aiProviders';
import type { AiCloudFeatureId } from '../shared/aiSetup';
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import { normalizeAiStudyRequestId } from '../shared/aiStudyCommon';
import {
  WHY_WRONG_CONFUSIONS,
  WHY_WRONG_PROMPT_VERSION,
  WHY_WRONG_SCHEMA,
  buildWhyWrongPrompt,
  finalizeWhyWrongResult,
  isWhyWrongResult,
  normalizeWhyWrongRequest,
  whyWrongKeyParts,
  type WhyWrongRequest,
  type WhyWrongResult,
} from '../shared/aiWhyWrong';
import {
  EXAMPLE_SENTENCES_PROMPT_VERSION,
  EXAMPLE_SENTENCES_SCHEMA,
  buildExampleSentencesPrompt,
  exampleSentencesKeyParts,
  finalizeExampleSentencesResult,
  isExampleSentencesResult,
  normalizeExampleSentencesRequest,
  type ExampleSentencesRequest,
  type ExampleSentencesResult,
} from '../shared/aiExampleSentences';
import {
  LEECH_RESCUE_PROMPT_VERSION,
  LEECH_RESCUE_SCHEMA,
  buildLeechRescuePrompt,
  finalizeLeechRescueSuggestion,
  isLeechRescueSuggestion,
  leechRescueKeyParts,
  normalizeLeechRescueRequest,
  type LeechRescueRequest,
  type LeechRescueSuggestion,
} from '../shared/aiLeechRescue';
import {
  CONTEXT_EXPLAIN_PROMPT_VERSION,
  CONTEXT_EXPLAIN_SCHEMA,
  buildContextExplainPrompt,
  contextExplainKeyParts,
  finalizeContextExplainResult,
  isContextExplainResult,
  normalizeContextExplainRequest,
  type ContextExplainRequest,
  type ContextExplainResult,
} from '../shared/aiContextExplain';
import { callAiProvider } from './aiProviderClient';
import { parseAiReplyWith } from './aiStructuredOutput';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { getConfiguredAiEngine, getConfiguredAiProvider } from './mining';
import {
  AI_CLOUD_FEATURE_OFF_MESSAGE,
  AI_FEATURES_OFF_MESSAGE,
  aiCloudAllowedFor,
  aiFeaturesEnabled,
} from './aiFeatureGate';
import { getAiProviderHealth } from './providerRuntime';

// ---- the feature specs -----------------------------------------------------

// The reply shapes. Lenient where a model's omission is harmless (a missing tip
// is ''), strict where it is not (no explanation is no answer).
const whyWrongValidator = z.object({
  confusion: z.string().transform((value) => (
    (WHY_WRONG_CONFUSIONS as readonly string[]).includes(value) ? value : 'other'
  )),
  explanation: z.string().min(1),
  tip: z.string().optional().default(''),
  acceptable: z.boolean().optional().default(false),
  acceptableReason: z.string().optional().default(''),
});

const exampleSentencesValidator = z.object({
  sentences: z.array(z.object({
    text: z.string(),
    translation: z.string().optional().default(''),
  })).min(1),
});

const leechRescueValidator = z.object({
  mnemonic: z.string(),
  clearerMeaning: z.string().optional().default(''),
  distinction: z.string().optional().default(''),
});

const contextExplainValidator = z.object({
  sense: z.coerce.number().int(),
  explanation: z.string().min(1),
  confidence: z.string().optional().default('low'),
});

/**
 * One optional AI helper, as the shared runner sees it. Exported so the other
 * helper families (`aiTutorAssist.ts`) run through this one runner — the same
 * gates, cache, cancel map and validation — instead of a copy of it.
 */
export interface AiStudyFeatureSpec<Req extends { requestId?: string; refresh?: boolean }, Parsed, Res> {
  /** The feature's own cloud opt-in (Settings > AI) and the spend ledger's label. */
  feature: AiCloudFeatureId;
  promptVersion: number;
  normalize(input: unknown): Req | null;
  keyParts(request: Req): string[];
  prompt(request: Req): string;
  schema: unknown;
  validator: ZodType<Parsed, ZodTypeDef, unknown>;
  /** Content checks after the shape check; `null` is an unusable answer. */
  finalize(parsed: Parsed, request: Req): Res | null;
  /** A cached value is reused only while it still passes. */
  isCached(value: unknown, request: Req): value is Res;
  itemCount: number;
  localMaxTokens: number;
  context: string;
  /**
   * An extra refusal for the CLOUD engine only, checked after the opt-in and
   * before anything is sent (the study-statistics gate). `null` lets it through.
   */
  cloudGate?(request: Req): AiStudyResponse<never> | null;
}

type FeatureSpec<Req extends { requestId?: string; refresh?: boolean }, Parsed, Res> = AiStudyFeatureSpec<Req, Parsed, Res>;

const whyWrongSpec: FeatureSpec<WhyWrongRequest, z.infer<typeof whyWrongValidator>, WhyWrongResult> = {
  feature: 'whyWrong',
  promptVersion: WHY_WRONG_PROMPT_VERSION,
  normalize: normalizeWhyWrongRequest,
  keyParts: whyWrongKeyParts,
  prompt: buildWhyWrongPrompt,
  schema: WHY_WRONG_SCHEMA,
  validator: whyWrongValidator,
  finalize: finalizeWhyWrongResult,
  isCached: (value: unknown): value is WhyWrongResult => isWhyWrongResult(value),
  itemCount: 2,
  localMaxTokens: 700,
  context: 'The "Why was I wrong?" explanation',
};

const exampleSentencesSpec: FeatureSpec<
  ExampleSentencesRequest,
  z.infer<typeof exampleSentencesValidator>,
  ExampleSentencesResult
> = {
  feature: 'exampleSentences',
  promptVersion: EXAMPLE_SENTENCES_PROMPT_VERSION,
  normalize: normalizeExampleSentencesRequest,
  keyParts: exampleSentencesKeyParts,
  prompt: buildExampleSentencesPrompt,
  schema: EXAMPLE_SENTENCES_SCHEMA,
  validator: exampleSentencesValidator,
  finalize: finalizeExampleSentencesResult,
  isCached: (value: unknown): value is ExampleSentencesResult => isExampleSentencesResult(value),
  itemCount: 3,
  localMaxTokens: 700,
  context: 'The example sentences',
};

const leechRescueSpec: FeatureSpec<
  LeechRescueRequest,
  z.infer<typeof leechRescueValidator>,
  LeechRescueSuggestion
> = {
  feature: 'leechRescue',
  promptVersion: LEECH_RESCUE_PROMPT_VERSION,
  normalize: normalizeLeechRescueRequest,
  keyParts: leechRescueKeyParts,
  prompt: buildLeechRescuePrompt,
  schema: LEECH_RESCUE_SCHEMA,
  validator: leechRescueValidator,
  finalize: finalizeLeechRescueSuggestion,
  isCached: (value: unknown): value is LeechRescueSuggestion => isLeechRescueSuggestion(value),
  itemCount: 2,
  localMaxTokens: 700,
  context: 'The leech rescue suggestion',
};

const contextExplainSpec: FeatureSpec<
  ContextExplainRequest,
  z.infer<typeof contextExplainValidator>,
  ContextExplainResult
> = {
  feature: 'contextExplain',
  promptVersion: CONTEXT_EXPLAIN_PROMPT_VERSION,
  normalize: normalizeContextExplainRequest,
  keyParts: contextExplainKeyParts,
  prompt: buildContextExplainPrompt,
  schema: CONTEXT_EXPLAIN_SCHEMA,
  validator: contextExplainValidator,
  finalize: finalizeContextExplainResult,
  isCached: (value: unknown, request: ContextExplainRequest): value is ContextExplainResult =>
    isContextExplainResult(value) && value.senseIndex < request.senses.length,
  itemCount: 1,
  localMaxTokens: 500,
  context: 'The in-context explanation',
};

// ---- the cache -------------------------------------------------------------

interface CacheFile {
  entries: Record<string, unknown>;
}

/** Bounded, least-recently-used first out — as the media assistant's. */
const MAX_CACHE_ENTRIES = 800;

let cache: CacheFile | null = null;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'ai-study-cache.json');
}

function loadCache(): CacheFile {
  if (cache) return cache;
  try {
    cache = readJsonSync<CacheFile>(cachePath(), () => ({ entries: {} }), {
      validate: (v) => !!v && typeof v === 'object' && !!(v as CacheFile).entries,
    });
  } catch {
    cache = { entries: {} };
  }
  return cache;
}

function remember(key: string, value: unknown): void {
  const entries = loadCache().entries;
  delete entries[key];
  entries[key] = value;
  const keys = Object.keys(entries);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) delete entries[old];
  try {
    writeJsonAtomicSync(cachePath(), loadCache(), { space: 0, backup: false });
  } catch {
    // Optional: the answer still reaches the caller.
  }
}

function recall(key: string): unknown {
  const entries = loadCache().entries;
  if (!(key in entries)) return undefined;
  const hit = entries[key];
  delete entries[key];
  entries[key] = hit;
  return hit;
}

export function aiStudyCacheKey(feature: AiCloudFeatureId, promptVersion: number, modelKey: string, parts: readonly string[]): string {
  return `${feature}:${crypto
    .createHash('sha256')
    .update([`v${promptVersion}`, modelKey, ...parts].join('\0'))
    .digest('hex')
    .slice(0, 32)}`;
}

/** Test seam: forget the in-memory cache. */
export function resetAiStudyCacheForTests(): void {
  cache = null;
}

// ---- cancellation ----------------------------------------------------------

const inFlight = new Map<string, AbortController>();

/** Aborts a running request by the id the renderer gave it. Unknown ids are a no-op. */
export function cancelAiStudyRequest(raw: unknown): boolean {
  const id = normalizeAiStudyRequestId(raw);
  const controller = id ? inFlight.get(id) : undefined;
  if (!controller) return false;
  controller.abort();
  return true;
}

// ---- the runner ------------------------------------------------------------

export interface AiStudyDeps {
  enabled?: () => boolean;
  engine?: () => 'cloud' | 'local-qwen';
  provider?: () => { providerId: AiProviderId; apiKey: string };
  /** A keyless local OpenAI-compatible server is configured by its URL, not a key. */
  configured?: (providerId: AiProviderId, apiKey: string) => boolean;
  cloudAllowed?: (feature: AiCloudFeatureId) => boolean;
  localAvailable?: () => boolean | Promise<boolean>;
  call?: typeof callAiProvider;
  runLocal?: (prompt: string, options: { signal: AbortSignal; maxTokens: number; timeoutMs: number }) => Promise<string>;
  /** The model a provider id resolves to (cache key). */
  modelOf?: (providerId: AiProviderId) => string;
}

function providerConfigured(providerId: AiProviderId, apiKey: string): boolean {
  if (apiKey) return true;
  try {
    return getAiProviderHealth(providerId).configured;
  } catch {
    return false;
  }
}

function providerModel(providerId: AiProviderId): string {
  try {
    return getAiProviderHealth(providerId).model;
  } catch {
    return '';
  }
}

async function defaultLocalAvailable(): Promise<boolean> {
  try {
    return (await import('./translate')).isTranslateAvailable();
  } catch {
    return false;
  }
}

async function defaultRunLocal(
  prompt: string,
  options: { signal: AbortSignal; maxTokens: number; timeoutMs: number },
): Promise<string> {
  return (await import('./translate')).runLocalQwenPrompt(prompt, options);
}

/** `runLocalQwenPrompt` reports a deadline as a plain Error. */
function localErrorCode(error: unknown): AiErrorCode {
  if (error instanceof Error && /timed out/i.test(error.message)) return 'timeout';
  return aiErrorCodeOf(error);
}

const LOCAL_JSON_TAIL = '\n\nRespond with a single JSON object only — no markdown fences, no commentary.';

/** Runs one helper through every gate, the cache and validation (see the file header). */
export async function runAiStudyFeature<Req extends { requestId?: string; refresh?: boolean }, Parsed, Res>(
  spec: FeatureSpec<Req, Parsed, Res>,
  input: unknown,
  deps: AiStudyDeps,
): Promise<AiStudyResponse<Res>> {
  if (!(deps.enabled ?? aiFeaturesEnabled)()) {
    return { ok: false, aiOff: true, code: 'ai-off', error: AI_FEATURES_OFF_MESSAGE };
  }
  const request = spec.normalize(input);
  if (!request) return { ok: false, code: 'empty-input', error: 'Nothing to ask about.' };

  const engine = (deps.engine ?? getConfiguredAiEngine)() === 'local-qwen' ? 'local' : 'cloud';
  let modelKey: string;
  let cloud: { providerId: AiProviderId; apiKey: string } | null = null;
  if (engine === 'local') {
    if (!(await (deps.localAvailable ?? defaultLocalAvailable)())) {
      return { ok: false, needsLocalModel: true, code: 'no-local-model', error: 'The offline AI model is not installed.' };
    }
    modelKey = 'local-qwen';
  } else {
    if (!(deps.cloudAllowed ?? aiCloudAllowedFor)(spec.feature)) {
      return { ok: false, needsConsent: true, code: 'consent', error: AI_CLOUD_FEATURE_OFF_MESSAGE };
    }
    const refused = spec.cloudGate?.(request);
    if (refused) return refused;
    cloud = (deps.provider ?? getConfiguredAiProvider)();
    if (!(deps.configured ?? providerConfigured)(cloud.providerId, cloud.apiKey)) {
      return { ok: false, needsKey: true, code: 'no-key', error: 'Add an AI provider key in Settings > AI to use this optional feature.' };
    }
    modelKey = `${cloud.providerId}:${(deps.modelOf ?? providerModel)(cloud.providerId)}`;
  }

  const key = aiStudyCacheKey(spec.feature, spec.promptVersion, modelKey, spec.keyParts(request));
  if (!request.refresh) {
    const hit = recall(key);
    if (hit !== undefined && spec.isCached(hit, request)) return { ok: true, result: hit, cached: true, engine };
  }

  const controller = new AbortController();
  const requestId = request.requestId;
  if (requestId) {
    inFlight.get(requestId)?.abort();
    inFlight.set(requestId, controller);
  }
  try {
    const prompt = spec.prompt(request);
    const raw = cloud
      ? await (deps.call ?? callAiProvider)(cloud.providerId, cloud.apiKey, prompt, spec.schema, {
        itemCount: spec.itemCount,
        timeoutMs: 60_000,
        feature: spec.feature,
        signal: controller.signal,
      })
      : await (deps.runLocal ?? defaultRunLocal)(`${prompt}${LOCAL_JSON_TAIL}`, {
        signal: controller.signal,
        maxTokens: spec.localMaxTokens,
        timeoutMs: 120_000,
      });
    if (controller.signal.aborted) return { ok: false, code: 'cancelled', engine };
    const parsed = parseAiReplyWith(raw, spec.validator, spec.context);
    const result = spec.finalize(parsed, request);
    if (!result) return { ok: false, code: 'invalid', error: `${spec.context} did not pass validation.`, engine };
    remember(key, result);
    return { ok: true, result, cached: false, engine };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, code: 'cancelled', engine };
    return {
      ok: false,
      code: engine === 'local' ? localErrorCode(error) : aiErrorCodeOf(error),
      error: error instanceof Error ? error.message : String(error),
      engine,
    };
  } finally {
    if (requestId && inFlight.get(requestId) === controller) inFlight.delete(requestId);
  }
}

export function explainWrongAnswer(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<WhyWrongResult>> {
  return runAiStudyFeature(whyWrongSpec, input, deps);
}

export function generateExampleSentences(
  input: unknown,
  deps: AiStudyDeps = {},
): Promise<AiStudyResponse<ExampleSentencesResult>> {
  return runAiStudyFeature(exampleSentencesSpec, input, deps);
}

export function suggestLeechRescue(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<LeechRescueSuggestion>> {
  return runAiStudyFeature(leechRescueSpec, input, deps);
}

export function explainWordInContext(
  input: unknown,
  deps: AiStudyDeps = {},
): Promise<AiStudyResponse<ContextExplainResult>> {
  return runAiStudyFeature(contextExplainSpec, input, deps);
}

export function registerAiStudyAssistIpc(): void {
  ipcMain.handle('aiStudy:whyWrong', (_event, input: unknown) => explainWrongAnswer(input));
  ipcMain.handle('aiStudy:exampleSentences', (_event, input: unknown) => generateExampleSentences(input));
  ipcMain.handle('aiStudy:leechRescue', (_event, input: unknown) => suggestLeechRescue(input));
  ipcMain.handle('aiStudy:contextExplain', (_event, input: unknown) => explainWordInContext(input));
  ipcMain.handle('aiStudy:cancel', (_event, requestId: unknown): boolean => cancelAiStudyRequest(requestId));
}
