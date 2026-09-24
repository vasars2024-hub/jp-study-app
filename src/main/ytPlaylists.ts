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
  ensureTrackedChannel,
  mergePlaylistVideos,
  normalizeYtStore,
  parseYoutubeChannelUrl,
  parseYoutubePlaylistId,
  youtubeUploadsPlaylistId,
  addPlanToWatchIds,
  removePlanToWatchIds,
  diffNewVideos,
  EXTENSION_YT_PLAYLIST_ID,
  isImmersionPlaylist,
  youtubeThumbUrl,
  youtubeWatchUrl,
  trackedChannels,
  type YtPlaylist,
  type YtPlaylistFolder,
  type YtPlaylistSort,
  type YtChannel,
  type YtPlaylistsStore,
  type YtStudyLang,
  type YtSubLang,
  type YtVideo,
} from '../shared/ytPlaylists';
import type { YouTubeDownloadOptions, YouTubeSubtitleLang } from '../shared/types';
import { countTranscriptCues } from '../shared/extensionTranscribe';
import { mt } from './i18n';
import {
  YOUTUBE_PLAYLIST_STORE_FILE,
  YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY,
  YOUTUBE_TRANSCRIPT_DIRECTORY,
} from '../shared/youtubeStorage';
import {
  downloadYoutubeUrl,
  findYtDlp,
  ytDlpJson,
  ytDlpSubtitleLangs,
  withYtDlpJsRuntime,
} from './media';
import { registerYoutubeDiscoveryIpc } from './youtubeDiscovery';
import { errorDetail, logDiagnostic } from './errorLog';

const DEFAULT_AUTO_UPDATE_HOURS = 12;

function storePath(): string {
  return path.join(app.getPath('userData'), YOUTUBE_PLAYLIST_STORE_FILE);
}

function transcriptsDir(): string {
  return path.join(app.getPath('userData'), YOUTUBE_TRANSCRIPT_DIRECTORY);
}

function subsCacheDir(): string {
  return path.join(app.getPath('userData'), YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY);
}

function transcriptPath(youtubeId: string): string {
  return path.join(transcriptsDir(), `${youtubeId}.json`);
}

/**
 * Move a store we cannot read aside instead of letting the next save overwrite
 * it. Returns the quarantine path, or null when the rename itself failed —
 * either way the caller carries on with an empty store, because refusing to
 * start is worse than starting empty once the bytes are safe.
 */
function quarantineStore(reason: string): string | null {
  const file = storePath();
  const aside = `${file}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(file, aside);
  } catch {
    return null;
  }
  logDiagnostic(
    'error',
    'youtube',
    'readStore',
    `Playlist store was unreadable (${reason}); moved to ${path.basename(aside)} and started empty.`,
  );
  return aside;
}

/**
 * Read the store, keeping apart three cases that used to collapse into one.
 *
 * This used to be `catch { return emptyYtStore(); }`, so a file left truncated
 * by an interrupted write read as "the user has no playlists" and the very next
 * ordinary save persisted that emptiness over the only copy — every playlist,
 * video, folder and subscription gone, silently. Now an absent file is still a
 * normal empty start, an unparseable one is moved aside so the bytes survive,
 * and any other I/O failure is raised rather than answered with a blank library
 * that a later write would make permanent.
 */
function readStore(): YtPlaylistsStore {
  let raw: string;
  try {
    raw = fs.readFileSync(storePath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return emptyYtStore();
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    quarantineStore(errorDetail(err));
    return emptyYtStore();
  }

  const store = normalizeYtStore(parsed);
  // `normalizeYtStore` is a total function: any shape it does not recognise
  // comes back as an empty store, which is indistinguishable from a genuinely
  // empty one. Only the raw text can tell them apart, so ask it before
  // accepting the emptiness.
  if (isEmptyYtStore(store) && rawClaimsContent(parsed)) {
    quarantineStore('shape not recognised');
  }
  return store;
}

function isEmptyYtStore(store: YtPlaylistsStore): boolean {
  return (
    store.playlists.length === 0 && store.videos.length === 0 && store.folders.length === 0
  );
}

/** True when the parsed JSON held playlists/videos/folders that normalizing dropped. */
function rawClaimsContent(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  return (['playlists', 'videos', 'folders'] as const).some(
    (k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0,
  );
}

/** Read-only snapshot for the Chrome extension HTTP bridge. */
export function readStoreForExtension(): YtPlaylistsStore {
  return readStore();
}

/**
 * Cues already on disk for one video, or `null` when there is no transcript.
 *
 * MINING gate 11's cue count comes from here rather than from the store's
 * `transcribed` boolean: the flag says a run happened, the file says how much
 * text it produced, and only the second is a number the gate can report. `0`
 * and `null` stay distinct — an empty transcript is a finding, a missing one is
 * a job to queue.
 */
export function readTranscriptCueCount(youtubeId: string): number | null {
  if (!youtubeId) return null;
  try {
    return countTranscriptCues(fs.readFileSync(transcriptPath(youtubeId), 'utf-8'));
  } catch {
    return null;
  }
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

/**
 * Write through a temporary file and rename onto the target, matching the ten
 * other userData stores under `src/main` (agentOperationalStore, collectedTools,
 * credentials/vault and the rest). A bare `writeFileSync` leaves a truncated
 * file behind if the process dies mid-write, and `readStore` then had no way to
 * tell that from an empty library. The sweep now writes once per playlist and
 * once per downloaded video, so these writes happen unattended and often.
 */
function writeStore(store: YtPlaylistsStore): void {
  const file = storePath();
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Already renamed onto the target, or the temporary file vanished.
    }
  }
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

/**
 * The only write path for anything that awaits.
 *
 * `writeStore` persists the WHOLE store, so a caller that read a snapshot,
 * awaited a provider and then wrote that snapshot back reverted every unrelated
 * write made while it ran — a saved folder, an `autoUpdate` the user turned off,
 * a playlist they removed. A yt-dlp sweep is minutes long and the background
 * auto-update timer runs one unattended, so that window is wide and the loss is
 * silent. Mutations therefore run against the store as it is on disk at commit
 * time; the mutator is synchronous, so nothing can interleave with it.
 *
 * Returning `null` aborts the commit and writes nothing — that is how a caller
 * says "the thing I was working on is gone, and a response already in flight
 * must not resurrect it".
 */
function commitStore(
  mutate: (store: YtPlaylistsStore) => YtPlaylistsStore | null | void,
): YtPlaylistsStore {
  const fresh = readStore();
  const next = mutate(fresh);
  if (next === null) return fresh;
  return saveAndBroadcast(next ?? fresh);
}

function touchChannelFromPlaylist(store: YtPlaylistsStore, playlist: YtPlaylist): YtPlaylistsStore {
  return ensureTrackedChannel(store, playlist);
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

interface PlaylistFetch {
  listId: string;
  url: string;
  mapped: ReturnType<typeof mapFlatEntries>;
}

/**
 * The network half of a playlist sync. It touches no store, which is the whole
 * point: awaiting it cannot strand a stale snapshot.
 */
async function fetchPlaylist(url: string): Promise<PlaylistFetch | { error: string }> {
  const playlistId = parseYoutubePlaylistId(url);
  // A channel (`@handle`, `/channel/UC…`, `/c/…`, `/user/…`) is followed as its
  // uploads: `/channel/UC…` maps straight to the `UU…` playlist, the other
  // shapes to their `/videos` tab, which yt-dlp resolves to the channel.
  const channel = playlistId ? null : parseYoutubeChannelUrl(url);
  if (!playlistId && !channel) return { error: mt('ytManager.error.notPlaylistOrChannel') };

  const result = await ytDlpJson([
    '-J',
    '--flat-playlist',
    '--no-download',
    '--playlist-end',
    '5000',
    channel ? channel.fetchUrl : url.trim(),
  ]);
  if (!result.ok) return { error: result.error };
  const mapped = mapFlatEntries(result.data);
  if (!channel) return { listId: playlistId as string, url: url.trim(), mapped };

  const root = (result.data && typeof result.data === 'object' ? result.data : {}) as Record<string, unknown>;
  const channelId = [root.channel_id, root.id].find((value): value is string => typeof value === 'string' && /^UC[\w-]{22}$/.test(value));
  const uploads = channel.uploadsPlaylistId ?? (channelId ? youtubeUploadsPlaylistId(channelId) : null);
  const listId = uploads ?? `channel:${channel.kind}:${channel.value}`;
  return {
    listId,
    // Stored so a refresh fetches the same listing again.
    url: channel.fetchUrl,
    mapped: {
      ...mapped,
      youtubePlaylistId: listId,
      // The `/videos` tab is titled "<Channel> - Videos"; the channel is the name.
      title: mapped.channelTitle || mapped.title.replace(/\s+-\s+(Videos|Uploads)$/i, ''),
    },
  };
}

/**
 * The store half, deliberately synchronous so it can run inside `commitStore`
 * against a freshly-read store. The playlist is re-resolved BY ID here rather
 * than carried across the await as an object — that is what makes a mid-sync
 * `autoUpdate: false` or a rename survive, since `{ ...existing }` then spreads
 * the user's current values and not the ones from before the fetch.
 *
 * Returns null when an `existingId` no longer resolves: the user removed the
 * playlist while its response was in flight, and a delete must stay deleted.
 */
function applyPlaylistSync(
  store: YtPlaylistsStore,
  fetched: PlaylistFetch,
  existingId?: string,
): { store: YtPlaylistsStore; playlist: YtPlaylist } | null {
  const { mapped, listId } = fetched;
  const url = fetched.url;
  const resolvedYoutubeId = mapped.youtubePlaylistId || listId;
  const existing = existingId
    ? store.playlists.find((p) => p.id === existingId)
    : store.playlists.find((p) => p.youtubePlaylistId === resolvedYoutubeId);
  if (existingId && !existing) return null;

  const playlistId = existing?.id ?? crypto.randomUUID();
  const playlist: YtPlaylist = existing
    ? {
        ...existing,
        title: mapped.title || existing.title,
        url,
        youtubePlaylistId: resolvedYoutubeId,
        channelTitle: mapped.channelTitle ?? existing.channelTitle,
        lastSyncedAt: Date.now(),
        lastCheckedAt: Date.now(),
      }
    : {
        id: playlistId,
        title: mapped.title || 'Playlist',
        url,
        youtubePlaylistId: resolvedYoutubeId,
        channelTitle: mapped.channelTitle,
        subscriptionStatus: 'subscribed',
        lang: 'ja',
        preferSubs: ['ja'],
        autoUpdate: true,
        lastSyncedAt: Date.now(),
        lastCheckedAt: Date.now(),
        updateFrequencyHours: DEFAULT_AUTO_UPDATE_HOURS,
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
    // Upsert by youtube playlist id: when no `existingId` was given, `existing`
    // is already the duplicate this url resolves to, so there is nothing to add.
    store.playlists = store.playlists.map((p) => (p.id === playlistId ? playlist : p));
  } else {
    store.playlists.unshift(playlist);
  }
  return { store: touchChannelFromPlaylist(store, playlist), playlist };
}

/**
 * Fetch a playlist and commit it: the network call holds no snapshot, and the
 * apply runs against the store as it is when the response lands.
 */
async function syncAndCommit(
  url: string,
  existingId?: string,
): Promise<{ store: YtPlaylistsStore; playlist: YtPlaylist } | { error: string }> {
  const fetched = await fetchPlaylist(url);
  if ('error' in fetched) return fetched;
  let synced: { store: YtPlaylistsStore; playlist: YtPlaylist } | null = null;
  const store = commitStore((fresh) => {
    synced = applyPlaylistSync(fresh, fetched, existingId);
    return synced ? synced.store : null;
  });
  if (!synced) return { error: mt('ytManager.error.removedWhileSyncing') };
  return { store, playlist: (synced as { playlist: YtPlaylist }).playlist };
}

/**
 * Subtitle languages for a playlist download: the playlist's own preference,
 * plus Japanese (the study line) and English (the second line), always. With
 * `autoCaptions`, YouTube's auto-generated tracks are requested too, so a
 * video with no creator subtitles still arrives with text; where both exist
 * yt-dlp writes the creator track, and the pick after download ranks creator
 * tracks first as before.
 */
export function preferSubsToDownloadOptions(preferSubs: YtSubLang[], autoCaptions = true): YouTubeDownloadOptions {
  const preferred = preferSubs.filter((l): l is Exclude<YouTubeSubtitleLang, 'none'> =>
    l === 'ja' || l === 'zh' || l === 'en' || l === 'ru',
  );
  const langs = [...new Set<Exclude<YouTubeSubtitleLang, 'none'>>([...preferred, 'ja', 'en'])];
  return {
    audioOnly: false,
    subtitleLang: langs[0] ?? 'none',
    subtitleLangs: langs,
    autoCaptions,
  };
}

export interface YtDownloadRequestOptions {
  audioOnly?: boolean;
  allSubs?: boolean;
  /** Also request auto-generated captions (default true). */
  autoCaptions?: boolean;
}

/** Re-validates download options that crossed the bridge. */
export function sanitizeYtDownloadOptions(value: unknown): YtDownloadRequestOptions {
  const r = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const out: YtDownloadRequestOptions = {};
  if (typeof r.audioOnly === 'boolean') out.audioOnly = r.audioOnly;
  if (typeof r.allSubs === 'boolean') out.allSubs = r.allSubs;
  if (typeof r.autoCaptions === 'boolean') out.autoCaptions = r.autoCaptions;
  return out;
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
  downloadOpts?: YtDownloadRequestOptions,
): Promise<{
  store: YtPlaylistsStore;
  results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
}> {
  const results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }> = [];
  const ids = Array.isArray(videoIds) ? videoIds : [];
  for (let i = 0; i < ids.length; i++) {
    const videoId = ids[i];
    // Re-read per video: a download of twenty is long, and the nineteenth must
    // be planned against the library as it is now, not as it was at the start.
    const snapshot = readStore();
    const video = snapshot.videos.find((v) => v.id === videoId);
    if (!video) {
      results.push({ videoId, ok: false, error: mt('ytManager.error.videoNotFound') });
      continue;
    }
    const pl = snapshot.playlists.find((p) => p.id === video.playlistId);
    const opts = preferSubsToDownloadOptions(pl?.preferSubs ?? ['ja'], downloadOpts?.autoCaptions !== false);
    if (downloadOpts?.audioOnly === true) opts.audioOnly = true;
    if (downloadOpts?.allSubs === true) opts.allSubs = true;
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
    commitStore((fresh) => {
      const target = fresh.videos.find((v) => v.id === videoId);
      // Removed while it downloaded. The file on disk is the user's to keep;
      // the row is not coming back.
      if (!target) return null;
      target.downloaded = true;
      target.mediaItemId = result.item.id;
      target.hasOfficialSubs = Boolean(result.subtitle);
      target.loggedAt = target.loggedAt ?? Date.now();
      return fresh;
    });
    results.push({ videoId, ok: true, mediaItemId: result.item.id });
  }
  return { store: readStore(), results };
}

async function fetchSubsOnly(
  youtubeId: string,
  url: string,
  preferSubs: YtSubLang[],
): Promise<{ ok: true; hasSubs: boolean } | { ok: false; error: string }> {
  const bin = await findYtDlp();
  if (!bin) return { ok: false, error: mt('ytManager.error.noYtDlp') };
  const langs = preferSubsToDownloadOptions(preferSubs).subtitleLangs ?? [];
  if (!langs.length) return { ok: true, hasSubs: false };
  const subLangArgs = langs.flatMap((l) => ytDlpSubtitleLangs(l));
  const outDir = path.join(subsCacheDir(), youtubeId);
  fs.mkdirSync(outDir, { recursive: true });
  const args = await withYtDlpJsRuntime([
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
  ]);
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
  const result = await syncAndCommit(url);
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, playlistId: result.playlist.id };
}

const EXTENSION_PLAYLIST_KEY = '__extension__';

/** Upsert a single YouTube watch URL into the Extension captures playlist (metadata only). */
/**
 * True when a stored row still carries the placeholder identity `addVideoByUrl`
 * writes when `ytDlpJson` does not answer: the raw 11-character video id as the
 * title, and no duration.
 *
 * Without this the failure was permanent. The row was pushed anyway (which is
 * right — the extension capture must not be lost because a subprocess was busy),
 * but the next save of the same URL matched `existing` and returned
 * `duplicate: true` without ever re-asking, so a momentary yt-dlp outage renamed
 * the video to `dQw4w9WgXcQ` for good.
 */
function needsMetadataRefetch(video: YtVideo): boolean {
  return video.title === video.youtubeId && video.durationSec === undefined;
}

/** Find the Extension captures playlist in the given store, creating it if absent. */
function ensureExtensionPlaylist(store: YtPlaylistsStore): YtPlaylist {
  const found = store.playlists.find((p) => p.youtubePlaylistId === EXTENSION_PLAYLIST_KEY);
  if (found) return found;
  const created: YtPlaylist = {
    id: crypto.randomUUID(),
    title: 'Extension',
    url: 'extension://captures',
    youtubePlaylistId: EXTENSION_PLAYLIST_KEY,
    channelTitle: 'Chrome extension',
    subscriptionStatus: 'custom',
    lang: 'ja',
    preferSubs: ['ja', 'en'],
    autoUpdate: false,
    lastSyncedAt: Date.now(),
    lastCheckedAt: Date.now(),
    updateFrequencyHours: DEFAULT_AUTO_UPDATE_HOURS,
    sortDefault: 'date',
    createdAt: Date.now(),
  };
  store.playlists.unshift(created);
  return created;
}

export async function addVideoByUrl(
  url: string,
): Promise<
  | { ok: true; playlistId: string; videoId: string; youtubeId: string; duplicate?: boolean }
  | { ok: false; error: string }
> {
  const trimmed = (url ?? '').trim();
  const { parseYoutubeVideoId } = await import('../shared/extensionCapture');
  const youtubeId = parseYoutubeVideoId(trimmed);
  if (!youtubeId) return { ok: false, error: mt('ytManager.error.notVideo') };

  // Phase 1, synchronous: make sure the Extension playlist exists and decide
  // whether this capture is already complete. Committed before the fetch so the
  // early-return answers with a persisted playlist id.
  let earlyHit: { playlistId: string; videoId: string } | null = null;
  let playlistIdResolved = '';
  commitStore((store) => {
    const pl = ensureExtensionPlaylist(store);
    playlistIdResolved = pl.id;
    const existing = store.videos.find((v) => v.playlistId === pl.id && v.youtubeId === youtubeId);
    if (existing && !needsMetadataRefetch(existing)) {
      earlyHit = { playlistId: pl.id, videoId: existing.id };
    }
    return store;
  });
  if (earlyHit) {
    const hit = earlyHit as { playlistId: string; videoId: string };
    return { ok: true, playlistId: hit.playlistId, videoId: hit.videoId, youtubeId, duplicate: true };
  }

  let title = youtubeId;
  let channelId: string | undefined;
  let channelTitle: string | undefined;
  let durationSec: number | undefined;
  let viewCount: number | undefined;
  let thumbUrl = youtubeThumbUrl(youtubeId);
  let publishedAt: number | undefined;

  const meta = await ytDlpJson(['-J', '--no-playlist', '--skip-download', trimmed]);
  if (meta.ok && meta.data && typeof meta.data === 'object') {
    const root = meta.data as Record<string, unknown>;
    if (typeof root.title === 'string' && root.title) title = root.title;
    if (typeof root.channel_id === 'string' && root.channel_id) {
      channelId = root.channel_id;
    }
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

  // Phase 3: commit against the store as it is now, not as it was before the
  // fetch. The playlist and the row are both re-resolved here — the capture may
  // have arrived a second time, or the user may have cleared the playlist.
  let landed: { videoId: string; duplicate: boolean } | null = null;
  commitStore((store) => {
    const pl = ensureExtensionPlaylist(store);
    playlistIdResolved = pl.id;
    if (channelId) pl.channelId = channelId;
    const existing = store.videos.find((v) => v.playlistId === pl.id && v.youtubeId === youtubeId);
    if (existing) {
      // Second visit to a row this function stored hollow the first time,
      // because yt-dlp did not answer. Patch what we now know and leave the rest
      // alone — the id, the position and any `downloaded`/`transcribed` progress
      // the user has since earned on it all stay.
      existing.title = title;
      existing.thumbUrl = thumbUrl;
      if (durationSec !== undefined) existing.durationSec = durationSec;
      if (viewCount !== undefined) existing.viewCount = viewCount;
      if (channelTitle) existing.channelTitle = channelTitle;
      if (publishedAt !== undefined) existing.publishedAt = publishedAt;
      if (channelTitle) pl.channelTitle = channelTitle;
      landed = { videoId: existing.id, duplicate: true };
      return touchChannelFromPlaylist(store, pl);
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
      position: store.videos.filter((v) => v.playlistId === pl.id).length,
      publishedAt,
      downloaded: false,
      hasOfficialSubs: null,
      transcribed: false,
    };
    store.videos.push(video);
    pl.lastSyncedAt = Date.now();
    pl.lastCheckedAt = Date.now();
    if (channelTitle) pl.channelTitle = channelTitle;
    landed = { videoId: video.id, duplicate: false };
    return touchChannelFromPlaylist(store, pl);
  });
  const out = landed as unknown as { videoId: string; duplicate: boolean };
  return {
    ok: true,
    playlistId: playlistIdResolved,
    videoId: out.videoId,
    youtubeId,
    ...(out.duplicate ? { duplicate: true } : {}),
  };
}

const AUTO_UPDATE_TICK_MS = 60 * 60 * 1000;
/** First tick is delayed so app start is not competing with a yt-dlp spawn. */
const AUTO_UPDATE_FIRST_TICK_MS = 5 * 60 * 1000;
let autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
let autoUpdateFirstTimer: ReturnType<typeof setTimeout> | null = null;
let autoUpdateRunning = false;

function isDue(lastCheckedAt: number | undefined, frequencyHours: number, now: number): boolean {
  if (!lastCheckedAt) return true;
  return now - lastCheckedAt >= frequencyHours * 60 * 60 * 1000;
}

/**
 * Sync every immersion playlist whose auto-update clock has come round.
 *
 * Selection is on the playlist's OWN clock and nothing else. The previous shape
 * also excluded any playlist whose channel was due — and `normalizeYtStore`
 * copies a playlist's `lastCheckedAt` and `updateFrequencyHours` onto its channel
 * on every read, so "channel is due" evaluated to the same boolean as "playlist
 * is due". The filter read `p is due && !(p is due)` and selected nothing: no
 * playlist belonging to a tracked channel was ever swept.
 */
export async function runAutoUpdateDue(): Promise<YtPlaylistsStore> {
  let store = readStore();
  const now = Date.now();
  const due = store.playlists.filter(
    (p) => isImmersionPlaylist(p) && p.autoUpdate && isDue(p.lastCheckedAt, p.updateFrequencyHours, now),
  );
  // Each playlist commits on its own. Holding one snapshot across the whole
  // sweep is what made this unattended timer revert the user's work: a sweep of
  // twenty playlists is minutes long, and everything they saved in that window
  // was overwritten by the state from before it started.
  for (const pl of due) {
    const fetched = await fetchPlaylist(pl.url);
    if ('error' in fetched) continue;
    store = commitStore((fresh) => {
      const current = fresh.playlists.find((p) => p.id === pl.id);
      // Removed, or auto-update switched off, while this response was in
      // flight. Either way the user has spoken more recently than the sweep.
      if (!current || !current.autoUpdate) return null;
      const applied = applyPlaylistSync(fresh, fetched, pl.id);
      return applied ? applied.store : null;
    });
  }
  return store;
}

async function autoUpdateTick(): Promise<void> {
  if (autoUpdateRunning) return;
  autoUpdateRunning = true;
  try {
    await runAutoUpdateDue();
  } catch {
    /* a sweep that throws must not kill the timer */
  } finally {
    autoUpdateRunning = false;
  }
}

/**
 * The auto-update setting had no actor. `yt:autoUpdateDue` was bound in
 * `preload.ts` and declared in `window.d.ts`, and no renderer file ever invoked
 * it — so the "Update automatically" checkbox and its frequency select persisted
 * a preference that nothing read. Main owns the clock now, which is also the only
 * place it can survive the window being closed.
 */
export function startYtAutoUpdateTimer(): void {
  if (autoUpdateTimer || autoUpdateFirstTimer) return;
  autoUpdateFirstTimer = setTimeout(() => {
    autoUpdateFirstTimer = null;
    void autoUpdateTick();
    autoUpdateTimer = setInterval(() => void autoUpdateTick(), AUTO_UPDATE_TICK_MS);
  }, AUTO_UPDATE_FIRST_TICK_MS);
}

export function stopYtAutoUpdateTimer(): void {
  if (autoUpdateFirstTimer) clearTimeout(autoUpdateFirstTimer);
  if (autoUpdateTimer) clearInterval(autoUpdateTimer);
  autoUpdateFirstTimer = null;
  autoUpdateTimer = null;
}

export function registerYtPlaylistsIpc(): void {
  // Discovery is the finding half of the same feature and reuses this module's
  // yt-dlp plumbing, so it is wired here rather than adding a second call site
  // in `main.ts` — which slice 70 owns this hour anyway.
  registerYoutubeDiscoveryIpc();

  ipcMain.handle('yt:list', (): YtPlaylistsStore => readStore());

  ipcMain.handle('yt:listChannels', (): YtChannel[] => trackedChannels(readStore()));

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
    const result = await syncAndCommit(typeof url === 'string' ? url : '');
    if ('error' in result) return { error: result.error };
    return { store: result.store, playlist: result.playlist };
  });

  // The discovery → playlist-manager hand-off. Metadata only: `addVideoByUrl`
  // records the video in the Extension captures playlist and fetches nothing but
  // its title card. Downloading stays the explicit `yt:downloadVideos` action.
  ipcMain.handle('yt:addVideoByUrl', async (_e, url: unknown) =>
    addVideoByUrl(typeof url === 'string' ? url : ''));

  // Reads back a caption file `yt:fetchSubsOnly` already cached, so the renderer
  // can measure speech pace with the cue parser it already owns
  // (`renderer/subtitles.ts`) instead of a second one living here. Reads only —
  // it never fetches, so a video whose subs were never fetched answers null.
  ipcMain.handle('yt:cachedCaptionText', (_e, youtubeId: unknown): { text: string | null; file: string | null } => {
    if (typeof youtubeId !== 'string' || !/^[\w-]{6,}$/.test(youtubeId)) return { text: null, file: null };
    const dir = path.join(subsCacheDir(), youtubeId);
    try {
      const files = fs.readdirSync(dir).filter((f) => /\.(vtt|srt|ass|ssa)$/i.test(f));
      // Prefer a Japanese track when several languages were cached: pace is a
      // property of the spoken language, and measuring it off the English track
      // would report the translator's rate, not the speaker's.
      const chosen = files.find((f) => /\.ja[.-]/i.test(f) || /\.ja\./i.test(f)) ?? files[0];
      if (!chosen) return { text: null, file: null };
      return { text: fs.readFileSync(path.join(dir, chosen), 'utf-8'), file: chosen };
    } catch {
      return { text: null, file: null };
    }
  });

  ipcMain.handle('yt:refreshPlaylist', async (_e, playlistId: string) => {
    const pl = readStore().playlists.find((p) => p.id === playlistId);
    if (!pl) return { error: mt('ytManager.error.playlistNotFound') };
    const result = await syncAndCommit(pl.url, pl.id);
    if ('error' in result) return { error: result.error };
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
        channelId: string;
        channelTitle: string;
        channelIconUrl: string;
        subscriptionStatus: YtPlaylist['subscriptionStatus'];
        updateFrequencyHours: number;
      }>,
    ): YtPlaylistsStore | { error: string } => {
      const store = readStore();
      const pl = store.playlists.find((p) => p.id === playlistId);
      if (!pl) return { error: mt('ytManager.error.playlistNotFound') };
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
      if (typeof prefs.channelId === 'string') pl.channelId = prefs.channelId.trim() || undefined;
      if (typeof prefs.channelTitle === 'string') pl.channelTitle = prefs.channelTitle.trim() || undefined;
      if (typeof prefs.channelIconUrl === 'string') pl.channelIconUrl = prefs.channelIconUrl.trim() || undefined;
      if (
        prefs.subscriptionStatus === 'subscribed' ||
        prefs.subscriptionStatus === 'watching' ||
        prefs.subscriptionStatus === 'custom' ||
        prefs.subscriptionStatus === 'unsubscribed'
      ) {
        pl.subscriptionStatus = prefs.subscriptionStatus;
      }
      if (typeof prefs.updateFrequencyHours === 'number' && Number.isFinite(prefs.updateFrequencyHours)) {
        pl.updateFrequencyHours = Math.max(1, Math.round(prefs.updateFrequencyHours));
      }
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle(
    'yt:setChannelPrefs',
    (
      _e,
      channelId: string,
      prefs: Partial<{
        title: string;
        iconUrl: string;
        subscriptionStatus: YtChannel['subscriptionStatus'];
        updateFrequencyHours: number;
      }>,
    ): YtPlaylistsStore | { error: string } => {
      const store = readStore();
      const channel = store.channels.find((c) => c.channelId === channelId);
      if (!channel) return { error: mt('ytManager.error.channelNotFound') };
      if (typeof prefs.title === 'string' && prefs.title.trim()) channel.title = prefs.title.trim();
      if (typeof prefs.iconUrl === 'string') channel.iconUrl = prefs.iconUrl.trim() || undefined;
      if (
        prefs.subscriptionStatus === 'subscribed' ||
        prefs.subscriptionStatus === 'watching' ||
        prefs.subscriptionStatus === 'custom' ||
        prefs.subscriptionStatus === 'unsubscribed'
      ) {
        channel.subscriptionStatus = prefs.subscriptionStatus;
      }
      if (typeof prefs.updateFrequencyHours === 'number' && Number.isFinite(prefs.updateFrequencyHours)) {
        channel.updateFrequencyHours = Math.max(1, Math.round(prefs.updateFrequencyHours));
      }
      for (const pl of store.playlists) {
        if (pl.channelId !== channelId) continue;
        pl.channelTitle = channel.title;
        pl.channelIconUrl = channel.iconUrl;
        pl.subscriptionStatus = channel.subscriptionStatus;
        pl.updateFrequencyHours = channel.updateFrequencyHours;
      }
      return saveAndBroadcast(store);
    },
  );

  ipcMain.handle(
    'yt:refreshChannel',
    async (
      _e,
      channelId: string,
    ): Promise<
      | { store: YtPlaylistsStore; channel: YtChannel; refreshedPlaylistIds: string[]; errors: string[] }
      | { error: string }
    > => {
      let store = readStore();
      const channel = store.channels.find((c) => c.channelId === channelId);
      if (!channel) return { error: mt('ytManager.error.channelNotFound') };
      const targets = store.playlists.filter((p) => p.channelId === channelId);
      const refreshedPlaylistIds: string[] = [];
      const errors: string[] = [];
      for (const pl of targets) {
        const result = await syncAndCommit(pl.url, pl.id);
        if ('error' in result) {
          errors.push(result.error);
          continue;
        }
        store = result.store;
        refreshedPlaylistIds.push(pl.id);
      }
      // A sync that failed is not a check. `applyPlaylistSync` already stamps
      // `lastCheckedAt` on each playlist it actually refreshed; stamping the rest
      // here made `yt:autoUpdateDue` skip them for a whole `updateFrequencyHours`
      // window on the strength of a request that never answered.
      if (!errors.length) {
        store = commitStore((fresh) => {
          const nextChannel = fresh.channels.find((c) => c.channelId === channelId);
          if (!nextChannel) return null;
          nextChannel.lastCheckedAt = Date.now();
          return fresh;
        });
      }
      const nextChannel = store.channels.find((c) => c.channelId === channelId);
      return { store, channel: nextChannel ?? channel, refreshedPlaylistIds, errors };
    },
  );

  ipcMain.handle(
    'yt:downloadVideos',
    async (
      e,
      videoIds: string[],
      options?: unknown,
    ): Promise<{
      store: YtPlaylistsStore;
      results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
    }> => {
      const sender = e.sender;
      return downloadVideosByIds(Array.isArray(videoIds) ? videoIds : [], (ev) => {
        sender.send('yt:downloadProgress', ev);
      }, sanitizeYtDownloadOptions(options));
    },
  );

  ipcMain.handle(
    'yt:fetchSubsOnly',
    async (
      _e,
      videoIds: string[],
    ): Promise<{ store: YtPlaylistsStore; results: Array<{ videoId: string; ok: boolean; error?: string }> }> => {
      const results: Array<{ videoId: string; ok: boolean; error?: string }> = [];
      for (const videoId of Array.isArray(videoIds) ? videoIds : []) {
        const snapshot = readStore();
        const video = snapshot.videos.find((v) => v.id === videoId);
        if (!video) {
          results.push({ videoId, ok: false, error: mt('ytManager.error.videoNotFound') });
          continue;
        }
        const pl = snapshot.playlists.find((p) => p.id === video.playlistId);
        const out = await fetchSubsOnly(video.youtubeId, video.url, pl?.preferSubs ?? ['ja']);
        if (!out.ok) {
          results.push({ videoId, ok: false, error: out.error });
          continue;
        }
        commitStore((fresh) => {
          const target = fresh.videos.find((v) => v.id === videoId);
          if (!target) return null;
          target.hasOfficialSubs = out.hasSubs;
          target.loggedAt = target.loggedAt ?? Date.now();
          return fresh;
        });
        results.push({ videoId, ok: true });
      }
      return { store: readStore(), results };
    },
  );

  ipcMain.handle(
    'yt:markTranscribed',
    (
      _e,
      youtubeId: string,
      cuesJson: string,
    ): YtPlaylistsStore | { error: string } => {
      if (typeof youtubeId !== 'string' || !youtubeId) return { error: mt('ytManager.error.notVideo') };
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

  ipcMain.handle('yt:autoUpdateDue', async (): Promise<YtPlaylistsStore> => runAutoUpdateDue());

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
        const result = await syncAndCommit(pl.url, pl.id);
        if ('error' in result) {
          errors.push({ playlistId: pl.id, title: pl.title, error: result.error });
        } else {
          store = result.store;
        }
      }
      store = commitStore((fresh) => {
        fresh.lastNewsCheckedAt = Date.now();
        return fresh;
      });
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
