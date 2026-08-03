/**
 * YouTube discovery — search, channel browse, and per-video probing.
 *
 * Phase 8 item 3. The fetch half of `shared/youtubeDiscovery.ts`, which owns
 * every judgement; this file owns exactly one thing — turning a renderer request
 * into a `yt-dlp` invocation and handing the raw JSON to the parser.
 *
 * ## Three decisions that shape the whole file
 *
 * 1. **No API key, and no second yt-dlp path.** YouTube's Data API needs a key,
 *    a quota, and a billing account, and it *still* cannot tell you whether a
 *    caption track is author-written or ASR without a second, OAuth-scoped call
 *    the uploader has to authorise. `yt-dlp` answers all of it unauthenticated,
 *    and this app already depends on it for downloading. So discovery runs on
 *    the binary that is already there, through the same `ytDlpJson` helper
 *    `ytPlaylists.ts` uses. There is no key to leak because there is no key.
 *
 * 2. **Every side effect is injected.** The subprocess runner, the binary
 *    locator and the clock are all parameters with real defaults. The whole
 *    feature — including the tool-missing path and the argument construction —
 *    is exercisable with no network, no `yt-dlp`, and no YouTube. That is not
 *    style: this was written on a machine where no outbound probe could even be
 *    attempted, so a design only validatable against live YouTube could not have
 *    been validated at all. Same discipline as slice 69's `MalTransport`.
 *
 * 3. **Nothing downloads.** Every argument list here carries `--skip-download`
 *    or `--flat-playlist`, and {@link assertMetadataOnly} refuses to run an
 *    argument list that could fetch media. Discovery surfaces candidates;
 *    acquiring one stays an explicit user action through the existing
 *    `yt:downloadVideos` path.
 */

import { ipcMain } from 'electron';
import { findYtDlp, ytDlpJson } from './media';
import {
  parseYoutubeProbePayload,
  parseYoutubeSearchPayload,
  youtubeWatchUrlFor,
  type YoutubeProbeResult,
  type YoutubeSearchResult,
} from '../shared/youtubeDiscovery';

// ---------------------------------------------------------------------------
// Transport boundary
// ---------------------------------------------------------------------------

export type YtDlpResult = { ok: true; data: unknown } | { ok: false; error: string };

/** The one subprocess seam. Defaults to `media.ts`'s `ytDlpJson`. */
export type YtDlpTransport = (args: string[]) => Promise<YtDlpResult>;

export interface YoutubeDiscoveryDeps {
  runYtDlp?: YtDlpTransport;
  /** Resolves the yt-dlp binary, or null when it is not installed. */
  locateYtDlp?: () => Promise<string | null>;
  now?: () => number;
}

interface ResolvedDeps {
  runYtDlp: YtDlpTransport;
  locateYtDlp: () => Promise<string | null>;
  now: () => number;
}

function resolve(deps: YoutubeDiscoveryDeps = {}): ResolvedDeps {
  return {
    runYtDlp: deps.runYtDlp ?? ytDlpJson,
    locateYtDlp: deps.locateYtDlp ?? findYtDlp,
    now: deps.now ?? Date.now,
  };
}

// ---------------------------------------------------------------------------
// Argument construction
// ---------------------------------------------------------------------------

/** Hard ceiling on one search. yt-dlp fetches these serially. */
export const MAX_SEARCH_RESULTS = 40;
export const DEFAULT_SEARCH_RESULTS = 20;

/**
 * Flags that would make yt-dlp write media or subtitle files to disk.
 *
 * Checked at the call site rather than trusted, because "discovery must not
 * download" is the kind of invariant that survives review and then dies to a
 * one-line argument change six months later. A violation throws rather than
 * silently stripping the flag — a caller that asked for a download here has a
 * bug, and hiding it would make the bug harder to find, not less real.
 */
const DOWNLOADING_FLAGS = [
  '--write-subs',
  '--write-auto-subs',
  '--write-automatic-subs',
  '--all-subs',
  '-o',
  '--output',
  '--paths',
  '-P',
];

export function assertMetadataOnly(args: readonly string[]): void {
  const offender = args.find((arg) => DOWNLOADING_FLAGS.includes(arg));
  if (offender) {
    throw new Error(`youtubeDiscovery: refusing to run a downloading flag (${offender}).`);
  }
  if (!args.includes('--skip-download') && !args.includes('--flat-playlist')) {
    throw new Error('youtubeDiscovery: every invocation must be metadata-only.');
  }
}

/**
 * Collapses a user query into one yt-dlp-safe line.
 *
 * `ytsearchN:` takes everything after the colon verbatim, so the query needs no
 * escaping — but a newline would end the term mid-word and a 500-character
 * paste is a mistake, not a search.
 */
export function sanitiseQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200) : '';
}

export function clampResultCount(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_SEARCH_RESULTS;
  return Math.min(MAX_SEARCH_RESULTS, Math.max(1, value));
}

/**
 * Search arguments.
 *
 * `ytsearchN:` is yt-dlp's virtual extractor for YouTube's own search — it needs
 * no key and returns the same ranking a signed-out browser sees.
 * `--flat-playlist` keeps it to one round trip: without it yt-dlp resolves every
 * hit individually, which is N extractions for one search.
 */
export function buildSearchArgs(query: string, limit: number): string[] {
  const args = [
    '-J',
    '--flat-playlist',
    '--no-download',
    '--no-warnings',
    `ytsearch${clampResultCount(limit)}:${sanitiseQuery(query)}`,
  ];
  assertMetadataOnly(args);
  return args;
}

/** `@handle`, a `/channel/UC…` URL, or a bare channel URL → that channel's uploads. */
export function channelVideosUrl(raw: string): string | null {
  const value = sanitiseQuery(raw);
  if (!value) return null;
  if (/^@[\w.-]+$/.test(value)) return `https://www.youtube.com/${value}/videos`;
  if (/^UC[\w-]{20,}$/.test(value)) return `https://www.youtube.com/channel/${value}/videos`;
  if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(value)) return null;
  const trimmed = value.replace(/\/+$/, '');
  return /\/(videos|streams|shorts|playlists)$/i.test(trimmed) ? trimmed : `${trimmed}/videos`;
}

export function buildChannelArgs(channelUrl: string, limit: number): string[] {
  const args = [
    '-J',
    '--flat-playlist',
    '--no-download',
    '--no-warnings',
    '--playlist-end',
    String(clampResultCount(limit)),
    channelUrl,
  ];
  assertMetadataOnly(args);
  return args;
}

/**
 * Probe arguments — the only call that costs one round trip per video.
 *
 * `--skip-download` is what makes this metadata-only; `--no-playlist` stops a
 * watch URL that carries a `list=` parameter from expanding into the whole
 * playlist, which is how a one-video probe becomes a 200-video extraction.
 */
export function buildProbeArgs(videoId: string): string[] {
  const args = [
    '-J',
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    youtubeWatchUrlFor(videoId),
  ];
  assertMetadataOnly(args);
  return args;
}

/** YouTube ids are 11 URL-safe base64 characters; anything else is not one. */
export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{11}$/.test(value);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

async function runOrReport(
  deps: ResolvedDeps,
  args: string[],
): Promise<{ ok: true; data: unknown } | { ok: false; state: 'tool-missing' | 'error'; message: string }> {
  // Checked before the transport is touched, so the tool-missing state never
  // depends on parsing an error message — and so a missing binary costs no
  // process spawn at all.
  const binary = await deps.locateYtDlp();
  if (!binary) {
    return { ok: false, state: 'tool-missing', message: 'yt-dlp was not found on your PATH.' };
  }
  const result = await deps.runYtDlp(args);
  if (!result.ok) return { ok: false, state: 'error', message: result.error };
  return { ok: true, data: result.data };
}

export async function searchYoutube(
  query: unknown,
  limit: unknown = DEFAULT_SEARCH_RESULTS,
  deps: YoutubeDiscoveryDeps = {},
): Promise<YoutubeSearchResult> {
  const resolved = resolve(deps);
  const cleaned = sanitiseQuery(query);
  const base = { mode: 'search' as const, query: cleaned, fetchedAt: resolved.now() };
  if (!cleaned) return { ...base, state: 'empty', candidates: [] };

  const run = await runOrReport(resolved, buildSearchArgs(cleaned, clampResultCount(limit)));
  if (!run.ok) return { ...base, state: run.state, candidates: [], message: run.message };

  const { candidates } = parseYoutubeSearchPayload(run.data);
  return { ...base, state: candidates.length > 0 ? 'ready' : 'empty', candidates };
}

export async function browseYoutubeChannel(
  channel: unknown,
  limit: unknown = DEFAULT_SEARCH_RESULTS,
  deps: YoutubeDiscoveryDeps = {},
): Promise<YoutubeSearchResult> {
  const resolved = resolve(deps);
  const cleaned = sanitiseQuery(channel);
  const base = { mode: 'channel' as const, query: cleaned, fetchedAt: resolved.now() };
  const url = channelVideosUrl(cleaned);
  if (!url) {
    return {
      ...base,
      state: cleaned ? 'error' : 'empty',
      candidates: [],
      message: cleaned ? 'Not a YouTube channel handle or URL.' : undefined,
    };
  }

  const run = await runOrReport(resolved, buildChannelArgs(url, clampResultCount(limit)));
  if (!run.ok) return { ...base, state: run.state, candidates: [], message: run.message };

  const { candidates } = parseYoutubeSearchPayload(run.data);
  return { ...base, state: candidates.length > 0 ? 'ready' : 'empty', candidates };
}

/**
 * Reads one video's caption inventory and audio language.
 *
 * One video per call, deliberately. A "probe everything" button would be N
 * sequential extractions against YouTube from one keypress, which is both slow
 * and the kind of unattended burst that gets a residential IP throttled. The
 * console probes what the user asks about.
 */
export async function probeYoutubeVideo(
  videoId: unknown,
  deps: YoutubeDiscoveryDeps = {},
): Promise<YoutubeProbeResult> {
  const resolved = resolve(deps);
  if (!isYoutubeVideoId(videoId)) {
    return { state: 'error', videoId: '', probe: null, message: 'Not a YouTube video id.' };
  }

  const run = await runOrReport(resolved, buildProbeArgs(videoId));
  if (!run.ok) return { state: run.state, videoId, probe: null, message: run.message };

  const probe = parseYoutubeProbePayload(run.data, resolved.now());
  return probe
    ? { state: 'ready', videoId, probe }
    : { state: 'error', videoId, probe: null, message: 'yt-dlp returned no usable metadata.' };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

/**
 * Registered from `registerYtPlaylistsIpc()` rather than from `main.ts`, so the
 * YouTube surface has one wiring point instead of two.
 */
export function registerYoutubeDiscoveryIpc(deps: YoutubeDiscoveryDeps = {}): void {
  ipcMain.handle('ytDiscovery:search', (_event, query: unknown, limit: unknown) =>
    searchYoutube(query, limit, deps));

  ipcMain.handle('ytDiscovery:channel', (_event, channel: unknown, limit: unknown) =>
    browseYoutubeChannel(channel, limit, deps));

  ipcMain.handle('ytDiscovery:probe', (_event, videoId: unknown) =>
    probeYoutubeVideo(videoId, deps));
}
