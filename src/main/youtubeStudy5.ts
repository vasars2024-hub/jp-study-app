/**
 * YouTube 7.5, main half: fetch ONE chosen caption track for the pre-study
 * list, and tell the user when a subscription sweep found new videos.
 *
 * Captions come through the same yt-dlp the app already uses, metadata-only:
 * `--skip-download` always, one `--sub-langs` key, no playback, no ads, no DRM.
 */
import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { findYtDlp, withYtDlpJsRuntime } from './media';
import { mt } from './i18n';
import {
  yt5CaptionTrackArgs,
  yt5IsSafeTrackKey,
  yt5IsVideoId,
  yt5NewVideoNotice,
  type Yt5NewVideoGroup,
} from '../shared/youtubeStudy5';
import type { YoutubeCaptionKind } from '../shared/youtubeDiscovery';

const CAPTION_DIR = 'yt5-captions';
const FETCH_TIMEOUT_MS = 90_000;
/** One caption fetch at a time per video; a double click must not spawn two processes. */
const inFlight = new Map<string, Promise<Yt5CaptionResult>>();

export type Yt5CaptionResult =
  | { ok: true; text: string; file: string }
  | { ok: false; error: string };

function captionDir(videoId: string): string {
  return path.join(app.getPath('userData'), CAPTION_DIR, videoId);
}

/** The cached file for a track, if a previous fetch left one. */
export function yt5CachedTrackFile(dir: string, key: string): string | null {
  try {
    const lower = `.${key.toLowerCase()}.`;
    const file = fs.readdirSync(dir).find((name) => name.toLowerCase().includes(lower) && /\.(vtt|srt|ass)$/i.test(name));
    return file ?? null;
  } catch {
    return null;
  }
}

async function fetchCaptionTrack(videoId: string, key: string, kind: YoutubeCaptionKind): Promise<Yt5CaptionResult> {
  // Per kind: a manual and an auto track can share the key ja, and yt-dlp names both <id>.ja.vtt.
  const dir = path.join(captionDir(videoId), kind);
  const cached = yt5CachedTrackFile(dir, key);
  if (cached) return { ok: true, text: fs.readFileSync(path.join(dir, cached), 'utf-8'), file: cached };
  const bin = await findYtDlp();
  if (!bin) return { ok: false, error: mt('yt5.error.noYtDlp') };
  fs.mkdirSync(dir, { recursive: true });
  const args = await withYtDlpJsRuntime(yt5CaptionTrackArgs(videoId, key, kind, path.join(dir, '%(id)s')));
  const code = await new Promise<number>((resolve) => {
    const proc = spawn(bin, args, { windowsHide: true });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      resolve(-2);
    }, FETCH_TIMEOUT_MS);
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(-1);
    });
    proc.on('close', (c) => {
      clearTimeout(timer);
      resolve(c ?? -1);
    });
  });
  const file = yt5CachedTrackFile(dir, key);
  if (file) return { ok: true, text: fs.readFileSync(path.join(dir, file), 'utf-8'), file };
  return { ok: false, error: code === -2 ? mt('yt5.error.timeout') : mt('yt5.error.noTrack') };
}

export function registerYoutubeStudy5Ipc(): void {
  ipcMain.handle(
    'yt5:fetchCaptionTrack',
    async (_e, videoId: unknown, key: unknown, kind: unknown): Promise<Yt5CaptionResult> => {
      if (typeof videoId !== 'string' || !yt5IsVideoId(videoId)) return { ok: false, error: mt('yt5.error.badRequest') };
      if (typeof key !== 'string' || !yt5IsSafeTrackKey(key)) return { ok: false, error: mt('yt5.error.badRequest') };
      const trackKind: YoutubeCaptionKind = kind === 'auto' ? 'auto' : 'human';
      const flightKey = `${videoId}:${key}:${trackKind}`;
      const running = inFlight.get(flightKey);
      if (running) return running;
      const work = fetchCaptionTrack(videoId, key, trackKind)
        .catch((error: unknown): Yt5CaptionResult => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
        .finally(() => inFlight.delete(flightKey));
      inFlight.set(flightKey, work);
      return work;
    },
  );
}

/**
 * One OS notice for a whole subscription sweep. Through `lockedNotifications`,
 * so a locked app holds it rather than reading titles out past the PIN pad.
 * Loaded lazily: the sweep's tests stub electron without `Notification`.
 */
export async function notifyNewYoutubeVideos(groups: readonly Yt5NewVideoGroup[]): Promise<void> {
  const notice = yt5NewVideoNotice(groups);
  if (!notice) return;
  try {
    const { showNativeNotification } = await import('./lockedNotifications');
    showNativeNotification({
      title: mt('yt5.notify.title', { count: notice.count }),
      body: notice.count === 1
        ? mt('yt5.notify.one', { title: notice.firstTitle, playlist: notice.playlists[0] ?? '' })
        : mt('yt5.notify.many', { title: notice.firstTitle, count: notice.count - 1 }),
    });
  } catch {
    /* no notification support: the News tab still lists them */
  }
}
