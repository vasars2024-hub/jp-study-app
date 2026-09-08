import { describe, expect, it } from 'vitest';
import {
  applyMetricsDelta,
  emptyDayMetrics,
  immersionStatsId,
  isBrowsingPortalUrl,
  isImmersionSearchQuery,
  isNoVideoCaptureError,
  isRemoteMediaUrl,
  isYouTubeUrl,
  nextSiteStreak,
  normalizeImmersionUrl,
  sanitizeSite,
  nextImmersionMode,
  sanitizeImmersionMode,
  shouldUseLiveImmersionMode,
} from '../immersion';

describe('normalizeImmersionUrl', () => {
  it('accepts https URLs', () => {
    expect(normalizeImmersionUrl('https://ja.wikipedia.org/wiki/Test')).toBe(
      'https://ja.wikipedia.org/wiki/Test',
    );
  });
  it('adds https to bare hosts', () => {
    expect(normalizeImmersionUrl('example.com/path')).toBe('https://example.com/path');
  });
  it('rejects non-http schemes', () => {
    expect(normalizeImmersionUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeImmersionUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('isYouTubeUrl', () => {
  it('matches youtube hosts', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true);
    expect(isYouTubeUrl('https://nhk.or.jp/')).toBe(false);
  });
});

describe('immersion mode cycle', () => {
  it('cycles live → reader → focus', () => {
    expect(nextImmersionMode('live')).toBe('reader');
    expect(nextImmersionMode('reader')).toBe('focus');
    expect(nextImmersionMode('focus')).toBe('live');
  });
  it('sanitizes unknown modes', () => {
    expect(sanitizeImmersionMode('focus')).toBe('focus');
    expect(sanitizeImmersionMode('bogus')).toBe('reader');
  });
});

describe('immersion browsing helpers', () => {
  it('detects search queries', () => {
    expect(isImmersionSearchQuery('japanese news sites')).toBe(true);
    expect(isImmersionSearchQuery('https://example.com')).toBe(false);
  });
  it('detects browsing portals', () => {
    expect(isBrowsingPortalUrl('https://www.google.com/search?q=test')).toBe(true);
    expect(isBrowsingPortalUrl('https://ja.wikipedia.org/wiki/Test')).toBe(false);
  });
  it('forces live mode for search and portals', () => {
    expect(shouldUseLiveImmersionMode('anime streaming', 'https://www.google.com/search?q=anime+streaming')).toBe(true);
    expect(shouldUseLiveImmersionMode('https://example.com', 'https://example.com')).toBe(false);
  });
  it('accepts remote media URLs but not search portals', () => {
    expect(isRemoteMediaUrl('https://vimeo.com/123')).toBe(true);
    expect(isRemoteMediaUrl('https://www.google.com/search?q=video')).toBe(false);
  });
});

describe('isNoVideoCaptureError', () => {
  /*
   * The literal string measured live on 2026-09-08: Capture video to Media was
   * pressed on NHK Easy (an article, no video) and the immersion banner read
   * exactly this. It is the whole reason the classifier exists, so it is the
   * first case rather than a paraphrase of it.
   */
  it('recognises the message the live app actually produced', () => {
    expect(isNoVideoCaptureError(
      'Download failed: ERROR: Unsupported URL: https://news.web.nhk/news/easy/',
    )).toBe(true);
  });
  it('matches yt-dlp wording regardless of case', () => {
    expect(isNoVideoCaptureError('ERROR: unsupported url: https://example.com')).toBe(true);
    expect(isNoVideoCaptureError('ERROR: No video formats found!')).toBe(true);
  });
  /*
   * The control. A capture that failed for a reason the user could act on must
   * NOT be flattened into "this page has no video" — those keep their detail.
   */
  it('leaves actionable failures alone', () => {
    expect(isNoVideoCaptureError('Download failed: ERROR: yt-dlp is not installed')).toBe(false);
    expect(isNoVideoCaptureError('Download failed: ERROR: HTTP Error 403: Forbidden')).toBe(false);
    expect(isNoVideoCaptureError('Download failed: ERROR: Sign in to confirm your age')).toBe(false);
    expect(isNoVideoCaptureError('Download failed.')).toBe(false);
  });
});

describe('nextSiteStreak', () => {
  it('starts at 1', () => {
    expect(nextSiteStreak(0, undefined, '2026-07-11')).toEqual({
      streakDays: 1,
      lastStreakDay: '2026-07-11',
    });
  });
  it('does not double-count same day', () => {
    expect(nextSiteStreak(3, '2026-07-11', '2026-07-11')).toEqual({
      streakDays: 3,
      lastStreakDay: '2026-07-11',
    });
  });
  it('increments consecutive days', () => {
    expect(nextSiteStreak(2, '2026-07-10', '2026-07-11')).toEqual({
      streakDays: 3,
      lastStreakDay: '2026-07-11',
    });
  });
  it('resets after a gap', () => {
    expect(nextSiteStreak(5, '2026-07-01', '2026-07-11')).toEqual({
      streakDays: 1,
      lastStreakDay: '2026-07-11',
    });
  });
});

describe('applyMetricsDelta', () => {
  it('accumulates fields', () => {
    const next = applyMetricsDelta(emptyDayMetrics(), { seconds: 10, wordsMined: 2 });
    expect(next.seconds).toBe(10);
    expect(next.wordsMined).toBe(2);
    expect(next.chars).toBe(0);
  });
});

describe('sanitizeSite', () => {
  it('rejects bad input', () => {
    expect(sanitizeSite(null)).toBeNull();
    expect(sanitizeSite({ id: 'x' })).toBeNull();
  });
  it('fills defaults', () => {
    const s = sanitizeSite({
      id: 'a',
      url: 'https://example.com/',
      title: 'Ex',
    });
    expect(s?.title).toBe('Ex');
    expect(s?.lang).toBe('auto');
    expect(s?.completionPct).toBe(0);
  });
});

describe('immersionStatsId', () => {
  it('prefixes host path', () => {
    expect(immersionStatsId('https://example.com/foo')).toBe('immersion:example.com/foo');
  });
});
