// Choosing which nyaa release to pull a subtitle out of.
//
// Pure: no network, no filesystem, no Electron. `main/subtitleNyaaSource.ts`
// does the fetching; everything that decides *which* release to fetch lives
// here, because that is the part with real logic and it has to be testable
// without a swarm. Same split, and for the same reason, as
// `videoClip.ts` / `videoClipExtract.ts`.
//
// The load-bearing rule is the size ceiling, and it is enforced as a rejection
// rather than a ranking penalty. A mislabelled 1 GB entry must be unable to
// reach the fetcher at all — the whole point of this provider is that looking
// up a subtitle never costs a video download, and a gate that merely sorts
// badly-sized entries to the bottom still lets one through on an empty result
// set.
//
// Release naming is not a standard and this ranker will be wrong sometimes.
// That is why it returns scored candidates with their reasons attached rather
// than one answer: the caller shows the list, and a wrong guess costs a click
// instead of the wrong subtitle silently attaching.

import type { TorrentRow } from './scraperResults';
import type { ScraperTorrentQuery } from './scraperIpc';
import type {
  ScraperQbittorrentSettings,
  ScraperSourceEntry,
  ScraperTorrentSettings,
} from './scraperSourceSettings';
import type { SubtitleRecordFormat } from './subtitleRecord';

/**
 * Everything the nyaa provider needs, handed to main per request.
 *
 * Lives here rather than in the provider because both sides need it: the
 * renderer builds it from the active scraper profile, main narrows it back off
 * the wire. Mirrors how every other scraper entry point is fed — main is told
 * what to use rather than keeping a copy that goes stale when the user
 * switches profile.
 */
export interface NyaaAcquisitionConfig {
  indexers: ScraperSourceEntry[];
  torrents: ScraperTorrentSettings;
  qbittorrent: ScraperQbittorrentSettings;
}

/**
 * The same config as it arrives over IPC, where it is `unknown`.
 *
 * Anything not carrying all three pieces is treated as absent, which disables
 * the provider rather than half-configuring it — a config missing `qbittorrent`
 * would otherwise pass the availability check and fail at fetch time, which is
 * the same failure one step later and much harder to read.
 */
export function asNyaaAcquisitionConfig(input: unknown): NyaaAcquisitionConfig | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = input as Partial<NyaaAcquisitionConfig>;
  if (!Array.isArray(value.indexers)) return undefined;
  if (!value.torrents || typeof value.torrents !== 'object') return undefined;
  if (!value.qbittorrent || typeof value.qbittorrent !== 'object') return undefined;
  return value as NyaaAcquisitionConfig;
}

/** Projects the active scraper profile onto what this provider actually reads. */
export function acquisitionConfigFrom(settings: {
  sources: { entries: ScraperSourceEntry[] };
  torrents: ScraperTorrentSettings;
  qbittorrent: ScraperQbittorrentSettings;
}): NyaaAcquisitionConfig {
  return {
    indexers: settings.sources.entries,
    torrents: settings.torrents,
    qbittorrent: settings.qbittorrent,
  };
}

/**
 * The most a subtitle-only release may weigh.
 *
 * Sized for the worst honest case — a full-season pack of `.ass` files that
 * ships its fonts, which is a few MB of text and up to ~40 MB of TTFs. An
 * episode of video starts around 300 MB, so there is a wide margin between the
 * two and nothing has to be judged finely.
 */
export const SUBTITLE_SIZE_CEILING_BYTES = 50 * 1024 * 1024;

/**
 * The least a subtitle-only release may weigh for each episode it is offered
 * as an answer to.
 *
 * The ceiling above stops a video release pretending to be subtitles. Nothing
 * stopped the opposite, and it was measured rather than imagined: surveying the
 * user's library for whole-series packs nominated
 * `[IsThisYuri] Black Rock Shooter - Dawn Fall 08 subtitles (DROPPED: ...)`,
 * **26,726 bytes**, as a pack for an 8-episode show. It passes every existing
 * gate — non-zero, under 50 MB, no container extension, a `subtitles` signal —
 * because it *is* honestly a subtitle release. It is one episode of one, and of
 * a different work besides.
 *
 * 6 KB is deliberately well under a real episode of cues (a styled `.ass` runs
 * 15-80 KB, a bare `.srt` 10-40 KB), because this gate exists to catch an
 * order-of-magnitude mismatch and not to referee a plausible pack. At 8
 * episodes it refuses the 26 KB release above with room to spare; at 500 it
 * asks a Naruto-sized pack for 3 MB, which 500 episodes of text exceed several
 * times over.
 */
export const SUBTITLE_PACK_BYTES_PER_EPISODE = 6 * 1024;

/**
 * Whether a subtitle-only release is big enough to hold `episodeCount`
 * episodes of cues.
 *
 * True when the count is unknown or 1: a small file is exactly what a single
 * episode's subtitles look like, and refusing it there would break the OVAs,
 * specials and shorts that make up the short end of a real library. The floor
 * is a statement about a *range* request, not about small files.
 */
export function packCoversEpisodeCount(
  sizeBytes: number,
  episodeCount: number | null | undefined,
): boolean {
  if (typeof episodeCount !== 'number' || !Number.isFinite(episodeCount) || episodeCount <= 1) {
    return true;
  }
  return sizeBytes >= episodeCount * SUBTITLE_PACK_BYTES_PER_EPISODE;
}

/** Text cue formats the record layer can store, keyed by extension. */
const TEXT_SUBTITLE_FORMATS: Record<string, SubtitleRecordFormat> = {
  ass: 'ass',
  srt: 'srt',
  ssa: 'ssa',
  vtt: 'vtt',
  lrc: 'lrc',
};

/**
 * Bitmap subtitle extensions, listed so they can be refused by name.
 *
 * These are images of text, not text. Nothing in the app can render one and
 * nothing can mine one, so storing it would produce a track that looks
 * available and does nothing. `subtitleLocalSources.ts` already excludes bitmap
 * codecs when extracting from a container; this is the same policy for files
 * arriving out of an archive.
 */
const BITMAP_SUBTITLE_EXTENSIONS = new Set(['idx', 'sub', 'sup', 'pgs', 'vobsub']);

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,6})$/i.exec((fileName ?? '').trim());
  return match ? match[1].toLowerCase() : '';
}

/** The record format for a file, or null when it is not a text cue file. */
export function subtitleFormatFor(fileName: string): SubtitleRecordFormat | null {
  return TEXT_SUBTITLE_FORMATS[extensionOf(fileName)] ?? null;
}

/**
 * Whether a file is a bitmap subtitle.
 *
 * Distinguished from "not a subtitle at all" so the caller can say *why* it
 * refused. A pack that turns out to be entirely `.idx`/`.sub` should report
 * that, not read as an empty result — otherwise the user retries forever.
 */
export function isBitmapSubtitleFile(fileName: string): boolean {
  return BITMAP_SUBTITLE_EXTENSIONS.has(extensionOf(fileName));
}

// ------------------------------------------------------------- name signals ---

/**
 * `[SubsPlease] Show - 01` → `Show - 01`.
 *
 * Every signal below is tested against the name with its release group
 * removed, because group names are the single biggest source of false
 * positives here: `SubsPlease`, `Erai-raws`, `HorribleSubs` and `Anime Time`
 * all carry subtitle vocabulary in the group tag while shipping video.
 */
function withoutReleaseGroup(name: string): string {
  return (name ?? '').replace(/^\s*[[(][^\])]{1,40}[\])]\s*/, '');
}

/**
 * Phrases that describe *a video release that has subtitles*, not a subtitle
 * release. Checked first, because they contain the same words the positive
 * signals look for and would otherwise match every soft-subbed episode on the
 * index.
 */
const VIDEO_WITH_SUBS_RE = /\b(multi(?:ple)?[- ]?sub(?:title)?s?|soft[- ]?subs?|hard[- ]?subs?|dual[- ]?audio|eng(?:lish)?[- ]?sub(?:bed|s)?|sub(?:bed|s)?[- ]?and[- ]?dub(?:bed|s)?)\b/i;

/** A container extension in the name means the payload is video. */
const VIDEO_CONTAINER_RE = /\.(mkv|mp4|avi|m2ts|ts|webm|mov)\b/i;

/**
 * Signals that a release is subtitles and nothing else.
 *
 * Returned as a list rather than a boolean so ranking can weight them and the
 * UI can say why a candidate was offered. Order is not significant.
 */
export function subtitlePackSignals(name: string): string[] {
  const text = withoutReleaseGroup(name);
  const found: string[] = [];
  if (VIDEO_WITH_SUBS_RE.test(text)) return found;

  if (/\bsub(?:title)?\s*pack\b/i.test(text)) found.push('sub-pack');
  if (/\bsubs?\s*only\b/i.test(text)) found.push('subs-only');
  // Bare "subtitles" survives only because the video-release phrasings above
  // were already excluded.
  if (/\bsubtitles?\b/i.test(text)) found.push('subtitles');
  if (/字幕/.test(text)) found.push('jp-subtitles');
  // A standalone format tag: `[ASS]`, `(SRT)`, `- ASS`. Anchored to a token
  // boundary so `Cassiopeia` and `Subaru` cannot match.
  if (/(?:^|[\s[(_.-])(ass|srt|ssa|vtt)(?:$|[\s\])_.-])/i.test(text)) found.push('format-tag');
  if (/\bkitsunekko\b/i.test(text)) found.push('kitsunekko');
  return found;
}

// ------------------------------------------------------------- classification ---

/**
 * Whether a row can be pulled whole as a subtitle pack.
 *
 * Two independent conditions, both required. The size gate is the one that
 * makes this provider safe; the name signals are what stop a 5 MB soundtrack
 * single or an image set from being fetched as a subtitle.
 *
 * An unparseable size (`0`) is rejected rather than trusted. `parseSizeBytes`
 * returns 0 for anything it cannot read, and "size unknown" must not be a way
 * around the ceiling.
 */
export function looksLikeSubtitleOnly(row: TorrentRow): boolean {
  if (!row) return false;
  if (!(row.sizeBytes > 0)) return false;
  if (row.sizeBytes > SUBTITLE_SIZE_CEILING_BYTES) return false;
  if (VIDEO_CONTAINER_RE.test(row.name ?? '')) return false;
  return subtitlePackSignals(row.name ?? '').length > 0;
}

/**
 * Whether a row is a plausible target for selective file download.
 *
 * A multi-file release can have its subtitle files fetched on their own
 * through the client's per-file priorities. A single-file release cannot: the
 * subtitle track is interleaved through the container and there is no
 * contiguous subset to ask for, so wanting it means wanting the whole episode.
 * That case is refused here rather than downstream, so no code path can arrive
 * at "just download the 1.4 GB file".
 *
 * `fileCount` is 0 for a batch (the feed does not publish a count and
 * `parseTorrentFeed` records the honest unknown) and 1 for a single release,
 * so a batch is the only shape that qualifies.
 */
export function couldCarrySidecarSubtitles(row: TorrentRow): boolean {
  if (!row) return false;
  if (looksLikeSubtitleOnly(row)) return false;
  return row.isBatch === true;
}

// ------------------------------------------------------------------ ranking ---

export type NyaaCandidateRoute =
  /** The whole torrent is subtitles and is small enough to take entirely. */
  | 'sub-pack'
  /** A batch whose sidecar subtitle files are fetched by per-file priority. */
  | 'batch-sidecar';

export interface NyaaSubtitleWant {
  /** Languages discovery still needs, lowercase. */
  languages: string[];
  /** The user's preferred release groups, from scraper torrent settings. */
  preferredGroups?: string[];
  /** Rows below this are not worth queueing — a dead swarm never completes. */
  minSeeders?: number;
  /**
   * The title the search was for. Rows that do not plausibly belong to it are
   * dropped; omitting it keeps every row, which is what the older callers did.
   */
  title?: string;
  /**
   * How many episodes the caller is asking to be answered at once.
   *
   * Set by a range harvest, which searches with `episode: null` and therefore
   * cannot tell a season pack from one episode's sidecar by the query alone.
   * Omitted by the per-episode discovery path, where a single small file is the
   * correct answer — see `packCoversEpisodeCount`.
   */
  episodeCount?: number | null;
}

/**
 * Title words worth matching on.
 *
 * Articles and connectives are dropped because they are what makes an index's
 * fuzzy match wander: searching "The Big O" on nyaa returns "The Legend of
 * Heroes - Sen no Kiseki - Northern War", which shares only "the". Japanese
 * particles are deliberately **not** in this list — `no`, `wa` and `ga` carry
 * real weight inside a romaji title ("Nanatsu no Taizai").
 */
const TITLE_STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or']);

function titleTokens(title: string): string[] {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token && !TITLE_STOPWORDS.has(token));
}

/**
 * Whether a release name plausibly belongs to the title that was searched for.
 *
 * The index decides what a query matches and it matches generously; nothing
 * downstream used to check, so a listing for one show could offer a 4 GB batch
 * of a completely different one — measured live, "The Big O" returned two
 * releases of "The Legend of Heroes - Sen no Kiseki - Northern War" and both
 * were ranked as usable subtitle sources. Accepting one adds someone else's
 * show to the user's torrent client.
 *
 * Half the significant words, not all of them: releases routinely carry an
 * alternate or abbreviated title, and demanding an exact cover would throw away
 * good rows to catch bad ones.
 */
export function looksLikeSameTitle(rowName: string, title: string): boolean {
  const tokens = titleTokens(title);
  if (!tokens.length) return true;
  const haystack = ` ${String(rowName ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const hits = tokens.filter((token) => haystack.includes(` ${token} `)).length;
  return hits * 2 >= tokens.length;
}

export interface NyaaSubtitleCandidate {
  row: TorrentRow;
  route: NyaaCandidateRoute;
  score: number;
  /** Wanted languages this release advertises. */
  languages: string[];
  /** Why it scored what it did, for the candidate list and for debugging. */
  reasons: string[];
}

/** Seeders matter, but with sharply diminishing returns past a healthy swarm. */
function seederScore(seeders: number): number {
  if (!(seeders > 0)) return 0;
  return Math.min(15, Math.round(Math.log2(seeders + 1) * 3));
}

/**
 * Ranks releases as subtitle sources, best first.
 *
 * Rows that cannot be used by either route are dropped rather than scored
 * negatively, so the returned list is always safe to act on top-down.
 */
export function rankSubtitleCandidates(
  rows: readonly TorrentRow[],
  want: NyaaSubtitleWant,
): NyaaSubtitleCandidate[] {
  const wanted = (want.languages ?? []).map((lang) => lang.trim().toLowerCase()).filter(Boolean);
  const preferred = new Set((want.preferredGroups ?? []).map((group) => group.toLowerCase()));
  const minSeeders = want.minSeeders ?? 0;

  const candidates: NyaaSubtitleCandidate[] = [];

  for (const row of rows ?? []) {
    if (!row) continue;
    if (row.seeders < minSeeders) continue;
    if (want.title && !looksLikeSameTitle(row.name, want.title)) continue;

    // A subtitle-only release too small to hold the requested range is dropped
    // outright rather than demoted: `couldCarrySidecarSubtitles` refuses
    // anything `looksLikeSubtitleOnly` accepts, so it cannot fall through to
    // the batch route and be offered as a multi-gigabyte download instead.
    const isPack =
      looksLikeSubtitleOnly(row) && packCoversEpisodeCount(row.sizeBytes, want.episodeCount);
    const isBatch = !isPack && couldCarrySidecarSubtitles(row);
    if (!isPack && !isBatch) continue;

    // A release advertising no language at all is still usable — plenty of sub
    // packs simply do not say. It scores lower than a declared match and is
    // only reached when nothing better exists.
    const advertised = row.subtitleLanguages ?? [];
    const matched = wanted.length
      ? advertised.filter((lang) => wanted.some((target) => lang.startsWith(target.slice(0, 2))))
      : [...advertised];
    if (wanted.length && advertised.length && matched.length === 0) continue;

    const reasons: string[] = [];
    let score = 0;

    if (matched.length) {
      score += 40;
      reasons.push(`language:${matched.join('+')}`);
    } else {
      reasons.push('language:unstated');
    }

    if (isPack) {
      // The whole reason this provider exists: a few hundred KB instead of a
      // few hundred MB. It outweighs every other signal combined.
      score += 50;
      reasons.push('route:sub-pack');
      for (const signal of subtitlePackSignals(row.name)) reasons.push(`signal:${signal}`);
      // A season pack answers every episode at once.
      if (row.isBatch) {
        score += 5;
        reasons.push('batch');
      }
    } else {
      score += 10;
      reasons.push('route:batch-sidecar');
    }

    const seeds = seederScore(row.seeders);
    if (seeds) {
      score += seeds;
      reasons.push(`seeders:${row.seeders}`);
    }

    if (row.releaseGroup && preferred.has(row.releaseGroup.toLowerCase())) {
      score += 10;
      reasons.push(`preferred-group:${row.releaseGroup}`);
    }

    candidates.push({ row, route: isPack ? 'sub-pack' : 'batch-sidecar', score, languages: matched, reasons });
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Same score: take the smaller download. Both routes benefit and it is a
    // stable, meaningful tiebreak.
    if (a.row.sizeBytes !== b.row.sizeBytes) return a.row.sizeBytes - b.row.sizeBytes;
    return a.row.id.localeCompare(b.row.id);
  });
}

// ------------------------------------------------------------ file selection ---

/** One file inside a torrent, as much of it as selection needs. */
export interface NyaaArchiveFile {
  /** Index the torrent client addresses this file by. */
  index: number;
  /** Path inside the torrent, e.g. `Show/Subs/Show - 07.ja.ass`. */
  name: string;
  sizeBytes: number;
}

export type NyaaSelectionReason =
  | 'ok'
  /** Every subtitle in the release is an image, which nothing here can read. */
  | 'bitmap-only'
  /** Nothing in the release is a subtitle at all. */
  | 'no-subtitles'
  /** Subtitles exist, but none for the episode asked for. */
  | 'no-episode-match';

export interface NyaaFileSelection {
  files: NyaaArchiveFile[];
  format: SubtitleRecordFormat | null;
  reason: NyaaSelectionReason;
}

/** `Show - 07.ja.ass`, `[Group] Show S02E07.ass` → 7. */
export function episodeFromFileName(name: string): number | null {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const patterns = [
    /\bs\d{1,2}[\s._-]*e(\d{1,3})\b/i,
    /\b(?:episode|ep)[\s._-]*(\d{1,3})\b/i,
    /\s-\s*(\d{1,3})(?=\D|$)/,
    /\b(\d{1,3})\s*(?:\.\w+)?$/,
  ];
  for (const pattern of patterns) {
    const value = Number(pattern.exec(base)?.[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * A language hinted by a file's path.
 *
 * Packs signal language by directory (`Subs/ja/`), by a dotted tag
 * (`Show - 07.ja.ass`), or by a spelled-out name. All three are common enough
 * that checking only one loses most of the set.
 */
export function languageFromFileName(name: string): string | null {
  const text = (name ?? '').toLowerCase();
  if (/(^|[\\/._[( -])(ja|jpn|jp)([\\/._\])  -]|$)/.test(text) || /japanese|日本語/.test(text)) return 'ja';
  if (/(^|[\\/._[( -])(en|eng)([\\/._\])  -]|$)/.test(text) || /english/.test(text)) return 'en';
  if (/(^|[\\/._[( -])(zh|chi|chs|cht)([\\/._\])  -]|$)/.test(text) || /chinese|中文/.test(text)) return 'zh';
  if (/(^|[\\/._[( -])(ru|rus)([\\/._\])  -]|$)/.test(text) || /russian|русск/.test(text)) return 'ru';
  return null;
}

/**
 * Picks the subtitle files worth downloading out of a torrent's file list.
 *
 * Reports *why* it found nothing rather than returning a bare empty list. A
 * pack that turns out to be entirely `.idx`/`.sub` is a different problem from
 * one that has no subtitles at all — the first means "this release is useless
 * to this app", the second means "the ranker picked wrong" — and a user who
 * only ever sees "no results" cannot tell those apart or act on either.
 *
 * All chosen files share one format, because the caller writes a single record
 * and a record has a single format.
 */
export function selectSubtitleFiles(
  files: readonly NyaaArchiveFile[],
  want: { episode?: number | null; languages?: string[] },
): NyaaFileSelection {
  const all = files ?? [];
  const text = all.filter((file) => subtitleFormatFor(file.name) !== null);

  if (text.length === 0) {
    const bitmap = all.some((file) => isBitmapSubtitleFile(file.name));
    return { files: [], format: null, reason: bitmap ? 'bitmap-only' : 'no-subtitles' };
  }

  const wanted = (want.languages ?? []).map((lang) => lang.slice(0, 2).toLowerCase()).filter(Boolean);
  // A file whose path states a language we did not ask for is excluded. One
  // that states nothing is kept: single-language packs routinely label nothing.
  let pool = wanted.length
    ? text.filter((file) => {
      const lang = languageFromFileName(file.name);
      return lang === null || wanted.includes(lang);
    })
    : text;
  if (pool.length === 0) pool = text;

  if (typeof want.episode === 'number' && Number.isFinite(want.episode)) {
    const matching = pool.filter((file) => episodeFromFileName(file.name) === want.episode);
    if (matching.length === 0) {
      return { files: [], format: null, reason: 'no-episode-match' };
    }
    pool = matching;
  }

  // Prefer the format most of the pool uses, then the largest file of it — in a
  // pack that ships both `.srt` and `.ass` of the same episode, the styled one
  // is the fuller subtitle and is also reliably the bigger file.
  const byFormat = new Map<SubtitleRecordFormat, NyaaArchiveFile[]>();
  for (const file of pool) {
    const format = subtitleFormatFor(file.name) as SubtitleRecordFormat;
    byFormat.set(format, [...(byFormat.get(format) ?? []), file]);
  }
  const [format, chosen] = [...byFormat.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  })[0];

  return {
    files: [...chosen].sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name)),
    format,
    reason: 'ok',
  };
}

// ------------------------------------------------------------------- queries ---

export interface NyaaSubtitleQueryInput {
  /** Series title as the media item knows it. */
  title: string;
  /** Episode number, when searching for a single episode rather than a season. */
  episode?: number | null;
  /** Restrict to a nyaa category. See the note on `category` below. */
  category?: string;
}

/**
 * Builds the index query for a subtitle search.
 *
 * Note on `category`: nyaa's anime tree is `1_1` AMV, `1_2` English-translated,
 * `1_3` Non-English-translated and `1_4` Raw — there is **no subtitles
 * category**, so category cannot be used to isolate subtitle packs the way a
 * dedicated one would. `1_0` (the whole anime tree) is therefore the default
 * and `looksLikeSubtitleOnly` does the isolating. Callers may still pass a
 * narrower category when they know the release language.
 *
 * The episode number is appended unpadded and zero-padded is left to the
 * index's own tokenizer: nyaa matches substrings, and `01` vs `1` is exactly
 * the kind of difference that silently halves a result set.
 */
export function buildSubtitleQuery(input: NyaaSubtitleQueryInput): ScraperTorrentQuery {
  const title = (input.title ?? '').trim();
  const parts = [title];
  if (typeof input.episode === 'number' && Number.isFinite(input.episode)) {
    parts.push(String(input.episode).padStart(2, '0'));
  }
  return {
    text: parts.filter(Boolean).join(' '),
    category: input.category?.trim() || '1_0',
  };
}
