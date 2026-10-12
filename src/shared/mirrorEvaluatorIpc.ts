/**
 * Mirror Writing's evaluator requests, as they cross from the renderer to main.
 *
 * Both are sent by main, not by the renderer's own `fetch`: the packaged
 * Content-Security-Policy's `connect-src` names only loopback `127.0.0.1` and
 * HuggingFace (see `contentSecurityPolicy.ts`), so a renderer `fetch` to the
 * endpoint a user types into Game Arena settings was refused before it left the
 * page, in packaged builds only. The CSP is right to refuse it, so the call moved
 * rather than the policy.
 *
 * Two backends cross here:
 *  - **custom API** (`games:mirrorEvaluate`): the user's own OpenAI-compatible
 *    chat-completions endpoint. Its key lives in the credential vault
 *    (`mirror-evaluator`) and is read by main — it no longer crosses the bridge,
 *    and it is no longer kept in plain localStorage (audit E11/M2).
 *  - **app AI** (`games:mirrorEvaluateAppAi`): the provider and engine set in
 *    Settings > AI, through the central client with the schema below.
 */

export const MIRROR_EVALUATE_CHANNEL = 'games:mirrorEvaluate';
export const MIRROR_EVALUATE_APP_AI_CHANNEL = 'games:mirrorEvaluateAppAi';

/** The vault entry holding the custom endpoint's key. */
export const MIRROR_CREDENTIAL_ID = 'mirror-evaluator';

export interface MirrorEvaluateRequest {
  /** The endpoint from Game Arena settings: an OpenAI-compatible chat-completions URL. */
  url: string;
  /** The JSON request body (model + messages); serialised by main. */
  body: unknown;
}

export type MirrorEvaluateResponse =
  | { ok: true; status: number; data: unknown }
  | {
      ok: false;
      /** `http`: the endpoint answered with a non-2xx status (in `status`). */
      reason: 'bad-request' | 'network' | 'timeout' | 'http' | 'not-json';
      status?: number;
      /** A platform message (verbatim, not ours to translate), when there is one. */
      detail?: string;
    };

export interface MirrorAppAiRequest {
  /** The grading prompt (idea map, reference answer, draft). */
  prompt: string;
  /** Study language of the exercise: `ja`, `zh` or `ru`. */
  lang: string;
}

export type MirrorAppAiResponse =
  | { ok: true; data: unknown }
  /** `code` is an AI error code; the renderer names it with `aiErrorMessageKey`. */
  | { ok: false; code: string };

/** Bounds that keep one draft evaluation from becoming an arbitrary upload. */
export const MIRROR_REQUEST_MAX_BYTES = 256 * 1024;
export const MIRROR_PROMPT_MAX_CHARS = 24_000;

/**
 * The JSON schema of one evaluation: four axes, each a score and a few tips.
 * The same shape `validateMirrorEvaluation` accepts in the renderer.
 */
const MIRROR_AXIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    tips: {
      type: 'array',
      items: {
        type: 'object',
        properties: { span: { type: 'string' }, message: { type: 'string' } },
        required: ['message'],
      },
    },
  },
  required: ['score', 'tips'],
};

export const MIRROR_EVALUATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    evaluatorVersion: { type: 'string' },
    total: { type: 'number' },
    axes: {
      type: 'object',
      properties: {
        grammar: MIRROR_AXIS_JSON_SCHEMA,
        vocabulary: MIRROR_AXIS_JSON_SCHEMA,
        flow: MIRROR_AXIS_JSON_SCHEMA,
        fidelity: MIRROR_AXIS_JSON_SCHEMA,
      },
      required: ['grammar', 'vocabulary', 'flow', 'fidelity'],
    },
    summary: { type: 'string' },
  },
  required: ['total', 'axes', 'summary'],
};

/**
 * The request main will send, or `null` when it must not be sent at all: only
 * http(s) URLs without embedded credentials, and a JSON body under the size cap.
 */
export function validateMirrorEvaluateRequest(raw: unknown): { url: string; json: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { url, body } = raw as Partial<MirrorEvaluateRequest>;
  if (typeof url !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  let json: string;
  try {
    json = JSON.stringify(body);
  } catch {
    return null;
  }
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MIRROR_REQUEST_MAX_BYTES) return null;
  return { url: parsed.toString(), json };
}

export function validateMirrorAppAiRequest(raw: unknown): MirrorAppAiRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const { prompt, lang } = raw as Partial<MirrorAppAiRequest>;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MIRROR_PROMPT_MAX_CHARS) return null;
  return { prompt, lang: lang === 'zh' || lang === 'ru' ? lang : 'ja' };
}

/**
 * A chat-completions URL from what a user typed: a bare base such as
 * `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio)
 * gets `/chat/completions`; a full endpoint URL is kept as typed.
 */
export function mirrorChatCompletionsUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /\/v\d+\/?$/u.test(trimmed) ? `${trimmed.replace(/\/+$/u, '')}/chat/completions` : trimmed;
}
