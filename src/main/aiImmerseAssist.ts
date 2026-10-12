/**
 * The optional AI helpers for watching and reading, in main (docs/AI_AUDIT.md
 * N9-N12 and the Study command fallback; the feature list is in
 * `shared/aiImmerseCommon.ts`).
 *
 * Same runner as `aiStudyAssist.ts` (itself the `mediaStudyAssistant.ts`
 * template), one spec per feature:
 *
 *   1. the "Use AI features" switch — off means `aiOff`, and the surface hides;
 *   2. the request is normalized, never trusted (and a transcript chunk over the
 *      size cap is refused, not sent);
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
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import { normalizeAiStudyRequestId } from '../shared/aiStudyCommon';
import type { AiImmerseFeature } from '../shared/aiImmerseCommon';
import {
  LINE_PICK_PROMPT_VERSION,
  LINE_PICK_SCHEMA,
  MEDIA_BRIEF_PROMPT_VERSION,
  MEDIA_BRIEF_SCHEMA,
  buildLinePickPrompt,
  buildMediaBriefPrompt,
  finalizeLinePickResult,
  finalizeMediaBriefResult,
  isLinePickResult,
  isMediaBriefChunkResult,
  linePickKeyParts,
  mediaBriefKeyParts,
  normalizeLinePickRequest,
  normalizeMediaBriefRequest,
  type LinePickRequest,
  type LinePickResult,
  type MediaBriefChunkResult,
  type MediaBriefRequest,
} from '../shared/aiMediaBrief';
import {
  CONTEXT_TRANSLATE_PROMPT_VERSION,
  CONTEXT_TRANSLATE_SCHEMA,
  LINE_EXPLAIN_PROMPT_VERSION,
  LINE_EXPLAIN_SCHEMA,
  READER_SIMPLIFY_PROMPT_VERSION,
  READER_SIMPLIFY_SCHEMA,
  buildContextTranslatePrompt,
  buildLineExplainPrompt,
  buildReaderSimplifyPrompt,
  contextTranslateKeyParts,
  finalizeContextTranslateResult,
  finalizeLineExplainResult,
  finalizeReaderSimplifyResult,
  isContextTranslateResult,
  isLineExplainResult,
  isReaderSimplifyResult,
  lineExplainKeyParts,
  normalizeContextTranslateRequest,
  normalizeLineExplainRequest,
  normalizeReaderSimplifyRequest,
  readerSimplifyKeyParts,
  type ContextTranslateRequest,
  type ContextTranslateResult,
  type LineExplainRequest,
  type LineExplainResult,
  type ReaderSimplifyRequest,
  type ReaderSimplifyResult,
} from '../shared/aiImmerseLine';
import {
  STUDY_COMMAND_PROMPT_VERSION,
  STUDY_COMMAND_SCHEMA,
  buildStudyCommandPrompt,
  finalizeStudyCommandReply,
  isStudyCommandIntent,
  normalizeStudyCommandAiRequest,
  studyCommandKeyParts,
  type StudyCommandAiRequest,
} from '../shared/aiStudyCommand';
import type { StudyCommandIntent } from '../shared/studyFilterRecipe';
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

// ---- the reply shapes ------------------------------------------------------------

// Lenient where a model's omission is harmless (no grammar notes is []), strict
// where it is not (no summary is no answer).
const mediaBriefValidator = z.object({
  summary: z.string().min(1),
  questions: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    cueId: z.coerce.number().int(),
  })),
});

const linePickValidator = z.object({
  picks: z.array(z.object({
    id: z.coerce.number().int(),
    reason: z.string().optional().default(''),
  })),
});

const lineExplainValidator = z.object({
  translation: z.string().min(1),
  explanation: z.string().min(1),
  grammar: z.array(z.object({
    pattern: z.string().optional().default(''),
    note: z.string().optional().default(''),
  })).optional().default([]),
  targetMeaning: z.string().optional().default(''),
});

const readerSimplifyValidator = z.object({
  simplified: z.string().min(1),
  notes: z.array(z.string()).optional().default([]),
});

const contextTranslateValidator = z.object({
  translation: z.string().min(1),
});

const studyCommandValidator = z.object({
  op: z.string(),
  excludedJlptLevels: z.array(z.string()).optional().default([]),
  minimumOccurrences: z.coerce.number().int().optional().default(0),
  maximumCards: z.coerce.number().int().optional().default(0),
  excludeKnown: z.string().optional().default('unchanged'),
  excludeInternalDuplicates: z.string().optional().default('unchanged'),
  excludeAnkiDuplicates: z.string().optional().default('unchanged'),
  excludeProperNouns: z.string().optional().default('unchanged'),
});

// ---- the feature specs -----------------------------------------------------------

interface FeatureSpec<Req extends { requestId?: string; refresh?: boolean }, Parsed, Res> {
  /** The cache namespace. */
  name: string;
  /** The consent row (Settings > AI) this request is checked against. */
  feature(request: Req): AiImmerseFeature;
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
  cloudTimeoutMs: number;
  context: string;
  /** What a valid "nothing fits" reply is reported as. */
  emptyCode?: AiErrorCode;
}

const mediaBriefSpec: FeatureSpec<MediaBriefRequest, z.infer<typeof mediaBriefValidator>, MediaBriefChunkResult> = {
  name: 'mediaBrief',
  feature: () => 'mediaBrief',
  promptVersion: MEDIA_BRIEF_PROMPT_VERSION,
  normalize: normalizeMediaBriefRequest,
  keyParts: mediaBriefKeyParts,
  prompt: buildMediaBriefPrompt,
  schema: MEDIA_BRIEF_SCHEMA,
  validator: mediaBriefValidator,
  finalize: finalizeMediaBriefResult,
  isCached: (value: unknown): value is MediaBriefChunkResult => isMediaBriefChunkResult(value),
  itemCount: 6,
  localMaxTokens: 1_000,
  cloudTimeoutMs: 90_000,
  context: 'The video brief',
};

const linePickSpec: FeatureSpec<LinePickRequest, z.infer<typeof linePickValidator>, LinePickResult> = {
  name: 'linePick',
  feature: () => 'linePick',
  promptVersion: LINE_PICK_PROMPT_VERSION,
  normalize: normalizeLinePickRequest,
  keyParts: linePickKeyParts,
  prompt: buildLinePickPrompt,
  schema: LINE_PICK_SCHEMA,
  validator: linePickValidator,
  finalize: finalizeLinePickResult,
  isCached: (value: unknown, request: LinePickRequest): value is LinePickResult =>
    isLinePickResult(value) && value.picks.every((pick) => request.candidates.some((c) => c.id === pick.id)),
  itemCount: 4,
  localMaxTokens: 700,
  cloudTimeoutMs: 60_000,
  context: 'The i+1 line pick',
};

const lineExplainSpec: FeatureSpec<LineExplainRequest, z.infer<typeof lineExplainValidator>, LineExplainResult> = {
  name: 'lineExplain',
  feature: (request) => (request.surface === 'vn' ? 'vnExplain' : 'readerExplain'),
  promptVersion: LINE_EXPLAIN_PROMPT_VERSION,
  normalize: normalizeLineExplainRequest,
  keyParts: lineExplainKeyParts,
  prompt: buildLineExplainPrompt,
  schema: LINE_EXPLAIN_SCHEMA,
  validator: lineExplainValidator,
  finalize: finalizeLineExplainResult,
  isCached: (value: unknown): value is LineExplainResult => isLineExplainResult(value),
  itemCount: 3,
  localMaxTokens: 800,
  cloudTimeoutMs: 60_000,
  context: 'The line explanation',
};

const readerSimplifySpec: FeatureSpec<
  ReaderSimplifyRequest,
  z.infer<typeof readerSimplifyValidator>,
  ReaderSimplifyResult
> = {
  name: 'readerSimplify',
  feature: () => 'readerSimplify',
  promptVersion: READER_SIMPLIFY_PROMPT_VERSION,
  normalize: normalizeReaderSimplifyRequest,
  keyParts: readerSimplifyKeyParts,
  prompt: buildReaderSimplifyPrompt,
  schema: READER_SIMPLIFY_SCHEMA,
  validator: readerSimplifyValidator,
  finalize: finalizeReaderSimplifyResult,
  isCached: (value: unknown): value is ReaderSimplifyResult => isReaderSimplifyResult(value),
  itemCount: 6,
  localMaxTokens: 1_400,
  cloudTimeoutMs: 90_000,
  context: 'The simplified text',
};

const contextTranslateSpec: FeatureSpec<
  ContextTranslateRequest,
  z.infer<typeof contextTranslateValidator>,
  ContextTranslateResult
> = {
  name: 'contextTranslate',
  feature: () => 'vnTranslate',
  promptVersion: CONTEXT_TRANSLATE_PROMPT_VERSION,
  normalize: normalizeContextTranslateRequest,
  keyParts: contextTranslateKeyParts,
  prompt: buildContextTranslatePrompt,
  schema: CONTEXT_TRANSLATE_SCHEMA,
  validator: contextTranslateValidator,
  finalize: finalizeContextTranslateResult,
  isCached: (value: unknown): value is ContextTranslateResult => isContextTranslateResult(value),
  itemCount: 1,
  localMaxTokens: 400,
  cloudTimeoutMs: 45_000,
  context: 'The translation',
};

const studyCommandSpec: FeatureSpec<
  StudyCommandAiRequest,
  z.infer<typeof studyCommandValidator>,
  StudyCommandIntent
> = {
  name: 'studyCommand',
  feature: () => 'studyCommand',
  promptVersion: STUDY_COMMAND_PROMPT_VERSION,
  normalize: normalizeStudyCommandAiRequest,
  keyParts: studyCommandKeyParts,
  prompt: buildStudyCommandPrompt,
  schema: STUDY_COMMAND_SCHEMA,
  validator: studyCommandValidator,
  finalize: finalizeStudyCommandReply,
  isCached: (value: unknown): value is StudyCommandIntent => isStudyCommandIntent(value),
  itemCount: 1,
  localMaxTokens: 300,
  cloudTimeoutMs: 30_000,
  context: 'The command',
  // "none" is the model saying the command is not one of the operations.
  emptyCode: 'no-answer',
};

// ---- the cache -------------------------------------------------------------------

interface CacheFile {
  entries: Record<string, unknown>;
}

/** Bounded, least-recently-used first out — as the media assistant's. */
const MAX_CACHE_ENTRIES = 600;

let cache: CacheFile | null = null;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'ai-immerse-cache.json');
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

export function aiImmerseCacheKey(name: string, promptVersion: number, modelKey: string, parts: readonly string[]): string {
  return `${name}:${crypto
    .createHash('sha256')
    .update([`v${promptVersion}`, modelKey, ...parts].join('\0'))
    .digest('hex')
    .slice(0, 32)}`;
}

/** Test seam: forget the in-memory cache. */
export function resetAiImmerseCacheForTests(): void {
  cache = null;
}

// ---- cancellation ----------------------------------------------------------------

const inFlight = new Map<string, AbortController>();

/** Aborts a running request by the id the renderer gave it. Unknown ids are a no-op. */
export function cancelAiImmerseRequest(raw: unknown): boolean {
  const id = normalizeAiStudyRequestId(raw);
  const controller = id ? inFlight.get(id) : undefined;
  if (!controller) return false;
  controller.abort();
  return true;
}

// ---- the runner ------------------------------------------------------------------

export interface AiImmerseDeps {
  enabled?: () => boolean;
  engine?: () => 'cloud' | 'local-qwen';
  provider?: () => { providerId: AiProviderId; apiKey: string };
  /** A keyless local OpenAI-compatible server is configured by its URL, not a key. */
  configured?: (providerId: AiProviderId, apiKey: string) => boolean;
  cloudAllowed?: (feature: AiImmerseFeature) => boolean;
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

/** Keeps the cloud gate's message for logs; the renderer reads `code`. */
const NO_KEY_MESSAGE = 'Add an AI provider key in Settings > AI to use this optional feature.';

async function runFeature<Req extends { requestId?: string; refresh?: boolean }, Parsed, Res>(
  spec: FeatureSpec<Req, Parsed, Res>,
  input: unknown,
  deps: AiImmerseDeps,
): Promise<AiStudyResponse<Res>> {
  if (!(deps.enabled ?? aiFeaturesEnabled)()) {
    return { ok: false, aiOff: true, code: 'ai-off', error: AI_FEATURES_OFF_MESSAGE };
  }
  const request = spec.normalize(input);
  if (!request) return { ok: false, code: 'empty-input', error: 'Nothing to ask about.' };
  const feature = spec.feature(request);

  const engine = (deps.engine ?? getConfiguredAiEngine)() === 'local-qwen' ? 'local' : 'cloud';
  let modelKey: string;
  let cloud: { providerId: AiProviderId; apiKey: string } | null = null;
  if (engine === 'local') {
    if (!(await (deps.localAvailable ?? defaultLocalAvailable)())) {
      return { ok: false, needsLocalModel: true, code: 'no-local-model', error: 'The offline AI model is not installed.' };
    }
    modelKey = 'local-qwen';
  } else {
    if (!(deps.cloudAllowed ?? aiCloudAllowedFor)(feature)) {
      return { ok: false, needsConsent: true, code: 'consent', error: AI_CLOUD_FEATURE_OFF_MESSAGE };
    }
    cloud = (deps.provider ?? getConfiguredAiProvider)();
    if (!(deps.configured ?? providerConfigured)(cloud.providerId, cloud.apiKey)) {
      return { ok: false, needsKey: true, code: 'no-key', error: NO_KEY_MESSAGE };
    }
    modelKey = `${cloud.providerId}:${(deps.modelOf ?? providerModel)(cloud.providerId)}`;
  }

  const key = aiImmerseCacheKey(spec.name, spec.promptVersion, modelKey, spec.keyParts(request));
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
        timeoutMs: spec.cloudTimeoutMs,
        feature,
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
    if (!result) {
      return { ok: false, code: spec.emptyCode ?? 'invalid', error: `${spec.context} did not pass validation.`, engine };
    }
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

export function briefMediaChunk(input: unknown, deps: AiImmerseDeps = {}): Promise<AiStudyResponse<MediaBriefChunkResult>> {
  return runFeature(mediaBriefSpec, input, deps);
}

export function pickTeachableLines(input: unknown, deps: AiImmerseDeps = {}): Promise<AiStudyResponse<LinePickResult>> {
  return runFeature(linePickSpec, input, deps);
}

export function explainImmerseLine(input: unknown, deps: AiImmerseDeps = {}): Promise<AiStudyResponse<LineExplainResult>> {
  return runFeature(lineExplainSpec, input, deps);
}

export function simplifyReaderText(input: unknown, deps: AiImmerseDeps = {}): Promise<AiStudyResponse<ReaderSimplifyResult>> {
  return runFeature(readerSimplifySpec, input, deps);
}

export function translateLineInContext(
  input: unknown,
  deps: AiImmerseDeps = {},
): Promise<AiStudyResponse<ContextTranslateResult>> {
  return runFeature(contextTranslateSpec, input, deps);
}

export function interpretStudyCommand(input: unknown, deps: AiImmerseDeps = {}): Promise<AiStudyResponse<StudyCommandIntent>> {
  return runFeature(studyCommandSpec, input, deps);
}

export function registerAiImmerseAssistIpc(): void {
  ipcMain.handle('aiImmerse:brief', (_event, input: unknown) => briefMediaChunk(input));
  ipcMain.handle('aiImmerse:pickLines', (_event, input: unknown) => pickTeachableLines(input));
  ipcMain.handle('aiImmerse:explainLine', (_event, input: unknown) => explainImmerseLine(input));
  ipcMain.handle('aiImmerse:simplify', (_event, input: unknown) => simplifyReaderText(input));
  ipcMain.handle('aiImmerse:translateLine', (_event, input: unknown) => translateLineInContext(input));
  ipcMain.handle('aiImmerse:studyCommand', (_event, input: unknown) => interpretStudyCommand(input));
  ipcMain.handle('aiImmerse:cancel', (_event, requestId: unknown): boolean => cancelAiImmerseRequest(requestId));
}
