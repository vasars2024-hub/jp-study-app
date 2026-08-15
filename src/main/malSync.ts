/**
 * Authenticated MyAnimeList sync — OAuth2, token storage, list read and write.
 *
 * Phase 8, item 1 (`SEANIME_MIGRATION_PLAN.md:633`). This is the first thing in
 * the app that holds a *user credential for a third party*, so two decisions
 * shape the whole file:
 *
 * 1. **Every side effect is injected.** HTTP goes through a `MalTransport`, the
 *    token store is an interface, the clock and the CSPRNG are parameters. The
 *    defaults are the real ones, so callers see none of this — but the entire
 *    flow, including refresh-and-retry, is exercisable with no network and no
 *    credentials. That was not a style preference: MAL, Jikan and AniList were
 *    all unreachable from the machine this was written on, so a design that
 *    could only be validated against the live API could not have been validated
 *    at all.
 * 2. **Tokens never leave the main process.** They are encrypted with
 *    `safeStorage` and the renderer is told only *whether* an account is
 *    connected — never the token. `localStorage` is plaintext on disk and the
 *    Phase 6.5 audit treats a renderer-side secret as a finding.
 *
 * Nothing here runs on its own. There is no background loop and no sync-on-
 * launch: every call originates in an explicit user action. Writing to a real
 * MAL list is destructive and irreversible from this side, and a feature that
 * mutates it unattended on first run is not one that can be shipped untested.
 */

import { app, ipcMain, net, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  MAL_API_BASE,
  MAL_TOKEN_URL,
  buildMalAuthorizeUrl,
  isEmptyMalListStatusUpdate,
  isMalListStatus,
  parseMalAnimeListPage,
  parseMalListStatusResponse,
  serialiseMalListStatusUpdate,
  DEFAULT_MAL_RELATION_MAX_DEPTH,
  DEFAULT_MAL_RELATION_MAX_REQUESTS,
  isMalRelationType,
  nextRelationFrontier,
  parseMalAnimeRelations,
  type MalAnimeRelations,
  type MalDerivative,
  type MalListEntry,
  type MalListStatus,
  type MalListStatusUpdate,
  type MalRelationWalkOptions,
} from '../shared/malSync';
import {
  clearSecret,
  hasSecret,
  openSecret,
  readSecret,
  vaultCanStore,
  writeSecretSet,
} from './credentials/vault';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * `reauth-required` and `transient` are separated on purpose. Both surface as a
 * failed sync, but only one of them should make the UI throw away a session and
 * ask the user to sign in again — doing that on a 502 would log people out
 * every time MAL has a bad afternoon.
 */
export type MalErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'reauth-required'
  | 'transient'
  | 'request-failed';

export class MalSyncError extends Error {
  constructor(readonly code: MalErrorCode, message: string) {
    super(message);
    this.name = 'MalSyncError';
  }
}

// ---------------------------------------------------------------------------
// Transport boundary
// ---------------------------------------------------------------------------

export interface MalHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface MalHttpResponse {
  status: number;
  body: string;
}

export type MalTransport = (request: MalHttpRequest) => Promise<MalHttpResponse>;

const USER_AGENT = 'jp-study-app (personal media library)';
const REQUEST_TIMEOUT_MS = 20_000;
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/**
 * The real transport: Electron's `net`, matching `mediaProviderClients.ts`.
 *
 * `net` rather than global `fetch` for the same reason as there — it uses
 * Chromium's stack, so it inherits the app's proxy config and the system
 * certificate store, which a user behind a corporate proxy needs and Node's
 * fetch does not do.
 */
export const netMalTransport: MalTransport = (request) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = net.request({ url: request.url, method: request.method });
    req.setHeader('User-Agent', USER_AGENT);
    req.setHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(request.headers)) req.setHeader(key, value);

    const timer = setTimeout(() => {
      finish(() => {
        try {
          req.abort();
        } catch {
          /* already finished */
        }
        reject(new MalSyncError('transient', 'MyAnimeList took too long to respond.'));
      });
    }, REQUEST_TIMEOUT_MS);

    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        // Bounded so a hostile or broken response cannot exhaust memory.
        if (chunks.reduce((n, c) => n + c.length, 0) < 8_000_000) chunks.push(chunk);
      });
      response.on('end', () => {
        finish(() => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        }));
      });
      response.on('error', (error: Error) => finish(() => reject(error)));
    });
    req.on('error', (error) => finish(() => reject(error)));

    if (request.body !== undefined) req.write(request.body, 'utf-8');
    req.end();
  });

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export interface MalTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. 0 when MAL did not say, which disables proactive refresh. */
  expiresAt: number;
  username?: string;
}

export interface MalTokenStore {
  read(): MalTokens | null;
  write(tokens: MalTokens): void;
  clear(): void;
  /**
   * Whether what is on disk is actually encrypted.
   *
   * This is surfaced all the way to the UI rather than kept as an internal
   * detail. When `safeStorage` is unavailable the honest options are to refuse
   * to store the token or to store it in the clear; refusing means the feature
   * simply does not work on those systems, so this stores it — but a plaintext
   * OAuth token the user does not know about is a worse outcome than either.
   * The flag is what lets the UI say so out loud.
   */
  encrypted(): boolean;
}

interface MalTokenMetadataFile {
  version: 2;
  expiresAt: number;
  username?: string;
}

interface LegacyMalTokenFile extends Partial<MalTokenMetadataFile> {
  encrypted?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * The real store: secrets in `<userData>/credentials.dat`, with only expiry and
 * username metadata left in `<userData>/mal-tokens.json`.
 *
 * Reads understand the former encrypted/plaintext JSON shape and migrate it in
 * one direction. New writes never fall back to plaintext when OS encryption is
 * unavailable.
 */
export function fileMalTokenStore(
  filePath: () => string = () => path.join(app.getPath('userData'), 'mal-tokens.json'),
): MalTokenStore {
  const readFile = (): LegacyMalTokenFile | null => {
    try {
      return JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as LegacyMalTokenFile;
    } catch {
      return null;
    }
  };

  const metadata = (file = readFile()): Pick<MalTokens, 'expiresAt' | 'username'> => ({
    expiresAt: typeof file?.expiresAt === 'number' ? file.expiresAt : 0,
    username: typeof file?.username === 'string' ? file.username : undefined,
  });

  const writeMetadata = (tokens: MalTokens): void => {
    const payload: MalTokenMetadataFile = {
      version: 2,
      expiresAt: tokens.expiresAt,
      username: tokens.username,
    };
    try {
      fs.mkdirSync(path.dirname(filePath()), { recursive: true });
      const temp = `${filePath()}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(payload), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(temp, filePath());
    } catch {
      /* missing metadata only disables proactive refresh and the username label */
    }
  };

  const readLegacyTokens = (file: LegacyMalTokenFile | null): MalTokens | null => {
    if (!file || typeof file.accessToken !== 'string' || !file.accessToken) return null;
    const accessToken = file.encrypted
      ? openSecret(file.accessToken)
      : file.accessToken;
    const refreshToken = typeof file.refreshToken === 'string'
      ? (file.encrypted ? openSecret(file.refreshToken) : file.refreshToken)
      : '';
    if (!accessToken) return null;
    return { accessToken, refreshToken, ...metadata(file) };
  };

  return {
    read(): MalTokens | null {
      const file = readFile();
      const accessToken = readSecret('mal', 'accessToken');
      if (accessToken) {
        return {
          accessToken,
          refreshToken: readSecret('mal', 'refreshToken'),
          ...metadata(file),
        };
      }

      const legacy = readLegacyTokens(file);
      if (!legacy) return null;
      const migrated = writeSecretSet('mal', {
        accessToken: legacy.accessToken,
        refreshToken: legacy.refreshToken,
      });
      if (migrated.ok) writeMetadata(legacy);
      return legacy;
    },

    write(tokens: MalTokens): void {
      const stored = writeSecretSet('mal', {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      if (!stored.ok) {
        throw new MalSyncError(
          'not-configured',
          'The MyAnimeList session could not be stored because secure OS encryption is unavailable.',
        );
      }
      writeMetadata(tokens);
    },

    clear(): void {
      clearSecret('mal');
      try {
        fs.rmSync(filePath(), { force: true });
      } catch {
        /* nothing to remove */
      }
    },

    encrypted(): boolean {
      const file = readFile();
      if (hasSecret('mal', 'accessToken')) return true;
      if (readLegacyTokens(file)) return file?.encrypted === true;
      return vaultCanStore();
    },
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * The client id is configuration, never a constant.
 *
 * No client id is committed to this repo and none is invented. A MAL client id
 * identifies *an application registered to a person's MAL account*; baking one
 * in would make every install share one identity and one rate-limit budget, and
 * would publish a credential-shaped value in a public GPL repo. So it is read
 * from the environment or from a file the user fills in, and "absent" is a
 * first-class state the UI reports rather than an error it hits at request time.
 */
export interface MalSyncConfig {
  clientId: string;
  /** Only needed if the MAL app was registered as a confidential client. */
  clientSecret: string;
  redirectUri?: string;
}

const CLIENT_ID_ENV = 'JP_STUDY_MAL_CLIENT_ID';
/**
 * Env-only, never persisted. A desktop app cannot keep a secret, and PKCE
 * exists precisely so it does not have to — but MAL issues a secret at
 * registration and some apps are registered as confidential, so the escape
 * hatch exists without adding another secret-at-rest surface to the profile.
 */
const CLIENT_SECRET_ENV = 'JP_STUDY_MAL_CLIENT_SECRET';

export function readMalSyncConfig(
  configPath: () => string = () => path.join(app.getPath('userData'), 'mal-sync.json'),
  env: NodeJS.ProcessEnv = process.env,
): MalSyncConfig {
  let file: Partial<MalSyncConfig> = {};
  try {
    file = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as Partial<MalSyncConfig>;
  } catch {
    file = {};
  }
  const fromEnv = (env[CLIENT_ID_ENV] ?? '').trim();
  return {
    clientId: fromEnv || (typeof file.clientId === 'string' ? file.clientId.trim() : ''),
    clientSecret: (env[CLIENT_SECRET_ENV] ?? '').trim(),
    redirectUri: typeof file.redirectUri === 'string' && file.redirectUri.trim()
      ? file.redirectUri.trim()
      : undefined,
  };
}

export function writeMalSyncClientId(
  clientId: string,
  configPath: () => string = () => path.join(app.getPath('userData'), 'mal-sync.json'),
  redirectUri?: string,
): void {
  const payload: Partial<MalSyncConfig> = { clientId: clientId.trim() };
  if (redirectUri && redirectUri.trim()) payload.redirectUri = redirectUri.trim();
  try {
    fs.writeFileSync(configPath(), JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    /* surfaced to the user as "still not configured" on the next status read */
  }
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export interface MalPkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'plain';
}

/**
 * Generates the PKCE pair.
 *
 * **The challenge IS the verifier, and that is correct for MAL.** MAL supports
 * only `code_challenge_method=plain`, so there is no SHA-256 step: MAL stores
 * the challenge and later compares the verifier to it directly. Anyone who
 * knows RFC 7636 will read this as a bug and be tempted to hash it — that
 * change breaks the token exchange with an opaque `invalid_request`, because
 * MAL never hashes its side of the comparison.
 *
 * 64 random bytes base64url-encode to 86 characters, inside RFC 7636's required
 * 43–128 range.
 */
export function createMalPkcePair(
  randomBytes: (size: number) => Buffer = crypto.randomBytes,
): MalPkcePair {
  const verifier = randomBytes(64).toString('base64url');
  return { codeVerifier: verifier, codeChallenge: verifier, codeChallengeMethod: 'plain' };
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface MalSyncDeps {
  transport?: MalTransport;
  store?: MalTokenStore;
  config?: () => MalSyncConfig;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

/** Refresh this far ahead of expiry rather than waiting for the 401. */
const EXPIRY_SKEW_MS = 60_000;
/** MAL's own cap is 1000; 100 is its default page and a polite request size. */
const PAGE_SIZE = 100;
/** A hard stop on paging. `paging.next` is MAL's string, not ours to trust. */
const MAX_PAGES = 20;

export interface MalAuthStatus {
  configured: boolean;
  connected: boolean;
  username?: string;
  /** False means the token on disk is plaintext — the UI must say so. */
  tokensEncrypted: boolean;
  expiresAt?: number;
}

export interface MalPendingAuth {
  authorizeUrl: string;
  state: string;
}

export interface MalListSyncResult {
  entries: MalListEntry[];
  /** True when MAL still had pages left at the page cap. */
  truncated: boolean;
  pagesFetched: number;
}

export interface MalDerivativeWalkResult {
  derivatives: MalDerivative[];
  /** How many `/anime/{id}` reads it actually cost. */
  requests: number;
  /** True when the request budget ran out with frontier still queued. */
  truncated: boolean;
}

export class MalSyncClient {
  private readonly transport: MalTransport;
  private readonly store: MalTokenStore;
  private readonly config: () => MalSyncConfig;
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;

  /**
   * The in-flight PKCE verifier and CSRF state. Memory only — this is valid for
   * the seconds between opening the browser and the callback, and writing it to
   * disk would persist a credential-equivalent past the flow that needs it.
   */
  private pending: { state: string; codeVerifier: string; startedAt: number } | null = null;

  constructor(deps: MalSyncDeps = {}) {
    this.transport = deps.transport ?? netMalTransport;
    this.store = deps.store ?? fileMalTokenStore();
    this.config = deps.config ?? (() => readMalSyncConfig());
    this.now = deps.now ?? Date.now;
    this.randomBytes = deps.randomBytes ?? crypto.randomBytes;
  }

  // -- status ---------------------------------------------------------------

  status(): MalAuthStatus {
    const config = this.config();
    const tokens = this.store.read();
    return {
      configured: config.clientId.length > 0,
      connected: Boolean(tokens?.accessToken),
      username: tokens?.username,
      tokensEncrypted: this.store.encrypted(),
      expiresAt: tokens?.expiresAt || undefined,
    };
  }

  private requireClientId(): string {
    const { clientId } = this.config();
    if (!clientId) {
      throw new MalSyncError(
        'not-configured',
        'No MyAnimeList client id is configured, so the app cannot identify itself to MAL.',
      );
    }
    return clientId;
  }

  // -- OAuth ----------------------------------------------------------------

  /** Step 1: build the URL the user opens in their browser. */
  beginAuth(): MalPendingAuth {
    const clientId = this.requireClientId();
    const { redirectUri } = this.config();
    const pkce = createMalPkcePair(this.randomBytes);
    const state = this.randomBytes(24).toString('base64url');
    this.pending = { state, codeVerifier: pkce.codeVerifier, startedAt: this.now() };
    return {
      authorizeUrl: buildMalAuthorizeUrl({
        clientId,
        codeChallenge: pkce.codeChallenge,
        state,
        redirectUri,
      }),
      state,
    };
  }

  /**
   * Step 2: exchange the code for tokens.
   *
   * The `state` check is not ceremony. Without it, anything that can reach the
   * callback can hand this method a code from an attacker's MAL account and the
   * user ends up silently syncing to someone else's list.
   */
  async completeAuth(code: string, state: string): Promise<MalAuthStatus> {
    const clientId = this.requireClientId();
    const pending = this.pending;
    if (!pending) {
      throw new MalSyncError('request-failed', 'There is no sign-in in progress to complete.');
    }
    if (!state || state !== pending.state) {
      this.pending = null;
      throw new MalSyncError('request-failed', 'The sign-in response did not match the request.');
    }
    this.pending = null;

    const { clientSecret, redirectUri } = this.config();
    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: pending.codeVerifier,
      grant_type: 'authorization_code',
    });
    if (clientSecret) body.set('client_secret', clientSecret);
    if (redirectUri) body.set('redirect_uri', redirectUri);

    const tokens = await this.postToken(body, 'sign in');
    this.store.write(tokens);
    // Best-effort: a name makes the connected state legible, but failing to
    // read it must not undo a sign-in that already succeeded.
    const username = await this.fetchUsername().catch(() => undefined);
    if (username) this.store.write({ ...tokens, username });
    return this.status();
  }

  signOut(): MalAuthStatus {
    this.pending = null;
    this.store.clear();
    return this.status();
  }

  /** POSTs the token endpoint and normalises both flavours of failure. */
  private async postToken(body: URLSearchParams, what: string): Promise<MalTokens> {
    const response = await this.transport({
      url: MAL_TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': FORM_CONTENT_TYPE },
      body: body.toString(),
    });

    if (response.status >= 500 || response.status === 0) {
      throw new MalSyncError('transient', `MyAnimeList could not be reached to ${what}.`);
    }
    if (response.status !== 200) {
      throw new MalSyncError('reauth-required', `MyAnimeList rejected the request to ${what}.`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.body) as Record<string, unknown>;
    } catch {
      throw new MalSyncError('request-failed', 'MyAnimeList returned a response we could not read.');
    }
    const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
    if (!accessToken) {
      throw new MalSyncError('reauth-required', 'MyAnimeList did not return an access token.');
    }
    const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 0;
    return {
      accessToken,
      refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : '',
      expiresAt: expiresIn > 0 ? this.now() + expiresIn * 1000 : 0,
    };
  }

  /**
   * Refreshes, exactly once per caller.
   *
   * A 5xx leaves the stored tokens alone — the refresh token is probably fine
   * and MAL is not. A 4xx clears them, because MAL has told us this refresh
   * token is dead and keeping it only produces the same failure on every
   * subsequent call while the UI keeps claiming the account is connected.
   */
  private async refreshTokens(current: MalTokens): Promise<MalTokens> {
    const clientId = this.requireClientId();
    if (!current.refreshToken) {
      this.store.clear();
      throw new MalSyncError(
        'reauth-required',
        'The MyAnimeList session has expired and there is no refresh token to renew it.',
      );
    }
    const { clientSecret } = this.config();
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    let refreshed: MalTokens;
    try {
      refreshed = await this.postToken(body, 'renew the session');
    } catch (error) {
      if (error instanceof MalSyncError && error.code === 'reauth-required') {
        this.store.clear();
        throw new MalSyncError(
          'reauth-required',
          'The MyAnimeList session could not be renewed. Sign in again to reconnect.',
        );
      }
      throw error;
    }
    // MAL may or may not rotate the refresh token; keep the old one if not.
    const next: MalTokens = {
      ...refreshed,
      refreshToken: refreshed.refreshToken || current.refreshToken,
      username: current.username,
    };
    this.store.write(next);
    return next;
  }

  // -- authenticated requests ----------------------------------------------

  /**
   * One authenticated call, with at most **one** refresh and **one** retry.
   *
   * The bound is the point. The obvious shape here is a loop — refresh on 401,
   * try again — and the obvious shape hammers MAL forever the moment a token is
   * rejected for a reason refreshing cannot fix (a revoked app, a deleted
   * account). So a refresh happens at most once per call, whether it was
   * triggered proactively by expiry or reactively by a 401, and a 401 that
   * survives the retry is reported as `reauth-required` instead of starting
   * over.
   */
  private async authedRequest(request: Omit<MalHttpRequest, 'headers'> & {
    headers?: Record<string, string>;
  }): Promise<MalHttpResponse> {
    this.requireClientId();
    let tokens = this.store.read();
    if (!tokens?.accessToken) {
      throw new MalSyncError('not-authenticated', 'No MyAnimeList account is connected.');
    }

    let refreshed = false;
    if (tokens.expiresAt > 0 && tokens.expiresAt - EXPIRY_SKEW_MS <= this.now()) {
      tokens = await this.refreshTokens(tokens);
      refreshed = true;
    }

    const send = (accessToken: string): Promise<MalHttpResponse> => this.transport({
      ...request,
      headers: { ...request.headers, Authorization: `Bearer ${accessToken}` },
    });

    let response = await send(tokens.accessToken);
    if (response.status !== 401) return this.assertOk(response);

    if (refreshed) {
      // We already presented a token minted seconds ago and MAL still said no.
      // Refreshing again would be the loop this method exists to prevent.
      throw new MalSyncError(
        'reauth-required',
        'MyAnimeList rejected a freshly renewed session. Sign in again to reconnect.',
      );
    }

    tokens = await this.refreshTokens(tokens);
    response = await send(tokens.accessToken);
    if (response.status === 401) {
      throw new MalSyncError(
        'reauth-required',
        'MyAnimeList rejected the renewed session. Sign in again to reconnect.',
      );
    }
    return this.assertOk(response);
  }

  private assertOk(response: MalHttpResponse): MalHttpResponse {
    if (response.status >= 200 && response.status < 300) return response;
    if (response.status >= 500 || response.status === 0) {
      throw new MalSyncError('transient', 'MyAnimeList is not responding. Try again shortly.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new MalSyncError(
        'reauth-required',
        'MyAnimeList refused the request. Sign in again to reconnect.',
      );
    }
    throw new MalSyncError('request-failed', `MyAnimeList returned an error (${response.status}).`);
  }

  private parseJson(response: MalHttpResponse): unknown {
    try {
      return JSON.parse(response.body);
    } catch {
      throw new MalSyncError('request-failed', 'MyAnimeList returned a response we could not read.');
    }
  }

  private async fetchUsername(): Promise<string | undefined> {
    const response = await this.authedRequest({
      url: `${MAL_API_BASE}/users/@me?fields=name`,
      method: 'GET',
    });
    const parsed = this.parseJson(response) as Record<string, unknown>;
    return typeof parsed.name === 'string' && parsed.name ? parsed.name : undefined;
  }

  // -- list read ------------------------------------------------------------

  /**
   * Reads the authenticated user's anime list, following MAL's paging.
   *
   * `paging.next` is a URL chosen by the server, and following a server-chosen
   * URL with a bearer token attached is how a token gets handed to a host that
   * should never see it. So the host is checked before every hop — a redirect
   * of the paging cursor to anywhere but MAL's API ends the walk rather than
   * leaking the credential.
   */
  async fetchAnimeList(options: { status?: MalListStatus } = {}): Promise<MalListSyncResult> {
    const query = new URLSearchParams({
      fields: 'list_status,num_episodes',
      limit: String(PAGE_SIZE),
      nsfw: 'true',
    });
    if (options.status) query.set('status', options.status);

    let url: string | null = `${MAL_API_BASE}/users/@me/animelist?${query.toString()}`;
    const entries: MalListEntry[] = [];
    const seen = new Set<string>();
    let pagesFetched = 0;

    while (url && pagesFetched < MAX_PAGES) {
      if (seen.has(url)) break; // a self-referential cursor is not worth a loop
      seen.add(url);
      const response = await this.authedRequest({ url, method: 'GET' });
      const page = parseMalAnimeListPage(this.parseJson(response));
      entries.push(...page.entries);
      pagesFetched += 1;
      url = page.nextPageUrl && isMalApiUrl(page.nextPageUrl) ? page.nextPageUrl : null;
    }

    return { entries, truncated: url !== null, pagesFetched };
  }

  // -- derivatives ----------------------------------------------------------

  /**
   * Reads one title's `related_anime`.
   *
   * A separate request per title, because MAL does not return `related_anime`
   * on the list endpoint at all — asking for it in the list `fields` gets it
   * silently dropped, not an error. That is the whole reason the walk below is
   * budgeted: a 400-title list would otherwise be 400 requests.
   */
  async fetchAnimeRelations(animeId: number): Promise<MalAnimeRelations> {
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new MalSyncError('request-failed', 'That is not a MyAnimeList entry id.');
    }
    const query = new URLSearchParams({ fields: 'id,title,main_picture,related_anime' });
    const response = await this.authedRequest({
      url: `${MAL_API_BASE}/anime/${Math.trunc(animeId)}?${query.toString()}`,
      method: 'GET',
    });
    return parseMalAnimeRelations(this.parseJson(response));
  }

  /**
   * Walks outward from titles the user has finished to the rest of their
   * franchises, breadth-first.
   *
   * Seeds start in `visited`, so a show already on the user's list is never
   * reported as its own derivative and the guaranteed sequel/prequel two-cycle
   * terminates on the first hop back. The request budget is a hard stop rather
   * than a rate limit: MAL's quota is the user's, and a walk that silently
   * spends 400 requests on their behalf is worse than one that says it stopped.
   */
  async fetchDerivatives(
    seedIds: readonly number[],
    options: MalRelationWalkOptions = {},
  ): Promise<MalDerivativeWalkResult> {
    const maxDepth = Math.max(1, Math.trunc(options.maxDepth ?? DEFAULT_MAL_RELATION_MAX_DEPTH));
    const maxRequests = Math.max(
      1,
      Math.trunc(options.maxRequests ?? DEFAULT_MAL_RELATION_MAX_REQUESTS),
    );

    const visited = new Set<number>();
    const seeds: { animeId: number; depth: number }[] = [];
    for (const raw of seedIds) {
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const animeId = Math.trunc(raw);
      if (visited.has(animeId)) continue;
      visited.add(animeId);
      seeds.push({ animeId, depth: 0 });
    }

    const derivatives: MalDerivative[] = [];
    let frontier = seeds;
    let requests = 0;
    let truncated = false;

    while (frontier.length > 0 && !truncated) {
      const next: { animeId: number; depth: number }[] = [];
      for (const item of frontier) {
        if (requests >= maxRequests) {
          truncated = true;
          break;
        }
        requests += 1;
        const node = await this.fetchAnimeRelations(item.animeId);
        const depth = item.depth + 1;
        for (const edge of nextRelationFrontier(node, visited, options)) {
          visited.add(edge.animeId);
          derivatives.push({ ...edge, fromAnimeId: item.animeId, depth });
          if (depth < maxDepth) next.push({ animeId: edge.animeId, depth });
        }
      }
      frontier = next;
    }

    return { derivatives, requests, truncated };
  }

  // -- list write -----------------------------------------------------------

  /**
   * Updates one entry. An explicit, single-target function on purpose.
   *
   * This is the only thing in the app that mutates data on a server the user
   * cares about and cannot easily undo, so it takes one id, sends one PATCH,
   * and returns what MAL says the entry now is. There is no bulk variant and no
   * caller that runs it unattended.
   */
  async updateListStatus(
    animeId: number,
    update: MalListStatusUpdate,
  ): Promise<MalListStatusUpdate> {
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new MalSyncError('request-failed', 'That is not a MyAnimeList entry id.');
    }
    if (isEmptyMalListStatusUpdate(update)) {
      throw new MalSyncError('request-failed', 'There is nothing to change in that update.');
    }
    const response = await this.authedRequest({
      url: `${MAL_API_BASE}/anime/${Math.trunc(animeId)}/my_list_status`,
      method: 'PATCH',
      headers: { 'Content-Type': FORM_CONTENT_TYPE },
      body: serialiseMalListStatusUpdate(update),
    });
    return parseMalListStatusResponse(this.parseJson(response));
  }
}

/** Guards the paging cursor. Exported so the test can name the rule. */
export function isMalApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'api.myanimelist.net';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

let singleton: MalSyncClient | null = null;

function client(): MalSyncClient {
  if (!singleton) singleton = new MalSyncClient();
  return singleton;
}

/**
 * Wire errors into a shape the renderer can branch on.
 *
 * The renderer never receives a token, and it never receives a raw exception
 * either — an unhandled `MalSyncError` crossing the bridge would arrive as a
 * generic "Error invoking remote method", which is exactly the shape that made
 * "your session expired" indistinguishable from "MAL is down".
 */
export interface MalIpcResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: MalErrorCode;
  message?: string;
}

async function guard<T>(run: () => Promise<T> | T): Promise<MalIpcResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof MalSyncError) {
      return { ok: false, errorCode: error.code, message: error.message };
    }
    return {
      ok: false,
      errorCode: 'request-failed',
      message: error instanceof Error ? error.message : 'The MyAnimeList request failed.',
    };
  }
}

export function registerMalSyncIpc(): void {
  ipcMain.handle('mal:status', async () => guard(() => client().status()));

  ipcMain.handle('mal:setClientId', async (_event, clientId: unknown, redirectUri: unknown) =>
    guard(() => {
      writeMalSyncClientId(
        typeof clientId === 'string' ? clientId : '',
        undefined,
        typeof redirectUri === 'string' ? redirectUri : undefined,
      );
      return client().status();
    }));

  // Opens the system browser rather than an in-app window: the user should type
  // their MAL password into their own browser, where they can see the address
  // bar, not into a BrowserWindow this app controls.
  ipcMain.handle('mal:beginAuth', async () =>
    guard(async () => {
      const pending = client().beginAuth();
      await shell.openExternal(pending.authorizeUrl);
      return pending;
    }));

  ipcMain.handle('mal:completeAuth', async (_event, code: unknown, state: unknown) =>
    guard(() => client().completeAuth(
      typeof code === 'string' ? code : '',
      typeof state === 'string' ? state : '',
    )));

  ipcMain.handle('mal:signOut', async () => guard(() => client().signOut()));

  ipcMain.handle('mal:fetchList', async (_event, status: unknown) =>
    guard(() => client().fetchAnimeList(
      isMalListStatus(status) ? { status } : {},
    )));

  // Read-only, like `mal:fetchList` — it never touches the user's list. The
  // budget arrives from the renderer but is clamped in `fetchDerivatives`, so a
  // caller cannot ask for an unbounded walk of someone else's API quota.
  ipcMain.handle('mal:fetchDerivatives', async (_event, seedIds: unknown, options: unknown) =>
    guard(() => {
      const ids = Array.isArray(seedIds)
        ? seedIds.filter((value): value is number => typeof value === 'number')
        : [];
      const raw = (options ?? {}) as Record<string, unknown>;
      const clean: MalRelationWalkOptions = {};
      if (typeof raw.maxDepth === 'number') clean.maxDepth = raw.maxDepth;
      if (typeof raw.maxRequests === 'number') clean.maxRequests = raw.maxRequests;
      if (Array.isArray(raw.relations)) {
        const relations = raw.relations.filter(isMalRelationType);
        if (relations.length > 0) clean.relations = relations;
      }
      return client().fetchDerivatives(ids, clean);
    }));

  ipcMain.handle('mal:updateEntry', async (_event, animeId: unknown, update: unknown) =>
    guard(() => {
      const raw = (update ?? {}) as Record<string, unknown>;
      const clean: MalListStatusUpdate = {};
      if (isMalListStatus(raw.status)) clean.status = raw.status;
      if (typeof raw.episodesWatched === 'number') clean.episodesWatched = raw.episodesWatched;
      if (typeof raw.score === 'number') clean.score = raw.score;
      if (typeof raw.rewatching === 'boolean') clean.rewatching = raw.rewatching;
      return client().updateListStatus(typeof animeId === 'number' ? animeId : Number.NaN, clean);
    }));
}

/** Test seam: lets a suite install a client built on fakes. */
export function __setMalSyncClientForTests(instance: MalSyncClient | null): void {
  singleton = instance;
}
