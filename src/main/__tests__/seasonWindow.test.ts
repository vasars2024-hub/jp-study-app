// Season arithmetic behind the Discover "This season" shelf.
//
// These two functions exist because of a real wrong answer: on 2026-07-27 the
// shelf was full of Summer *2025* titles. Jikan was returning 504 for every
// MyAnimeList feed, the AniList fallback's Summer 2026 query had come back empty
// once during an outage, that empty page got cached under the month-long
// work-metadata TTL, and the old fallback answered by jumping a whole year back
// and saying nothing about it.
//
// The cache half of that fix lives in `mediaProviderClients`; this covers the
// arithmetic half — that "the season before this one" is one step, not one year.

import { describe, expect, it } from 'vitest';
import { previousSeason, seasonForMonth } from '../mediaProviderClients';

describe('seasonForMonth', () => {
  it('maps each quarter to its broadcast season', () => {
    expect([1, 2, 3].map(seasonForMonth)).toEqual(['WINTER', 'WINTER', 'WINTER']);
    expect([4, 5, 6].map(seasonForMonth)).toEqual(['SPRING', 'SPRING', 'SPRING']);
    expect([7, 8, 9].map(seasonForMonth)).toEqual(['SUMMER', 'SUMMER', 'SUMMER']);
    expect([10, 11, 12].map(seasonForMonth)).toEqual(['FALL', 'FALL', 'FALL']);
  });

  it('clamps rather than returning undefined for an out-of-range month', () => {
    expect(seasonForMonth(0)).toBe('WINTER');
    expect(seasonForMonth(13)).toBe('FALL');
  });

  it('puts the date that produced the bug in Summer 2026', () => {
    const reportedAt = new Date('2026-07-27T00:00:00Z');
    expect(seasonForMonth(reportedAt.getUTCMonth() + 1)).toBe('SUMMER');
  });
});

describe('previousSeason', () => {
  it('steps back one season inside the same year', () => {
    expect(previousSeason('SUMMER', 2026)).toEqual({ season: 'SPRING', year: 2026 });
    expect(previousSeason('FALL', 2026)).toEqual({ season: 'SUMMER', year: 2026 });
    expect(previousSeason('SPRING', 2026)).toEqual({ season: 'WINTER', year: 2026 });
  });

  it('wraps to the previous year only at WINTER', () => {
    expect(previousSeason('WINTER', 2026)).toEqual({ season: 'FALL', year: 2025 });
  });

  it('never lands a whole year back in one step — the old fallback\'s mistake', () => {
    // Summer 2026 must not resolve to Summer 2025, which is what the shelf showed.
    const once = previousSeason('SUMMER', 2026);
    expect(once).not.toEqual({ season: 'SUMMER', year: 2025 });
    // Even walking the full retry budget stays within a year of the request.
    let cursor = { season: 'SUMMER' as const, year: 2026 };
    const walked: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      cursor = previousSeason(cursor.season, cursor.year);
      walked.push(`${cursor.season}:${cursor.year}`);
    }
    expect(walked).toEqual(['SPRING:2026', 'WINTER:2026', 'FALL:2025']);
  });
});
