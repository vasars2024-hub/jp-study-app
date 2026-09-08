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
import path from 'node:path';
import type { SubtitleRecordFormat } from '../shared/subtitleRecord';
import { chooseJimakuEntry } from '../shared/subtitleHarvest';
import type { SubtitleProviderExecutionId } from '../shared/subtitleDiscoveryIpc';
import {
  readSubtitleProviderSecret,
  writeSubtitleProviderSecret,
} from './credentials/subtitles';
import { recordTestResult } from './credentials/vault';

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
}

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
      response.on('data', (chunk: Buffer) => {
        if (chunks.reduce((n, c) => n + c.length, 0) < 16_000_000) chunks.push(chunk);
      });
      response.on('end', () => finish(() => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks),
      })));
      response.on('error', (error: Error) => finish(() => reject(error)));
    });
    req.on('error', (error) => finish(() => reject(error)));
    if (options.body !== undefined) req.write(options.body, 'utf-8');
    req.end();
  });
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
    response = await request(url, {
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
  const patterns = [
    /\bs\d{1,2}[\s._-]*e(\d{1,3})\b/i,
    /\b(?:episode|ep)[\s._-]*(\d{1,3})\b/i,
    /\s-\s*(\d{1,3})(?=\D|$)/,
    /(?<![a-z0-9])e(\d{1,3})(?![a-z0-9])/i,
  ];
  for (const pattern of patterns) {
    const value = Number(pattern.exec(name)?.[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
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

  for (const file of files) {
    const name = file.name?.trim();
    const url = file.url?.trim();
    if (!name || !url) continue;
    const format = formatFromName(name);
    if (!format) continue;
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
  return {
    candidates: out,
    entry: { id: entry.id, name: (entry.name || entry.english_name || entry.japanese_name || '').trim() },
    basis,
    down: false,
    downStatus: 0,
    rejectedEntry: null,
  };
}

/** Jimaku serves files from its own CDN; the URL is fetched as-is. */
async function jimakuFetch(url: string): Promise<string | null> {
  try {
    const response = await request(url);
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
    feature_details?: { season_number?: number | null; episode_number?: number | null };
    files?: Array<{ file_id?: number; file_name?: string }>;
  };
}

export interface OpenSubtitlesQuery {
  title: string;
  season: number | null;
  episode: number | null;
  languages: string[];
  /** OSDb hash; when present the provider can guarantee timing. */
  movieHash?: string | null;
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
}

export async function openSubtitlesSearchDetailed(query: OpenSubtitlesQuery): Promise<OpenSubtitlesMatch> {
  const key = keyFor('opensubtitles');
  // Not `down`: no key means we never asked, which callers already model as
  // `no-key`. Reporting it as an outage would hide a fixable configuration.
  if (!key) return { candidates: [], down: false, downStatus: 0 };

  const params = new URLSearchParams();
  if (query.movieHash) params.set('moviehash', query.movieHash);
  params.set('query', query.title);
  if (query.season !== null) params.set('season_number', String(query.season));
  if (query.episode !== null) params.set('episode_number', String(query.episode));
  if (query.languages.length) params.set('languages', query.languages.join(','));

  const reply = await requestJsonReply<{ data?: OsSubtitle[] }>(
    `${OPENSUBTITLES}/subtitles?${params.toString()}`,
    { headers: { 'Api-Key': key } },
  );
  if (reply.value === null) {
    return { candidates: [], down: true, downStatus: reply.status };
  }
  const response = reply.value;

  const out: ProviderSubtitleCandidate[] = [];
  for (const entry of response?.data ?? []) {
    const attributes = entry.attributes;
    const file = attributes?.files?.find((candidate) => Number.isFinite(candidate.file_id));
    if (!attributes || !file?.file_id) continue;
    const name = file.file_name?.trim() || attributes.release?.trim() || `opensubtitles-${file.file_id}`;
    out.push({
      providerId: 'opensubtitles',
      providerItemId: `opensubtitles:${file.file_id}`,
      language: (attributes.language ?? '').trim().toLowerCase() || 'und',
      // The download endpoint converts to SRT regardless of the source format.
      format: 'srt',
      releaseName: attributes.release?.trim() || name,
      season: attributes.feature_details?.season_number ?? null,
      episode: attributes.feature_details?.episode_number ?? episodeFromName(name),
      releaseGroup: groupFromName(name),
      hearingImpaired: attributes.hearing_impaired === true,
      hashMatch: attributes.moviehash_match === true,
      downloads: Number.isFinite(attributes.download_count) ? Number(attributes.download_count) : null,
      fetchToken: String(file.file_id),
    });
  }
  return { candidates: out, down: false, downStatus: reply.status };
}

/**
 * OpenSubtitles downloads are two-step: ask `/download` for a short-lived link,
 * then fetch it. The quota that matters is counted at the first step, which is why
 * this is only ever called for a candidate that has already been chosen.
 */
async function openSubtitlesFetch(fileId: string): Promise<string | null> {
  const key = keyFor('opensubtitles');
  if (!key) return null;
  const ticket = await requestJson<{ link?: string }>(`${OPENSUBTITLES}/download`, {
    method: 'POST',
    headers: { 'Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: Number(fileId) }),
  });
  const link = ticket?.link?.trim();
  if (!link) return null;
  try {
    const response = await request(link);
    if (response.status < 200 || response.status >= 300) return null;
    return decodeSubtitle(response.body);
  } catch {
    return null;
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
 * which looks like a broken download rather than a wrong encoding. The heuristic:
 * if a UTF-8 read produces replacement characters, try Shift_JIS.
 */
function decodeSubtitle(body: Buffer): string | null {
  if (body.length === 0) return null;
  // Strip a UTF-8 BOM, which some tools emit and cue parsers choke on.
  const bytes = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf ? body.subarray(3) : body;

  const utf8 = bytes.toString('utf-8');
  if (!utf8.includes('�')) return utf8.trim() || null;
  try {
    const decoded = new TextDecoder('shift_jis', { fatal: false }).decode(bytes);
    // Only prefer it when it is genuinely cleaner.
    const cleaner = (decoded.match(/�/g)?.length ?? 0) < (utf8.match(/�/g)?.length ?? 0);
    return (cleaner ? decoded : utf8).trim() || null;
  } catch {
    return utf8.trim() || null;
  }
}

/** Fetches a chosen candidate's text, routing to the provider that offered it. */
export async function fetchSubtitleCandidate(candidate: ProviderSubtitleCandidate): Promise<string | null> {
  if (candidate.providerId === 'jimaku') return jimakuFetch(candidate.fetchToken);
  if (candidate.providerId === 'opensubtitles') return openSubtitlesFetch(candidate.fetchToken);
  return null;
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
