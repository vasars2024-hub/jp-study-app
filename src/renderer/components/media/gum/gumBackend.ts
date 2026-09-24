/**
 * The media library's adapter onto the backend — the ONE place that knows which
 * IPC exists yet.
 *
 * Live today (preload + main registered):
 *  - watch library: `watchList` / `watchUpdate` / `watchAdd` / `watchImportFile` /
 *    `watchChooseImportFile` / `watchImportHistory` / `onWatchChanged`;
 *  - ingest: `onMediaIngested`, `mediaIngestState` / `…AddFolder` / `…RemoveFolder` /
 *    `…SetAutoImport` / `onMediaIngestState`;
 *  - subtitles: `subtitleAutoStatus` / `onSubtitleAutoStatus`, `subtitleAutoNotices` /
 *    `dismissSubtitleAutoNotice` / `onSubtitleAutoNotices`, `prepareSubtitles`;
 *  - artwork: `mediaArtwork(id, 'poster' | 'banner' | 'still')`.
 *
 * Not wired yet — each is read through `optionalApi()` so the UI degrades to what
 * the media items themselves say, and each has a TODO(lead) naming the call:
 *  - artwork for a tracked title with no local file (`watch:artwork`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchQueryResult, WatchTitlePatch, WatchTitleView, WatchStatus } from '../../../../shared/watchLibrary';
import type { MediaIngestedEvent, MediaIngestState } from '../../../../shared/mediaIngest';
import type { SubtitleAutoNotice, SubtitleAutoNotices, SubtitleAutoStatus } from '../../../../shared/subtitleDiscoveryStatus';
import type { MediaItem } from '../../../../shared/types';
import {
  createPlaybackHandoff,
  selectExternalPlayerProfile,
  type ExternalPlayerProfile,
  type PlaybackHandoff,
} from '../../../../shared/externalPlayer';
import { loadExternalPlayerPreferences } from '../../../externalPlayerStore';
import type { GumTitle } from './gumModel';
import { GUM_JUST_ADDED_KEY, normalizeArrivals, recordArrival, type GumArrival } from './gumLayout';

/**
 * Calls the other engineers are adding. Typed here, not in `window.d.ts`, so this
 * file compiles whether or not they have landed; once they have, the lead can drop
 * the matching member and call `window.api` directly.
 */
interface OptionalApi {
  /** Stored poster / banner for a tracked title with no local file (`watch:artwork`). */
  watchArtwork?: (titleId: string, variant: 'poster' | 'banner') => Promise<string | null>;
}

export function optionalApi(): OptionalApi {
  return (typeof window !== 'undefined' ? (window.api as unknown as OptionalApi | undefined) : undefined) ?? {};
}

// ---------------------------------------------------------------------------
// Watch library
// ---------------------------------------------------------------------------

export interface WatchLibraryState {
  views: WatchTitleView[];
  /** The first answer arrived (or the API is missing). */
  ready: boolean;
  /** `watch:list` exists in this build. */
  available: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Every tracked title, re-read on `watch:changed`. One unpaged read: filtering and
 * sorting happen in the renderer so search is instant, and the payload for a 1,400
 * title import is a few hundred KB.
 */
export function useWatchLibrary(): WatchLibraryState {
  const available = typeof window !== 'undefined' && typeof window.api?.watchList === 'function';
  const [views, setViews] = useState<WatchTitleView[]>([]);
  const [ready, setReady] = useState(!available);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const live = useRef(true);

  const load = useCallback(() => {
    if (!available) return;
    void window.api.watchList({})
      .then((result: WatchQueryResult) => {
        if (!live.current) return;
        setViews(result.items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (live.current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (live.current) setReady(true);
      });
  }, [available]);

  const reload = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    // Coalesces a burst (an import broadcasts once per batch, local progress per file).
    timer.current = window.setTimeout(() => {
      timer.current = null;
      load();
    }, 120);
  }, [load]);

  useEffect(() => {
    live.current = true;
    load();
    const off = typeof window.api?.onWatchChanged === 'function' ? window.api.onWatchChanged(() => reload()) : undefined;
    return () => {
      live.current = false;
      off?.();
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [load, reload]);

  return { views, ready, available, error, reload };
}

/** A refused edit, with the catalogue key the main process sent. */
export class WatchEditError extends Error {
  constructor(message: string, readonly errorKey?: string, readonly errorParams?: Record<string, string>) {
    super(message);
  }
}

/**
 * Edits a title's tracking. An untracked local title is tracked first (built from
 * its first file, so the main-process matcher links the rest), then patched.
 */
export async function updateGumTitle(title: GumTitle, patch: WatchTitlePatch): Promise<void> {
  let id = title.watchId;
  if (!id) {
    const seed = title.items[0];
    if (!seed || typeof window.api?.watchAdd !== 'function') throw new WatchEditError('not-trackable', 'watchLibrary.error.notTrackable');
    const status: WatchStatus = patch.status ?? title.status ?? 'plan';
    const added = await window.api.watchAdd({ fromMediaItemId: seed.id, status });
    if (!added.ok) throw new WatchEditError(added.error, added.errorKey, added.errorParams);
    id = added.title.id;
    const { status: _status, ...rest } = patch;
    void _status;
    if (Object.keys(rest).length === 0) {
      if (status === 'watching' || status === 'rewatching') prepareWatching(title);
      return;
    }
    patch = rest;
  }
  const result = await window.api.watchUpdate(id, patch);
  if (!result.ok) throw new WatchEditError(result.error, result.errorKey, result.errorParams);
  if (patch.status === 'watching' || patch.status === 'rewatching') prepareWatching(title);
}

/**
 * Starting a show gets its next episodes' subtitles ready (helper line, translation,
 * fusion) before they are played — by series key when the files have one, else by
 * id. Fire-and-forget: progress arrives on `onSubtitleAutoStatus`.
 */
export function prepareWatching(title: GumTitle): void {
  if (typeof window.api?.prepareSubtitles !== 'function' || !title.items.length) return;
  const seriesKey = title.items.find((item) => item.seriesKey)?.seriesKey;
  const request = seriesKey
    ? { seriesKey, reason: 'watching' as const }
    : { mediaIds: title.items.map((item) => item.id), reason: 'watching' as const };
  void window.api.prepareSubtitles(request).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Arrivals (Just added + the download-finished toast)
// ---------------------------------------------------------------------------

function readArrivals(now: number): GumArrival[] {
  try {
    const raw = localStorage.getItem(GUM_JUST_ADDED_KEY);
    return raw ? normalizeArrivals(JSON.parse(raw), now) : [];
  } catch {
    return [];
  }
}

function writeArrivals(arrivals: GumArrival[]): void {
  try {
    localStorage.setItem(GUM_JUST_ADDED_KEY, JSON.stringify(arrivals));
  } catch {
    // Just added still works for this session.
  }
}

export function arrivalFromEvent(event: MediaIngestedEvent): GumArrival {
  return {
    at: event.at,
    itemIds: event.itemIds,
    title: event.summary.title,
    season: event.summary.season,
    episode: event.summary.episode,
    episodeEnd: event.summary.episodeEnd,
    source: event.source,
  };
}

export interface ArrivalFeed {
  arrivals: GumArrival[];
  /** The newest announcement not yet dismissed — the toast. */
  latest: MediaIngestedEvent | null;
  dismiss: () => void;
}

export function useArrivals(): ArrivalFeed {
  const [arrivals, setArrivals] = useState<GumArrival[]>(() => readArrivals(Date.now()));
  const [latest, setLatest] = useState<MediaIngestedEvent | null>(null);
  useEffect(() => {
    if (typeof window.api?.onMediaIngested !== 'function') return undefined;
    return window.api.onMediaIngested((event) => {
      if (!event?.itemIds?.length) return;
      setArrivals((current) => {
        const next = recordArrival(current, arrivalFromEvent(event), Date.now());
        writeArrivals(next);
        return next;
      });
      setLatest(event);
    });
  }, []);
  // Another Media Center window recorded one.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === GUM_JUST_ADDED_KEY) setArrivals(readArrivals(Date.now()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return { arrivals, latest, dismiss: useCallback(() => setLatest(null), []) };
}

// ---------------------------------------------------------------------------
// Ingest settings (Import page → Automatic)
// ---------------------------------------------------------------------------

export function useIngestState(): { state: MediaIngestState | null; set: (next: MediaIngestState) => void } {
  const [state, setState] = useState<MediaIngestState | null>(null);
  useEffect(() => {
    let live = true;
    void window.api?.mediaIngestState?.()
      .then((next) => { if (live) setState(next); })
      .catch(() => undefined);
    const off = window.api?.onMediaIngestState?.((next) => setState(next));
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return { state, set: setState };
}

// ---------------------------------------------------------------------------
// Subtitle automation: per-item status and the one fixable notice
// ---------------------------------------------------------------------------

export type GumSubtitleStatus = Pick<SubtitleAutoStatus, 'ja' | 'en' | 'source' | 'machineTranslated' | 'helperLang' | 'notice'>;

/**
 * Per-item subtitle status (`subtitleAuto:status`), kept live by
 * `onSubtitleAutoStatus`. An item with no status yet falls back to its own
 * `subtitles` records, which say "Japanese / English present" but not
 * "searching" or "machine translated".
 */
export function useSubtitleStatuses(mediaIds: readonly string[]): ReadonlyMap<string, GumSubtitleStatus> {
  const [map, setMap] = useState<ReadonlyMap<string, GumSubtitleStatus>>(new Map());
  const key = mediaIds.join('|');
  useEffect(() => {
    const api = window.api;
    if (typeof api?.subtitleAutoStatus !== 'function' || !mediaIds.length) return undefined;
    let live = true;
    void api.subtitleAutoStatus([...mediaIds])
      .then((rows) => {
        if (!live) return;
        setMap(new Map(rows.map((row) => [row.mediaId, row])));
      })
      .catch(() => undefined);
    const off = typeof api.onSubtitleAutoStatus === 'function'
      ? api.onSubtitleAutoStatus((row) => {
        if (!mediaIds.includes(row.mediaId)) return;
        setMap((current) => new Map(current).set(row.mediaId, row));
      })
      : undefined;
    return () => {
      live = false;
      off?.();
    };
    // `key` stands for the id list's contents.
  }, [key]);
  return map;
}

/** The one fixable subtitle notice to show (a missing key, a spent quota), or null. */
export function useSubtitleNotice(): { notice: SubtitleAutoNotice | null; quotaResetAt: number | null; dismiss: () => void } {
  const [notices, setNotices] = useState<SubtitleAutoNotices | null>(null);
  useEffect(() => {
    const api = window.api;
    if (typeof api?.subtitleAutoNotices !== 'function') return undefined;
    let live = true;
    void api.subtitleAutoNotices().then((next) => { if (live) setNotices(next); }).catch(() => undefined);
    const off = typeof api.onSubtitleAutoNotices === 'function' ? api.onSubtitleAutoNotices(setNotices) : undefined;
    return () => {
      live = false;
      off?.();
    };
  }, []);
  const notice = notices?.active[0] ?? null;
  const dismiss = useCallback(() => {
    if (!notice || typeof window.api?.dismissSubtitleAutoNotice !== 'function') return;
    void window.api.dismissSubtitleAutoNotice(notice).then(setNotices).catch(() => undefined);
  }, [notice]);
  return { notice, quotaResetAt: notices?.quotaResetAt ?? null, dismiss };
}

// ---------------------------------------------------------------------------
// Artwork for a tracked title with no file
// ---------------------------------------------------------------------------

const remoteCache = new Map<string, string | null>();
/** Mounted `useTitleArtUrl` hooks, told when the cache is dropped so they re-ask. */
const remoteListeners = new Set<() => void>();
let remoteWired = false;

/**
 * A tracked title's art changes when the watch library does (an import, a metadata
 * sweep, a poster found for a title that had none), and a cached "no art" used to
 * outlive all of those until the renderer reloaded — covers never appeared after an
 * import. `watch:changed` drops the whole cache and every mounted card re-asks.
 */
function wireRemoteInvalidation(): void {
  if (remoteWired || typeof window === 'undefined') return;
  const subscribe = window.api?.onWatchChanged;
  if (typeof subscribe !== 'function') return;
  remoteWired = true;
  subscribe(() => invalidateTitleArt());
}

/** Drops every cached title poster/banner answer, misses included. */
export function invalidateTitleArt(): void {
  remoteCache.clear();
  for (const listener of [...remoteListeners]) {
    try {
      listener();
    } catch {
      /* one card must not stop the others refreshing */
    }
  }
}

/**
 * The image hosts the renderer CSP admits (`shared/contentSecurityPolicy.ts`,
 * `img-src`). A TVmaze or TMDB URL would render as a broken image, so those are
 * only ever shown as the local copy the artwork IPC serves.
 */
const CSP_IMAGE_HOSTS = /^https:\/\/(cdn\.myanimelist\.net|[\w-]+\.anilist\.co)\//i;

/**
 * A poster URL for a title that has no local file. Uses `watch:artwork` once it
 * exists (TODO(lead) above); until then only a CSP-admitted remote poster (MAL
 * sync carries one) can be shown, and anything else falls back to the
 * typographic poster.
 */
export function useTitleArtUrl(title: GumTitle, variant: 'poster' | 'banner' = 'poster'): string | null {
  // Keyed by the poster the tracking library knows as well as the title: a title whose
  // poster path arrives (or changes) is a different question, never a cached miss.
  const cacheKey = `${variant}:${title.id}:${title.posterRef ?? ''}`;
  const direct = title.posterRef && CSP_IMAGE_HOSTS.test(title.posterRef) && variant === 'poster' ? title.posterRef : null;
  const [url, setUrl] = useState<string | null>(remoteCache.get(cacheKey) ?? direct);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    wireRemoteInvalidation();
    const bump = (): void => setGeneration((n) => n + 1);
    remoteListeners.add(bump);
    return () => { remoteListeners.delete(bump); };
  }, []);
  useEffect(() => {
    if (title.artworkId) return undefined;
    const api = optionalApi();
    if (!api.watchArtwork || !title.watchId) {
      setUrl(direct);
      return undefined;
    }
    if (remoteCache.has(cacheKey)) {
      setUrl(remoteCache.get(cacheKey) ?? direct);
      return undefined;
    }
    let live = true;
    void api.watchArtwork(title.watchId, variant)
      .then((next) => {
        remoteCache.set(cacheKey, next ?? null);
        if (live) setUrl(next ?? direct);
      })
      .catch(() => {
        if (live) setUrl(direct);
      });
    return () => { live = false; };
  }, [cacheKey, title.artworkId, title.watchId, direct, variant, generation]);
  return title.artworkId ? null : url;
}

// ---------------------------------------------------------------------------
// External player hand-off
// ---------------------------------------------------------------------------

/**
 * The video profile Settings > External players would use, read when a menu opens
 * (not cached) so a player added in Settings a moment ago is offered at once. Null
 * when none is configured, and the menus offer the way to set one up instead.
 */
export function externalPlayerProfile(): ExternalPlayerProfile | null {
  try {
    return selectExternalPlayerProfile(loadExternalPlayerPreferences(), 'video');
  } catch {
    return null;
  }
}

/**
 * The subtitle to hand over: the file the viewer chose for this item, else its first
 * Japanese track — only when it is an absolute path an outside program can open
 * (cached tracks live under the app's own storage by relative path).
 */
export function handoffSubtitlePath(item: MediaItem): string | null {
  const records = item.subtitles ?? [];
  // A drive path (D:/ or D:\), a POSIX path, or a UNC share (\\server\share).
  const absolute = (path: string | undefined): path is string => !!path && (/^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\\\'));
  const chosen = item.preferredSubtitleId ? records.find((record) => record.id === item.preferredSubtitleId) : undefined;
  if (chosen && absolute(chosen.path)) return chosen.path;
  const ja = records.find((record) => (record.lang ?? '').toLowerCase().startsWith('ja') && absolute(record.path));
  return ja?.path ?? null;
}

/** What `media:handoff` is given for one file: path, resume point, subtitle, episode. */
export function gumHandoff(item: MediaItem, resumeSec?: number): PlaybackHandoff {
  const base = createPlaybackHandoff(item, handoffSubtitlePath(item));
  return {
    ...base,
    episodeNumber: typeof item.episode === 'number' ? item.episode : null,
    resumePositionSec: resumeSec && resumeSec > 0 ? Math.round(resumeSec) : base.resumePositionSec,
  };
}

/**
 * Opens a file in the external player through the preload API only. Resolves to the
 * main process's refusal (a sentence) or null when the player was started.
 */
export async function openInExternalPlayer(item: MediaItem, profile: ExternalPlayerProfile, resumeSec?: number): Promise<string | null> {
  if (typeof window.api?.handoffMedia !== 'function') return 'unavailable';
  return window.api.handoffMedia(gumHandoff(item, resumeSec), profile);
}
