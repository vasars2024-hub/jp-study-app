/** Classify media files for Phase 5b smart import / library filters. */

export type MediaKind = 'video' | 'audio' | 'audiobook';

export const VIDEO_EXT = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.ogv',
  '.ts',
  '.flv',
  '.wmv',
]);

export const AUDIO_EXT = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.opus',
]);

export const MEDIA_EXT = new Set([...VIDEO_EXT, ...AUDIO_EXT]);

/** Raster formats the library treats as manga pages / cover art. */
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);

/** Containers that may hold a manga volume — or, for `.zip`, a Yomitan dictionary. */
export const ARCHIVE_EXT = new Set(['.cbz', '.zip']);

/** Text formats the reader opens directly. */
export const BOOK_EXT = new Set(['.epub', '.pdf', '.txt', '.html', '.htm']);

/**
 * Wallpaper-capable images. Narrower than IMAGE_EXT on purpose — `.avif` and
 * `.bmp` are not accepted by the wallpaper pipeline. Hoisted out of the
 * function body in `main/library.ts` so the drop router can consult it.
 */
export const WALL_EXT: readonly string[] = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Subtitle / lyric sidecars, with the leading dot (media.ts stores them bare). */
export const SUBTITLE_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc']);

/** Lowercased extension including the dot, or '' when there is none. */
export function extOf(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

const AUDIOBOOK_HINT =
  /\b(audiobook|audio[\s_-]?book|podcast|講談|朗読|ラジオ|radio[\s_-]?drama|full[\s_-]?cast)\b/i;

/**
 * Extension + filename heuristics. Duration-based audiobook detection can be
 * layered on later once ffprobe metadata is available.
 */
export function classifyMediaKind(fileName: string, durationSec?: number): MediaKind {
  const ext = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    : '';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) {
    if (AUDIOBOOK_HINT.test(fileName)) return 'audiobook';
    // Long audio without video cues → likely audiobook/podcast
    if (typeof durationSec === 'number' && durationSec >= 30 * 60) return 'audiobook';
    return 'audio';
  }
  // Unknown: prefer video so the learning player can still attempt open
  return 'video';
}

export function isVideoKind(kind: MediaKind | undefined): boolean {
  return kind === 'video' || kind == null;
}
