import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { inferMediaCategory, parseMediaFileName } from '../mediaFileIdentity';
import {
  buildLibraryEntries,
  episodesBySeason,
  groupingForCategory,
  isExtraRelease,
  isWatched,
  watchedFraction,
} from '../mediaLibraryEntries';

const episode = (n: number, extra: Partial<MediaItem> = {}): MediaItem => ({
  id: `bigo-${n}`,
  title: `The Big O S01E${String(n).padStart(2, '0')}`,
  fileName: `The Big O S01E${String(n).padStart(2, '0')}.mkv`,
  path: `C:/media/bigo/${n}.mkv`,
  addedAt: 1000 + n,
  category: 'anime',
  seriesKey: 'the big o',
  seriesTitle: 'The Big O',
  season: 1,
  episode: n,
  episodeKind: 'episode',
  durationSec: 1440,
  ...extra,
});

describe('grouping rules', () => {
  it('groups episodic content by series, music by album, films alone', () => {
    expect(groupingForCategory('anime')).toBe('series');
    expect(groupingForCategory('tv')).toBe('series');
    expect(groupingForCategory('music')).toBe('album');
    expect(groupingForCategory('movie')).toBe('none');
    expect(groupingForCategory('personal')).toBe('none');
  });
});

describe('buildLibraryEntries', () => {
  it('collapses a folder of episodes into one entry', () => {
    const entries = buildLibraryEntries([episode(3), episode(1), episode(2)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('The Big O');
    expect(entries[0].episodeCount).toBe(3);
    expect(entries[0].items.map((i) => i.episode)).toEqual([1, 2, 3]);
  });

  it('shelves openings, endings, OVAs and specials apart from the run', () => {
    const entries = buildLibraryEntries([
      episode(1),
      episode(2),
      episode(0, { id: 'ncop', title: 'The Big O NCOP', fileName: 'The Big O NCOP.mkv', episodeKind: 'special', episode: undefined }),
      episode(0, { id: 'ova', title: 'The Big O OVA', fileName: 'The Big O OVA.mkv', episodeKind: 'ova', episode: undefined }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].episodeCount).toBe(2);
    expect(entries[0].extras.map((i) => i.id).sort()).toEqual(['ncop', 'ova']);
  });

  it('keeps an OVA-only folder as a real entry instead of an empty card', () => {
    const entries = buildLibraryEntries([
      episode(1, { id: 'o1', episodeKind: 'ova' }),
      episode(2, { id: 'o2', episodeKind: 'ova' }),
    ]);
    expect(entries[0].episodeCount).toBe(2);
    expect(entries[0].extras).toHaveLength(0);
  });

  it('never fuses files that have no parsed series', () => {
    const loose = (id: string): MediaItem => ({
      id, title: id, fileName: `${id}.mkv`, path: `C:/x/${id}.mkv`, addedAt: 1, category: 'personal',
    });
    expect(buildLibraryEntries([loose('a'), loose('b')])).toHaveLength(2);
  });

  it('groups music by artist and album', () => {
    const track = (id: string, album: string, file: string): MediaItem => ({
      id, title: id, fileName: file, path: `C:/m/${file}`, addedAt: 1,
      kind: 'audio', category: 'music', artist: 'Yoko Kanno', album,
    });
    const entries = buildLibraryEntries([
      track('b', 'Cowboy Bebop', '02 - Rush.flac'),
      track('a', 'Cowboy Bebop', '01 - Tank.flac'),
      track('c', 'Escaflowne', '01 - Dance.flac'),
    ]);
    expect(entries).toHaveLength(2);
    const bebop = entries.find((e) => e.title === 'Cowboy Bebop');
    expect(bebop?.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('picks the first unfinished episode as the primary', () => {
    const entries = buildLibraryEntries([
      episode(1, { positionSec: 1430 }), // finished
      episode(2, { positionSec: 700 }),  // half watched
      episode(3),
    ]);
    expect(entries[0].primary.id).toBe('bigo-2');
    expect(entries[0].watchedCount).toBe(1);
  });

  it('falls back to the most recently played when everything is finished', () => {
    const entries = buildLibraryEntries([
      episode(1, { positionSec: 1430, lastPlayedAt: 10 }),
      episode(2, { positionSec: 1430, lastPlayedAt: 99 }),
    ]);
    expect(entries[0].primary.id).toBe('bigo-2');
  });

  it('rolls favorite and study-queue state up to the entry', () => {
    const entries = buildLibraryEntries([episode(1), episode(2, { studyQueue: true })]);
    expect(entries[0].studyQueue).toBe(true);
    expect(entries[0].favorite).toBe(false);
  });

  it('is deterministic regardless of input order', () => {
    const build = (): MediaItem[] => [episode(2), episode(1), episode(3)];
    const a = buildLibraryEntries(build());
    const b = buildLibraryEntries(build().reverse());
    expect(a[0].items.map((i) => i.id)).toEqual(b[0].items.map((i) => i.id));
    expect(a[0].primary.id).toBe(b[0].primary.id);
  });
});

describe('acceptance: a real fansub folder', () => {
  /** Exactly what `addOrGetItem` stamps onto an item on import. */
  const imported = (fileName: string, id: string): MediaItem => {
    const parsed = parseMediaFileName(fileName);
    const base: MediaItem = {
      id,
      title: fileName.replace(/\s*\[.*$/, '').trim(),
      path: `C:/Downloads/The Big O [BDRip 1440x1080 x265 FLAC]/${fileName}`,
      fileName,
      addedAt: 1,
      kind: 'video',
      durationSec: 1425,
    };
    return {
      ...base,
      seriesKey: parsed.titleKey || undefined,
      seriesTitle: parsed.title || undefined,
      season: parsed.season ?? undefined,
      episode: parsed.episode ?? undefined,
      episodeKind: parsed.kind,
      category: inferMediaCategory(base, parsed),
    };
  };

  const folder = [
    'The Big O - 01 [BDRip 1440x1080 x265 FLAC].mkv',
    'The Big O - 02 [BDRip 1440x1080 x265 FLAC].mkv',
    'The Big O - 07 [BDRip 1440x1080 x265 FLAC].mkv',
    'The Big O - Creditless Opening [BDRip 1440x1080 x265 FLAC].mkv',
  ].map((name, index) => imported(name, `big-o-${index}`));

  it('classifies episodes out of `inbox` so they can group at all', () => {
    // The regression this guards: `mediaCategory`'s keyword pass cannot see an
    // episode in this name, everything lands in `inbox`, `inbox` does not group,
    // and the library renders one card per file instead of one per title.
    for (const item of folder) expect(item.category).not.toBe('inbox');
  });

  it('collapses the folder into a single title', () => {
    const entries = buildLibraryEntries(folder);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('The Big O');
    expect(entries[0].grouping).toBe('series');
  });

  it('numbers the episodes and shelves the creditless opening as an extra', () => {
    const [entry] = buildLibraryEntries(folder);
    expect(entry.items.map((i) => i.episode)).toEqual([1, 2, 7]);
    expect(entry.extras.map((i) => i.fileName)).toEqual([
      'The Big O - Creditless Opening [BDRip 1440x1080 x265 FLAC].mkv',
    ]);
  });
});

describe('episodesBySeason', () => {
  it('splits by season and treats an unnumbered flat folder as season 1', () => {
    const entries = buildLibraryEntries([
      episode(1),
      episode(1, { id: 's2e1', season: 2, fileName: 'The Big O S02E01.mkv' }),
      episode(5, { id: 'flat', season: undefined, fileName: 'The Big O - 05.mkv' }),
    ]);
    const seasons = episodesBySeason(entries[0]);
    expect(seasons.map((s) => s.season)).toEqual([1, 2]);
    expect(seasons[0].items.map((i) => i.id)).toContain('flat');
  });
});

describe('watched helpers', () => {
  it('reports a fraction only when both position and duration are known', () => {
    expect(watchedFraction(episode(1, { positionSec: 720 }))).toBe(0.5);
    expect(watchedFraction(episode(1, { durationSec: undefined, positionSec: 10 }))).toBeNull();
    expect(watchedFraction(episode(1))).toBeNull();
  });

  it('treats the credits tail as watched', () => {
    expect(isWatched(episode(1, { positionSec: 1400 }))).toBe(true);
    expect(isWatched(episode(1, { positionSec: 700 }))).toBe(false);
  });

  it('classifies extras by release kind', () => {
    expect(isExtraRelease(episode(1, { episodeKind: 'special' }))).toBe(true);
    expect(isExtraRelease(episode(1, { episodeKind: 'ova' }))).toBe(true);
    expect(isExtraRelease(episode(1, { episodeKind: 'episode' }))).toBe(false);
    expect(isExtraRelease(episode(1, { episodeKind: 'unknown' }))).toBe(false);
  });
});
