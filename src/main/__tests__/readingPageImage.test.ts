// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertFetchablePageUrl,
  assertImageContentType,
  fetchReadingPageImage,
} from '../reading/pageImage';

/** A one-pixel GIF, so the assertions are about real bytes rather than a stub. */
const GIF_BYTES = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');

function imageResponse(
  body: Buffer,
  contentType = 'image/gif',
  init: { status?: number } = {},
): Response {
  return new Response(new Uint8Array(body), {
    status: init.status ?? 200,
    headers: { 'content-type': contentType },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page URL validation', () => {
  it('accepts the protocols a provider CDN actually serves over', () => {
    expect(assertFetchablePageUrl('https://cdn.example/1.jpg').protocol).toBe('https:');
    expect(assertFetchablePageUrl('http://cdn.example/1.jpg').protocol).toBe('http:');
  });

  it('refuses a URL that would make this channel an arbitrary-read primitive', () => {
    // Page URLs come from third-party extension code, so they are untrusted
    // input rather than values this app chose.
    expect(() => assertFetchablePageUrl('file:///C:/Users/secret.txt')).toThrow(/not fetchable/i);
    expect(() => assertFetchablePageUrl('data:text/html,<script>')).toThrow(/not fetchable/i);
    expect(() => assertFetchablePageUrl('not a url')).toThrow(/not a URL/i);
  });
});

describe('page content type', () => {
  it('keeps the image type and drops parameters', () => {
    expect(assertImageContentType('image/jpeg; charset=binary')).toBe('image/jpeg');
    expect(assertImageContentType('IMAGE/WEBP')).toBe('image/webp');
  });

  it('assumes JPEG when the CDN sends no type at all', () => {
    expect(assertImageContentType('')).toBe('image/jpeg');
  });

  it('rejects a non-image body instead of handing an <img> a broken data URL', () => {
    // A provider answering with an HTML block page would otherwise render as a
    // silently broken page rather than as an error.
    expect(() => assertImageContentType('text/html')).toThrow(/not an image/i);
  });
});

describe('fetchReadingPageImage', () => {
  it('sends the provider headers and returns a data URL', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return imageResponse(GIF_BYTES);
    });

    const image = await fetchReadingPageImage({
      url: 'https://cdn.example/ch/1.gif',
      headers: { Referer: 'https://example', 'User-Agent': 'seanime' },
    });

    // The Referer/User-Agent pair is the whole reason this fetch is in main.
    expect(seen[0].headers).toEqual({ Referer: 'https://example', 'User-Agent': 'seanime' });
    expect(image.contentType).toBe('image/gif');
    expect(image.byteLength).toBe(GIF_BYTES.byteLength);
    expect(image.dataUrl).toBe(`data:image/gif;base64,${GIF_BYTES.toString('base64')}`);
  });

  it('reports a failed request by status rather than returning empty bytes', async () => {
    vi.stubGlobal('fetch', async () => imageResponse(GIF_BYTES, 'image/gif', { status: 403 }));
    await expect(
      fetchReadingPageImage({ url: 'https://cdn.example/1.gif', headers: {} }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it('rejects an empty body, which an <img> would render as a blank page', async () => {
    vi.stubGlobal('fetch', async () => imageResponse(Buffer.alloc(0)));
    await expect(
      fetchReadingPageImage({ url: 'https://cdn.example/1.gif', headers: {} }),
    ).rejects.toThrow(/empty body/i);
  });

  it('never issues the request for a URL it refuses', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      fetchReadingPageImage({ url: 'file:///C:/secret.txt', headers: {} }),
    ).rejects.toThrow(/not fetchable/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
