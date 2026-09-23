/**
 * The subtitle discovery pipeline: embedded → sidecar → providers.
 *
 * Ordered that way deliberately. The first two are instant, free, and timed
 * against the exact file the user owns; a download is a guess about which release
 * that is. So the network is only asked when local sources come up short.
 *
 * Scoring is not done here. Provider results are converted into §8 `SubtitleTrack`
 * records and handed to the existing `matchSubtitleTracks`, which already treats a
 * language/episode/season/title mismatch as a hard rejection and year/group/
 * duration as score-only. That is precisely the "never attach the wrong episode"
 * rule, already unit-tested, so this file must not re-implement it.
 *
 * Job shape follows `bookOcrJob.ts`: `running`/`cancelled` sets, a broadcast to
 * every window, cooperative cancellation, and a `finally` that always cleans up.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createEmptySubtitleQualityRatings } from '../shared/subtitleQuality';
import { matchSubtitleTracks, mismatchedAutoSubtitleIds } from '../shared/subtitleMatching';
import {
  normalizeSubtitleIdentityId,
  type SubtitleProvidersDocument,
  type SubtitleTrack,
} from '../shared/subtitleProviders';
import {
  DEFAULT_SUBTITLE_DISCOVERY_SETTINGS,
  estimateEtaMs,
  isManualOnlySubtitleProvider,
  isNetworkSubtitleProvider,
  isRemoteSubtitleProvider,
  normalizeSubtitleAttachText,
  normalizeSubtitleDiscoverySettings,
  orderedSubtitleProviders,
  planDiscoveryLanguages,
  SUBTITLE_PROVIDER_IDS,
  type NyaaSubtitleAcceptResult,
  type NyaaSubtitleListResult,
  type SubtitleDiscoveryPhase,
  type SubtitleDiscoveryProgress,
  type SubtitleDiscoveryRequest,
  type SubtitleDiscoveryResult,
  type SubtitleDiscoverySettings,
  type SubtitleProviderCredentialState,
} from '../shared/subtitleDiscoveryIpc';
import { QBIT_CANCELLED_REASON } from './scraper/qbittorrent';
import {
  isMachineTranslatedSubtitle,
  type SubtitleRecord,
  type SubtitleRecordFormat,
  type SubtitleSearchFailure,
} from '../shared/subtitleRecord';
import { pickStudySubtitle } from '../shared/subtitleDiscoveryPick';
import { parseSubtitles } from '../shared/subtitleCues';
import { shiftSubtitleText, worthShifting } from '../shared/subtitleDiscoveryTiming';
import {
  SUBTITLE_DISCOVERY_SETTINGS_FILE,
  SUBTITLE_LIBRARY_DIRECTORY,
  subtitleStorageMediaId,
} from '../shared/subtitleStorage';
import type { MediaItem } from '../shared/types';
import {
  READABLE_EXTENSIONS,
  extractEmbeddedSubtitle,
  findSidecarSubtitles,
  guessSidecarLanguage,
  listEmbeddedSubtitleStreams,
  normalizeStreamLanguage,
} from './subtitleLocalSources';
import {
  fetchSubtitleCandidateDetailed,
  hasSubtitleProviderKey,
  jimakuSearchDetailed,
  setSubtitleProviderKey,
  testSubtitleProvider,
  type ProviderSubtitleCandidate,
} from './subtitleProviderClients';
import {
  createOpenSubtitlesBatch,
  searchOpenSubtitlesForItem,
  type OpenSubtitlesBatch,
} from './subtitleDiscoveryOpenSubtitles';
import {
  noteOpenSubtitlesQuota,
  openSubtitlesQuotaActive,
  raiseSubtitleNotice,
} from './subtitleDiscoveryNotices';
import { estimateSubtitleOffset } from './subtitleSync';
import {
  emptyRankDrops,
  nyaaAvailability,
  nyaaFetch,
  nyaaSearch,
  nyaaSearchDetailed,
  rememberNyaaCandidates,
  takeRememberedNyaaCandidate,
  type NyaaAcquisitionConfig,
} from './subtitleNyaaSource';
import { harvestSearchAliases } from '../shared/subtitleHarvest';
import { storedMalFacts } from './subtitleHarvest';
import {
  NYAA_UNAVAILABLE_REASONS,
  asNyaaAcquisitionConfig,
  describeEmptyNyaaListing,
} from '../shared/subtitleNyaa';
import { providerSearchTitle } from '../shared/mediaFileIdentity';
import { resolveSeasonForEpisode } from '../shared/mediaSeasons';
import { osdbHashFile } from './osdbHash';
import { enqueueTranscription } from './transcriptionJobs';

export interface SubtitleDiscoveryHost {
  listItems: () => MediaItem[];
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
}

/**
 * Narrows the untyped `acquisition` blob off the wire.
 *
 * `SubtitleDiscoveryRequest` types it as `unknown` so that module stays a leaf
 * and does not pull the scraper's settings types into every importer of the
 * wire shapes. The structural check here is what makes that safe: anything not
 * carrying all three pieces is treated as absent, which disables the provider
 * rather than half-configuring it.
 */
function asAcquisitionConfig(input: unknown): NyaaAcquisitionConfig | undefined {
  // One definition, in shared: the harvest listing validates the same payload,
  // and two copies of this check would drift into disagreeing about what a
  // usable config is.
  return asNyaaAcquisitionConfig(input);
}

let host: SubtitleDiscoveryHost | null = null;

const running = new Set<string>();
const cancelled = new Set<string>();
let sweeping = false;
/** A library-wide sweep was asked for while one ran; run it once this one ends. */
let followUpSweep = false;

/**
 * In-process listeners: the automation queue (`subtitleDiscoveryAuto.ts`) needs to
 * know when an item is being searched and when its records changed, to keep the
 * per-item status and the persisted picks current. A listener rather than an
 * import, because that module imports this one.
 */
type DiscoveryEvent =
  | { type: 'progress'; progress: SubtitleDiscoveryProgress }
  | { type: 'records'; mediaIds: readonly string[] }
  | { type: 'idle' };
const eventListeners = new Set<(event: DiscoveryEvent) => void>();

export function onSubtitleDiscoveryEvent(listener: (event: DiscoveryEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function emitEvent(event: DiscoveryEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      /* a listener's failure must not break discovery */
    }
  }
}

function broadcast(progress: SubtitleDiscoveryProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('subtitleDiscovery:progress', progress);
  }
  emitEvent({ type: 'progress', progress });
}

/** Ids discovery is working on right now. */
export function subtitleDiscoveryActiveIds(): string[] {
  return [...running];
}

/**
 * Resolves once no sweep is running (immediately when none is), or after
 * `timeoutMs`. The on-play preparation waits on this rather than starting a
 * second search over an item the sweep may be patching at the same moment.
 */
export function whenSubtitleSweepIdle(timeoutMs = 10 * 60_000): Promise<boolean> {
  if (!sweeping) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    const stop = onSubtitleDiscoveryEvent((event) => {
      if (event.type !== 'idle') return;
      if (timer) clearTimeout(timer);
      stop();
      resolve(true);
    });
    timer = setTimeout(() => {
      stop();
      resolve(false);
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settingsPath(): string {
  return path.join(app.getPath('userData'), SUBTITLE_DISCOVERY_SETTINGS_FILE);
}

export function loadDiscoverySettings(): SubtitleDiscoverySettings {
  try {
    return normalizeSubtitleDiscoverySettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')));
  } catch {
    return { ...DEFAULT_SUBTITLE_DISCOVERY_SETTINGS };
  }
}

export function saveDiscoverySettings(input: unknown): SubtitleDiscoverySettings {
  const settings = normalizeSubtitleDiscoverySettings(input);
  // Dismissed notices only accumulate. The settings page saves its whole copy of
  // this object, and a copy read before a dismissal must not bring the notice back.
  settings.dismissedNotices = [...new Set([...loadDiscoverySettings().dismissedNotices, ...settings.dismissedNotices])];
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    /* settings that will not persist still apply to this session */
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function cacheDirFor(mediaId: string): string {
  return path.join(SUBTITLE_LIBRARY_DIRECTORY, subtitleStorageMediaId(mediaId));
}

/** Writes a cue file into the cache and returns its userData-relative path. */
export function writeSubtitleFile(mediaId: string, name: string, text: string): string | null {
  const relativeDir = cacheDirFor(mediaId);
  const absoluteDir = path.join(app.getPath('userData'), relativeDir);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const relative = path.join(relativeDir, safeName);
  try {
    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), relative), text, 'utf-8');
    return relative;
  } catch {
    return null;
  }
}

/** Reads a record's text, whether it is cached in userData or a sidecar in place. */
export function readSubtitleRecord(record: SubtitleRecord): string | null {
  const file = record.external ? record.path : path.join(app.getPath('userData'), record.path);
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * The track to hand the player when an item is opened.
 *
 * Preference order is about *study value*, not about provenance: a Japanese track
 * is the point of this app, so it wins outright. Within a language, an embedded or
 * sidecar track beats a download because it is timed against this exact file, and
 * a machine transcript comes last because it is the only one that can be wrong
 * about the words themselves.
 *
 * `chosenId` is the one thing that outranks all of it: the user picked that track in
 * the library, and a ranking that overrides an explicit choice is the ranking being
 * wrong. A `chosenId` naming a record that is no longer here falls through to the
 * ranking rather than returning nothing — a deleted track must not leave the item
 * with no subtitle at all.
 */
export function pickPlaybackSubtitle(
  records: readonly SubtitleRecord[] | undefined,
  preferredLang = 'ja',
  chosenId?: string,
): SubtitleRecord | null {
  // One ranking, in shared, so the status the library shows and the track the
  // player mounts cannot disagree. Among generated tracks it also orders a fused
  // track before a plain Whisper pass before a machine translation.
  return pickStudySubtitle(records, preferredLang, chosenId);
}

/** Drops cached subtitle files for the given media ids. */
export function clearSubtitleCache(ids: Set<string>): void {
  const root = path.join(app.getPath('userData'), SUBTITLE_LIBRARY_DIRECTORY);
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    if (ids.size > 0 && !ids.has(name)) continue;
    try {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    } catch {
      /* a directory we cannot remove is overwritten in place next time */
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring bridge
// ---------------------------------------------------------------------------

/**
 * Ids in the §8 model are slugs: `normalizeSubtitleProvidersDocument` rewrites
 * `the big o` to `the-big-o` and `os:1` to `os-1`. The matcher compares the
 * *normalized* track against the *raw* target, so anything handed in has to be
 * slug-shaped already or the identity filter silently matches nothing — and a
 * result keyed by the original id can never be looked up again.
 */
/** Wraps provider candidates as §8 tracks so the shared matcher can score them. */
function toProvidersDocument(
  candidates: readonly ProviderSubtitleCandidate[],
  identityId: string,
  durationSeconds: number | null,
  language?: string,
): SubtitleProvidersDocument {
  const providerIds = [...new Set(candidates.map((candidate) => candidate.providerId))];
  return {
    version: 1,
    providers: providerIds.map((id, index) => ({
      id,
      name: id,
      enabled: true,
      priority: index,
      baseUrl: null,
      languages: [],
      searchMethod: id === 'jimaku' ? 'identifier' : 'file-hash',
      // Which signals are allowed to decide. Jimaku is keyed on an AniList id so
      // its title is not a meaningful signal; OpenSubtitles carries release names
      // and episode metadata, so it gets the full set.
      matchSignals: id === 'jimaku'
        ? ['language', 'episode']
        : ['language', 'episode', 'season', 'title'],
      formats: [],
      styles: [],
      availability: 'available',
      reliabilityScore: null,
      notes: '',
    })),
    tracks: candidates.map((candidate): SubtitleTrack => ({
      id: normalizeSubtitleIdentityId(candidate.providerItemId),
      providerId: candidate.providerId,
      identityId: normalizeSubtitleIdentityId(identityId),
      providerItemId: candidate.providerItemId,
      // Collapsed to the requested tag. The `language` signal is discriminating,
      // so a provider that reports `ja-jp` for a `ja` request would be rejected
      // outright — a wrong answer to a question about regional variants nobody
      // asked. The candidates were already filtered to this base language.
      language: language ?? candidate.language,
      format: candidate.format === 'lrc' ? 'srt' : candidate.format,
      style: 'full',
      title: candidate.releaseName,
      season: candidate.season,
      episode: candidate.episode,
      year: null,
      releaseGroup: candidate.releaseGroup,
      translator: candidate.releaseGroup,
      durationSeconds,
      hearingImpaired: candidate.hearingImpaired,
      quality: createEmptySubtitleQualityRatings(),
      addedAt: null,
    })),
  };
}

interface ScoredCandidate {
  candidate: ProviderSubtitleCandidate;
  score: number;
}

/**
 * Scores candidates for one language and returns the acceptable ones, best first.
 *
 * A hash match is promoted above the threshold regardless of the title score:
 * OpenSubtitles matched the exact bytes of this file, which is stronger evidence
 * than any name comparison could be.
 */
function scoreCandidates(
  candidates: readonly ProviderSubtitleCandidate[],
  item: MediaItem,
  language: string,
  minConfidence: number,
): ScoredCandidate[] {
  const forLanguage = candidates.filter((candidate) => candidate.language.startsWith(language.slice(0, 2)));
  if (forLanguage.length === 0) return [];

  const identityId = normalizeSubtitleIdentityId(item.seriesKey ?? item.id);
  const document = toProvidersDocument(forLanguage, identityId, item.durationSec ?? null, language);
  const result = matchSubtitleTracks(document, {
    identityId,
    title: item.seriesTitle ?? item.title,
    season: item.season ?? null,
    episode: item.episode ?? null,
    durationSeconds: item.durationSec ?? null,
    language,
  });

  // Keyed on the slug, because that is the id the matcher reports back.
  const byId = new Map(forLanguage.map((candidate) => [
    normalizeSubtitleIdentityId(candidate.providerItemId),
    candidate,
  ]));
  // An item the library cannot number — a creditless opening, an OVA, a special, a movie —
  // makes the episode signal `unknown` rather than a mismatch, because a target with no
  // episode has nothing to disagree with (`shared/subtitleMatching.ts:160`). That is right
  // for a track that declares no episode either. It is wrong for one that declares a
  // number: episode 1's dialogue is not the creditless opening's, and on this path there is
  // no user to catch it, only `autoDownloadLanguages`.
  //
  // Measured 2026-08-24 on the real library: `The Big O - Creditless Opening`, `… Ending 1`
  // and `… Ending 2` each carry an auto-attached jimaku record labelled
  // `The Big O.E01.Bandai.ja.srt`, added within one second of each other. Three items, one
  // episode's dialogue, none of them that episode.
  //
  // Narrow on purpose: the matcher itself keeps returning `unknown`, because a MANUAL pick
  // must not be refused merely because a badly named file did not parse. Only automatic
  // attachment turns "we cannot tell" into "do not."
  const targetIsUnnumbered = item.episode === undefined || item.episode === null;
  const accepted: ScoredCandidate[] = [];
  for (const match of result.candidates) {
    const candidate = byId.get(match.trackId);
    if (!candidate) continue;
    if (targetIsUnnumbered && typeof candidate.episode === 'number') continue;
    const score = candidate.hashMatch ? Math.max(match.score, minConfidence) : match.score;
    if (score < minConfidence) continue;
    accepted.push({ candidate, score });
  }
  // A hash match that the matcher rejected outright is still not attached — a
  // rejection means a discriminating signal (wrong episode) disagreed, and a
  // correctly-timed subtitle for the wrong episode is still the wrong subtitle.
  return accepted.sort((a, b) => {
    if (a.candidate.hashMatch !== b.candidate.hashMatch) return a.candidate.hashMatch ? -1 : 1;
    return b.score - a.score || (b.candidate.downloads ?? 0) - (a.candidate.downloads ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Per-item discovery
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records a forced re-search must keep.
 *
 * Everything the pipeline can rediscover is dropped and rebuilt. A machine
 * transcript cannot be rediscovered, so it survives.
 */
export function retainedOnForce(records: readonly SubtitleRecord[] | undefined): SubtitleRecord[] {
  return (records ?? []).filter((record) => record.source === 'generated');
}

/** Whether a previous failed search for this language is still fresh enough to trust. */
/**
 * Failure reasons that say nothing about whether the subtitle exists.
 *
 * `no-key` is a statement about *this app's configuration*, not about the
 * provider's catalogue — we never asked. Letting it suppress retries meant that
 * adding an API key did not take effect for up to `retryAfterDays`: the sweep
 * kept skipping the provider it had just been given credentials for, recorded
 * no new failure while doing it, and so offered the user nothing to explain the
 * silence. Measured on this machine — a Jimaku key added 5.98 days after a
 * keyless sweep was still being ignored, with a 7-day window.
 *
 * `provider-down` is the same argument one reason over: a 429, a 5xx or a
 * timeout means the question was never answered either. Letting an outage
 * suppress the retry turns a bad minute into a bad week.
 *
 * Every `NyaaUnavailableReason` is the same argument a third time, and the
 * biggest of the three by volume. All six are refusals by `nyaaAvailability`
 * *before any request is made* — no torrent index, qBittorrent off, no
 * credential, a save path this machine cannot read. Measured on the real
 * library 2026-09-07: **127 stored `nyaa | not-configured` rows across 39
 * items**, every one of them a note about this app's own settings that was
 * being read as a fact about the show. The cost is exactly the `no-key` cost —
 * a user who turns qBittorrent on, or enables their first torrent index, would
 * have found nyaa skipped for up to `retryAfterDays` afterwards, recording
 * nothing to explain the silence.
 */
const NON_EVIDENTIAL_FAILURES = new Set<string>([
  'no-key',
  'provider-down',
  // OpenSubtitles' daily download allowance ran out. "Not today" is a fact about
  // this machine's quota, not about the show, and it resets within a day.
  'quota',
  ...NYAA_UNAVAILABLE_REASONS,
]);

function recentlyFailed(item: MediaItem, providerId: string, lang: string, retryAfterDays: number): boolean {
  const cutoff = Date.now() - retryAfterDays * DAY_MS;
  return (item.subtitleFailures ?? []).some((failure) =>
    failure.providerId === providerId
    && failure.lang === lang
    && !NON_EVIDENTIAL_FAILURES.has(failure.reason)
    && failure.attemptedAt > cutoff);
}

/**
 * The failure rows worth keeping — which is only the ones the back-off consults.
 *
 * `subtitleFailures` has exactly one reader in the whole tree: `recentlyFailed`,
 * above. It is not rendered anywhere, and no other code branches on it. So a row
 * carrying a non-evidential reason is storage for something nothing will ever
 * ask, and the list is capped at 24 per item and FIFO — meaning those rows push
 * out the ones the back-off does need, until it forgets everything and re-asks
 * every provider on every sweep.
 *
 * Measured on the real library 2026-09-07: **550 rows across 39 items, of which
 * 498 are non-evidential** (313 `opensubtitles | no-key`, 127
 * `nyaa | not-configured`, 58 `jimaku | no-key`) against 52 real
 * `jimaku | no-match`. 23 items sat at 21 rows and one was already at the cap.
 *
 * Applied on write rather than as a migration, deliberately: this is not a
 * schema change needing a version stamp, it is declining to store something with
 * no reader, and it repairs the historical rows the first time each item is
 * swept. `subtitlesCheckedAt` still records when the item was last looked at, so
 * no timeline is lost with them.
 */
function keptFailures(failures: readonly SubtitleSearchFailure[]): SubtitleSearchFailure[] {
  return failures.filter((failure) => !NON_EVIDENTIAL_FAILURES.has(failure.reason));
}

/**
 * Whether a language is already covered. A machine translation does not count:
 * it is the fallback made because nothing better was found, and counting it
 * would stop every later sweep from finding the human track that replaces it.
 */
function hasLanguage(records: readonly SubtitleRecord[], lang: string): boolean {
  const base = lang.slice(0, 2);
  return records.some((record) => record.lang.startsWith(base) && !isMachineTranslatedSubtitle(record));
}

/** The OSDb hash, or null for a file too small, missing, or unreadable to hash. */
async function fileHash(filePath: string): Promise<string | null> {
  try {
    return (await osdbHashFile(filePath))?.hash ?? null;
  } catch {
    return null;
  }
}

/**
 * Moves a downloaded track onto this file's audio when it is measurably off.
 *
 * A track from a hash match is timed to these bytes already and is never touched.
 * Anything else was timed against *some* release, and "some" is off by seconds
 * often enough to matter (measured: a Jimaku file 9.05 s late). The player makes
 * the same correction at mount, but only for the one track it mounts; writing it
 * into the file is what makes the transcript, mining, the lexicon search and a
 * machine translation built from this track all agree with the audio too.
 */
async function alignToAudio(
  item: MediaItem,
  text: string,
  format: SubtitleRecordFormat,
): Promise<{ text: string; offsetSec: number } | null> {
  if (!item.path || !fs.existsSync(item.path)) return null;
  const cues = parseSubtitles(text);
  // Too few cues and the estimator's own gates decline anyway; skip the ffmpeg work.
  if (cues.length < 10) return null;
  try {
    const estimate = await estimateSubtitleOffset(
      item.path,
      cues.map((cue) => ({ start: cue.start, end: cue.end })),
      item.durationSec ?? 0,
    );
    if (!worthShifting(estimate)) return null;
    const offsetSec = Math.round(estimate.offsetSec * 1000) / 1000;
    return { text: shiftSubtitleText(text, format, offsetSec), offsetSec };
  } catch {
    return null;
  }
}

/**
 * A sidecar next to the media file that names a language the item does not
 * already carry. Only language-tagged files count: an untagged one is claimed
 * by guesswork that needs the wanted-language list, which by construction is
 * fully satisfied wherever this is asked.
 */
function hasUnattachedSidecar(item: MediaItem): boolean {
  const records = item.subtitles ?? [];
  const known = new Set(records.map((record) => record.path));
  return findSidecarSubtitles(item.path).some((sidecar) =>
    !!sidecar.language && !known.has(sidecar.path) && !hasLanguage(records, sidecar.language));
}

/** Per-run state shared by every item of one discovery run. */
interface DiscoveryRun {
  /** Languages the network may be asked for in this run (see `planDiscoveryLanguages`). */
  remote: readonly string[];
  /** OpenSubtitles listings already fetched this run, shared across a series. */
  openSubtitles: OpenSubtitlesBatch;
}

async function discoverForItem(
  item: MediaItem,
  settings: SubtitleDiscoverySettings,
  languages: string[],
  force: boolean,
  emit: (phase: SubtitleDiscoveryPhase, extra?: Partial<SubtitleDiscoveryProgress>) => void,
  acquisition?: NyaaAcquisitionConfig,
  run: DiscoveryRun = { remote: languages, openSubtitles: createOpenSubtitlesBatch() },
): Promise<{ records: SubtitleRecord[]; failures: SubtitleSearchFailure[]; files: number }> {
  // A forced re-search rediscovers everything the pipeline can produce, so those
  // records are dropped and rebuilt. Machine transcripts are the exception: this
  // pass cannot regenerate one, so clearing them would orphan the Whisper output
  // on disk, revert Analyze Japanese to "Transcribe & analyze", and cost the user
  // the whole transcription again — from pressing "Search now".
  const existing = force ? retainedOnForce(item.subtitles) : [...(item.subtitles ?? [])];
  const records: SubtitleRecord[] = [...existing];
  const failures: SubtitleSearchFailure[] = [];
  let files = 0;

  const providers = orderedSubtitleProviders(settings);
  const known = new Set(records.map((record) => record.providerItemId ?? record.path));

  for (const providerId of providers) {
    if (cancelled.has(item.id)) return { records, failures, files };

    // Nothing left to *fetch*. `autoDownloadLanguages` gates downloads, so it
    // gates the remote half of the ladder only. A sidecar already sitting next
    // to the video is content the user provided; skipping it because some other
    // language is already present is what left EN→JA fusion unable to see an
    // English track lying beside the Japanese one it was asked to fuse from.
    const missing = languages.filter((lang) => !hasLanguage(records, lang));
    // Only the languages this run may download. The helper line's language is
    // wanted everywhere but fetched per episode on play, not across a library.
    const remoteMissing = missing.filter((lang) => run.remote.includes(lang));
    if (remoteMissing.length === 0 && isRemoteSubtitleProvider(providerId)) continue;
    // An untagged track is claimed by guesswork, and the guess only has one answer
    // when exactly one STUDY language is missing. The helper language is left out
    // of it: with Japanese already attached, "the one missing language" would
    // otherwise make the untagged Japanese stream look like the English one.
    const helperOnly = (lang: string): boolean =>
      lang === settings.helperLanguage && !settings.autoDownloadLanguages.includes(lang);
    const guessable = missing.filter((lang) => !helperOnly(lang));
    const guess = guessable.length === 1 ? guessable[0] : null;

    if (providerId === 'embedded') {
      emit('probing-embedded');
      const streams = await listEmbeddedSubtitleStreams(item.path);
      for (const stream of streams) {
        const lang = normalizeStreamLanguage(stream.language);
        // An untagged stream is kept only when we still need something: it is
        // usually the main track in a single-subtitle release.
        const target = lang ?? guess;
        if (!target || !missing.includes(target)) continue;
        // A forced (signs-only) stream is not a helper line: it would satisfy the
        // language and leave nine lines in ten with nothing under them.
        if (stream.forced && helperOnly(target)) continue;
        const text = await extractEmbeddedSubtitle(item.path, stream.subtitleIndex);
        if (!text) continue;
        const relative = writeSubtitleFile(item.id, `embedded-${stream.subtitleIndex}-${target}.srt`, text);
        if (!relative) continue;
        files += 1;
        records.push({
          id: crypto.randomUUID(),
          lang: target,
          source: 'embedded',
          format: 'srt',
          path: relative,
          label: stream.title ?? `Stream ${stream.streamIndex}`,
          streamIndex: stream.streamIndex,
          hearingImpaired: stream.hearingImpaired,
          addedAt: Date.now(),
        });
      }
      continue;
    }

    if (providerId === 'sidecar') {
      emit('scanning-sidecar');
      for (const sidecar of findSidecarSubtitles(item.path)) {
        // A file that names its own language is taken at face value even when
        // that language was not asked for — it is already on disk. An *unnamed*
        // file is still only claimed when exactly one wanted language is missing,
        // because that is the only case where the guess has a single answer.
        const target = sidecar.language ?? guess;
        if (!target || hasLanguage(records, target) || known.has(sidecar.path)) continue;
        known.add(sidecar.path);
        files += 1;
        records.push({
          id: crypto.randomUUID(),
          lang: target,
          source: 'sidecar',
          format: sidecar.format,
          // Read in place. Copying a file the user already manages would mean two
          // copies that can drift apart.
          path: sidecar.path,
          external: true,
          label: sidecar.fileName,
          hearingImpaired: sidecar.hearingImpaired,
          addedAt: Date.now(),
        });
      }
      continue;
    }

    // Everything past here answers with candidates to score. `isRemote` rather
    // than `isNetwork` because the two are not the same set: nyaa reaches the
    // network and has no key, and gating on the key-bearing predicate would
    // have dropped it out of the loop silently.
    if (!isRemoteSubtitleProvider(providerId)) continue;

    // A manual-only provider cannot produce anything this loop is allowed to
    // keep — the attach below refuses it by design, because a torrent-index hit
    // is a name match with no curation and auto-attaching one means the wrong
    // cut plays. So asking it is work whose result is discarded on the next
    // line but one: an availability probe (which stats the qBittorrent save
    // path), a second of index pacing, and a search with a 20 s timeout, per
    // item, per sweep. On this machine's 39-item library that is ≥39 s added to
    // a sweep for nothing.
    //
    // It also *wrote* for nothing. Every pass recorded a failure row — measured
    // 2026-09-07, **127 stored `nyaa | not-configured` rows** — into a list
    // capped at 24 per item, evicting the rows that do say something. Neither
    // `manual-only` nor any `NyaaUnavailableReason` has a single consumer
    // anywhere in `src/`; nothing renders them and nothing decides on them.
    //
    // Nyaa is still fully reachable, deliberately and by the user: the listing
    // handler below (`subtitleDiscovery:nyaaList` → `subtitleDiscovery:nyaaAccept`)
    // is how a nyaa subtitle is actually taken, and it is unaffected.
    //
    // The nyaa arms further down are left in place rather than deleted. They are
    // unreachable while nyaa is the only entry in `MANUAL_ONLY_SUBTITLE_PROVIDERS`,
    // but deleting them would make a future change to that list fall through to
    // the `else` branch and search nyaa *as OpenSubtitles*, which fails silently.
    if (isManualOnlySubtitleProvider(providerId)) continue;

    if (isNetworkSubtitleProvider(providerId) && !hasSubtitleProviderKey(providerId)) {
      failures.push({ providerId, lang: remoteMissing.join(','), attemptedAt: Date.now(), reason: 'no-key' });
      // Said once, in the subtitle panel — not per episode. Only for a language
      // Jimaku cannot supply: an anime library with no OpenSubtitles key and all
      // its Japanese from Jimaku has nothing to be told.
      if (providerId === 'opensubtitles') raiseSubtitleNotice('opensubtitles-key-missing');
      continue;
    }
    if (providerId === 'nyaa') {
      const available = await nyaaAvailability(acquisition);
      if (!available.ok) {
        failures.push({
          providerId,
          lang: remoteMissing.join(','),
          attemptedAt: Date.now(),
          reason: available.reason,
        });
        continue;
      }
    }

    // `force` means the user asked for this search again, explicitly. Honouring
    // the back-off there would make the one control that exists for "try again
    // now" do nothing at all — which is what it did before: `force` dropped the
    // stored records and marked the item eligible, then this gate skipped the
    // provider anyway, so a forced re-search silently searched nothing.
    const wanted = force
      ? remoteMissing
      : remoteMissing.filter((lang) => !recentlyFailed(item, providerId, lang, settings.retryAfterDays));
    if (wanted.length === 0) continue;

    emit('searching-providers', { providerId });
    let candidates: ProviderSubtitleCandidate[] = [];
    // OpenSubtitles arrives already scored per language by the tiered search
    // (`subtitleDiscoveryOpenSubtitles.ts`); the other providers are scored below.
    let scoredByLanguage: Map<string, ScoredCandidate[]> | null = null;
    // Set when the provider itself did not answer — a rate limit, a 5xx, a
    // timeout. Kept separate from an empty candidate list because they are not
    // the same claim, and only one of them is about this show.
    let providerDown = false;
    // Some tier of a multi-request search went unanswered: a language it did not
    // settle is unknown, not absent.
    let partlyDown = false;
    // D266. Set when this item's episode number is past the matched entry's own
    // run length and no sequel accounts for it, so an empty answer is a fact
    // about the QUESTION rather than about the show. Only Jimaku sets it: it is
    // the one provider keyed on an entry id, and a torrent index or
    // OpenSubtitles is asked by title and absolute episode, where the folder's
    // own numbering is the correct one.
    let outOfRange: string | null = null;
    try {
      if (providerId === 'jimaku') {
        // Japanese-only provider; asking it for anything else is a wasted request.
        if (!wanted.some((lang) => lang.startsWith('ja'))) continue;
        // A folder holding two seasons is stamped with the FIRST season's id, so
        // episode 26 is asked about under an entry whose own metadata says it
        // has 13 — and the correct "nothing" is then stored as evidence and
        // suppresses the provider for `retryAfterDays`. Measured live: `The Big
        // O` is 26 files all carrying `anilistId: 567`, and jimaku entry 1178
        // holds exactly E01–E13.
        const season = resolveSeasonForEpisode(item);
        // An unresolved item is still ASKED, deliberately. `episodeCount` comes
        // from AniList and the entry's contents do not: a split cour filed as
        // one Jimaku entry really can hold episode 20 while AniList says the
        // season has 12, and skipping the request would turn an honesty fix
        // into a capability regression. What changes is what an EMPTY answer is
        // recorded as — see `outOfRange` below. Measured 2026-09-07: AniList
        // answers 403 to every query, so `relatedWorks` cannot be populated at
        // all today and this is the arm the whole library lands in.
        if (season.kind === 'unresolved') outOfRange = season.reason;
        // `jimakuSearchDetailed` rather than `jimakuSearch`: the plain form drops
        // the `down` flag, and this is the caller that most needs it.
        const reply = await jimakuSearchDetailed(
          season.kind === 'resolved' ? season.hop.anilistId : item.anilistId,
          providerSearchTitle(
            season.kind === 'resolved' ? season.hop.title : (item.seriesTitle ?? item.title),
          ),
          season.kind === 'resolved' ? season.hop.episode : (item.episode ?? null),
        );
        candidates = reply.candidates;
        providerDown = reply.down;
        // The candidates now carry the SEQUEL's episode numbering while the
        // library item still carries the folder's. Left as-is they disagree,
        // and `matchSubtitleTracks` reads that as the wrong episode and rejects
        // every one of them — the fix would find the files and then throw them
        // away. Rewriting the number here keeps the comparison in the item's
        // own frame, which is the only frame the rest of the pipeline knows.
        if (season.kind === 'resolved') {
          const absolute = item.episode ?? null;
          candidates = candidates.map((candidate) => (
            candidate.episode === season.hop.episode ? { ...candidate, episode: absolute } : candidate
          ));
        }
      } else if (providerId === 'nyaa') {
        candidates = await nyaaSearch({
          // Checked non-null by the availability gate above.
          config: acquisition as NyaaAcquisitionConfig,
          title: providerSearchTitle(item.seriesTitle ?? item.title),
          season: item.season ?? null,
          episode: item.episode ?? null,
          languages: wanted,
        });
      } else {
        // Hash, then IMDb/TMDB id, then title — each tier only while a language
        // is still open, and the id/title listings shared across the series for
        // this run. The client's `down` flag is carried through for the same
        // reason as Jimaku's above: an outage must not become `no-match`.
        const reply = await searchOpenSubtitlesForItem(
          item,
          wanted,
          await fileHash(item.path),
          run.openSubtitles,
          settings.minConfidence,
        );
        scoredByLanguage = new Map([...reply.byLanguage].map(([lang, scored]) => [
          lang,
          scored.map((entry) => ({ candidate: entry.candidate, score: entry.score })),
        ]));
        providerDown = reply.down && reply.byLanguage.size === 0;
        partlyDown = reply.down;
      }
    } catch (error) {
      failures.push({
        providerId,
        lang: wanted.join(','),
        attemptedAt: Date.now(),
        reason: error instanceof Error ? error.message : 'error',
      });
      continue;
    }

    if (cancelled.has(item.id)) return { records, failures, files };

    // An outage is not an answer about this title. Recording `no-match` here is
    // what the client's own comment warns against — measured 2026-08-17, eight
    // titles reported "no Japanese subtitles filed" and returned 125/57/168/36/
    // 95/48/60/47 files when the same requests were spaced 6 s apart — and it
    // costs more than a wrong word, because `no-match` is evidential and
    // suppresses the retry for `retryAfterDays` (7 by default). The real library
    // carries 52 jimaku `no-match` rows for The Big O, a series jimaku
    // demonstrably has per-episode files for: E01 and E13 are both attached.
    if (providerDown) {
      failures.push({
        providerId,
        lang: wanted.join(','),
        attemptedAt: Date.now(),
        reason: 'provider-down',
      });
      continue;
    }
    emit('matching', { providerId });

    for (const lang of wanted) {
      const scored = scoredByLanguage
        ? (scoredByLanguage.get(lang) ?? [])
        : scoreCandidates(candidates, item, lang, settings.minConfidence);
      const best = scored.find((entry) => !known.has(entry.candidate.providerItemId));
      if (!best) {
        // `no-match` is a claim about the catalogue. When the episode is past
        // the entry's published run length and no sequel could be resolved, the
        // catalogue was never really asked about THIS episode, and saying so is
        // the difference between "this show has no subtitles" and "we asked the
        // wrong entry" — one of which a user can act on.
        failures.push({
          providerId,
          lang,
          attemptedAt: Date.now(),
          reason: partlyDown
            ? 'provider-down'
            : outOfRange ? `episode-out-of-range:${outOfRange}` : 'no-match',
        });
        continue;
      }
      // Only attach automatically for languages this run may download
      // (`planDiscoveryLanguages`); `wanted` is already narrowed to them.
      if (!run.remote.includes(lang)) continue;
      // Some providers are never attached without the user picking the result,
      // regardless of the language opt-in. A candidate from a torrent index is
      // a name match with no curation behind it; auto-attaching one means the
      // wrong cut plays and the user finds out minutes in.
      if (isManualOnlySubtitleProvider(providerId)) {
        failures.push({ providerId, lang, attemptedAt: Date.now(), reason: 'manual-only' });
        continue;
      }
      // Spent for today. Asking again only repeats the refusal.
      if (providerId === 'opensubtitles' && openSubtitlesQuotaActive()) {
        failures.push({ providerId, lang, attemptedAt: Date.now(), reason: 'quota' });
        continue;
      }

      emit('downloading', { providerId });
      const fetched = await fetchSubtitleCandidateDetailed(best.candidate);
      if (fetched.quotaExceeded) noteOpenSubtitlesQuota(fetched.resetAt);
      else if (fetched.remaining !== null && fetched.remaining <= 0) noteOpenSubtitlesQuota(fetched.resetAt);
      if (!fetched.text) {
        failures.push({
          providerId,
          lang,
          attemptedAt: Date.now(),
          reason: fetched.quotaExceeded ? 'quota' : 'download-failed',
        });
        continue;
      }
      known.add(best.candidate.providerItemId);
      const aligned = best.candidate.hashMatch
        ? null
        : await alignToAudio(item, fetched.text, best.candidate.format);
      const relative = writeSubtitleFile(
        item.id,
        `${providerId}-${lang}-${best.candidate.providerItemId.replace(/[^a-zA-Z0-9]/g, '')}.${best.candidate.format}`,
        aligned?.text ?? fetched.text,
      );
      if (!relative) continue;
      files += 1;
      records.push({
        id: crypto.randomUUID(),
        lang,
        source: 'provider',
        format: best.candidate.format,
        path: relative,
        providerId,
        providerItemId: best.candidate.providerItemId,
        label: best.candidate.releaseName,
        confidence: Math.round(best.score * 10) / 10,
        hearingImpaired: best.candidate.hearingImpaired,
        ...(aligned ? { syncOffsetSec: aligned.offsetSec } : {}),
        addedAt: Date.now(),
      });
    }
  }

  return { records, failures, files };
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export function cancelSubtitleDiscovery(mediaId?: string): void {
  if (mediaId) {
    if (running.has(mediaId)) cancelled.add(mediaId);
    return;
  }
  for (const id of running) cancelled.add(id);
}

export function subtitleDiscoveryRunning(): boolean {
  return sweeping || running.size > 0;
}

/** Video-ish items only; an audiobook has no subtitle track to find. */
export function subtitleDiscoveryEligible(item: MediaItem): boolean {
  return (item.kind ?? 'video') === 'video' && !item.sourceUrl;
}

export async function runSubtitleDiscovery(
  request: SubtitleDiscoveryRequest = {},
): Promise<SubtitleDiscoveryResult> {
  if (!host) return { ok: false, attached: 0, empty: 0, unreachable: 0, files: 0, error: 'Subtitle discovery host is not registered.' };
  if (sweeping) {
    // A library-wide request that lands mid-sweep is almost always an import
    // (a watch folder, a finished download) whose new files the running sweep
    // selected before they existed. Refusing it outright left them unsearched
    // until the next launch; one follow-up sweep after this one picks them up,
    // and costs nothing for the items this sweep already answered.
    if (!request.mediaIds?.length && !request.force && request.acquisition === undefined) followUpSweep = true;
    return { ok: false, attached: 0, empty: 0, unreachable: 0, files: 0, error: 'A subtitle sweep is already running.' };
  }

  const settings = loadDiscoverySettings();
  // The study languages plus the helper line's language — but the network is
  // only asked for the helper language on a targeted request (a played episode,
  // a per-episode "Search now"), never across a whole library.
  const { languages, remote } = planDiscoveryLanguages(settings, request);
  if (languages.length === 0) return { ok: true, attached: 0, empty: 0, unreachable: 0, files: 0 };

  const only = request.mediaIds?.length ? new Set(request.mediaIds) : undefined;
  // Repair BEFORE selecting, not inside the per-item pass, because a wrong track
  // satisfies the language filter exactly as well as a right one: an item holding
  // episode 1's script would be skipped by the filter below and never revisited.
  // Dropping it here both removes the wrong cues and puts the item back in the
  // sweep, so it can get the correct track or an honest none.
  for (const item of host.listItems()) {
    if (only && !only.has(item.id)) continue;
    const stale = mismatchedAutoSubtitleIds(item);
    if (stale.length === 0) continue;
    // The cached file is left on disk. Removing the record is the repair; deleting
    // bytes the user might still want is a separate, unaskable decision.
    host.patchItems([item.id], {
      subtitles: (item.subtitles ?? []).filter((record) => !stale.includes(record.id)),
    });
  }

  const items = host.listItems().filter((item) => {
    if (only && !only.has(item.id)) return false;
    if (!subtitleDiscoveryEligible(item)) return false;
    if (request.force) return true;
    // Selected on the languages this run can actually fetch. An item missing only
    // the helper language is not re-walked on every launch for a language the
    // sweep would not download anyway; the first play takes care of it.
    if (!remote.every((lang) => hasLanguage(item.subtitles ?? [], lang))) return true;
    // Every wanted language is present, but a sidecar the user placed beside the
    // file can still be unattached, and the language filter alone would never
    // reach it. One readdir per item, and only for items we would otherwise skip.
    return hasUnattachedSidecar(item);
  });

  if (items.length === 0) return { ok: true, attached: 0, empty: 0, unreachable: 0, files: 0 };

  sweeping = true;
  const startedAt = Date.now();
  // One per run: the OpenSubtitles listing for a series/season is fetched once
  // and every episode of it in this run picks from the same answer.
  const run: DiscoveryRun = { remote, openSubtitles: createOpenSubtitlesBatch() };
  let attached = 0;
  let empty = 0;
  // Of `empty`, the ones that were empty because nobody answered. See
  // `SubtitleDiscoveryResult.unreachable` for why this is counted separately.
  let unreachable = 0;
  let files = 0;
  let done = 0;

  try {
    for (const item of items) {
      running.add(item.id);
      cancelled.delete(item.id);
      const title = item.title?.trim() || item.fileName;

      const emit = (phase: SubtitleDiscoveryPhase, extra: Partial<SubtitleDiscoveryProgress> = {}): void =>
        broadcast({
          mediaId: item.id,
          title,
          phase,
          done,
          total: items.length,
          etaMs: estimateEtaMs(done, items.length, Date.now() - startedAt),
          ...extra,
        });

      try {
        emit('queued');
        const outcome = await discoverForItem(
          item,
          settings,
          languages,
          request.force === true,
          emit,
          asAcquisitionConfig(request.acquisition),
          run,
        );
        if (cancelled.has(item.id)) {
          emit('cancelled');
          continue;
        }

        // Nothing found and the user asked for a fallback: queue Whisper. This is
        // the only thing that makes the autoTranscribe setting do anything.
        const foundJapanese = outcome.records.some((record) => /^ja/i.test(record.lang));
        // With a helper-language track in hand, the better fallback is the fused
        // track (Whisper on the helper track's timing), which the automation queue
        // builds when the episode is first played. A plain grid transcript here
        // would be twenty minutes of Whisper spent on the worse of the two.
        const fusable = settings.autoStudyTrack && !!settings.helperLanguage
          && outcome.records.some((record) => record.source !== 'generated'
            && record.lang.startsWith((settings.helperLanguage ?? '').slice(0, 2)));
        if (!foundJapanese && !fusable && settings.autoTranscribe && languages.some((lang) => lang.startsWith('ja'))) {
          enqueueTranscription({ mediaId: item.id, lang: 'ja' });
        }

        // D268. The baseline is what the run STARTED from, not what the item had
        // before it. A forced re-search drops every rediscoverable record first
        // (`discoverForItem`'s `retainedOnForce`), so an item that had one
        // subtitle and successfully re-attached one compares 1 > 1, counts as
        // `empty`, and the user who pressed *Find subtitles* is told "0
        // subtitles" about a search that worked. Measured live 2026-09-07 on
        // `The Big O - 07`: `{attached: 0, empty: 3, files: 1}` while the store
        // held the freshly attached record.
        const before = request.force === true ? retainedOnForce(item.subtitles).length : (item.subtitles?.length ?? 0);
        const gained = outcome.records.length > before;
        if (gained) attached += 1;
        else {
          empty += 1;
          // Read off THIS run's failures, not the item's accumulated list: a
          // `provider-down` row kept from a previous sweep would make every later
          // healthy sweep report an outage.
          if (outcome.failures.some((failure) => failure.reason === 'provider-down')) unreachable += 1;
        }
        files += outcome.files;

        host.patchItems([item.id], {
          subtitles: outcome.records,
          // Failures accumulate but are bounded, so the record cannot grow forever.
          subtitleFailures: keptFailures([...(item.subtitleFailures ?? []), ...outcome.failures]).slice(-24),
          subtitlesCheckedAt: Date.now(),
        });
        done += 1;
        emit('done', { languages: [...new Set(outcome.records.map((record) => record.lang))].sort() });
      } catch (error) {
        done += 1;
        empty += 1;
        // A throw out of `discoverForItem` is the network failing hard rather than a
        // provider answering; it belongs on the same side of the line as `down`.
        unreachable += 1;
        emit('error', { error: error instanceof Error ? error.message : String(error) });
      } finally {
        running.delete(item.id);
        cancelled.delete(item.id);
      }
    }
  } finally {
    sweeping = false;
    running.clear();
    cancelled.clear();
    emitEvent({ type: 'idle' });
    if (followUpSweep) {
      followUpSweep = false;
      setTimeout(() => {
        void runSubtitleDiscovery({}).catch(() => undefined);
      }, 0);
    }
  }

  return { ok: true, attached, empty, unreachable, files };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function credentialStates(): SubtitleProviderCredentialState[] {
  // Driven off the shared list rather than a literal copy of it: this used to
  // be its own array, which meant a provider could be registered, enabled and
  // ordered in settings while never appearing here.
  return SUBTITLE_PROVIDER_IDS.map((id) => ({
    id,
    requiresKey: isNetworkSubtitleProvider(id),
    hasKey: isNetworkSubtitleProvider(id) ? hasSubtitleProviderKey(id) : true,
  }));
}

// ---------------------------------------------------------------------------
// Manual nyaa flow
//
// The automatic loop never attaches a nyaa result (see
// `isManualOnlySubtitleProvider`), so this is how one is actually taken: list
// the ranked releases, let the user pick, then fetch and attach exactly that
// one. Separated from `discoverForItem` because accepting a candidate starts a
// transfer in the user's torrent client, and that has to be a decision someone
// made rather than a step in a sweep.
// ---------------------------------------------------------------------------

/**
 * Between alias searches, matching `subtitleHarvest.ts`. One index, one
 * courtesy: a walk that fires four requests back to back is the behaviour that
 * gets a client rate-limited, and the user is waiting on a dialog either way.
 */
const NYAA_ALIAS_PACING_MS = 400;
const sleep = (ms: number) => new Promise<void>((done) => { setTimeout(done, ms); });

async function listNyaaCandidates(
  mediaId: string,
  acquisition: unknown,
  languages?: string[],
): Promise<NyaaSubtitleListResult> {
  const item = host?.listItems().find((entry) => entry.id === mediaId);
  if (!item) {
    // No `reason`: this is not an availability question, so the dialog must
    // fall back to these words rather than mistranslate them.
    return { ok: false, candidates: [], message: 'That media item is no longer in the library.', reason: null };
  }

  const config = asAcquisitionConfig(acquisition);
  const available = await nyaaAvailability(config);
  if (!available.ok) {
    // The CODE travels with the sentence: `detail` is built here, so the
    // renderer cannot translate it and printed it raw in every language (D172).
    return { ok: false, candidates: [], message: available.detail, reason: available.reason };
  }

  const wanted = languages?.length ? languages : loadDiscoverySettings().autoDownloadLanguages;
  /**
   * The same alias reach the harvest listing has had since `58e348a5`.
   *
   * Without it this surface asks the index exactly one question — the name the
   * library happens to store — while `listNyaaHarvest`, over the same index and
   * the same predicates, asks up to four. That asymmetry is not a preference:
   * MAL 2596 is stored as `Shinreigari` and nyaa files it as `Ghost Hound`, so
   * the one-name listing reported an index that plainly has releases as empty.
   * A media item that was never matched to a MAL row has no aliases to add and
   * costs exactly one request, as before.
   */
  const stored = storedMalFacts(item.malId);
  const names = harvestSearchAliases(
    providerSearchTitle(item.seriesTitle ?? item.title),
    stored.aliases,
  );
  /**
   * The last asymmetry between this listing and `listNyaaHarvest`.
   *
   * `episodeCount` is documented on `NyaaRankInput` as "how many episodes the
   * caller is asking to be answered at once", set by a caller that searches with
   * `episode: null` and therefore cannot tell a season pack from one episode's
   * sidecar by the query alone. That is a description of *this* call whenever
   * `item.episode` is absent — a library row for a whole work, not for episode
   * 7 — and it was omitted only because this path was written when every media
   * item was assumed to be one episode.
   *
   * It is deliberately conditional rather than unconditional. With an episode
   * pinned, the flat ceiling is the right one: a single episode of cues is tens
   * of kilobytes, and a scaled ceiling would let a 39-episode pack be offered as
   * the answer to episode 7. So a per-episode row keeps exactly its old
   * behaviour and an item with no episode gains the pack route.
   */
  const episodeCount = item.episode == null ? stored.totalEpisodes : null;
  try {
    let candidates: Awaited<ReturnType<typeof nyaaSearchDetailed>>['candidates'] = [];
    // The alias that saw the most of this work, so an empty listing reports the
    // richest refusal the walk found rather than the last alias's silence.
    let dropped = emptyRankDrops();
    for (const [index, title] of names.entries()) {
      if (index) await sleep(NYAA_ALIAS_PACING_MS);
      const attempt = await nyaaSearchDetailed({
        config: config as NyaaAcquisitionConfig,
        title,
        season: item.season ?? null,
        episode: item.episode ?? null,
        languages: wanted.length ? wanted : ['ja'],
        episodeCount,
      });
      if (attempt.dropped.titleMatched > dropped.titleMatched) dropped = attempt.dropped;
      if (!attempt.candidates.length) continue;
      // Same rule as the harvest walk, for the same reason: a `sub-pack` and a
      // `batch-sidecar` are not interchangeable answers, and stopping at the
      // first name that found *anything* is how a 39 MB subs-only pack loses to
      // a 21 GB video batch that a different name for the same work turned up.
      // Earliest name still wins among equals.
      const carriesPack = attempt.candidates.some((entry) => entry.route === 'sub-pack');
      if (!candidates.length || carriesPack) candidates = attempt.candidates;
      if (carriesPack) break;
    }
    rememberNyaaCandidates(candidates);
    return {
      ok: true,
      candidates: candidates.map((candidate) => ({
        id: candidate.providerItemId,
        releaseName: candidate.releaseName,
        route: candidate.route,
        sizeBytes: candidate.sizeBytes,
        seeders: candidate.seeders,
        languages: candidate.language ? [candidate.language] : [],
        score: candidate.score,
        reasons: candidate.reasons,
      })),
      message: candidates.length ? '' : describeEmptyNyaaListing(dropped),
    };
  } catch (error) {
    return {
      ok: false,
      candidates: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function acceptNyaaCandidate(
  mediaId: string,
  candidateId: string,
  acquisition: unknown,
  lang: string,
): Promise<NyaaSubtitleAcceptResult> {
  const item = host?.listItems().find((entry) => entry.id === mediaId);
  if (!item) return { ok: false, message: 'That media item is no longer in the library.' };

  const config = asAcquisitionConfig(acquisition);
  if (!config) return { ok: false, message: 'No scraper configuration was supplied.' };

  const candidate = takeRememberedNyaaCandidate(candidateId);
  if (!candidate) {
    return { ok: false, message: 'That release is no longer in this session’s listing. Search again.' };
  }

  // The dialog's acquisition is a job like any other, and until this it was the
  // only one absent from `running`. `cancelSubtitleDiscovery` marks only ids it
  // finds there — both forms of it, the per-item and the cancel-everything the
  // job strip's button sends — so the closure below could never become true
  // through any product path. The IPC answered, the fetch ran on to its full
  // budget, and the torrent kept transferring.
  //
  // Ownership is taken only when nothing else holds the id: a sweep already
  // running for this item registered it, and clearing its flags underneath it
  // would un-cancel the sweep instead of this fetch.
  const owned = !running.has(mediaId);
  if (owned) {
    running.add(mediaId);
    cancelled.delete(mediaId);
  }

  // Registering is only half of a cancellable job. The strip renders from this
  // broadcast, and its Cancel button appears only while something in it is
  // unfinished — so an acquisition that never announced itself was still
  // uncancellable by a person, however well the IPC behind the button worked.
  // The sweep's own emit shape, so one row type covers both producers.
  const title = item.title?.trim() || item.fileName;
  const emit = (phase: SubtitleDiscoveryPhase, extra: Partial<SubtitleDiscoveryProgress> = {}): void =>
    broadcast({ mediaId, title, phase, done: 0, total: 1, ...extra });

  emit('downloading');
  const outcome = await nyaaFetch(candidate, config, {
    isCancelled: () => cancelled.has(mediaId),
  }).finally(() => {
    if (!owned) return;
    running.delete(mediaId);
    // Released with the registration rather than left for the next caller.
    // Measured as redundant, and kept anyway: the acquire above clears the same
    // flag, so removing this line reddens nothing — it is symmetry, not a
    // guard, and the next reader should not assume a test is holding it.
    cancelled.delete(mediaId);
  });
  if (!outcome.ok) {
    // A cancel is its own terminal phase, not an error: the row must not tell
    // the user something went wrong when they are the one who stopped it.
    if (outcome.reason === QBIT_CANCELLED_REASON) emit('cancelled', { done: 1 });
    else emit('error', { done: 1, error: outcome.reason });
    return { ok: false, message: outcome.reason };
  }

  const language = (lang || candidate.language || 'ja').toLowerCase();
  const relative = writeSubtitleFile(
    item.id,
    `nyaa-${language}-${candidate.providerItemId.replace(/[^a-zA-Z0-9]/g, '')}.${outcome.value.format}`,
    outcome.value.text,
  );
  if (!relative) {
    const failed = 'The subtitle could not be written to disk.';
    emit('error', { done: 1, error: failed });
    return { ok: false, message: failed };
  }

  const record: SubtitleRecord = {
    id: crypto.randomUUID(),
    lang: language,
    source: 'provider',
    // The format comes from the file that was actually fetched, not from the
    // guess the search made: the index lists no file names, so until the
    // torrent metadata arrives nothing knows whether a release ships .ass or
    // .srt. A record written with the wrong extension parses as nothing.
    format: outcome.value.format,
    path: relative,
    providerId: 'nyaa',
    providerItemId: candidate.providerItemId,
    label: outcome.value.fileName || candidate.releaseName,
    addedAt: Date.now(),
  };

  host?.patchItems([item.id], {
    subtitles: [...(item.subtitles ?? []), record],
    subtitlesCheckedAt: Date.now(),
  });
  emit('done', { done: 1, languages: [language] });
  return { ok: true, message: '', lang: language };
}

/**
 * Writes cue text the caller already holds onto a library item as a record.
 *
 * The counterpart to `acceptNyaaCandidate` above, with the network half removed:
 * that one is handed a release id and goes and fetches it, this one is handed
 * the bytes. It exists for the harvest panel, which fetches subtitles for a
 * *catalogue* entry and so has no media item to hang them on — before this, a
 * harvested season could be mined and exported but could never reach the player.
 *
 * It cannot start a transfer, cannot name a provider URL, and cannot read
 * anything off disk: the only thing it does is validate, write, and patch.
 */
export function attachSubtitleText(input: unknown): NyaaSubtitleAcceptResult {
  const parsed = normalizeSubtitleAttachText(input);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const request = parsed.value;

  const item = host?.listItems().find((entry) => entry.id === request.mediaId);
  if (!item) return { ok: false, message: 'That media item is no longer in the library.' };

  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const relative = writeSubtitleFile(
    item.id,
    `harvest-${request.lang}-${stamp}.${request.format}`,
    request.text,
  );
  if (!relative) return { ok: false, message: 'The subtitle could not be written to disk.' };

  const record: SubtitleRecord = {
    id: crypto.randomUUID(),
    lang: request.lang,
    source: 'provider',
    format: request.format,
    path: relative,
    providerId: request.providerId,
    ...(request.providerItemId ? { providerItemId: request.providerItemId } : {}),
    label: request.label,
    addedAt: Date.now(),
  };

  host?.patchItems([item.id], {
    subtitles: [...(item.subtitles ?? []), record],
    subtitlesCheckedAt: Date.now(),
  });
  return { ok: true, message: '', lang: request.lang };
}

/**
 * Attaches a subtitle FILE already on disk to the library item it sits beside.
 *
 * The route behind a dropped or scanned `.srt`/`.ass`. Until 2026-09-03 that
 * import had no route at all: `renderer/fileImportExecute.ts` dispatched a
 * `media:attach-subtitle` CustomEvent whose comment said "the player owns
 * subtitle attachment", and a grep of the whole tree found **one** reference to
 * that name — the dispatch. Nothing listened. The import reported success and
 * navigated to the player, and the file was discarded.
 *
 * Two things it deliberately does NOT do:
 *   - It does not copy. `attachSubtitleText` above writes into userData because
 *     it is handed bytes with nowhere to live; this one is handed a path the
 *     user already manages, so the record references it in place (`external`),
 *     the same shape the sidecar sweep at the top of this file produces. Two
 *     copies of one subtitle drift apart.
 *   - It does not guess an owner. The match is the sidecar rule and only that
 *     rule — same directory, and the subtitle's name starts with the media
 *     file's stem — reused from `findSidecarSubtitles` rather than restated, so
 *     a folder of 24 episodes cannot attach episode 1's track to all of them.
 *     No match is a NAMED refusal; there is no "nearest item" fallback, because
 *     a wrong attachment is worse than none and this surface has no undo.
 */
export function attachSubtitleFile(input: unknown): NyaaSubtitleAcceptResult {
  const filePath = typeof input === 'string'
    ? input
    : (input && typeof input === 'object' && typeof (input as { path?: unknown }).path === 'string'
        ? (input as { path: string }).path
        : '');
  if (!filePath) return { ok: false, message: 'No subtitle file was given.', reason: 'no-path' };

  const format = path.extname(filePath).slice(1).toLowerCase() as SubtitleRecordFormat;
  if (!READABLE_EXTENSIONS.includes(format)) {
    return {
      ok: false,
      message: `${path.extname(filePath) || 'That file'} is not a subtitle format this app can read.`,
      reason: 'unreadable-format',
    };
  }
  try {
    if (!fs.statSync(filePath).isFile()) {
      return { ok: false, message: 'That path is not a file.', reason: 'missing-file' };
    }
  } catch {
    return { ok: false, message: 'That subtitle file is no longer on disk.', reason: 'missing-file' };
  }

  const dir = path.dirname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const owner = (host?.listItems() ?? []).find((entry) => {
    if (typeof entry.path !== 'string' || !entry.path) return false;
    if (path.dirname(entry.path).toLowerCase() !== dir) return false;
    const stem = path.basename(entry.path, path.extname(entry.path));
    return fileName.toLowerCase().startsWith(stem.toLowerCase());
  });
  if (!owner) {
    return {
      ok: false,
      message: `No library item sits beside ${fileName}. Add the video first, then the subtitle attaches to it.`,
      reason: 'no-owner',
    };
  }

  const existing = owner.subtitles ?? [];
  if (existing.some((record) => record.path?.toLowerCase() === filePath.toLowerCase())) {
    return {
      ok: false,
      message: `${fileName} is already attached to ${owner.title ?? owner.fileName}.`,
      reason: 'duplicate',
    };
  }

  const stem = path.basename(owner.path, path.extname(owner.path));
  const lang = guessSidecarLanguage(fileName, stem);
  if (!lang) {
    return {
      ok: false,
      message: `${fileName} does not name a language, so it cannot be filed as one. Rename it like "${stem}.ja${path.extname(filePath)}".`,
      reason: 'no-language',
    };
  }

  const record: SubtitleRecord = {
    id: crypto.randomUUID(),
    lang,
    source: 'sidecar',
    format,
    path: filePath,
    external: true,
    label: fileName,
    hearingImpaired: /\b(sdh|cc|hi)\b/.test(fileName.toLowerCase()),
    addedAt: Date.now(),
  };
  host?.patchItems([owner.id], {
    subtitles: [...existing, record],
    subtitlesCheckedAt: Date.now(),
  });
  return { ok: true, message: '', lang };
}

/**
 * Removes one subtitle track from an item, and its cached file with it.
 *
 * The reverse of every add on this surface — discovery, nyaa accept, transcribe,
 * fuse, attach — none of which had one. Tracks accumulate: an item that has been
 * searched twice and transcribed once carries three, and until now the only way
 * to be rid of a wrong one was to remove the media item itself.
 *
 * The file is deleted only when the app wrote it. An `external` record points at
 * a sidecar sitting next to the user's own video, and deleting that would turn a
 * list-tidying click into data loss.
 */
export function detachSubtitleRecord(mediaId: unknown, recordId: unknown): NyaaSubtitleAcceptResult {
  const id = typeof mediaId === 'string' ? mediaId.trim() : '';
  const record = typeof recordId === 'string' ? recordId.trim() : '';
  if (!id || !record) return { ok: false, message: 'No subtitle track was chosen.' };

  const item = host?.listItems().find((entry) => entry.id === id);
  if (!item) return { ok: false, message: 'That media item is no longer in the library.' };
  const existing = item.subtitles ?? [];
  const target = existing.find((entry) => entry.id === record);
  if (!target) return { ok: false, message: 'That subtitle track is no longer on this item.' };

  // The row goes first. If the unlink below fails — a locked file, a path the
  // user moved — the track is still gone from the item, which is what was asked
  // for; a stale file in the cache is recoverable and a half-removed track is
  // the confusing state.
  host?.patchItems([item.id], { subtitles: existing.filter((entry) => entry.id !== record) });
  if (!target.external) {
    try {
      fs.unlinkSync(path.join(app.getPath('userData'), target.path));
    } catch {
      /* the record is already gone; an orphaned cache file is not worth failing for */
    }
  }
  return { ok: true, message: '', lang: target.lang };
}

export function registerSubtitleDiscoveryIpc(discoveryHost: SubtitleDiscoveryHost): void {
  // Every path in this file that changes an item's tracks goes through
  // `host.patchItems` — the sweep, nyaa accept, attach, detach — so wrapping it
  // once is what lets the automation keep its picks and status current without
  // each path remembering to announce itself.
  host = {
    listItems: () => discoveryHost.listItems(),
    patchItems: (ids, patch) => {
      discoveryHost.patchItems(ids, patch);
      if ('subtitles' in patch) emitEvent({ type: 'records', mediaIds: [...ids] });
    },
  };

  ipcMain.handle('subtitleDiscovery:run', (_e, request?: SubtitleDiscoveryRequest) =>
    runSubtitleDiscovery(request ?? {}));
  ipcMain.handle('subtitleDiscovery:cancel', (_e, mediaId?: string) => {
    cancelSubtitleDiscovery(typeof mediaId === 'string' ? mediaId : undefined);
  });
  ipcMain.handle('subtitleDiscovery:status', () => ({ running: subtitleDiscoveryRunning() }));
  ipcMain.handle('subtitleDiscovery:settings', () => loadDiscoverySettings());
  ipcMain.handle('subtitleDiscovery:saveSettings', (_e, input: unknown) => saveDiscoverySettings(input));
  ipcMain.handle('subtitleDiscovery:credentials', () => credentialStates());
  ipcMain.handle('subtitleDiscovery:setKey', (_e, id: string, key: string) => {
    if (!isNetworkSubtitleProvider(id)) return credentialStates();
    setSubtitleProviderKey(id, typeof key === 'string' ? key : '');
    return credentialStates();
  });
  ipcMain.handle('subtitleDiscovery:test', async (_e, id: string) => {
    if (!isNetworkSubtitleProvider(id)) return { id, ok: true };
    const result = await testSubtitleProvider(id);
    return { id, ...result };
  });
  ipcMain.handle(
    'subtitleDiscovery:nyaaList',
    (_e, mediaId: string, acquisition: unknown, languages?: string[]) =>
      listNyaaCandidates(mediaId, acquisition, Array.isArray(languages) ? languages : undefined),
  );
  ipcMain.handle(
    'subtitleDiscovery:nyaaAccept',
    (_e, mediaId: string, candidateId: string, acquisition: unknown, lang: string) =>
      acceptNyaaCandidate(mediaId, candidateId, acquisition, typeof lang === 'string' ? lang : 'ja'),
  );
  /**
   * Attaches cue text the renderer already holds. Sits beside `nyaaAccept` and
   * is deliberately not folded into it: that handler is given a release id and
   * goes to the network, this one is given the bytes and cannot reach it.
   */
  ipcMain.handle('subtitleDiscovery:attachText', (_e, input: unknown) => attachSubtitleText(input));
  /**
   * Attaches a subtitle file already on disk. The route behind a dropped
   * `.srt`/`.ass`, which before this had none at all — see `attachSubtitleFile`.
   */
  ipcMain.handle('subtitleDiscovery:attachFile', (_e, input: unknown) => attachSubtitleFile(input));
  /** The reverse of every add on this surface. See `detachSubtitleRecord`. */
  ipcMain.handle('subtitleDiscovery:detach', (_e, mediaId: unknown, recordId: unknown) =>
    detachSubtitleRecord(mediaId, recordId));
  /** Reads a stored record's cue text, for the player and the study tools. */
  ipcMain.handle('subtitleDiscovery:read', (_e, mediaId: string, recordId: string) => {
    const item = host?.listItems().find((entry) => entry.id === mediaId);
    const record = item?.subtitles?.find((entry) => entry.id === recordId);
    if (!record) return null;
    const text = readSubtitleRecord(record);
    return text === null ? null : { name: record.label ?? record.lang, text };
  });
}

export const __subtitleDiscoveryTestables = {
  scoreCandidates, toProvidersDocument, recentlyFailed, hasLanguage, retainedOnForce,
  hasUnattachedSidecar, keptFailures,
};
