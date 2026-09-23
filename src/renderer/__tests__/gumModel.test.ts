// @vitest-environment node
//
// The media library's view model: how tracked titles and loose files become one list,
// and how every filter, sort and chip behaves over it. Pure, so it is tested directly.
import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { WatchTitleView } from '../../shared/watchLibrary';
import {
  activeFilterChips,
  buildGumTitles,
  compareGumTitles,
  compactFilters,
  countByStatus,
  filterGumTitles,
  gumEpisodeLabel,
  gumFacets,
  hasGumFilters,
  matchesType,
  nextEpisodeOf,
  removeFilterChip,
  sortGumTitles,
  toggleFilterValue,
  type GumFilters,
  type GumTitle,
} from '../components/media/gum/gumModel';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 23);

function item(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    title: id,
    path: `D:/media/${id}.mkv`,
    fileName: `${id}.mkv`,
    addedAt: NOW - 30 * DAY,
    kind: 'video',
    ...patch,
  } as MediaItem;
}

function view(id: string, patch: Partial<WatchTitleView> = {}): WatchTitleView {
  return {
    id,
    kind: 'anime',
    title: id,
    status: 'plan',
    watchDates: [],
    tags: [],
    lists: [],
    sources: ['mal-export'],
    addedAt: NOW - 100 * DAY,
    updatedAt: NOW - 100 * DAY,
    mediaItemIds: [],
    onDisk: false,
    episodesOnDisk: 0,
    allGenres: [],
    ...patch,
  } as WatchTitleView;
}

/** A small library: two tracked anime, a Letterboxd film, and a loose TV series on disk. */
function library(): GumTitle[] {
  const files = [
    item('frieren-01', { seriesKey: 'frieren', seriesTitle: 'Frieren', category: 'anime', season: 1, episode: 1, durationSec: 1440, positionSec: 1440, lastPlayedAt: NOW - 2 * DAY, subtitles: [{ id: 's1', lang: 'ja' } as never] }),
    item('frieren-02', { seriesKey: 'frieren', seriesTitle: 'Frieren', category: 'anime', season: 1, episode: 2, durationSec: 1440, positionSec: 300, lastPlayedAt: NOW - DAY }),
    item('frieren-03', { seriesKey: 'frieren', seriesTitle: 'Frieren', category: 'anime', season: 1, episode: 3, durationSec: 1440 }),
    item('diner-01', { seriesKey: 'diner', seriesTitle: 'Midnight Diner', category: 'tv', season: 1, episode: 1, durationSec: 1440, addedAt: NOW - 2 * DAY, subtitles: [{ id: 's2', lang: 'en' } as never] }),
    item('diner-02', { seriesKey: 'diner', seriesTitle: 'Midnight Diner', category: 'tv', season: 1, episode: 2, durationSec: 1440, addedAt: NOW - 2 * DAY }),
    item('song', { kind: 'audio', category: 'music' }),
  ];
  const views = [
    view('mal:1', {
      title: 'Frieren', originalTitle: '葬送のフリーレン', status: 'watching', score: 9, episodeCount: 28, progress: 1,
      progressRatio: 1 / 28, allGenres: ['Fantasy', 'Adventure'], mediaItemIds: ['frieren-01', 'frieren-02', 'frieren-03'],
      onDisk: true, year: 2023, lists: ['Favourites 2023'], lastWatched: NOW - DAY,
    }),
    view('mal:2', { title: 'Mushishi', status: 'completed', score: 10, episodeCount: 26, progress: 26, progressRatio: 1, allGenres: ['Mystery'], year: 2005, finishedAt: '2024-05-02' }),
    view('lb:1', { title: 'Perfect Days', kind: 'film', status: 'plan', sources: ['letterboxd'], year: 2023, stars: 4.5, score: 9, runtime: 124, allGenres: ['Drama'] }),
  ];
  return buildGumTitles(views, files);
}

const byTitle = (titles: GumTitle[], name: string): GumTitle => {
  const found = titles.find((title) => title.title === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe('buildGumTitles', () => {
  it('joins tracked titles with their files and turns loose files into untracked titles', () => {
    const titles = library();
    expect(titles.map((title) => title.title).sort()).toEqual(['Frieren', 'Midnight Diner', 'Mushishi', 'Perfect Days']);
    const frieren = byTitle(titles, 'Frieren');
    expect(frieren.tracked).toBe(true);
    expect(frieren.items.map((file) => file.id)).toEqual(['frieren-01', 'frieren-02', 'frieren-03']);
    expect(frieren.onDisk).toBe(true);
    expect(frieren.hasJa).toBe(true);
    expect(frieren.language).toBe('ja');
    expect(frieren.inProgressItem?.id).toBe('frieren-02');
    expect(frieren.watchState).toBe('progress');
  });

  it('never puts a file in two titles, and leaves audio to Music', () => {
    const titles = library();
    const ids = titles.flatMap((title) => title.items.map((file) => file.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('song');
  });

  it('derives an untracked title status from its files', () => {
    const diner = byTitle(library(), 'Midnight Diner');
    expect(diner.tracked).toBe(false);
    expect(diner.watchId).toBeNull();
    expect(diner.id.startsWith('local:')).toBe(true);
    expect(diner.status).toBeNull();
    expect(diner.sources).toEqual(['files']);
    expect(diner.kind).toBe('tv');
    expect(diner.hasEn).toBe(true);
  });

  it('keeps a tracked title with no files as not downloaded', () => {
    const film = byTitle(library(), 'Perfect Days');
    expect(film.onDisk).toBe(false);
    expect(film.stars).toBe(4.5);
    expect(film.runtimeMin).toBe(124);
    expect(film.totalRuntimeMin).toBe(124);
  });
});

describe('filters', () => {
  const query = (filters: GumFilters, extra: Partial<Parameters<typeof filterGumTitles>[1]> = {}) =>
    filterGumTitles(library(), { status: 'all', type: 'all', filters, ...extra }, NOW).map((title) => title.title).sort();

  it('filters by status tab, with watching including rewatching', () => {
    expect(query({}, { status: 'watching' })).toEqual(['Frieren']);
    expect(query({}, { status: 'completed' })).toEqual(['Mushishi']);
  });

  it('filters by type: anime, TV and films', () => {
    expect(query({}, { type: 'anime' })).toEqual(['Frieren', 'Mushishi']);
    expect(query({}, { type: 'tv' })).toEqual(['Midnight Diner']);
    expect(query({}, { type: 'film' })).toEqual(['Perfect Days']);
  });

  it('treats an anime film as anime and as a film', () => {
    const [title] = buildGumTitles([view('mal:9', { kind: 'film', anime: true, title: 'Your Name.' })], []);
    expect(matchesType(title, 'anime')).toBe(true);
    expect(matchesType(title, 'film')).toBe(true);
    expect(matchesType(title, 'tv')).toBe(false);
  });

  it('searches every name, folded', () => {
    expect(query({}, { search: 'FRIEREN' })).toEqual(['Frieren']);
    expect(query({}, { search: 'フリーレン' })).toEqual(['Frieren']);
    expect(query({}, { search: 'nothing like this' })).toEqual([]);
  });

  it('combines genre (any-of), year range and rating', () => {
    expect(query({ genres: ['fantasy', 'Drama'] })).toEqual(['Frieren', 'Perfect Days']);
    expect(query({ genres: ['fantasy', 'Drama'], yearMin: 2020 })).toEqual(['Frieren', 'Perfect Days']);
    expect(query({ yearMin: 2000, yearMax: 2009 })).toEqual(['Mushishi']);
    expect(query({ scoreMin: 10 })).toEqual(['Mushishi']);
  });

  it('"not rated" keeps only titles without a score, overriding a range', () => {
    expect(query({ unrated: true, scoreMin: 9 })).toEqual(['Midnight Diner']);
  });

  it('separates on this PC from not downloaded', () => {
    expect(query({ onDisk: true })).toEqual(['Frieren', 'Midnight Diner']);
    expect(query({ onDisk: false })).toEqual(['Mushishi', 'Perfect Days']);
  });

  it('filters by source, watched state, subtitles, lists and date added', () => {
    expect(query({ sources: ['files'] })).toEqual(['Midnight Diner']);
    expect(query({ sources: ['letterboxd'] })).toEqual(['Perfect Days']);
    expect(query({ watch: ['finished'] })).toEqual(['Mushishi']);
    expect(query({ watch: ['unwatched'] })).toEqual(['Midnight Diner', 'Perfect Days']);
    expect(query({ subsJa: true })).toEqual(['Frieren']);
    expect(query({ subsEn: true })).toEqual(['Midnight Diner']);
    expect(query({ lists: ['favourites 2023'] })).toEqual(['Frieren']);
    expect(query({ added: '7d' })).toEqual(['Midnight Diner']);
  });

  it('filters by runtime and episode-count buckets', () => {
    expect(query({ runtime: ['feature'] })).toEqual(['Perfect Days']);
    expect(query({ runtime: ['short'] })).toEqual(['Frieren', 'Midnight Diner']);
    expect(query({ episodes: ['long'] })).toEqual(['Frieren']);
    expect(query({ episodes: ['season'] })).toEqual(['Mushishi']);
  });

  it('counts each status tab under the current type', () => {
    const counts = countByStatus(library(), 'anime');
    expect(counts).toMatchObject({ all: 2, watching: 1, completed: 1, plan: 0 });
    expect(countByStatus(library(), 'all').all).toBe(4);
  });
});

describe('sorting', () => {
  it('puts titles with no value last in both directions', () => {
    const titles = library();
    const asc = sortGumTitles(titles, 'score', 'asc').map((title) => title.title);
    const desc = sortGumTitles(titles, 'score', 'desc').map((title) => title.title);
    expect(asc[asc.length - 1]).toBe('Midnight Diner');
    expect(desc[desc.length - 1]).toBe('Midnight Diner');
    expect(desc[0]).toBe('Mushishi');
  });

  it('is total: ties fall back to the title, then the id', () => {
    const [a, b] = buildGumTitles([view('x:2', { title: 'Same' }), view('x:1', { title: 'Same' })], []);
    expect(compareGumTitles(a, b, 'year', 'asc')).toBeGreaterThan(0);
    expect(compareGumTitles(b, a, 'year', 'asc')).toBeLessThan(0);
  });

  it('sorts by every key without throwing', () => {
    for (const key of ['title', 'year', 'score', 'provider', 'added', 'lastWatched', 'finished', 'progress', 'runtime', 'episodes'] as const) {
      expect(sortGumTitles(library(), key, 'desc')).toHaveLength(4);
    }
  });
});

describe('active filter chips', () => {
  it('lists one chip per constraint and removes exactly that one', () => {
    const filters: GumFilters = { genres: ['Fantasy', 'Drama'], yearMin: 2000, onDisk: false, watch: ['progress'], added: '30d' };
    const chips = activeFilterChips(filters);
    expect(chips.map((chip) => chip.id)).toEqual(['genre:Fantasy', 'genre:Drama', 'year', 'onDisk', 'watch:progress', 'added']);
    // A genre name is shown as-is, never through the catalogue.
    expect(chips[0]).toMatchObject({ label: 'Fantasy' });
    expect(chips[0].key).toBeUndefined();
    expect(removeFilterChip(filters, 'genre:Fantasy').genres).toEqual(['Drama']);
    expect(removeFilterChip(filters, 'year')).not.toHaveProperty('yearMin');
    expect(removeFilterChip(filters, 'onDisk')).not.toHaveProperty('onDisk');
    expect(removeFilterChip(filters, 'watch:progress')).not.toHaveProperty('watch');
  });

  it('ignores an unknown chip id', () => {
    const filters: GumFilters = { liked: true };
    expect(removeFilterChip(filters, 'bogus')).toBe(filters);
  });

  it('keeps "no filters" as exactly {}', () => {
    expect(compactFilters({ genres: [], onDisk: undefined })).toEqual({});
    expect(hasGumFilters({ genres: [] })).toBe(false);
    expect(hasGumFilters({ subsJa: false })).toBe(true);
  });

  it('toggles a value in a multi-select', () => {
    const on = toggleFilterValue({}, 'runtime', 'short');
    expect(on).toEqual({ runtime: ['short'] });
    expect(toggleFilterValue(on, 'runtime', 'short')).toEqual({});
  });
});

describe('facets and episodes', () => {
  it('counts genres and lists over the whole library', () => {
    const facets = gumFacets(library());
    expect(facets.genres.find((genre) => genre.name === 'Fantasy')?.count).toBe(1);
    expect(facets.lists).toEqual([{ name: 'Favourites 2023', count: 1 }]);
    expect(facets.years).toEqual({ min: 2005, max: 2023 });
  });

  it('plays the in-progress episode first, else the first unwatched', () => {
    const titles = library();
    expect(nextEpisodeOf(byTitle(titles, 'Frieren'))?.id).toBe('frieren-02');
    expect(nextEpisodeOf(byTitle(titles, 'Midnight Diner'))?.id).toBe('diner-01');
  });

  it('labels episodes compactly', () => {
    expect(gumEpisodeLabel(item('a', { season: 1, episode: 3 }))).toBe('E3');
    expect(gumEpisodeLabel(item('a', { season: 2, episode: 4 }))).toBe('S2 · E4');
    expect(gumEpisodeLabel(item('a'))).toBeNull();
  });
});
