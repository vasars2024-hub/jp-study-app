// @vitest-environment node
//
// Derivative discovery over the transport, plus the paging-cursor guard the
// plan requires asserted rather than trusted (`MAL_ANIME_PIPELINE_PLAN.md`
// P2 gate 9).
//
// Nothing here touches the network or a real credential: every request goes
// through an injected `MalTransport` that answers from the URL, and every token
// below is an obvious fake.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  net: { request: (): void => undefined },
  safeStorage: { isEncryptionAvailable: (): boolean => false },
  shell: { openExternal: async (): Promise<void> => undefined },
}));

import {
  MalSyncClient,
  type MalHttpRequest,
  type MalHttpResponse,
  type MalTokenStore,
  type MalTokens,
  type MalTransport,
} from '../malSync';

const FAKE_ACCESS = 'FAKE-ACCESS-TOKEN-NOT-REAL';

function memoryStore(): MalTokenStore {
  let current: MalTokens | null = {
    accessToken: FAKE_ACCESS,
    refreshToken: 'FAKE-REFRESH-TOKEN-NOT-REAL',
    expiresAt: 4_000_000_000_000,
  };
  return {
    read: () => current,
    write: (tokens: MalTokens) => {
      current = tokens;
    },
    clear: () => {
      current = null;
    },
    encrypted: () => true,
  };
}

interface Harness {
  client: MalSyncClient;
  sent: MalHttpRequest[];
}

function harness(answer: (request: MalHttpRequest) => MalHttpResponse): Harness {
  const sent: MalHttpRequest[] = [];
  const transport: MalTransport = async (request) => {
    sent.push(request);
    return answer(request);
  };
  return {
    sent,
    client: new MalSyncClient({
      transport,
      store: memoryStore(),
      now: () => 1_700_000_000_000,
      config: () => ({
        clientId: 'fake-client-id-not-a-real-mal-app',
        clientSecret: '',
        redirectUri: undefined,
      }),
      randomBytes: (size: number) => Buffer.alloc(size, 7),
    }),
  };
}

/** A relation graph keyed by anime id, served as `/anime/{id}` detail bodies. */
function graph(edges: Record<number, [number, string][]>): (request: MalHttpRequest) => MalHttpResponse {
  return (request) => {
    const id = Number(new URL(request.url).pathname.split('/').pop());
    return {
      status: 200,
      body: JSON.stringify({
        id,
        title: `Title ${id}`,
        related_anime: (edges[id] ?? []).map(([node, relation]) => ({
          node: { id: node, title: `Title ${node}` },
          relation_type: relation,
          relation_type_formatted: relation,
        })),
      }),
    };
  };
}

describe('fetchAnimeRelations', () => {
  it('asks the detail endpoint for related_anime — the list endpoint never carries it', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']] }));
    await h.client.fetchAnimeRelations(1);

    const url = new URL(h.sent[0].url);
    expect(url.hostname).toBe('api.myanimelist.net');
    expect(url.pathname).toBe('/v2/anime/1');
    expect(url.searchParams.get('fields')).toBe('id,title,main_picture,related_anime');
    expect(h.sent[0].headers.Authorization).toBe(`Bearer ${FAKE_ACCESS}`);
  });

  it('refuses a non-id without spending a request', async () => {
    const h = harness(graph({}));
    await expect(h.client.fetchAnimeRelations(0)).rejects.toThrow(/not a MyAnimeList entry id/);
    await expect(h.client.fetchAnimeRelations(Number.NaN)).rejects.toThrow();
    expect(h.sent).toHaveLength(0);
  });
});

describe('fetchDerivatives', () => {
  it('records the relation type by which each derivative was reached', async () => {
    const h = harness(graph({ 1: [[2, 'sequel'], [3, 'side_story']], 2: [], 3: [] }));
    const result = await h.client.fetchDerivatives([1]);

    expect(result.derivatives.map((d) => [d.animeId, d.relation, d.fromAnimeId, d.depth])).toEqual([
      [2, 'sequel', 1, 1],
      [3, 'side_story', 1, 1],
    ]);
  });

  it('walks two hops by default, attributing the second hop to its own parent', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [[3, 'sequel']], 3: [[4, 'sequel']] }));
    const result = await h.client.fetchDerivatives([1]);

    expect(result.derivatives.map((d) => [d.animeId, d.fromAnimeId, d.depth])).toEqual([
      [2, 1, 1],
      [3, 2, 2],
    ]);
    // Depth 2 is reached, but never read — so title 4 is never discovered.
    expect(result.requests).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('stops at one hop when asked to', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [[3, 'sequel']] }));
    const result = await h.client.fetchDerivatives([1], { maxDepth: 1 });

    expect(result.derivatives.map((d) => d.animeId)).toEqual([2]);
    expect(result.requests).toBe(1);
  });

  it('terminates on the sequel/prequel two-cycle every franchise has', async () => {
    // 1 -> 2 as a sequel, and 2 -> 1 straight back as a prequel. An unguarded
    // walk here does not merely repeat; it never returns.
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [[1, 'prequel']] }));
    const result = await h.client.fetchDerivatives([1], { maxDepth: 8 });

    expect(result.derivatives.map((d) => d.animeId)).toEqual([2]);
    expect(result.requests).toBe(2);
  });

  it('never reports a seed as its own derivative, even reached from elsewhere', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [[3, 'sequel']], 3: [[1, 'prequel']] }));
    const result = await h.client.fetchDerivatives([1, 3], { maxDepth: 4 });

    expect(result.derivatives.map((d) => d.animeId)).toEqual([2]);
  });

  it('deduplicates a title two seeds both point at', async () => {
    const h = harness(graph({ 1: [[9, 'side_story']], 2: [[9, 'side_story']], 9: [] }));
    const result = await h.client.fetchDerivatives([1, 2], { maxDepth: 2 });

    expect(result.derivatives.map((d) => [d.animeId, d.fromAnimeId])).toEqual([[9, 1]]);
  });

  it('stops at the request budget and says so, rather than spending the users quota', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [[3, 'sequel']], 3: [[4, 'sequel']] }));
    const result = await h.client.fetchDerivatives([1], { maxDepth: 9, maxRequests: 2 });

    expect(result.requests).toBe(2);
    expect(result.truncated).toBe(true);
    expect(h.sent).toHaveLength(2);
  });

  it('clamps a nonsense budget instead of making zero or infinite requests', async () => {
    const h = harness(graph({ 1: [[2, 'sequel']], 2: [] }));
    const result = await h.client.fetchDerivatives([1], { maxDepth: 0, maxRequests: -5 });

    expect(result.requests).toBe(1);
    expect(result.derivatives.map((d) => d.animeId)).toEqual([2]);
  });

  it('makes no request at all for an empty or unusable seed list', async () => {
    const h = harness(graph({}));
    expect(await h.client.fetchDerivatives([])).toEqual({
      derivatives: [],
      requests: 0,
      truncated: false,
    });
    expect(await h.client.fetchDerivatives([0, -3, Number.NaN])).toMatchObject({ requests: 0 });
    expect(h.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P2 gate 9 — the paging cursor is MAL's string, not ours to trust
// ---------------------------------------------------------------------------

describe('the list walk refuses a hijacked paging cursor', () => {
  const page = (next: string | null, id: number): MalHttpResponse => ({
    status: 200,
    body: JSON.stringify({
      data: [{ node: { id, title: `Title ${id}` }, list_status: { status: 'completed' } }],
      paging: next ? { next } : {},
    }),
  });

  it('ends the walk, and never sends the bearer token to the foreign host', async () => {
    const h = harness((request) =>
      request.url.includes('evil.invalid')
        ? page(null, 99)
        : page('https://evil.invalid/v2/users/@me/animelist?offset=100', 1));

    const result = await h.client.fetchAnimeList();

    expect(result.pagesFetched).toBe(1);
    expect(result.entries.map((e) => e.animeId)).toEqual([1]);
    // The guard's whole point: the request was never made, so no Authorization
    // header carrying a real MAL token ever reached that host.
    expect(h.sent).toHaveLength(1);
    expect(h.sent.some((r) => r.url.includes('evil.invalid'))).toBe(false);
  });

  it('reports the walk as truncated when it stopped early, so the count is not read as complete', async () => {
    const h = harness(() => page('https://evil.invalid/v2/x', 1));
    expect((await h.client.fetchAnimeList()).truncated).toBe(false);
  });

  it('follows a genuine MAL cursor to the end', async () => {
    const h = harness((request) =>
      request.url.includes('offset=100')
        ? page(null, 2)
        : page('https://api.myanimelist.net/v2/users/@me/animelist?offset=100', 1));

    const result = await h.client.fetchAnimeList();
    expect(result.pagesFetched).toBe(2);
    expect(result.entries.map((e) => e.animeId)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
  });

  it('sends the completed filter MAL expects when one is asked for', async () => {
    const h = harness(() => page(null, 1));
    await h.client.fetchAnimeList({ status: 'completed' });
    expect(new URL(h.sent[0].url).searchParams.get('status')).toBe('completed');
  });
});
