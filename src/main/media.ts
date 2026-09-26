import { app, ipcMain, dialog, protocol, BrowserWindow } from 'electron';
import { partialDownloadFiles, subtitleIsAutoCaption } from '../shared/youtubeDownloadFiles';
import { readWatchLibrary } from './watchLibrary';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type {
  MediaAcquiredImport,
  MediaDownloadError,
  MediaItem,
  MediaOpen,
  SubtitleFallbackFont,
  SubtitlePick,
  YouTubeAudioTrackReceipt,
  YouTubeDownloadOptions,
  YouTubeSubtitleLang,
} from '../shared/types';
import {
  audioLangRefusalMessage,
  normalizeYouTubeAudioLang,
  planYoutubeAudioTrack,
  youtubeAudioProbeArgs,
  youtubeFormatArgs,
  type YtDlpFormat,
} from '../shared/ytAudioLang';
import type { MediaBackupContract, MediaOrganizationPreview, MediaRelationship, MediaDuplicateChoice } from '../shared/mediaHub';
import { previewMediaOrganization } from '../shared/mediaHub';
import {
  RELEASE_IDENTITY_VERSION,
  inferMediaCategory,
  parseMediaFileName,
  refreshReleaseIdentity,
} from '../shared/mediaFileIdentity';
import {
  MEDIA_DOWNLOAD_DIRECTORY,
  MEDIA_LIBRARY_STORE_FILE,
  mediaItemsFromStoredDocument,
} from '../shared/mediaLibraryEntries';
import { YOUTUBE_MEDIA_SUBTITLE_DIRECTORY } from '../shared/youtubeStorage';
import { classifyMediaKind } from '../shared/mediaKind';
import { clearMediaArtwork, ensureMediaArtwork } from './mediaArtwork';
import { resolveSubtitleFallbackFont } from './subtitleFallbackFont';
import { registerMediaMetadataIpc, runMediaMetadata } from './mediaMetadata';
import { registerMediaDiscoveryIpc } from './mediaDiscovery';
import { registerTranscriptionIpc } from './transcriptionJobs';
import { getMediaIngest, registerMediaIngest } from './mediaIngest';
import {
  clearSubtitleCache,
  loadDiscoverySettings,
  pickPlaybackSubtitle,
  readSubtitleRecord,
  registerSubtitleDiscoveryIpc,
  runSubtitleDiscovery,
} from './subtitleDiscovery';
import { registerSubtitleHarvestIpc } from './subtitleHarvest';
import { getMainStudyLangTag } from './studyLanguage';
import {
  registerSubtitleAutoIpc,
  requestSubtitlePreparation,
  secondarySubtitleForItem,
} from './subtitleDiscoveryAuto';
import type { SecondarySubtitlePick } from '../shared/subtitleDiscoveryStatus';
import { estimateSubtitleOffset } from './subtitleSync';
import { pickSidecarSubtitleForLanguage, sidecarTagMatches } from './subtitleSidecar';
import type { SubtitleSyncEstimate } from '../shared/subtitleSync';
import { mt } from './i18n';
import type { PlaybackHandoff } from '../shared/externalPlayer';
import { launchExternalPlayer, registerExternalPlayerIpc } from './externalPlayer';
import { registerWatchAiring } from './watchAiring';

const ffmpegPath = ffmpegStatic as unknown as string;

// token -> absolute path, for files the player is allowed to stream. The
// renderer only ever sees opaque tokens, never real disk paths.
const mediaTokens = new Map<string, string>();

// These lists used to be declared here as well as in `shared/mediaKind.ts` and
// `main/library.ts`. One copy now, so the drop router and the player cannot
// disagree about what a media file is.
import { AUDIO_EXT, MEDIA_EXT, SUBTITLE_EXT as SUBTITLE_EXT_SET, VIDEO_EXT } from '../shared/mediaKind';
import { probeMediaProviders, searchTvAndFilm, subtitleAvailability } from './mediaProviderStatus';

/** Bare, dot-less — this is what the dialog filter wants. */
const SUBTITLE_EXT = [...SUBTITLE_EXT_SET].map((e) => e.slice(1));

const MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.ogv': 'video/ogg', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t',
  '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  // Generated poster/still art is served over the same token protocol, so the
  // renderer gets library artwork without ever learning a disk path.
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}
function tokenFor(file: string): string {
  for (const [t, f] of mediaTokens) if (f === file) return t;
  const t = crypto.randomUUID();
  mediaTokens.set(t, file);
  return t;
}
function pathForUrl(url: string): string | undefined {
  try {
    return mediaTokens.get(new URL(url).host);
  } catch {
    return undefined;
  }
}

// ----- media library (a small JSON db; files are referenced, never copied) -----

interface MediaDb {
  items: MediaItem[];
  watchFolder?: string;
  relationships?: MediaRelationship[];
}
function dbPath(): string {
  return path.join(app.getPath('userData'), MEDIA_LIBRARY_STORE_FILE);
}
function readDb(): MediaDb {
  const db = readJsonSync<MediaDb | null>(dbPath(), null, { validate: (v) => v !== null && typeof v === 'object' });
  if (!db) return { items: [], relationships: [] };
  return { items: mediaItemsFromStoredDocument(db), watchFolder: db.watchFolder, relationships: Array.isArray(db.relationships) ? db.relationships : [] };
}
function writeDb(db: MediaDb): void {
  writeJsonAtomicSync(dbPath(), db);
}

// Turn "AnimePahe_Re_Zero_kara_Hajimeru_Isekai_Seikatsu__74_1080p.mp4" into a
// readable title we can also feed to a MyAnimeList search.
function cleanTitle(file: string): string {
  let t = path.basename(file, path.extname(file));
  t = t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' '); // [group] (info)
  t = t.replace(/[._]+/g, ' ');
  t = t.replace(
    /\b(1080p|720p|480p|2160p|4k|x264|x265|hevc|h\.?264|h\.?265|aac|flac|opus|bluray|blu-ray|bd(rip)?|web[- ]?dl|webrip|hdrip|dvdrip|dual[- ]?audio|multi[- ]?subs?|eng(lish)?[- ]?subs?|uncensored|repack|remux|10bit|8bit|hi10p|yuv420p|amzn|crunchyroll)\b/gi,
    ' ',
  );
  t = t.replace(/\s+/g, ' ').trim();
  return t || path.basename(file);
}

/**
 * Read the release identity out of the file name and stamp it onto the item, so
 * the library can group a folder into one series without re-parsing every render.
 *
 * `title` deliberately keeps `cleanTitle`'s per-file result: the parsed title has
 * the season/episode markers stripped, which is exactly right for grouping and
 * exactly wrong for a card label — every episode of a run would read "The Big O".
 * The parsed title becomes `seriesTitle` instead.
 *
 * Returns true when anything changed, so callers can decide whether to persist.
 */
function applyReleaseIdentity(item: MediaItem, fileName: string): boolean {
  const parsed = parseMediaFileName(fileName);
  let changed = false;

  // Never unsets a field: a name the parser cannot read should leave whatever a
  // provider or the user already put there alone.
  const set = <K extends keyof MediaItem>(key: K, value: MediaItem[K] | undefined): void => {
    if (value === undefined || item[key] === value) return;
    item[key] = value;
    changed = true;
  };

  set('seriesKey', parsed.titleKey || undefined);
  set('seriesTitle', parsed.title || undefined);
  // The release-aware classifier, not the keyword one. `mediaCategory` alone
  // cannot see that "The Big O - 07 [BDRip].mkv" is an episode, so a whole
  // fansub folder lands in `inbox` — where nothing groups into a series and the
  // library renders 26 identical cards instead of one title. It respects an
  // explicit user/metadata category, so this never overrides a manual choice.
  set('category', inferMediaCategory(item, parsed));
  set('season', parsed.season ?? undefined);
  set('episode', parsed.episode ?? undefined);
  set('episodeKind', parsed.kind);
  set('releaseGroup', parsed.releaseGroup ?? undefined);
  set('resolution', parsed.resolution ?? undefined);
  // A year supplied by a metadata provider outranks one guessed from a file name.
  if (item.year === undefined) set('year', parsed.year ?? undefined);
  // Record which parser wrote the identity, so a later one knows whether this
  // item still needs the repass below.
  set('releaseIdentityVersion', RELEASE_IDENTITY_VERSION);

  return changed;
}

function addOrGetItem(
  absPath: string,
  touch = true,
  extra?: { sourceUrl?: string; youtubeId?: string },
): MediaItem {
  const db = readDb();
  let item = db.items.find((i) => i.path === absPath);
  if (!item && extra?.youtubeId) {
    item = db.items.find((i) => i.youtubeId === extra.youtubeId);
  }
  if (!item) {
    const fileName = path.basename(absPath);
    item = {
      id: crypto.randomUUID(),
      title: cleanTitle(absPath),
      path: absPath,
      fileName,
      addedAt: Date.now(),
      kind: classifyMediaKind(fileName),
      sourceUrl: extra?.sourceUrl,
      youtubeId: extra?.youtubeId,
    };
    applyReleaseIdentity(item, fileName);
    db.items.unshift(item);
  } else {
    if (!item.kind) item.kind = classifyMediaKind(item.fileName, item.durationSec);
    if (extra?.sourceUrl) item.sourceUrl = extra.sourceUrl;
    if (extra?.youtubeId) item.youtubeId = extra.youtubeId;
    if (item.path !== absPath && fs.existsSync(absPath)) {
      item.path = absPath;
      item.fileName = path.basename(absPath);
      item.title = cleanTitle(absPath);
    }
    if (item.seriesKey === undefined) applyReleaseIdentity(item, item.fileName);
    else refreshReleaseIdentity(item);
  }
  if (touch) item.lastPlayedAt = Date.now();
  writeDb(db);
  return item;
}

/** Extract YouTube video id from a watch / youtu.be URL when possible. */
export function extractYoutubeVideoId(url: string): string | undefined {
  const raw = (url ?? '').trim();
  try {
    const u = new URL(raw);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id || undefined;
    }
    const v = u.searchParams.get('v');
    if (v) return v;
  } catch {
    /* ignore */
  }
  const m = /(?:v=|youtu\.be\/)([\w-]{6,})/.exec(raw);
  return m?.[1];
}

export interface DownloadYoutubeResult {
  item: MediaItem;
  url: string;
  subtitle?: SubtitlePick;
  /** Present only when a specific dub was asked for. MINING gate 1's receipt. */
  audioTrack?: YouTubeAudioTrackReceipt;
  /**
   * Only with `control.detectAutoCaptions`: true when the subtitle that came
   * with the file is YouTube's auto-generated track rather than the creator's.
   */
  subtitleIsAuto?: boolean;
}

/**
 * The YouTube manager's hold on one download (audit r2 #17). All optional, so
 * every other caller's arguments stay byte-identical.
 */
export interface YoutubeDownloadControl {
  /** Stop the download: the process is killed and the call answers `cancelled`. */
  signal?: AbortSignal;
  /** Keep partial files as `.part` and resume them (`--continue`) instead of `--no-part`. */
  resumable?: boolean;
  /** Record which subtitle languages are the creator's, to tell them from auto captions. */
  detectAutoCaptions?: boolean;
}

export function removePartialDownloads(youtubeId: string): number {
  const outDir = path.join(app.getPath('userData'), MEDIA_DOWNLOAD_DIRECTORY);
  let names: string[] = [];
  try {
    names = fs.readdirSync(outDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of partialDownloadFiles(names, youtubeId)) {
    try {
      fs.rmSync(path.join(outDir, name), { force: true });
      removed += 1;
    } catch {
      /* in use or gone: nothing more to do */
    }
  }
  return removed;
}

/**
 * Ask yt-dlp what audio tracks a video ships, without downloading anything.
 *
 * `null` means the probe could not be run — which `planYoutubeAudioTrack` turns
 * into `audioProbeFailed` rather than a silent default track. The probe is
 * skipped entirely (and reported as an empty list, never null) when no specific
 * language was asked for, so an ordinary download costs no extra yt-dlp call.
 */
async function probeYoutubeAudioFormats(url: string, audioLang: unknown): Promise<YtDlpFormat[] | null> {
  if (normalizeYouTubeAudioLang(audioLang) === 'original') return [];
  const res = await ytDlpJson(youtubeAudioProbeArgs(url));
  if (!res.ok) return null;
  const formats = (res.data as { formats?: unknown } | null)?.formats;
  return Array.isArray(formats) ? (formats as YtDlpFormat[]) : null;
}

/**
 * Shared YouTube / remote media download via yt-dlp.
 * Used by MediaView and the playlist manager.
 */
export async function downloadYoutubeUrl(
  link: string,
  options: YouTubeDownloadOptions,
  onProgress?: (ev: { stage: string; percent: number }) => void,
  control: YoutubeDownloadControl = {},
): Promise<DownloadYoutubeResult | MediaDownloadError> {
  const trimmed = typeof link === 'string' ? link.trim() : '';
  if (!isRemoteMediaLink(trimmed)) return { error: 'Please paste a valid video or media link.' };
  const opts = normalizeYoutubeDownloadOptions(options.audioOnly, options);
  const bin = await findYtDlp();
  if (!bin) {
    return {
      error: 'yt-dlp was not found on your PATH. Install it (e.g. `pip install -U yt-dlp`) and reopen the app.',
    };
  }
  // MINING gate 1: the dub is resolved to a real format id BEFORE downloading,
  // from the video's own manifest, so the language reported afterwards is the
  // manifest's and not an echo of the flag. Gate 2: a language the video does
  // not have refuses here, by name, and nothing is fetched.
  const audioPlan = planYoutubeAudioTrack(opts.audioLang, await probeYoutubeAudioFormats(trimmed, opts.audioLang));
  if (audioPlan.action === 'refuse') {
    return {
      error: audioLangRefusalMessage(audioPlan),
      errorKey: audioPlan.reasonKey,
      errorParams: { lang: audioPlan.wanted, available: audioPlan.available.join(', ') },
    };
  }
  const outDir = path.join(app.getPath('userData'), MEDIA_DOWNLOAD_DIRECTORY);
  fs.mkdirSync(outDir, { recursive: true });
  const pathFile = path.join(outDir, `.out_${crypto.randomUUID()}.txt`);
  const subsInfoFile = control.detectAutoCaptions ? path.join(outDir, `.subs_${crypto.randomUUID()}.json`) : '';
  const formatIdFile = audioPlan.action === 'select' ? path.join(outDir, `.fmt_${crypto.randomUUID()}.txt`) : '';
  const format = youtubeFormatArgs(audioPlan, Boolean(opts.audioOnly));
  const subtitleLangs = opts.audioOnly ? [] : resolveYtDlpSubtitleLangs(opts);
  // allSubs wins over the per-language list: take every track, including ASR
  // captions, so a video with no creator subs still yields usable text.
  // --sub-format stays a preference list, so "all" never fails on odd formats.
  const subtitleArgs = opts.audioOnly
    ? []
    : opts.allSubs
      ? ['--write-subs', '--write-auto-subs', '--sub-langs', 'all', '--sub-format', 'vtt/srt/ass/best']
      : subtitleLangs.length > 0
        ? [
          '--write-subs',
          // Auto captions only where asked for (the playlist manager asks): a
          // video with no creator track still yields Japanese text.
          ...(opts.autoCaptions ? ['--write-auto-subs'] : []),
          '--sub-langs',
          subtitleLangs.join(','),
          '--sub-format',
          'vtt/srt/ass/best',
        ]
        : [];
  const args = await withYtDlpJsRuntime([
    trimmed,
    ...format,
    ...subtitleArgs,
    '--ffmpeg-location',
    ffmpegPath,
    '--referer',
    trimmed,
    '--no-playlist',
    '--newline',
    // Resumable downloads keep yt-dlp's `.part` file so a paused one continues.
    ...(control.resumable ? ['--continue'] : ['--no-part']),
    '-o',
    path.join(outDir, '%(title).150B [%(id)s].%(ext)s'),
    '--print-to-file',
    'after_move:filepath',
    pathFile,
    // A SECOND print file rather than widening the first: the existing reader
    // treats the whole last line of `pathFile` as a path, and a title with a
    // tab in it would have made that parse ambiguous. Only emitted on the
    // select path, so the default download's args stay byte-identical.
    ...(audioPlan.action === 'select' && formatIdFile
      ? ['--print-to-file', 'after_move:format_id', formatIdFile]
      : []),
    // The creator's own subtitle languages (not `automatic_captions`), so an
    // auto caption is not reported as "Subs".
    ...(subsInfoFile ? ['--print-to-file', 'after_move:%(subtitles)j', subsInfoFile] : []),
  ]);
  if (control.signal?.aborted) return { error: 'cancelled', errorKey: 'cancelled' };
  return new Promise((resolve) => {
    const proc = spawn(bin, args);
    let aborted = false;
    const onAbort = (): void => {
      aborted = true;
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
    };
    control.signal?.addEventListener('abort', onAbort, { once: true });
    let err = '';
    const onData = (buf: Buffer): void => {
      const s = buf.toString();
      const m = /\[download\]\s+([\d.]+)%/.exec(s);
      if (m) onProgress?.({ stage: 'downloading', percent: parseFloat(m[1]) });
      else if (/\[Merger\]|Merging formats/.test(s)) onProgress?.({ stage: 'merging', percent: 100 });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      onData(d);
    });
    proc.on('error', (e2) => resolve({ error: `Could not run yt-dlp: ${e2.message}` }));
    proc.on('close', (code) => {
      control.signal?.removeEventListener('abort', onAbort);
      let manualSubLangs: string[] | null = null;
      if (subsInfoFile) {
        try {
          const raw = fs.readFileSync(subsInfoFile, 'utf-8').trim().split(/\r?\n/).pop() ?? '';
          const parsed = JSON.parse(raw) as unknown;
          manualSubLangs = parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : [];
        } catch {
          manualSubLangs = null;
        }
        try {
          fs.rmSync(subsInfoFile, { force: true });
        } catch {
          /* ignore */
        }
      }
      if (aborted) {
        try {
          fs.rmSync(pathFile, { force: true });
          if (formatIdFile) fs.rmSync(formatIdFile, { force: true });
        } catch {
          /* ignore */
        }
        resolve({ error: 'cancelled', errorKey: 'cancelled' });
        return;
      }
      let file = '';
      try {
        file = (fs.readFileSync(pathFile, 'utf-8').trim().split(/\r?\n/).pop() ?? '').trim();
      } catch {
        /* no path file */
      }
      let usedFormatId = '';
      if (formatIdFile) {
        try {
          usedFormatId = (fs.readFileSync(formatIdFile, 'utf-8').trim().split(/\r?\n/).pop() ?? '').trim();
        } catch {
          /* no format file */
        }
      }
      try {
        fs.rmSync(pathFile, { force: true });
        if (formatIdFile) fs.rmSync(formatIdFile, { force: true });
      } catch {
        /* ignore */
      }
      if (code !== 0 || !file || !fs.existsSync(file)) {
        const lastLine = err.trim().split('\n').pop()?.trim();
        resolve({ error: `Download failed${lastLine ? `: ${lastLine}` : '.'}` });
        return;
      }
      const youtubeId = extractYoutubeVideoId(trimmed);
      const item = addOrGetItem(file, true, { sourceUrl: trimmed, youtubeId });
      broadcastMedia();
      // Announced like every other finished download (`media:ingested`).
      getMediaIngest()?.announceDownloaded([item]);
      const subtitle = findDownloadedSubtitle(file, primarySubtitleLang(opts));
      resolve({
        item,
        url: `playfile://${tokenFor(item.path)}`,
        subtitle,
        ...(subtitle && manualSubLangs !== null
          ? { subtitleIsAuto: subtitleIsAutoCaption(subtitle.name, manualSubLangs) }
          : {}),
        audioTrack:
          audioPlan.action === 'select'
            ? {
                requestedLang: audioPlan.wanted,
                // The manifest's own tag. Gate 1 reports THIS, not the flag.
                language: audioPlan.track.language,
                formatId: audioPlan.track.formatId,
                usedFormatId: usedFormatId || null,
              }
            : undefined,
      });
    });
  });
}

/** Run yt-dlp -J --flat-playlist and return parsed JSON (or error). */
export async function ytDlpJson(args: string[]): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const bin = await findYtDlp();
  if (!bin) {
    return { ok: false, error: 'yt-dlp was not found on your PATH.' };
  }
  const fullArgs = await withYtDlpJsRuntime(args);
  return new Promise((resolve) => {
    const proc = spawn(bin, fullArgs);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', (e) => resolve({ ok: false, error: e.message }));
    proc.on('close', (code) => {
      if (code !== 0) {
        const last = err.trim().split('\n').pop()?.trim();
        resolve({ ok: false, error: last || `yt-dlp exited with code ${code}` });
        return;
      }
      try {
        resolve({ ok: true, data: JSON.parse(out) });
      } catch {
        resolve({ ok: false, error: 'Could not parse yt-dlp JSON.' });
      }
    });
  });
}

export { findYtDlp, ytDlpSubtitleLangs, findDownloadedSubtitle, normalizeYoutubeDownloadOptions };

function broadcastMedia(): void {
  const items = readDb().items;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('media:changed', items);
}

function userDataSubdir(name: string): string {
  return path.join(app.getPath('userData'), name);
}

/** Drop cached cover art for the given media ids (all files when ids is empty). */
function removeCoverFiles(ids: Set<string>): void {
  const dir = userDataSubdir('covers');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const id = f.replace(/\.jpg$/i, '');
    if (ids.size === 0 || ids.has(id)) {
      try {
        fs.rmSync(path.join(dir, f), { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/** Delete converted MP4 cache entries that no longer match a library item. */
function pruneOrphanCache(): void {
  const db = readDb();
  const valid = new Set(db.items.map((i) => crypto.createHash('md5').update(i.path).digest('hex')));
  const cacheDir = userDataSubdir('media-cache');
  if (!fs.existsSync(cacheDir)) return;
  for (const f of fs.readdirSync(cacheDir)) {
    const hash = f.replace(/\.mp4$/i, '');
    if (!valid.has(hash)) {
      try {
        fs.rmSync(path.join(cacheDir, f), { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function wipeCacheDirs(): void {
  for (const sub of ['covers', 'artwork', 'subtitles', 'media-cache', 'youtube']) {
    try {
      fs.rmSync(userDataSubdir(sub), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function pruneMissingItems(): { removed: number; items: MediaItem[] } {
  const db = readDb();
  const before = db.items.length;
  const kept: MediaItem[] = [];
  const removedIds = new Set<string>();
  for (const item of db.items) {
    if (fs.existsSync(item.path)) kept.push(item);
    else removedIds.add(item.id);
  }
  db.items = kept;
  writeDb(db);
  if (removedIds.size > 0) removeCoverFiles(removedIds);
  pruneOrphanCache();
  mediaTokens.clear();
  broadcastMedia();
  return { removed: before - kept.length, items: kept };
}

function clearAllMedia(): MediaItem[] {
  getMediaIngest()?.onLibraryCleared();
  const db = readDb();
  db.items = [];
  delete db.watchFolder;
  writeDb(db);
  wipeCacheDirs();
  mediaTokens.clear();
  broadcastMedia();
  return [];
}

// ----- ffmpeg helpers -----

/** Decode a file's audio to mono 16 kHz 32-bit-float PCM (what Whisper wants). */
/** Decode any ffmpeg-readable media file to 16 kHz mono float32 PCM (Whisper input). */
export function extractAudioPcm(file: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const args = ['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le',
      '-hide_banner', '-loglevel', 'error', 'pipe:1'];
    const proc = spawn(ffmpegPath, args);
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) {
        const buf = Buffer.concat(chunks);
        resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      } else {
        reject(new Error(err.trim() || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Extract the embedded album art of an audio file as a JPEG, disk-cached per
 * media id. Returns null (and caches the miss as a 0-byte file) when the file
 * has no artwork.
 */
async function extractCoverArt(id: string, file: string): Promise<string | null> {
  const dir = path.join(app.getPath('userData'), 'covers');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.jpg`);
  if (fs.existsSync(out)) {
    const size = fs.statSync(out).size;
    if (size === 0) return null; // known artless
    return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
  }
  const ok = await new Promise<boolean>((resolve) => {
    const args = ['-i', file, '-an', '-frames:v', '1', '-f', 'image2', '-y',
      '-hide_banner', '-loglevel', 'error', out];
    const proc = spawn(ffmpegPath, args);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
  if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
    try {
      fs.writeFileSync(out, ''); // negative cache
    } catch {
      /* ignore */
    }
    return null;
  }
  return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
}

/** Remux/transcode any video into a browser-playable MP4 (cached by source path). */
async function convertToMp4(file: string): Promise<string> {
  const cacheDir = path.join(app.getPath('userData'), 'media-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = path.join(cacheDir, crypto.createHash('md5').update(file).digest('hex') + '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return Promise.resolve(out);

  // Validate the source before invoking FFmpeg so we surface a clear error for
  // empty or missing files instead of a cryptic EBML header failure.
  if (!fs.existsSync(file)) throw new Error('Media file not found.');
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('Media path is not a file.');
  if (stat.size === 0) throw new Error('Media file is empty.');

  // Resolve symlinks and use forward slashes for the FFmpeg input path; this
  // avoids backslash-quoting edge cases on Windows with spaces/brackets.
  const resolved = fs.realpathSync(file).replace(/\\/g, '/');
  const output = out.replace(/\\/g, '/');

  const recoverableCopyErrors = [
    'codec not currently supported in container',
    'could not write header',
    'could not find tag',
    'invalid argument',
    'unsupported codec',
    'unknown encoder',
    'incompatible with output codec',
  ];

  const isRecoverable = (err: string): boolean => {
    const lower = err.toLowerCase();
    return recoverableCopyErrors.some((phrase) => lower.includes(phrase));
  };

  const unreadableInputErrors = [
    'invalid data found when processing input',
    'ebml header parsing failed',
    'no such file or directory',
    'permission denied',
  ];

  const formatFfmpegError = (err: string): string => {
    const lower = err.toLowerCase();
    if (unreadableInputErrors.some((phrase) => lower.includes(phrase))) {
      return `The media file could not be read (it may be corrupted, incomplete, or inaccessible). Original error: ${err.trim()}`;
    }
    return err.trim();
  };

  const run = (videoArgs: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const args = ['-err_detect', 'ignore_err', '-fflags', '+genpts', '-i', resolved,
        ...videoArgs, '-c:a', 'aac', '-movflags', '+faststart', '-y',
        '-hide_banner', '-loglevel', 'error', output];
      const proc = spawn(ffmpegPath, args, { shell: false });
      let err = '';
      proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exited ${code}`))));
    });

  // Try a fast stream-copy of the video first; if the container/codec doesn't
  // allow copying, fall back to a slower re-encode. For non-codec failures
  // (corrupt/empty input, permission errors, etc.) preserve the original error
  // and avoid a misleading second attempt.
  let firstError: Error | undefined;
  try {
    await run(['-c:v', 'copy']);
  } catch (e) {
    firstError = e instanceof Error ? e : new Error(String(e));
    if (!isRecoverable(firstError.message)) {
      cleanupPartialOutput(out);
      throw new Error(formatFfmpegError(firstError.message));
    }
    try {
      await run(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']);
    } catch (e) {
      cleanupPartialOutput(out);
      throw new Error(formatFfmpegError(firstError.message));
    }
  }

  return out;
}

function cleanupPartialOutput(out: string): void {
  try {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  } catch {
    /* ignore cleanup failures */
  }
}

// ----- Remote media download (yt-dlp — YouTube, Vimeo, and 1000+ sites) -----

function isRemoteMediaLink(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Locate an executable on PATH (first hit). */
function findOnPath(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const w = spawn(finder, [name]);
    let out = '';
    w.stdout.on('data', (d: Buffer) => (out += d.toString()));
    w.on('error', () => resolve(null));
    w.on('close', (code) => {
      const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      resolve(code === 0 && first ? first : null);
    });
  });
}

/** Locate the user's yt-dlp on PATH (they install it themselves). */
function findYtDlp(): Promise<string | null> {
  return findOnPath('yt-dlp');
}

/**
 * YouTube extraction needs a JS runtime + EJS challenge solver. Prefer Deno
 * (yt-dlp's recommended runtime), fall back to Node. Cached after first resolve.
 * See https://github.com/yt-dlp/yt-dlp/wiki/EJS
 */
let ytDlpJsRuntimeArgsPromise: Promise<string[]> | null = null;

function resolveYtDlpJsRuntimeArgs(): Promise<string[]> {
  if (!ytDlpJsRuntimeArgsPromise) {
    ytDlpJsRuntimeArgsPromise = (async () => {
      // Prefer Deno (yt-dlp's recommended runtime). Do not use process.execPath —
      // in Electron that is the app binary, not a usable Node runtime for EJS.
      const deno = await findOnPath('deno');
      const node = deno ? null : await findOnPath('node');
      const runtime = deno ? `deno:${deno}` : node ? `node:${node}` : null;
      if (!runtime) return [];
      return ['--js-runtimes', runtime, '--remote-components', 'ejs:github'];
    })();
  }
  return ytDlpJsRuntimeArgsPromise;
}

/** Prepend JS-runtime flags so every yt-dlp spawn can solve YouTube challenges. */
export async function withYtDlpJsRuntime(args: string[]): Promise<string[]> {
  const runtimeArgs = await resolveYtDlpJsRuntimeArgs();
  return runtimeArgs.length ? [...runtimeArgs, ...args] : args;
}

const OFFICIAL_SUB_LANGS = new Set(['ja', 'zh', 'en', 'ru']);

function normalizeYoutubeDownloadOptions(audioOnly?: boolean, raw?: YouTubeDownloadOptions): YouTubeDownloadOptions {
  const subtitleLang =
    raw?.subtitleLang === 'ja' ||
    raw?.subtitleLang === 'zh' ||
    raw?.subtitleLang === 'en' ||
    raw?.subtitleLang === 'ru'
      ? raw.subtitleLang
      : 'none';
  const subtitleLangs = Array.isArray(raw?.subtitleLangs)
    ? raw!.subtitleLangs!.filter((l): l is Exclude<YouTubeSubtitleLang, 'none'> => OFFICIAL_SUB_LANGS.has(l))
    : undefined;
  return {
    audioOnly: Boolean(raw?.audioOnly ?? audioOnly),
    subtitleLang,
    subtitleLangs: subtitleLangs?.length ? subtitleLangs : undefined,
    allSubs: raw?.allSubs === true,
    audioLang: normalizeYouTubeAudioLang(raw?.audioLang),
  };
}

function primarySubtitleLang(opts: YouTubeDownloadOptions): YouTubeSubtitleLang | undefined {
  if (opts.subtitleLangs?.length) return opts.subtitleLangs[0];
  return opts.subtitleLang;
}

function ytDlpSubtitleLangs(lang: YouTubeSubtitleLang | undefined): string[] {
  switch (lang) {
    case 'ja':
      return ['ja', 'ja.*'];
    case 'zh':
      return ['zh', 'zh.*', 'zh-Hans', 'zh-Hant', 'zh-CN', 'zh-TW', 'zh-HK', 'zh-SG'];
    case 'en':
      return ['en', 'en.*'];
    case 'ru':
      return ['ru', 'ru.*'];
    default:
      return [];
  }
}

function resolveYtDlpSubtitleLangs(opts: YouTubeDownloadOptions): string[] {
  if (opts.subtitleLangs?.length) {
    const out: string[] = [];
    for (const lang of opts.subtitleLangs) out.push(...ytDlpSubtitleLangs(lang));
    return [...new Set(out)];
  }
  return ytDlpSubtitleLangs(opts.subtitleLang);
}

/**
 * Rank subtitle filenames for a wanted language tag. Lower sorts first.
 * Exact match beats a regional variant (ja-JP), which beats Japanese, then
 * English, then anything. Auto-generated tracks lose to creator tracks.
 */
function subtitleRank(name: string, wanted: string): number {
  const lower = name.toLowerCase();
  const tag = lower.slice(0, lower.lastIndexOf('.'));
  const auto = /(^|[.-])a\.[a-z-]+$|orig|auto/.test(tag) ? 100 : 0;
  const has = (prefix: string): boolean =>
    new RegExp(`(^|\\.)${prefix}(\\.|-|$)`).test(tag);
  if (has(wanted)) return auto + 0;
  if (wanted !== 'ja' && has('ja')) return auto + 2;
  if (has('en')) return auto + 3;
  return auto + 9;
}

function readSubtitleFile(dir: string, name: string): SubtitlePick | undefined {
  try {
    return { name, text: fs.readFileSync(path.join(dir, name), 'utf8') };
  } catch {
    return undefined;
  }
}

/** Best subtitle sitting in a directory (yt-dlp's `<id>.<lang>.vtt` output). */
function pickSubtitleFromDir(dir: string, wanted: string): SubtitlePick | undefined {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const subs = entries
    .filter((name) => SUBTITLE_EXT.includes(path.extname(name).slice(1).toLowerCase()))
    .sort((a, b) => subtitleRank(a, wanted) - subtitleRank(b, wanted) || a.localeCompare(b));
  return subs[0] ? readSubtitleFile(dir, subs[0]) : undefined;
}

/** Best subtitle written next to a downloaded media file (same stem). */
function pickSubtitleBeside(mediaFile: string, wanted: string): SubtitlePick | undefined {
  const dir = path.dirname(mediaFile);
  const stem = path.basename(mediaFile, path.extname(mediaFile));
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const subs = entries
    .filter((name) => {
      if (!SUBTITLE_EXT.includes(path.extname(name).slice(1).toLowerCase())) return false;
      return name.startsWith(`${stem}.`);
    })
    .sort((a, b) => subtitleRank(a, wanted) - subtitleRank(b, wanted) || a.localeCompare(b));
  return subs[0] ? readSubtitleFile(dir, subs[0]) : undefined;
}

function findDownloadedSubtitle(mediaFile: string, lang: YouTubeSubtitleLang | undefined): SubtitlePick | undefined {
  const langs = ytDlpSubtitleLangs(lang).map((s) => s.replace(/\.\*$/, '').toLowerCase());
  if (langs.length === 0) return undefined;
  const dir = path.dirname(mediaFile);
  const stem = path.basename(mediaFile, path.extname(mediaFile));
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((name) => {
      const ext = path.extname(name).slice(1).toLowerCase();
      if (!SUBTITLE_EXT.includes(ext)) return false;
      if (!name.startsWith(`${stem}.`)) return false;
      const tag = name.slice(stem.length + 1, -(ext.length + 1)).toLowerCase();
      return langs.some((prefix) => tag === prefix || tag.startsWith(`${prefix}-`));
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const picked = candidates[0];
  if (!picked) return undefined;
  try {
    return { name: picked, text: fs.readFileSync(path.join(dir, picked), 'utf-8') };
  } catch {
    return undefined;
  }
}

// ----- folder import -----
// Watch folders moved to `mediaIngest.ts`: a list rather than one folder,
// started in main at launch, with settle detection, and importing through
// `addOrGetItem` so a watched file is sorted like any other import.

function collectMediaFilesInDir(root: string, maxDepth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth) walk(full, depth + 1);
      } else if (MEDIA_EXT.has(path.extname(e.name).toLowerCase())) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return found;
}

// ----- IPC -----

/**
 * Applies one patch to many items in a single read/write, then broadcasts once.
 *
 * The metadata sweep stamps a whole series at a time, and `media.json` is
 * rewritten in full on every save — patching 26 files individually would be 26
 * full-file writes and 26 renderer re-renders for one logical change.
 */
/** Debounce so importing a 26-file folder schedules one sweep, not twenty-six. */
let metadataSweepTimer: NodeJS.Timeout | null = null;

/**
 * Look up metadata for anything newly imported, in the background.
 *
 * Deliberately fire-and-forget: the sweep is rate-limited by the providers and can
 * take a while over a large folder, and the import call must not block on it. The
 * job's own `sweeping` guard collapses overlapping triggers, and it broadcasts
 * progress, so the library fills in while the user carries on.
 */
function scheduleMetadataSweep(): void {
  if (metadataSweepTimer) clearTimeout(metadataSweepTimer);
  metadataSweepTimer = setTimeout(() => {
    metadataSweepTimer = null;
    void runMediaMetadata({})
      // Subtitles run *after* metadata, not in parallel: Jimaku matches on the
      // AniList id the metadata pass stores, so searching first would throw away
      // the one signal that makes its hits exact.
      .catch(() => undefined)
      .then(() => {
        if (loadDiscoverySettings().autoDiscover) return runSubtitleDiscovery({});
        return undefined;
      })
      .catch(() => {
        // Reported through the progress channels; a failed sweep must never take
        // the import down with it.
      });
  }, 1_200);
}

function patchEachItem(entries: ReadonlyArray<readonly [string, Partial<MediaItem>]>): void {
  if (entries.length === 0) return;
  const byId = new Map(entries);
  const db = readDb();
  let touched = false;
  for (const item of db.items) {
    const patch = byId.get(item.id);
    if (!patch) continue;
    Object.assign(item, patch);
    touched = true;
  }
  if (!touched) return;
  writeDb(db);
  broadcastMedia();
}

function patchItems(ids: readonly string[], patch: Partial<MediaItem>): void {
  if (ids.length === 0) return;
  const wanted = new Set(ids);
  const db = readDb();
  let touched = false;
  for (const item of db.items) {
    if (!wanted.has(item.id)) continue;
    Object.assign(item, patch);
    touched = true;
  }
  if (!touched) return;
  writeDb(db);
  broadcastMedia();
}

/**
 * What an external player should get beyond the file: the library's study
 * subtitle (a file the player can load) and the saved resume point, when the
 * caller did not supply them. A file the library does not know passes through.
 */
function enrichHandoffFromLibrary(handoff: PlaybackHandoff): PlaybackHandoff {
  const key = (value: string): string => value.trim().replace(/\\/g, '/').toLowerCase();
  const wanted = key(handoff.mediaPath);
  const item = readDb().items.find((entry) => key(entry.path ?? '') === wanted);
  if (!item) return handoff;
  let subtitlePath = handoff.subtitlePath;
  if (!subtitlePath) {
    const record = pickPlaybackSubtitle(
      item.subtitles,
      getMainStudyLangTag(),
      item.preferredSubtitleId,
    );
    if (record?.path) subtitlePath = record.external ? record.path : path.join(app.getPath('userData'), record.path);
  }
  const resume = handoff.resumePositionSec
    ?? (typeof item.positionSec === 'number' && item.positionSec > 0 ? item.positionSec : null);
  return { ...handoff, subtitlePath, resumePositionSec: resume };
}

export function registerMediaIpc(): void {
  // The metadata job needs to read and stamp library items but must not own the
  // JSON store, so it is handed exactly those two operations.
  registerMediaMetadataIpc({
    listItems: () => readDb().items,
    patchItems,
    patchEachItem,
  });
  registerSubtitleDiscoveryIpc({
    listItems: () => readDb().items,
    patchItems,
  });
  // Per-episode automation on play / Watching: helper line, translation, status.
  registerSubtitleAutoIpc({
    listItems: () => readDb().items,
    patchItems,
  });
  // Harvest is the sibling of discovery: same provider clients and credential
  // store, but keyed on an AniList id rather than on local media, so it takes
  // no host. Registered here rather than in main.ts to keep both subtitle
  // surfaces registered from one place.
  registerSubtitleHarvestIpc();
  registerTranscriptionIpc({
    listItems: () => readDb().items,
    patchItems,
  });
  // Discovery reads the same two provider APIs but touches nothing in the
  // library, so it gets no host at all — it can only search and browse.
  registerMediaDiscoveryIpc();
  // Automatic ingest: watch folders and finished downloads. Like the metadata
  // job it gets the store's operations, not the store.
  registerMediaIngest({
    addOrGetItem: (absPath) => addOrGetItem(absPath, false),
    listItems: () => readDb().items,
    patchEachItem,
    broadcast: broadcastMedia,
    // The import trigger for every automatic route and for `media:addAcquired`.
    scheduleMetadataSweep: () => {
      scheduleMetadataSweep();
    },
    legacyWatchFolder: () => readDb().watchFolder,
  });

  /**
   * D265 — re-check the library once at launch.
   *
   * Every other trigger for this sweep is an import (`:1252` pick files, `:1274`
   * add folder, `:1345` drag-drop, `:1391` addAcquired). There was no fifth
   * caller, so a title imported before its subtitles were filed stayed
   * subtitle-less permanently: `retryAfterDays` expires the back-off after a
   * week, but nothing ever asked again. Measured on the real library — 24 of the
   * 26 `The Big O` episodes sat at zero records carrying `jimaku | no-match`
   * rows from August, and 11 of them attached a correct `ja` file within a
   * second each the moment the same call was made again.
   *
   * Cheap when there is nothing to do: `recentlyFailed` still suppresses every
   * provider whose evidential failure is inside `retryAfterDays`, so a
   * freshly-swept library makes zero provider requests and only walks its own
   * items. Deliberately once at launch rather than on a timer — a periodic sweep
   * needs its own cancellation, progress and settings surface, and launch is
   * when the user is about to watch something anyway.
   */
  scheduleMetadataSweep();

  // Open in an external player. Only a profile saved in `external-players.json`
  // can be started, looked up by `profile.id` — the path and arguments that
  // arrive with the request are ignored (see `main/externalPlayer.ts`). A spawn
  // failure is reported, never thrown: an `error` event with no listener used to
  // take the whole app down when the player's path no longer existed.
  registerExternalPlayerIpc();
  // Next-episode times for the watch library, from AniList (see watchAiring.ts).
  registerWatchAiring();
  ipcMain.handle('media:handoff', (_e, handoff: unknown, profile: unknown): Promise<string | null> =>
    launchExternalPlayer(handoff, profile, enrichHandoffFromLibrary));
  // Stream a token's file, honouring HTTP Range so the <video> can seek.
  protocol.handle('playfile', (request) => {
    try {
      const file = mediaTokens.get(new URL(request.url).host);
      if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      const total = fs.statSync(file).size;
      const type = MEDIA_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('Range') ?? '');
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : total - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= total) end = total - 1;
        if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            // CORS: without this, audio routed through the Web Audio analyser
            // (Music app visualizer) is silenced as cross-origin.
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });

  // Whether each metadata source answers right now (Settings › Media providers).
  ipcMain.handle('media:providerStatus', () => probeMediaProviders());
  // Unified search backends: dramas/films (TVmaze, TMDB) and subtitle availability.
  ipcMain.handle('search:tvFilm', (_e, query: unknown) => searchTvAndFilm(typeof query === 'string' ? query : ''));
  ipcMain.handle('search:subtitleAvailability', (_e, query: unknown, languages: unknown) =>
    subtitleAvailability(
      typeof query === 'string' ? query : '',
      Array.isArray(languages) ? languages.filter((l): l is string => typeof l === 'string') : [],
    ).catch(() => null));
  ipcMain.handle('media:list', () => {
    const db = readDb();
    let dirty = false;
    for (const item of db.items) {
      if (!item.kind) {
        item.kind = classifyMediaKind(item.fileName, item.durationSec);
        dirty = true;
      }
      // Backfill release identity for libraries imported before it existed, so
      // series grouping works without asking the user to re-import anything.
      if (item.seriesKey === undefined) {
        if (applyReleaseIdentity(item, item.fileName)) dirty = true;
      // And repair the ones an OLDER parser read wrong, which the line above
      // cannot see: a wrong `seriesKey` is not an absent one, so every later
      // parser rule stayed invisible to files the user already had.
      } else if (refreshReleaseIdentity(item)) {
        dirty = true;
      }
    }
    if (dirty) writeDb(db);
    return db.items;
  });
  ipcMain.handle('media:pathExists', (_e, filePath: string) =>
    typeof filePath === 'string' && fs.existsSync(filePath),
  );
  ipcMain.handle('media:scanStorage', (_e, paths: string[]) => {
    const files: Array<{ path: string; size: number; modifiedAt: number }> = [];
    for (const value of Array.isArray(paths) ? paths : []) {
      if (typeof value !== 'string') continue;
      try { const s = fs.statSync(value); if (s.isFile()) files.push({ path: value, size: s.size, modifiedAt: s.mtimeMs }); } catch { /* inaccessible */ }
    }
    return { totalBytes: files.reduce((n, f) => n + f.size, 0), files };
  });
  ipcMain.handle('media:updateMetadata', (_e, id: string, metadata: Partial<Pick<MediaItem, 'title' | 'artist' | 'genres' | 'actors' | 'year' | 'lang' | 'category' | 'jlptLevel' | 'vocabularyCount' | 'kanjiCount' | 'metadataSource'>>) => {
    const db = readDb(); const item = db.items.find((entry) => entry.id === id);
    if (!item || !metadata || typeof metadata !== 'object') return null;
    Object.assign(item, metadata); item.metadataUpdatedAt = Date.now(); writeDb(db); broadcastMedia(); return item;
  });
  ipcMain.handle('media:organizationPreview', (_e, id: string, root: string): MediaOrganizationPreview | null => {
    const db = readDb(); const item = db.items.find((entry) => entry.id === id);
    return item && typeof root === 'string' && path.isAbsolute(root) ? previewMediaOrganization(item, root, db.items) : null;
  });
  ipcMain.handle('media:organize', (_e, preview: MediaOrganizationPreview, choice: MediaDuplicateChoice = 'keep-existing') => {
    if (!preview || !path.isAbsolute(preview.sourcePath) || !path.isAbsolute(preview.targetPath) || !fs.existsSync(preview.sourcePath)) return { ok: false, error: 'Invalid media organization preview.' };
    if (preview.action === 'noop') return { ok: true };
    if (preview.action === 'conflict' && choice !== 'keep-incoming' && choice !== 'keep-both') return { ok: false, error: 'A duplicate resolution choice is required.' };
    let target = preview.targetPath;
    if (choice === 'keep-both' && fs.existsSync(target)) { const ext = path.extname(target); target = `${target.slice(0, -ext.length)} (${Date.now()})${ext}`; }
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(preview.sourcePath, target); const db = readDb(); const item = db.items.find((entry) => entry.id === preview.itemId); if (item) { item.path = target; item.fileName = path.basename(target); item.title = path.basename(target, path.extname(target)); writeDb(db); broadcastMedia(); } return { ok: true, path: target }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not organize file.' }; }
  });
  ipcMain.handle('media:backup', (): MediaBackupContract => { const db = readDb(); return { schema: 1, createdAt: Date.now(), items: db.items, relationships: db.relationships ?? [] }; });
  ipcMain.handle('media:relationships', (_e, fromId?: string) => readDb().relationships?.filter((r) => !fromId || r.fromId === fromId || r.toId === fromId) ?? []);
  ipcMain.handle('media:addRelationship', (_e, relationship: Omit<MediaRelationship, 'id' | 'createdAt'>) => { const db = readDb(); const next: MediaRelationship = { ...relationship, id: crypto.randomUUID(), createdAt: Date.now() }; db.relationships = [...(db.relationships ?? []), next]; writeDb(db); return next; });

  /**
   * Library artwork as a `playfile://` URL — a poster for audio, a still for
   * video. Returns null when the file has no usable image; that answer is cached
   * on disk, so a null here is cheap to ask for again.
   *
   * A URL rather than a data URL on purpose: a few hundred base64 JPEGs crossing
   * the bridge is both slow and permanently resident, while the token protocol
   * streams them and lets Chromium cache them like any other image.
   */
  /*
   * Art for a TRACKED title (the watch library) — one imported from MAL or Letterboxd that
   * may have no file on this PC. The metadata pass stores it userData-relative, like a media
   * item's; served through the same playfile tokens so the page's CSP never meets a remote
   * image host.
   */
  ipcMain.handle('watch:artwork', (_e, id: unknown, variant: unknown): string | null => {
    if (typeof id !== 'string') return null;
    const title = readWatchLibrary().titles.find((entry) => entry.id === id);
    if (!title) return null;
    const stored = variant === 'banner' ? title.bannerPath ?? title.backdropPath
      : variant === 'backdrop' ? title.backdropPath ?? title.bannerPath
        : title.posterPath;
    if (!stored) return null;
    const file = path.join(app.getPath('userData'), stored);
    return fs.existsSync(file) ? `playfile://${tokenFor(file)}` : null;
  });

  ipcMain.handle('media:artwork', async (_e, id: string, variant: 'poster' | 'banner' | 'backdrop' | 'still' = 'poster'): Promise<string | null> => {
    const item = readDb().items.find((i) => i.id === id);
    if (!item) return null;

    // Provider art, when a metadata pass has fetched some. Stored as a
    // userData-relative path, so the token is minted here rather than persisted.
    // `still` is the file's own episode still (TVmaze); `backdrop` the 16:9
    // image, falling back to the hero banner (mediaMetadata.ts writes both).
    const provided = variant === 'banner' ? item.bannerPath
      : variant === 'backdrop' ? item.backdropPath ?? item.bannerPath
        : variant === 'poster' ? item.posterPath
          : item.stillPath;
    if (provided) {
      const file = path.join(app.getPath('userData'), provided);
      if (fs.existsSync(file)) return `playfile://${tokenFor(file)}`;
    }
    // A banner has no local substitute — the caller falls back to the poster.
    if (variant === 'banner' || variant === 'backdrop') return null;

    try {
      const file = await ensureMediaArtwork({
        id: item.id,
        file: item.path,
        kind: item.kind,
        durationSec: item.durationSec,
      });
      return file ? `playfile://${tokenFor(file)}` : null;
    } catch {
      return null;
    }
  });

  /**
   * Per-item user state (favorite, study queue, note, collections). This lived in
   * the renderer's `localStorage` and so was invisible to everything outside the
   * one component that wrote it — the library rail counts, the Hub shelves and
   * any other window all disagreed. Persisting it beside the item and
   * broadcasting makes one source of truth out of it.
   */
  ipcMain.handle(
    'media:setItemState',
    (
      _e,
      id: string,
      patch: Partial<Pick<
        MediaItem,
        'favorite' | 'studyQueue' | 'note' | 'collections' | 'preferredSubtitleId'
      >>,
    ) => {
      const db = readDb();
      const item = db.items.find((entry) => entry.id === id);
      if (!item || !patch || typeof patch !== 'object') return null;

      if (typeof patch.preferredSubtitleId === 'string') {
        // Only an id this item actually holds is stored. A caller naming a track
        // from another item — or one that has just been removed — would otherwise
        // leave a pointer that `pickPlaybackSubtitle` silently ignores forever,
        // with the library still drawing it as the active choice.
        const chosen = patch.preferredSubtitleId.trim();
        if (chosen && item.subtitles?.some((record) => record.id === chosen)) {
          item.preferredSubtitleId = chosen;
        } else {
          delete item.preferredSubtitleId;
        }
      }
      if (typeof patch.favorite === 'boolean') item.favorite = patch.favorite;
      if (typeof patch.studyQueue === 'boolean') item.studyQueue = patch.studyQueue;
      if (typeof patch.note === 'string') {
        const note = patch.note.slice(0, 4000);
        if (note.trim()) item.note = note;
        else delete item.note;
      }
      if (Array.isArray(patch.collections)) {
        const names = [...new Set(
          patch.collections
            .filter((name): name is string => typeof name === 'string')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => name.slice(0, 120)),
        )].sort();
        if (names.length) item.collections = names;
        else delete item.collections;
      }

      writeDb(db);
      broadcastMedia();
      return item;
    },
  );

  ipcMain.handle('media:coverArt', async (_e, id: string): Promise<string | null> => {
    const item = readDb().items.find((i) => i.id === id);
    if (!item || !fs.existsSync(item.path)) return null;
    try {
      return await extractCoverArt(id, item.path);
    } catch {
      return null;
    }
  });

  ipcMain.handle('media:pick', async (): Promise<MediaOpen | null> => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.openVideoAudio.title'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: mt('dialog.filter.videoAudio'), extensions: [...MEDIA_EXT].map((e) => e.slice(1)) },
        { name: mt('dialog.filter.allFiles'), extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    let first: MediaOpen | null = null;
    for (const filePath of res.filePaths) {
      if (!MEDIA_EXT.has(path.extname(filePath).toLowerCase())) continue;
      const item = addOrGetItem(filePath, !first);
      if (!first) first = { item, url: `playfile://${tokenFor(item.path)}` };
    }
    broadcastMedia();
    scheduleMetadataSweep();
    return first;
  });

  ipcMain.handle(
    'media:addFolder',
    async (e): Promise<{ items: MediaItem[]; added: number }> => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? focusedWindow();
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: mt('dialog.addMediaFolder.title'),
        properties: ['openDirectory'],
      });
      if (res.canceled || !res.filePaths[0]) return { items: readDb().items, added: 0 };
      const root = res.filePaths[0];
      const before = new Set(readDb().items.map((i) => i.path));
      let added = 0;
      for (const filePath of collectMediaFilesInDir(root)) {
        addOrGetItem(filePath, false);
        if (!before.has(filePath)) added += 1;
      }
      if (added > 0) {
        broadcastMedia();
        scheduleMetadataSweep();
      }
      return { items: readDb().items, added };
    },
  );

  // Resolve a saved absolute media path back to a playable URL (used by the
  // desktop's video wallpaper on startup).
  ipcMain.handle('media:fileUrl', (_e, p: string) => {
    if (typeof p !== 'string' || !fs.existsSync(p)) return null;
    if (!MEDIA_EXT.has(path.extname(p).toLowerCase())) return null;
    return `playfile://${tokenFor(p)}`;
  });

  // Pick a looping video to use as the desktop wallpaper.
  ipcMain.handle(
    'desktop:pickWallpaperVideo',
    async (): Promise<{
      id: string;
      path: string;
      url: string;
      kind: 'video';
      label: string;
    } | null> => {
      const res = await dialog.showOpenDialog(focusedWindow()!, {
        title: mt('dialog.chooseWallpaperVideo.title'),
        properties: ['openFile'],
        filters: [{ name: mt('dialog.filter.video'), extensions: [...VIDEO_EXT].map((e) => e.slice(1)) }],
      });
      const p = res.filePaths[0];
      if (res.canceled || !p) return null;
      const id = `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const label = path.basename(p, path.extname(p)) || 'Video';
      // Prefer a durable copy under userData so library entries survive path moves.
      let stored = p;
      try {
        const dir = path.join(app.getPath('userData'), 'wallpapers');
        fs.mkdirSync(dir, { recursive: true });
        const ext = path.extname(p).toLowerCase() || '.mp4';
        const dest = path.join(dir, `${id}${ext}`);
        fs.copyFileSync(p, dest);
        stored = dest;
      } catch {
        stored = p;
      }
      return {
        id,
        path: stored,
        url: `playfile://${tokenFor(stored)}`,
        kind: 'video',
        label,
      };
    },
  );

  // Add media files dropped onto the app window (no dialog).
  ipcMain.handle('media:addPaths', (_e, paths: string[]) => {
    let added = false;
    for (const fp of Array.isArray(paths) ? paths : []) {
      if (typeof fp !== 'string') continue;
      try {
        if (fs.existsSync(fp) && MEDIA_EXT.has(path.extname(fp).toLowerCase())) {
          addOrGetItem(fp, false);
          added = true;
        }
      } catch {
        /* unreadable file — skip it */
      }
    }
    if (added) {
      broadcastMedia();
      scheduleMetadataSweep();
    }
    return readDb().items;
  });

  /**
   * Brings a finished acquisition into the library from the path it landed on.
   *
   * `media:addPaths` above is the drag-and-drop entry point and ignores anything
   * that is not itself a media file — which is every multi-file torrent, whose
   * payload is a directory. That was the end of the acquisition pipeline: the
   * app could send a release to qBittorrent and watch it complete, and the file
   * then sat on disk with no route into the library, so no subtitle could be
   * attached to it and nothing ever reached the player. This is that route.
   *
   * It reads the path and nothing else — it cannot start, resume or query a
   * transfer, so a caller cannot use it to reach the torrent client.
   *
   * Runs through the ingest (`mediaIngest.ts`), so an info hash the Scraper
   * handed off brings its catalogue identity with it, samples are skipped, and
   * the arrival is announced like any automatic one.
   */
  ipcMain.handle('media:addAcquired', async (_e, target: unknown, options?: unknown): Promise<MediaAcquiredImport> => {
    const ingest = getMediaIngest();
    if (ingest) return ingest.ingestAcquired(target, options);
    return { items: readDb().items, found: 0, added: 0, outcome: 'invalid-path' };
  });

  ipcMain.handle('media:open', (_e, id: string): MediaOpen | null => {
    const db = readDb();
    const item = db.items.find((i) => i.id === id);
    if (!item || !fs.existsSync(item.path)) return null;
    item.lastPlayedAt = Date.now();
    // Counted here because this handler is what actually opens a file for
    // playback. Without it "sort by play count" was a menu entry over a number
    // nothing ever incremented.
    item.listenCount = (item.listenCount ?? 0) + 1;
    writeDb(db);

    // Hand the player whatever subtitle discovery already found. Without this the
    // whole discovery pipeline is write-only: tracks are downloaded, listed in the
    // drawer, and never actually shown while watching.
    let subtitle: SubtitlePick | undefined;
    const record = pickPlaybackSubtitle(
      item.subtitles,
      getMainStudyLangTag(),
      item.preferredSubtitleId,
    );
    if (record) {
      const text = readSubtitleRecord(record);
      if (text) subtitle = { name: record.label ?? `${record.lang} (${record.source})`, text };
    }
    // Fall back to a file sitting beside the video, which is what this handler
    // effectively did before discovery existed.
    if (!subtitle) subtitle = pickSubtitleBeside(item.path, item.lang ?? 'ja');

    return { item, url: `playfile://${tokenFor(item.path)}`, subtitle };
  });

  /**
   * The same discovered track `media:open` hands the player, addressed by PATH and with
   * none of that handler's side effects.
   *
   * ## Why this exists
   *
   * `media:open` is the retired player's entry point: it stamps `lastPlayedAt`, increments
   * `listenCount` and writes the database. The adopted Seanime workspace never calls it —
   * it opens a file through the sidecar's directstream, which knows only what it can parse
   * out of the container. So for a file whose subtitles were *downloaded* rather than
   * embedded, the workspace had no track at all, and old-player retirement quietly took the
   * discovered-subtitle hand-off with it.
   *
   * Measured 2026-08-06 against `The Big O - 13`: `ffprobe` reports exactly two streams,
   * `hevc` and `flac` — **no subtitle stream in the file** — while a 261-cue Jimaku track
   * for it sits in `subtitles/<mediaId>/`. The player's subtitle manager logged
   * `Selecting default track` with an empty list and called `setNoTrack()`, which is why no
   * cue ever rendered and the transcript stayed empty.
   *
   * Routing is deliberately NOT restated here: `pickPlaybackSubtitle` decides, exactly as
   * it does above, so the workspace and the retired player can never disagree about which
   * of several downloaded tracks is the study one.
   *
   * Path-addressed because that is the only identifier the workspace has — it opens a file,
   * not a library row. Comparison is case-insensitive and separator-normalized because a
   * path that has been through the sidecar is not byte-identical to the stored one.
   */
  const itemForPath = (filePath: string): MediaItem | undefined => {
    const key = (value: string): string =>
      value.trim().replace(/\\/g, '/').toLowerCase();
    const wanted = key(filePath);
    return readDb().items.find((i) => key(i.path ?? '') === wanted);
  };
  ipcMain.handle(
    'media:subtitleForPath',
    (_e, filePath: string, options?: { intent?: 'play'; lang?: string }): SubtitlePick | null => {
      if (typeof filePath !== 'string' || !filePath.trim()) return null;
      const item = itemForPath(filePath);

      // `lang` asks for one language's track rather than the study pick — the
      // player's second line (English under a Japanese video). A file the
      // library has never seen can only answer from a sidecar beside it
      // (`.en.srt`, `.eng.srt`, `.en.ass`), which the renderer cannot read.
      const lang = options && typeof options === 'object' && typeof options.lang === 'string' ? options.lang.trim() : '';
      if (lang) {
        if (item) {
          const record = pickPlaybackSubtitle(
            (item.subtitles ?? []).filter((entry) => sidecarTagMatches(entry.lang ?? '', lang)),
            lang,
          );
          const text = record ? readSubtitleRecord(record) : null;
          if (record && text) return { name: record.label ?? `${record.lang} (${record.source})`, text };
        }
        return pickSidecarSubtitleForLanguage(filePath, lang);
      }

      // The player says `intent: 'play'` when it mounts; nothing else does (the
      // lexicon search walks the whole library through this same handler, and a
      // search must not queue a translation per file). That is the lazy trigger:
      // an episode's helper line and any missing study line are prepared in the
      // background the first time it is watched. See `subtitleDiscoveryAuto.ts`.
      if (item && options && typeof options === 'object' && options.intent === 'play') {
        requestSubtitlePreparation([item.id], 'play');
      }

      if (item) {
        const record = pickPlaybackSubtitle(
          item.subtitles,
          getMainStudyLangTag(),
          item.preferredSubtitleId,
        );
        if (record) {
          const text = readSubtitleRecord(record);
          if (text) {
            return { name: record.label ?? `${record.lang} (${record.source})`, text };
          }
        }
      }
      // A file the library has never seen still deserves the sidecar-file fallback: the
      // workspace can open a path the media database knows nothing about.
      return pickSubtitleBeside(filePath, item?.lang ?? 'ja') ?? null;
    },
  );

  /**
   * The helper line (English unless the user chose another language) for a local
   * video, by path, side-effect free. Picked together with the study track, so it
   * is never the same track; `machineTranslated` says when it is the automation's
   * translation rather than a human subtitle. Null when there is none yet — the
   * `subtitleAuto:status` event says when one arrives.
   */
  ipcMain.handle(
    'media:secondarySubtitleForPath',
    (_e, filePath: string): SecondarySubtitlePick | null => {
      if (typeof filePath !== 'string' || !filePath.trim()) return null;
      const item = itemForPath(filePath);
      return item ? secondarySubtitleForItem(item) : null;
    },
  );

  /**
   * How far a subtitle track has to move to line up with a file's audio.
   *
   * Split from `media:subtitleForPath` rather than folded into it because the two have
   * completely different costs and failure modes: resolving the track is a database lookup
   * and a file read, while this spawns four ffmpeg processes and takes a couple of seconds.
   * A caller that only wants the text must not pay for the analysis.
   *
   * Cue intervals arrive already parsed. The renderer has `parseSubtitles` — the parser
   * that decided these cues' timings in the first place — and a second parser here could
   * disagree with it about the very numbers being corrected.
   *
   * See `shared/subtitleSync.ts` for the method and the measured confidence gates.
   */
  ipcMain.handle(
    'media:subtitleSyncOffset',
    async (
      _e,
      videoPath: string,
      cues: { start: number; end: number }[],
      durationSec?: number,
    ): Promise<SubtitleSyncEstimate> => {
      const nothing: SubtitleSyncEstimate = {
        offsetSec: 0, score: 0, rivalScore: 0, confident: false,
      };
      if (typeof videoPath !== 'string' || !videoPath.trim()) return nothing;
      if (!Array.isArray(cues) || !cues.length) return nothing;
      const clean = cues.filter(
        (c): c is { start: number; end: number } =>
          !!c && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start,
      );
      if (!clean.length) return nothing;
      return estimateSubtitleOffset(
        videoPath,
        clean,
        typeof durationSec === 'number' ? durationSec : 0,
      );
    },
  );

  /**
   * "Load subtitles" for YouTube-sourced media: prefer a sidecar file already
   * written next to the video (downloads now fetch every track), otherwise pull
   * them straight from YouTube with yt-dlp. Returns the subtitle text so the
   * renderer can parse it exactly like a picked file.
   */
  ipcMain.handle(
    'media:fetchYoutubeSubs',
    async (_e, id: string, preferLang?: string): Promise<{ ok: true; name: string; text: string } | { ok: false; error: string }> => {
      const item = readDb().items.find((i) => i.id === id);
      if (!item) return { ok: false, error: 'Media item not found.' };

      const wanted = (preferLang || item.lang || 'ja').toLowerCase();

      // 1. Sidecar files beside the downloaded video.
      const local = pickSubtitleBeside(item.path, wanted);
      if (local) return { ok: true, name: local.name, text: local.text };

      // 2. Ask YouTube directly.
      const url =
        (item.sourceUrl && /youtu\.?be/i.test(item.sourceUrl) ? item.sourceUrl : '') ||
        (item.youtubeId ? `https://www.youtube.com/watch?v=${item.youtubeId}` : '');
      if (!url) return { ok: false, error: 'This item has no YouTube source to fetch subtitles from.' };

      const bin = await findYtDlp();
      if (!bin) return { ok: false, error: 'yt-dlp was not found on your PATH.' };

      const outDir = path.join(userDataSubdir(YOUTUBE_MEDIA_SUBTITLE_DIRECTORY), item.youtubeId || item.id);
      fs.mkdirSync(outDir, { recursive: true });
      const ytArgs = await withYtDlpJsRuntime([
        url,
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        'all',
        '--sub-format',
        'vtt/srt/ass/best',
        '--no-playlist',
        '-o',
        path.join(outDir, '%(id)s'),
      ]);
      const code = await new Promise<number>((resolve) => {
        // 'all' plus auto-subs: creator tracks when they exist, ASR otherwise.
        const proc = spawn(bin, ytArgs);
        proc.on('error', () => resolve(-1));
        proc.on('close', (c) => resolve(c ?? -1));
      });

      const picked = pickSubtitleFromDir(outDir, wanted);
      if (picked) return { ok: true, name: picked.name, text: picked.text };
      return {
        ok: false,
        error: code === 0 ? 'No subtitles are available for this video.' : 'Could not fetch subtitles from YouTube.',
      };
    },
  );

  /**
   * A CJK-capable face for the libass renderer, which ships with Roboto and nothing else.
   *
   * Returns null rather than a guess when the machine has none: a face that cannot draw
   * kana is the defect, not a fallback for it. See `subtitleFallbackFont.ts` for why a
   * font is read off the system rather than bundled.
   */
  ipcMain.handle(
    'media:subtitleFallbackFont',
    (_e, lang: string): SubtitleFallbackFont | null =>
      resolveSubtitleFallbackFont(typeof lang === 'string' ? lang : 'ja'),
  );

  ipcMain.handle('media:remove', (_e, id: string) => {
    const db = readDb();
    const removed = db.items.find((i) => i.id === id);
    db.items = db.items.filter((i) => i.id !== id);
    writeDb(db);
    if (removed) {
      removeCoverFiles(new Set([removed.id]));
      clearMediaArtwork(new Set([removed.id]));
      clearSubtitleCache(new Set([removed.id]));
    }
    pruneOrphanCache();
    broadcastMedia();
    return db.items;
  });

  ipcMain.handle('media:pruneMissing', () => pruneMissingItems());

  ipcMain.handle('media:clearAll', () => clearAllMedia());

  ipcMain.handle('media:setPosition', (_e, id: string, sec: number) => {
    const db = readDb();
    const item = db.items.find((i) => i.id === id);
    if (item) {
      item.positionSec = sec;
      writeDb(db);
    }
  });

  /*
   * The video player's progress, by file path. Before this nothing wrote a video's position
   * or duration into the library (the old player's `saveProgress` died with its <video>),
   * so every watched state built on them — episode ticks, progress bars, "Play next", the
   * Library's Continue shelf — was dead for video (inventory 2026-09-23). A finished video
   * is stored at its full length, which is what "watched" (≥92%) reads.
   */
  let playbackBroadcastTimer: NodeJS.Timeout | null = null;
  ipcMain.handle('media:reportPlayback', (_e, report: unknown) => {
    const r = report as {
      path?: unknown; positionSec?: unknown; durationSec?: unknown; finished?: unknown;
    } | null;
    if (!r || typeof r.path !== 'string' || !r.path.trim()) return false;
    const norm = (value: string): string => value.trim().replace(/\\/g, '/').toLowerCase();
    const wanted = norm(r.path);
    const db = readDb();
    const item = db.items.find((i) => norm(i.path ?? '') === wanted);
    if (!item) return false;
    const durationSec = Number(r.durationSec);
    const positionSec = Number(r.positionSec);
    if (Number.isFinite(durationSec) && durationSec > 0) item.durationSec = Math.round(durationSec);
    if (r.finished === true && item.durationSec) item.positionSec = item.durationSec;
    else if (Number.isFinite(positionSec) && positionSec >= 0) item.positionSec = positionSec;
    item.lastPlayedAt = Date.now();
    writeDb(db);
    // Coalesced: the player reports every few seconds; the library only needs to redraw
    // its progress bars now and then, and at once on a finish.
    if (playbackBroadcastTimer) clearTimeout(playbackBroadcastTimer);
    playbackBroadcastTimer = setTimeout(() => {
      playbackBroadcastTimer = null;
      broadcastMedia();
    }, r.finished === true ? 0 : 5_000);
    return true;
  });

  ipcMain.handle('media:setSubOffset', (_e, id: string, sec: number) => {
    const db = readDb();
    const item = db.items.find((i) => i.id === id);
    if (item) {
      item.subOffsetSec = sec;
      writeDb(db);
      broadcastMedia();
    }
  });

  ipcMain.handle('media:extractAudio', async (_e, url: string): Promise<ArrayBuffer> => {
    const file = pathForUrl(url);
    if (!file) throw new Error('Unknown media.');
    return extractAudioPcm(file);
  });

  ipcMain.handle('media:convert', async (_e, url: string): Promise<MediaOpen | null> => {
    const file = pathForUrl(url);
    if (!file) return null;
    const mp4 = await convertToMp4(file);
    const db = readDb();
    const item = db.items.find((i) => i.path === file) ?? addOrGetItem(file, false);
    return { item, url: `playfile://${tokenFor(mp4)}` };
  });

  ipcMain.handle('media:youtube', async (e, url: string, audioOnly?: boolean, rawOptions?: YouTubeDownloadOptions): Promise<MediaOpen | MediaDownloadError> => {
    const options = normalizeYoutubeDownloadOptions(audioOnly, rawOptions);
    const sender = e.sender;
    const result = await downloadYoutubeUrl(typeof url === 'string' ? url.trim() : '', options, (ev) => {
      sender.send('media:youtubeProgress', ev);
    });
    if ('error' in result) return result;
    return { item: result.item, url: result.url, subtitle: result.subtitle, audioTrack: result.audioTrack };
  });

  ipcMain.handle('media:pickSubtitle', async (): Promise<SubtitlePick | null> => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.openSubtitle.title'),
      properties: ['openFile'],
      filters: [
        { name: mt('dialog.filter.subtitles'), extensions: SUBTITLE_EXT },
        { name: mt('dialog.filter.allFiles'), extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    try {
      return { name: path.basename(res.filePaths[0]), text: fs.readFileSync(res.filePaths[0], 'utf-8') };
    } catch {
      return null;
    }
  });

  // Watch folder — the single-folder surfaces, answered from the ingest's list
  // (`mediaIngest:*` is the list itself). Choosing adds a folder; stopping
  // removes the one shown. Watching and the launch catch-up run in the ingest.
  ipcMain.handle('media:getWatchFolder', () => getMediaIngest()?.firstWatchFolder() ?? null);
  ipcMain.handle('media:setWatchFolder', async (e) => {
    const ingest = getMediaIngest();
    await ingest?.addFolderFromDialog(BrowserWindow.fromWebContents(e.sender) ?? focusedWindow());
    return { folder: ingest?.firstWatchFolder() ?? null, items: readDb().items };
  });
  ipcMain.handle('media:clearWatchFolder', () => {
    getMediaIngest()?.removeFirstFolder();
    broadcastMedia();
    return null;
  });
}
