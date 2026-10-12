/**
 * Optional AI for the Chrome extension: the `/v1/ai/*` routes of the loopback
 * bridge (`extensionServer.ts` dispatches them here after its pairing check).
 *
 * The extension never holds a key or picks a provider. Each route is a narrow
 * front for an AI runner the app already has, so it inherits that runner's
 * gates and caches instead of growing its own:
 *
 *   /v1/ai/status           what the extension may offer (no model is called)
 *   /v1/ai/explain-context  `explainWordInContext` (aiStudyAssist.ts, `contextExplain` opt-in)
 *   /v1/ai/breakdown        `analyzeSentence` (word by word, `readerExplain` opt-in for the
 *                           cloud) with the offline translation model as its fallback
 *   /v1/ai/simplify         `simplifyReaderText` (aiImmerseAssist.ts, `readerSimplify` opt-in)
 *   /v1/ai/word-meaning     `explainImmerseLine` with the word as its target (`readerExplain`)
 *
 * Offline first: the breakdown runs on the offline model whenever it is
 * installed, and only goes to the configured cloud provider when it is not and
 * the user allowed it. The master switch ("Use AI features") gates every route.
 *
 * What this module adds on top of the runners is what a browser-facing route
 * needs: a small body cap, a rate limit, a concurrency cap, and cancellation —
 * the extension aborts its fetch, the socket closes, and the runner's own
 * request is aborted by an id this module made (never one the caller chose, so
 * a page cannot cancel the app's own requests).
 *
 * Replies carry `code` (shared/aiErrorCodes.ts), never the runners' English
 * `error`: the extension says each code in its own _locales.
 */
import crypto from 'node:crypto';
import type http from 'node:http';
import type { AiErrorCode } from '../shared/aiErrorCodes';
import type { AiCloudFeatureId } from '../shared/aiSetup';
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import { clipText, normalizeAnswerLang } from '../shared/aiStudyCommon';
import type { ContextExplainResult } from '../shared/aiContextExplain';
import type { LineExplainResult, ReaderSimplifyResult } from '../shared/aiImmerseLine';
import type { SentenceAnalysisResult } from '../shared/sentenceAnalysisCore';
import { normalizeStudyLang, type StudyLang } from '../shared/studyLang';

/** Every route this module answers. `extensionServer.ts` compares against each literally. */
export const EXTENSION_AI_ROUTES = [
  '/v1/ai/status',
  '/v1/ai/explain-context',
  '/v1/ai/breakdown',
  '/v1/ai/simplify',
  '/v1/ai/word-meaning',
] as const;
export type ExtensionAiRoute = (typeof EXTENSION_AI_ROUTES)[number];

/** The largest AI request body: a paragraph and a word's senses fit many times over. */
export const EXTENSION_AI_MAX_BODY_BYTES = 16 * 1024;
/** AI requests per window, across the routes that call a model. */
export const EXTENSION_AI_RATE_LIMIT = 20;
export const EXTENSION_AI_RATE_WINDOW_MS = 60_000;
/** Requests running at once; a fourth waits for none of them and is refused. */
export const EXTENSION_AI_MAX_IN_FLIGHT = 3;

const SENTENCE_MAX = 400;
const CONTEXT_MAX = 1_000;
const PARAGRAPH_MAX = 1_500;
const MAX_SENSES = 12;

/** What the extension shows for one feature before it is asked. */
export type ExtensionAiFeatureState = 'ready' | 'off' | 'no-key' | 'no-local-model' | 'consent' | 'offline';

export type ExtensionAiFeature = 'explain' | 'breakdown' | 'simplify' | 'meaning';

/** The Settings > AI cloud opt-in each feature is checked against. */
export const EXTENSION_AI_CONSENT: Readonly<Record<ExtensionAiFeature, AiCloudFeatureId>> = {
  explain: 'contextExplain',
  breakdown: 'readerExplain',
  simplify: 'readerSimplify',
  meaning: 'readerExplain',
};

export interface ExtensionAiStatus {
  ok: true;
  /** "Use AI features". Off: the extension hides every AI control. */
  enabled: boolean;
  engine: 'local' | 'cloud';
  features: Record<ExtensionAiFeature, ExtensionAiFeatureState>;
}

/** One feature's reply as it goes to the extension: the runner's answer without its English text. */
export interface ExtensionAiReply<T> {
  ok: boolean;
  result?: T;
  code?: AiErrorCode;
  cached?: boolean;
  engine?: 'local' | 'cloud';
  aiOff?: boolean;
  needsKey?: boolean;
  needsLocalModel?: boolean;
  needsConsent?: boolean;
}

export interface BreakdownResult {
  /** Word-by-word analysis, when a model could run it. */
  analysis?: SentenceAnalysisResult;
  /** The offline model's translation, when the analysis could not be had. */
  translation?: string;
  /** Why there is no analysis, when there is none. */
  analysisCode?: AiErrorCode;
}

export interface WordMeaningResult {
  meaning: string;
  /** The sentence (or word) translated, for context under the suggestion. */
  translation: string;
}

/** What `analyzeSentence` answers, as far as this module reads it. */
export interface AnalyzeReply {
  ok: boolean;
  result?: SentenceAnalysisResult;
  code?: AiErrorCode;
  needsKey?: boolean;
  needsLocalModel?: boolean;
  needsConsent?: boolean;
  aiOff?: boolean;
  cached?: boolean;
}

/** Everything the routes reach in the rest of main — injected so the gates are testable with fakes. */
export interface ExtensionAiDeps {
  enabled(): boolean;
  engine(): 'local' | 'cloud';
  cloudAllowed(feature: AiCloudFeatureId): boolean;
  /** The configured cloud provider has a key (or, for a local compatible server, a URL and model). */
  providerConfigured(): boolean;
  /** The configured provider can be reached now (always true for a local compatible server). */
  providerReachable(): boolean;
  localModelAvailable(): boolean | Promise<boolean>;
  explainContext(input: Record<string, unknown>, signal: AbortSignal): Promise<AiStudyResponse<ContextExplainResult>>;
  simplify(input: Record<string, unknown>, signal: AbortSignal): Promise<AiStudyResponse<ReaderSimplifyResult>>;
  lineExplain(input: Record<string, unknown>, signal: AbortSignal): Promise<AiStudyResponse<LineExplainResult>>;
  analyze(
    request: { text: string; lang: string; explainIn: string; context: string },
    options: { signal: AbortSignal; engine: 'local-qwen' | 'cloud'; feature: AiCloudFeatureId },
  ): Promise<AnalyzeReply>;
  translateLocal(text: string, source: string, target: string, signal: AbortSignal): Promise<string>;
  now(): number;
}

const DEP_NAMES: readonly (keyof ExtensionAiDeps)[] = [
  'enabled', 'engine', 'cloudAllowed', 'providerConfigured', 'providerReachable', 'localModelAvailable',
  'explainContext', 'simplify', 'lineExplain', 'analyze', 'translateLocal', 'now',
];

// ---- default wiring -----------------------------------------------------------

/**
 * Runs a runner that is cancelled by request id: the id is made here, and an
 * abort of `signal` cancels it — retried until the runner has registered it, so
 * an abort that lands while the runner is still checking its gates is not lost.
 */
export async function withRunnerId<T>(
  signal: AbortSignal,
  cancel: (id: string) => boolean,
  run: (requestId: string) => Promise<T>,
): Promise<T> {
  const requestId = `ext_${crypto.randomBytes(12).toString('hex')}`;
  let done = false;
  const onAbort = (): void => {
    const attempt = (): void => {
      if (done) return;
      if (!cancel(requestId)) setTimeout(attempt, 50);
    };
    attempt();
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await run(requestId);
  } finally {
    done = true;
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * The real gates and runners. Loaded on the first AI request, not when the
 * bridge starts: the bridge imports this module at startup and must not pull
 * the AI stack into its own graph.
 */
async function loadDefaultDeps(): Promise<ExtensionAiDeps> {
  const [gate, mining, runtime, electron] = await Promise.all([
    import('./aiFeatureGate'),
    import('./mining'),
    import('./providerRuntime'),
    import('electron'),
  ]);
  return {
    enabled: () => gate.aiFeaturesEnabled(),
    engine: () => (mining.getConfiguredAiEngine() === 'local-qwen' ? 'local' : 'cloud'),
    cloudAllowed: (feature) => gate.aiCloudAllowedFor(feature),
    providerConfigured: () => {
      try {
        const { providerId, apiKey } = mining.getConfiguredAiProvider();
        return Boolean(apiKey) || runtime.getAiProviderHealth(providerId).configured;
      } catch {
        return false;
      }
    },
    providerReachable: () => {
      try {
        // A local compatible server (Ollama, LM Studio) needs no internet.
        if (mining.getConfiguredAiProvider().providerId === 'openai-compatible') return true;
        const net = electron.net as { isOnline?: () => boolean } | undefined;
        return typeof net?.isOnline === 'function' ? net.isOnline() : true;
      } catch {
        return true;
      }
    },
    localModelAvailable: async () => {
      try {
        return (await import('./translate')).isTranslateAvailable();
      } catch {
        return false;
      }
    },
    explainContext: async (input, signal) => {
      const mod = await import('./aiStudyAssist');
      return withRunnerId(signal, mod.cancelAiStudyRequest, (requestId) => mod.explainWordInContext({ ...input, requestId }));
    },
    simplify: async (input, signal) => {
      const mod = await import('./aiImmerseAssist');
      return withRunnerId(signal, mod.cancelAiImmerseRequest, (requestId) => mod.simplifyReaderText({ ...input, requestId }));
    },
    lineExplain: async (input, signal) => {
      const mod = await import('./aiImmerseAssist');
      return withRunnerId(signal, mod.cancelAiImmerseRequest, (requestId) => mod.explainImmerseLine({ ...input, requestId }));
    },
    analyze: async (request, options) => (await import('./sentenceAnalysis')).analyzeSentence(request, options),
    translateLocal: async (text, source, target, signal) =>
      (await (await import('./translate')).translateTextDetailed(text, source, target, undefined, undefined, 'natural', { signal })).text,
    now: () => Date.now(),
  };
}

// ---- limits -------------------------------------------------------------------

export interface AiRateLimiter {
  /** Takes one slot; false when the window is full. */
  take(now: number): boolean;
}

export function createAiRateLimiter(limit = EXTENSION_AI_RATE_LIMIT, windowMs = EXTENSION_AI_RATE_WINDOW_MS): AiRateLimiter {
  const stamps: number[] = [];
  return {
    take(now) {
      while (stamps.length && now - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length >= limit) return false;
      stamps.push(now);
      return true;
    },
  };
}

// ---- the features -------------------------------------------------------------

function studyLangOf(value: unknown): StudyLang {
  return normalizeStudyLang(value);
}

/** A runner's reply without its English `error` (logs only; the extension says the code). */
function strip<T>(reply: AiStudyResponse<T>): ExtensionAiReply<T> {
  const out: ExtensionAiReply<T> = { ok: reply.ok === true };
  if (reply.ok && reply.result !== undefined) out.result = reply.result;
  if (!reply.ok) out.code = reply.code ?? 'other';
  if (reply.cached) out.cached = true;
  if (reply.engine) out.engine = reply.engine;
  if (reply.aiOff) out.aiOff = true;
  if (reply.needsKey) out.needsKey = true;
  if (reply.needsLocalModel) out.needsLocalModel = true;
  if (reply.needsConsent) out.needsConsent = true;
  return out;
}

async function featureState(feature: ExtensionAiFeature, deps: ExtensionAiDeps, localAvailable: boolean): Promise<ExtensionAiFeatureState> {
  if (!deps.enabled()) return 'off';
  // The breakdown runs on the offline model whenever it is installed.
  if (feature === 'breakdown' && localAvailable) return 'ready';
  if (deps.engine() === 'local') return localAvailable ? 'ready' : 'no-local-model';
  if (!deps.cloudAllowed(EXTENSION_AI_CONSENT[feature])) return 'consent';
  if (!deps.providerConfigured()) return 'no-key';
  if (!deps.providerReachable()) return 'offline';
  return 'ready';
}

export async function extensionAiStatus(deps: ExtensionAiDeps): Promise<ExtensionAiStatus> {
  const enabled = deps.enabled();
  const localAvailable = enabled ? await deps.localModelAvailable() : false;
  const features = {} as Record<ExtensionAiFeature, ExtensionAiFeatureState>;
  for (const feature of Object.keys(EXTENSION_AI_CONSENT) as ExtensionAiFeature[]) {
    features[feature] = await featureState(feature, deps, localAvailable);
  }
  return { ok: true, enabled, engine: deps.engine(), features };
}

const AI_OFF: ExtensionAiReply<never> = { ok: false, aiOff: true, code: 'ai-off' };

function stringList(value: unknown, limit: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => clipText(v, max)).filter(Boolean).slice(0, limit);
}

export async function explainContextRoute(
  body: Record<string, unknown>,
  signal: AbortSignal,
  deps: ExtensionAiDeps,
): Promise<ExtensionAiReply<ContextExplainResult>> {
  if (!deps.enabled()) return AI_OFF;
  const input = {
    word: clipText(body.word, 60),
    reading: clipText(body.reading, 60),
    lang: studyLangOf(body.lang),
    sentence: clipText(body.sentence, SENTENCE_MAX),
    senses: stringList(body.senses, MAX_SENSES, 200),
    answerLang: normalizeAnswerLang(body.uiLang),
  };
  if (!input.word || !input.sentence || !input.senses.length) return { ok: false, code: 'empty-input' };
  return strip(await deps.explainContext(input, signal));
}

export async function simplifyRoute(
  body: Record<string, unknown>,
  signal: AbortSignal,
  deps: ExtensionAiDeps,
): Promise<ExtensionAiReply<ReaderSimplifyResult>> {
  if (!deps.enabled()) return AI_OFF;
  const text = typeof body.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').trim() : '';
  if (!text) return { ok: false, code: 'empty-input' };
  if ([...text].length > PARAGRAPH_MAX) return { ok: false, code: 'too-long' };
  return strip(await deps.simplify({
    text,
    studyLang: studyLangOf(body.lang),
    answerLang: normalizeAnswerLang(body.uiLang),
    level: clipText(body.level, 40),
    unknownWords: [],
  }, signal));
}

export async function wordMeaningRoute(
  body: Record<string, unknown>,
  signal: AbortSignal,
  deps: ExtensionAiDeps,
): Promise<ExtensionAiReply<WordMeaningResult>> {
  if (!deps.enabled()) return AI_OFF;
  const word = clipText(body.word, 40);
  if (!word) return { ok: false, code: 'empty-input' };
  const sentence = clipText(body.sentence, SENTENCE_MAX);
  const reply = strip(await deps.lineExplain({
    surface: 'reader',
    text: sentence || word,
    target: word,
    context: '',
    speaker: '',
    studyLang: studyLangOf(body.lang),
    answerLang: normalizeAnswerLang(body.uiLang),
  }, signal));
  if (!reply.ok || !reply.result) return reply as ExtensionAiReply<never>;
  const meaning = reply.result.targetMeaning || (sentence ? '' : reply.result.translation);
  if (!meaning) return { ok: false, code: 'no-answer', ...(reply.engine ? { engine: reply.engine } : {}) };
  return { ...reply, result: { meaning, translation: reply.result.translation } };
}

function analysisCode(reply: AnalyzeReply): AiErrorCode {
  if (reply.code) return reply.code;
  if (reply.needsConsent) return 'consent';
  if (reply.needsKey) return 'no-key';
  if (reply.needsLocalModel) return 'no-local-model';
  return 'other';
}

/**
 * Word by word and a translation, offline first: the offline model when it is
 * installed (no opt-in needed — nothing leaves the computer), else the cloud
 * provider when the user allowed `readerExplain` to use it. When the analysis
 * cannot be had, the offline translation model still gives the translation.
 */
export async function breakdownRoute(
  body: Record<string, unknown>,
  signal: AbortSignal,
  deps: ExtensionAiDeps,
): Promise<ExtensionAiReply<BreakdownResult>> {
  if (!deps.enabled()) return AI_OFF;
  const text = clipText(body.text, SENTENCE_MAX + 1);
  if (!text) return { ok: false, code: 'empty-input' };
  if ([...text].length > SENTENCE_MAX) return { ok: false, code: 'too-long' };
  const lang = studyLangOf(body.lang);
  const uiLang = normalizeAnswerLang(body.uiLang);
  const context = typeof body.context === 'string' ? body.context.replace(/\s+/g, ' ').trim().slice(0, CONTEXT_MAX) : '';
  const localAvailable = await deps.localModelAvailable();
  const feature = EXTENSION_AI_CONSENT.breakdown;

  let engine: 'local' | 'cloud';
  if (localAvailable || deps.engine() === 'local') {
    if (!localAvailable) return { ok: false, needsLocalModel: true, code: 'no-local-model' };
    engine = 'local';
  } else if (!deps.cloudAllowed(feature)) {
    return { ok: false, needsConsent: true, code: 'consent' };
  } else if (!deps.providerConfigured()) {
    return { ok: false, needsKey: true, code: 'no-key' };
  } else {
    engine = 'cloud';
  }

  const reply = await deps.analyze(
    { text, lang, explainIn: uiLang, context },
    { signal, engine: engine === 'local' ? 'local-qwen' : 'cloud', feature },
  );
  if (signal.aborted) return { ok: false, code: 'cancelled', engine };
  if (reply.aiOff) return AI_OFF;
  if (reply.ok && reply.result) {
    return { ok: true, result: { analysis: reply.result }, engine, ...(reply.cached ? { cached: true } : {}) };
  }
  const code = analysisCode(reply);
  if (code === 'cancelled') return { ok: false, code, engine };

  // The analysis failed on the offline model (or the cloud did): the offline
  // translation model can still say what the sentence means.
  if (localAvailable) {
    const target = uiLang !== lang ? uiLang : 'en';
    try {
      const translation = (await deps.translateLocal(text, lang, target, signal)).trim();
      if (signal.aborted) return { ok: false, code: 'cancelled', engine: 'local' };
      if (translation) return { ok: true, result: { translation, analysisCode: code }, engine: 'local' };
    } catch {
      if (signal.aborted) return { ok: false, code: 'cancelled', engine: 'local' };
    }
  }
  return { ok: false, code, engine };
}

// ---- HTTP -------------------------------------------------------------------------

function send(res: http.ServerResponse, status: number, body: unknown): void {
  // The extension cancelled: nobody is listening, and the socket may be gone.
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Reads at most `maxBytes`; past that the rest is drained and `null` is returned (never a reset socket). */
function readCappedBody(req: http.IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

type FeatureRoute = (body: Record<string, unknown>, signal: AbortSignal, deps: ExtensionAiDeps) => Promise<ExtensionAiReply<unknown>>;

const FEATURE_ROUTES: Readonly<Record<string, FeatureRoute>> = {
  '/v1/ai/explain-context': explainContextRoute,
  '/v1/ai/breakdown': breakdownRoute,
  '/v1/ai/simplify': simplifyRoute,
  '/v1/ai/word-meaning': wordMeaningRoute,
};

export interface ExtensionAiHandler {
  handle(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void>;
}

/**
 * The route handler. Authentication is the caller's (the bridge's pairing
 * token, checked before this runs); everything after it is here.
 */
export function createExtensionAiHandler(
  depsOverride: Partial<ExtensionAiDeps> = {},
  limiter: AiRateLimiter = createAiRateLimiter(),
): ExtensionAiHandler {
  let deps: Promise<ExtensionAiDeps> | null = null;
  const isComplete = (d: Partial<ExtensionAiDeps>): d is ExtensionAiDeps =>
    DEP_NAMES.every((name) => typeof d[name] === 'function');
  const resolveDeps = (): Promise<ExtensionAiDeps> => {
    deps ??= isComplete(depsOverride)
      ? Promise.resolve(depsOverride)
      : loadDefaultDeps().then((loaded) => ({ ...loaded, ...depsOverride }));
    return deps;
  };
  let inFlight = 0;

  /** The gates and runners; `null` (after a 500 is sent) when they could not be loaded. */
  const depsOrFail = async (res: http.ServerResponse): Promise<ExtensionAiDeps | null> => {
    try {
      return await resolveDeps();
    } catch {
      deps = null;
      send(res, 500, { ok: false, code: 'other' });
      return null;
    }
  };

  return {
    async handle(req, res, pathname) {
      if (pathname === '/v1/ai/status') {
        req.resume();
        if (req.method !== 'GET') {
          send(res, 405, { ok: false, code: 'other' });
          return;
        }
        const d = await depsOrFail(res);
        if (!d) return;
        try {
          send(res, 200, await extensionAiStatus(d));
        } catch {
          send(res, 500, { ok: false, code: 'other' });
        }
        return;
      }
      const route = Object.prototype.hasOwnProperty.call(FEATURE_ROUTES, pathname) ? FEATURE_ROUTES[pathname] : undefined;
      if (!route) {
        req.resume();
        send(res, 404, { ok: false, code: 'other' });
        return;
      }
      if (req.method !== 'POST') {
        req.resume();
        send(res, 405, { ok: false, code: 'other' });
        return;
      }
      if (Number(req.headers['content-length'] || 0) > EXTENSION_AI_MAX_BODY_BYTES) {
        req.resume();
        send(res, 413, { ok: false, code: 'too-long' });
        return;
      }
      const raw = await readCappedBody(req, EXTENSION_AI_MAX_BODY_BYTES).catch(() => null);
      if (raw === null) {
        send(res, 413, { ok: false, code: 'too-long' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw || '{}') as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        body = parsed as Record<string, unknown>;
      } catch {
        send(res, 400, { ok: false, code: 'empty-input' });
        return;
      }
      const d = await depsOrFail(res);
      if (!d) return;
      // Off is answered before the limits: it costs nothing and says why to hide.
      if (!d.enabled()) {
        send(res, 200, AI_OFF);
        return;
      }
      if (inFlight >= EXTENSION_AI_MAX_IN_FLIGHT || !limiter.take(d.now())) {
        send(res, 429, { ok: false, code: 'rate-limit' });
        return;
      }

      // The extension's Cancel aborts its fetch; the closed socket cancels the model call.
      const controller = new AbortController();
      const onClose = (): void => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClose);
      inFlight += 1;
      try {
        // Gate outcomes (off, no key, consent…) are answers, not HTTP errors: 200 with a code.
        send(res, 200, await route(body, controller.signal, d));
      } catch {
        send(res, 500, { ok: false, code: controller.signal.aborted ? 'cancelled' : 'other' });
      } finally {
        inFlight -= 1;
        res.off('close', onClose);
      }
    },
  };
}

let shared: ExtensionAiHandler | null = null;

/** The bridge's single handler (one rate-limit window for the one paired extension). */
export function handleExtensionAiRoute(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
  shared ??= createExtensionAiHandler();
  return shared.handle(req, res, pathname);
}
