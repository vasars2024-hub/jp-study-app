/**
 * Where the learner is in each downloaded YouTube video, for the playlist
 * manager's rows.
 *
 * A YouTube download plays in the study player like any local file, and that
 * player already keeps a resume point per file (`jp-video-core-resume-v1`) and
 * reports progress into the media library item. The playlist view showed none
 * of it: a half-watched video and an untouched one looked the same, and Open
 * did not say it would resume. This joins the two stores the rest of the app
 * already reads (the same order `MediaCenterView.resumeAt` uses: the player's
 * resume store first, the library's own position second) by the one key every
 * Phase 6 surface shares.
 */
import { CONTINUE_WATCHING_MIN_POSITION_SEC } from './seanimeContinueWatching';
import { videoCoreResumeKey, type VideoCoreResumePosition } from './videoCoreStudy';
import { isWatchFinished } from './watchFinished';

export type YtWatchState =
  | { kind: 'watched' }
  | { kind: 'resume'; positionSec: number; fraction: number | null };

export interface YtWatchInput {
  /** The library item the download became, when the library still has it. */
  item?: { path?: string; positionSec?: number; durationSec?: number } | null;
  /** YouTube's own duration for the video, used when the file's is unknown. */
  ytDurationSec?: number;
  positions: readonly VideoCoreResumePosition[];
}

export function ytWatchState({ item, ytDurationSec, positions }: YtWatchInput): YtWatchState | null {
  if (!item?.path) return null;
  const duration = item.durationSec && item.durationSec > 0 ? item.durationSec : ytDurationSec;
  const key = videoCoreResumeKey({ localFilePath: item.path });
  const stored = key ? positions.find((p) => p.key === key) : undefined;
  // The player clears its resume point when a file is finished, so a finished
  // video is read from the library's position, which keeps the last one.
  if (!stored && isWatchFinished(item.positionSec, duration)) return { kind: 'watched' };
  const at = stored?.positionSec ?? item.positionSec ?? 0;
  if (!Number.isFinite(at) || at < CONTINUE_WATCHING_MIN_POSITION_SEC) return null;
  if (isWatchFinished(at, duration)) return { kind: 'watched' };
  const fraction = duration && duration > 0 ? Math.min(1, at / duration) : null;
  return { kind: 'resume', positionSec: at, fraction };
}

/** `m:ss` / `h:mm:ss` for a resume chip. Digits only, so it is not catalog text. */
export function formatResumeClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
