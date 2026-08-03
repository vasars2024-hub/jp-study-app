/**
 * Typed main-process client for the supervised Seanime sidecar.
 *
 * The adopted renderer has its own axios client. Scraper jobs live in Electron
 * main, so they need the same response-unwrapping and authentication behaviour
 * without importing renderer code.
 */

import {
  getSeanimeStatus,
  seanimeAuthToken,
  seanimeBaseUrl,
} from './supervisor';

export class SeanimeUnavailableError extends Error {
  constructor(message = 'Seanime sidecar is not ready.') {
    super(message);
    this.name = 'SeanimeUnavailableError';
  }
}

/**
 * The reason a failed response gives, falling back to its status.
 *
 * Reading the body must never mask the failure being reported, so anything
 * that goes wrong in here degrades to the status code rather than throwing.
 */
async function errorDetail(response: Response): Promise<string> {
  const status = `HTTP ${response.status}`;
  try {
    const body = await response.text();
    if (!body) return status;
    const parsed = JSON.parse(body) as { error?: unknown };
    const message = typeof parsed.error === 'string' ? parsed.error.trim() : '';
    return message ? `${status}: ${message.slice(0, 300)}` : status;
  } catch {
    return status;
  }
}

export interface SeanimeApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  timeoutMs?: number;
}

export async function seanimeApi<T>(
  route: string,
  options: SeanimeApiOptions = {},
): Promise<T> {
  const baseUrl = seanimeBaseUrl();
  const status = getSeanimeStatus();
  if (!baseUrl || status.kind !== 'ready') {
    throw new SeanimeUnavailableError(
      status.kind === 'disabled'
        ? 'Seanime sidecar is disabled.'
        : `Seanime sidecar is ${status.kind}.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1_000, Math.min(options.timeoutMs ?? 30_000, 120_000)),
  );

  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method ?? 'GET',
      headers: {
        'X-Seanime-Token': seanimeAuthToken(),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Seanime answers failures with the same `{ data, error }` envelope, and
      // its `error` is the only thing that says *why*. Throwing on the status
      // alone reduced every failure to a bare "HTTP 500" — which made a
      // provider with no chapters and a provider that does not exist read
      // identically at the reading boundary.
      throw new Error(`${route} -> ${await errorDetail(response)}`);
    }

    const payload = (await response.json()) as { data?: T; error?: string };
    if (payload.error) throw new Error(`${route} -> ${payload.error}`);
    if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
      throw new Error(`${route} -> response contained no data`);
    }
    return payload.data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${route} -> timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

