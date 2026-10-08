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
    expect(localizeYtPlaylistError('ERROR: something odd happened', t)).toBe(
      'yt.refusal.providerError {"detail":"ERROR: something odd happened"}',
    );
  });

  it.each([
    ['HTTP Error 429', 'rateLimited'],
    ['ERROR: [youtube] abc123: Private video. Sign in if you\'ve been granted access', 'private'],
    ['ERROR: [youtube] abc123: Sign in to confirm your age', 'signIn'],
    ['ERROR: [youtube] abc123: Video unavailable', 'unavailable'],
    ['ERROR: [youtube:tab] PLx: The playlist does not exist.', 'notFound'],
    ['ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>', 'network'],
    ['ERROR: [youtube] abc123: Join this channel to get access to members-only content', 'membersOnly'],
  ])('maps raw yt-dlp stderr %s to a translated message', (raw, key) => {
    expect(localizeYtPlaylistError(raw, t)).toBe(`polish2.yt.error.${key}`);
  });
});
