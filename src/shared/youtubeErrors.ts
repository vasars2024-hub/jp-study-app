/**
 * yt-dlp reports failures as raw English stderr ("ERROR: [youtube] abc: Private
 * video", "HTTP Error 429: Too Many Requests"). The YouTube manager showed that
 * text as-is, so a Japanese or Russian UI surfaced English errors. This maps the
 * failures yt-dlp actually produces to catalog keys; anything unrecognised keeps
 * its detail inside a translated frame rather than being dropped.
 */

export interface YoutubeErrorMessage {
  key: string;
  vars?: Record<string, string | number>;
}

const PATTERNS: Array<[RegExp, string]> = [
  [/not found on your PATH|ENOENT|spawn .*yt-dlp/i, 'ytManager.error.noYtDlp'],
  [/private video|video is private|playlist is private/i, 'polish2.yt.error.private'],
  [/sign in to confirm|age[- ]restricted|confirm your age|not a bot/i, 'polish2.yt.error.signIn'],
  [/members[- ]only|join this channel/i, 'polish2.yt.error.membersOnly'],
  [/HTTP Error 429|too many requests/i, 'polish2.yt.error.rateLimited'],
  [/video unavailable|is unavailable|has been removed|no longer available|been terminated/i, 'polish2.yt.error.unavailable'],
  [/does not exist|HTTP Error 404/i, 'polish2.yt.error.notFound'],
  [/getaddrinfo|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timed out|network is unreachable|unable to download webpage/i, 'polish2.yt.error.network'],
  [/could not parse yt-dlp json|JSONDecodeError/i, 'polish2.yt.error.badJson'],
];

/**
 * The catalog message for a raw yt-dlp failure, or `null` when it is not one
 * of the recognised failures (the caller keeps the raw detail, which the
 * renderer then shows inside its translated "YouTube request failed" frame).
 */
export function youtubeErrorMessage(raw: string | undefined | null): YoutubeErrorMessage | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  for (const [pattern, key] of PATTERNS) {
    if (pattern.test(text)) return { key };
  }
  return null;
}
