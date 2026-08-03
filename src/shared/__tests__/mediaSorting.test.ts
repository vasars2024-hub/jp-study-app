import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { MEDIA_CATEGORIES } from '../mediaCategories';
import {
  MEDIA_SORTS,
  defaultSortForCategory,
  isMediaSortId,
  resolveSortForCategory,
  seriesLabel,
  sortMediaItems,
  sortOptionsForCategory,
} from '../mediaSorting';

const item = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  title: id,
  fileName: `${id}.mkv`,
  path: `C:/media/${id}.mkv`,
  addedAt: 0,
  ...extra,
});

const ids = (items: readonly MediaItem[]): string[] => items.map((i) => i.id);

describe('sort option catalogue', () => {
  it('offers a non-empty, known-id menu for every category', () => {
    for (const category of MEDIA_CATEGORIES) {
      const options = sortOptionsForCategory(category);
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) expect(isMediaSortId(option)).toBe(true);
      expect(new Set(options).size).toBe(options.length);
    }
  });

  it('keeps type-inappropriate sorts out of the menu', () => {
    expect(sortOptionsForCategory('anime')).toContain('season-episode');
    expect(sortOptionsForCategory('anime')).not.toContain('track');
    expect(sortOptionsForCategory('music')).toContain('track');
    expect(sortOptionsForCategory('music')).not.toContain('season-episode');
    expect(sortOptionsForCategory('audiobook')).toContain('author');
    expect(sortOptionsForCategory('movie')).not.toContain('author');
  });

  it('offers no sort the app cannot populate', () => {
    // A menu entry that orders everything identically is worse than a missing
    // one: it looks like the sort ran and did nothing. `narrator` has no source
    // anywhere in the app, so it must not be offered until one exists.
    for (const category of MEDIA_CATEGORIES) {
      expect(sortOptionsForCategory(category)).not.toContain('narrator');
    }
  });

  it('defaults to the first option and narrows a foreign persisted value', () => {
    expect(defaultSortForCategory('anime')).toBe('series');
    expect(resolveSortForCategory('track', 'anime')).toBe('series');
    expect(resolveSortForCategory('season-episode', 'anime')).toBe('season-episode');
    expect(resolveSortForCategory('nonsense', 'music')).toBe('artist');
    expect(resolveSortForCategory(null, 'music')).toBe('artist');
  });

  it('declares a label key and default direction for every sort', () => {
    for (const [id, option] of Object.entries(MEDIA_SORTS)) {
      expect(option.id).toBe(id);
      expect(option.labelKey.startsWith('media.sort.')).toBe(true);
      expect(['asc', 'desc']).toContain(option.defaultDirection);
    }
  });
});

describe('sortMediaItems', () => {
  it('does not mutate the input array', () => {
    const input = [item('b'), item('a')];
    const snapshot = ids(input);
    sortMediaItems(input, 'title');
    expect(ids(input)).toEqual(snapshot);
  });

  it('orders episodes by season then episode', () => {
    const items = [
      item('s2e1', { season: 2, episode: 1 }),
      item('s1e10', { season: 1, episode: 10 }),
      item('s1e2', { season: 1, episode: 2 }),
    ];
    expect(ids(sortMediaItems(items, 'season-episode', 'asc'))).toEqual(['s1e2', 's1e10', 's2e1']);
    expect(ids(sortMediaItems(items, 'season-episode', 'desc'))).toEqual(['s2e1', 's1e10', 's1e2']);
  });

  it('groups by series before episode order', () => {
    const items = [
      item('bigo-2', { seriesTitle: 'The Big O', season: 1, episode: 2 }),
      item('frieren-1', { seriesTitle: 'Frieren', season: 1, episode: 1 }),
      item('bigo-1', { seriesTitle: 'The Big O', season: 1, episode: 1 }),
    ];
    expect(ids(sortMediaItems(items, 'series', 'asc'))).toEqual(['frieren-1', 'bigo-1', 'bigo-2']);
  });

  it('keeps items with no value last in BOTH directions', () => {
    const items = [item('none'), item('y2000', { year: 2000 }), item('y2010', { year: 2010 })];
    expect(ids(sortMediaItems(items, 'release-year', 'asc'))).toEqual(['y2000', 'y2010', 'none']);
    expect(ids(sortMediaItems(items, 'release-year', 'desc'))).toEqual(['y2010', 'y2000', 'none']);
  });

  it('sorts by watched fraction, not by raw position', () => {
    const items = [
      item('half', { positionSec: 50, durationSec: 100 }),
      item('nearly', { positionSec: 90, durationSec: 100 }),
      // A larger absolute position but a smaller fraction.
      item('barely', { positionSec: 60, durationSec: 6000 }),
      item('unplayed', { durationSec: 100 }),
    ];
    expect(ids(sortMediaItems(items, 'progress', 'desc'))).toEqual([
      'nearly', 'half', 'barely', 'unplayed',
    ]);
  });

  it('reads disc/track numbering out of the file name', () => {
    const items = [
      item('t3', { fileName: '03 - Third.flac', album: 'A' }),
      item('t1', { fileName: '01 - First.flac', album: 'A' }),
      item('d2t1', { fileName: '2-01 - Disc two.flac', album: 'A' }),
      item('t10', { fileName: '10 - Tenth.flac', album: 'A' }),
    ];
    expect(ids(sortMediaItems(items, 'track', 'asc'))).toEqual(['t1', 't3', 't10', 'd2t1']);
  });

  it('chains artist then album then track', () => {
    const items = [
      item('b1', { artist: 'Beta', album: 'X', fileName: '01 a.flac' }),
      item('a2', { artist: 'Alpha', album: 'Z', fileName: '01 a.flac' }),
      item('a1b', { artist: 'Alpha', album: 'Y', fileName: '02 b.flac' }),
      item('a1a', { artist: 'Alpha', album: 'Y', fileName: '01 a.flac' }),
    ];
    expect(ids(sortMediaItems(items, 'artist', 'asc'))).toEqual(['a1a', 'a1b', 'a2', 'b1']);
  });

  it('falls back from air date to release year', () => {
    const items = [
      item('aired', { airedAt: Date.UTC(1999, 5, 1) }),
      item('year', { year: 1999 }),
      item('later', { year: 2005 }),
    ];
    // year 1999 -> Jan 1 1999, which precedes the June 1999 air date.
    expect(ids(sortMediaItems(items, 'air-date', 'asc'))).toEqual(['year', 'aired', 'later']);
  });

  it('sorts titles naturally so 10 follows 9', () => {
    const items = [item('c', { title: 'Ep 10' }), item('a', { title: 'Ep 2' }), item('b', { title: 'Ep 9' })];
    expect(ids(sortMediaItems(items, 'title', 'asc'))).toEqual(['a', 'b', 'c']);
  });

  it('groups by folder', () => {
    const items = [
      item('z', { fileName: 'Season 2/ep1.mkv' }),
      item('a', { fileName: 'Season 1/ep2.mkv' }),
      item('b', { fileName: 'Season 1/ep1.mkv' }),
    ];
    expect(ids(sortMediaItems(items, 'folder', 'asc'))).toEqual(['b', 'a', 'z']);
  });

  it('preserves the caller order for the custom sort', () => {
    const items = [item('c'), item('a'), item('b')];
    expect(ids(sortMediaItems(items, 'custom'))).toEqual(['c', 'a', 'b']);
  });

  it('is independent of input order', () => {
    const build = (): MediaItem[] => [
      item('a', { year: 2000 }),
      item('b', { year: 2000 }),
      item('c', { year: 1990 }),
    ];
    const forward = ids(sortMediaItems(build(), 'release-year', 'asc'));
    const reversed = ids(sortMediaItems(build().reverse(), 'release-year', 'asc'));
    expect(forward).toEqual(reversed);
  });
});

describe('seriesLabel', () => {
  it('prefers the parsed series title, then the display title, then the file name', () => {
    expect(seriesLabel(item('x', { seriesTitle: 'The Big O', title: 'The Big O S01E01' }))).toBe('The Big O');
    expect(seriesLabel(item('x', { title: 'Solo Film' }))).toBe('Solo Film');
    expect(seriesLabel(item('x', { title: '   ', fileName: 'raw name.mkv' }))).toBe('raw name.mkv');
  });
});
