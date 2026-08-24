/**
 * MASTER_PLAN §10 — Media Identity Matching + Smart Organization for *local files*.
 *
 * §7's {@link ./mediaIdentity} engine answers "are these two provider descriptors the
 * same title?". This module answers the Media Hub's version of that question, which
 * starts one step earlier: a local file arrives as a *name*, not as a descriptor, so
 * before anything can be matched the name has to be read.
 *
 *   file name -> parseMediaFileName -> ParsedMediaFile -> resolveLocalMediaIdentities
 *                                                      -> mediaLibraryTarget
 *
 * The two modules deliberately share {@link normalizeMediaTitleKey}, so "same title"
 * means exactly the same thing to the identity engine and to the Hub. What differs is
 * the evidence available: a local file has no external identifiers, so grouping rests
 * on the title key plus a year guard, and never fuses two different content types.
 *
 * Deliberately out of scope (do NOT add here):
 *   - filesystem access, probing, hashing, or moving anything. Callers apply plans.
 *   - metadata lookup / provider execution. A file name is the only input.
 *   - subtitle selection (§8), playback handoff (§9), study extraction (§14).
 * Everything below is pure, synchronous and deterministic. Nothing here does I/O,
 * reads a clock, or touches `Math.random`.
 */

import { normalizeMediaTitleKey } from './mediaIdentity';
import { MEDIA_CATEGORIES, mediaCategory, type MediaCategory } from './mediaCategories';
import type { MediaItem } from './types';

// Declared in a leaf module so `types.ts` can name the kind on `MediaItem`
// without importing this file, which imports `types.ts`. Re-exported here
// because this is where the rest of the app looks for it.
export { type MediaReleaseKind, type MediaReleaseSource } from './mediaReleaseKind';
import type { MediaReleaseKind, MediaReleaseSource } from './mediaReleaseKind';

export interface ParsedMediaFile {
  /** Cleaned display title with release tags, separators and markers removed. */
  title: string;
  /** Folded comparison key — shared with §7's identity engine. `''` when unreadable. */
  titleKey: string;
  season: number | null;
  episode: number | null;
  /** Last episode of a multi-episode file (`S01E02-E04`), otherwise null. */
  episodeEnd: number | null;
  /** Release year, only when unambiguously marked. */
  year: number | null;
  /** Vertical resolution in lines (1080 for `1080p` / `1920x1080`). */
  resolution: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  source: MediaReleaseSource;
  /** Scene/fansub group, when the name follows a convention that carries one. */
  releaseGroup: string | null;
  /** ISO-639-1 codes detected from language tags, sorted and de-duplicated. */
  languages: string[];
  kind: MediaReleaseKind;
  /** Lower-cased extension including the dot (`.mkv`), or `''`. */
  extension: string;
}

/** One local file paired with the identity evidence read out of its name. */
export interface LocalMediaVersion {
  itemId: string;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  resolution: number | null;
  source: MediaReleaseSource;
  releaseGroup: string | null;
  /** Higher is better: resolution, then source tier, then a stable id tiebreak. */
  rank: number;
}

export interface LocalMediaIdentity {
  /** Content-addressed and stable across input ordering. */
  id: string;
  title: string;
  titleKey: string;
  year: number | null;
  category: MediaCategory;
  /** Member item IDs, sorted. */
  itemIds: string[];
  /** Season number -> the episode numbers present in that season, sorted. */
  episodesBySeason: Record<number, number[]>;
  /** Gaps inside the observed episode range, per season. Sorted, ascending. */
  missingBySeason: Record<number, number[]>;
  /** `season:episode` -> the files claiming it. More than one entry is a duplicate. */
  versions: Record<string, LocalMediaVersion[]>;
  /** Every key in {@link versions} holding two or more files, sorted. */
  duplicateKeys: string[];
}

export interface LocalMediaIdentityResolution {
  identities: LocalMediaIdentity[];
  /** Item ID -> the ID of the identity it belongs to. */
  identityByItemId: Record<string, string>;
}

export interface LocalMediaIdentityOptions {
  /**
   * When true (default) files of different Hub categories never group together, so a
   * movie and a series sharing a name stay apart. Set false to group on title alone.
   */
  partitionByCategory?: boolean;
}

// ---------------------------------------------------------------------------
// File-name parsing
// ---------------------------------------------------------------------------

const EXTENSION = /\.([a-z0-9]{1,5})$/i;
const LEADING_GROUP = /^[[(]([^\])]{1,40})[\])]\s*/;
const TRAILING_CHECKSUM = /\s*[[(][0-9a-f]{8}[\])]\s*$/i;
const SCENE_GROUP = /-([a-z0-9]{2,20})$/i;

const RESOLUTION_TAG = /\b(\d{3,4})[pi]\b/i;
const RESOLUTION_DIMENSIONS = /\b\d{3,4}\s*[x×]\s*(\d{3,4})\b/i;
const YEAR_BRACKETED = /[[(]((?:19|20)\d{2})[\])]/;
const YEAR_DELIMITED = /(?:^|[\s._-])((?:19|20)\d{2})(?=$|[\s._-])/;

const SEASON_EPISODE = /\bs(\d{1,2})[\s._-]*e(\d{1,3})(?:[\s._-]*(?:-|to)[\s._-]*e?(\d{1,3}))?\b/i;
const SEASON_X_EPISODE = /\b(\d{1,2})x(\d{1,3})\b/;
const SEASON_ONLY = /\bs(?:eason)?[\s._-]*(\d{1,2})\b/i;
const EPISODE_WORD = /\b(?:episode|epis[oó]dio|ep|e)[\s._-]*(\d{1,3})(?:v\d)?\b/i;
const EPISODE_DASH = /\s-\s*(\d{1,3})(?:v\d)?(?=$|[\s([])/;
/**
 * The bare trailing episode number — no `E`, no `-`, just the number sitting
 * between the title and the tag block:
 *
 *   `[Anime Land] JoJo no Kimyou na Bouken - Ougon no Kaze 38 (WEBRip 720p …)`
 *
 * Measured, and the reason this exists: without it that name parses to
 * `episode: null` and a title of `… Ougon no Kaze 38`, so an acquired episode
 * cannot be paired with the harvested subtitle for the same episode — the whole
 * subs-only pipeline ends one step short of the player. It is a mainstream
 * fansub convention, not an exotic one.
 *
 * The `-END` tail is the same convention's last episode — `… Ougon no Kaze
 * 39-END (WEBRip …)` is how that uploader names episode 39, and without it the
 * final episode of a season is the one file the rule cannot read.
 *
 * The lookahead is the guard: the number must be the last token before a
 * bracket group, and that group must not be a bare year, so
 * `Mob Psycho 100 (2016)` is refused rather than read as episode 100. Two more
 * conditions live at the call site, because they are properties of the whole
 * name rather than of this position — see {@link parseMediaFileName}.
 */
const EPISODE_TRAILING = /\s(\d{1,3})(?:v\d)?(?:\s*-\s*(?:end|fin|final))?\s*(?=[[(](?!(?:19|20)\d{2}[\])]))/i;

const KIND_MOVIE = /\b(movie|film|gekijouban|劇場版)\b/i;
const KIND_OVA = /\b(ova|oad|oav)\b/i;
/**
 * Openings and endings ship under many names on a disc rip — `NCOP`, `NCED`,
 * `Creditless Opening`, `Textless Ending`, `Clean OP`. All of them are extras, and
 * leaving them in the numbered run is exactly what makes a library look unsorted
 * (an "NCED 2" tile between episodes 11 and 12).
 *
 * `opening`/`ending` are matched standalone too, which does mean a film actually
 * called "Opening Night" would be shelved as an extra. That is the right way round
 * to be wrong: a misfiled extra is a minor annoyance, an opening interleaved into
 * the episode list is the complaint this exists to fix.
 */
const KIND_SPECIAL =
  /\b(special|specials|sp|extra|omake|ncop|nced|nc[\s._-]?(?:op|ed)|creditless|textless|clean[\s._-]*(?:op|ed|opening|ending)|opening|ending)\b/i;

const SOURCE_TAGS: ReadonlyArray<readonly [RegExp, MediaReleaseSource]> = [
  [/\b(blu[\s._-]?ray|bdrip|bdrmx|brrip|bd)\b/i, 'bluray'],
  [/\b(web[\s._-]?dl|webrip|web|amzn|nf|dsnp)\b/i, 'web'],
  [/\b(hdtv|hdtvrip|tvrip)\b/i, 'hdtv'],
  [/\b(dvd|dvdrip|dvd5|dvd9)\b/i, 'dvd'],
];

const VIDEO_CODECS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(x265|h[\s._-]?265|hevc)\b/i, 'hevc'],
  [/\b(x264|h[\s._-]?264|avc)\b/i, 'h264'],
  [/\b(av1)\b/i, 'av1'],
  [/\b(xvid|divx)\b/i, 'xvid'],
  [/\b(vp9)\b/i, 'vp9'],
];

const AUDIO_CODECS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(flac)\b/i, 'flac'],
  [/\b(opus)\b/i, 'opus'],
  [/\b(e[\s._-]?ac[\s._-]?3|ddp|eac3)\b/i, 'eac3'],
  [/\b(ac[\s._-]?3|dd5|dolby)\b/i, 'ac3'],
  [/\b(dts[\s._-]?hd|dts)\b/i, 'dts'],
  [/\b(aac)\b/i, 'aac'],
  [/\b(mp3)\b/i, 'mp3'],
];

const LANGUAGE_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(jpn|jap|japanese|日本語)\b/i, 'ja'],
  [/\b(eng|english)\b/i, 'en'],
  [/\b(chi|chs|cht|chinese|中文)\b/i, 'zh'],
  [/\b(kor|korean|한국어)\b/i, 'ko'],
  [/\b(rus|russian)\b/i, 'ru'],
  [/\b(spa|spanish|esp)\b/i, 'es'],
  [/\b(fre|fra|french)\b/i, 'fr'],
  [/\b(ger|deu|german)\b/i, 'de'],
];

/** Source tiers for version ranking — a Blu-ray beats a web rip at equal resolution. */
const SOURCE_RANK: Record<Exclude<MediaReleaseSource, null>, number> = {
  bluray: 4, web: 3, hdtv: 2, dvd: 1,
};

function firstMatch(haystack: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null {
  for (const [pattern, value] of table) if (pattern.test(haystack)) return value;
  return null;
}

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cuts the title at the first structural marker. Everything a release name puts after
 * the title (season/episode markers, year, resolution, bracket groups) is noise, so the
 * earliest such marker is the title's right edge.
 */
function titleBefore(name: string, markers: ReadonlyArray<RegExpExecArray | null>): string {
  let cut = name.length;
  for (const marker of markers) {
    if (marker && marker.index >= 0 && marker.index < cut) cut = marker.index;
  }
  return name.slice(0, cut);
}

/** Collapses separators a release name uses interchangeably, then trims the debris. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[[(][^\])]*[\])]/g, ' ')
    // An UNTERMINATED trailing bracket, left behind when the title was cut at a
    // tag inside it (`The Big O - Creditless Opening [BDRip` cut at `1440x1080`).
    // Without this the debris reaches the title key, and the file groups under a
    // series of its own instead of joining the one it belongs to.
    .replace(/[[(][^\])]*$/, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:_]+$/g, '')
    .trim();
}

/**
 * Reads a local file name into structured release evidence. Never throws: an
 * unreadable name yields a record whose fields are all null and whose title is the
 * name itself, which keeps it groupable by exact name rather than silently dropped.
 */
export function parseMediaFileName(fileName: unknown): ParsedMediaFile {
  const raw = typeof fileName === 'string' ? fileName.trim() : '';
  const extensionMatch = EXTENSION.exec(raw);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';
  let name = (extension ? raw.slice(0, -extension.length) : raw).replace(TRAILING_CHECKSUM, '');

  const leadingGroup = LEADING_GROUP.exec(name);
  let releaseGroup: string | null = null;
  if (leadingGroup) {
    releaseGroup = leadingGroup[1].trim() || null;
    name = name.slice(leadingGroup[0].length);
  }

  const resolutionTag = RESOLUTION_TAG.exec(name);
  const resolutionDimensions = RESOLUTION_DIMENSIONS.exec(name);
  const resolution = toInt(resolutionTag?.[1]) ?? toInt(resolutionDimensions?.[1]);

  // Read before the episode block, not after, because an extra's trailing number
  // is an extra index and must not be reachable by EPISODE_TRAILING below.
  const ovaMarker = KIND_OVA.exec(name);
  const specialMarker = ovaMarker ? null : KIND_SPECIAL.exec(name);

  const seasonEpisode = SEASON_EPISODE.exec(name);
  const seasonXEpisode = seasonEpisode ? null : SEASON_X_EPISODE.exec(name);
  const seasonOnly = seasonEpisode || seasonXEpisode ? null : SEASON_ONLY.exec(name);
  const episodeWord = seasonEpisode || seasonXEpisode ? null : EPISODE_WORD.exec(name);
  const episodeDash = seasonEpisode || seasonXEpisode || episodeWord ? null : EPISODE_DASH.exec(name);
  /**
   * Last resort, and deliberately the narrowest of the five.
   *
   * Two conditions beyond the pattern itself. It fires only when the name
   * carried a leading `[Group]` — that is the convention that produces a bare
   * trailing number at all, and requiring it keeps `Mob Psycho 100 [1080p].mkv`
   * out. And it never fires on an OVA/creditless/special, because
   * `The Big O - Creditless Ending 1 [BDRip …]` is not episode 1: that exact
   * collision cost two of a 26-file harvest once already, and a `null` from
   * this parser is the answer that prevented it.
   */
  const episodeTrailing =
    seasonEpisode || seasonXEpisode || episodeWord || episodeDash
      || !leadingGroup || ovaMarker || specialMarker
      ? null
      : EPISODE_TRAILING.exec(name);

  const season = toInt(seasonEpisode?.[1]) ?? toInt(seasonXEpisode?.[1]) ?? toInt(seasonOnly?.[1]);
  const episode =
    toInt(seasonEpisode?.[2]) ?? toInt(seasonXEpisode?.[2]) ?? toInt(episodeWord?.[1])
    ?? toInt(episodeDash?.[1]) ?? toInt(episodeTrailing?.[1]);
  const episodeEnd = toInt(seasonEpisode?.[3]);

  // A year is trusted when bracketed, or when delimited by separators on both sides.
  // It can never collide with an episode number: episodes are capped at three digits
  // here, so a four-digit 19xx/20xx token is unambiguously a year.
  const bracketedYear = YEAR_BRACKETED.exec(name);
  const delimitedYear = bracketedYear ? null : YEAR_DELIMITED.exec(name);
  const year = toInt(bracketedYear?.[1]) ?? toInt(delimitedYear?.[1]);

  const isMovie = KIND_MOVIE.test(name);
  // `ovaMarker` / `specialMarker` are matched rather than tested — the marker's
  // position trims the title below — and are read above, before the episode
  // block that now depends on them.
  const kind: MediaReleaseKind =
    ovaMarker ? 'ova'
      : specialMarker ? 'special'
        : isMovie ? 'movie'
          : episode !== null ? 'episode'
            : season !== null ? 'season-pack'
              : year !== null ? 'movie'
                : 'unknown';

  let source: MediaReleaseSource = null;
  for (const [pattern, value] of SOURCE_TAGS) {
    if (pattern.test(name)) { source = value; break; }
  }

  const languages = [...new Set(
    LANGUAGE_TAGS.filter(([pattern]) => pattern.test(name)).map(([, code]) => code),
  )].sort();

  // Scene names put the group last (`...-GROUP`); anime names put it first, already
  // consumed above. Only look for a scene suffix when no leading group was found.
  if (!releaseGroup) {
    const sceneTail = SCENE_GROUP.exec(name);
    // Guard against swallowing a trailing episode/hyphenated word as a group.
    if (sceneTail && !/^\d+$/.test(sceneTail[1]) && /[._\- ]/.test(name)) releaseGroup = sceneTail[1];
  }

  // The OVA/special marker is cut like an episode marker so an extra keeps the
  // series' own title key — `The Big O - Creditless Opening` has to group under
  // `The Big O`, not become a one-file series of its own.
  const title = cleanTitle(titleBefore(name, [
    seasonEpisode, seasonXEpisode, seasonOnly, episodeWord, episodeDash, episodeTrailing,
    bracketedYear, delimitedYear, resolutionTag, resolutionDimensions,
    ovaMarker, specialMarker,
  ])) || cleanTitle(name) || raw;

  return {
    title,
    titleKey: normalizeMediaTitleKey(title),
    season,
    episode,
    episodeEnd: episodeEnd !== null && episode !== null && episodeEnd > episode ? episodeEnd : null,
    year,
    resolution,
    videoCodec: firstMatch(name, VIDEO_CODECS),
    audioCodec: firstMatch(name, AUDIO_CODECS),
    source,
    releaseGroup,
    languages,
    kind,
    extension,
  };
}

/**
 * An episode range left on the end of a stored title, and only ever a *range*.
 *
 * `parseMediaFileName` cannot cut this one itself: its trailing-episode rule
 * fires only when the name still carries a leading `[Group]`, which is exactly
 * the convention that produces a bare trailing number — and a stored
 * `seriesTitle` has already had that bracket consumed. Relaxing the rule there
 * would put `Mob Psycho 100` back at risk of parsing as episode 100, which is
 * the trap that rule exists for.
 *
 * So this pattern never matches a bare number. It requires an explicit range
 * (`39-END`, `01-26`) or an `ep`/`episode` word, both of which are release
 * artefacts no series is actually named after. Being wrong here only widens a
 * search; being wrong in the parser mis-assigns an episode.
 */
const STORED_TITLE_EPISODE_TAIL =
  /[\s._-]+(?:(?:ep?|episodes?)[\s._-]*)?\d{1,3}[\s._-]*[-~][\s._-]*(?:\d{1,3}|end|fin(?:al)?)$|[\s._-]+(?:ep|episodes?)[\s._-]*\d{1,3}$/i;

/**
 * The text to search a provider's index with, for an item whose stored title
 * still carries release noise.
 *
 * `seriesTitle` is written once, when the file enters the library, by whatever
 * parser was running at that moment. A file acquired from a torrent can
 * therefore keep an episode range in it — the case this exists for is
 * `JoJo no Kimyou na Bouken - Ougon no Kaze 39-END`, added before the parser
 * could read a `-END` tail. Searched verbatim, that matches exactly one release
 * on nyaa: the very file the item was made from. The listing then reports,
 * honestly and uselessly, that the index carries no subtitles for the title.
 *
 * Re-parsing costs nothing and cannot invent a title: the parser falls back to
 * the input when there is nothing to cut, and a shorter result is taken only
 * when it is a genuine prefix of the stored one, so a parse that rewrites
 * rather than trims is ignored. Deliberately not used by `scoreCandidates` —
 * that one matches locally against a providers document keyed on the stored
 * title, and trimming one side of a comparison is how a match is lost.
 */
export function providerSearchTitle(storedTitle: string): string {
  const stored = storedTitle.trim();
  if (!stored) return stored;
  const parsed = parseMediaFileName(stored).title.trim();
  const fromParser =
    parsed && parsed.length < stored.length && stored.toLowerCase().startsWith(parsed.toLowerCase())
      ? parsed
      : stored;
  const trimmed = fromParser.replace(STORED_TITLE_EPISODE_TAIL, '').trim();
  return trimmed || fromParser;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

/** Hints that a video series is animation rather than live action. */
const ANIME_HINT = /\b(anime|ova|oad|raw|sub(?:bed|s)?|fansub)\b|[぀-ヿ㐀-鿿]/i;
/** A leading `[Group]` bracket is the fansub naming convention; scene releases suffix. */
const FANSUB_CONVENTION = /^\s*\[[^\]]+\]/;

/**
 * The Hub's classifier, one step stronger than {@link mediaCategory}: it consults the
 * parsed release evidence before falling back. This matters because `mediaCategory`
 * alone cannot see a movie — a bare `Your Name (2016) 1080p.mkv` has no keyword it
 * recognises, so it lands in `inbox` and never reaches the `/Movies/` branch.
 *
 * Precedence: an explicit user/metadata category always wins; then audio kinds (the
 * parser reads video release names, not tracks); then the parsed release kind.
 */
export function inferMediaCategory(
  item: MediaItem,
  parsed: ParsedMediaFile = parseMediaFileName(item.fileName),
): MediaCategory {
  if (item.category && MEDIA_CATEGORIES.includes(item.category)) return item.category;
  if (item.kind === 'audiobook' || item.kind === 'audio') return mediaCategory(item);

  const haystack = `${item.title ?? ''} ${item.fileName ?? ''}`;
  if (parsed.kind === 'movie') return 'movie';
  if (parsed.kind === 'episode' || parsed.kind === 'season-pack' || parsed.kind === 'ova' || parsed.kind === 'special') {
    // Anime vs live action is not decidable from a name in general; these hints are
    // the honest best guess, and `tv` is the neutral home for everything else.
    const fansub = FANSUB_CONVENTION.test(item.fileName ?? '');
    return ANIME_HINT.test(haystack) || fansub ? 'anime' : 'tv';
  }
  return mediaCategory(item);
}

// ---------------------------------------------------------------------------
// Local identity resolution
// ---------------------------------------------------------------------------

/** FNV-1a over the grouping evidence, so identity IDs never depend on input order. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function versionRank(parsed: ParsedMediaFile): number {
  return (parsed.resolution ?? 0) * 10 + (parsed.source ? SOURCE_RANK[parsed.source] : 0);
}

/** `season:episode`, with `-` standing in for either half when the name didn't say. */
export function localMediaSlotKey(season: number | null, episode: number | null): string {
  return `${season ?? '-'}:${episode ?? '-'}`;
}

/** Gaps inside an observed range — [1,2,5] over seasons yields [3,4]; [] stays []. */
function gapsIn(sorted: readonly number[]): number[] {
  if (sorted.length < 2) return [];
  const present = new Set(sorted);
  const missing: number[] = [];
  for (let n = sorted[0] + 1; n < sorted[sorted.length - 1]; n += 1) {
    if (!present.has(n)) missing.push(n);
  }
  return missing;
}

/**
 * Groups local library items into identities: same title key, same year (when both
 * sides state one), and — by default — same Hub category. Within an identity, files
 * claiming the same season/episode slot are recorded as competing versions rather
 * than being silently de-duplicated; choosing between them is the caller's decision.
 */
export function resolveLocalMediaIdentities(
  items: readonly MediaItem[],
  options: LocalMediaIdentityOptions = {},
): LocalMediaIdentityResolution {
  const partitionByCategory = options.partitionByCategory !== false;
  const buckets = new Map<string, { category: MediaCategory; entries: Array<{ item: MediaItem; parsed: ParsedMediaFile }> }>();

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.fileName !== 'string') continue;
    const parsed = parseMediaFileName(item.fileName);
    const category = inferMediaCategory(item, parsed);
    // The stored title is user-editable and metadata-backed, so it outranks the name;
    // the parsed key is the fallback for a file nobody has titled yet.
    const titleKey = normalizeMediaTitleKey(item.title) || parsed.titleKey;
    if (!titleKey) continue;
    const year = item.year ?? parsed.year;
    // '|' cannot occur in a normalized title key, so the join is unambiguous.
    const bucketKey = [partitionByCategory ? category : 'all', titleKey, year ?? '-'].join('|');
    const bucket = buckets.get(bucketKey) ?? { category, entries: [] };
    bucket.entries.push({ item, parsed });
    buckets.set(bucketKey, bucket);
  }

  const identities: LocalMediaIdentity[] = [];
  const identityByItemId: Record<string, string> = {};

  for (const [bucketKey, bucket] of buckets) {
    const entries = [...bucket.entries].sort((a, b) => a.item.id.localeCompare(b.item.id));
    const first = entries[0];
    const titleKey = normalizeMediaTitleKey(first.item.title) || first.parsed.titleKey;
    const year = first.item.year ?? first.parsed.year;

    const versions: Record<string, LocalMediaVersion[]> = {};
    const seasons = new Map<number, Set<number>>();

    for (const { item, parsed } of entries) {
      const slot = localMediaSlotKey(parsed.season, parsed.episode);
      (versions[slot] ??= []).push({
        itemId: item.id,
        season: parsed.season,
        episode: parsed.episode,
        episodeEnd: parsed.episodeEnd,
        resolution: parsed.resolution,
        source: parsed.source,
        releaseGroup: parsed.releaseGroup,
        rank: versionRank(parsed),
      });
      if (parsed.episode !== null) {
        // A file with an episode but no season marker is season 1 by convention.
        const season = parsed.season ?? 1;
        const set = seasons.get(season) ?? new Set<number>();
        for (let n = parsed.episode; n <= (parsed.episodeEnd ?? parsed.episode); n += 1) set.add(n);
        seasons.set(season, set);
      }
    }

    for (const list of Object.values(versions)) {
      list.sort((a, b) => b.rank - a.rank || a.itemId.localeCompare(b.itemId));
    }

    const episodesBySeason: Record<number, number[]> = {};
    const missingBySeason: Record<number, number[]> = {};
    for (const season of [...seasons.keys()].sort((a, b) => a - b)) {
      const episodes = [...(seasons.get(season) ?? [])].sort((a, b) => a - b);
      episodesBySeason[season] = episodes;
      const missing = gapsIn(episodes);
      if (missing.length) missingBySeason[season] = missing;
    }

    const identity: LocalMediaIdentity = {
      id: `lmi_${fnv1a(bucketKey)}`,
      title: first.item.title || first.parsed.title,
      titleKey,
      year: year ?? null,
      category: bucket.category,
      itemIds: entries.map((entry) => entry.item.id),
      episodesBySeason,
      missingBySeason,
      versions,
      duplicateKeys: Object.keys(versions).filter((key) => versions[key].length > 1).sort(),
    };
    identities.push(identity);
    for (const id of identity.itemIds) identityByItemId[id] = identity.id;
  }

  identities.sort((a, b) => a.titleKey.localeCompare(b.titleKey) || a.id.localeCompare(b.id));
  return { identities, identityByItemId };
}

// ---------------------------------------------------------------------------
// Smart organization
// ---------------------------------------------------------------------------

/** Top-level Hub folder per category, matching §10's example tree. */
const CATEGORY_FOLDER: Record<MediaCategory, string> = {
  anime: 'Anime',
  drama: 'Drama',
  movie: 'Movies',
  tv: 'TV',
  music: 'Music',
  podcast: 'Podcasts',
  audiobook: 'Audiobooks',
  learning: 'Learning',
  personal: 'Personal',
  inbox: 'Unsorted',
};

// Exactly the characters Windows rejects in a path component, plus whitespace to
// collapse. The `-` leads the class so it can never be read as a range bound;
// hyphens themselves are kept, since they carry meaning in `Frieren - S01E02`.
const UNSAFE_SEGMENT = /[<>:"/\\|?*\s]+/g;

/** Makes one path segment safe on Windows and POSIX alike. Never returns `''`. */
export function sanitizeMediaPathSegment(value: string, fallback = 'Untitled'): string {
  const cleaned = value
    .replace(UNSAFE_SEGMENT, ' ')
    .replace(/\s+/g, ' ')
    // Windows rejects a trailing dot or space on a path component.
    .replace(/[\s.]+$/g, '')
    .trim();
  return cleaned || fallback;
}

export interface MediaLibraryTarget {
  /** Full destination path under the Hub root, forward-slashed. */
  path: string;
  /** Path segments below the root, excluding the file name. */
  folders: string[];
  fileName: string;
}

/**
 * Builds the canonical Hub location for one item, following §10's tree:
 *
 *   /Anime/Frieren/Season 1/Frieren - S01E02.mkv
 *   /Movies/Your Name (2016)/Your Name (2016).mkv
 *   /Music/Artist/Album/Track.mp3
 *
 * Series get a season folder, movies get a year-stamped folder, music nests under
 * artist and (when known) album. Anything unclassified lands flat in /Unsorted, which
 * is the one case that deliberately does not invent structure.
 */
export function mediaLibraryTarget(
  item: MediaItem,
  root: string,
  parsed: ParsedMediaFile = parseMediaFileName(item.fileName),
): MediaLibraryTarget {
  const category = inferMediaCategory(item, parsed);
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const extension = parsed.extension || (item.fileName.includes('.') ? item.fileName.slice(item.fileName.lastIndexOf('.')).toLowerCase() : '');
  const title = sanitizeMediaPathSegment(item.title || parsed.title || item.fileName);
  const year = item.year ?? parsed.year;

  const folders: string[] = [CATEGORY_FOLDER[category]];
  let leaf: string;

  if (category === 'music') {
    if (item.artist) folders.push(sanitizeMediaPathSegment(item.artist, 'Unknown Artist'));
    if (item.album) folders.push(sanitizeMediaPathSegment(item.album, 'Unknown Album'));
    leaf = title;
  } else if (category === 'inbox') {
    // The one case that deliberately invents no structure: an unclassified file keeps
    // its own name and sits flat, so nothing is filed under a guess.
    leaf = sanitizeMediaPathSegment(item.fileName.replace(EXTENSION, ''), title);
  } else if (category === 'movie' || parsed.kind === 'movie') {
    const stamped = year ? `${title} (${year})` : title;
    folders.push(stamped);
    leaf = stamped;
  } else if (parsed.episode !== null || parsed.season !== null) {
    const season = parsed.season ?? 1;
    folders.push(title, `Season ${season}`);
    leaf = parsed.episode === null
      ? `${title} - S${pad2(season)}`
      : `${title} - S${pad2(season)}E${pad2(parsed.episode)}${parsed.episodeEnd ? `-E${pad2(parsed.episodeEnd)}` : ''}`;
  } else {
    folders.push(title);
    leaf = title;
  }

  const fileName = `${sanitizeMediaPathSegment(leaf, title)}${extension}`;
  return { path: [base, ...folders, fileName].join('/'), folders, fileName };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
