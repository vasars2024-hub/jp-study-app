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

/**
 * Hiragana and katakana.
 *
 * Kanji is deliberately **not** counted. It is the one script a Japanese and a
 * Chinese release share, and nyaa carries a great many of the latter, so a
 * kanji-inclusive test would accept `[GM-Team][国漫]` packs as Japanese. Kana
 * appears in no other language, which makes it the only cheap signal that is
 * also unambiguous.
 */
const KANA = /[぀-ゟ゠-ヿ]/gu;

/** `Dialogue: 0,0:00:06.27,…,,There once was a war.` */
const ASS_DIALOGUE_LINE = /^Dialogue\s*:/i;

/**
 * Kana in a subtitle file's dialogue, ignoring everything around it.
 *
 * Dialogue only, and override blocks stripped, because the number has to mean
 * what it says. A real acquired `.ass` here is **501,684 bytes with 262
 * dialogue lines** — the rest is styles and embedded font data — so a ratio
 * over the raw text measures the typesetting, not the language. Style blocks
 * are also where a Japanese *font name* lives, which is exactly the handful of
 * kana an English release can legitimately carry.
 *
 * Falls back to every line when nothing looks like an ASS dialogue line, so
 * `.srt` and `.vtt` are measured whole.
 */
export function subtitleKanaCount(text: string): number {
  const lines = String(text ?? '').split(/\r?\n/);
  const dialogue = lines.filter((line) => ASS_DIALOGUE_LINE.test(line));
  const body = dialogue.length ? dialogue : lines;
  let count = 0;
  for (const line of body) {
    count += (line.replace(/\{[^}]*\}/g, '').match(KANA) ?? []).length;
  }
  return count;
}

/**
 * Enough kana that the file is written in Japanese rather than merely
 * mentioning it.
 *
 * One line of Japanese dialogue runs roughly 10–20 kana, so this floor asks for
 * more than a title card or a translator credit while sitting far below any
 * real subtitle file: the smallest episode of the acquired Gundam X pack would
 * clear it in its first two lines if it were Japanese at all.
 */
export const JAPANESE_KANA_FLOOR = 20;

/**
 * Whether a subtitle file's own text is Japanese.
 *
 * `languageFromFileName` can only answer when a name states a language, and its
 * documented policy is that a file stating nothing is kept — single-language
 * packs routinely label nothing. That hole was measured, not theorised: the
 * Route A pack for MAL 92 `Kidou Shinseiki Gundam X` acquired **47 files /
 * 11,285 dialogue lines / 0 kana / 292,568 Latin letters** — the official
 * *English* subtitles — and every name in it stated nothing, so a harvest that
 * had asked for `ja` mined 11,136 cues into 0 words and called it a success.
 * The file name cannot answer this; the text can.
 */
export function looksJapaneseSubtitle(text: string): boolean {
  return subtitleKanaCount(text) >= JAPANESE_KANA_FLOOR;
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

/**
 * The subset of those phrasings that state *where* the subtitles are, rather
 * than merely that they exist: inside the container, or burned into the
 * picture. Either way there is no separate file to ask the client for.
 *
 * Deliberately narrower than `VIDEO_WITH_SUBS_RE`. `dual audio` is a claim
 * about audio; `English subbed` says a release is subtitled without saying
 * how. Neither is evidence, so neither is here.
 */
const MUXED_SUBS_RE = /\b(multi(?:ple)?[- ]?sub(?:title)?s?|soft[- ]?subs?|hard[- ]?subs?)\b/i;

/**
 * Whether a release's own name says its subtitles are muxed or burned in.
 *
 * Measured, not assumed. Across 4 titles and 10 distinct batch candidates the
 * sidecar route reached a subtitle verdict and found none: 79 files across the
 * 7 `Kaguya-sama … First Kiss` releases were **79 video, 0 subtitle**, and
 * candidate 4 — `[Erai-raws] … [Multiple Subtitle]`, 2,662.40 MB — was 4 files
 * and 4 video. `[Multiple Subtitle]` is Erai-raws' way of saying "several
 * subtitle *tracks*", and softsub/hardsub say the same by definition.
 *
 * Scored against the 33 real sidecar names in the 2026-08-17 survey
 * (`debug/g31n-routeb-54.json`): **14 of 33** declare it, every one an mkv-era
 * muxing group (`[Erai-raws]`, `[Judas]`, `[Trix]`, `[DKB]`, `[Anime Time]`).
 */
export function declaresMuxedSubtitles(name: string): boolean {
  return MUXED_SUBS_RE.test(withoutReleaseGroup(name ?? ''));
}

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
 *
 * Being a batch is necessary and was, until 2026-08-17, the whole test — which
 * is why this route went 0 for 10 on real data. A batch whose name declares
 * muxed or burned-in subtitles is refused here, so no path can spend a 6–47 s
 * metadata handshake proving what the name already said.
 */
export function couldCarrySidecarSubtitles(row: TorrentRow): boolean {
  if (!row) return false;
  if (looksLikeSubtitleOnly(row)) return false;
  if (declaresMuxedSubtitles(row.name ?? '')) return false;
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
  const tokens = String(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token && !TITLE_STOPWORDS.has(token));
  // A bare number in a release name is an episode, a volume, a year or a
  // resolution far more often than it is part of a title, so a digit-only token
  // is not evidence while any word is available to carry the match. Measured:
  // "Gundam 00" matched a "Naruto 00 - 12" batch on the `00` alone.
  const words = tokens.filter((token) => !DIGITS_ONLY.test(token));
  return words.length ? words : tokens;
}

/** A token that is nothing but digits. */
const DIGITS_ONLY = /^\d+$/;

/**
 * The part of a release name that is not a bracketed or parenthesised tag.
 *
 * Group, resolution, codec, source and CRC all live inside brackets, so what is
 * left is roughly the release's own claim about which work it carries.
 */
function untaggedPart(rowName: string): string {
  return String(rowName ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ');
}

/** Roman numerals a sequel actually uses; past IX nobody numbers this way. */
const ROMAN_SEQUEL: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

/**
 * Which sequel a name claims to be, or 0 for the original.
 *
 * A sequel shares every word of its predecessor, so the half-the-tokens rule
 * cannot see the difference and scores it a perfect match in both directions.
 * Measured 2026-08-17: a search for `Ashita no Joe` (MAL 2402, 79 episodes)
 * accepted `Ashita no Joe 2 (Tomorrow's Joe 2) [CR]`, a different 47-episode
 * work. It was harmless only by luck — that release was refused a step later
 * for being English — and the next numbered sequel would have been downloaded.
 *
 * The hard part is that release names are full of numbers that are not sequels.
 * Three rules keep them out, each one measured against the names already in
 * this repo's fixtures: a zero-padded number is an episode (`Show - 07`), a
 * number inside a range is an episode (`01-52 BATCH`), and a number following
 * a separator rather than a word is an episode (`Cosette - 7`). What is left —
 * a bare 2 to 9 sitting directly after the title's own words — is the form a
 * sequel actually takes.
 */
export function sequelOrdinal(name: string): number {
  const claim = untaggedPart(name);
  let best = 0;
  const note = (value: number) => { if (value >= 2 && value <= 9) best = Math.max(best, value); };

  // The explicit forms need none of the reasoning below: they say the word, so
  // they are read from the WHOLE name rather than the untagged claim. Release
  // groups put the season inside the tags, and stripping those hid it: measured
  // 2026-08-17 in the survey at `debug/g31n-routeb-54.json`, the 1-episode movie
  // `Jujutsu Kaisen 0 Movie` was offered `[Judas] Jujutsu Kaisen (Season 03)`,
  // 4,300.80 MB, because `untaggedPart` deletes `(Season 03)` along with the
  // codec tags and leaves a name that claims nothing.
  // `S1` and `1st Season` are deliberately in range and score 1, i.e. no
  // sequel, so `Gundam 00 S1` still matches a search for `Gundam 00`.
  const whole = String(name ?? '');
  for (const match of whole.matchAll(/\b(?:s|season)\s?(\d{1,2})\b/giu)) note(Number(match[1]));
  for (const match of whole.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/giu)) note(Number(match[1]));
  for (const match of claim.matchAll(/\b([ivx]{2,4})\b/giu)) {
    note(ROMAN_SEQUEL[match[1].toLowerCase()] ?? 0);
  }
  // A bare number, admitted only when a word precedes it: after a dash, tilde
  // or hash it is an episode, and every episode-numbering fixture in this file
  // uses one of those or a zero pad.
  for (const match of claim.matchAll(/(\S+)\s+(\d{1,2})(?=\s|$)/gu)) {
    if (match[2].startsWith('0')) continue;
    if (!/\p{L}/u.test(match[1])) continue;
    note(Number(match[2]));
  }
  return best;
}

/**
 * Whether the only place this number appears is an episode range.
 *
 * The companion to `untaggedPart`, and it exists because a release name can be
 * nothing *but* tags: `[GM-Team][国漫][神印王座][Throne of Seal][2022][001-208
 * Fin][AVC][GB][1080P]` survived the untagged rule with no claim to read, and a
 * 100 GB Chinese release is not a one-episode short film called "001".
 */
function onlyInEpisodeRange(rowName: string, token: string): boolean {
  const name = String(rowName ?? '');
  const ranged = new RegExp(`\\d+\\s*[-~–]\\s*0*${token}\\b|\\b0*${token}\\s*[-~–]\\s*\\d+`);
  return ranged.test(name);
}

/**
 * Words a release name spends on itself rather than on the work it carries.
 *
 * Derived from the untagged part of the 32 distinct release names the
 * 2026-08-17 survey returned (`debug/g31n-routeb-54.json`), not from
 * imagination: `complete`, `season`, `s01`, `x264`, `1080p` and `v2` are the
 * only ones that actually escape the brackets there. The rest are the universal
 * scene words, kept because the cost of missing one is a legitimate release
 * refused, and this file's standing posture is that accepting someone else's
 * show into the user's torrent client is the worse failure.
 */
const RELEASE_VOCABULARY = new Set([
  'batch', 'collection', 'complete', 'ep', 'episode', 'episodes', 'eps', 'season', 'seasons', 'series',
  'bd', 'bdmv', 'bdrip', 'blu', 'bluray', 'dvd', 'dvdrip', 'hdtv', 'ray', 'raw', 'raws', 'remaster',
  'remastered', 'remux', 'repack', 'uncensored', 'uncut', 'web', 'webdl', 'webrip',
  'audio', 'dual', 'dub', 'dubbed', 'multi', 'multiple', 'only', 'sub', 'subbed', 'subs', 'subtitle',
  'subtitles',
  'aac', 'av', 'avc', 'flac', 'fhd', 'fin', 'h', 'hd', 'hdr', 'hevc', 'opus', 'sd', 'uhd', 'x264', 'x265',
]);

/** `s01`, `720p`, `10bit`, `2nd`, `v2`, `4k` — a marker, never a title word. */
const RELEASE_MARKER = /^(?:[sv]\d{1,2}|\d{3,4}p|\d{1,2}bit|\d{1,2}(?:st|nd|rd|th)|\d{1,2}k|[hx]\d{3})$/;

/**
 * What a release name claims to carry, with its own vocabulary taken out.
 *
 * Deliberately over-strips: a word wrongly called vocabulary only widens what
 * the short-title rule below will accept, and that rule is the conservative
 * one.
 */
function claimWords(rowName: string): string[] {
  return titleTokens(untaggedPart(rowName)).filter(
    (word) => !RELEASE_VOCABULARY.has(word) && !RELEASE_MARKER.test(word) && !DIGITS_ONLY.test(word),
  );
}

/**
 * At or below this, the half-the-tokens ratio has nothing left to measure with:
 * one token out of one is a perfect score for a single incidental word.
 */
const SHORT_TITLE_MAX_TOKENS = 2;

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
  // Asked in both directions, because the failure is symmetric: a search for
  // the original matches the sequel, and a search for the sequel matches the
  // original just as well. See `sequelOrdinal` for why a bare number is only
  // sometimes a sequel.
  if (sequelOrdinal(rowName) !== sequelOrdinal(title)) return false;
  // A title that is only digits — "001" is one, in the user's own list — has no
  // word the index can be held to, so every batch that numbers its episodes
  // matched it: measured live, "001" listed 23 releases, among them Bleach
  // 001-063, Fairy Tail 001-175 and a 59 GB Saint Seiya batch, each of them one
  // click from being added to the user's torrent client. A release that names
  // some other work outside its tags is not that title, whatever its numbering.
  if (tokens.every((token) => DIGITS_ONLY.test(token))) {
    if (/\p{L}/u.test(untaggedPart(rowName))) return false;
    if (tokens.every((token) => onlyInEpisodeRange(rowName, token))) return false;
  }
  const haystack = ` ${String(rowName ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const hits = tokens.filter((token) => haystack.includes(` ${token} `)).length;
  if (hits * 2 < tokens.length) return false;
  // A one- or two-word title scores a perfect ratio on a single incidental word,
  // so it is held to a second, opposite question: does the release claim any
  // *other* work's words as well? Measured live 2026-08-17 — MAL 16528 `Hal` is
  // ハル, whose romaji alias `Haru` is one common word, and the listing offered
  // `[Trix] Agents of the Four Seasons S01 … Shunkashuutou Daikousha: Haru no
  // Mai`, 2,969.60 MB of an unrelated show, on that token alone. `Heya` (MAL
  // 7024, one episode) took a 12-episode `[Erai-raws] Heya Camp` batch the same
  // way. A release whose own claim is nothing but tags keeps passing: there is
  // no counter-evidence in it, only the absence of any.
  if (tokens.length <= SHORT_TITLE_MAX_TOKENS) {
    const wanted = new Set(tokens);
    if (claimWords(rowName).some((word) => !wanted.has(word))) return false;
  }
  return true;
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
 * What the ranker saw and threw away.
 *
 * An empty candidate list is the same shape whether the index returned nothing
 * or returned eleven releases of this exact work that cannot serve subtitles.
 * Those are different answers and the user is owed the difference: eleven
 * consecutive Route B refusals reported no number, so nothing could audit them.
 */
export interface NyaaRankDrops {
  /** Rows that survived the title gate — the denominator for the rest. */
  titleMatched: number;
  /** Below the profile's `minSeeders`. */
  seeders: number;
  /** Not this work. */
  title: number;
  /** Declares its subtitles muxed into the video or burned in. */
  muxed: number;
  /** Neither a small enough pack nor a batch with addressable files. */
  shape: number;
  /** Advertises subtitle languages, none of them wanted. */
  language: number;
}

export interface NyaaRankResult {
  candidates: NyaaSubtitleCandidate[];
  dropped: NyaaRankDrops;
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
  return rankSubtitleCandidatesDetailed(rows, want).candidates;
}

/** As `rankSubtitleCandidates`, and also says what it discarded and why. */
export function rankSubtitleCandidatesDetailed(
  rows: readonly TorrentRow[],
  want: NyaaSubtitleWant,
): NyaaRankResult {
  const wanted = (want.languages ?? []).map((lang) => lang.trim().toLowerCase()).filter(Boolean);
  const preferred = new Set((want.preferredGroups ?? []).map((group) => group.toLowerCase()));
  const minSeeders = want.minSeeders ?? 0;

  const candidates: NyaaSubtitleCandidate[] = [];
  const dropped: NyaaRankDrops = {
    titleMatched: 0,
    seeders: 0,
    title: 0,
    muxed: 0,
    shape: 0,
    language: 0,
  };

  for (const row of rows ?? []) {
    if (!row) continue;
    if (row.seeders < minSeeders) {
      dropped.seeders += 1;
      continue;
    }
    if (want.title && !looksLikeSameTitle(row.name, want.title)) {
      dropped.title += 1;
      continue;
    }
    dropped.titleMatched += 1;

    // A subtitle-only release too small to hold the requested range is dropped
    // outright rather than demoted: `couldCarrySidecarSubtitles` refuses
    // anything `looksLikeSubtitleOnly` accepts, so it cannot fall through to
    // the batch route and be offered as a multi-gigabyte download instead.
    const isPack =
      looksLikeSubtitleOnly(row) && packCoversEpisodeCount(row.sizeBytes, want.episodeCount);
    const isBatch = !isPack && couldCarrySidecarSubtitles(row);
    if (!isPack && !isBatch) {
      // Attributed separately from `shape`, because "this release states its
      // subtitles are inside the video" is a verdict the listing can explain
      // and "nothing here is fetchable" is not. A pack can never reach this
      // branch: `looksLikeSubtitleOnly` already refuses every muxing phrase.
      //
      // Only a batch is counted here, so the figure the listing quotes means
      // "withheld *because* of that declaration". A single-file release has no
      // addressable subset whatever its name claims, and counting it inflated
      // the real number nearly threefold live: `Fate/strange Fake` read 11 of
      // 38 when 4 of its matches were batches at all.
      if (row.isBatch === true && declaresMuxedSubtitles(row.name ?? '')) dropped.muxed += 1;
      else dropped.shape += 1;
      continue;
    }

    // A release advertising no language at all is still usable — plenty of sub
    // packs simply do not say. It scores lower than a declared match and is
    // only reached when nothing better exists.
    const advertised = row.subtitleLanguages ?? [];
    const matched = wanted.length
      ? advertised.filter((lang) => wanted.some((target) => lang.startsWith(target.slice(0, 2))))
      : [...advertised];
    if (wanted.length && advertised.length && matched.length === 0) {
      dropped.language += 1;
      continue;
    }

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

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Same score: take the smaller download. Both routes benefit and it is a
    // stable, meaningful tiebreak.
    if (a.row.sizeBytes !== b.row.sizeBytes) return a.row.sizeBytes - b.row.sizeBytes;
    return a.row.id.localeCompare(b.row.id);
  });
  return { candidates, dropped };
}

/**
 * The listing's message when it has nothing to offer.
 *
 * `''` when there are candidates. Otherwise it names what the ranker saw, so a
 * refusal can be checked rather than believed.
 */
export function describeEmptyNyaaListing(dropped: NyaaRankDrops): string {
  const base = 'No release on the index looks like it carries subtitles for this title.';
  if (dropped.muxed > 0) {
    // Two counts, two agreements. `N of M matching release…` cannot be made to
    // read correctly for both at once — live it produced "1 of 38 matching
    // release declares" — so each number is given its own noun phrase.
    const matched = `${dropped.titleMatched} release${dropped.titleMatched === 1 ? '' : 's'}`;
    const [verb, its] = dropped.muxed === 1 ? ['declares', 'its'] : ['declare', 'their'];
    return (
      'No release on the index carries subtitle files for this title. ' +
      `Of ${matched} matching it, ${dropped.muxed} ${verb} ${its} subtitles muxed into the ` +
      'video, which cannot be fetched separately.'
    );
  }
  return base;
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
  | 'no-episode-match'
  /** Every subtitle states a language, and none of them is one we asked for. */
  | 'wrong-language';

export interface NyaaFileSelection {
  files: NyaaArchiveFile[];
  format: SubtitleRecordFormat | null;
  reason: NyaaSelectionReason;
}

/**
 * `Show - 07.ja.ass`, `[Group] Show S02E07.ass`, `[Group][Show][07][BDRIP].ass` → 7.
 *
 * The bracket form is not a nicety. The first Route A pack ever acquired — 47
 * files of `[Kidou Shin Seiki Gundam X][21][BDRIP][1440x1080][H264_FLAC].ass` —
 * parsed to **39 nulls**, because every other pattern here wants a separator or
 * the end of the string and this convention puts the number in a group of its
 * own. An episode range is the thing the user asked this pipeline for, and a
 * pack of nulls matches no range at all.
 *
 * Only a bracket that is *nothing but* one to three digits counts, which is
 * what keeps `[1440x1080]`, `[H264_FLAC]`, `[10bit]`, a `[2011]` year and an
 * eight-digit CRC out. `[Vol.1]`, `[SP1]` and `[NCOP1]` fail it too, so the same
 * pack's eight creditless specials stay null instead of colliding with real
 * episodes 1-8.
 */
export function episodeFromFileName(name: string): number | null {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const patterns = [
    /\bs\d{1,2}[\s._-]*e(\d{1,3})\b/i,
    /\b(?:episode|ep)[\s._-]*(\d{1,3})\b/i,
    /\s-\s*(\d{1,3})(?=\D|$)/,
    // After the dash form: `[Group] Show - 07 [1080p].ass` should read 07.
    /\[(\d{1,3})\]/,
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
  const unlabelled = text.filter((file) => languageFromFileName(file.name) === null);
  let pool = wanted.length
    ? text.filter((file) => {
      const lang = languageFromFileName(file.name);
      return lang === null || wanted.includes(lang);
    })
    : text;
  // The empty-pool fallback restores the files that stated *nothing*, never the
  // ones that stated the wrong language. Restoring everything was measured on a
  // real release: `Ashita no Joe 2 … [CR] (Subtitles only)` ships 47 files all
  // named `… [Eng].ass`, so a `ja` harvest filtered every one of them out,
  // found the pool empty, put all 47 back, and downloaded the English pack the
  // release had correctly declared. A release that answers the question is the
  // one case that must not be overridden.
  if (pool.length === 0) pool = unlabelled;
  if (pool.length === 0) return { files: [], format: null, reason: 'wrong-language' };

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
