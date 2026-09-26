/**
 * Sends Mirror Writing's "API" evaluation for the renderer (see
 * `shared/mirrorEvaluatorIpc.ts` for why it is main's job: the packaged CSP refuses a
 * renderer `fetch` to a user-chosen endpoint, and should).
 *
 * One POST, to the URL the request names, with the user's key as a bearer token; the
 * answer comes back parsed. Nothing is persisted and nothing is retried here — the
 * renderer owns the schema check and its one retry.
 */
import { ipcMain } from 'electron';
import {
  MIRROR_EVALUATE_CHANNEL,
  validateMirrorEvaluateRequest,
  type MirrorEvaluateResponse,
} from '../shared/mirrorEvaluatorIpc';

const TIMEOUT_MS = 60_000;
/** A chat-completion answer is a few KB; anything this large is not one. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function postMirrorEvaluation(
  raw: unknown,
  fetchImpl: FetchLike = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<MirrorEvaluateResponse> {
  const request = validateMirrorEvaluateRequest(raw);
  if (!request) return { ok: false, reason: 'bad-request' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${request.apiKey}` },
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

export function registerMirrorEvaluatorIpc(): void {
  ipcMain.handle(MIRROR_EVALUATE_CHANNEL, (_e, raw: unknown) => postMirrorEvaluation(raw));
}
