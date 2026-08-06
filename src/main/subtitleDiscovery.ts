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
import { matchSubtitleTracks } from '../shared/subtitleMatching';
import {
  normalizeSubtitleIdentityId,
  type SubtitleProvidersDocument,
  type SubtitleTrack,
} from '../shared/subtitleProviders';
import {
  DEFAULT_SUBTITLE_DISCOVERY_SETTINGS,
  estimateEtaMs,
  isNetworkSubtitleProvider,
  normalizeSubtitleDiscoverySettings,
  orderedSubtitleProviders,
  type SubtitleDiscoveryPhase,
  type SubtitleDiscoveryProgress,
  type SubtitleDiscoveryRequest,
  type SubtitleDiscoveryResult,
  type SubtitleDiscoverySettings,
  type SubtitleProviderCredentialState,
  type SubtitleProviderExecutionId,
} from '../shared/subtitleDiscoveryIpc';
import type { SubtitleRecord, SubtitleSearchFailure } from '../shared/subtitleRecord';
import type { MediaItem } from '../shared/types';
import {
  extractEmbeddedSubtitle,
  findSidecarSubtitles,
  listEmbeddedSubtitleStreams,
  normalizeStreamLanguage,
} from './subtitleLocalSources';
import {
  fetchSubtitleCandidate,
  hasSubtitleProviderKey,
  jimakuSearch,
  openSubtitlesSearch,
  setSubtitleProviderKey,
  testSubtitleProvider,
  type ProviderSubtitleCandidate,
} from './subtitleProviderClients';
import { osdbHashFile } from './osdbHash';
import { enqueueTranscription } from './transcriptionJobs';

export interface SubtitleDiscoveryHost {
  listItems: () => MediaItem[];
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
}

let host: SubtitleDiscoveryHost | null = null;

const running = new Set<string>();
const cancelled = new Set<string>();
let sweeping = false;

function broadcast(progress: SubtitleDiscoveryProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('subtitleDiscovery:progress', progress);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'subtitle-discovery.json');
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
  const safe = mediaId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join('subtitles', safe);
}

/** Writes a cue file into the cache and returns its userData-relative path. */
function writeSubtitleFile(mediaId: string, name: string, text: string): string | null {
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
 */
export function pickPlaybackSubtitle(
  records: readonly SubtitleRecord[] | undefined,
  preferredLang = 'ja',
): SubtitleRecord | null {
  if (!records?.length) return null;
  const base = preferredLang.slice(0, 2).toLowerCase();
  const sourceRank: Record<SubtitleRecord['source'], number> = {
    embedded: 0,
    sidecar: 1,
    provider: 2,
    generated: 3,
  };
  return [...records].sort((a, b) => {
    const aPreferred = a.lang.toLowerCase().startsWith(base) ? 0 : 1;
    const bPreferred = b.lang.toLowerCase().startsWith(base) ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    const bySource = sourceRank[a.source] - sourceRank[b.source];
    if (bySource !== 0) return bySource;
    // Higher confidence first; records without one (embedded/sidecar) are not
    // penalised, since they already won on source.
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  })[0] ?? null;
}

/** Drops cached subtitle files for the given media ids. */
export function clearSubtitleCache(ids: Set<string>): void {
  const root = path.join(app.getPath('userData'), 'subtitles');
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
  const accepted: ScoredCandidate[] = [];
  for (const match of result.candidates) {
    const candidate = byId.get(match.trackId);
    if (!candidate) continue;
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
 */
const NON_EVIDENTIAL_FAILURES = new Set(['no-key']);

function recentlyFailed(item: MediaItem, providerId: string, lang: string, retryAfterDays: number): boolean {
  const cutoff = Date.now() - retryAfterDays * DAY_MS;
  return (item.subtitleFailures ?? []).some((failure) =>
    failure.providerId === providerId
    && failure.lang === lang
    && !NON_EVIDENTIAL_FAILURES.has(failure.reason)
    && failure.attemptedAt > cutoff);
}

function hasLanguage(records: readonly SubtitleRecord[], lang: string): boolean {
  const base = lang.slice(0, 2);
  return records.some((record) => record.lang.startsWith(base));
}

async function discoverForItem(
  item: MediaItem,
  settings: SubtitleDiscoverySettings,
  languages: string[],
  force: boolean,
  emit: (phase: SubtitleDiscoveryPhase, extra?: Partial<SubtitleDiscoveryProgress>) => void,
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

    // Nothing left to look for.
    const missing = languages.filter((lang) => !hasLanguage(records, lang));
    if (missing.length === 0) break;

    if (providerId === 'embedded') {
      emit('probing-embedded');
      const streams = await listEmbeddedSubtitleStreams(item.path);
      for (const stream of streams) {
        const lang = normalizeStreamLanguage(stream.language);
        // An untagged stream is kept only when we still need something: it is
        // usually the main track in a single-subtitle release.
        const target = lang ?? (missing.length === 1 ? missing[0] : null);
        if (!target || !missing.includes(target)) continue;
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
        const target = sidecar.language ?? (missing.length === 1 ? missing[0] : null);
        if (!target || !missing.includes(target) || known.has(sidecar.path)) continue;
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

    if (!isNetworkSubtitleProvider(providerId)) continue;
    if (!hasSubtitleProviderKey(providerId)) {
      failures.push({ providerId, lang: missing.join(','), attemptedAt: Date.now(), reason: 'no-key' });
      continue;
    }

    // `force` means the user asked for this search again, explicitly. Honouring
    // the back-off there would make the one control that exists for "try again
    // now" do nothing at all — which is what it did before: `force` dropped the
    // stored records and marked the item eligible, then this gate skipped the
    // provider anyway, so a forced re-search silently searched nothing.
    const wanted = force
      ? missing
      : missing.filter((lang) => !recentlyFailed(item, providerId, lang, settings.retryAfterDays));
    if (wanted.length === 0) continue;

    emit('searching-providers', { providerId });
    let candidates: ProviderSubtitleCandidate[] = [];
    try {
      if (providerId === 'jimaku') {
        // Japanese-only provider; asking it for anything else is a wasted request.
        if (!wanted.some((lang) => lang.startsWith('ja'))) continue;
        candidates = await jimakuSearch(item.anilistId, item.seriesTitle ?? item.title, item.episode ?? null);
      } else {
        const hashed = await osdbHashFile(item.path);
        candidates = await openSubtitlesSearch({
          title: item.seriesTitle ?? item.title,
          season: item.season ?? null,
          episode: item.episode ?? null,
          languages: wanted,
          movieHash: hashed?.hash ?? null,
        });
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
    emit('matching', { providerId });

    for (const lang of wanted) {
      const scored = scoreCandidates(candidates, item, lang, settings.minConfidence);
      const best = scored.find((entry) => !known.has(entry.candidate.providerItemId));
      if (!best) {
        failures.push({ providerId, lang, attemptedAt: Date.now(), reason: 'no-match' });
        continue;
      }
      // Only attach automatically for languages the user opted into.
      if (!settings.autoDownloadLanguages.includes(lang)) continue;

      emit('downloading', { providerId });
      const text = await fetchSubtitleCandidate(best.candidate);
      if (!text) {
        failures.push({ providerId, lang, attemptedAt: Date.now(), reason: 'download-failed' });
        continue;
      }
      known.add(best.candidate.providerItemId);
      const relative = writeSubtitleFile(
        item.id,
        `${providerId}-${lang}-${best.candidate.providerItemId.replace(/[^a-zA-Z0-9]/g, '')}.${best.candidate.format}`,
        text,
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
function eligible(item: MediaItem): boolean {
  return (item.kind ?? 'video') === 'video' && !item.sourceUrl;
}

export async function runSubtitleDiscovery(
  request: SubtitleDiscoveryRequest = {},
): Promise<SubtitleDiscoveryResult> {
  if (!host) return { ok: false, attached: 0, empty: 0, files: 0, error: 'Subtitle discovery host is not registered.' };
  if (sweeping) return { ok: false, attached: 0, empty: 0, files: 0, error: 'A subtitle sweep is already running.' };

  const settings = loadDiscoverySettings();
  const languages = (request.languages?.length ? request.languages : settings.autoDownloadLanguages)
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);
  if (languages.length === 0) return { ok: true, attached: 0, empty: 0, files: 0 };

  const only = request.mediaIds?.length ? new Set(request.mediaIds) : undefined;
  const items = host.listItems().filter((item) => {
    if (only && !only.has(item.id)) return false;
    if (!eligible(item)) return false;
    if (request.force) return true;
    // Skip anything that already has every wanted language.
    return !languages.every((lang) => hasLanguage(item.subtitles ?? [], lang));
  });

  if (items.length === 0) return { ok: true, attached: 0, empty: 0, files: 0 };

  sweeping = true;
  const startedAt = Date.now();
  let attached = 0;
  let empty = 0;
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
        const outcome = await discoverForItem(item, settings, languages, request.force === true, emit);
        if (cancelled.has(item.id)) {
          emit('cancelled');
          continue;
        }

        // Nothing found and the user asked for a fallback: queue Whisper. This is
        // the only thing that makes the autoTranscribe setting do anything.
        const foundJapanese = outcome.records.some((record) => /^ja/i.test(record.lang));
        if (!foundJapanese && settings.autoTranscribe && languages.some((lang) => lang.startsWith('ja'))) {
          enqueueTranscription({ mediaId: item.id, lang: 'ja' });
        }

        const gained = outcome.records.length > (item.subtitles?.length ?? 0);
        if (gained) attached += 1;
        else empty += 1;
        files += outcome.files;

        host.patchItems([item.id], {
          subtitles: outcome.records,
          // Failures accumulate but are bounded, so the record cannot grow forever.
          subtitleFailures: [...(item.subtitleFailures ?? []), ...outcome.failures].slice(-24),
          subtitlesCheckedAt: Date.now(),
        });
        done += 1;
        emit('done', { languages: [...new Set(outcome.records.map((record) => record.lang))].sort() });
      } catch (error) {
        done += 1;
        empty += 1;
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
  }

  return { ok: true, attached, empty, files };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function credentialStates(): SubtitleProviderCredentialState[] {
  return (['embedded', 'sidecar', 'jimaku', 'opensubtitles'] as SubtitleProviderExecutionId[]).map((id) => ({
    id,
    requiresKey: isNetworkSubtitleProvider(id),
    hasKey: isNetworkSubtitleProvider(id) ? hasSubtitleProviderKey(id) : true,
  }));
}

export function registerSubtitleDiscoveryIpc(discoveryHost: SubtitleDiscoveryHost): void {
  host = discoveryHost;

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
};
