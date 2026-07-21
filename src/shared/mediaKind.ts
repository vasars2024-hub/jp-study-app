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
