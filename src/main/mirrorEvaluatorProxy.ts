/**
 * Sends Mirror Writing's evaluations for the renderer (see
 * `shared/mirrorEvaluatorIpc.ts` for why it is main's job: the packaged CSP
 * refuses a renderer `fetch` to a user-chosen endpoint, and should).
 *
 * - Custom API: one POST to the URL the request names, with the key from the
 *   credential vault as a bearer token (none for a keyless local server such as
 *   Ollama or LM Studio). The answer comes back parsed; the renderer owns the
 *   schema check and its one retry.
 * - App AI: the provider and engine from Settings > AI, through the central
 *   client (`callAiProviderJson`) with the evaluation schema, or the offline
 *   model when the engine is Offline. Validated here with zod; the renderer
 *   validates again.
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  MIRROR_CREDENTIAL_ID,
  MIRROR_EVALUATE_APP_AI_CHANNEL,
  MIRROR_EVALUATE_CHANNEL,
  MIRROR_EVALUATION_JSON_SCHEMA,
  validateMirrorAppAiRequest,
  validateMirrorEvaluateRequest,
  type MirrorAppAiResponse,
  type MirrorEvaluateResponse,
} from '../shared/mirrorEvaluatorIpc';
import type { AiProviderId } from '../shared/aiProviders';
import { readSecret } from './credentials/vault';
import { AiProviderRuntimeError } from './providerRuntime';
import { assertAiFeatureAllowed } from './aiFeatureGate';
import { callAiProviderJson } from './aiProviderClient';
import { parseAiReplyWith } from './aiStructuredOutput';

const TIMEOUT_MS = 60_000;
/** A chat-completion answer is a few KB; anything this large is not one. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function readMirrorKey(): string {
  try {
    return readSecret(MIRROR_CREDENTIAL_ID, 'apiKey').trim();
  } catch {
    return '';
  }
}

export async function postMirrorEvaluation(
  raw: unknown,
  fetchImpl: FetchLike = fetch,
  timeoutMs = TIMEOUT_MS,
  readKey: () => string = readMirrorKey,
): Promise<MirrorEvaluateResponse> {
  const request = validateMirrorEvaluateRequest(raw);
  if (!request) return { ok: false, reason: 'bad-request' };
  const apiKey = readKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers,
      body: request.json,
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: 'http', status: response.status };
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) return { ok: false, reason: 'not-json', status: response.status };
    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, reason: 'not-json', status: response.status };
    }
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'network', detail: err instanceof Error ? err.message.slice(0, 300) : undefined };
  } finally {
    clearTimeout(timer);
  }
}

const tipShape = z.object({ span: z.string().optional(), message: z.string() }).passthrough();
const axisShape = z.object({ score: z.number(), tips: z.array(tipShape) }).passthrough();
/** The evaluation shape the renderer's `validateMirrorEvaluation` accepts. */
const MIRROR_EVALUATION_SHAPE = z.object({
  evaluatorVersion: z.string().optional(),
  total: z.number(),
  axes: z.object({ grammar: axisShape, vocabulary: axisShape, flow: axisShape, fidelity: axisShape }),
  summary: z.string(),
}).passthrough();

const LANG_NAME: Record<string, string> = { ja: 'Japanese', zh: 'Chinese (Mandarin)', ru: 'Russian' };

/** Where the app-AI evaluation runs, from Settings > AI. Injectable for tests. */
export interface MirrorAppAiDeps {
  engine(): 'cloud' | 'local-qwen';
  provider(): { providerId: AiProviderId; apiKey: string };
  callCloud: typeof callAiProviderJson;
  runLocal(prompt: string): Promise<string>;
}

async function defaultAppAiDeps(): Promise<MirrorAppAiDeps> {
  const mining = await import('./mining');
  return {
    engine: () => (mining.getConfiguredAiEngine() === 'local-qwen' ? 'local-qwen' : 'cloud'),
    provider: () => mining.getConfiguredAiProvider(),
    callCloud: callAiProviderJson,
    runLocal: async (prompt) => (await import('./translate')).runLocalQwenPrompt(prompt, { maxTokens: 1536, timeoutMs: 120_000 }),
  };
}

/**
 * Grades a draft with the app's own AI. Never throws: a failure is a code the
 * renderer translates (`aiErrorMessageKey`), and the local rubric stays one
 * click away.
 */
export async function evaluateMirrorWithAppAi(
  raw: unknown,
  depsFactory: () => Promise<MirrorAppAiDeps> = defaultAppAiDeps,
): Promise<MirrorAppAiResponse> {
  const request = validateMirrorAppAiRequest(raw);
  if (!request) return { ok: false, code: 'invalid-request' };
  try {
    const deps = await depsFactory();
    const engine = deps.engine();
    assertAiFeatureAllowed('mirror', engine === 'cloud' ? 'cloud' : 'local');
    if (engine === 'local-qwen') {
      const system = `You are a strict ${LANG_NAME[request.lang]} writing evaluator. Respond with one JSON object only, no code fences.`;
      const text = await deps.runLocal(`${system}\n\n${request.prompt}`);
      return { ok: true, data: parseAiReplyWith(text, MIRROR_EVALUATION_SHAPE, 'Local Qwen') };
    }
    const { providerId, apiKey } = deps.provider();
    const data = await deps.callCloud(providerId, apiKey, request.prompt, MIRROR_EVALUATION_JSON_SCHEMA, MIRROR_EVALUATION_SHAPE, {
      feature: 'mirror',
      maxOutputTokens: 2048,
      timeoutMs: TIMEOUT_MS,
      context: 'Mirror Writing evaluator',
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AiProviderRuntimeError) return { ok: false, code: error.code };
    // The offline model's own failures are plain errors; a missing model is the common one.
    const message = error instanceof Error ? error.message : '';
    if (/not (?:installed|found)|no (?:translation )?model|missing/i.test(message)) {
      return { ok: false, code: 'local-model-missing' };
    }
    return { ok: false, code: 'generic' };
  }
}

export function registerMirrorEvaluatorIpc(): void {
  ipcMain.handle(MIRROR_EVALUATE_CHANNEL, (_e, raw: unknown) => postMirrorEvaluation(raw));
  ipcMain.handle(MIRROR_EVALUATE_APP_AI_CHANNEL, (_e, raw: unknown) => evaluateMirrorWithAppAi(raw));
}
