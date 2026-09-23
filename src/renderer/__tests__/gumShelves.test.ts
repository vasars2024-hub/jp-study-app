// @vitest-environment node
//
// What each Home section holds and which title the hero features.
import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { WatchTitleView } from '../../shared/watchLibrary';
import type { ContinueWatchingRow } from '../components/media/ContinueWatchingShelf';
import { buildGumTitles, type GumTitle } from '../components/media/gum/gumModel';
import {
  continueCards,
  genreRows,
  hasFreshImport,
  justAddedCards,
  pickHero,
  planTitles,
  titleIndex,
  upNextCards,
} from '../components/media/gum/gumShelves';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 23);

function ep(series: string, n: number, patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: `${series}-${n}`,
    title: `${series} ${n}`,
    path: `D:/${series}/${n}.mkv`,
    fileName: `${n}.mkv`,
    addedAt: NOW - 60 * DAY,
    kind: 'video',
    category: 'anime',
    seriesKey: series,
    seriesTitle: series,
    season: 1,
    episode: n,
    durationSec: 1000,
    ...patch,
  } as MediaItem;
}

function tracked(id: string, title: string, status: WatchTitleView['status'], mediaItemIds: string[], patch: Partial<WatchTitleView> = {}): WatchTitleView {
  return {
    id,
    kind: 'anime',
    title,
    status,
    watchDates: [],
    tags: [],
    lists: [],
    sources: ['mal-export'],
    addedAt: NOW - 90 * DAY,
    updatedAt: NOW,
    mediaItemIds,
    onDisk: mediaItemIds.length > 0,
    episodesOnDisk: mediaItemIds.length,
    allGenres: [],
    ...patch,
  } as WatchTitleView;
}

function titles(): GumTitle[] {
  const files = [
    ep('alpha', 1, { positionSec: 1000, lastPlayedAt: NOW - 3 * DAY }),
    ep('alpha', 2, { positionSec: 1000, lastPlayedAt: NOW - 2 * DAY }),
    ep('alpha', 3),
    ep('alpha', 4),
    ep('beta', 1, { positionSec: 400, lastPlayedAt: NOW - DAY }),
    ep('beta', 2),
    ep('gamma', 1),
    ep('gamma', 2, { addedAt: NOW - DAY }),
  ];
  return buildGumTitles([
    tracked('t:alpha', 'Alpha', 'watching', ['alpha-1', 'alpha-2', 'alpha-3', 'alpha-4'], { lastWatched: NOW - 2 * DAY, allGenres: ['Drama'] }),
    tracked('t:beta', 'Beta', 'watching', ['beta-1', 'beta-2'], { lastWatched: NOW - DAY, allGenres: ['Drama'] }),
    tracked('t:gamma', 'Gamma', 'plan', ['gamma-1', 'gamma-2'], { addedAt: NOW - 5 * DAY, allGenres: ['Drama'] }),
    tracked('t:delta', 'Delta', 'plan', [], { addedAt: NOW - 1 * DAY }),
  ], files);
}

describe('Up next', () => {
  it('offers the episode after the last watched one of each show being watched', () => {
    const cards = upNextCards(titles());
    expect(cards.map((card) => card.item.id)).toEqual(['alpha-3']);
  });

  it('leaves a show whose next episode is already started to Continue watching', () => {
    expect(upNextCards(titles()).some((card) => card.title.title === 'Beta')).toBe(false);
  });

  it('ignores titles not being watched', () => {
    expect(upNextCards(titles()).some((card) => card.title.title === 'Gamma')).toBe(false);
  });
});

describe('Just added', () => {
  it('puts announced arrivals first, one card per title, and badges a new episode of a watched show', () => {
    const cards = justAddedCards(titles(), [{ at: NOW - 60_000, itemIds: ['alpha-4'], title: 'Alpha', source: 'qbittorrent' }], NOW);
    expect(cards[0]).toMatchObject({ badge: 'newEpisode' });
    expect(cards[0].title.title).toBe('Alpha');
    // gamma-2 was added a day ago: inside the window, after the arrival.
    expect(cards.map((card) => card.title.title)).toEqual(['Alpha', 'Gamma']);
  });

  it('knows when an import is fresh enough to bring the section forward', () => {
    expect(hasFreshImport([{ at: NOW - DAY, itemIds: ['x'], title: '', source: 'watch-folder' }], NOW)).toBe(true);
    expect(hasFreshImport([{ at: NOW - 3 * DAY, itemIds: ['x'], title: '', source: 'watch-folder' }], NOW)).toBe(false);
  });
});

describe('other shelves', () => {
  it('lists Plan to watch newest first', () => {
    expect(planTitles(titles()).map((title) => title.title)).toEqual(['Delta', 'Gamma']);
  });

  it('builds a genre row only for genres with enough titles', () => {
    const rows = genreRows(titles());
    expect(rows.map((row) => row.name)).toEqual(['Drama']);
    expect(rows[0].titles).toHaveLength(3);
  });
});

describe('the hero', () => {
  const row = (item: MediaItem): ContinueWatchingRow => ({
    entry: {
      pathKey: item.path,
      localFilePath: item.path,
      title: item.title,
      fileName: item.fileName,
      positionSec: 400,
      updatedAt: NOW,
      source: 'workspace',
      cards: 0,
      lastMinedAt: 0,
    } as ContinueWatchingRow['entry'],
    item,
  });

  it('features what you are in the middle of first', () => {
    const list = titles();
    const beta1 = list.find((title) => title.title === 'Beta')?.items[0] as MediaItem;
    const hero = pickHero(continueCards([row(beta1)], titleIndex(list)), [], list);
    expect(hero).toMatchObject({ reason: 'continue' });
    expect(hero?.title?.title).toBe('Beta');
  });

  it('then a new episode of a show you are watching, then the latest arrival', () => {
    const list = titles();
    const fresh = justAddedCards(list, [{ at: NOW, itemIds: ['alpha-4'], title: 'Alpha', source: 'qbittorrent' }], NOW);
    expect(pickHero([], fresh, list)).toMatchObject({ reason: 'newEpisode' });
    const plain = justAddedCards(list, [], NOW);
    expect(pickHero([], plain, list)).toMatchObject({ reason: 'recent' });
    expect(pickHero([], plain, list)?.title?.title).toBe('Gamma');
  });

  it('has nothing to feature in an empty library', () => {
    expect(pickHero([], [], [])).toBeNull();
  });
});
