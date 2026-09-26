/**
 * Mirror Writing's "API" evaluator request, as it crosses from the renderer to main.
 *
 * The request is sent by main, not by the renderer's own `fetch`: the packaged
 * Content-Security-Policy's `connect-src` names only loopback `127.0.0.1` and HuggingFace
 * (see `contentSecurityPolicy.ts`), so a renderer `fetch` to the endpoint a user types into
 * Game Arena settings — `https://api.openai.com/...`, or the settings placeholder's own
 * `https://localhost:8000/...` — was refused before it left the page, in packaged builds
 * only. The CSP is right to refuse it (an endpoint chosen at runtime is exactly what that
 * directive exists to keep out of the renderer), so the call moved rather than the policy.
 */

export const MIRROR_EVALUATE_CHANNEL = 'games:mirrorEvaluate';

export interface MirrorEvaluateRequest {
  /** The endpoint from Game Arena settings: an OpenAI-compatible chat-completions URL. */
  url: string;
  apiKey: string;
  /** The JSON request body (model messages); serialised by main. */
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

/** Bounds that keep one draft evaluation from becoming an arbitrary upload. */
export const MIRROR_REQUEST_MAX_BYTES = 256 * 1024;
export const MIRROR_KEY_MAX_CHARS = 4096;

/**
 * The request main will send, or `null` when it must not be sent at all: only http(s)
 * URLs without embedded credentials, a bounded key, and a JSON body under the size cap.
 */
export function validateMirrorEvaluateRequest(raw: unknown): { url: string; apiKey: string; json: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { url, apiKey, body } = raw as Partial<MirrorEvaluateRequest>;
  if (typeof url !== 'string' || typeof apiKey !== 'string') return null;
  if (!apiKey.trim() || apiKey.length > MIRROR_KEY_MAX_CHARS || /[\r\n]/.test(apiKey)) return null;
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
  return { url: parsed.toString(), apiKey: apiKey.trim(), json };
}
