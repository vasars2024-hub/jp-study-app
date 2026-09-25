/**
 * YouTube immersion playlist types + pure helpers (DIP playlist manager).
 */

export type YtStudyLang = 'ja' | 'zh' | 'en';
export type YtSubLang = 'ja' | 'zh' | 'en' | 'ru';
export type YtPlaylistSort = 'playlist' | 'views' | 'date' | 'title' | 'unlogged';
export type YtSubscriptionStatus = 'subscribed' | 'watching' | 'custom' | 'unsubscribed';

/** Pseudo playlist id used for extension one-off video captures. */
export const EXTENSION_YT_PLAYLIST_ID = '__extension__';

export interface YtPlaylistFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface YtChannel {
  id: string;
  channelId: string;
  title: string;
  iconUrl?: string;
  subscriptionStatus: YtSubscriptionStatus;
  lastCheckedAt?: number;
  updateFrequencyHours: number;
  playlistIds: string[];
  videoCount: number;
  createdAt: number;
}

export interface YtPlaylist {
  id: string;
  title: string;
  url: string;
  channelId?: string;
  channelTitle?: string;
  channelIconUrl?: string;
  youtubePlaylistId: string;
  subscriptionStatus: YtSubscriptionStatus;
  folderId?: string;
  lang: YtStudyLang;
  preferSubs: YtSubLang[];
  autoUpdate: boolean;
  lastSyncedAt?: number;
  lastCheckedAt?: number;
  updateFrequencyHours: number;
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
  /** Creator-made subtitles came with the download (audit r2 #20: not auto captions). */
  hasOfficialSubs: boolean | null;
  /** Only YouTube's auto-generated captions came with the download. */
  hasAutoSubs?: boolean;
  /**
   * The video is no longer in its playlist on YouTube (deleted, made private,
   * or taken out). Kept, with its local file, rather than dropped (audit r2 #21).
   */
  removedFromYouTube?: boolean;
  transcribed: boolean;
  loggedAt?: number;
}

export interface YtPlaylistsStore {
  version: 1;
  folders: YtPlaylistFolder[];
  channels: YtChannel[];
  playlists: YtPlaylist[];
  videos: YtVideo[];
  /** Unix ms of last News check completion. */
  lastNewsCheckedAt?: number;
  /** What that check found, so reopening the window shows it without a re-sync. */
  lastNewsVideoIds?: string[];
  /** Ordered internal video ids in Plan to watch. */
  planToWatchIds: string[];
}

export function emptyYtStore(): YtPlaylistsStore {
  return { version: 1, folders: [], channels: [], playlists: [], videos: [], planToWatchIds: [] };
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
    channelId: typeof p.channelId === 'string' && p.channelId ? p.channelId : undefined,
    youtubePlaylistId: p.youtubePlaylistId,
    channelTitle: typeof p.channelTitle === 'string' ? p.channelTitle : undefined,
    channelIconUrl: typeof p.channelIconUrl === 'string' ? p.channelIconUrl : undefined,
    subscriptionStatus:
      p.subscriptionStatus === 'subscribed' ||
      p.subscriptionStatus === 'watching' ||
      p.subscriptionStatus === 'custom' ||
      p.subscriptionStatus === 'unsubscribed'
        ? p.subscriptionStatus
        : 'subscribed',
    folderId: typeof p.folderId === 'string' ? p.folderId : undefined,
    lang,
    preferSubs: normalizePreferSubs(p.preferSubs),
    autoUpdate: p.autoUpdate !== false,
    lastSyncedAt:
      typeof p.lastSyncedAt === 'number' && Number.isFinite(p.lastSyncedAt)
        ? p.lastSyncedAt
        : undefined,
    lastCheckedAt:
      typeof p.lastCheckedAt === 'number' && Number.isFinite(p.lastCheckedAt)
        ? p.lastCheckedAt
        : undefined,
    updateFrequencyHours:
      typeof p.updateFrequencyHours === 'number' &&
      Number.isFinite(p.updateFrequencyHours) &&
      p.updateFrequencyHours > 0
        ? p.updateFrequencyHours
        : 12,
    sortDefault,
    createdAt:
      typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
  };
}

function normalizeChannel(raw: unknown): YtChannel | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<YtChannel>;
  const channelId = typeof c.channelId === 'string' && c.channelId ? c.channelId : '';
  if (!channelId) return null;
  return {
    id: typeof c.id === 'string' && c.id ? c.id : `ytc-${channelId}`,
    channelId,
    title: typeof c.title === 'string' && c.title ? c.title : channelId,
    iconUrl: typeof c.iconUrl === 'string' ? c.iconUrl : undefined,
    subscriptionStatus:
      c.subscriptionStatus === 'subscribed' ||
      c.subscriptionStatus === 'watching' ||
      c.subscriptionStatus === 'custom' ||
      c.subscriptionStatus === 'unsubscribed'
        ? c.subscriptionStatus
        : 'subscribed',
    lastCheckedAt:
      typeof c.lastCheckedAt === 'number' && Number.isFinite(c.lastCheckedAt)
        ? c.lastCheckedAt
        : undefined,
    updateFrequencyHours:
      typeof c.updateFrequencyHours === 'number' &&
      Number.isFinite(c.updateFrequencyHours) &&
      c.updateFrequencyHours > 0
        ? c.updateFrequencyHours
        : 24,
    playlistIds: Array.isArray(c.playlistIds)
      ? c.playlistIds.filter((id): id is string => typeof id === 'string' && !!id)
      : [],
    videoCount:
      typeof c.videoCount === 'number' && Number.isFinite(c.videoCount) && c.videoCount >= 0
        ? c.videoCount
        : 0,
    createdAt:
      typeof c.createdAt === 'number' && Number.isFinite(c.createdAt) ? c.createdAt : Date.now(),
  };
}

/** Coerce loaded JSON into a valid store (fills new fields for older files). */
export function normalizeYtStore(raw: unknown): YtPlaylistsStore {
  if (!raw || typeof raw !== 'object') return emptyYtStore();
  const parsed = raw as Partial<YtPlaylistsStore>;
  const playlists = Array.isArray(parsed.playlists)
    ? parsed.playlists.map(normalizePlaylist).filter((p): p is YtPlaylist => !!p)
    : null;
  const channels = Array.isArray(parsed.channels)
    ? parsed.channels.map(normalizeChannel).filter((c): c is YtChannel => !!c)
    : [];
  const videos = Array.isArray(parsed.videos) ? parsed.videos : null;
  if (parsed.version !== 1 || !playlists || !videos) {
    return emptyYtStore();
  }
  const byChannelId = new Map(channels.map((c) => [c.channelId, c]));
  for (const pl of playlists) {
    if (!pl.channelId) continue;
    const existing = byChannelId.get(pl.channelId);
    if (existing) {
      existing.title = pl.channelTitle ?? existing.title;
      existing.iconUrl = pl.channelIconUrl ?? existing.iconUrl;
      existing.subscriptionStatus = pl.subscriptionStatus ?? existing.subscriptionStatus;
      existing.lastCheckedAt = pl.lastCheckedAt ?? existing.lastCheckedAt;
      existing.updateFrequencyHours = pl.updateFrequencyHours ?? existing.updateFrequencyHours;
      if (!existing.playlistIds.includes(pl.id)) existing.playlistIds.push(pl.id);
      continue;
    }
    const next: YtChannel = {
      id: `ytc-${pl.channelId}`,
      channelId: pl.channelId,
      title: pl.channelTitle ?? pl.channelId,
      iconUrl: pl.channelIconUrl,
      subscriptionStatus: pl.subscriptionStatus,
      lastCheckedAt: pl.lastCheckedAt,
      updateFrequencyHours: pl.updateFrequencyHours,
      playlistIds: [pl.id],
      videoCount: 0,
      createdAt: pl.createdAt,
    };
    channels.push(next);
    byChannelId.set(pl.channelId, next);
  }
  const byPlaylistId = new Map(playlists.map((p) => [p.id, p]));
  for (const c of channels) {
    c.playlistIds = [...new Set(c.playlistIds.filter((id) => byPlaylistId.has(id)))];
    c.videoCount = videos.filter((v) => c.playlistIds.includes(v.playlistId)).length;
  }
  return {
    version: 1,
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    channels,
    playlists,
    videos,
    lastNewsCheckedAt:
      typeof parsed.lastNewsCheckedAt === 'number' && Number.isFinite(parsed.lastNewsCheckedAt)
        ? parsed.lastNewsCheckedAt
        : undefined,
    ...(Array.isArray(parsed.lastNewsVideoIds)
      ? {
          lastNewsVideoIds: parsed.lastNewsVideoIds.filter(
            (id): id is string => typeof id === 'string' && !!id,
          ),
        }
      : {}),
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

/** A channel URL, and the URL whose flat listing is that channel's uploads. */
export interface YoutubeChannelRef {
  kind: 'channel' | 'handle' | 'custom' | 'user';
  /** `UC…` for `/channel/`, the handle without `@`, or the `/c/` / `/user/` name. */
  value: string;
  /**
   * What to hand yt-dlp. A `/channel/UC…` URL maps straight to its uploads
   * playlist (`UU…`, same suffix); a handle or legacy name to its `/videos` tab,
   * which yt-dlp resolves.
   */
  fetchUrl: string;
  /** Known up front only for `/channel/UC…`. */
  uploadsPlaylistId?: string;
}

/** `UC…` → `UU…`, YouTube's uploads playlist for that channel. */
export function youtubeUploadsPlaylistId(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

/**
 * Channel URLs in the shapes people paste: `youtube.com/@handle`,
 * `/channel/UC…`, `/c/name`, `/user/name`, with or without a tab
 * (`/videos`, `/featured`, …) or scheme, and `m.` / `www.`. Null for anything
 * else — including a URL that carries `list=`, which is a playlist.
 */
export function parseYoutubeChannelUrl(url: string): YoutubeChannelRef | null {
  const raw = (url ?? '').trim();
  if (!raw || /[?&]list=/.test(raw)) return null;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (!/^(www\.|m\.|music\.)?youtube\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  const [first, second] = parts;
  if (!first) return null;
  if (first.startsWith('@') && first.length > 1) {
    const handle = first.slice(1);
    if (!/^[\p{L}\p{N}._·-]{1,100}$/u.test(handle)) return null;
    return { kind: 'handle', value: handle, fetchUrl: `https://www.youtube.com/@${encodeURIComponent(handle)}/videos` };
  }
  if (first === 'channel' && second && /^UC[\w-]{22}$/.test(second)) {
    const uploads = youtubeUploadsPlaylistId(second) as string;
    return {
      kind: 'channel',
      value: second,
      fetchUrl: `https://www.youtube.com/playlist?list=${uploads}`,
      uploadsPlaylistId: uploads,
    };
  }
  if ((first === 'c' || first === 'user') && second && /^[\p{L}\p{N}._-]{1,100}$/u.test(second)) {
    return {
      kind: first === 'c' ? 'custom' : 'user',
      value: second,
      fetchUrl: `https://www.youtube.com/${first}/${encodeURIComponent(second)}/videos`,
    };
  }
  return null;
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

/**
 * D300 — the channel a playlist belongs to, resolved by id and then by title.
 *
 * `channelId` and `channelTitle` are independent optionals (`:37`, `:61`) and
 * `--flat-playlist` fills the title far more often than the id, so a lookup keyed
 * on the id alone silently loses the channel for exactly the playlists the user
 * added by link. Id first, because it is the stable key: a title collision must
 * never be able to override a real id match.
 *
 * A miss returns `undefined` rather than a guess, so a caller can tell "no channel
 * record" from "a channel with nothing tracked" — the difference between showing
 * nothing and asserting a confident zero.
 */
export function resolveTrackedChannel(
  playlist: Pick<YtPlaylist, 'channelId' | 'channelTitle'> | null | undefined,
  channels: readonly YtChannel[],
): YtChannel | undefined {
  if (!playlist) return undefined;
  if (playlist.channelId) {
    const byId = channels.find((c) => c.channelId === playlist.channelId);
    if (byId) return byId;
  }
  if (playlist.channelTitle) {
    return channels.find((c) => c.title === playlist.channelTitle);
  }
  return undefined;
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
  const remoteIds = new Set(remote.map((r) => r.youtubeId));
  // Gone from YouTube: kept and marked, never silently dropped — the user may
  // have its file, its transcript and its cards (audit r2 #21).
  const removed: YtVideo[] = [...byId.values()]
    .filter((v) => !remoteIds.has(v.youtubeId))
    .map((v) => ({ ...v, removedFromYouTube: true }));
  const merged: YtVideo[] = remote.map((r, i) => {
    const prev = byId.get(r.youtubeId);
    if (prev) {
      const { removedFromYouTube: _back, ...rest } = prev;
      void _back;
      return {
        ...rest,
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
  return [...others, ...merged, ...removed];
}

/**
 * Whether opening the manager should sync (audit r2 #22): only when a playlist
 * the auto-update timer looks after is due by that timer's own rule, or when
 * nothing has ever been checked. Every other open shows what is stored.
 */
export function ytPlaylistIsDue(
  lastCheckedAt: number | undefined,
  frequencyHours: number,
  now: number,
): boolean {
  if (!lastCheckedAt) return true;
  return now - lastCheckedAt >= frequencyHours * 60 * 60 * 1000;
}

export function ytNewsIsStale(store: YtPlaylistsStore, now: number): boolean {
  const immersion = (store.playlists ?? []).filter(isImmersionPlaylist);
  if (immersion.length === 0) return false;
  if (!store.lastNewsCheckedAt) return true;
  return immersion.some(
    (p) => p.autoUpdate && ytPlaylistIsDue(p.lastCheckedAt, p.updateFrequencyHours, now),
  );
}

/** View counts in the UI language's own compact form (1.2K, 1,2 тыс., 1.2万) — audit r2 #23. */
export function formatYtViews(n: number | undefined, locale: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

export function ensureTrackedChannel(
  store: YtPlaylistsStore,
  playlist: YtPlaylist,
): YtPlaylistsStore {
  if (!playlist.channelId) return store;
  const channels = [...(store.channels ?? [])];
  const idx = channels.findIndex((c) => c.channelId === playlist.channelId);
  const videoCount = (store.videos ?? []).filter((v) => v.playlistId === playlist.id).length;
  if (idx >= 0) {
    channels[idx] = {
      ...channels[idx],
      title: playlist.channelTitle ?? channels[idx].title,
      iconUrl: playlist.channelIconUrl ?? channels[idx].iconUrl,
      subscriptionStatus: playlist.subscriptionStatus,
      lastCheckedAt: playlist.lastCheckedAt ?? channels[idx].lastCheckedAt,
      updateFrequencyHours: playlist.updateFrequencyHours,
      playlistIds: Array.from(new Set([...channels[idx].playlistIds, playlist.id])),
      videoCount,
    };
  } else {
    channels.push({
      id: `ytc-${playlist.channelId}`,
      channelId: playlist.channelId,
      title: playlist.channelTitle ?? playlist.channelId,
      iconUrl: playlist.channelIconUrl,
      subscriptionStatus: playlist.subscriptionStatus,
      lastCheckedAt: playlist.lastCheckedAt,
      updateFrequencyHours: playlist.updateFrequencyHours,
      playlistIds: [playlist.id],
      videoCount,
      createdAt: playlist.createdAt,
    });
  }
  return { ...store, channels };
}

export function trackedChannels(store: YtPlaylistsStore): YtChannel[] {
  return [...(store.channels ?? [])].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * D94 — which of the two data-backed sorts has nothing to sort ON, if either.
 *
 * `views` and `date` read `viewCount` / `publishedAt`, and `syncPlaylist` runs yt-dlp
 * with `--flat-playlist`, which returns neither for most channels. The comparator then
 * ranks every video at 0 and the list does not move, while the chosen sort persists —
 * so the user sees a setting that sticks and does nothing. Returning the offending sort
 * lets the surface SAY so; the alternative, dropping `--flat-playlist`, would make every
 * refresh fetch each video individually.
 *
 * An empty list is not a gap: there is nothing to sort either way, and the surface
 * already has an empty state for that.
 */
export function sortFieldIsAbsent(
  videos: YtVideo[],
  sort: YtPlaylistSort,
): 'views' | 'date' | null {
  if (sort !== 'views' && sort !== 'date') return null;
  if (videos.length === 0) return null;
  const field = sort === 'views' ? 'viewCount' : 'publishedAt';
  const has = videos.some((v) => {
    const n = v[field];
    return typeof n === 'number' && Number.isFinite(n);
  });
  return has ? null : sort;
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

/**
 * What a News check reports as new (audit r2 #16). The FIRST check has no
 * earlier one to compare against — "new since the epoch" is the whole library —
 * so it reports nothing and becomes the baseline.
 */
export function newsIdsAfterCheck(store: YtPlaylistsStore, previousCheckAt: number | undefined): string[] {
  if (!previousCheckAt || previousCheckAt <= 0) return [];
  return diffNewVideos(store, previousCheckAt).map((v) => v.id);
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
