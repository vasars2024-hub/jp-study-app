/**
 * MAL/AniList seasons against release numbering: a season-2 entry's episode 5
 * is `S2 - 05`, `2nd Season - 05`, `S02E05`, or `- 30` after a 25-episode first
 * season — and never `S01E05`.
 */
import { describe, expect, it } from 'vitest';
import {
  batchRangeCoversUnit,
  inferSeasonNumber,
  mapSeasonEpisodes,
  planMalReleases,
  releaseCoversEpisode,
  releaseCoversUnit,
  releaseSeasonNumber,
  withSeasonNumbers,
  type MalDownloadUnit,
  type MalRelease,
} from '../malDownload';

const unit = (number: number, extra: Partial<MalDownloadUnit> = {}): MalDownloadUnit => ({
  key: `ep-${number}`, ordinal: number - 1, number, label: `EP ${number}`, title: '', nativeTitle: '',
  airDate: null, filler: false, recap: false, source: null, ...extra,
});

const release = (name: string, seeders = 10): MalRelease => ({
  id: name, infoHash: '', name, releaseGroup: '', resolution: '1080p', seeders, leechers: 0, availability: 0,
  tracker: '', sizeBytes: 1, ageDays: 1, fileCount: 1, subtitleLanguages: [], isBatch: /\d+\s*[-~]\s*\d+/.test(name), magnet: '',
} as MalRelease);

describe('the season a title names', () => {
  it('reads the common spellings', () => {
    expect(inferSeasonNumber('Spy x Family Season 2')).toBe(2);
    expect(inferSeasonNumber('Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen 2nd Season')).toBe(2);
    expect(inferSeasonNumber('Mushoku Tensei II: Isekai Ittara Honki Dasu')).toBeNull(); // a subtitle follows the numeral
    expect(inferSeasonNumber('Oshi no Ko 2nd Season', '【推しの子】第2期')).toBe(2);
    expect(inferSeasonNumber('', '進撃の巨人 第三期')).toBe(3);
    expect(inferSeasonNumber('Overlord III')).toBe(3);
    expect(inferSeasonNumber('Frieren')).toBeNull();
    // "Part 2" and "Final Season" are not season numbers.
    expect(inferSeasonNumber('Shingeki no Kyojin: The Final Season Part 2')).toBeNull();
    expect(inferSeasonNumber('Bungou Stray Dogs Part II')).toBeNull();
  });

  it('reads the season a release names, ignoring CRC and resolution tags', () => {
    expect(releaseSeasonNumber('[SubsPlease] Spy x Family S2 - 05 (1080p) [ABCD1234].mkv')).toBe(2);
    expect(releaseSeasonNumber('Show S02E05 1080p WEB-DL')).toBe(2);
    expect(releaseSeasonNumber('[Erai-raws] Show 2nd Season - 05 [1080p]')).toBe(2);
    expect(releaseSeasonNumber('[Group] Show - 05 [S1A2B3C4]')).toBeNull();
    expect(releaseSeasonNumber('[Group] Show - 05 [1080p]')).toBeNull();
  });
});

describe('mapping an entry onto release numbers', () => {
  it('season 2 after a 25-episode TV season: absolute offset 25, season 2', () => {
    const mapping = mapSeasonEpisodes(['Show 2nd Season'], [
      { format: 'MOVIE', episodes: 1, titles: ['Show the Movie'] },
      { format: 'TV', episodes: 25, titles: ['Show'] },
    ]);
    expect(mapping).toEqual({ seasonNumber: 2, seasonOffset: 0, absoluteOffset: 25 });
  });

  it('the second cour of a split season: its episodes continue the season', () => {
    const mapping = mapSeasonEpisodes(['Show Season 3 Part 2'], [
      { format: 'TV', episodes: 12, titles: ['Show Season 3'] },
      { format: 'TV', episodes: 12, titles: ['Show Season 2'] },
      { format: 'TV', episodes: 25, titles: ['Show'] },
    ]);
    expect(mapping).toEqual({ seasonNumber: 3, seasonOffset: 12, absoluteOffset: 49 });
    expect(withSeasonNumbers(unit(1), mapping)).toMatchObject({ number: 1, seasonEpisode: 13, absoluteNumber: 50 });
  });

  it('a first season is season 1 with nothing before it; an unreadable chain invents no offset', () => {
    expect(mapSeasonEpisodes(['Frieren'], [])).toEqual({ seasonNumber: 1, seasonOffset: 0, absoluteOffset: 0 });
    expect(mapSeasonEpisodes(['Show 2nd Season'], [{ format: 'TV', episodes: 12, titles: ['Show'] }], false))
      .toEqual({ seasonNumber: 2, seasonOffset: 0, absoluteOffset: null });
    // A prequel still airing (0 episodes declared) leaves the absolute number unknown.
    expect(mapSeasonEpisodes(['X'], [{ format: 'TV', episodes: 0, titles: ['Y'] }]).absoluteOffset).toBeNull();
    // A sequel whose titles name no season is not guessed from the chain.
    expect(mapSeasonEpisodes(['Show: Kanketsu-hen'], [{ format: 'TV', episodes: 12, titles: ['Show'] }]).seasonNumber).toBeNull();
    expect(withSeasonNumbers(unit(3), { seasonNumber: 1, seasonOffset: 0, absoluteOffset: 0 })).toEqual(unit(3));
  });
});

describe('matching a unit to a release by any of its numbers', () => {
  const s2e5 = unit(5, { absoluteNumber: 30 });

  it('with nothing to map it is exactly releaseCoversEpisode', () => {
    for (const name of ['Show - 05 [1080p]', 'Show S01E05', 'Show - 50', 'Show S2 - 05']) {
      expect(releaseCoversUnit(name, unit(5))).toBe(releaseCoversEpisode(name, 5));
    }
  });

  it('accepts this season\'s numbering and the absolute number, never another season', () => {
    expect(releaseCoversUnit('[SubsPlease] Show S2 - 05 (1080p)', s2e5, 2)).toBe(true);
    expect(releaseCoversUnit('Show S02E05 1080p', s2e5, 2)).toBe(true);
    expect(releaseCoversUnit('[Judas] Show - 30 [1080p]', s2e5, 2)).toBe(true);
    expect(releaseCoversUnit('Show S01E05 1080p', s2e5, 2)).toBe(false);
    expect(releaseCoversUnit('[Group] Show S3 - 05', s2e5, 2)).toBe(false);
    // An absolute number under a season marker is the season's own numbering, not absolute.
    expect(releaseCoversUnit('Show S2 - 30', s2e5, 2)).toBe(false);
  });

  it('a later cour matches S03E13 for its first episode, and its own "Part 2 - 01" naming', () => {
    const p2e1 = unit(1, { seasonEpisode: 13, absoluteNumber: 50 });
    expect(releaseCoversUnit('Show S03E13 1080p', p2e1, 3)).toBe(true);
    expect(releaseCoversUnit('Show Season 3 Part 2 - 01', p2e1, 3)).toBe(true);
    // Season 3 episode 1 without a part marker is part 1's first episode.
    expect(releaseCoversUnit('Show S3 - 01', p2e1, 3)).toBe(false);
    expect(releaseCoversUnit('Show - 50', p2e1, 3)).toBe(true);
  });

  it('batch ranges are read the same way', () => {
    expect(batchRangeCoversUnit('[Group] Show (26-50) [BD 1080p]', s2e5, 2)).toBe(true);
    expect(batchRangeCoversUnit('[Group] Show S1 (01-25)', s2e5, 2)).toBe(false);
    expect(batchRangeCoversUnit('[Group] Show S2 (01-12)', s2e5, 2)).toBe(true);
  });

  it('the planner takes the right season\'s release over a better-seeded wrong one', () => {
    const plan = planMalReleases([s2e5], [
      release('[Big] Show S01E05 1080p', 500),
      release('[Small] Show S2 - 05 (1080p)', 5),
    ], { seasonNumber: 2 });
    expect(plan.matches[0].release?.name).toBe('[Small] Show S2 - 05 (1080p)');
    const absolute = planMalReleases([s2e5], [release('[Judas] Show - 30 [1080p]')], { seasonNumber: 2 });
    expect(absolute.covered).toBe(1);
  });
});
