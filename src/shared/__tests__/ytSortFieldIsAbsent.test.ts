/**
 * Pre-sweep D94 — a sort that persists your choice and moves nothing must say so.
 *
 * Measured live on 2026-09-06 (pid 14128 window 2, playlist オノマトペ): picking
 * "Views" wrote `sortDefault: 'views'` through `ytSetPlaylistPrefs` and survived a
 * reload, while the first five row titles before and after were **identical, in order**.
 * The comparator is correct — the data is absent. Of the user's 19 videos, 3 carry
 * `viewCount` and 3 carry `publishedAt`, and all 3 are on the extension-capture
 * playlist, so **0 of the 16** in the app-synced playlist have either. `syncPlaylist`
 * runs yt-dlp with `--flat-playlist` (`main/ytPlaylists.ts:234`), which does not return
 * `view_count` or `timestamp` for these channels.
 *
 * So the surface now reports the gap instead of leaving the user to guess whether the
 * sort ran. This tests the predicate that decides that, on the real shape.
 */
import { describe, expect, it } from 'vitest';
import { sortFieldIsAbsent, sortYtVideos, type YtVideo } from '../ytPlaylists';

const video = (id: string, extra: Partial<YtVideo> = {}): YtVideo =>
  ({
    id,
    playlistId: 'p1',
    title: `title ${id}`,
    url: `https://youtu.be/${id}`,
    position: Number(id),
    ...extra,
  }) as YtVideo;

describe('sortFieldIsAbsent', () => {
  it('reports the gap when no video carries a view count', () => {
    expect(sortFieldIsAbsent([video('1'), video('2')], 'views')).toBe('views');
  });

  it('reports the gap when no video carries a publish date', () => {
    expect(sortFieldIsAbsent([video('1'), video('2')], 'date')).toBe('date');
  });

  it('stays silent as soon as ONE video carries the field', () => {
    // One is enough for the sort to do something real, which is the honest threshold —
    // a partial sort is a sort, and claiming otherwise would be its own false report.
    expect(sortFieldIsAbsent([video('1'), video('2', { viewCount: 10 })], 'views')).toBeNull();
    expect(sortFieldIsAbsent([video('1'), video('2', { publishedAt: 1 })], 'date')).toBeNull();
  });

  it('treats a zero view count as real data, not as absence', () => {
    // `0` is a legitimate view count and `?? 0` in the comparator makes it
    // indistinguishable from absent — which is exactly the bug class this guards.
    expect(sortFieldIsAbsent([video('1', { viewCount: 0 })], 'views')).toBeNull();
    expect(sortFieldIsAbsent([video('1', { publishedAt: 0 })], 'date')).toBeNull();
  });

  it('ignores a non-finite value, which cannot order anything', () => {
    expect(sortFieldIsAbsent([video('1', { viewCount: NaN })], 'views')).toBe('views');
  });

  it('says nothing for the three sorts that do not read either field', () => {
    for (const sort of ['playlist', 'title', 'unlogged'] as const) {
      expect(sortFieldIsAbsent([video('1'), video('2')], sort)).toBeNull();
    }
  });

  it('says nothing for an empty list, which has its own empty state', () => {
    expect(sortFieldIsAbsent([], 'views')).toBeNull();
    expect(sortFieldIsAbsent([], 'date')).toBeNull();
  });
});

describe('the defect this guards is real', () => {
  it('sorting by views does not move a list with no view counts', () => {
    // The measurement that produced D94, reproduced: same order in, same order out.
    const list = [video('1'), video('2'), video('3')];
    const before = list.map((v) => v.id);
    expect(sortYtVideos(list, 'views').map((v) => v.id)).toEqual(before);
    expect(sortFieldIsAbsent(list, 'views')).toBe('views');
  });

  it('and DOES move one that has them, so the comparator is not the fault', () => {
    const list = [video('1', { viewCount: 5 }), video('2', { viewCount: 90 })];
    expect(sortYtVideos(list, 'views').map((v) => v.id)).toEqual(['2', '1']);
    expect(sortFieldIsAbsent(list, 'views')).toBeNull();
  });
});
