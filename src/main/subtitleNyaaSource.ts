// Subtitles out of a nyaa release, without downloading the video.
//
// Jimaku covers a lot of anime and not all of it. When it misses, the subtitle
// usually does exist inside a release on the index — and the whole design
// problem is getting at it without pulling 1.4 GB of video to obtain 60 KB of
// text. Two routes do that, cheapest first:
//
//   A  sub-pack       the release is subtitles and nothing else, a few hundred
//                     KB, so it is taken whole.
//   B  batch-sidecar  the release is a batch with sidecar subtitle files, so
//                     per-file priorities fetch those files and skip the video.
//
// A single-file MKV with an embedded track is deliberately **not** a route: the
// track is interleaved through the container, so there is no subset to ask for
// and wanting it means wanting the episode. That case is refused rather than
// quietly degraded — see `couldCarrySidecarSubtitles`. When the user already
// has the file, the `embedded` provider already extracts from it for free, and
// that is the right answer there.
//
// This app has no BitTorrent engine and does not gain one here: `torrents.ts`
// reads an index and builds magnets, and qBittorrent is what touches a swarm.
// So acquisition drives the user's qBittorrent through the client next door,
// and everything this provider adds to it is tagged `jp-study-subtitles` and
// left in place — the app does not delete from someone else's torrent client.
//
// Two consequences that shape the API below:
//
//   * qBittorrent may be configured on another machine, in which case its save
//     path cannot be read from here and no subtitle can ever be collected. That
//     is checked up front and reported as its own state, not as "no results".
//   * Scraper settings live in the renderer (per profile, by design), so this
//     provider is *told* its configuration per request. The auto-discover sweep
//     in `media.ts` passes none, which is deliberate: adding torrents to
//     someone's client and waiting on a swarm is not something that should
//     happen unattended on media import.

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { SubtitleRecordFormat } from '../shared/subtitleRecord';
import {
  buildSubtitleQuery,
  episodeFromFileName,
  languageFromFileName,
  looksJapaneseSubtitle,
  rankSubtitleCandidates,
  selectSubtitleFiles,
  type NyaaAcquisitionConfig,
  type NyaaSelectionReason,
  type NyaaSubtitleCandidate,
} from '../shared/subtitleNyaa';

export type { NyaaAcquisitionConfig };
import { searchTorrents } from './scraper/torrents';
import {
  qbitAddStopped,
  qbitAwaitFiles,
  qbitAwaitMetadata,
  qbitReapSubtitleOrphans,
  qbitSetFilePriorities,
  qbitStart,
  qbitTorrentInfo,
  QBIT_PRIO_NORMAL,
  QBIT_PRIO_SKIP,
} from './scraper/qbittorrent';
import { scraperLog } from './scraper/logBus';
import type { ProviderSubtitleCandidate } from './subtitleProviderClients';

/** How long to wait for a subtitle fetch before giving up on the swarm. */
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How long to wait for a magnet's file list.
 *
 * Much shorter than the fetch timeout because it is a different question: this
 * is "does anyone in this swarm answer at all", and a swarm that answers takes
 * seconds — the real 3-seeder release used to develop this returned 26 files in
 * 4 s. A minute is generous; a swarm silent for a minute has nothing to send.
 */
const METADATA_TIMEOUT_MS = 60_000;

/** Cap on how much text is read back, so a mislabelled `.ass` cannot blow up main. */
const MAX_SUBTITLE_BYTES = 8 * 1024 * 1024;

/**
 * Info hashes this process is acquiring right now.
 *
 * Read only by the orphan sweep, which cannot otherwise tell a torrent an
 * earlier run abandoned from one a concurrent fetch is halfway through — both
 * sit in `jp-study-subtitles` looking identical. Empty on a fresh start, which
 * is exactly right: after a crash, everything in that category is abandoned.
 */
const inFlight = new Set<string>();

const SEARCH_TIMEOUT_MS = 20_000;

/**
 * Minimum gap between index searches, in ms.
 *
 * Explicit because this is not a scrape job. `scraperRequest`'s whole safety
 * half — per-host pacing and the failure breaker — only engages inside a
 * runtime scope (`main/scraper/http.ts:580-581` returns the unpoliced path when
 * `currentScraperRuntime()` is null), and subtitle discovery runs outside one.
 * So nothing else paces these: a sweep over a 24-episode season would otherwise
 * fire 24 searches at a community-run index as fast as the event loop allows,
 * which is the behaviour that gets an IP blocked.
 *
 * Entering a runtime scope per search would not fix it — `scraperRuntimeFor`
 * builds a fresh `HostGovernor` each time, so every search would pace against
 * an empty history and none against each other. Same reasoning, and the same
 * remedy, as `subtitleHarvest.ts`.
 */
const SEARCH_PACING_MS = 1_000;

let lastSearchAt = 0;

async function paceSearch(): Promise<void> {
  const wait = lastSearchAt + SEARCH_PACING_MS - Date.now();
  if (wait > 0) await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
  lastSearchAt = Date.now();
}

/** Test seam — lets a suite run searches back to back without waiting. */
export function resetNyaaSearchPacing(): void {
  lastSearchAt = 0;
}

export type NyaaAvailability =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'no-indexer' | 'qbit-disabled' | 'qbit-remote'; detail: string };

/**
 * Whether this provider can do anything at all right now.
 *
 * Checked before searching so a misconfiguration reports itself instead of
 * looking like a title with no subtitles available. `qbit-remote` is the one
 * worth calling out: the connection can be perfectly healthy and the fetch
 * still impossible, because completed files land on a disk this process cannot
 * see.
 */
export async function nyaaAvailability(config?: NyaaAcquisitionConfig): Promise<NyaaAvailability> {
  if (!config) {
    return { ok: false, reason: 'not-configured', detail: 'No scraper configuration was supplied.' };
  }
  const indexers = (config.indexers ?? []).filter((entry) => entry.enabled && entry.kind === 'torrent');
  if (!indexers.length) {
    return { ok: false, reason: 'no-indexer', detail: 'No torrent index is enabled in this profile.' };
  }
  if (!config.qbittorrent?.enabled) {
    return {
      ok: false,
      reason: 'qbit-disabled',
      detail: 'Fetching a subtitle from a torrent needs qBittorrent, which is turned off.',
    };
  }
  const savePath = config.qbittorrent.savePath?.trim();
  if (savePath) {
    // A configured save path that this machine cannot read means qBittorrent is
    // running elsewhere. Better to say so now than after a five-minute download
    // that completes into a directory we cannot open.
    try {
      await fsp.access(savePath);
    } catch {
      return {
        ok: false,
        reason: 'qbit-remote',
        detail: `qBittorrent saves to "${savePath}", which is not readable from this machine.`,
      };
    }
  }
  return { ok: true };
}

// ------------------------------------------------------------------- search ---

interface NyaaFetchToken {
  infoHash: string;
  magnet: string;
  route: NyaaSubtitleCandidate['route'];
  episode: number | null;
  languages: string[];
}

function encodeToken(token: NyaaFetchToken): string {
  return JSON.stringify(token);
}

function decodeToken(raw: string): NyaaFetchToken | null {
  try {
    const parsed = JSON.parse(raw) as NyaaFetchToken;
    return parsed?.infoHash && parsed?.magnet ? parsed : null;
  } catch {
    return null;
  }
}

export interface NyaaSearchInput {
  config: NyaaAcquisitionConfig;
  title: string;
  season: number | null;
  episode: number | null;
  /** Languages discovery still needs. */
  languages: string[];
  /**
   * How many episodes this search is meant to answer at once.
   *
   * Only a range harvest sets it. Discovery asks per episode and leaves it
   * unset, which is what keeps a single episode's sidecar a valid answer there.
   */
  episodeCount?: number | null;
}

/**
 * A candidate, plus what the chooser needs to show.
 *
 * Extends the shape discovery scores rather than replacing it, so the same
 * object serves both the automatic loop and the manual list without a second
 * mapping that could disagree with the first. The extra fields exist because
 * this provider is manual-only: a user picking between releases needs the size
 * and the swarm health, which a curated provider's candidate never has to
 * carry.
 */
export interface NyaaProviderCandidate extends ProviderSubtitleCandidate {
  providerId: 'nyaa';
  route: NyaaSubtitleCandidate['route'];
  sizeBytes: number;
  seeders: number;
  score: number;
  reasons: string[];
}

/**
 * Searches the index and returns ranked candidates.
 *
 * The format is a guess at this stage and says so: the RSS feed lists no file
 * names, so what is actually inside a release is unknown until the torrent's
 * metadata arrives. `nyaaFetch` returns the real format alongside the text and
 * the caller uses that — a record written with the wrong extension is a track
 * that exists and cannot be parsed.
 */
export async function nyaaSearch(input: NyaaSearchInput): Promise<NyaaProviderCandidate[]> {
  const available = await nyaaAvailability(input.config);
  if (!available.ok) {
    scraperLog('info', 'torrents', `Subtitle search skipped: ${available.detail}`);
    return [];
  }

  await paceSearch();
  const rows = await searchTorrents({
    query: buildSubtitleQuery({ title: input.title, episode: input.episode }),
    indexers: input.config.indexers,
    torrents: {
      ...input.config.torrents,
      // The provider's own gates decide what is fetchable; the profile's
      // "require subtitles" filter would drop sub-only packs, which routinely
      // advertise no language in the release name at all.
      requireSubtitles: false,
      // Size is gated per-route by `looksLikeSubtitleOnly`, which is stricter
      // than any profile value and must not be loosened by one.
      maxSizeMb: 0,
    },
    timeoutMs: SEARCH_TIMEOUT_MS,
  });

  const ranked = rankSubtitleCandidates(rows, {
    languages: input.languages,
    preferredGroups: input.config.torrents.preferredReleaseGroups,
    minSeeders: input.config.torrents.minSeeders,
    // The index matched this query, not this title. Without the title here the
    // listing offers releases of other shows entirely.
    title: input.title,
    // A range request cannot be answered by one episode's cue file, and with
    // `episode: null` the query itself cannot tell the two apart.
    episodeCount: input.episodeCount,
  });

  return ranked.map((candidate) => ({
    providerId: 'nyaa' as const,
    // The info hash is the one stable id a release has across indexes.
    providerItemId: `nyaa:${candidate.row.infoHash || candidate.row.id}`,
    language: candidate.languages[0] ?? (input.languages[0] ?? ''),
    // Provisional; corrected by the fetch. `.ass` is what Japanese fansub packs
    // overwhelmingly ship.
    format: 'ass' as SubtitleRecordFormat,
    releaseName: candidate.row.name,
    season: input.season,
    episode: input.episode,
    releaseGroup: candidate.row.releaseGroup || null,
    hearingImpaired: false,
    // Nothing here is hash-matched against the user's file; a torrent-sourced
    // subtitle is a name match and must not claim otherwise.
    hashMatch: false,
    downloads: candidate.row.seeders,
    fetchToken: encodeToken({
      infoHash: candidate.row.infoHash,
      magnet: candidate.row.magnet,
      route: candidate.route,
      episode: input.episode,
      languages: input.languages,
    }),
    route: candidate.route,
    sizeBytes: candidate.row.sizeBytes,
    seeders: candidate.row.seeders,
    score: candidate.score,
    reasons: candidate.reasons,
  }));
}

// ---------------------------------------------------------------- catalogue ---
//
// Candidates offered to the user, held so an accept can name one by id without
// re-searching the index. Same shape and same reasoning as
// `subtitleHarvest.ts`: bounded and FIFO, because a session that browses many
// shows must not grow this without limit, and the only thing lost to eviction
// is the ability to accept from a listing the user has long since left.

const catalogue = new Map<string, ProviderSubtitleCandidate>();
const CATALOGUE_LIMIT = 2_000;

export function rememberNyaaCandidates(candidates: readonly ProviderSubtitleCandidate[]): void {
  for (const candidate of candidates) catalogue.set(candidate.providerItemId, candidate);
  if (catalogue.size <= CATALOGUE_LIMIT) return;
  for (const key of [...catalogue.keys()].slice(0, catalogue.size - CATALOGUE_LIMIT)) {
    catalogue.delete(key);
  }
}

export function takeRememberedNyaaCandidate(id: string): ProviderSubtitleCandidate | null {
  return catalogue.get(id) ?? null;
}

/** Test seam — drops the session listing. */
export function resetNyaaCatalogue(): void {
  catalogue.clear();
}

// -------------------------------------------------------------------- fetch ---

export interface NyaaFetchResult {
  text: string;
  format: SubtitleRecordFormat;
  /** File actually taken, for the record label. */
  fileName: string;
}

export type NyaaFetchOutcome =
  | { ok: true; value: NyaaFetchResult }
  | { ok: false; reason: string };

/**
 * One subtitle file out of a release, with the episode its name states.
 *
 * The episode is parsed here rather than by the caller because the file names
 * are the only place a sub-pack says which episode is which, and
 * `episodeFromFileName` is already the one parser for that — a second one would
 * drift from it the first time a release group changed its naming.
 */
export interface NyaaFetchedFile extends NyaaFetchResult {
  /** `null` when the name states no episode, e.g. a movie or a single file. */
  episode: number | null;
}

/**
 * Every readable subtitle file the release turned out to hold.
 *
 * Exists because the two callers want different amounts of the same
 * acquisition. Discovery matches one local video file, so one subtitle is the
 * whole answer; a catalogue harvest asks for an episode *range*, and a sub-pack
 * carries that range in one torrent. Fetching per episode would mean re-adding
 * the same torrent once per episode — so the acquisition runs once and both
 * callers read from its result.
 */
export type NyaaFetchAllOutcome =
  | { ok: true; files: NyaaFetchedFile[] }
  | { ok: false; reason: string };

/** Shared by both fetch shapes, so they cannot drift into two wordings. */
const NOTHING_READABLE = 'The subtitle files finished downloading but could not be read from disk.';

/**
 * The release turned out to be in another language.
 *
 * Its own state rather than an empty result, because the two are acted on
 * differently: "nothing readable" means retry, and this means pick a different
 * release. It carries the count so the user can see the download was real.
 */
const notJapaneseReason = (files: number): string =>
  `This release's subtitles are not Japanese — ${files} file(s) downloaded and none carry Japanese text.`;

const SELECTION_MESSAGES: Record<NyaaSelectionReason, string> = {
  'ok': '',
  'bitmap-only': 'This release only has image-based subtitles, which cannot be read as text.',
  'no-subtitles': 'This release contains no subtitle files.',
  'no-episode-match': 'This release has subtitles, but none for the episode requested.',
};

async function readSubtitleFile(savePath: string, torrentName: string, fileName: string): Promise<string | null> {
  // qBittorrent reports the save path of the torrent and file names relative to
  // it. With `contentLayout=Original` a multi-file torrent nests under its own
  // name, and the file list already carries that prefix — so joining both would
  // double it. Try the direct join first and fall back to the nested one.
  const candidates = [
    path.join(savePath, fileName),
    path.join(savePath, torrentName, fileName),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fsp.stat(candidate);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_SUBTITLE_BYTES) return null;
      return await fsp.readFile(candidate, 'utf-8');
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/**
 * Acquires one candidate and returns its text.
 *
 * The single-file view of `nyaaFetchAll`, for the discovery path: one local
 * video file takes one subtitle record, and a record has one path and one
 * format. Kept as its own export rather than making every caller index `[0]`,
 * because "the first readable file" is a decision — the selection is already
 * ordered largest-first within the dominant format — and it belongs here next
 * to the ordering rather than at each call site.
 */
export async function nyaaFetch(
  candidate: ProviderSubtitleCandidate,
  config: NyaaAcquisitionConfig,
  options: { isCancelled?: () => boolean; timeoutMs?: number } = {},
): Promise<NyaaFetchOutcome> {
  const outcome = await nyaaFetchAll(candidate, config, options);
  if (!outcome.ok) return outcome;
  const [first] = outcome.files;
  // Unreachable through `acquireAll`, which refuses rather than returning an
  // empty list — asserted here so a later change there cannot turn a silent
  // empty into a candidate that claims success with no text.
  if (!first) return { ok: false, reason: NOTHING_READABLE };
  return { ok: true, value: { text: first.text, format: first.format, fileName: first.fileName } };
}

/**
 * Acquires one candidate and returns every subtitle file it holds.
 *
 * The sequence is the same for both routes and only the priority step differs:
 * add stopped, learn what is inside, choose, start, wait, read. Adding stopped
 * first is what makes the choice possible at all — a torrent added running has
 * already begun fetching video by the time its file list is known.
 */
export async function nyaaFetchAll(
  candidate: ProviderSubtitleCandidate,
  config: NyaaAcquisitionConfig,
  options: { isCancelled?: () => boolean; timeoutMs?: number } = {},
): Promise<NyaaFetchAllOutcome> {
  const available = await nyaaAvailability(config);
  if (!available.ok) return { ok: false, reason: available.detail };

  const token = decodeToken(candidate.fetchToken);
  if (!token) return { ok: false, reason: 'This candidate has no usable magnet link.' };

  const qbit = { config: config.qbittorrent };
  const hash = token.infoHash.toLowerCase();

  // Before adding, not after: an acquisition is the only moment this provider
  // holds a qBittorrent config at all (see the header — settings live in the
  // renderer and arrive per request), so there is no app-startup hook that
  // could sweep instead, and sweeping here keeps the app from phoning someone's
  // torrent client on every launch. `hash` is held out because the sweep runs
  // inside the acquisition that is about to use it.
  inFlight.add(hash);
  try {
    const reaped = await qbitReapSubtitleOrphans(qbit, inFlight);
    if (reaped.ok && reaped.value.length) {
      scraperLog(
        'info',
        'torrents',
        `Cleared ${reaped.value.length} subtitle fetch(es) an earlier run left behind.`,
      );
    }
    return await acquireAll(candidate, config, options, qbit, token, hash);
  } finally {
    inFlight.delete(hash);
  }
}

/** The body of `nyaaFetchAll`, so the in-flight bookkeeping has one exit. */
async function acquireAll(
  candidate: ProviderSubtitleCandidate,
  config: NyaaAcquisitionConfig,
  options: { isCancelled?: () => boolean; timeoutMs?: number },
  qbit: { config: NyaaAcquisitionConfig['qbittorrent'] },
  token: NyaaFetchToken,
  hash: string,
): Promise<NyaaFetchAllOutcome> {
  const added = await qbitAddStopped(qbit, token.magnet, hash);
  if (!added.ok) return { ok: false, reason: added.reason };
  // Only a torrent that is *someone else's* is hands-off. `adopted` is one this
  // app added and abandoned, so it is driven exactly like a fresh add — that is
  // what makes a failed fetch retryable at all.
  const preexisting = added.value === 'already-present';

  // Not `qbitFiles`: a magnet has no file list yet at this point, and reading it
  // once returned an empty array that every route then read as "no subtitles".
  const files = await qbitAwaitMetadata(qbit, hash, {
    // A phase cannot outlast the whole: a caller that hands this fetch a tighter
    // budget than a minute means the metadata wait too, not just the download.
    timeoutMs: Math.min(METADATA_TIMEOUT_MS, options.timeoutMs ?? METADATA_TIMEOUT_MS),
    isCancelled: options.isCancelled,
    stopWhenReady: !preexisting,
  });
  if (!files.ok) return { ok: false, reason: files.reason };

  const selection = selectSubtitleFiles(files.value, {
    episode: token.episode,
    languages: token.languages,
  });
  if (selection.reason !== 'ok' || !selection.format) {
    return { ok: false, reason: SELECTION_MESSAGES[selection.reason] };
  }
  const wanted = selection.files.map((file) => file.index);

  if (preexisting) {
    // The user already had this torrent. Changing its file priorities would
    // silently stop files they asked for, and they would not find out until an
    // episode turned out to be missing. Use it only if the subtitles happen to
    // be complete already.
    const ready = files.value.filter((file) => wanted.includes(file.index) && file.progress >= 1);
    if (ready.length !== wanted.length) {
      return {
        ok: false,
        reason: 'This torrent is already in qBittorrent; its file priorities were left alone.',
      };
    }
  } else {
    if (token.route === 'batch-sidecar') {
      // Route B. Everything off first, then the subtitles back on — done in
      // that order so no window exists where the video files are downloading.
      const others = files.value.map((file) => file.index).filter((index) => !wanted.includes(index));
      const skipped = await qbitSetFilePriorities(qbit, hash, others, QBIT_PRIO_SKIP);
      if (!skipped.ok) return { ok: false, reason: skipped.reason };
    }
    const enabled = await qbitSetFilePriorities(qbit, hash, wanted, QBIT_PRIO_NORMAL);
    if (!enabled.ok) return { ok: false, reason: enabled.reason };

    const started = await qbitStart(qbit, hash);
    if (!started.ok) return { ok: false, reason: started.reason };
  }

  const done = await qbitAwaitFiles(qbit, hash, wanted, {
    timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    isCancelled: options.isCancelled,
  });
  if (!done.ok) return { ok: false, reason: done.reason };

  const info = await qbitTorrentInfo(qbit, hash);
  if (!info.ok) return { ok: false, reason: info.reason };
  if (!info.value?.savePath) return { ok: false, reason: 'qBittorrent reported no save path.' };

  // `selectSubtitleFiles` already dropped any file whose *name* states a
  // language we did not ask for, and keeps the ones stating nothing. That is
  // the right policy for a name and the wrong answer for a pack that labels
  // nothing at all: MAL 92's Route A release is the official *English*
  // subtitles under names that say only the episode number, so a `ja` harvest
  // took all 47 of them. Only the text can settle it, and only once it is here.
  const wantsJapanese = (token.languages ?? []).some((lang) => lang.slice(0, 2).toLowerCase() === 'ja');
  const read: NyaaFetchedFile[] = [];
  let otherLanguage = 0;
  for (const file of selection.files) {
    const text = await readSubtitleFile(info.value.savePath, info.value.name, file.name);
    // An unreadable file is skipped rather than failing the release: a pack
    // where one of twenty-six episodes is truncated still carries twenty-five,
    // and the caller reports which episodes it got.
    if (!text || !text.trim()) continue;
    // Per file, not per release, for the same reason: a pack shipping a
    // Japanese and an English track of each episode should yield the Japanese
    // ones rather than be refused whole.
    //
    // Only unlabelled names are read. A name that states a language is an
    // explicit claim, and `selectSubtitleFiles` already trusts exactly that
    // claim to *exclude* files — having the next step overrule the same label
    // to *include* them would leave two functions disagreeing about what a name
    // is worth. The measured hole is entirely in the other branch: all 47 files
    // of MAL 92's English pack state nothing but an episode number.
    if (wantsJapanese && languageFromFileName(file.name) === null && !looksJapaneseSubtitle(text)) {
      otherLanguage += 1;
      continue;
    }
    read.push({
      text,
      format: selection.format,
      fileName: path.basename(file.name),
      episode: episodeFromFileName(file.name),
    });
  }

  if (!read.length) {
    return { ok: false, reason: otherLanguage ? notJapaneseReason(otherLanguage) : NOTHING_READABLE };
  }
  scraperLog(
    'info',
    'torrents',
    `Fetched ${read.length} subtitle file(s) from ${candidate.releaseName}.`,
  );
  return { ok: true, files: read };
}
