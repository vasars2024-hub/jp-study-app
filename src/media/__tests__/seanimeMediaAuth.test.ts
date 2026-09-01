// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSeanimeMediaAuth } from '../seanimeMediaAuth';

const BASE_URL = 'http://127.0.0.1:4321';
const TOKEN = 'sidecar-token';
let originalFetch: typeof window.fetch;
let release: (() => void) | null = null;

beforeEach(() => {
  originalFetch = window.fetch;
});

afterEach(() => {
  release?.();
  release = null;
  window.fetch = originalFetch;
  vi.restoreAllMocks();
});

function installWithFetch() {
  const fetchMock = vi.fn(async () => new Response('ok'));
  window.fetch = fetchMock as typeof window.fetch;
  release = installSeanimeMediaAuth({ baseUrl: BASE_URL, token: TOKEN });
  return fetchMock;
}

describe('installSeanimeMediaAuth', () => {
  it('adds the token only to the sidecar mediastream routes', async () => {
    const fetchMock = installWithFetch();

    await window.fetch(`${BASE_URL}/api/v1/mediastream/master.m3u8`);
    await window.fetch(`${BASE_URL}/api/v1/library`);
    await window.fetch('https://example.com/api/v1/mediastream/master.m3u8');

    const scopedHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(scopedHeaders.get('X-Seanime-Token')).toBe(TOKEN);
    expect(fetchMock.mock.calls[1][1]).toBeUndefined();
    expect(fetchMock.mock.calls[2][1]).toBeUndefined();
  });

  it('preserves an explicit caller token', async () => {
    const fetchMock = installWithFetch();

    await window.fetch(`${BASE_URL}/api/v1/mediastream/segment.ts`, {
      headers: { 'X-Seanime-Token': 'explicit-token' },
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-Seanime-Token')).toBe('explicit-token');
  });

  it('covers XMLHttpRequest loaders used by HLS implementations', () => {
    installWithFetch();
    const request = new XMLHttpRequest();
    const setHeader = vi.spyOn(request, 'setRequestHeader');

    request.open('GET', `${BASE_URL}/api/v1/mediastream/segment.ts`);

    expect(setHeader).toHaveBeenCalledWith('X-Seanime-Token', TOKEN);
  });

  it('keeps the patch until the last mounted player releases it', () => {
    const fetchMock = vi.fn(async () => new Response('ok')) as unknown as typeof window.fetch;
    window.fetch = fetchMock;
    const firstRelease = installSeanimeMediaAuth({ baseUrl: BASE_URL, token: TOKEN });
    const patchedFetch = window.fetch;
    const secondRelease = installSeanimeMediaAuth({ baseUrl: BASE_URL, token: TOKEN });

    firstRelease();
    expect(window.fetch).toBe(patchedFetch);
    secondRelease();
    expect(window.fetch).toBe(fetchMock);

    release = null;
  });
});
