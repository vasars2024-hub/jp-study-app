/**
 * "Download this entry" — the contract behind the catalogue's download action.
 *
 * The Discover console already answers *what should I watch or read next*. This
 * is the step after it: the user clicks an entry on MyAnimeList (or AniList),
 * says how much of it they want, and the app goes and gets exactly that much.
 *
 * Two content types meet here on purpose. An anime episode and a manga chapter
 * are fetched by completely different machinery — a torrent handoff versus a
 * provider page download — but the *choosing* is the same question in both
 * cases: which of these numbered units do I want? So the selection model is
 * content-neutral and lives here, pure and testable, while the two acquisition
 * paths stay where they already are.
 *
 * Deliberately out of scope (do NOT add here):
 *   - provider HTTP or catalogue lookups — `main/scraper/malUnits.ts`,
 *   - torrent matching and the client handoff — `main/scraper/torrents.ts`
 *     and `main/scraper/seanimeAcquisition.ts`,
 *   - anything that reads storage or `Date.now()`.
 */

import type { AcquisitionContentType, AcquisitionTorrentCandidate } from './acquisition';
import type { DiscoveryProviderId } from './mediaDiscovery';
import {
  foldReleaseWidth,
  maskReleaseNoise,
  releaseMarkerIsEpisode,
} from './releaseEpisodeNumber';

/** The catalogue entry a download was started from. */
export interface MalDownloadTarget {
  contentType: AcquisitionContentType;
  provider: DiscoveryProviderId;
  /** The provider's own id — a MAL id for `jikan`, an AniList id for `anilist`. */
  id: number;
  title: string;
  nativeTitle: string;
  /** Romaji, where the catalogue publishes one. Used to search release indexes. */
  romajiTitle: string;
  posterUrl: string;
  /** What the catalogue says exists, which is not always what is listed. */
  totalUnits: number;
  /**
   * The season this entry is, as release groups number it (`S02E05`), when its
   * titles say so — or 1 when it has no earlier TV season. `null` = unknown.
   * Optional: results built before season mapping existed carry none.
   */
  seasonNumber?: number | null;
  /**
   * Episodes in the TV seasons before this one, so `number + absoluteOffset` is
   * the absolute episode number (`One Piece - 1071`). `null` when the prequel
   * chain could not be read in full — never guessed.
   */
  absoluteOffset?: number | null;
}

/**
 * Where a unit came from, when that is more than its number.
 *
 * Anime episodes are identified by their number alone. Manga chapters are not:
 * the same chapter exists on several provider extensions, each with its own
 * chapter id, and the download call needs that id back.
 */
export interface MalDownloadUnitSource {
  providerId: string;
  providerLabel: string;
  chapterId: string;
  /** As published — `"10.5"` is a real chapter number and must not be rounded. */
  rawNumber: string;
  language: string;
  scanlator: string;
}

/** One downloadable unit: an episode, or a chapter. */
export interface MalDownloadUnit {
  /** Stable within one list; what a hand-picked selection stores. */
  key: string;
  /** Position in the published order, ascending from 0. Never duplicated. */
  ordinal: number;
  /**
   * The number a user would type into a range. Episode numbers are integers;
   * chapter numbers can be fractional, which is why this is not an int.
   */
  number: number;
  /** `EP 07`, `Ch. 10.5` — display only. */
  label: string;
  title: string;
  nativeTitle: string;
  airDate: string | null;
  filler: boolean;
  recap: boolean;
  /**
   * Already held locally. Optional because only the renderer can answer it —
   * the catalogue has no opinion about the user's library, and a `false` from
   * main would be a claim it is not in a position to make.
   */
  owned?: boolean;
  source: MalDownloadUnitSource | null;
  /**
   * The same episode counted from the series' first TV episode (`number` plus
   * every earlier TV season), when the catalogue's prequel chain says so and it
   * differs from `number`. Releases of long-runners are numbered this way.
   */
  absoluteNumber?: number;
  /**
   * The episode counted from the start of its season when this entry is a later
   * part of a split season (`S03E13` for part 2's first episode).
   */
  seasonEpisode?: number;
}

export const MAL_SELECTION_MODES = ['all', 'range', 'latest', 'custom'] as const;
export type MalSelectionMode = (typeof MAL_SELECTION_MODES)[number];

export function isMalSelectionMode(value: unknown): value is MalSelectionMode {
  return typeof value === 'string' && (MAL_SELECTION_MODES as readonly string[]).includes(value);
}

/**
 * How much of the entry to take.
 *
 * All four modes are carried at once rather than as a discriminated union, so
 * switching mode in the UI does not discard the bounds the user already typed.
 */
export interface MalDownloadSelection {
  mode: MalSelectionMode;
  /** Inclusive bounds, in unit numbers, for `range`. */
  from: number;
  to: number;
  /** How many of the newest units to take, for `latest`. */
  latest: number;
  /** Hand-picked unit keys, for `custom`. Order is irrelevant. */
  keys: string[];
  skipFillers: boolean;
  skipRecaps: boolean;
  /** Leave out what is already downloaded. On by default — refetching costs. */
  skipOwned: boolean;
}

export const DEFAULT_MAL_SELECTION: MalDownloadSelection = {
  mode: 'all',
  from: 1,
  to: 1,
  latest: 1,
  keys: [],
  skipFillers: false,
  skipRecaps: false,
  skipOwned: true,
};

/** Ascending by published order. Providers list newest-first as often as not. */
export function sortMalUnits(units: readonly MalDownloadUnit[]): MalDownloadUnit[] {
  return [...units].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * A selection that covers the whole list, with bounds seeded from it.
 *
 * Seeding matters: a dialog that opens with `from: 1, to: 1` makes switching to
 * "range" look like the list emptied itself, and the user has to retype bounds
 * the app already knows.
 */
export function seedMalSelection(
  units: readonly MalDownloadUnit[],
  base: MalDownloadSelection = DEFAULT_MAL_SELECTION,
): MalDownloadSelection {
  const sorted = sortMalUnits(units);
  if (!sorted.length) return { ...base, keys: [] };
  const first = sorted[0].number;
  const last = sorted[sorted.length - 1].number;
  return {
    ...base,
    from: first,
    to: last,
    latest: Math.min(base.latest > 0 ? base.latest : 1, sorted.length),
    // Keys from a previous entry's list would silently select nothing here.
    keys: base.keys.filter((key) => sorted.some((unit) => unit.key === key)),
  };
}

/**
 * The units a selection actually resolves to, in published order.
 *
 * Filler and recap are applied after the mode, not before: "the latest 3
 * episodes, skipping filler" means the last three of the real episodes, and
 * applying the mode first would have silently returned two.
 */
export function resolveMalSelection(
  units: readonly MalDownloadUnit[],
  selection: MalDownloadSelection,
): MalDownloadUnit[] {
  const eligible = sortMalUnits(units).filter((unit) => {
    if (selection.skipFillers && unit.filler) return false;
    if (selection.skipRecaps && unit.recap) return false;
    if (selection.skipOwned && unit.owned) return false;
    return true;
  });

  switch (selection.mode) {
    case 'range': {
      // Bounds typed in either order describe the same range; a UI that
      // silently returns nothing for `12 to 5` is just a trap.
      const low = Math.min(selection.from, selection.to);
      const high = Math.max(selection.from, selection.to);
      return eligible.filter((unit) => unit.number >= low && unit.number <= high);
    }
    case 'latest': {
      const count = Math.trunc(selection.latest);
      if (!Number.isFinite(count) || count <= 0) return [];
      return eligible.slice(Math.max(0, eligible.length - count));
    }
    case 'custom': {
      const wanted = new Set(selection.keys);
      return eligible.filter((unit) => wanted.has(unit.key));
    }
    case 'all':
    default:
      return eligible;
  }
}

/** What a selection is about to do, for the confirmation line above the button. */
export interface MalSelectionSummary {
  selected: number;
  total: number;
  /** Excluded by the filler/recap toggles rather than by the mode. */
  skipped: number;
  firstNumber: number | null;
  lastNumber: number | null;
  /** True when the resolved units are one unbroken run of numbers. */
  contiguous: boolean;
}

export function summarizeMalSelection(
  units: readonly MalDownloadUnit[],
  selection: MalDownloadSelection,
): MalSelectionSummary {
  const resolved = resolveMalSelection(units, selection);
  const eligible = resolveMalSelection(units, { ...selection, mode: 'all' });
  const numbers = resolved.map((unit) => unit.number);
  return {
    selected: resolved.length,
    total: units.length,
    skipped: units.length - eligible.length,
    firstNumber: numbers.length ? numbers[0] : null,
    lastNumber: numbers.length ? numbers[numbers.length - 1] : null,
    contiguous: resolved.every(
      (unit, index) => index === 0 || unit.ordinal === resolved[index - 1].ordinal + 1,
    ),
  };
}

// ---------------------------------------------------------------------------
// Unit construction
// ---------------------------------------------------------------------------

/**
 * Reads the numeric part of a published chapter number.
 *
 * Providers publish `"10"`, `"10.5"`, `"Chapter 10"` and `"10-11"`. Only the
 * leading number is meaningful for a range, and a chapter that carries no
 * number at all falls back to its position — which is why the caller passes it.
 */
export function parseUnitNumber(raw: string, fallback: number): number {
  const match = /-?\d+(?:\.\d+)?/.exec(raw ?? '');
  if (!match) return fallback;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : fallback;
}

/** `7` → `EP 07`; fractional and long numbers are left unpadded. */
export function episodeLabel(number: number): string {
  return Number.isInteger(number) && number >= 0 && number < 100
    ? `EP ${String(number).padStart(2, '0')}`
    : `EP ${number}`;
}

export function chapterLabel(raw: string, number: number): string {
  const trimmed = (raw ?? '').trim();
  // `Chapter 12` already says what it is; prefixing gives `Ch. Chapter 12`.
  if (/[a-z]/i.test(trimmed)) return trimmed;
  return `Ch. ${trimmed || number}`;
}

// ---------------------------------------------------------------------------
// Matching selected units to releases
// ---------------------------------------------------------------------------

/**
 * Whether a release name says it contains episode `number`.
 *
 * Deliberately stricter than a bare `\b0*N\b`. Release names are dense with
 * numbers that are not episode numbers — resolutions, years, season numbers,
 * group names, CRC32 tags — and a loose match hands the user episode 8 of the
 * wrong season with no way to notice. Only the conventions release groups
 * actually use to write an episode number are accepted:
 *
 *   `Title - 07`, `Title - 07v2`, `E07`, `EP 07`, `Episode 07`, `S01E07`,
 *   `[07]`, `(07)`, `_07_`
 */
export function releaseCoversEpisode(name: string, number: number): boolean {
  if (!Number.isInteger(number) || number < 0) return false;
  // `(?!\d)` stops `20` matching inside `205`. The second lookahead is narrower
  // than it looks: it rejects a *fractional* episode (`- 2.5` is not episode 2)
  // while still admitting a dot that begins a suffix. Rejecting every following
  // dot — which is what this used to do — also rejected every subtitle file
  // name, because `Show - 20.ja.srt` puts the extension straight against the
  // number where a torrent name would have a space or a bracket.
  const digits = `0*${number}(?:v\\d+)?(?!\\d)(?!\\.\\d)`;
  const patterns = [
    // `S01E07` first: it also satisfies the bare-`E07` rule, and matching it
    // here keeps the intent readable.
    `s\\d{1,2}[\\s._-]*e${digits}`,
    `(?:^|[\\s._\\-[(])(?:e|ep|episode)[\\s._-]*${digits}`,
    `[-–—][\\s._]*${digits}`,
    `\\[${digits}\\]`,
    `_${digits}_`,
  ];
  // A parenthesised number is an episode number for long-runners that pass
  // 999 — but `(2023)` on almost every release is the year. Square brackets
  // carry no such ambiguity, which is why they are matched unconditionally
  // above and parentheses are not.
  if (number < 1_900 || number > 2_099) patterns.push(`\\(${digits}\\)`);
  // Full-width digits folded, and CRC32 / resolution / codec tags blanked first:
  // `Show - 05 [E9ED99BE]` must not read as episode 9 through the `E` rule.
  const text = maskReleaseNoise(foldReleaseWidth((name ?? '').normalize('NFKC')));
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(text))
    || releaseMarkerIsEpisode(name ?? '', number);
}

/**
 * Whether a release name numbers an episode at all.
 *
 * The same shapes `releaseCoversEpisode` reads, asked without a target number.
 * A one-episode title has nothing to number, so its releases say things like
 * `Kurumi Star Festival OVA [10bit BD 720p]` — and a planner that insists on an
 * episode match can never cover it. This is how that case is told apart from a
 * release that names *some other* episode, which must still not be offered.
 *
 * Deliberately not written as "no digits anywhere": resolutions, bit depths,
 * years and CRC32 tags are all digits, and every real release carries several.
 */
export function namesAnyEpisode(name: string): boolean {
  // Stricter on the trailing edge than `releaseCoversEpisode`, which may end a
  // number against a letter. Without that, the CRC32 tag `[E9ED99BE]` reads as
  // "episode 9" — `[` opens, `E` is the `e` marker, `9` is the number — and
  // every release carrying a checksum would look numbered.
  const digits = String.raw`\d{1,3}(?:v\d+)?(?![\dA-Za-z])(?!\.\d)`;
  const patterns = [
    String.raw`s\d{1,2}[\s._-]*e${digits}`,
    String.raw`(?:^|[\s._\-[(])(?:e|ep|episode)[\s._-]*${digits}`,
    String.raw`[-–—][\s._]*${digits}`,
    String.raw`\[${digits}\]`,
    String.raw`_${digits}_`,
  ];
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(name ?? ''));
}

/** A release, as far as the planner cares. `TorrentRow` satisfies this. */
export type MalRelease = AcquisitionTorrentCandidate;

export interface MalReleaseMatch {
  unit: MalDownloadUnit;
  release: MalRelease | null;
  /** The release is a batch, so it brings units beyond this one. */
  viaBatch: boolean;
}

export interface MalReleasePlan {
  matches: MalReleaseMatch[];
  /** What to actually send, deduplicated — a batch is sent once, not per unit. */
  releases: MalRelease[];
  covered: number;
  missing: MalDownloadUnit[];
  /** Set when one batch covers every selected unit on its own. */
  batch: MalRelease | null;
}

export interface MalReleasePlanOptions {
  /** e.g. `1080p`. A matching release wins over a higher-seeded mismatch. */
  preferredResolution?: string;
  /**
   * Take a single batch over per-episode releases when one covers everything.
   * Fewer torrents, one seeding swarm — but it also fetches units outside the
   * selection, so it is a choice rather than a default.
   */
  preferBatches?: boolean;
  /**
   * The catalogue lists exactly one unit for this title — an OVA, a movie, a
   * special.
   *
   * Such a release has no episode number to carry, so requiring one made every
   * one of them uncoverable: measured live on `Date A Live II: Kurumi Star
   * Festival`, where the index returned 2 releases and the plan reported
   * "0 of 1 covered · 0 torrents" with the send button disabled.
   *
   * It is an option rather than `units.length === 1` because those are
   * different facts. Hand-picking episode 7 of a 26-episode show also selects
   * one unit, and there an unnumbered release is a season pack or the wrong
   * thing — never episode 7. Only the caller knows which case it is in.
   */
  singleUnitTitle?: boolean;
  /**
   * The entry's season (`MalDownloadTarget.seasonNumber`). A release that names
   * another season (`S01E05` when this is season 2) is refused; one that names
   * none may still match by the unit's absolute number.
   */
  seasonNumber?: number | null;
}

/**
 * Display order for a release picker: preferred resolution first, then seeders.
 *
 * Exported because manga takes a different route to the same torrents. A raw
 * Japanese volume is published as a volume or a whole-series archive, not as
 * numbered chapters, so there is nothing for `planMalReleases` to match against
 * — the user picks releases directly, and this is the order they see them in.
 */
// Generic so a caller holding richer rows — the Scraper's `TorrentRow`, which
// satisfies `MalRelease` structurally — gets those rows back rather than the
// narrowed base type.
export function rankMalReleases<T extends MalRelease>(
  releases: readonly T[],
  options: MalReleasePlanOptions = {},
): T[] {
  return rankReleases(releases, options.preferredResolution ?? '');
}

/** Substring filter over the picker's list. Case- and whitespace-insensitive. */
export function filterMalReleases<T extends MalRelease>(
  releases: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...releases];
  const terms = needle.split(/\s+/);
  return releases.filter((release) => {
    const haystack = `${release.name} ${release.releaseGroup}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function rankReleases<T extends MalRelease>(
  releases: readonly T[],
  preferredResolution: string,
): T[] {
  const wanted = preferredResolution.trim().toLowerCase();
  return [...releases].sort((a, b) => {
    if (wanted) {
      const aMatch = a.resolution.toLowerCase() === wanted ? 1 : 0;
      const bMatch = b.resolution.toLowerCase() === wanted ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
    }
    if (b.seeders !== a.seeders) return b.seeders - a.seeders;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Works out which release fetches each selected unit.
 *
 * Single-episode releases are preferred over batches: a batch that happens to
 * contain the one episode the user asked for still downloads twenty-five more.
 * A batch is used where nothing else covers the unit, and reported as such so
 * the dialog can say so before anything is sent.
 */
export function planMalReleases(
  units: readonly MalDownloadUnit[],
  releases: readonly MalRelease[],
  options: MalReleasePlanOptions = {},
): MalReleasePlan {
  const preferred = options.preferredResolution ?? '';
  const ranked = rankReleases(releases, preferred);
  const batches = ranked.filter((release) => release.isBatch);
  const singles = ranked.filter((release) => !release.isBatch);
  const ordered = sortMalUnits(units);

  // A batch covers the whole selection only when it covers *every* unit in it —
  // a batch named `01-12` says nothing about episode 20.
  //
  // The two ways a batch can cover a unit are checked per unit rather than per
  // batch. Asking `every(byName) || every(byRange)` instead rejects the very
  // common release that names some episodes outright and leaves the rest to its
  // declared range, because it satisfies neither test on its own.
  const season = options.seasonNumber ?? null;
  const coversUnit = (batch: MalRelease, unit: MalDownloadUnit): boolean =>
    releaseCoversUnit(batch.name, unit, season) || batchRangeCoversUnit(batch.name, unit, season);

  const wholeBatch = ordered.length > 0
    ? batches.find((batch) => ordered.every((unit) => coversUnit(batch, unit))) ?? null
    : null;

  const useBatch = Boolean(options.preferBatches && wholeBatch);

  // A one-episode title's release numbers nothing, because there is nothing to
  // number. Accepted only for the title's own single unit, and only when the
  // name numbers no episode at all — a release calling itself `- 05` is still
  // refused, so this widens the match without loosening it.
  const soleUnit = Boolean(options.singleUnitTitle) && ordered.length === 1;
  const unnumbered = (release: MalRelease): boolean => soleUnit && !namesAnyEpisode(release.name);

  const matches = ordered.map((unit): MalReleaseMatch => {
    if (useBatch && wholeBatch) return { unit, release: wholeBatch, viaBatch: true };
    // A release that names the episode outright wins over an unnumbered one
    // even when the unnumbered one ranks higher, so the widened match is a
    // fallback rather than a reordering of the list the user would expect.
    const single = singles.find((release) => releaseCoversUnit(release.name, unit, season))
      ?? singles.find(unnumbered);
    if (single) return { unit, release: single, viaBatch: false };
    const batch = batches.find((release) => coversUnit(release, unit)) ?? batches.find(unnumbered);
    return { unit, release: batch ?? null, viaBatch: Boolean(batch) };
  });

  const releasesById = new Map<string, MalRelease>();
  for (const match of matches) {
    if (match.release) releasesById.set(match.release.id, match.release);
  }

  return {
    matches,
    releases: [...releasesById.values()],
    covered: matches.filter((match) => match.release).length,
    missing: matches.filter((match) => !match.release).map((match) => match.unit),
    batch: wholeBatch,
  };
}

/**
 * Whether a batch's own name declares a range that contains `number`.
 *
 * `[Group] Title (01-12) [1080p]` covers episode 7 without the digits `07`
 * appearing anywhere in it, which is exactly the case a per-episode match
 * misses. Bounded to three digits for the same reason `looksLikeBatch` is: so a
 * `1920-1080` dimension pair cannot read as an episode range.
 */
export function coveredByBatchRange(name: string, number: number): boolean {
  const pattern = /(?:^|[\s._\-[(])(?:e|ep|episode)?\s?(\d{1,3})\s*[-~]\s*(?:e|ep)?\s?(\d{1,3})(?![\d.])/gi;
  for (const match of (name ?? '').matchAll(pattern)) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) continue;
    if (number >= low && number <= high) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Seasons and absolute numbering
// ---------------------------------------------------------------------------
//
// MyAnimeList and AniList give every season (often every cour) its own entry,
// numbered from 1. Release groups do not agree: SubsPlease writes
// `Show S2 - 05`, Erai-raws `Show 2nd Season - 05`, BD groups `S02E05`, and
// long-runners plus some groups count from the series' first episode
// (`Show - 30`). An entry therefore carries the season its titles name and the
// episodes of the TV seasons before it, and a unit matches a release by
// whichever of its numbers that release uses — but never a release that names
// a different season.

const KANJI_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

function kanjiNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (text === '十') return 10;
  if (text.length === 2 && text[0] === '十') return 10 + (KANJI_DIGITS[text[1]] ?? 0);
  return KANJI_DIGITS[text] ?? null;
}

const sane = (n: number | null): number | null => (n !== null && Number.isInteger(n) && n >= 1 && n <= 30 ? n : null);

/**
 * The season a catalogue title names: `Season 2`, `2nd Season`, `S2`,
 * `第2期` / `第二期`, a trailing `II`/`III`. `null` when it names none ("Final
 * Season" and "Part 2" name no number of their own).
 */
export function inferSeasonNumber(...titles: readonly string[]): number | null {
  for (const raw of titles) {
    const title = String(raw ?? '').normalize('NFKC');
    if (!title.trim()) continue;
    const patterns: RegExp[] = [
      /\bseason\s*(\d{1,2})\b/i,
      /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i,
      /(?:^|[\s:])S(\d{1,2})(?=$|[\s:)\]-])/,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(title);
      const n = sane(m ? Number(m[1]) : null);
      if (n) return n;
    }
    const kanji = /第\s*([0-9一二三四五六七八九十]{1,3})\s*期/.exec(title);
    if (kanji) {
      const n = sane(kanjiNumber(kanji[1]));
      if (n) return n;
    }
    // A trailing roman numeral, unless it is a part (`Part II`) or a cour.
    const roman = /(?:^|\s)(II|III|IV|V|VI|VII|VIII)\s*$/.exec(title.replace(/[:\s]+$/, ''));
    if (roman && !/\b(?:part|cour)\s+(?:II|III|IV|V|VI|VII|VIII)\s*$/i.test(title)) {
      const n = sane(ROMAN[roman[1]] ?? null);
      if (n) return n;
    }
  }
  return null;
}

/**
 * The season a RELEASE name says it is: `S02E05`, `S2 - 05`, `Season 2`,
 * `2nd Season`, `第2期`. `null` when it names none. Resolution, codec and CRC32
 * tags are blanked first, so `[S1A2B3C4]` is no season.
 */
export function releaseSeasonNumber(name: string): number | null {
  const text = maskReleaseNoise(foldReleaseWidth(String(name ?? '').normalize('NFKC')));
  const patterns: RegExp[] = [
    /\bS(\d{1,2})[\s._-]*E\d/i,
    /(?:^|[\s._\-[(])S(\d{1,2})(?=$|[\s._\-\])])/i,
    /\b(\d{1,2})(?:st|nd|rd|th)[\s._-]+season\b/i,
    // No hyphen between: `2nd Season - 05` is episode 5 of season 2, not season 5.
    /\bseason[\s._]*(\d{1,2})\b/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    const n = sane(m ? Number(m[1]) : null);
    if (n) return n;
  }
  const kanji = /第\s*([0-9一二三四五六七八九十]{1,3})\s*期/.exec(text);
  return kanji ? sane(kanjiNumber(kanji[1])) : null;
}

/** One earlier entry in the prequel chain, nearest first. */
export interface MalPrequelEntry {
  /** The catalogue's format: `TV`, `TV_SHORT`, `MOVIE`, `OVA`, `ONA`, `SPECIAL`… */
  format: string;
  /** Declared episodes; 0 = unknown (still airing). */
  episodes: number;
  titles: readonly string[];
}

export interface MalSeasonMapping {
  seasonNumber: number | null;
  /** Episodes of earlier parts of this same season (a split cour), else 0. */
  seasonOffset: number;
  /** Episodes of every earlier TV entry; null when one of them has no count, or the chain is incomplete. */
  absoluteOffset: number | null;
}

const isTvFormat = (format: string): boolean => /^(tv|tv_short|tv short)$/i.test(String(format ?? '').trim());

/**
 * What an entry's titles and prequel chain say about its numbering.
 *
 * Only TV entries count toward the absolute number: a movie or an OVA between
 * two seasons is not in the episode count release groups use. The season comes
 * from the entry's own titles; without one, an entry with no earlier TV entry is
 * season 1 and anything else is unknown (`null`) — a season count from the
 * chain would call "Season 3 Part 2" season 4.
 */
export function mapSeasonEpisodes(
  targetTitles: readonly string[],
  prequels: readonly MalPrequelEntry[],
  chainComplete = true,
): MalSeasonMapping {
  const tv = prequels.filter((p) => isTvFormat(p.format));
  const named = inferSeasonNumber(...targetTitles);
  const seasonNumber = named ?? (chainComplete && tv.length === 0 ? 1 : null);
  let absoluteOffset: number | null = chainComplete ? 0 : null;
  if (absoluteOffset !== null) {
    for (const entry of tv) {
      const n = Math.trunc(Number(entry.episodes));
      if (!Number.isFinite(n) || n <= 0) {
        absoluteOffset = null;
        break;
      }
      absoluteOffset += n;
    }
  }
  // The nearest TV entries that name the SAME season are earlier cours of it.
  let seasonOffset = 0;
  if (seasonNumber !== null && seasonNumber > 0) {
    for (const entry of tv) {
      if (inferSeasonNumber(...entry.titles) !== seasonNumber) break;
      const n = Math.trunc(Number(entry.episodes));
      if (!Number.isFinite(n) || n <= 0) {
        seasonOffset = 0;
        break;
      }
      seasonOffset += n;
    }
  }
  return { seasonNumber, seasonOffset, absoluteOffset };
}

/** A unit's alternative numbers under a mapping (only the ones that differ from `number`). */
export function withSeasonNumbers(unit: MalDownloadUnit, mapping: MalSeasonMapping): MalDownloadUnit {
  if (!Number.isInteger(unit.number) || unit.number < 0) return unit;
  const absolute = mapping.absoluteOffset && mapping.absoluteOffset > 0 ? unit.number + mapping.absoluteOffset : undefined;
  const seasonEpisode = mapping.seasonOffset > 0 ? unit.number + mapping.seasonOffset : undefined;
  return {
    ...unit,
    ...(absolute !== undefined ? { absoluteNumber: absolute } : {}),
    ...(seasonEpisode !== undefined ? { seasonEpisode } : {}),
  };
}

/** A release that numbers by part names it (`Part 2`, `Cour 2`, `第2クール`). */
const PART_MARKER = /\b(?:part|cour)[\s._-]*\d|第\s*\d+\s*クール/i;

/**
 * Whether a release name carries one unit, by whichever numbering it uses.
 *
 * With no season and no alternative numbers this is exactly
 * `releaseCoversEpisode(name, unit.number)`. Otherwise:
 *
 * - a release naming ANOTHER season is refused outright;
 * - a release naming THIS season matches the season-relative number — for a
 *   later cour (`seasonEpisode`), `S03E13`; the cour-relative `number` only
 *   when the release says which part it is;
 * - a release naming no season matches `number` (as before) or the absolute
 *   number (`Show - 30` for season 2 episode 5 of a 25-episode first season).
 */
export function releaseCoversUnit(name: string, unit: MalDownloadUnit, seasonNumber?: number | null): boolean {
  const relSeason = releaseSeasonNumber(name);
  if (relSeason !== null && seasonNumber != null && relSeason !== seasonNumber) return false;
  if (relSeason !== null && unit.seasonEpisode !== undefined) {
    if (releaseCoversEpisode(name, unit.seasonEpisode)) return true;
    return PART_MARKER.test(name) && releaseCoversEpisode(name, unit.number);
  }
  if (releaseCoversEpisode(name, unit.number)) return true;
  if (relSeason === null && unit.absoluteNumber !== undefined && releaseCoversEpisode(name, unit.absoluteNumber)) return true;
  return false;
}

/** `coveredByBatchRange`, unit-aware in the same way as `releaseCoversUnit`. */
export function batchRangeCoversUnit(name: string, unit: MalDownloadUnit, seasonNumber?: number | null): boolean {
  const relSeason = releaseSeasonNumber(name);
  if (relSeason !== null && seasonNumber != null && relSeason !== seasonNumber) return false;
  if (relSeason !== null && unit.seasonEpisode !== undefined) {
    return coveredByBatchRange(name, unit.seasonEpisode) || (PART_MARKER.test(name) && coveredByBatchRange(name, unit.number));
  }
  if (coveredByBatchRange(name, unit.number)) return true;
  return relSeason === null && unit.absoluteNumber !== undefined && coveredByBatchRange(name, unit.absoluteNumber);
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

export interface MalUnitsInput {
  contentType: AcquisitionContentType;
  provider: DiscoveryProviderId;
  id: number;
  /**
   * What the caller already knows about the title (the library or the search result),
   * used when the catalogue does not answer: a placeholder episode list from a known
   * count beats a dead end.
   */
  known?: { title: string; nativeTitle?: string; posterUrl?: string; episodeCount?: number };
}

/**
 * `MalUnitsResult.note` when the catalogue did not answer the id lookup (rate limit,
 * 5xx, offline). A code, not a sentence: the renderer says it in the UI language.
 */
export const MAL_UNITS_CATALOGUE_BUSY = 'catalogue-busy';

export interface MalUnitsResult {
  target: MalDownloadTarget;
  units: MalDownloadUnit[];
  /** Which catalogue answered, for the dialog's provenance line. */
  servedBy: string;
  /**
   * Set when the catalogue answered but listed nothing. Distinct from a failure:
   * an unaired series genuinely has no episodes yet, and saying "no episodes are
   * listed" is honest where "lookup failed" would not be.
   */
  note: string;
}
