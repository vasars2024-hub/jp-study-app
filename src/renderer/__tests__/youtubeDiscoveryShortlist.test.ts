// @vitest-environment jsdom

/**
 * The shortlist accepting YouTube videos alongside catalogue titles.
 *
 * Before this slice `discoveryShortlistStore` dropped anything whose provider
 * was not `jikan` or `anilist`, so a YouTube video could not be shortlisted at
 * all. The interesting cases are the seams: that the two kinds share one store
 * without colliding, and that the narrowing readers really do narrow — a
 * consumer that renders episode counts must never be handed a video.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveryCandidate } from '../../shared/mediaDiscovery';
import type { YoutubeDiscoveryCandidate } from '../../shared/youtubeDiscovery';
import {
  DISCOVERY_SHORTLIST_KEY,
  addToShortlist,
  loadMediaShortlist,
  loadShortlist,
  loadYoutubeShortlist,
  removeFromShortlist,
  shortlistCandidateId,
} from '../discoveryShortlistStore';

const ANIME: DiscoveryCandidate = {
  provider: 'jikan',
  id: 52991,
  title: 'Sousou no Frieren',
  genres: ['Adventure', 'Fantasy'],
};

const VIDEO: YoutubeDiscoveryCandidate = {
  provider: 'youtube',
  videoId: 'abcdefghijk',
  title: '日本語のポッドキャスト',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
  channelTitle: 'Nihongo',
  channelId: 'UC1234567890123456789A',
  durationSec: 1200,
};

describe('YouTube entries in the discovery shortlist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keys a video by its video id, not by a numeric provider id', () => {
    expect(shortlistCandidateId(VIDEO)).toBe('youtube:abcdefghijk');
    expect(shortlistCandidateId(ANIME)).toBe('jikan:52991');
  });

  it('persists a video and restores it', () => {
    addToShortlist(VIDEO, 1234);

    expect(loadYoutubeShortlist()).toEqual([
      expect.objectContaining({
        id: 'youtube:abcdefghijk',
        candidate: expect.objectContaining({ videoId: 'abcdefghijk', provider: 'youtube' }),
        addedAt: 1234,
      }),
    ]);
  });

  it('keeps both kinds in one store and hands each reader only its own', () => {
    addToShortlist(ANIME, 1000);
    addToShortlist(VIDEO, 2000);

    expect(loadShortlist()).toHaveLength(2);
    expect(loadMediaShortlist().map((entry) => entry.id)).toEqual(['jikan:52991']);
    expect(loadYoutubeShortlist().map((entry) => entry.id)).toEqual(['youtube:abcdefghijk']);
  });

  it('removes a video without disturbing a catalogue title', () => {
    addToShortlist(ANIME, 1000);
    addToShortlist(VIDEO, 2000);

    removeFromShortlist('youtube:abcdefghijk');

    expect(loadYoutubeShortlist()).toEqual([]);
    expect(loadMediaShortlist()).toHaveLength(1);
  });

  /**
   * A stored `url` is the one field an older build could have written as a
   * `youtu.be` link or a watch URL carrying a stale `list=` parameter — and that
   * parameter is what turns a one-video hand-off into somebody else's entire
   * playlist. It is rebuilt from the id on read rather than trusted.
   */
  it('rebuilds the watch URL on read instead of trusting what was stored', () => {
    localStorage.setItem(DISCOVERY_SHORTLIST_KEY, JSON.stringify([{
      id: 'youtube:abcdefghijk',
      addedAt: 1,
      candidate: {
        provider: 'youtube',
        videoId: 'abcdefghijk',
        title: 'x',
        url: 'https://www.youtube.com/watch?v=abcdefghijk&list=PLsomethingelse',
      },
    }]));

    expect(loadYoutubeShortlist()[0].candidate.url)
      .toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });

  it('drops a half-written video entry rather than rendering it', () => {
    localStorage.setItem(DISCOVERY_SHORTLIST_KEY, JSON.stringify([
      { id: 'youtube:x', addedAt: 1, candidate: { provider: 'youtube', title: 'no id' } },
      { id: 'youtube:y', addedAt: 1, candidate: { provider: 'youtube', videoId: 'yyyyyyyyyyy' } },
    ]));

    expect(loadShortlist()).toEqual([]);
  });

  it('still refuses an unknown provider', () => {
    localStorage.setItem(DISCOVERY_SHORTLIST_KEY, JSON.stringify([
      { id: 'vimeo:1', addedAt: 1, candidate: { provider: 'vimeo', id: 1, title: 'x' } },
    ]));

    expect(loadShortlist()).toEqual([]);
  });
});
