import { describe, expect, it } from 'vitest';
import { airedEpisodesToAnnounce, airingBatches, airingCandidates, airingNotifyKeys, planAiringUpdates } from '../watchAiring';
import { projectWatchAiringCalendar } from '../mediaTrackingCalendar';
import type { WatchTitle } from '../watchLibrary';

const title = (id: string, extra: Partial<WatchTitle>): WatchTitle => ({
  id, kind: 'anime', title: id, status: 'watching', watchDates: [], tags: [], lists: [], sources: ['mal-export'], addedAt: 1, updatedAt: 1, ...extra,
});
const NOW = Date.UTC(2026, 8, 24, 12);
const HOUR = 3_600_000;

describe('airing schedule', () => {
  it('asks about watching and plan anime with an id, in batches of 50 by MAL id first', () => {
    const titles = [
      ...Array.from({ length: 60 }, (_, i) => title(`mal:${i + 1}`, { malId: i + 1 })),
      title('al', { anilistId: 900 }),
      title('done', { malId: 999, status: 'completed' }),
      title('film', { malId: 998, kind: 'film' }),
      title('noid', {}),
    ];
    const candidates = airingCandidates(titles);
    expect(candidates).toHaveLength(61);
    const batches = airingBatches(candidates);
    expect(batches.map((batch) => [batch.by, batch.ids.length])).toEqual([['mal', 50], ['mal', 10], ['anilist', 1]]);
  });

  it('stores the next episode, clears a finished run, and leaves unanswered titles alone', () => {
    const titles = [
      title('a', { malId: 1 }),
      title('b', { malId: 2, nextAiring: { episode: 12, at: NOW - HOUR } }),
      title('c', { anilistId: 3, nextAiring: { episode: 4, at: NOW + HOUR } }),
    ];
    const updates = planAiringUpdates(titles, [
      { anilistId: 101, malId: 1, nextEpisode: 5, nextAiringAt: NOW + 24 * HOUR },
      { anilistId: 102, malId: 2, status: 'FINISHED' },
    ]);
    expect(updates.get('a')).toEqual({ episode: 5, at: NOW + 24 * HOUR });
    expect(updates.get('b')).toBeNull();
    expect(updates.has('c')).toBe(false);
  });

  it('announces an aired episode of a watched title once, never one already watched', () => {
    const titles = [
      title('a', { nextAiring: { episode: 5, at: NOW - HOUR }, progress: 4 }),
      title('b', { nextAiring: { episode: 5, at: NOW - HOUR }, progress: 5 }),
      title('c', { nextAiring: { episode: 5, at: NOW + HOUR } }),
      title('d', { nextAiring: { episode: 2, at: NOW - HOUR }, status: 'plan' }),
    ];
    expect(airedEpisodesToAnnounce(titles, {}, NOW).map((entry) => entry.titleId)).toEqual(['a']);
    expect(airedEpisodesToAnnounce(titles, { a: 5 }, NOW)).toEqual([]);
  });

  it('puts upcoming episodes on the calendar, soonest first, within the range', () => {
    const entries = projectWatchAiringCalendar([
      title('later', { nextAiring: { episode: 3, at: NOW + 3 * 24 * HOUR } }),
      title('soon', { nextAiring: { episode: 8, at: NOW + 2 * HOUR }, status: 'plan' }),
      title('far', { nextAiring: { episode: 1, at: NOW + 40 * 24 * HOUR } }),
      title('dropped', { nextAiring: { episode: 1, at: NOW + HOUR }, status: 'dropped' }),
    ], 'week', new Date(NOW));
    expect(entries.map((entry) => [entry.titleId, entry.episode])).toEqual([['soon', 8], ['later', 3]]);
  });

  it('remembers an announcement by MAL/AniList id, so a merge survivor does not announce it again', () => {
    // Announced on the copy a dedupe merge then removed; the survivor has another id.
    const survivor = title('lb:frieren', { malId: 52991, nextAiring: { episode: 5, at: NOW - HOUR } });
    expect(airingNotifyKeys(survivor)).toEqual(['mal:52991', 'lb:frieren']);
    expect(airedEpisodesToAnnounce([survivor], { 'mal:52991': 5 }, NOW)).toEqual([]);
    expect(airedEpisodesToAnnounce([title('al', { anilistId: 7, nextAiring: { episode: 2, at: NOW - HOUR } })], { 'anilist:7': 2 }, NOW)).toEqual([]);
    // A later episode is still announced.
    expect(airedEpisodesToAnnounce([survivor], { 'mal:52991': 4 }, NOW).map((entry) => entry.episode)).toEqual([5]);
  });
});
