/**
 * YouTube immersion playlist manager — metadata store + yt-dlp sync/download IPC.
 * Adding or refreshing a playlist never downloads media files.
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  emptyYtStore,
  mergePlaylistVideos,
  normalizeYtStore,
  parseYoutubePlaylistId,
  addPlanToWatchIds,
  removePlanToWatchIds,
  diffNewVideos,
  EXTENSION_YT_PLAYLIST_ID,
  isImmersionPlaylist,
  youtubeThumbUrl,
  youtubeWatchUrl,
  type YtPlaylist,
  type YtPlaylistFolder,
  type YtPlaylistSort,
  type YtPlaylistsStore,
  type YtStudyLang,
  type YtSubLang,
  type YtVideo,
} from '../shared/ytPlaylists';
import type { YouTubeDownloadOptions, YouTubeSubtitleLang } from '../shared/types';
import {
  downloadYoutubeUrl,
  findYtDlp,
  ytDlpJson,
  ytDlpSubtitleLangs,
} from './media';

const STORE_FILE = 'yt-playlists.json';
const TRANSCRIPTS_DIR = 'yt-transcripts';
const SUBS_CACHE_DIR = 'yt-subs';
const AUTO_UPDATE_MS = 12 * 60 * 60 * 1000;

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function transcriptsDir(): string {
  return path.join(app.getPath('userData'), TRANSCRIPTS_DIR);
}

function subsCacheDir(): string {
  return path.join(app.getPath('userData'), SUBS_CACHE_DIR);
}

function transcriptPath(youtubeId: string): string {
  return path.join(transcriptsDir(), `${youtubeId}.json`);
}

function readStore(): YtPlaylistsStore {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8');
    return normalizeYtStore(JSON.parse(raw));
  } catch {
    return emptyYtStore();
  }
}

/** Read-only snapshot for the Chrome extension HTTP bridge. */
export function readStoreForExtension(): YtPlaylistsStore {
  return readStore();
}

/** Status of a YouTube playlist by list= id — used by the extension badge. */
export function playlistTrackedStatus(youtubePlaylistIdOrUrl: string): {
  tracked: boolean;
  youtubePlaylistId: string | null;
  playlistId?: string;
  title?: string;
  videoCount?: number;
  lastSyncedAt?: number;
  autoUpdate?: boolean;
} {
  const listId =
    parseYoutubePlaylistId(youtubePlaylistIdOrUrl) ||
    (/^[\w-]+$/.test(youtubePlaylistIdOrUrl.trim()) ? youtubePlaylistIdOrUrl.trim() : null);
  if (!listId || listId === EXTENSION_YT_PLAYLIST_ID) {
    return { tracked: false, youtubePlaylistId: listId };
  }
  const store = readStore();
  const pl = store.playlists.find((p) => p.youtubePlaylistId === listId && isImmersionPlaylist(p));
  if (!pl) return { tracked: false, youtubePlaylistId: listId };
  return {
    tracked: true,
    youtubePlaylistId: listId,
    playlistId: pl.id,
    title: pl.title,
    videoCount: store.videos.filter((v) => v.playlistId === pl.id).length,
    lastSyncedAt: pl.lastSyncedAt,
    autoUpdate: pl.autoUpdate,
  };
}

function writeStore(store: YtPlaylistsStore): void {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf-8');
}

function broadcastStore(store: YtPlaylistsStore): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('yt:changed', store);
  }
}

function saveAndBroadcast(store: YtPlaylistsStore): YtPlaylistsStore {
  const normalized = normalizeYtStore(store);
  writeStore(normalized);
  broadcastStore(normalized);
  return normalized;
}

interface FlatEntry {
  youtubeId: string;
  title: string;
  thumbUrl?: string;
  durationSec?: number;
  viewCount?: number;
  channelTitle?: string;
  position?: number;
  publishedAt?: number;
}

function parseUploadDate(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string' && /^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const t = Date.UTC(y, m, d);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

function mapFlatEntries(data: unknown): {
  title: string;
  channelTitle?: string;
  youtubePlaylistId?: string;
  entries: FlatEntry[];
} {
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const title = typeof root.title === 'string' ? root.title : 'Playlist';
  const channelTitle =
    (typeof root.channel === 'string' && root.channel) ||
    (typeof root.uploader === 'string' && root.uploader) ||
    undefined;
  const youtubePlaylistId =
    (typeof root.id === 'string' && root.id) ||
    (typeof root.playlist_id === 'string' && root.playlist_id) ||
    undefined;
  const rawEntries = Array.isArray(root.entries) ? root.entries : [];
  const entries: FlatEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const e = rawEntries[i] as Record<string, unknown> | null;
    if (!e || typeof e !== 'object') continue;
    const youtubeId =
      (typeof e.id === 'string' && e.id) ||
      (typeof e.url === 'string' && /(?:v=|youtu\.be\/)([\w-]{6,})/.exec(e.url)?.[1]) ||
      '';
    if (!youtubeId || youtubeId === '_') continue;
    const thumbs = Array.isArray(e.thumbnails) ? e.thumbnails : [];
    const lastThumb = thumbs[thumbs.length - 1] as { url?: string } | undefined;
    entries.push({
      youtubeId,
      title: typeof e.title === 'string' && e.title ? e.title : youtubeId,
      thumbUrl:
        (typeof lastThumb?.url === 'string' && lastThumb.url) ||
        (typeof e.thumbnail === 'string' && e.thumbnail) ||
        youtubeThumbUrl(youtubeId),
      durationSec: typeof e.duration === 'number' ? e.duration : undefined,
      viewCount: typeof e.view_count === 'number' ? e.view_count : undefined,
      channelTitle:
        (typeof e.channel === 'string' && e.channel) ||
        (typeof e.uploader === 'string' && e.uploader) ||
        channelTitle,
      position: i,
      publishedAt: parseUploadDate(e.timestamp ?? e.release_timestamp ?? e.upload_date),
    });
  }
  return { title, channelTitle, youtubePlaylistId, entries };
}

async function syncPlaylistFromUrl(
  store: YtPlaylistsStore,
  url: string,
  existing?: YtPlaylist,
): Promise<{ store: YtPlaylistsStore; playlist: YtPlaylist } | { error: string }> {
  const listId = parseYoutubePlaylistId(url);
  if (!listId) return { error: 'Not a valid YouTube playlist URL (missing list=…).' };

  const result = await ytDlpJson([
    '-J',
    '--flat-playlist',
    '--no-download',
    '--playlist-end',
    '5000',
    url.trim(),
  ]);
  if (!result.ok) return { error: result.error };

  const mapped = mapFlatEntries(result.data);
  const playlistId = existing?.id ?? crypto.randomUUID();
  const playlist: YtPlaylist = existing
    ? {
        ...existing,
        title: mapped.title || existing.title,
        url: url.trim(),
        youtubePlaylistId: mapped.youtubePlaylistId || listId,
        channelTitle: mapped.channelTitle ?? existing.channelTitle,
        lastSyncedAt: Date.now(),
      }
    : {
        id: playlistId,
        title: mapped.title || 'Playlist',
        url: url.trim(),
        youtubePlaylistId: mapped.youtubePlaylistId || listId,
        channelTitle: mapped.channelTitle,
        lang: 'ja',
        preferSubs: ['ja'],
        autoUpdate: true,
        lastSyncedAt: Date.now(),
        sortDefault: 'playlist',
        createdAt: Date.now(),
      };

  store.videos = mergePlaylistVideos(playlistId, store.videos, mapped.entries);
  // Re-check transcribed markers from disk
  for (const v of store.videos) {
    if (v.playlistId !== playlistId) continue;
    if (fs.existsSync(transcriptPath(v.youtubeId))) v.transcribed = true;
  }

  if (existing) {
    store.playlists = store.playlists.map((p) => (p.id === playlistId ? playlist : p));
  } else {
    // Upsert by youtube playlist id
    const dup = store.playlists.find((p) => p.youtubePlaylistId === playlist.youtubePlaylistId);
    if (dup) {
      return syncPlaylistFromUrl(store, url, dup);
    }
    store.playlists.unshift(playlist);
  }
  return { store, playlist };
}

function preferSubsToDownloadOptions(preferSubs: YtSubLang[]): YouTubeDownloadOptions {
  const langs = preferSubs.filter((l): l is Exclude<YouTubeSubtitleLang, 'none'> =>
    l === 'ja' || l === 'zh' || l === 'en' || l === 'ru',
  );
  return {
    audioOnly: false,
    subtitleLang: langs[0] ?? 'none',
    subtitleLangs: langs.length ? langs : undefined,
  };
}

/** Download YT playlist videos by internal ids (used by IPC and extension bridge). */
export async function downloadVideosByIds(
  videoIds: string[],
  onProgress?: (ev: {
    videoId: string;
    index: number;
    total: number;
    stage: string;
    percent: number;
  }) => void,
  downloadOpts?: { audioOnly?: boolean },
): Promise<{
  store: YtPlaylistsStore;
  results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
}> {
  const store = readStore();
  const results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }> = [];
  const ids = Array.isArray(videoIds) ? videoIds : [];
  for (let i = 0; i < ids.length; i++) {
    const videoId = ids[i];
    const video = store.videos.find((v) => v.id === videoId);
    if (!video) {
      results.push({ videoId, ok: false, error: 'Video not found.' });
      continue;
    }
    const pl = store.playlists.find((p) => p.id === video.playlistId);
    const opts = preferSubsToDownloadOptions(pl?.preferSubs ?? ['ja']);
    if (downloadOpts?.audioOnly === true) opts.audioOnly = true;
    onProgress?.({
      videoId,
      index: i,
      total: ids.length,
      stage: 'downloading',
      percent: 0,
    });
    const result = await downloadYoutubeUrl(video.url, opts, (ev) => {
      onProgress?.({
        videoId,
        index: i,
        total: ids.length,
        stage: ev.stage,
        percent: ev.percent,
      });
    });
    if ('error' in result) {
      results.push({ videoId, ok: false, error: result.error });
      continue;
    }
    video.downloaded = true;
    video.mediaItemId = result.item.id;
    video.hasOfficialSubs = Boolean(result.subtitle);
    video.loggedAt = video.loggedAt ?? Date.now();
    results.push({ videoId, ok: true, mediaItemId: result.item.id });
  }
  saveAndBroadcast(store);
  return { store, results };
}

async function fetchSubsOnly(
  youtubeId: string,
  url: string,
  preferSubs: YtSubLang[],
): Promise<{ ok: true; hasSubs: boolean } | { ok: false; error: string }> {
  const bin = await findYtDlp();
  if (!bin) return { ok: false, error: 'yt-dlp was not found on your PATH.' };
  const langs = preferSubsToDownloadOptions(preferSubs).subtitleLangs ?? [];
  if (!langs.length) return { ok: true, hasSubs: false };
  const subLangArgs = langs.flatMap((l) => ytDlpSubtitleLangs(l));
  const outDir = path.join(subsCacheDir(), youtubeId);
  fs.mkdirSync(outDir, { recursive: true });
  const args = [
    url,
    '--skip-download',
    '--write-subs',
    '--sub-langs',
    [...new Set(subLangArgs)].join(','),
    '--sub-format',
    'vtt/srt/ass/best',
    '--no-playlist',
    '-o',
    path.join(outDir, '%(id)s'),
  ];
  return new Promise((resolve) => {
    const proc = spawn(bin, args);
    let err = '';
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', (e) => resolve({ ok: false, error: e.message }));
    proc.on('close', (code) => {
      if (code !== 0) {
        const last = err.trim().split('\n').pop()?.trim();
        resolve({ ok: false, error: last || `yt-dlp exited with code ${code}` });
        return;
      }
      const files = fs.existsSync(outDir)
        ? fs.readdirSync(outDir).filter((f) => /\.(vtt|srt|ass|ssa)$/i.test(f))
        : [];
      resolve({ ok: true, hasSubs: files.length > 0 });
    });
  });
}

/** Used by extension bridge. */
export async function addPlaylistByUrl(url: string): Promise<{ ok: true; playlistId: string } | { ok: false; error: string }> {
  const store = readStore();
  const result = await syncPlaylistFromUrl(store, url);
  if ('error' in result) return { ok: false, error: result.error };
  saveAndBroadcast(result.store);
  return { ok: true, playlistId: result.playlist.id };
}

const EXTENSION_PLAYLIST_KEY = '__extension__';

/** Upsert a single YouTube watch URL into the Extension captures playlist (metadata only). */
export async function addVideoByUrl(
  url: string,
): Promise<
  | { ok: true; playlistId: string; videoId: string; youtubeId: string; duplicate?: boolean }
  | { ok: false; error: string }
> {
  const trimmed = (url ?? '').trim();
  const { parseYoutubeVideoId } = await import('../shared/extensionCapture');
  const youtubeId = parseYoutubeVideoId(trimmed);
  if (!youtubeId) return { ok: false, error: 'Not a valid YouTube video URL.' };

  const store = readStore();
  let pl = store.playlists.find((p) => p.youtubePlaylistId === EXTENSION_PLAYLIST_KEY);
  if (!pl) {
    pl = {
      id: crypto.randomUUID(),
      title: 'Extension',
      url: 'extension://captures',
      youtubePlaylistId: EXTENSION_PLAYLIST_KEY,
      channelTitle: 'Chrome extension',
      lang: 'ja',
      preferSubs: ['ja', 'en'],
      autoUpdate: false,
      lastSyncedAt: Date.now(),
      sortDefault: 'date',
      createdAt: Date.now(),
    };
    store.playlists.unshift(pl);
  }

  const existing = store.videos.find((v) => v.playlistId === pl!.id && v.youtubeId === youtubeId);
  if (existing) {
    saveAndBroadcast(store);
    return { ok: true, playlistId: pl.id, videoId: existing.id, youtubeId, duplicate: true };
  }

  let title = youtubeId;
  let channelTitle: string | undefined;
  let durationSec: number | undefined;
  let viewCount: number | undefined;
  let thumbUrl = youtubeThumbUrl(youtubeId);
  let publishedAt: number | undefined;

  const meta = await ytDlpJson(['-J', '--no-playlist', '--skip-download', trimmed]);
  if (meta.ok && meta.data && typeof meta.data === 'object') {
    const root = meta.data as Record<string, unknown>;
    if (typeof root.title === 'string' && root.title) title = root.title;
    channelTitle =
      (typeof root.channel === 'string' && root.channel) ||
      (typeof root.uploader === 'string' && root.uploader) ||
      undefined;
    if (typeof root.duration === 'number') durationSec = root.duration;
    if (typeof root.view_count === 'number') viewCount = root.view_count;
    const thumbs = Array.isArray(root.thumbnails) ? root.thumbnails : [];
    const last = thumbs[thumbs.length - 1] as { url?: string } | undefined;
    if (typeof last?.url === 'string') thumbUrl = last.url;
    if (typeof root.timestamp === 'number') {
      publishedAt = root.timestamp > 1e12 ? root.timestamp : root.timestamp * 1000;
    }
  }

  const video: YtVideo = {
    id: `ytv-${pl.id}-${youtubeId}`,
    playlistId: pl.id,
    youtubeId,
    title,
    url: youtubeWatchUrl(youtubeId),
    thumbUrl,
    durationSec,
    viewCount,
    channelTitle,
    position: store.videos.filter((v) => v.playlistId === pl!.id).length,
    publishedAt,
    downloaded: false,
    hasOfficialSubs: null,
    transcribed: false,
  };
  store.videos.push(video);
  pl.lastSyncedAt = Date.now();
  if (channelTitle) pl.channelTitle = channelTitle;
  saveAndBroadcast(store);
  return { ok: true, playlistId: pl.id, videoId: video.id, youtubeId };
}

export function registerYtPlaylistsIpc(): void {
  ipcMain.handle('yt:list', (): YtPlaylistsStore => readStore());

  ipcMain.handle('yt:saveFolders', (_e, folders: YtPlaylistFolder[]): YtPlaylistsStore => {
    const store = readStore();
    store.folders = Array.isArray(folders) ? folders : [];
    return saveAndBroadcast(store);
  });

  ipcMain.handle(
    'yt:saveFolder',
    (_e, folder: YtPlaylistFolder): YtPlaylistsStore => {
      const store = readStore();
      const idx = store.folders.findIndex((f) => f.id === folder.id);
      if (idx >= 0) store.folders[idx] = folder;
      else store.folders.push(folder);
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle('yt:deleteFolder', (_e, folderId: string): YtPlaylistsStore => {
    const store = readStore();
    store.folders = store.folders.filter((f) => f.id !== folderId && f.parentId !== folderId);
    for (const p of store.playlists) {
      if (p.folderId === folderId) delete p.folderId;
    }
    return saveAndBroadcast(store);
  });

  ipcMain.handle('yt:addPlaylist', async (_e, url: string) => {
    const store = readStore();
    const result = await syncPlaylistFromUrl(store, typeof url === 'string' ? url : '');
    if ('error' in result) return { error: result.error };
    saveAndBroadcast(result.store);
    return { store: result.store, playlist: result.playlist };
  });

  ipcMain.handle('yt:refreshPlaylist', async (_e, playlistId: string) => {
    const store = readStore();
    const pl = store.playlists.find((p) => p.id === playlistId);
    if (!pl) return { error: 'Playlist not found.' };
    const result = await syncPlaylistFromUrl(store, pl.url, pl);
    if ('error' in result) return { error: result.error };
    saveAndBroadcast(result.store);
    return { store: result.store, playlist: result.playlist };
  });

  ipcMain.handle('yt:removePlaylist', (_e, playlistId: string): YtPlaylistsStore => {
    const store = readStore();
    const dropVideoIds = new Set(
      store.videos.filter((v) => v.playlistId === playlistId).map((v) => v.id),
    );
    store.playlists = store.playlists.filter((p) => p.id !== playlistId);
    store.videos = store.videos.filter((v) => v.playlistId !== playlistId);
    store.planToWatchIds = (store.planToWatchIds ?? []).filter((id) => !dropVideoIds.has(id));
    return saveAndBroadcast(store);
  });

  ipcMain.handle(
    'yt:setPlaylistPrefs',
    (
      _e,
      playlistId: string,
      prefs: Partial<{
        lang: YtStudyLang;
        preferSubs: YtSubLang[];
        autoUpdate: boolean;
        sortDefault: YtPlaylistSort;
        folderId: string | null;
        title: string;
      }>,
    ): YtPlaylistsStore | { error: string } => {
      const store = readStore();
      const pl = store.playlists.find((p) => p.id === playlistId);
      if (!pl) return { error: 'Playlist not found.' };
      if (prefs.lang === 'ja' || prefs.lang === 'zh' || prefs.lang === 'en') pl.lang = prefs.lang;
      if (Array.isArray(prefs.preferSubs)) {
        pl.preferSubs = prefs.preferSubs.filter(
          (l): l is YtSubLang => l === 'ja' || l === 'zh' || l === 'en' || l === 'ru',
        );
      }
      if (typeof prefs.autoUpdate === 'boolean') pl.autoUpdate = prefs.autoUpdate;
      if (
        prefs.sortDefault === 'playlist' ||
        prefs.sortDefault === 'views' ||
        prefs.sortDefault === 'date' ||
        prefs.sortDefault === 'title' ||
        prefs.sortDefault === 'unlogged'
      ) {
        pl.sortDefault = prefs.sortDefault;
      }
      if (prefs.folderId === null) delete pl.folderId;
      else if (typeof prefs.folderId === 'string') pl.folderId = prefs.folderId;
      if (typeof prefs.title === 'string' && prefs.title.trim()) pl.title = prefs.title.trim();
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle(
    'yt:downloadVideos',
    async (
      e,
      videoIds: string[],
    ): Promise<{
      store: YtPlaylistsStore;
      results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
    }> => {
      const sender = e.sender;
      return downloadVideosByIds(Array.isArray(videoIds) ? videoIds : [], (ev) => {
        sender.send('yt:downloadProgress', ev);
      });
    },
  );

  ipcMain.handle(
    'yt:fetchSubsOnly',
    async (
      _e,
      videoIds: string[],
    ): Promise<{ store: YtPlaylistsStore; results: Array<{ videoId: string; ok: boolean; error?: string }> }> => {
      const store = readStore();
      const results: Array<{ videoId: string; ok: boolean; error?: string }> = [];
      for (const videoId of Array.isArray(videoIds) ? videoIds : []) {
        const video = store.videos.find((v) => v.id === videoId);
        if (!video) {
          results.push({ videoId, ok: false, error: 'Video not found.' });
          continue;
        }
        const pl = store.playlists.find((p) => p.id === video.playlistId);
        const out = await fetchSubsOnly(video.youtubeId, video.url, pl?.preferSubs ?? ['ja']);
        if (!out.ok) {
          results.push({ videoId, ok: false, error: out.error });
          continue;
        }
        video.hasOfficialSubs = out.hasSubs;
        video.loggedAt = video.loggedAt ?? Date.now();
        results.push({ videoId, ok: true });
      }
      saveAndBroadcast(store);
      return { store, results };
    },
  );

  ipcMain.handle(
    'yt:markTranscribed',
    (
      _e,
      youtubeId: string,
      cuesJson: string,
    ): YtPlaylistsStore | { error: string } => {
      if (typeof youtubeId !== 'string' || !youtubeId) return { error: 'Missing youtubeId.' };
      fs.mkdirSync(transcriptsDir(), { recursive: true });
      try {
        fs.writeFileSync(transcriptPath(youtubeId), typeof cuesJson === 'string' ? cuesJson : '[]', 'utf-8');
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const store = readStore();
      for (const v of store.videos) {
        if (v.youtubeId === youtubeId) {
          v.transcribed = true;
          v.loggedAt = v.loggedAt ?? Date.now();
        }
      }
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle('yt:autoUpdateDue', async (): Promise<YtPlaylistsStore> => {
    let store = readStore();
    const now = Date.now();
    const due = store.playlists.filter(
      (p) =>
        isImmersionPlaylist(p) &&
        p.autoUpdate &&
        (!p.lastSyncedAt || now - p.lastSyncedAt >= AUTO_UPDATE_MS),
    );
    for (const pl of due) {
      const result = await syncPlaylistFromUrl(store, pl.url, pl);
      if (!('error' in result)) store = result.store;
    }
    if (due.length) saveAndBroadcast(store);
    return store;
  });

  ipcMain.handle(
    'yt:refreshAll',
    async (
      e,
    ): Promise<{
      store: YtPlaylistsStore;
      newVideoIds: string[];
      errors: Array<{ playlistId: string; title: string; error: string }>;
    }> => {
      const sender = e.sender;
      let store = readStore();
      const since = store.lastNewsCheckedAt ?? 0;
      const targets = store.playlists.filter(isImmersionPlaylist);
      const errors: Array<{ playlistId: string; title: string; error: string }> = [];
      for (let i = 0; i < targets.length; i++) {
        const pl = targets[i];
        try {
          sender.send('yt:refreshProgress', {
            playlistId: pl.id,
            index: i,
            total: targets.length,
            stage: 'syncing',
            title: pl.title,
          });
        } catch {
          /* window may be gone */
        }
        const result = await syncPlaylistFromUrl(store, pl.url, pl);
        if ('error' in result) {
          errors.push({ playlistId: pl.id, title: pl.title, error: result.error });
        } else {
          store = result.store;
        }
      }
      store.lastNewsCheckedAt = Date.now();
      saveAndBroadcast(store);
      const newVideoIds = diffNewVideos(store, since).map((v) => v.id);
      try {
        sender.send('yt:refreshProgress', {
          playlistId: '',
          index: targets.length,
          total: targets.length,
          stage: 'done',
          title: '',
        });
      } catch {
        /* ignore */
      }
      return { store, newVideoIds, errors };
    },
  );

  ipcMain.handle(
    'yt:addToPlanToWatch',
    (_e, videoIds: string[]): YtPlaylistsStore => {
      const store = addPlanToWatchIds(readStore(), Array.isArray(videoIds) ? videoIds : []);
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle(
    'yt:removeFromPlanToWatch',
    (_e, videoIds: string[]): YtPlaylistsStore => {
      const store = removePlanToWatchIds(readStore(), Array.isArray(videoIds) ? videoIds : []);
      return saveAndBroadcast(store);
    },
  );
}

/** Flat entry mapper exported for tests via shared helpers; keep sync pure in shared. */
export type { YtVideo, YtPlaylist };
