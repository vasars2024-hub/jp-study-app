/**
 * Fetching a provider page's bytes (Phase 5).
 *
 * This is the piece that makes a provider chapter actually readable. The
 * renderer cannot fetch these itself: an `<img src>` sends no custom headers,
 * and `ReadingPage.headers` carries the Referer/User-Agent pair the CDN checks,
 * so a renderer-side load returns 403. Doing it here also keeps every provider
 * credential on the main side, which is the same rule `stripReadingPageSecrets`
 * applies to stored pages.
 *
 * Deliberately NOT routed through Seanime's `/api/v1/image-proxy`: that route
 * sits behind `OptionalAuthMiddleware`, so with a server password set it needs
 * either the token header (which an `<img>` cannot send) or an HMAC query token
 * bound to the path. Fetching the page URL directly needs neither and does not
 * depend on the sidecar being up once the page list is in hand.
 */

import type { ReadingPageImage, ReadingPageImageInput } from '../../shared/readingIpc';

export interface ReadingPageBytes {
  bytes: Buffer;
  byteLength: number;
  contentType: string;
}

/**
 * A page URL comes from a third-party extension, so it is untrusted input, not
 * a value this app chose. Anything but http(s) — `file:`, `data:` — would turn
 * this channel into an arbitrary-read primitive for a malicious provider.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** A manga page is well under this; the cap stops a hostile or broken response. */
const MAX_PAGE_BYTES = 32 * 1024 * 1024;

const DEFAULT_CONTENT_TYPE = 'image/jpeg';

const REQUEST_TIMEOUT_MS = 30_000;

export function assertFetchablePageUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Page URL is not a URL: ${url.slice(0, 120)}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Page URL protocol "${parsed.protocol}" is not fetchable.`);
  }
  return parsed;
}

/**
 * Only image content types are accepted. A provider that has started answering
 * with an HTML block page would otherwise be handed to an `<img>` as a data URL
 * and render as a silently broken page rather than as an error.
 */
export function assertImageContentType(contentType: string): string {
  const normalized = (contentType || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized) return DEFAULT_CONTENT_TYPE;
  if (!normalized.startsWith('image/')) {
    throw new Error(`Page responded with "${normalized}", which is not an image.`);
  }
  return normalized;
}

export async function fetchReadingPageImage(
  input: ReadingPageImageInput,
): Promise<ReadingPageImage> {
  const result = await fetchReadingPageBytes(input);
  return {
    dataUrl: `data:${result.contentType};base64,${result.bytes.toString('base64')}`,
    byteLength: result.byteLength,
    contentType: result.contentType,
  };
}

export async function fetchReadingPageBytes(
  input: ReadingPageImageInput,
): Promise<ReadingPageBytes> {
  const url = assertFetchablePageUrl(input.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { ...(input.headers ?? {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Page request failed: HTTP ${response.status}`);
    }

    const contentType = assertImageContentType(response.headers.get('content-type') ?? '');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error('Page responded with an empty body.');
    }
    if (bytes.byteLength > MAX_PAGE_BYTES) {
      throw new Error(
        `Page is ${bytes.byteLength} bytes, over the ${MAX_PAGE_BYTES}-byte limit.`,
      );
    }

    return {
      bytes,
      byteLength: bytes.byteLength,
      contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Page request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
