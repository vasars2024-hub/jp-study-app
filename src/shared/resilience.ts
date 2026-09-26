/**
 * Typed failure codes for main-process work that talks to something that can
 * fail: a subprocess, a local service, a web API, the disk.
 *
 * Main returns a `FailureCode` (plus optional retry time and a raw `detail`
 * line); the renderer turns it into text through `failureMessageKey` in the
 * UI language. The raw English/process diagnostic is only ever shown as an
 * optional details line — never as the message itself.
 *
 * Pure and dependency-free: imported from main, preload types and renderer.
 */

export type FailureCode =
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'auth'
  | 'storage-full'
  | 'missing-file'
  | 'service-error'
  | 'cancelled';

export const FAILURE_CODES: readonly FailureCode[] = [
  'offline', 'timeout', 'rate-limited', 'auth', 'storage-full', 'missing-file', 'service-error', 'cancelled',
];

export interface TypedFailure {
  code: FailureCode;
  /** Epoch ms after which a retry is worth making (rate limits). */
  retryAt?: number;
  /** Raw diagnostic (English, paths, exit codes). Details line only. */
  detail?: string;
}

export function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === 'string' && (FAILURE_CODES as readonly string[]).includes(value);
}

/** The i18n key that explains a failure code in one sentence. */
export function failureMessageKey(code: FailureCode): string {
  return `failure.${code}`;
}

/** The i18n key of the recovery action that fits a failure code. */
export function failureActionKey(code: FailureCode): string {
  switch (code) {
    case 'auth': return 'failure.action.openSettings';
    case 'missing-file': return 'failure.action.relink';
    case 'storage-full': return 'failure.action.freeSpace';
    default: return 'failure.action.retry';
  }
}

/** Whether a thrown error is the disk refusing to take more bytes. */
export function isStorageFullError(err: unknown): boolean {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return code === 'ENOSPC' || code === 'EDQUOT';
}

/** Whether a thrown error is a file that is not there. */
export function isMissingFileError(err: unknown): boolean {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

const OFFLINE_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH',
  'ENETDOWN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
]);

/**
 * Classifies a thrown transport error (fetch/undici/net) — never an HTTP
 * status, which `failureFromStatus` handles.
 */
export function failureFromError(err: unknown): TypedFailure {
  const detail = err instanceof Error ? err.message : String(err);
  const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined;
  if (name === 'TimeoutError') return { code: 'timeout', detail };
  if (name === 'AbortError') return { code: 'cancelled', detail };
  const codes: unknown[] = [];
  let cursor: unknown = err;
  for (let depth = 0; depth < 4 && cursor && typeof cursor === 'object'; depth += 1) {
    codes.push((cursor as { code?: unknown }).code);
    cursor = (cursor as { cause?: unknown }).cause;
  }
  if (codes.some((code) => code === 'ETIMEDOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT')) {
    return { code: 'timeout', detail };
  }
  if (codes.some((code) => typeof code === 'string' && OFFLINE_CODES.has(code))) return { code: 'offline', detail };
  if (isStorageFullError(err)) return { code: 'storage-full', detail };
  if (isMissingFileError(err)) return { code: 'missing-file', detail };
  // `fetch failed` with no recognisable cause is what undici throws for a
  // machine with no network at all.
  if (/fetch failed|network|getaddrinfo|socket hang up/i.test(detail)) return { code: 'offline', detail };
  return { code: 'service-error', detail };
}

/**
 * Parses an HTTP `Retry-After` header (delta-seconds or an HTTP date) into a
 * delay in ms, or null when absent/unparseable. Clamped to a day.
 */
export function parseRetryAfterMs(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.min(Math.round(Number(trimmed) * 1000), 86_400_000);
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return null;
  return Math.min(Math.max(0, at - now), 86_400_000);
}

/** Maps an HTTP status to a failure code, or null for a success status. */
export function failureFromStatus(
  status: number,
  retryAfter?: string | null,
  now = Date.now(),
): TypedFailure | null {
  if (status >= 200 && status < 400) return null;
  if (status === 429) {
    const delay = parseRetryAfterMs(retryAfter, now);
    return { code: 'rate-limited', retryAt: now + (delay ?? 60_000), detail: `HTTP ${status}` };
  }
  if (status === 401 || status === 403) return { code: 'auth', detail: `HTTP ${status}` };
  if (status === 408 || status === 504) return { code: 'timeout', detail: `HTTP ${status}` };
  return { code: 'service-error', detail: `HTTP ${status}` };
}

/**
 * Races a promise against a deadline. On expiry `onTimeout` runs (kill the
 * child, abort the request) and the returned promise rejects with a
 * `TimeoutError`, so every caller leaves "busy" even when the work never
 * settles on its own.
 */
export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

export function withDeadline<T>(work: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        /* the deadline still fires */
      }
      reject(new DeadlineError(label, ms));
    }, ms);
  });
  return Promise.race([work, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
