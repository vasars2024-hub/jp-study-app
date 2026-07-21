/**
 * YouTube immersion playlist types + pure helpers (DIP playlist manager).
 */

export type YtStudyLang = 'ja' | 'zh' | 'en';
export type YtSubLang = 'ja' | 'zh' | 'en' | 'ru';
export type YtPlaylistSort = 'playlist' | 'views' | 'date' | 'title' | 'unlogged';

/** Pseudo playlist id used for extension one-off video captures. */
export const EXTENSION_YT_PLAYLIST_ID = '__extension__';

export interface YtPlaylistFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface YtPlaylist {
  id: string;
  title: string;
  url: string;
  youtubePlaylistId: string;
  channelTitle?: string;
  folderId?: string;
  lang: YtStudyLang;
  preferSubs: YtSubLang[];
  autoUpdate: boolean;
  lastSyncedAt?: number;
  sortDefault: YtPlaylistSort;
  createdAt: number;
}

export interface YtVideo {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  url: string;
  thumbUrl?: string;
  durationSec?: number;
  viewCount?: number;
  channelTitle?: string;
  /** Original playlist order (0-based). */
  position?: number;
  /** Upload / availability date unix ms when known. */
  publishedAt?: number;
  /** When this youtubeId was first inserted into the store for this playlist. */
  firstSeenAt?: number;
  downloaded: boolean;
  mediaItemId?: string;
  hasOfficialSubs: boolean | null;
  transcribed: boolean;
  loggedAt?: number;
}

export interface YtPlaylistsStore {
  version: 1;
  folders: YtPlaylistFolder[];
  playlists: YtPlaylist[];
  videos: YtVideo[];
  /** Unix ms of last News check completion. */
  lastNewsCheckedAt?: number;
  /** Ordered internal video ids in Plan to watch. */
  planToWatchIds: string[];
}

export function emptyYtStore(): YtPlaylistsStore {
  return { version: 1, folders: [], playlists: [], videos: [], planToWatchIds: [] };
}

function normalizePreferSubs(raw: unknown): YtSubLang[] {
  if (!Array.isArray(raw)) return ['ja'];
  const langs = raw.filter(
    (l): l is YtSubLang => l === 'ja' || l === 'zh' || l === 'en' || l === 'ru',
  );
  return langs.length ? langs : ['ja'];
}

function normalizePlaylist(raw: unknown): YtPlaylist | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<YtPlaylist>;
  if (typeof p.id !== 'string' || !p.id) return null;
  if (typeof p.youtubePlaylistId !== 'string' || !p.youtubePlaylistId) return null;
  const lang: YtStudyLang =
    p.lang === 'ja' || p.lang === 'zh' || p.lang === 'en' ? p.lang : 'ja';
  const sortDefault: YtPlaylistSort =
    p.sortDefault === 'playlist' ||
    p.sortDefault === 'views' ||
    p.sortDefault === 'date' ||
    p.sortDefault === 'title' ||
    p.sortDefault === 'unlogged'
      ? p.sortDefault
      : 'playlist';
  return {
    id: p.id,
    title: typeof p.title === 'string' && p.title ? p.title : p.youtubePlaylistId,
    url: typeof p.url === 'string' ? p.url : '',
    youtubePlaylistId: p.youtubePlaylistId,
    channelTitle: typeof p.channelTitle === 'string' ? p.channelTitle : undefined,
    folderId: typeof p.folderId === 'string' ? p.folderId : undefined,
    lang,
    preferSubs: normalizePreferSubs(p.preferSubs),
    autoUpdate: p.autoUpdate !== false,
    lastSyncedAt:
      typeof p.lastSyncedAt === 'number' && Number.isFinite(p.lastSyncedAt)
        ? p.lastSyncedAt
        : undefined,
    sortDefault,
    createdAt:
      typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
  };
}

/** Coerce loaded JSON into a valid store (fills new fields for older files). */
export function normalizeYtStore(raw: unknown): YtPlaylistsStore {
  if (!raw || typeof raw !== 'object') return emptyYtStore();
  const parsed = raw as Partial<YtPlaylistsStore>;
  const playlists = Array.isArray(parsed.playlists)
    ? parsed.playlists.map(normalizePlaylist).filter((p): p is YtPlaylist => !!p)
    : null;
  const videos = Array.isArray(parsed.videos) ? parsed.videos : null;
  if (parsed.version !== 1 || !playlists || !videos) {
    return emptyYtStore();
  }
  return {
    version: 1,
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    playlists,
    videos,
    lastNewsCheckedAt:
      typeof parsed.lastNewsCheckedAt === 'number' && Number.isFinite(parsed.lastNewsCheckedAt)
        ? parsed.lastNewsCheckedAt
        : undefined,
    planToWatchIds: Array.isArray(parsed.planToWatchIds)
      ? parsed.planToWatchIds.filter((id): id is string => typeof id === 'string' && !!id)
      : [],
  };
}

/** Extract YouTube playlist id from common URL shapes. */
export function parseYoutubePlaylistId(url: string): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const list = u.searchParams.get('list');
    if (list && /^[\w-]+$/.test(list)) return list;
  } catch {
    /* fall through */
  }
  const m = /[?&]list=([\w-]+)/.exec(raw);
  return m?.[1] ?? null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function isVideoUnlogged(v: YtVideo): boolean {
  return !v.downloaded && !v.transcribed;
}

export function isImmersionPlaylist(p: YtPlaylist): boolean {
  return p.youtubePlaylistId !== EXTENSION_YT_PLAYLIST_ID;
}

/** Merge remote flat-playlist entries into local videos; preserve status by youtubeId. */
export function mergePlaylistVideos(
  playlistId: string,
  existing: YtVideo[],
  remote: Array<{
    youtubeId: string;
    title: string;
    thumbUrl?: string;
    durationSec?: number;
    viewCount?: number;
    channelTitle?: string;
    position?: number;
    publishedAt?: number;
  }>,
  nowMs: number = Date.now(),
): YtVideo[] {
  const byId = new Map(
    existing.filter((v) => v.playlistId === playlistId).map((v) => [v.youtubeId, v]),
  );
  const others = existing.filter((v) => v.playlistId !== playlistId);
  const merged: YtVideo[] = remote.map((r, i) => {
    const prev = byId.get(r.youtubeId);
    if (prev) {
      return {
        ...prev,
        title: r.title || prev.title,
        thumbUrl: r.thumbUrl ?? prev.thumbUrl,
        durationSec: r.durationSec ?? prev.durationSec,
        viewCount: r.viewCount ?? prev.viewCount,
        channelTitle: r.channelTitle ?? prev.channelTitle,
        position: r.position ?? i,
        publishedAt: r.publishedAt ?? prev.publishedAt,
        url: youtubeWatchUrl(r.youtubeId),
      };
    }
    return {
      id: `ytv-${playlistId}-${r.youtubeId}`,
      playlistId,
      youtubeId: r.youtubeId,
      title: r.title || r.youtubeId,
      url: youtubeWatchUrl(r.youtubeId),
      thumbUrl: r.thumbUrl ?? youtubeThumbUrl(r.youtubeId),
      durationSec: r.durationSec,
      viewCount: r.viewCount,
      channelTitle: r.channelTitle,
      position: r.position ?? i,
      publishedAt: r.publishedAt,
      firstSeenAt: nowMs,
      downloaded: false,
      hasOfficialSubs: null,
      transcribed: false,
    };
  });
  return [...others, ...merged];
}

export function sortYtVideos(videos: YtVideo[], sort: YtPlaylistSort): YtVideo[] {
  const list = [...videos];
  switch (sort) {
    case 'views':
      return list.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    case 'date':
      return list.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'unlogged':
      return list.sort(
        (a, b) =>
          Number(isVideoUnlogged(b)) - Number(isVideoUnlogged(a)) ||
          (a.position ?? 0) - (b.position ?? 0),
      );
    case 'playlist':
    default:
      return list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
}

export function filterUnlogged(videos: YtVideo[], onlyUnlogged: boolean): YtVideo[] {
  if (!onlyUnlogged) return videos;
  return videos.filter(isVideoUnlogged);
}

/** Videos first seen after `sinceMs` (News tab). Excludes extension bucket. */
export function diffNewVideos(store: YtPlaylistsStore, sinceMs: number): YtVideo[] {
  const playlists = store.playlists ?? [];
  const videos = store.videos ?? [];
  const immersionIds = new Set(playlists.filter(isImmersionPlaylist).map((p) => p.id));
  return videos
    .filter(
      (v) =>
        immersionIds.has(v.playlistId) &&
        typeof v.firstSeenAt === 'number' &&
        v.firstSeenAt > sinceMs,
    )
    .sort((a, b) => (b.firstSeenAt ?? 0) - (a.firstSeenAt ?? 0));
}

export function addPlanToWatchIds(store: YtPlaylistsStore, videoIds: string[]): YtPlaylistsStore {
  const videos = store.videos ?? [];
  const known = new Set(videos.map((v) => v.id));
  const next = [...(store.planToWatchIds ?? [])];
  const have = new Set(next);
  for (const id of videoIds) {
    if (!known.has(id) || have.has(id)) continue;
    next.push(id);
    have.add(id);
  }
  return { ...store, videos, planToWatchIds: next };
}

export function removePlanToWatchIds(store: YtPlaylistsStore, videoIds: string[]): YtPlaylistsStore {
  const drop = new Set(videoIds);
  return {
    ...store,
    planToWatchIds: (store.planToWatchIds ?? []).filter((id) => !drop.has(id)),
  };
}

export function planToWatchVideos(store: YtPlaylistsStore): YtVideo[] {
  const byId = new Map((store.videos ?? []).map((v) => [v.id, v]));
  return (store.planToWatchIds ?? [])
    .map((id) => byId.get(id))
    .filter((v): v is YtVideo => !!v);
}

/**
 * Surprise me pool: plan-to-watch if non-empty, else unlogged immersion videos,
 * else all immersion videos.
 */
export function pickSurpriseVideo(store: YtPlaylistsStore, rng: () => number = Math.random): YtVideo | null {
  const plan = planToWatchVideos(store);
  let pool = plan;
  const playlists = store.playlists ?? [];
  const videos = store.videos ?? [];
  if (!pool.length) {
    const immersionIds = new Set(playlists.filter(isImmersionPlaylist).map((p) => p.id));
    pool = videos.filter((v) => immersionIds.has(v.playlistId) && isVideoUnlogged(v));
  }
  if (!pool.length) {
    const immersionIds = new Set(playlists.filter(isImmersionPlaylist).map((p) => p.id));
    pool = videos.filter((v) => immersionIds.has(v.playlistId));
  }
  if (!pool.length) return null;
  const i = Math.floor(rng() * pool.length);
  return pool[Math.min(pool.length - 1, Math.max(0, i))] ?? null;
}
