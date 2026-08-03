// @vitest-environment node
//
// MyAnimeList sync — OAuth, refresh policy, and wire format.
//
// **Nothing in this file touches the network.** Every request goes through an
// injected `MalTransport` that resolves from a table, and the suite asserts on
// what was *sent* as much as on what came back. That is not only for speed: MAL,
// Jikan and AniList were all unreachable from the machine this was written on,
// so a suite that needed connectivity would have been a suite that never ran.
//
// It also never touches a real credential. Every token below is a fake with an
// obviously-fake shape.
import { describe, expect, it, vi } from 'vitest';
import {
  MAL_TOKEN_URL,
  buildMalAuthorizeUrl,
  parseMalAnimeListPage,
  serialiseMalListStatusUpdate,
} from '../../shared/malSync';

// malSync imports electron for `net`/`safeStorage`/`ipcMain`; none of it is
// reached by these tests, which inject a transport and an in-memory store.
vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  net: { request: (): void => undefined },
  safeStorage: { isEncryptionAvailable: (): boolean => false },
  shell: { openExternal: async (): Promise<void> => undefined },
}));

import {
  MalSyncClient,
  MalSyncError,
  createMalPkcePair,
  isMalApiUrl,
  type MalHttpRequest,
  type MalHttpResponse,
  type MalTokenStore,
  type MalTokens,
  type MalTransport,
} from '../malSync';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const FAKE_CLIENT_ID = 'fake-client-id-not-a-real-mal-app';
const FAKE_ACCESS = 'FAKE-ACCESS-TOKEN-NOT-REAL';
const FAKE_REFRESH = 'FAKE-REFRESH-TOKEN-NOT-REAL';
const FAKE_ACCESS_2 = 'FAKE-ACCESS-TOKEN-AFTER-REFRESH';

function memoryStore(initial: MalTokens | null = null): MalTokenStore & { current: MalTokens | null } {
  const box = {
    current: initial,
    read: (): MalTokens | null => box.current,
    write: (tokens: MalTokens): void => {
      box.current = tokens;
    },
    clear: (): void => {
      box.current = null;
    },
    encrypted: (): boolean => true,
  };
  return box;
}

const connectedTokens = (over: Partial<MalTokens> = {}): MalTokens => ({
  accessToken: FAKE_ACCESS,
  refreshToken: FAKE_REFRESH,
  // Far future, so proactive refresh never fires unless a test asks for it.
  expiresAt: 4_000_000_000_000,
  ...over,
});

interface Recorder {
  transport: MalTransport;
  sent: MalHttpRequest[];
  tokenCalls: () => MalHttpRequest[];
  apiCalls: () => MalHttpRequest[];
}

/** Builds a transport that answers by matching the URL, recording everything. */
function recorder(
  answer: (request: MalHttpRequest, index: number) => MalHttpResponse,
): Recorder {
  const sent: MalHttpRequest[] = [];
  const transport: MalTransport = async (request) => {
    sent.push(request);
    return answer(request, sent.length - 1);
  };
  return {
    transport,
    sent,
    tokenCalls: () => sent.filter((r) => r.url === MAL_TOKEN_URL),
    apiCalls: () => sent.filter((r) => r.url !== MAL_TOKEN_URL),
  };
}

const tokenResponse = (accessToken: string, refreshToken = FAKE_REFRESH): MalHttpResponse => ({
  status: 200,
  body: JSON.stringify({
    token_type: 'Bearer',
    expires_in: 2_678_400,
    access_token: accessToken,
    refresh_token: refreshToken,
  }),
});

function makeClient(
  transport: MalTransport,
  store: MalTokenStore,
  over: { clientId?: string; now?: () => number } = {},
): MalSyncClient {
  return new MalSyncClient({
    transport,
    store,
    now: over.now ?? ((): number => 1_700_000_000_000),
    config: () => ({
      clientId: over.clientId ?? FAKE_CLIENT_ID,
      clientSecret: '',
      redirectUri: undefined,
    }),
    randomBytes: (size: number) => Buffer.alloc(size, 7),
  });
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

describe('PKCE', () => {
  it('derives the challenge as the verifier itself, because MAL only supports the plain method', () => {
    // This is the assertion that stops a well-meaning "fix" to S256. MAL does
    // not hash its side of the comparison, so hashing ours breaks the exchange.
    const pair = createMalPkcePair();
    expect(pair.codeChallenge).toBe(pair.codeVerifier);
    expect(pair.codeChallengeMethod).toBe('plain');
  });

  it('generates a verifier inside RFC 7636s required 43-128 character range', () => {
    const pair = createMalPkcePair();
    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.codeVerifier.length).toBeLessThanOrEqual(128);
    // base64url only: a '+' or '/' would be re-encoded in the query string and
    // no longer match the verifier posted to the token endpoint.
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('does not reuse a verifier between two sign-ins', () => {
    expect(createMalPkcePair().codeVerifier).not.toBe(createMalPkcePair().codeVerifier);
  });
});

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

describe('authorize URL', () => {
  it('carries every parameter MAL requires, with the plain challenge method', () => {
    const url = new URL(buildMalAuthorizeUrl({
      clientId: FAKE_CLIENT_ID,
      codeChallenge: 'FAKE-VERIFIER-AND-CHALLENGE',
      state: 'FAKE-STATE',
    }));
    expect(url.origin + url.pathname).toBe('https://myanimelist.net/v1/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(url.searchParams.get('code_challenge')).toBe('FAKE-VERIFIER-AND-CHALLENGE');
    expect(url.searchParams.get('code_challenge_method')).toBe('plain');
    expect(url.searchParams.get('state')).toBe('FAKE-STATE');
    // Omitted rather than empty: MAL infers it when one URI is registered, and
    // an empty redirect_uri is rejected rather than ignored.
    expect(url.searchParams.has('redirect_uri')).toBe(false);
  });

  it('includes redirect_uri only when one is configured', () => {
    const url = new URL(buildMalAuthorizeUrl({
      clientId: FAKE_CLIENT_ID,
      codeChallenge: 'c',
      state: 's',
      redirectUri: 'https://example.invalid/callback',
    }));
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.invalid/callback');
  });

  it('sends the same string as challenge that beginAuth will later send as verifier', async () => {
    // The end-to-end version of the plain-PKCE property: whatever went out on
    // /authorize must come back out on /token unchanged.
    const store = memoryStore();
    const rec = recorder(() => tokenResponse(FAKE_ACCESS));
    const client = makeClient(rec.transport, store);

    const pending = client.beginAuth();
    const challenge = new URL(pending.authorizeUrl).searchParams.get('code_challenge');

    await client.completeAuth('FAKE-AUTH-CODE', pending.state);
    const posted = new URLSearchParams(rec.tokenCalls()[0].body);
    expect(posted.get('code_verifier')).toBe(challenge);
  });
});

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

describe('code exchange', () => {
  it('posts the fields MALs token endpoint expects, form-encoded', async () => {
    const store = memoryStore();
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL
        ? tokenResponse(FAKE_ACCESS)
        : { status: 200, body: JSON.stringify({ name: 'fake-user' }) });
    const client = makeClient(rec.transport, store);

    const pending = client.beginAuth();
    await client.completeAuth('FAKE-AUTH-CODE', pending.state);

    const call = rec.tokenCalls()[0];
    expect(call.method).toBe('POST');
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(call.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(body.get('code')).toBe('FAKE-AUTH-CODE');
    expect(body.get('code_verifier')).toBeTruthy();
    // No secret configured: a public PKCE client must not send an empty one.
    expect(body.has('client_secret')).toBe(false);
  });

  it('stores the tokens and reports the account as connected', async () => {
    const store = memoryStore();
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL
        ? tokenResponse(FAKE_ACCESS)
        : { status: 200, body: JSON.stringify({ name: 'fake-user' }) });
    const client = makeClient(rec.transport, store);

    const pending = client.beginAuth();
    const status = await client.completeAuth('FAKE-AUTH-CODE', pending.state);

    expect(status.connected).toBe(true);
    expect(status.username).toBe('fake-user');
    expect(store.current?.accessToken).toBe(FAKE_ACCESS);
  });

  it('rejects a callback whose state does not match the request', async () => {
    // Without this, anything that can reach the callback can make the user
    // sync against an attacker-controlled MAL account.
    const store = memoryStore();
    const rec = recorder(() => tokenResponse(FAKE_ACCESS));
    const client = makeClient(rec.transport, store);
    client.beginAuth();

    await expect(client.completeAuth('FAKE-AUTH-CODE', 'WRONG-STATE')).rejects.toThrow(MalSyncError);
    expect(rec.tokenCalls()).toHaveLength(0);
    expect(store.current).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The refresh policy — the part most likely to become a loop
// ---------------------------------------------------------------------------

describe('401 handling', () => {
  it('refreshes exactly once and retries exactly once', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) => {
      if (request.url === MAL_TOKEN_URL) return tokenResponse(FAKE_ACCESS_2);
      // First API call fails, the one after the refresh succeeds.
      const apiSoFar = rec.sent.filter((r) => r.url !== MAL_TOKEN_URL).length;
      return apiSoFar === 1
        ? { status: 401, body: '' }
        : { status: 200, body: JSON.stringify({ data: [], paging: {} }) };
    });
    const client = makeClient(rec.transport, store);

    await client.fetchAnimeList();

    expect(rec.tokenCalls()).toHaveLength(1);
    expect(rec.apiCalls()).toHaveLength(2);
    // The retry must present the NEW token, not the one that just 401'd.
    expect(rec.apiCalls()[0].headers.Authorization).toBe(`Bearer ${FAKE_ACCESS}`);
    expect(rec.apiCalls()[1].headers.Authorization).toBe(`Bearer ${FAKE_ACCESS_2}`);
  });

  it('does NOT loop when the refreshed token is also rejected', async () => {
    // The failure this bounds: refresh-on-401 written as a loop hammers MAL
    // forever the moment a token is rejected for a reason refreshing cannot
    // fix — a revoked app, a deleted account.
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL ? tokenResponse(FAKE_ACCESS_2) : { status: 401, body: '' });
    const client = makeClient(rec.transport, store);

    await expect(client.fetchAnimeList()).rejects.toMatchObject({ code: 'reauth-required' });

    expect(rec.tokenCalls()).toHaveLength(1);
    expect(rec.apiCalls()).toHaveLength(2);
  });

  it('refreshes proactively when the token has expired, without a wasted 401', async () => {
    const now = 1_700_000_000_000;
    const store = memoryStore(connectedTokens({ expiresAt: now - 1 }));
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL
        ? tokenResponse(FAKE_ACCESS_2)
        : { status: 200, body: JSON.stringify({ data: [], paging: {} }) });
    const client = makeClient(rec.transport, store, { now: () => now });

    await client.fetchAnimeList();

    expect(rec.tokenCalls()).toHaveLength(1);
    expect(rec.apiCalls()).toHaveLength(1);
    expect(rec.apiCalls()[0].headers.Authorization).toBe(`Bearer ${FAKE_ACCESS_2}`);
  });

  it('does not refresh a second time when a proactive refresh is still rejected', async () => {
    // Proactive and reactive refresh are two paths to the same place; the
    // "exactly one refresh" bound has to hold across both, not per-path.
    const now = 1_700_000_000_000;
    const store = memoryStore(connectedTokens({ expiresAt: now - 1 }));
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL ? tokenResponse(FAKE_ACCESS_2) : { status: 401, body: '' });
    const client = makeClient(rec.transport, store, { now: () => now });

    await expect(client.fetchAnimeList()).rejects.toMatchObject({ code: 'reauth-required' });

    expect(rec.tokenCalls()).toHaveLength(1);
    expect(rec.apiCalls()).toHaveLength(1);
  });
});

describe('refresh failure', () => {
  it('surfaces as re-authentication required, not as a generic error', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL
        ? { status: 400, body: JSON.stringify({ error: 'invalid_grant' }) }
        : { status: 401, body: '' });
    const client = makeClient(rec.transport, store);

    await expect(client.fetchAnimeList()).rejects.toMatchObject({
      code: 'reauth-required',
      name: 'MalSyncError',
    });
  });

  it('clears the dead refresh token so the UI stops claiming a connection', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL ? { status: 400, body: '' } : { status: 401, body: '' });
    const client = makeClient(rec.transport, store);

    await expect(client.fetchAnimeList()).rejects.toThrow(MalSyncError);
    expect(store.current).toBeNull();
    expect(client.status().connected).toBe(false);
  });

  it('keeps the tokens when MAL is merely down, and calls that transient', async () => {
    // A 502 during refresh must not log the user out. The refresh token is
    // almost certainly fine; MAL is not.
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL ? { status: 502, body: '' } : { status: 401, body: '' });
    const client = makeClient(rec.transport, store);

    await expect(client.fetchAnimeList()).rejects.toMatchObject({ code: 'transient' });
    expect(store.current?.refreshToken).toBe(FAKE_REFRESH);
  });

  it('sends grant_type=refresh_token with the stored refresh token', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === MAL_TOKEN_URL
        ? tokenResponse(FAKE_ACCESS_2)
        : rec.sent.filter((r) => r.url !== MAL_TOKEN_URL).length === 1
          ? { status: 401, body: '' }
          : { status: 200, body: JSON.stringify({ data: [], paging: {} }) });
    const client = makeClient(rec.transport, store);

    await client.fetchAnimeList();

    const body = new URLSearchParams(rec.tokenCalls()[0].body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe(FAKE_REFRESH);
    expect(body.get('client_id')).toBe(FAKE_CLIENT_ID);
  });
});

// ---------------------------------------------------------------------------
// Not configured / not connected
// ---------------------------------------------------------------------------

describe('configuration state', () => {
  it('reports "not configured" rather than failing at request time', async () => {
    const client = makeClient(recorder(() => ({ status: 200, body: '{}' })).transport,
      memoryStore(connectedTokens()), { clientId: '' });
    expect(client.status().configured).toBe(false);
    await expect(client.fetchAnimeList()).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('distinguishes "configured but not signed in" from "not configured"', async () => {
    const store = memoryStore(null);
    const client = makeClient(recorder(() => ({ status: 200, body: '{}' })).transport, store);
    expect(client.status()).toMatchObject({ configured: true, connected: false });
    await expect(client.fetchAnimeList()).rejects.toMatchObject({ code: 'not-authenticated' });
  });

  it('makes no request at all when nothing is configured', async () => {
    const rec = recorder(() => ({ status: 200, body: '{}' }));
    const client = makeClient(rec.transport, memoryStore(connectedTokens()), { clientId: '' });
    await expect(client.fetchAnimeList()).rejects.toThrow(MalSyncError);
    expect(rec.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reading the list
// ---------------------------------------------------------------------------

const listPage = (over: Record<string, unknown> = {}): string => JSON.stringify({
  data: [
    {
      node: {
        id: 21,
        title: 'One Piece',
        main_picture: { medium: 'https://cdn.myanimelist.net/m.jpg', large: 'https://cdn.myanimelist.net/l.jpg' },
        num_episodes: 0,
      },
      list_status: {
        status: 'watching',
        score: 9,
        // The READ spelling. Note the word order against the write below.
        num_episodes_watched: 1088,
        is_rewatching: false,
        updated_at: '2026-07-30T10:00:00+00:00',
      },
    },
  ],
  paging: {},
  ...over,
});

describe('reading the list', () => {
  it('reads progress from num_episodes_watched, MALs READ spelling', () => {
    const page = parseMalAnimeListPage(JSON.parse(listPage()));
    expect(page.entries[0]).toMatchObject({
      animeId: 21,
      title: 'One Piece',
      status: 'watching',
      episodesWatched: 1088,
      score: 9,
      rewatching: false,
    });
  });

  it('asks for the fields it parses', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder(() => ({ status: 200, body: listPage() }));
    const client = makeClient(rec.transport, store);

    await client.fetchAnimeList();

    const url = new URL(rec.apiCalls()[0].url);
    expect(url.origin + url.pathname).toBe('https://api.myanimelist.net/v2/users/@me/animelist');
    expect(url.searchParams.get('fields')).toContain('list_status');
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('follows MALs paging cursor', async () => {
    const next = 'https://api.myanimelist.net/v2/users/@me/animelist?offset=100';
    const store = memoryStore(connectedTokens());
    const rec = recorder((request) =>
      request.url === next
        ? { status: 200, body: listPage() }
        : { status: 200, body: listPage({ paging: { next } }) });
    const client = makeClient(rec.transport, store);

    const result = await client.fetchAnimeList();
    expect(result.pagesFetched).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  it('refuses to follow a paging cursor pointing off MALs API host', async () => {
    // The cursor is a server-chosen URL and the request carries a bearer token.
    // Following it anywhere but MAL hands the credential to that host.
    const store = memoryStore(connectedTokens());
    const rec = recorder(() => ({
      status: 200,
      body: listPage({ paging: { next: 'https://evil.invalid/v2/users/@me/animelist' } }),
    }));
    const client = makeClient(rec.transport, store);

    await client.fetchAnimeList();

    expect(rec.apiCalls()).toHaveLength(1);
    expect(rec.sent.some((r) => r.url.includes('evil.invalid'))).toBe(false);
  });

  it('names the host rule directly', () => {
    expect(isMalApiUrl('https://api.myanimelist.net/v2/users/@me/animelist')).toBe(true);
    expect(isMalApiUrl('https://evil.invalid/v2/users/@me/animelist')).toBe(false);
    expect(isMalApiUrl('http://api.myanimelist.net/v2/x')).toBe(false);
    // A subdomain-suffix trick that a naive endsWith() check would wave through.
    expect(isMalApiUrl('https://api.myanimelist.net.evil.invalid/v2/x')).toBe(false);
  });

  it('drops an unusable row rather than failing the whole sync', () => {
    const page = parseMalAnimeListPage({
      data: [{ node: { title: 'no id here' } }, JSON.parse(listPage()).data[0]],
      paging: {},
    });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].animeId).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// Writing — the asymmetric field name
// ---------------------------------------------------------------------------

describe('writing an entry', () => {
  it('serialises progress as num_watched_episodes, MALs WRITE spelling', () => {
    const body = new URLSearchParams(serialiseMalListStatusUpdate({
      status: 'watching',
      episodesWatched: 12,
      score: 8,
      rewatching: false,
    }));
    expect(body.get('status')).toBe('watching');
    expect(body.get('num_watched_episodes')).toBe('12');
    expect(body.get('score')).toBe('8');
    expect(body.get('is_rewatching')).toBe('false');
  });

  it('never sends the READ spelling on a write', () => {
    // MAL answers 200 and ignores an unknown field, so getting this backwards
    // shows the user "saved" while their progress does not move. There is no
    // error to notice; only this assertion catches it.
    const body = serialiseMalListStatusUpdate({ episodesWatched: 12 });
    expect(body).toContain('num_watched_episodes');
    expect(body).not.toContain('num_episodes_watched');
  });

  it('omits fields the caller did not set, so a write cannot clobber a score', () => {
    // MAL treats an absent field as "leave it alone"; emitting defaults would
    // silently overwrite values the user never touched.
    const body = new URLSearchParams(serialiseMalListStatusUpdate({ episodesWatched: 3 }));
    expect([...body.keys()]).toEqual(['num_watched_episodes']);
  });

  it('clamps the score into MALs 0-10 range instead of earning a 400', () => {
    expect(new URLSearchParams(serialiseMalListStatusUpdate({ score: 99 })).get('score')).toBe('10');
    expect(new URLSearchParams(serialiseMalListStatusUpdate({ score: -4 })).get('score')).toBe('0');
  });

  it('PATCHes the entrys my_list_status endpoint form-encoded', async () => {
    const store = memoryStore(connectedTokens());
    const rec = recorder(() => ({
      status: 200,
      body: JSON.stringify({ status: 'watching', score: 8, num_episodes_watched: 12, is_rewatching: false }),
    }));
    const client = makeClient(rec.transport, store);

    const saved = await client.updateListStatus(21, { status: 'watching', episodesWatched: 12 });

    const call = rec.apiCalls()[0];
    expect(call.method).toBe('PATCH');
    expect(call.url).toBe('https://api.myanimelist.net/v2/anime/21/my_list_status');
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(call.headers.Authorization).toBe(`Bearer ${FAKE_ACCESS}`);
    expect(new URLSearchParams(call.body).get('num_watched_episodes')).toBe('12');
    // Reads back through the READ spelling, closing the round trip.
    expect(saved.episodesWatched).toBe(12);
  });

  it('refuses an empty update rather than spending a round trip on it', async () => {
    const rec = recorder(() => ({ status: 200, body: '{}' }));
    const client = makeClient(rec.transport, memoryStore(connectedTokens()));
    await expect(client.updateListStatus(21, {})).rejects.toThrow(MalSyncError);
    expect(rec.sent).toHaveLength(0);
  });

  it('refuses a nonsense anime id', async () => {
    const rec = recorder(() => ({ status: 200, body: '{}' }));
    const client = makeClient(rec.transport, memoryStore(connectedTokens()));
    await expect(client.updateListStatus(Number.NaN, { status: 'completed' }))
      .rejects.toThrow(MalSyncError);
    expect(rec.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

describe('sign out', () => {
  it('drops the stored tokens', () => {
    const store = memoryStore(connectedTokens());
    const client = makeClient(recorder(() => ({ status: 200, body: '{}' })).transport, store);
    const status = client.signOut();
    expect(store.current).toBeNull();
    expect(status.connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The secret never leaves the main process
// ---------------------------------------------------------------------------

describe('token confinement', () => {
  it('keeps the token out of the status object the renderer receives', async () => {
    const store = memoryStore(connectedTokens({ username: 'fake-user' }));
    const client = makeClient(recorder(() => ({ status: 200, body: '{}' })).transport, store);

    const serialised = JSON.stringify(client.status());
    expect(serialised).not.toContain(FAKE_ACCESS);
    expect(serialised).not.toContain(FAKE_REFRESH);
  });

  it('reports when the store could not encrypt, so the UI can say so', () => {
    const plaintext: MalTokenStore = {
      ...memoryStore(connectedTokens()),
      encrypted: () => false,
    };
    const client = makeClient(recorder(() => ({ status: 200, body: '{}' })).transport, plaintext);
    // A plaintext OAuth token the user does not know about is worse than either
    // refusing to store it or storing it with the fact made visible.
    expect(client.status().tokensEncrypted).toBe(false);
  });
});
