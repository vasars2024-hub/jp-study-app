import { describe, expect, it } from 'vitest';
import { localizeYtPlaylistError } from '../ytPlaylistErrors';

const t = (key: string, vars?: Record<string, string | number>): string =>
  `${key}${vars ? ` ${JSON.stringify(vars)}` : ''}`;

describe('YouTube playlist refusal localization', () => {
  it.each([
    ['Not a valid YouTube playlist URL (missing list=…).', 'invalidPlaylistUrl'],
    ['That playlist was removed while it was syncing.', 'removedDuringSync'],
    ['Playlist not found.', 'playlistNotFound'],
    ['Channel not found.', 'channelNotFound'],
    ['Not a valid YouTube video URL.', 'invalidVideoUrl'],
    ['Video not found.', 'videoNotFound'],
    ['yt-dlp was not found on your PATH.', 'ytDlpMissing'],
    ['Missing youtubeId.', 'missingVideoId'],
  ])('maps %s to a locale key', (message, key) => {
    expect(localizeYtPlaylistError(message, t)).toBe(`yt.refusal.${key}`);
  });

  it('localizes the yt-dlp exit code without losing it', () => {
    expect(localizeYtPlaylistError('yt-dlp exited with code 127', t)).toBe(
      'yt.refusal.ytDlpExit {"code":"127"}',
    );
  });

  it('keeps an unknown provider diagnostic under a translated explanation', () => {
    expect(localizeYtPlaylistError('HTTP Error 429', t)).toBe(
      'yt.refusal.providerError {"detail":"HTTP Error 429"}',
    );
  });
});
