/**
 * Jimaku and OpenSubtitles clients, plus the credential store they need.
 *
 * Both need an API key. Keys are held here, in the main process, encrypted with
 * Electron's `safeStorage` (OS keychain / DPAPI) — never in the renderer's
 * `localStorage`, which is plain text on disk and readable by anything that can
 * read the profile. The renderer is only ever told *whether* a key is present.
 *
 * The division of labour between the two providers matters:
 *   Jimaku is Japanese-only and keys off an AniList id, so its hits are exact by
 *     construction. It is the right first stop for this app's purpose.
 *   OpenSubtitles is broad and multi-language, and matches on the OSDb file hash
 *     when it can, which is the only way to be certain a subtitle is timed to the
 *     user's exact release.
 */

import { net } from 'electron';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SubtitleRecordFormat } from '../shared/subtitleRecord';
import { chooseJimakuEntry } from '../shared/subtitleHarvest';
import { decodeSubtitleBytes } from '../shared/subtitleDecode';
import { parseRetryAfterMs } from '../shared/resilience';
import { parseReleaseEpisode } from '../shared/releaseEpisodeNumber';
import type { SubtitleProviderExecutionId } from '../shared/subtitleDiscoveryIpc';
import {
  readSubtitleProviderSecret,
  writeSubtitleProviderSecret,
} from './credentials/subtitles';
import { recordTestResult } from './credentials/vault';
import { extractSubtitlesFromArchive, isExtractableArchive } from './subtitleArchive';

const USER_AGENT = 'jp-study-app v1';
const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export function setSubtitleProviderKey(id: 'jimaku' | 'opensubtitles', key: string): void {
  writeSubtitleProviderSecret(id, key);
}

export function hasSubtitleProviderKey(id: 'jimaku' | 'opensubtitles'): boolean {
  return Boolean(readSubtitleProviderSecret(id));
}

function keyFor(id: 'jimaku' | 'opensubtitles'): string | null {
  return readSubtitleProviderSecret(id) || null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface HttpResponse {
  status: number;
  body: Buffer;
  /** The `Retry-After` header, when the reply carried one. */
  retryAfter?: string;
}

/**
 * Largest reply body accepted. A subtitle over it is refused as an error: the
 * old cap kept the first 16 MB and returned it as a success, so the tail of an
 * oversized file was dropped without a word and the cut file was stored.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** The message a body over `MAX_BODY_BYTES` fails with. */
const BODY_TOO_LARGE = 'The subtitle provider sent more than 16 MB, which is not a subtitle file; it was not accepted.';

/**
 * Electron's `net` rather than global fetch, so requests inherit the app's proxy
 * settings and the system certificate store.
 */
function request(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = net.request({ url, method: options.method ?? 'GET' });
    req.setHeader('User-Agent', USER_AGENT);
    for (const [key, value] of Object.entries(options.headers ?? {})) req.setHeader(key, value);

    const timer = setTimeout(() => finish(() => {
      try {
        req.abort();
      } catch {
        /* already finished */
      }
      reject(new Error('The subtitle provider took too long to respond.'));
    }), TIMEOUT_MS);

    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        received += chunk.length;
        // Over the cap is a failure, never a silently shortened success.
        if (received > MAX_BODY_BYTES) {
          finish(() => {
            try {
              req.abort();
            } catch {
              /* already finished */
            }
            reject(new Error(BODY_TOO_LARGE));
          });
          return;
        }
        chunks.push(chunk);
      });
      const retryAfterHeader = (response.headers as Record<string, string | string[] | undefined> | undefined)?.['retry-after'];
      response.on('end', () => finish(() => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks),
        ...(retryAfterHeader !== undefined
          ? { retryAfter: Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader }
          : {}),
      })));
      response.on('error', (error: Error) => finish(() => reject(error)));
    });
    req.on('error', (error) => finish(() => reject(error)));
    if (options.body !== undefined) req.write(options.body, 'utf-8');
    req.end();
  });
}

/** Minimum gap between two requests to the same provider host. */
const PROVIDER_SPACING_MS = 300;
/** A 429 asking for a longer wait than this is answered as-is, not waited out. */
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
/** How many times one request is retried after a 429. */
const RATE_LIMIT_RETRIES = 2;
/** When each provider host may next be asked. */
const nextRequestAtByHost = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for the host's next slot and reserves the one after it. */
async function paceProviderHost(url: string): Promise<void> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return;
  }
  const now = Date.now();
  const slot = Math.max(now, nextRequestAtByHost.get(host) ?? 0);
  nextRequestAtByHost.set(host, slot + PROVIDER_SPACING_MS);
  if (slot > now) await sleep(slot - now);
}

/**
 * `request`, spaced and retried on a rate limit.
 *
 * Jimaku and OpenSubtitles both answer a burst with 429, and a sweep over a
 * season is exactly a burst: back-to-back searches came back empty and filled
 * again when spaced out (see `JsonReply`). Requests to one host are spaced, and
 * a 429 is retried after the wait its `Retry-After` names (a short backoff when
 * it names none). A wait longer than `MAX_RATE_LIMIT_WAIT_MS` — a daily quota,
 * not a burst — is not waited out: the 429 goes back to the caller.
 */
async function requestPaced(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResponse> {
  for (let attempt = 0; ; attempt += 1) {
    await paceProviderHost(url);
    const response = await request(url, options);
    if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return response;
    // A spent daily allowance answers 429 too; asking again cannot change that.
    if (/allowed \d+ subtitles|download limit|quota/i.test(response.body.subarray(0, 2048).toString('utf-8'))) {
      return response;
    }
    const wait = parseRetryAfterMs(response.retryAfter) ?? 500 * 2 ** attempt;
    if (wait > MAX_RATE_LIMIT_WAIT_MS) return response;
    await sleep(wait);
  }
}

/**
 * A JSON reply that still knows how it failed.
 *
 * `requestJson` collapses a 429, a 500, a timeout and a genuine empty result
 * into one `null`, and a caller that reads `null` as "the catalogue has
 * nothing" then states an outage as a fact about the show. Measured
 * 2026-08-17: eight titles reported "Jimaku has no Japanese subtitles filed for
 * this title" back-to-back and returned 125/57/168/36/95/48/60/47 files when
 * the same requests were spaced 6 s apart.
 */
interface JsonReply<T> {
  value: T | null;
  /** 0 when the request never got an answer at all. */
  status: number;
  /** Set when the request threw rather than answering. */
  error: string | null;
}

async function requestJsonReply<T>(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<JsonReply<T>> {
  let response;
  try {
    response = await requestPaced(url, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
    });
  } catch (error) {
    return { value: null, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
  if (response.status < 200 || response.status >= 300) {
    return { value: null, status: response.status, error: null };
  }
  try {
    return { value: JSON.parse(response.body.toString('utf-8')) as T, status: response.status, error: null };
  } catch (error) {
    // A 200 carrying something that is not JSON is the provider misbehaving,
    // not an empty catalogue, so it keeps its status rather than reading as one.
    return { value: null, status: response.status, error: error instanceof Error ? error.message : String(error) };
  }
}

async function requestJson<T>(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<T | null> {
  return (await requestJsonReply<T>(url, options)).value;
}

// ---------------------------------------------------------------------------
// The shape discovery works with
// ---------------------------------------------------------------------------

/** One downloadable subtitle offered by a provider. */
export interface ProviderSubtitleCandidate {
  providerId: SubtitleProviderExecutionId;
  /** Stable provider-side id, so the same release is not fetched twice. */
  providerItemId: string;
  language: string;
  format: SubtitleRecordFormat;
  /** Release/file name, fed to the shared matcher's title signal. */
  releaseName: string;
  season: number | null;
  episode: number | null;
  releaseGroup: string | null;
  hearingImpaired: boolean;
  /** True when the provider matched on the file hash — a guarantee of sync. */
  hashMatch: boolean;
  /** Rough popularity, used only to break ties. */
  downloads: number | null;
  /** Opaque token the client needs to fetch the bytes. */
  fetchToken: string;
  /** The work's title as the provider files it — the show's, for an episode. */
  featureTitle?: string | null;
  /** The work's year, when the provider states one. */
  year?: number | null;
  /**
   * How the search that produced this was keyed. Set by the caller that knows:
   * a hash search, an IMDb/TMDB id search, or a title query.
   */
  matchBasis?: 'hash' | 'id' | 'query';
  /** The provider marks it machine- or AI-translated. */
  machineTranslated?: boolean;
  /** Uploaded by a source the provider vouches for. */
  trusted?: boolean;
}

const FORMATS: SubtitleRecordFormat[] = ['srt', 'ass', 'ssa', 'vtt', 'lrc'];

function formatFromName(name: string): SubtitleRecordFormat | null {
  const extension = path.extname(name).slice(1).toLowerCase() as SubtitleRecordFormat;
  return FORMATS.includes(extension) ? extension : null;
}

/** `[Group] Show - 07.ja.ass` → `Group`. */
function groupFromName(name: string): string | null {
  return /^\s*\[([^\]]{1,40})\]/.exec(name)?.[1]?.trim() || null;
}

/**
 * Episode number from a release/file name, for the matcher's episode signal.
 *
 * The fourth pattern — a bare `E<nn>` with no season token — is the form Jimaku's
 * own Bandai releases use (`The Big O.E01.Bandai.ja.srt`), and its absence was
 * D267: none of the first three patterns match it, so every such file returned
 * `null`, the unnumbered-target guard in `scoreCandidates` was skipped, and
 * episode 1's dialogue was auto-attached to three creditless specials at
 * confidence 100.
 *
 * It is fenced with alphanumeric lookaround rather than `\b` on purpose. `\b`
 * is wrong in both directions here: `_` is a word character, so `Show_E07` would
 * not match, while a CRC32 tag such as `[E0F1A2B3]` — the single most common
 * token in an anime release name — would be read as episode 0. Bare `E` is the
 * most collision-prone token there is, and this number feeds candidate scoring
 * for EVERY provider, so a false positive misattributes a subtitle rather than
 * merely failing to block one.
 */
function episodeFromName(name: string): number | null {
  // The shared reader keeps the fences described above (alphanumeric lookaround
  // around a bare `E`, CRC32 tags blanked first) and adds `第N話` / `#N` /
  // full-width digits, which Japanese subtitle file names use constantly.
  return parseReleaseEpisode(name).episode;
}

// ---------------------------------------------------------------------------
// Jimaku
// ---------------------------------------------------------------------------

const JIMAKU = 'https://jimaku.cc/api';

interface JimakuEntry {
  id: number;
  name?: string;
  anilist_id?: number;
  english_name?: string;
  japanese_name?: string;
}

/** Which question actually found the entry, so a caller can be honest about it. */
export type JimakuMatchBasis = 'anilist' | 'title';

export interface JimakuMatch {
  candidates: ProviderSubtitleCandidate[];
  /** The entry the files came from. `null` when the search matched nothing. */
  entry: { id: number; name: string } | null;
  basis: JimakuMatchBasis;
  /**
   * The search request itself did not answer — a rate limit, a 5xx, a timeout.
   * Distinct from a 200 carrying `[]`, the same way `resolveAnilistId`'s `down`
   * is distinct from "this title has no AniList mapping": one passes, the other
   * never will, and only one of them should send a user to a torrent index.
   */
  down: boolean;
  /** The status that made `down` true, for the log. 0 when nothing answered. */
  downStatus: number;
  /**
   * Jimaku answered, but nothing it returned is this title.
   *
   * Named rather than merely dropped: the name it *did* offer is the one useful
   * thing to show, because it is usually the show filed under a different
   * romanisation, and a user who sees it can search again with that spelling.
   */
  rejectedEntry: string | null;
}
interface JimakuFile { name?: string; url?: string; size?: number }

/**
 * Japanese subtitles for an AniList id, and which entry answered.
 *
 * Keying on the AniList id — which the Phase 2 metadata sweep stores — rather than
 * on a title string is what makes this provider reliable: there is no title
 * ambiguity left to get wrong, only the episode number. The entry matters to the
 * harvest panel: with the AniList id lookup down a listing can be the wrong show,
 * and a user who cannot see which entry was picked has no way to tell a fuzzy
 * title hit from an exact one.
 *
 * There is deliberately no candidates-only wrapper. One existed, both remaining
 * callers had already moved off it, and its only effect was to make the `down`
 * flag easy to drop — which is exactly the defect (D252) that cost The Big O 49
 * false "no subtitles filed" rows.
 */
export async function jimakuSearchDetailed(
  anilistId: number | undefined,
  title: string,
  episode: number | null,
): Promise<JimakuMatch> {
  const basis: JimakuMatchBasis = anilistId ? 'anilist' : 'title';
  const empty: JimakuMatch = {
    candidates: [], entry: null, basis, down: false, downStatus: 0, rejectedEntry: null,
  };
  const key = keyFor('jimaku');
  if (!key) return empty;

  const query = anilistId
    ? `anilist_id=${encodeURIComponent(String(anilistId))}`
    : `query=${encodeURIComponent(title)}`;
  const reply = await requestJsonReply<JimakuEntry[]>(`${JIMAKU}/entries/search?${query}`, {
    headers: { Authorization: key },
  });
  // A reply that never arrived is an outage, not an answer about this show.
  if (reply.value === null) {
    return { ...empty, down: true, downStatus: reply.status };
  }
  const entries = reply.value;
  if (!entries.length) return empty;

  const out: ProviderSubtitleCandidate[] = [];
  // Not `entries[0]`: the `?query=` search is fuzzy and unordered, and taking
  // the first answered "Naruto" with BORUTO. See `chooseJimakuEntry`.
  const entry = chooseJimakuEntry(entries, anilistId ? '' : title);
  // Nothing Jimaku returned is this show. Fetching the files anyway is how
  // `Shinreigari` came back as 33 files of Madoka Magica — a listing that is
  // confidently the wrong series, which then gets mined under the right one.
  if (!entry) {
    const closest = entries[0];
    return {
      ...empty,
      rejectedEntry: (closest?.name || closest?.english_name || closest?.japanese_name || '').trim() || null,
    };
  }
  const suffix = episode !== null ? `?episode=${encodeURIComponent(String(episode))}` : '';
  const filesReply = await requestJsonReply<JimakuFile[]>(`${JIMAKU}/entries/${entry.id}/files${suffix}`, {
    headers: { Authorization: key },
  });
  // The second request rate-limits exactly like the first, and an entry with a
  // failed file listing reads as "this entry has no files" — worse than the
  // search case, because the panel then names a matched entry to vouch for it.
  if (filesReply.value === null) {
    return { ...empty, down: true, downStatus: filesReply.status };
  }
  const files = filesReply.value;
  const archives: { name: string; url: string }[] = [];

  for (const file of files) {
    const name = file.name?.trim();
    const url = file.url?.trim();
    if (!name || !url) continue;
    const format = formatFromName(name);
    if (!format) {
      // `.rar` too: Jimaku season packs are uploaded in it (see `RAR_ARCHIVE_EXT`).
      if (isExtractableArchive(name, { rar: true })) archives.push({ name, url });
      continue;
    }
    out.push({
      providerId: 'jimaku',
      providerItemId: `jimaku:${entry.id}:${name}`,
      language: 'ja',
      format,
      releaseName: name,
      season: null,
      episode: episodeFromName(name) ?? episode,
      releaseGroup: groupFromName(name),
      hearingImpaired: false,
      hashMatch: false,
      downloads: null,
      fetchToken: url,
    });
  }
  // Season packs filed as `.zip`/`.7z` were dropped, so an entry that only
  // ships one read as "no files". They are opened only when no loose file
  // answers the episode, since each is a download.
  if (archives.length && !out.some((candidate) => episode === null || candidate.episode === episode)) {
    out.push(...await jimakuArchiveCandidates(entry.id, archives.slice(0, JIMAKU_ARCHIVE_LIMIT), episode));
  }
  return {
    candidates: out,
    entry: { id: entry.id, name: (entry.name || entry.english_name || entry.japanese_name || '').trim() },
    basis,
    down: false,
    downStatus: 0,
    rejectedEntry: null,
  };
}

/** Archives opened per search, at most. */
const JIMAKU_ARCHIVE_LIMIT = 2;
/** Refuse an archive whose subtitles declare more than this unpacked. */
const JIMAKU_ARCHIVE_MAX_UNPACKED = 64 * 1024 * 1024;
/** Fetch tokens of members already unpacked; the text is served from memory. */
const JIMAKU_ARCHIVE_TOKEN = 'jimaku-archive:';
const JIMAKU_ARCHIVE_CACHE_LIMIT = 400;
const jimakuArchiveTexts = new Map<string, string>();

function rememberJimakuArchiveText(token: string, text: string): void {
  jimakuArchiveTexts.delete(token);
  jimakuArchiveTexts.set(token, text);
  while (jimakuArchiveTexts.size > JIMAKU_ARCHIVE_CACHE_LIMIT) {
    const oldest = jimakuArchiveTexts.keys().next().value;
    if (oldest === undefined) break;
    jimakuArchiveTexts.delete(oldest);
  }
}

/**
 * The subtitle members of Jimaku archives, as candidates.
 *
 * Unpacked with the same 7-Zip reader the Nyaa route uses (`subtitleArchive`),
 * into memory; the archive itself only touches a temp folder removed at once.
 * A member's episode comes from its own name; a lone member of an archive
 * falls back to the episode asked for, a member of a season pack never does.
 */
async function jimakuArchiveCandidates(
  entryId: number | string,
  archives: { name: string; url: string }[],
  episode: number | null,
): Promise<ProviderSubtitleCandidate[]> {
  const out: ProviderSubtitleCandidate[] = [];
  for (const archive of archives) {
    let dir: string | null = null;
    try {
      const response = await requestPaced(archive.url);
      if (response.status < 200 || response.status >= 300 || response.body.length === 0) continue;
      dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jimaku-archive-'));
      const at = path.join(dir, `archive${path.extname(archive.name).toLowerCase()}`);
      await fsp.writeFile(at, response.body);
      const unpacked = await extractSubtitlesFromArchive(at, {
        extensions: FORMATS.map((format) => `.${format}`),
        maxUnpackedBytes: JIMAKU_ARCHIVE_MAX_UNPACKED,
      });
      if (!unpacked.ok) continue;
      for (const member of unpacked.files) {
        const base = member.name.split(/[\\/]/).pop() ?? member.name;
        const format = formatFromName(base);
        const text = member.text.trim();
        if (!format || !text) continue;
        const token = `${JIMAKU_ARCHIVE_TOKEN}${entryId}:${archive.name}:${member.name}`;
        rememberJimakuArchiveText(token, text);
        out.push({
          providerId: 'jimaku',
          providerItemId: `jimaku:${entryId}:${archive.name}/${member.name}`,
          language: 'ja',
          format,
          releaseName: base,
          season: null,
          episode: episodeFromName(base) ?? (unpacked.files.length === 1 ? episode : null),
          releaseGroup: groupFromName(base) ?? groupFromName(archive.name),
          hearingImpaired: false,
          hashMatch: false,
          downloads: null,
          fetchToken: token,
        });
      }
    } catch {
      // One unreadable archive does not fail the listing.
    } finally {
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return out;
}

/** Jimaku serves files from its own CDN; the URL is fetched as-is. */
async function jimakuFetch(url: string): Promise<string | null> {
  // A member of an archive opened during the search.
  if (url.startsWith(JIMAKU_ARCHIVE_TOKEN)) return jimakuArchiveTexts.get(url) ?? null;
  try {
    const response = await requestPaced(url);
    if (response.status < 200 || response.status >= 300) return null;
    return decodeSubtitle(response.body);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OpenSubtitles
// ---------------------------------------------------------------------------

const OPENSUBTITLES = 'https://api.opensubtitles.com/api/v1';

interface OsSubtitle {
  id?: string;
  attributes?: {
    language?: string;
    release?: string;
    hearing_impaired?: boolean;
    download_count?: number;
    moviehash_match?: boolean;
    ai_translated?: boolean;
    machine_translated?: boolean;
    from_trusted?: boolean;
    feature_details?: {
      season_number?: number | null;
      episode_number?: number | null;
      title?: string | null;
      movie_name?: string | null;
      parent_title?: string | null;
      year?: number | null;
    };
    files?: Array<{ file_id?: number; file_name?: string }>;
  };
}

export interface OpenSubtitlesQuery {
  /** Free-text title. Empty sends no `query` — an id or hash search needs none. */
  title: string;
  season: number | null;
  episode: number | null;
  languages: string[];
  /** OSDb hash; when present the provider can guarantee timing. */
  movieHash?: string | null;
  /** IMDb id of a film (or of one episode), `tt0245429` or `245429`. */
  imdbId?: string | number | null;
  /** TMDB id of a film. */
  tmdbId?: string | number | null;
  /** IMDb id of the SHOW an episode belongs to. */
  parentImdbId?: string | number | null;
  /** TMDB id of the SHOW an episode belongs to. */
  parentTmdbId?: string | number | null;
  year?: number | null;
  /** 1-based results page. */
  page?: number | null;
}

/** The same reply Jimaku gives: candidates, plus whether the request was answered at all. */
export interface OpenSubtitlesMatch {
  candidates: ProviderSubtitleCandidate[];
  /**
   * The search itself did not answer — a 429, a 5xx, a timeout, a 200 carrying
   * something that is not JSON. Distinct from a 200 carrying `{data: []}`: one
   * is a fact about this release, the other is a fact about the minute.
   */
  down: boolean;
  /** The status that made `down` true, for the log. 0 when nothing answered. */
  downStatus: number;
  /** Pages the provider holds for this query; absent when it did not say. */
  totalPages?: number;
}

/** `tt0245429` → `245429`: the API takes the bare number without leading zeros. */
function imdbNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).trim().replace(/^tt/i, '').replace(/^0+/, '');
  return /^\d{1,10}$/.test(digits) ? digits : null;
}

function positiveId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^\d{1,10}$/.test(text) && Number(text) > 0 ? String(Number(text)) : null;
}

/**
 * The query string for one search, built the way the API asks for it: parameter
 * names in alphabetical order and values in lower case. A request that is not
 * normalised is answered with a redirect to the normalised one — a wasted round
 * trip per search — and misses the provider's cache.
 */
export function openSubtitlesSearchParams(query: OpenSubtitlesQuery): string {
  const params: [string, string][] = [];
  const add = (name: string, value: string | null | undefined): void => {
    if (value !== null && value !== undefined && value !== '') params.push([name, value]);
  };
  add('episode_number', query.episode !== null && query.episode !== undefined ? String(query.episode) : null);
  add('imdb_id', imdbNumber(query.imdbId));
  add('languages', query.languages.length
    ? [...new Set(query.languages.map((lang) => lang.trim().toLowerCase()).filter(Boolean))].sort().join(',')
    : null);
  add('moviehash', query.movieHash ? query.movieHash.trim().toLowerCase() : null);
  add('page', query.page && query.page > 1 ? String(Math.floor(query.page)) : null);
  add('parent_imdb_id', imdbNumber(query.parentImdbId));
  add('parent_tmdb_id', positiveId(query.parentTmdbId));
  add('query', query.title.trim() ? query.title.trim().toLowerCase() : null);
  add('season_number', query.season !== null && query.season !== undefined ? String(query.season) : null);
  add('tmdb_id', positiveId(query.tmdbId));
  add('year', query.year ? String(query.year) : null);
  params.sort(([a], [b]) => a.localeCompare(b));
  return params.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
}

/** Parses one `/subtitles` page into candidates. Exported for the fixture tests. */
export function openSubtitlesCandidatesFromReply(response: { data?: OsSubtitle[] } | null): ProviderSubtitleCandidate[] {
  const out: ProviderSubtitleCandidate[] = [];
  for (const entry of response?.data ?? []) {
    const attributes = entry.attributes;
    const file = attributes?.files?.find((candidate) => Number.isFinite(candidate.file_id));
    if (!attributes || !file?.file_id) continue;
    const name = file.file_name?.trim() || attributes.release?.trim() || `opensubtitles-${file.file_id}`;
    const feature = attributes.feature_details;
    const year = Number(feature?.year);
    out.push({
      providerId: 'opensubtitles',
      providerItemId: `opensubtitles:${file.file_id}`,
      language: (attributes.language ?? '').trim().toLowerCase() || 'und',
      // The download endpoint converts to SRT regardless of the source format.
      format: 'srt',
      releaseName: attributes.release?.trim() || name,
      season: feature?.season_number ?? null,
      episode: feature?.episode_number ?? episodeFromName(name),
      releaseGroup: groupFromName(name),
      hearingImpaired: attributes.hearing_impaired === true,
      hashMatch: attributes.moviehash_match === true,
      downloads: Number.isFinite(attributes.download_count) ? Number(attributes.download_count) : null,
      fetchToken: String(file.file_id),
      // For an episode the feature is the episode ("Pilot"); the show is the parent.
      featureTitle: (feature?.parent_title || feature?.movie_name || feature?.title || '').trim() || null,
      year: Number.isFinite(year) && year > 1800 ? year : null,
      machineTranslated: attributes.ai_translated === true || attributes.machine_translated === true,
      trusted: attributes.from_trusted === true,
    });
  }
  return out;
}

export async function openSubtitlesSearchDetailed(query: OpenSubtitlesQuery): Promise<OpenSubtitlesMatch> {
  const key = keyFor('opensubtitles');
  // Not `down`: no key means we never asked, which callers already model as
  // `no-key`. Reporting it as an outage would hide a fixable configuration.
  if (!key) return { candidates: [], down: false, downStatus: 0 };

  const reply = await requestJsonReply<{ data?: OsSubtitle[]; total_pages?: number }>(
    `${OPENSUBTITLES}/subtitles?${openSubtitlesSearchParams(query)}`,
    { headers: { 'Api-Key': key } },
  );
  if (reply.value === null) {
    return { candidates: [], down: true, downStatus: reply.status };
  }
  const totalPages = Number(reply.value?.total_pages);
  return {
    candidates: openSubtitlesCandidatesFromReply(reply.value),
    down: false,
    downStatus: reply.status,
    ...(Number.isFinite(totalPages) && totalPages > 0 ? { totalPages } : {}),
  };
}

/** What a download attempt came back with, including whether the daily quota ran out. */
export interface SubtitleFetchOutcome {
  text: string | null;
  /** The provider refused because the daily download allowance is spent. */
  quotaExceeded: boolean;
  /** When the allowance resets, epoch ms, when the provider said. */
  resetAt: number | null;
  /** Downloads left today after this one, when the provider said. */
  remaining: number | null;
}

interface OsDownloadTicket {
  link?: string;
  remaining?: number;
  message?: string;
  reset_time_utc?: string;
}

/**
 * Reads a `/download` reply. 406 is how the API refuses a download over the daily
 * allowance (and 429 with nothing remaining is the same refusal from the rate
 * limiter); either way the answer is "not today", which is not a fact about the
 * subtitle and must not be stored as a failed download.
 */
export function readOpenSubtitlesTicket(status: number, body: string): {
  link: string | null;
  quotaExceeded: boolean;
  resetAt: number | null;
  remaining: number | null;
} {
  let ticket: OsDownloadTicket = {};
  try {
    ticket = JSON.parse(body) as OsDownloadTicket;
  } catch {
    /* a non-JSON refusal still carries its status */
  }
  const remaining = Number.isFinite(ticket.remaining) ? Number(ticket.remaining) : null;
  const reset = ticket.reset_time_utc ? Date.parse(ticket.reset_time_utc) : NaN;
  const quotaExceeded = status === 406
    || (status === 429 && remaining !== null && remaining <= 0)
    || (status >= 400 && /allowed \d+ subtitles|download limit|quota/i.test(ticket.message ?? ''));
  const link = status >= 200 && status < 300 ? ticket.link?.trim() || null : null;
  return { link, quotaExceeded, resetAt: Number.isFinite(reset) ? reset : null, remaining };
}

/**
 * OpenSubtitles downloads are two-step: ask `/download` for a short-lived link,
 * then fetch it. The quota that matters is counted at the first step, which is why
 * this is only ever called for a candidate that has already been chosen.
 */
async function openSubtitlesFetch(fileId: string): Promise<SubtitleFetchOutcome> {
  const none: SubtitleFetchOutcome = { text: null, quotaExceeded: false, resetAt: null, remaining: null };
  const key = keyFor('opensubtitles');
  if (!key) return none;
  let ticket: ReturnType<typeof readOpenSubtitlesTicket>;
  try {
    const response = await requestPaced(`${OPENSUBTITLES}/download`, {
      method: 'POST',
      headers: { 'Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ file_id: Number(fileId) }),
    });
    ticket = readOpenSubtitlesTicket(response.status, response.body.toString('utf-8'));
  } catch {
    return none;
  }
  const meta = { quotaExceeded: ticket.quotaExceeded, resetAt: ticket.resetAt, remaining: ticket.remaining };
  if (!ticket.link) return { text: null, ...meta };
  try {
    const response = await requestPaced(ticket.link);
    if (response.status < 200 || response.status >= 300) return { text: null, ...meta };
    return { text: decodeSubtitle(response.body), ...meta };
  } catch {
    return { text: null, ...meta };
  }
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Decodes subtitle bytes to text.
 *
 * Japanese subtitle files in circulation are frequently Shift_JIS rather than
 * UTF-8, and decoding those as UTF-8 yields a screen of replacement characters —
 * which looks like a broken download rather than a wrong encoding. The shared
 * detector handles BOMs, UTF-16, Shift_JIS, EUC-JP and the other legacy encodings.
 */
function decodeSubtitle(body: Buffer): string | null {
  if (body.length === 0) return null;
  return decodeSubtitleBytes(body).text.trim() || null;
}

/** Fetches a chosen candidate's text, routing to the provider that offered it. */
export async function fetchSubtitleCandidate(candidate: ProviderSubtitleCandidate): Promise<string | null> {
  return (await fetchSubtitleCandidateDetailed(candidate)).text;
}

/**
 * The same fetch, keeping what the plain form drops: whether the provider
 * refused on its daily quota. Discovery needs that to avoid filing "quota spent"
 * as a failed download, which would suppress the provider for a week.
 */
export async function fetchSubtitleCandidateDetailed(
  candidate: ProviderSubtitleCandidate,
): Promise<SubtitleFetchOutcome> {
  if (candidate.providerId === 'jimaku') {
    return { text: await jimakuFetch(candidate.fetchToken), quotaExceeded: false, resetAt: null, remaining: null };
  }
  if (candidate.providerId === 'opensubtitles') return openSubtitlesFetch(candidate.fetchToken);
  return { text: null, quotaExceeded: false, resetAt: null, remaining: null };
}

/** Cheap reachability + credential check for the settings panel. */
export async function testSubtitleProvider(id: 'jimaku' | 'opensubtitles'): Promise<{ ok: boolean; detail?: string }> {
  if (!keyFor(id)) {
    recordTestResult(id, false, 'no-key');
    return { ok: false, detail: 'no-key' };
  }
  try {
    let result: { ok: boolean; detail?: string };
    if (id === 'jimaku') {
      const entries = await requestJson<JimakuEntry[]>(`${JIMAKU}/entries/search?query=one%20piece`, {
        headers: { Authorization: keyFor(id) as string },
      });
      result = entries === null ? { ok: false, detail: 'unreachable' } : { ok: true };
    } else {
      const info = await requestJson<{ data?: unknown }>(`${OPENSUBTITLES}/infos/user`, {
        headers: { 'Api-Key': keyFor(id) as string },
      });
      result = info === null ? { ok: false, detail: 'unreachable' } : { ok: true };
    }
    recordTestResult(id, result.ok, result.detail ?? '');
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error';
    recordTestResult(id, false, detail);
    return { ok: false, detail };
  }
}
