/**
 * Whisper in the player, through the shared transcription queue.
 *
 * The player used to decode the whole audio track into the renderer (one Float32Array of
 * the episode, ~350 MB for 24 minutes at 16 kHz once copied into the worker) and run its
 * own worker beside the queue the library already had. The queue in main is chunked,
 * persistent and cancellable, and it writes the transcript to the library item, so the
 * track is there the next time the file opens. The player now asks the queue for the
 * work, follows `transcription:progress` for its file, and mounts the SRT the queue
 * wrote when the job reports `done`.
 *
 * The same reasoning covers a subtitle file loaded mid-play: it is attached to the
 * library item through `attachSubtitleText`, so it is not lost when the player closes.
 *
 * Pure helpers first (tested), then the thin `window.api` glue.
 */
import { studyLibraryPathKey } from '../shared/seanimeStudyLibrary';
import { ATTACHABLE_SUBTITLE_FORMATS } from '../shared/subtitleDiscoveryIpc';
import type { SubtitleRecord, SubtitleRecordFormat } from '../shared/subtitleRecord';
import type { TranscriptionCardOptions, TranscriptionProgress } from '../shared/transcriptionIpc';
import type { MediaItem } from '../shared/types';

export type PlayerWhisperState = 'idle' | 'extracting' | 'loading' | 'transcribing' | 'done' | 'error';

/** What the player's Whisper controls show for one queue progress event. */
export interface PlayerWhisperView {
  state: PlayerWhisperState;
  /** 0..1, for the progress bar. */
  progress: number;
  /** Catalog key for the status line (or the error line when `state` is `error`). */
  messageKey: string;
  messageParams?: Record<string, string | number>;
}

/**
 * The player asks for a subtitle track, not a sentence deck: the library's "transcribe"
 * button is where card creation is chosen. A player run creates no cards.
 */
export const PLAYER_TRANSCRIPTION_CARD_OPTIONS: TranscriptionCardOptions = {
  createCards: false,
  translateToEnglish: false,
  includeAudio: false,
};

/** A queue error code as the sentence the player shows. */
export function playerWhisperErrorKey(error: string | undefined): string {
  switch (error) {
    case 'no-window':
    case 'host-not-registered':
      return 'studyLoop2.whisper.noHost';
    case 'item-not-found':
      return 'mediaWorkspace.study.whisperLocalOnly';
    default:
      return 'mediaWorkspace.study.whisperFailed';
  }
}

export function playerWhisperView(progress: TranscriptionProgress): PlayerWhisperView {
  const ratio = progress.total > 0
    ? Math.max(0, Math.min(1, progress.done / progress.total))
    : 0;
  switch (progress.phase) {
    case 'queued':
    case 'preparing':
      return { state: 'loading', progress: 0, messageKey: `media.jobs.phase.${progress.phase}` };
    case 'extracting-audio':
      return { state: 'extracting', progress: 0, messageKey: 'media.jobs.phase.extracting-audio' };
    case 'transcribing':
      return progress.total > 0
        ? {
          state: 'transcribing',
          progress: ratio,
          messageKey: 'studyLoop2.whisper.chunks',
          messageParams: { done: progress.done, total: progress.total },
        }
        : { state: 'transcribing', progress: 0, messageKey: 'media.jobs.phase.transcribing' };
    case 'aligning':
      return { state: 'transcribing', progress: 1, messageKey: 'media.jobs.phase.aligning' };
    case 'done':
      return { state: 'done', progress: 1, messageKey: 'media.jobs.phase.done' };
    case 'cancelled':
      return { state: 'idle', progress: 0, messageKey: 'media.jobs.phase.cancelled' };
    case 'error':
    default:
      return { state: 'error', progress: 0, messageKey: playerWhisperErrorKey(progress.error) };
  }
}

/** The library row for a file the player is playing, matched as the library matches paths. */
export function findLibraryItemForPath(
  items: readonly MediaItem[],
  filePath: string,
): MediaItem | null {
  if (!filePath) return null;
  const key = studyLibraryPathKey(filePath);
  return items.find((item) => item.path && studyLibraryPathKey(item.path) === key) ?? null;
}

function sameLanguage(a: string, b: string): boolean {
  const left = a.trim().toLowerCase().split(/[-_]/)[0];
  const right = b.trim().toLowerCase().split(/[-_]/)[0];
  return !!left && left === right;
}

/**
 * The transcript the queue just wrote: the newest Whisper record in the job's language.
 * A fused or machine-translated record is a different artifact and is never picked.
 */
export function latestWhisperRecord(
  item: Pick<MediaItem, 'subtitles'> | null | undefined,
  lang: string,
): SubtitleRecord | null {
  const records = (item?.subtitles ?? []).filter((record) => (
    record.source === 'generated'
    && (record.derivation ?? 'whisper') === 'whisper'
    && sameLanguage(record.lang, lang)
  ));
  if (!records.length) return null;
  return records.reduce((best, record) => ((record.addedAt ?? 0) > (best.addedAt ?? 0) ? record : best));
}

/** The attachable format of a subtitle file name, or null (`.sub` is not attachable). */
export function subtitleImportFormat(fileName: string): SubtitleRecordFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase() ?? '';
  return (ATTACHABLE_SUBTITLE_FORMATS as readonly string[]).includes(ext)
    ? ext as SubtitleRecordFormat
    : null;
}

// ---------------------------------------------------------------------------
// window.api glue

/**
 * The library item for a file, adding the file to the library when it is not there yet:
 * the queue and the subtitle store both key on a library item. Null when the bridge is
 * missing or the add was refused.
 */
export async function ensureLibraryItemForPath(filePath: string): Promise<MediaItem | null> {
  const api = window.api;
  if (!filePath || typeof api?.listMedia !== 'function') return null;
  const existing = findLibraryItemForPath(await api.listMedia(), filePath);
  if (existing) return existing;
  if (typeof api.addMediaPaths !== 'function') return null;
  return findLibraryItemForPath(await api.addMediaPaths([filePath]), filePath);
}

export type SubtitlePersistOutcome = 'saved' | 'unsupported' | 'no-item' | 'failed';

/** Attach a subtitle file loaded in the player to the video's library item. */
export async function persistPlayerSubtitle(input: {
  videoPath: string;
  fileName: string;
  text: string;
  lang: string;
}): Promise<SubtitlePersistOutcome> {
  const format = subtitleImportFormat(input.fileName);
  if (!format) return 'unsupported';
  if (typeof window.api?.attachSubtitleText !== 'function') return 'failed';
  try {
    const item = await ensureLibraryItemForPath(input.videoPath);
    if (!item) return 'no-item';
    const result = await window.api.attachSubtitleText({
      mediaId: item.id,
      text: input.text,
      format,
      lang: input.lang,
      label: input.fileName,
    });
    return result?.ok ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}
