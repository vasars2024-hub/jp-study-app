// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supervisor = vi.hoisted(() => ({
  status: { kind: 'ready' } as { kind: string },
  baseUrl: 'http://127.0.0.1:9999',
}));

vi.mock('../seanime/supervisor', () => ({
  getSeanimeStatus: () => supervisor.status,
  seanimeAuthToken: () => 'test-token',
  seanimeBaseUrl: () => supervisor.baseUrl,
}));

import { seanimeApi, SeanimeUnavailableError } from '../seanime/client';

function respond(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  supervisor.status = { kind: 'ready' };
  supervisor.baseUrl = 'http://127.0.0.1:9999';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('seanime client failures', () => {
  it('surfaces the reason Seanime gives, not just the status', async () => {
    // Two different failures answer 500. Reducing both to "HTTP 500" made a
    // provider with no chapters indistinguishable from one that does not
    // exist, which is precisely what the reading boundary has to tell apart.
    globalThis.fetch = vi.fn(async () =>
      respond(500, JSON.stringify({ error: 'no results found for this media' })),
    ) as unknown as typeof fetch;

    await expect(seanimeApi('/api/v1/manga/chapters')).rejects.toThrow(
      /HTTP 500: no results found for this media/,
    );
  });

  it('distinguishes a missing provider from an empty one', async () => {
    globalThis.fetch = vi.fn(async () =>
      respond(500, JSON.stringify({ error: 'manga: Provider not found' })),
    ) as unknown as typeof fetch;

    await expect(seanimeApi('/api/v1/manga/chapters')).rejects.toThrow(
      /manga: Provider not found/,
    );
  });

  it('falls back to the status when the body is empty or not the envelope', async () => {
    for (const body of ['', '<html>gateway</html>', '{"unexpected":true}']) {
      globalThis.fetch = vi.fn(async () => respond(502, body)) as unknown as typeof fetch;
      await expect(seanimeApi('/api/v1/manga/chapters')).rejects.toThrow(/-> HTTP 502$/);
    }
  });

  it('caps a hostile error body instead of relaying all of it', async () => {
    globalThis.fetch = vi.fn(async () =>
      respond(500, JSON.stringify({ error: 'x'.repeat(5_000) })),
    ) as unknown as typeof fetch;

    const error = await seanimeApi('/x').catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message.length).toBeLessThan(400);
    expect((error as Error).message).toMatch(/HTTP 500: x+/);
  });

  it('still reports an error carried in a 200 envelope', async () => {
    globalThis.fetch = vi.fn(async () =>
      respond(200, JSON.stringify({ error: 'provider exploded' })),
    ) as unknown as typeof fetch;

    await expect(seanimeApi('/x')).rejects.toThrow(/provider exploded/);
  });

  it('refuses to call at all when the sidecar is not ready', async () => {
    supervisor.status = { kind: 'offline' };
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    await expect(seanimeApi('/x')).rejects.toBeInstanceOf(SeanimeUnavailableError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
