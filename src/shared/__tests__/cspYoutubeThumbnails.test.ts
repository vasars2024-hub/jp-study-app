/**
 * Every YouTube thumbnail the app paints must be loadable under the packaged CSP.
 *
 * The YouTube playlist rows (`YouTubePlaylistsView`) and the Discover panel
 * (`YoutubeDiscoveryPanel`) render `thumbUrl` straight into an `<img>`. In a packaged
 * build `img-src` did not name YouTube's thumbnail host, so every one was blocked
 * (round-4 console sweep, 2026-09-26: an `img-src` violation and a broken image for each
 * row of a seeded playlist) while a dev run — which the policy never binds — showed them.
 * This checks the URLs the code actually produces against the directive, host by host.
 */
import { describe, expect, it } from 'vitest';
import { cspDirectiveSources } from '../contentSecurityPolicy';
import { parseYoutubeSearchPayload } from '../youtubeDiscovery';
import { youtubeThumbUrl } from '../ytPlaylists';

/** CSP host-source matching for the `https://host` / `https://*.host` forms the policy uses. */
function imgSrcAllows(url: string): boolean {
  const u = new URL(url);
  return (cspDirectiveSources('img-src') ?? []).some((source) => {
    const m = /^https:\/\/(\*\.)?([^/:]+)$/.exec(source);
    if (!m || u.protocol !== 'https:') return false;
    return m[1] ? u.hostname.endsWith(`.${m[2]}`) : u.hostname === m[2];
  });
}

describe('packaged CSP and YouTube thumbnails', () => {
  it('allows the fallback thumbnail every stored playlist video gets', () => {
    expect(imgSrcAllows(youtubeThumbUrl('M7lc1UVf-VE'))).toBe(true);
  });

  it('allows the thumbnails yt-dlp reports for search and playlist entries', () => {
    const payload = parseYoutubeSearchPayload({
      entries: [
        // yt-dlp's `thumbnails` list: the last (largest) one is used.
        { id: 'aqz-KE-bpKQ', title: 'a', thumbnails: [{ url: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg?sqp=-oay&rs=AOn4' }] },
        { id: 'ScMzIvxBSi4', title: 'b', thumbnail: 'https://i.ytimg.com/vi_webp/ScMzIvxBSi4/maxresdefault.webp' },
        { id: 'M7lc1UVf-VE', title: 'c' },
      ],
    });
    expect(payload.candidates).toHaveLength(3);
    for (const c of payload.candidates) expect(imgSrcAllows(c.thumbUrl ?? '')).toBe(true);
  });

  it('still names hosts rather than allowing any https image', () => {
    expect(imgSrcAllows('https://evil.example/pixel.gif')).toBe(false);
  });
});
