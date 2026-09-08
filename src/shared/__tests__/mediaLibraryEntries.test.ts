import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { inferMediaCategory, parseMediaFileName } from '../mediaFileIdentity';
import {
  buildLibraryEntries,
  episodesBySeason,
  groupingForCategory,
  isContinueWatching,
  isExtraRelease,
  isWatched,
  MEDIA_LIBRARY_STORE_FILE,
  mediaItemsFromStoredDocument,
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

describe('persisted media library contract', () => {
  it('names the same userData document the main process owns', () => {
    expect(MEDIA_LIBRARY_STORE_FILE).toBe('media.json');
  });

  it('reads the live object shape without mistaking it for an empty library', () => {
    const items = [episode(1), episode(2)];
    expect(mediaItemsFromStoredDocument({ items, relationships: [] })).toEqual(items);
  });

  it('accepts the legacy array and refuses malformed collection shapes', () => {
    const items = [episode(1)];
    expect(mediaItemsFromStoredDocument(items)).toEqual(items);
    expect(mediaItemsFromStoredDocument({ items: 'not-an-array' })).toEqual([]);
    expect(mediaItemsFromStoredDocument(null)).toEqual([]);
  });
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

  /**
   * D316, reproducing the user's own library exactly: The Big O is 26 episodes plus 3
   * specials, Japanese subtitles reach episodes 1-13 and stop, and episode 1 is the primary.
   * `hasJapaneseSubtitles` therefore read true and the card said "ready" for all 26.
   */
  it('counts Japanese across the run, not just the episode a click would open', () => {
    const ja = { lang: 'ja', source: 'test', path: 'x.srt' } as never;
    const entries = buildLibraryEntries(
      Array.from({ length: 26 }, (_, i) =>
        episode(i + 1, i < 13 ? { subtitles: [ja] } : {}),
      ),
    );
    expect(entries[0].episodeCount).toBe(26);
    // The primary is episode 1, which HAS Japanese — that is the whole trap.
    expect(entries[0].hasJapaneseSubtitles).toBe(true);
    expect(entries[0].japaneseSubtitleCount).toBe(13);
  });

  it('CONTROL: a fully covered run counts every episode, so it can still read ready', () => {
    const ja = { lang: 'ja', source: 'test', path: 'x.srt' } as never;
    const entries = buildLibraryEntries(
      Array.from({ length: 5 }, (_, i) => episode(i + 1, { subtitles: [ja] })),
    );
    expect(entries[0].japaneseSubtitleCount).toBe(entries[0].episodeCount);
  });

  it('counts over the same set episodeCount reports, so specials cannot skew the fraction', () => {
    // If the count walked `ordered` instead of `items`, a covered special would push the
    // numerator past a denominator that excludes it — 3 of 2.
    const ja = { lang: 'ja', source: 'test', path: 'x.srt' } as never;
    const entries = buildLibraryEntries([
      episode(1, { subtitles: [ja] }),
      episode(2, { subtitles: [ja] }),
      episode(0, { episodeKind: 'special', title: 'The Big O Opening', subtitles: [ja] }),
    ]);
    expect(entries[0].episodeCount).toBe(2);
    expect(entries[0].japaneseSubtitleCount).toBeLessThanOrEqual(entries[0].episodeCount);
    expect(entries[0].japaneseSubtitleCount).toBe(2);
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

// D269. `MediaLibrarySidebar` counted the Continue watching shelf with its own
// inline rule — position past 0, and short of the last five seconds — while
// `MediaLibraryShell` built the shelf itself from `!isWatched`, i.e. 92%. The
// two agreed on every item in the user's library at the time (4 and 4), which is
// exactly why a divergence like this survives: it only shows on the band between
// them, and then the badge counts a row the list does not contain.
describe('isContinueWatching — one predicate for the shelf and its badge', () => {
  // `episode()` fixes durationSec at 1440; 0.92 of that is 1324.8.

  it('excludes the 92%-to-nearly-over band that the old badge counted', () => {
    // 1382 s of 1440 is 96%: past the watched threshold, and still 58 s short of
    // the five-second tail the badge used. This is the whole defect.
    expect(isContinueWatching(episode(1, { positionSec: 1382 }))).toBe(false);
    // Just past it. NOT written as `DURATION * 0.92` — that lands on
    // 1324.7999999999997, i.e. a hair UNDER the threshold, so the assertion
    // would have been measuring float noise rather than the rule.
    expect(isContinueWatching(episode(1, { positionSec: 1325 }))).toBe(false);
  });

  it('still includes a part-watched episode', () => {
    // The discriminating positive: "always false" would pass the case above and
    // empty the shelf entirely.
    expect(isContinueWatching(episode(1, { positionSec: 720 }))).toBe(true);
    expect(isContinueWatching(episode(1, { positionSec: 1324 }))).toBe(true);
  });

  it('excludes an untouched item', () => {
    expect(isContinueWatching(episode(1))).toBe(false);
    expect(isContinueWatching(episode(1, { positionSec: 0 }))).toBe(false);
  });

  it('includes a started item whose duration is unknown', () => {
    // No duration means no fraction, so nothing can call it watched — and a
    // rule that dropped it would hide every item the prober never measured.
    expect(isContinueWatching(episode(1, { durationSec: undefined, positionSec: 30 }))).toBe(true);
  });
});
