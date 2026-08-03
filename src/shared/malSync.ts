/**
 * MyAnimeList sync — the pure half.
 *
 * Everything here is a total function over its arguments: no I/O, no clock, no
 * network, no Electron. That is the standing contract for `src/shared`, and it
 * is what makes the wire format testable without credentials or connectivity —
 * which matters more than usual here, because the two APIs this file encodes
 * (Jikan's upstream and MAL's own) were both unreachable from this machine when
 * it was written. The transport lives in `main/malSync.ts`.
 *
 * Deliberately NOT here: PKCE generation (needs a CSPRNG), token storage (needs
 * safeStorage), and the request/refresh/retry policy (needs a clock).
 */

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** OAuth lives on the website; the data API is a different host entirely. */
export const MAL_AUTHORIZE_URL = 'https://myanimelist.net/v1/oauth2/authorize';
export const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
export const MAL_API_BASE = 'https://api.myanimelist.net/v2';

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

/** The five values MAL accepts for a list entry's status. */
export const MAL_LIST_STATUSES = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
] as const;

export type MalListStatus = (typeof MAL_LIST_STATUSES)[number];

export function isMalListStatus(value: unknown): value is MalListStatus {
  return typeof value === 'string' && (MAL_LIST_STATUSES as readonly string[]).includes(value);
}

/**
 * One row of the user's list, normalized.
 *
 * `episodesWatched` is deliberately spelled like neither wire field. MAL reads
 * `num_episodes_watched` and writes `num_watched_episodes` (see
 * `serialiseMalListStatusUpdate`), so any domain name that resembles one of them
 * invites the other to be typed by habit at the far end. A third name makes the
 * translation explicit at both seams instead of plausible-looking at both.
 */
export interface MalListEntry {
  animeId: number;
  title: string;
  posterUrl?: string;
  /** What MAL says the series has, which is 0 for a still-airing show. */
  totalEpisodes?: number;
  status?: MalListStatus;
  episodesWatched: number;
  /** MAL's 0–10; 0 means "not rated", not "rated zero". */
  score: number;
  rewatching: boolean;
  updatedAt?: string;
}

/** A partial edit. Absent fields are left alone by MAL, so they are omitted. */
export interface MalListStatusUpdate {
  status?: MalListStatus;
  episodesWatched?: number;
  score?: number;
  rewatching?: boolean;
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export interface MalAuthorizeUrlParams {
  clientId: string;
  codeChallenge: string;
  state: string;
  /** Omitted when the app registered exactly one URI, which MAL then infers. */
  redirectUri?: string;
}

/**
 * Builds the URL to open in the user's browser to start the OAuth flow.
 *
 * `code_challenge_method` is `plain`, and that is not an oversight or a
 * placeholder for a missing SHA-256. **MAL implements only the plain method**,
 * so the challenge sent here is byte-identical to the verifier sent later to the
 * token endpoint. A reviewer who knows RFC 7636 will be tempted to "fix" this
 * into S256; doing so breaks the exchange, because MAL compares the verifier it
 * receives against the challenge it stored, with no hashing step on its side.
 */
export function buildMalAuthorizeUrl(params: MalAuthorizeUrlParams): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'plain',
    state: params.state,
  });
  if (params.redirectUri) query.set('redirect_uri', params.redirectUri);
  return `${MAL_AUTHORIZE_URL}?${query.toString()}`;
}

// ---------------------------------------------------------------------------
// Write serialisation
// ---------------------------------------------------------------------------

/**
 * Serialises a list edit into the form body MAL's PATCH endpoint expects.
 *
 * **The episode field is `num_watched_episodes` on write and
 * `num_episodes_watched` on read.** Same four words, different order. Sending
 * the read spelling here is not an error MAL reports — it answers 200 and
 * quietly ignores the field, so the user sees "saved" and their progress does
 * not move. That failure is invisible without a test naming both spellings, so
 * there is one.
 *
 * Only the fields the caller set are emitted: MAL treats an absent field as
 * "leave it alone", so emitting defaults would silently overwrite a score or a
 * status the user never touched.
 */
export function serialiseMalListStatusUpdate(update: MalListStatusUpdate): string {
  const body = new URLSearchParams();
  if (update.status !== undefined) body.set('status', update.status);
  if (update.episodesWatched !== undefined) {
    body.set('num_watched_episodes', String(Math.max(0, Math.trunc(update.episodesWatched))));
  }
  if (update.score !== undefined) {
    // MAL rejects anything outside 0-10 with a 400 rather than clamping.
    body.set('score', String(Math.min(10, Math.max(0, Math.trunc(update.score)))));
  }
  if (update.rewatching !== undefined) body.set('is_rewatching', update.rewatching ? 'true' : 'false');
  return body.toString();
}

/** True when an update would send nothing — worth refusing before a round-trip. */
export function isEmptyMalListStatusUpdate(update: MalListStatusUpdate): boolean {
  return serialiseMalListStatusUpdate(update).length === 0;
}

// ---------------------------------------------------------------------------
// Read parsing
// ---------------------------------------------------------------------------

export interface MalListPage {
  entries: MalListEntry[];
  /** MAL's own absolute URL for the next page, or null at the end. */
  nextPageUrl: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Projects one page of `/users/@me/animelist` onto the domain model.
 *
 * Tolerant by construction: a row without a usable numeric id is dropped rather
 * than thrown over, because one malformed entry in a 400-title list should cost
 * the user that row, not the sync.
 */
export function parseMalAnimeListPage(payload: unknown): MalListPage {
  const root = asRecord(payload);
  const data = Array.isArray(root.data) ? root.data : [];
  const entries: MalListEntry[] = [];

  for (const row of data) {
    const node = asRecord(asRecord(row).node);
    const animeId = asFiniteNumber(node.id, Number.NaN);
    if (!Number.isFinite(animeId)) continue;

    const listStatus = asRecord(asRecord(row).list_status);
    const picture = asRecord(node.main_picture);
    const status = listStatus.status;
    const posterUrl = typeof picture.large === 'string' && picture.large
      ? picture.large
      : typeof picture.medium === 'string' ? picture.medium : undefined;

    entries.push({
      animeId: Math.trunc(animeId),
      title: typeof node.title === 'string' ? node.title : '',
      posterUrl,
      totalEpisodes: typeof node.num_episodes === 'number' ? node.num_episodes : undefined,
      status: isMalListStatus(status) ? status : undefined,
      // The READ spelling. See serialiseMalListStatusUpdate for the WRITE one.
      episodesWatched: asFiniteNumber(listStatus.num_episodes_watched, 0),
      score: asFiniteNumber(listStatus.score, 0),
      rewatching: listStatus.is_rewatching === true,
      updatedAt: typeof listStatus.updated_at === 'string' ? listStatus.updated_at : undefined,
    });
  }

  const next = asRecord(root.paging).next;
  return { entries, nextPageUrl: typeof next === 'string' && next ? next : null };
}

/** Parses the PATCH response, which returns the saved status alone (no node). */
export function parseMalListStatusResponse(payload: unknown): MalListStatusUpdate {
  const listStatus = asRecord(payload);
  const status = listStatus.status;
  return {
    status: isMalListStatus(status) ? status : undefined,
    episodesWatched: asFiniteNumber(listStatus.num_episodes_watched, 0),
    score: asFiniteNumber(listStatus.score, 0),
    rewatching: listStatus.is_rewatching === true,
  };
}
