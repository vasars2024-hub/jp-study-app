/**
 * The metadata sweep: group the library into titles, ask a provider about each,
 * score the answer, and apply it.
 *
 * Structured after `bookOcrJob.ts` — module-level `running`/`cancelled` sets, a
 * broadcast to every live window, cooperative cancellation checked at the top of
 * each unit of work, and a `finally` that always clears state. The unit of work
 * here is a *title*, not a file: a 26-episode folder is one provider lookup, and
 * the `running` set keyed by series key is what stops a re-import or a second
 * click from starting a duplicate sweep.
 *
 * Match scoring is delegated to `shared/mediaMetadataMatch.ts` so the rules are
 * unit-tested without a network, and so a low-confidence answer is *flagged*
 * rather than silently trusted.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { mediaCategory } from '../shared/mediaCategories';
import {
  METADATA_ACCEPT_CONFIDENCE,
  formatFromReleaseKind,
  metadataMatchDisposition,
  pickMetadataMatch,
  scoreMetadataCandidate,
} from '../shared/mediaMetadataMatch';
import {
  estimateEtaMs,
  type MediaMetadataPhase,
  type MediaMetadataProgress,
  type MediaMetadataProviderId,
  type MediaMetadataRequest,
  type MediaMetadataResult,
  type MediaMetadataSearchHit,
} from '../shared/mediaMetadataIpc';
import type { MediaItem } from '../shared/types';
import {
  anilistById,
  anilistSearch,
  artworkName,
  clearMetadataCache,
  downloadArtwork,
  jikanById,
  jikanEpisodeInfo,
  jikanSearch,
  type ProviderWork,
} from './mediaProviderClients';
import { providerSearchTitle } from '../shared/mediaFileIdentity';

/** Injected by `media.ts`, which owns the JSON store and the change broadcast. */
export interface MediaMetadataHost {
  listItems: () => MediaItem[];
  /** Applies a patch to every given id, persists once, and broadcasts. */
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
  /** Applies a *different* patch per id, still persisting and broadcasting once. */
  patchEachItem: (entries: ReadonlyArray<readonly [string, Partial<MediaItem>]>) => void;
}

let host: MediaMetadataHost | null = null;

/** Series keys with a sweep in flight, so a double-run cannot duplicate work. */
const running = new Set<string>();
/** Series keys asked to stop. */
const cancelled = new Set<string>();
/** True while a whole-library sweep is active, for the status channel. */
let sweeping = false;

function broadcast(progress: MediaMetadataProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mediaMetadata:progress', progress);
  }
}

/** Only anime-ish categories have a provider worth asking. */
const LOOKUP_CATEGORIES = new Set(['anime', 'tv', 'drama']);

interface TitleGroup {
  seriesKey: string;
  title: string;
  ids: string[];
  year: number | null;
  episodeCount: number;
  format: string | null;
}

/**
 * Collapses the library into the titles worth looking up.
 *
 * Keyed on `seriesKey` because that is what the import parser already produced
 * and what the library groups by — asking per file would mean 26 identical
 * lookups for one show.
 */
function groupTitles(items: readonly MediaItem[], only?: Set<string>): TitleGroup[] {
  const groups = new Map<string, TitleGroup>();
  for (const item of items) {
    if (only && !only.has(item.id)) continue;
    if (!LOOKUP_CATEGORIES.has(mediaCategory(item))) continue;
    const seriesKey = item.seriesKey?.trim();
    // The same stored-title defect the provider searches had: `seriesTitle` is
    // written by whatever parser ran at import, so an acquired file can carry an
    // episode range into the one lookup that would give it a `malId` — and
    // without a `malId` the alias walk, the episode floor and Jimaku's exact
    // match are all dead for exactly the files this app downloads itself.
    const title = providerSearchTitle(item.seriesTitle?.trim() || item.title?.trim() || '');
    if (!seriesKey || !title) continue;

    const existing = groups.get(seriesKey);
    if (existing) {
      existing.ids.push(item.id);
      existing.episodeCount += 1;
      if (existing.year === null && typeof item.year === 'number') existing.year = item.year;
      continue;
    }
    groups.set(seriesKey, {
      seriesKey,
      title,
      ids: [item.id],
      year: typeof item.year === 'number' ? item.year : null,
      episodeCount: 1,
      format: formatFromReleaseKind(item.episodeKind),
    });
  }
  return [...groups.values()];
}

/** Whether a group already has metadata, so a non-forced sweep can skip it. */
function alreadyFetched(items: readonly MediaItem[], group: TitleGroup): boolean {
  const first = items.find((item) => item.id === group.ids[0]);
  return Boolean(first?.metadataUpdatedAt && first.metadataSource);
}

/**
 * A matched series still missing per-episode data.
 *
 * This is the outage case, and it used to be permanent: Jikan goes down, AniList
 * answers, the series gets stamped as fetched — but AniList carries no episode
 * titles, and `alreadyFetched` then skips the title forever. Since AniList *does*
 * hand back a MyAnimeList id, the missing piece is recoverable on its own without
 * re-running the match.
 */
function needsEpisodeBackfill(items: readonly MediaItem[], group: TitleGroup): boolean {
  const first = items.find((item) => item.id === group.ids[0]);
  // Needs a MyAnimeList id (the only source of episode titles), a settled match,
  // and no titles yet. An unmatched series has nothing to top up.
  if (!first?.malId) return false;
  if (!first.metadataUpdatedAt || !first.metadataSource) return false;
  if (first.metadataSource === 'unmatched') return false;
  return Object.keys(first.episodeTitles ?? {}).length === 0;
}

/** Re-attempts only the episode fetch for an already-matched series. */
async function backfillEpisodes(group: TitleGroup, malId: number): Promise<boolean> {
  if (!host) return false;
  const info = await jikanEpisodeInfo(malId);
  if (Object.keys(info).length === 0) return false;

  const titles: Record<string, string> = {};
  for (const [number, entry] of Object.entries(info)) {
    if (entry.title) titles[number] = entry.title;
  }
  if (Object.keys(titles).length > 0) host.patchItems(group.ids, { episodeTitles: titles });

  const wanted = new Set(group.ids);
  const perEpisode: Array<readonly [string, Partial<MediaItem>]> = [];
  for (const item of host.listItems()) {
    if (!wanted.has(item.id) || typeof item.episode !== 'number') continue;
    const airedAt = info[String(item.episode)]?.airedAt;
    if (airedAt !== undefined && item.airedAt !== airedAt) {
      perEpisode.push([item.id, { airedAt }] as const);
    }
  }
  host.patchEachItem(perEpisode);
  return Object.keys(titles).length > 0 || perEpisode.length > 0;
}

async function searchProviders(title: string): Promise<ProviderWork[]> {
  // Jikan first: it is the MyAnimeList data the user asked for, and it carries
  // per-episode titles. AniList only fills in when Jikan returns nothing, so the
  // common path costs one provider, not two.
  // `null` from either provider means it never answered; here that is the same
  // as having nothing to offer, because this path only ever patches fields it
  // actually received.
  const primary = await jikanSearch(title);
  if (primary && primary.length > 0) return primary;
  return (await anilistSearch(title)) ?? [];
}

/** Turns an applied provider answer into the fields persisted on every file. */
async function buildPatch(
  group: TitleGroup,
  work: ProviderWork,
  confidence: number,
  emit: (phase: MediaMetadataPhase) => void,
): Promise<{ patch: Partial<MediaItem>; episodeAirDates: Record<string, { airedAt?: number }> }> {
  let episodeAirDates: Record<string, { airedAt?: number }> = {};
  const patch: Partial<MediaItem> = {
    seriesTitle: work.displayTitle || group.title,
    nativeTitle: work.nativeTitle,
    synopsis: work.synopsis,
    year: work.year,
    format: work.format,
    status: work.status,
    episodeCount: work.episodeCount,
    genres: work.genres?.length ? work.genres : undefined,
    studio: work.studio,
    rating: work.rating,
    rank: work.rank,
    relatedTitles: work.relatedTitles?.length ? work.relatedTitles : undefined,
    malId: work.malId,
    anilistId: work.anilistId,
    metadataSource: work.provider,
    metadataUpdatedAt: Date.now(),
    metadataConfidence: confidence,
  };

  // Episode titles are MyAnimeList-only and one extra request, so they are
  // fetched only when the match is solid — a wrong show's episode names are
  // more misleading than none at all.
  if (work.malId && confidence >= METADATA_ACCEPT_CONFIDENCE) {
    emit('fetching-episodes');
    const info = await jikanEpisodeInfo(work.malId);
    const titles: Record<string, string> = {};
    for (const [number, entry] of Object.entries(info)) {
      if (entry.title) titles[number] = entry.title;
    }
    if (Object.keys(titles).length > 0) patch.episodeTitles = titles;
    // Air dates are per episode, so they cannot ride the shared group patch —
    // handed back for the caller to apply file by file.
    episodeAirDates = info;
  }

  emit('downloading-art');
  // Identifies which work the art belongs to, so re-matching writes a new file
  // rather than reusing the previous match's cached image.
  const workKey = `${work.provider}:${work.id}`;
  if (work.posterUrl) {
    const poster = await downloadArtwork(work.posterUrl, artworkName('poster', group.seriesKey, workKey));
    if (poster) patch.posterPath = poster;
  }
  if (work.bannerUrl) {
    const banner = await downloadArtwork(work.bannerUrl, artworkName('banner', group.seriesKey, workKey));
    if (banner) patch.bannerPath = banner;
  }

  // Undefined keys would otherwise clobber good values with nothing.
  for (const key of Object.keys(patch) as Array<keyof MediaItem>) {
    if (patch[key] === undefined) delete patch[key];
  }
  return { patch, episodeAirDates };
}

export function cancelMediaMetadata(seriesKey?: string): void {
  if (seriesKey) {
    if (running.has(seriesKey)) cancelled.add(seriesKey);
    return;
  }
  for (const key of running) cancelled.add(key);
}

export function mediaMetadataRunning(): boolean {
  return sweeping || running.size > 0;
}

export async function runMediaMetadata(request: MediaMetadataRequest = {}): Promise<MediaMetadataResult> {
  if (!host) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'Media metadata host is not registered.' };
  if (sweeping) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'A metadata sweep is already running.' };

  // Claimed before the first `await`. The backfill pass below awaits, so leaving
  // the flag until after it would let a second caller slip past the guard above
  // and run the same rate-limited requests concurrently.
  sweeping = true;
  try {
    return await sweep(request);
  } finally {
    sweeping = false;
    running.clear();
    cancelled.clear();
  }
}

async function sweep(request: MediaMetadataRequest): Promise<MediaMetadataResult> {
  if (!host) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'Media metadata host is not registered.' };

  const items = host.listItems();
  const only = request.mediaIds?.length ? new Set(request.mediaIds) : undefined;
  const allGroups = groupTitles(items, only);
  let groups = allGroups;
  // Series that are matched but missing episode data — topped up separately,
  // because they need one cheap request rather than a whole re-match.
  let backfill: TitleGroup[] = [];
  if (!request.force && !request.override) {
    groups = allGroups.filter((group) => !alreadyFetched(items, group));
    backfill = allGroups.filter((group) => needsEpisodeBackfill(items, group));
  }

  for (const group of backfill) {
    const malId = items.find((item) => item.id === group.ids[0])?.malId;
    if (!malId) continue;
    try {
      await backfillEpisodes(group, malId);
    } catch {
      // Still down: nothing is stamped, so the next sweep tries again.
    }
  }

  if (groups.length === 0) return { ok: true, matched: 0, review: 0, unmatched: 0 };

  const startedAt = Date.now();
  let matched = 0;
  let review = 0;
  let unmatched = 0;
  let done = 0;

  {
    for (const group of groups) {
      if (running.has(group.seriesKey)) continue;
      running.add(group.seriesKey);
      cancelled.delete(group.seriesKey);

      const emit = (phase: MediaMetadataPhase, extra: Partial<MediaMetadataProgress> = {}): void =>
        broadcast({
          seriesKey: group.seriesKey,
          title: group.title,
          phase,
          done,
          total: groups.length,
          etaMs: estimateEtaMs(done, groups.length, Date.now() - startedAt),
          ...extra,
        });

      try {
        if (cancelled.has(group.seriesKey)) {
          emit('cancelled');
          continue;
        }

        emit('searching');
        let work: ProviderWork | null = null;
        let confidence = 1;

        if (request.override) {
          // A manual correction is the user's decision, so it is applied at full
          // confidence without re-scoring it against the file name.
          work = request.override.provider === 'anilist'
            ? await anilistById(request.override.id)
            : await jikanById(request.override.id);
        } else {
          const candidates = await searchProviders(group.title);
          if (cancelled.has(group.seriesKey)) {
            emit('cancelled');
            continue;
          }
          emit('matching');
          const best = pickMetadataMatch(
            {
              title: group.title,
              year: group.year,
              episodeCount: group.episodeCount,
              format: group.format,
            },
            candidates,
          );
          if (best) {
            work = best.candidate;
            confidence = best.confidence;
          }
        }

        if (!work) {
          unmatched += 1;
          // Stamped so a later non-forced sweep does not re-ask a title that has
          // no answer — that is the "store failures" requirement.
          host.patchItems(group.ids, {
            metadataSource: 'unmatched',
            metadataUpdatedAt: Date.now(),
            metadataConfidence: 0,
          });
          done += 1;
          emit('done', { confidence: 0 });
          continue;
        }

        const disposition = metadataMatchDisposition(confidence);
        if (disposition === 'reject') {
          unmatched += 1;
          host.patchItems(group.ids, {
            metadataSource: 'unmatched',
            metadataUpdatedAt: Date.now(),
            metadataConfidence: confidence,
          });
          done += 1;
          emit('done', { confidence });
          continue;
        }

        const { patch, episodeAirDates } = await buildPatch(group, work, confidence, (phase) => emit(phase, { confidence }));
        if (cancelled.has(group.seriesKey)) {
          emit('cancelled');
          continue;
        }
        host.patchItems(group.ids, patch);

        // Then the per-episode facts, which differ file by file. Collected first
        // and written in one go: `media.json` is rewritten whole on every save, so
        // patching 26 episodes individually would be 26 full-file writes and 26
        // renderer re-renders for one logical change.
        if (Object.keys(episodeAirDates).length > 0) {
          const wanted = new Set(group.ids);
          const perEpisode: Array<readonly [string, Partial<MediaItem>]> = [];
          for (const item of host.listItems()) {
            if (!wanted.has(item.id) || typeof item.episode !== 'number') continue;
            const airedAt = episodeAirDates[String(item.episode)]?.airedAt;
            if (airedAt !== undefined && item.airedAt !== airedAt) {
              perEpisode.push([item.id, { airedAt }] as const);
            }
          }
          host.patchEachItem(perEpisode);
        }
        if (disposition === 'accept') matched += 1;
        else review += 1;
        done += 1;
        emit('done', { confidence });
      } catch (error) {
        // One title that fails must not abandon the rest of the sweep.
        unmatched += 1;
        done += 1;
        emit('error', { error: error instanceof Error ? error.message : String(error) });
      } finally {
        running.delete(group.seriesKey);
        cancelled.delete(group.seriesKey);
      }
    }
  }

  return { ok: true, matched, review, unmatched };
}

/**
 * Search results for the manual-correction dialog, scored against the local title
 * so the picker can show how well each option fits.
 */
export async function searchMediaMetadata(query: string): Promise<MediaMetadataSearchHit[]> {
  const title = query.trim();
  if (!title) return [];
  const candidates = await searchProviders(title);
  return candidates.map((work) => {
    const { confidence } = scoreMetadataCandidate({ title }, work);
    return {
      provider: work.provider,
      id: work.id,
      title: work.displayTitle,
      nativeTitle: work.nativeTitle,
      year: work.year,
      format: work.format,
      episodeCount: work.episodeCount,
      imageUrl: work.posterUrl,
      confidence,
    };
  }).sort((a, b) => b.confidence - a.confidence);
}

export function registerMediaMetadataIpc(mediaHost: MediaMetadataHost): void {
  host = mediaHost;

  ipcMain.handle('mediaMetadata:run', (_e, request?: MediaMetadataRequest) =>
    runMediaMetadata(request ?? {}));
  ipcMain.handle('mediaMetadata:cancel', (_e, seriesKey?: string) => {
    cancelMediaMetadata(typeof seriesKey === 'string' ? seriesKey : undefined);
  });
  ipcMain.handle('mediaMetadata:status', () => ({ running: mediaMetadataRunning() }));
  ipcMain.handle('mediaMetadata:search', (_e, query: string) =>
    searchMediaMetadata(typeof query === 'string' ? query : ''));
  ipcMain.handle('mediaMetadata:clearCache', () => {
    clearMetadataCache();
  });
}

/** Exposed for tests: the grouping rule is worth pinning without a network. */
export const __mediaMetadataTestables = { groupTitles, alreadyFetched, needsEpisodeBackfill };

export type { MediaMetadataProviderId };
