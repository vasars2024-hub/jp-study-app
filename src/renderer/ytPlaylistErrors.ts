import { youtubeErrorMessage } from '../shared/youtubeErrors';

type Translate =(key: string, vars?: Record<string, string | number>) => string;

const refusalKeys: Record<string, string> = {
  'Not a valid YouTube playlist URL (missing list=…).': 'yt.refusal.invalidPlaylistUrl',
  'That playlist was removed while it was syncing.': 'yt.refusal.removedDuringSync',
  'Playlist not found.': 'yt.refusal.playlistNotFound',
  'Channel not found.': 'yt.refusal.channelNotFound',
  'Not a valid YouTube video URL.': 'yt.refusal.invalidVideoUrl',
  'Video not found.': 'yt.refusal.videoNotFound',
  'yt-dlp was not found on your PATH.': 'yt.refusal.ytDlpMissing',
  'Missing youtubeId.': 'yt.refusal.missingVideoId',
};

/** Main-process errors are data; turn known refusals into UI text at display time. */
export function localizeYtPlaylistError(error: string, t: Translate): string {
  const key = refusalKeys[error];
  if (key) return t(key);
  const exitCode = /^yt-dlp exited with code (-?\d+)$/.exec(error);
  if (exitCode) return t('yt.refusal.ytDlpExit', { code: exitCode[1] });
  // yt-dlp's own English stderr (private video, rate limit, network...).
  const known = youtubeErrorMessage(error);
  if (known) return t(known.key, known.vars);
  return t('yt.refusal.providerError', { detail: error });
}
