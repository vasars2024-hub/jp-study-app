/**
 * When direct play cannot decode a local file, fall back to Seanime's transcoder.
 *
 * ## The defect this closes
 *
 * `The Big O - 13` is HEVC video with **FLAC audio** (`ffprobe`: exactly two streams,
 * `hevc` and `flac`). Chromium's media pipeline plays it for ~1.8 s and then dies:
 *
 *     MediaError code 3 — PIPELINE_ERROR_DECODE:
 *     Failed to send audio packet for decoding: {timestamp=211371000 …}
 *
 * Measured live 2026-08-06. It is the AUDIO, not the video, and nothing about the open
 * protocol — the stream is fine, the browser simply cannot decode that codec here. The
 * adopted player then tries its own HLS fallback against the same non-HLS URL, fails with
 * `Unrecoverable HLS error`, and tears the whole surface down: the subtitle manager is
 * destroyed, the transcript empties, and there is nothing left to mine from. So a codec
 * the browser dislikes took out the entire study surface.
 *
 * Seanime already ships the answer. Its **mediastream** module transcodes on demand and
 * serves HLS; asked for this file it returns
 * `CODECS="avc1.640028,mp4a.40.2"` — H.264 and **AAC**, both of which Chromium decodes.
 * Measured throughput on this machine: a 3.4 s cold start, then 1–6 s of content per
 * 300–500 ms request. Comfortably faster than realtime, so playback and seeking are
 * smooth rather than merely possible.
 *
 * ## Empirical, not predictive
 *
 * The trigger is an actual decode error, never a codec table. A list of "codecs Chromium
 * cannot play" would be a guess about every machine and build this ships to, and being
 * wrong in the optimistic direction is invisible while being wrong in the pessimistic
 * direction silently transcodes files that would have played perfectly. A file that
 * direct-plays never reaches this code.
 *
 * The cost of being empirical is the ~1.8 s of failed playback before the switch, paid
 * once per file: {@link rememberTranscodePath} records the path so later opens go
 * straight to the transcoder.
 */

/**
 * Does this URL address the sidecar's mediastream endpoints, and therefore need the
 * sidecar's token on it?
 *
 * ## Why an interceptor is the only door
 *
 * The transcode endpoints are authenticated: a request without `X-Seanime-Token` gets
 * `401 {"error":"UNAUTHENTICATED"}` (measured 2026-08-06). Every other way of carrying
 * that credential was tried against the running sidecar and rejected:
 *
 *  - **`?password=`** — 401. That form authenticates with the *server password*, and the
 *    connection token this app holds is a different, per-launch value.
 *  - **A signed query token on the master playlist** — cannot work even when accepted.
 *    HLS.js resolves `./original/index.m3u8` and `segment-0.ts` relative to the playlist
 *    URL, which drops the query string, so every child request goes out bare.
 *  - **`xhrSetup` on the HLS instance** — the adopted player constructs `new Hls({…})`
 *    with no request hook (`video-core-hls.ts:115`), and `vendor/seanime-web` is adopted
 *    code this repo does not hand-edit (`ADOPTION.md:26,38`).
 *
 * What is left is to put the header on the request itself. Kept as narrow as it can be:
 * one exact origin plus one path prefix, so nothing else in the renderer is touched.
 */
export function isSeanimeMediaStreamUrl(url: string, baseUrl: string): boolean {
  if (!url || !baseUrl) return false;
  let resolved: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    // Relative URLs are resolved the way the browser would, so a child playlist entry is
    // judged by where it will actually go rather than by how it was written.
    resolved = new URL(url, baseUrl);
  } catch {
    return false;
  }
  return resolved.origin === base.origin
    && resolved.pathname.startsWith('/api/v1/mediastream/');
}

/** `MediaError.MEDIA_ERR_DECODE`. The element could not decode what it was handed. */
export const MEDIA_ERR_DECODE = 3;

/**
 * `MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED`. Chromium also reports an unplayable codec
 * this way when it rejects the source outright rather than failing mid-pipeline, so both
 * are treated as "the browser cannot play these bytes; ask for different ones".
 */
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** Where the paths that have already proven undecodable are remembered. */
export const TRANSCODE_MEMO_STORAGE_KEY = 'jp:mediastream-transcode-paths';

/** How many paths to remember. Old entries fall off the front. */
export const TRANSCODE_MEMO_LIMIT = 200;

/**
 * Is this error the kind a transcode can fix?
 *
 * `NETWORK` and `ABORTED` are deliberately excluded: re-encoding a file cannot mend a
 * dropped connection or a deliberate teardown, and treating either as a codec problem
 * would spawn an ffmpeg pipeline every time the user closed the player.
 */
export function isTranscodableMediaError(code: number | null | undefined): boolean {
  return code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED;
}

/** Case-insensitive, separator-normalized. A path from the sidecar is not byte-identical. */
export function transcodePathKey(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').toLowerCase();
}

export function parseTranscodeMemo(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && !!entry);
  } catch {
    return [];
  }
}

export function serializeTranscodeMemo(paths: readonly string[]): string {
  return JSON.stringify(paths.slice(-TRANSCODE_MEMO_LIMIT));
}

export function pathNeedsTranscode(
  memo: readonly string[],
  filePath: string,
): boolean {
  const key = transcodePathKey(filePath);
  return !!key && memo.includes(key);
}

/** Idempotent, and bounded. Returns the same array when the path is already known. */
export function rememberTranscodePath(
  memo: readonly string[],
  filePath: string,
): string[] {
  const key = transcodePathKey(filePath);
  if (!key || memo.includes(key)) return memo as string[];
  return [...memo, key].slice(-TRANSCODE_MEMO_LIMIT);
}

/**
 * The container's `streamUrl` is server-relative (`/api/v1/mediastream/transcode/…`).
 *
 * It must end up ending in `.m3u8`, because that — not the `streamType` field — is what
 * the adopted player keys on when it decides between HLS.js and the native element
 * (`video-core-hls.ts:41,88`). Both are set at the call site for that reason.
 */
export function transcodeStreamUrl(baseUrl: string, streamUrl: string): string {
  if (/^https?:\/\//i.test(streamUrl)) return streamUrl;
  return `${baseUrl.replace(/\/+$/, '')}/${streamUrl.replace(/^\/+/, '')}`;
}

export interface MediastreamContainer {
  readonly streamUrl: string;
  readonly streamType?: string;
}

/**
 * The transcoder is off by default, and a sidecar datadir is disposable.
 *
 * Measured on the running sidecar 2026-08-06: `mediastreamSettings.transcodeEnabled` was
 * `false`, so `/mediastream/request` had nothing to offer. This app supervises its own
 * sidecar and treats its datadir as throwaway (`StudyPlayerSlice.tsx`'s continuity note),
 * so anything the rescue path depends on has to be established by the app rather than
 * assumed — the same reason `ensureSeanimeLibraryCovers` exists.
 *
 * **Only the one flag is written.** `ffmpegPath`/`ffprobePath` default to the bare names
 * and resolve on PATH; overwriting a user's deliberate absolute paths, hardware
 * acceleration choice or preset in order to turn on a fallback would be this function
 * exceeding its remit. It flips a switch and leaves every other field exactly as found.
 *
 * Returns whether transcoding is usable afterwards, so a caller can decline to ask for a
 * stream that cannot be produced.
 */
export async function ensureTranscodeEnabled(
  request: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<boolean> {
  const statusResponse = await request('/api/v1/status');
  if (!statusResponse.ok) return false;
  const status: unknown = await statusResponse.json();
  const settings = (status as {
    data?: { mediastreamSettings?: Record<string, unknown> };
    mediastreamSettings?: Record<string, unknown>;
  })?.data?.mediastreamSettings
    ?? (status as { mediastreamSettings?: Record<string, unknown> })?.mediastreamSettings;

  if (!settings) return false;
  if (settings.transcodeEnabled === true) return true;

  const saved = await request('/api/v1/mediastream/settings', {
    method: 'PATCH',
    body: JSON.stringify({ settings: { ...settings, transcodeEnabled: true } }),
  });
  return saved.ok;
}

/**
 * Ask the sidecar to prepare a transcoded stream for a local path.
 *
 * `audioStreamIndex: 0` is the first audio track — the same default the adopted web UI
 * sends. Returns `null` rather than throwing on anything unexpected: this is a rescue
 * path, and a failed rescue must leave the original error on screen rather than replace
 * it with a second, less relevant one.
 */
export async function requestTranscodeContainer(
  request: (path: string, init: RequestInit) => Promise<Response>,
  filePath: string,
  clientId: string,
): Promise<MediastreamContainer | null> {
  const response = await request('/api/v1/mediastream/request', {
    method: 'POST',
    body: JSON.stringify({
      path: filePath,
      streamType: 'transcode',
      audioStreamIndex: 0,
      clientId,
    }),
  });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const container = (payload as { data?: MediastreamContainer })?.data;
  if (!container || typeof container.streamUrl !== 'string' || !container.streamUrl) {
    return null;
  }
  return container;
}
