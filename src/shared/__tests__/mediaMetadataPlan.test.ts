// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  correctedCategory,
  episodeGuideOf,
  lookupProviders,
  lookupSteps,
  mapEpisodesToFiles,
  resolveSeasonForWork,
  sweepDecision,
  type GuideEpisode,
} from '../mediaMetadataPlan';
import { UNMATCHED_RETRY_MS } from '../mediaMetadataIpc';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 23);

describe('lookupSteps', () => {
  it('asks the anime databases first for anime, TVmaze first for TV and drama', () => {
    expect(lookupSteps('anime', { tmdb: false, animeHint: false })).toEqual(['anime', 'tvmaze']);
    expect(lookupSteps('tv', { tmdb: true, animeHint: false })).toEqual(['tvmaze', 'anime']);
    expect(lookupSteps('drama', { tmdb: false, animeHint: true })).toEqual(['tvmaze', 'anime']);
  });

  it('asks nothing about a film without a TMDB key unless it looks like anime', () => {
    expect(lookupSteps('movie', { tmdb: false, animeHint: false })).toEqual([]);
    expect(lookupSteps('movie', { tmdb: false, animeHint: true })).toEqual(['anime']);
    expect(lookupSteps('movie', { tmdb: true, animeHint: false })).toEqual(['tmdb-movie']);
    expect(lookupSteps('movie', { tmdb: true, animeHint: true })).toEqual(['tmdb-movie', 'anime']);
  });

  it('records TMDB among the providers only when a key exists', () => {
    expect(lookupProviders('anime', { tmdb: false, animeHint: false })).toEqual(['jikan', 'anilist', 'tvmaze']);
    expect(lookupProviders('tv', { tmdb: true, animeHint: false })).toContain('tmdb');
    expect(lookupProviders('movie', { tmdb: false, animeHint: false })).toEqual([]);
  });
});

describe('sweepDecision', () => {
  const anime = ['jikan', 'anilist', 'tvmaze'] as const;

  it('looks up a title nobody has asked about', () => {
    expect(sweepDecision({}, 'anime', [...anime], NOW)).toBe('lookup');
  });

  it('lets an unmatched stamp rest for the retry window, then asks again', () => {
    const stamped = (ago: number) => ({
      metadataSource: 'unmatched',
      metadataUpdatedAt: NOW - ago,
      metadataAttempt: { at: NOW - ago, category: 'anime', providers: [...anime] },
    });
    expect(sweepDecision(stamped(DAY), 'anime', [...anime], NOW)).toBe('skip');
    expect(sweepDecision(stamped(UNMATCHED_RETRY_MS + DAY), 'anime', [...anime], NOW)).toBe('lookup');
  });

  it('asks again at once when the category changed', () => {
    const state = {
      metadataSource: 'unmatched',
      metadataUpdatedAt: NOW - DAY,
      metadataAttempt: { at: NOW - DAY, category: 'anime', providers: [...anime] },
    };
    expect(sweepDecision(state, 'drama', ['tvmaze', 'jikan', 'anilist'], NOW)).toBe('lookup');
  });

  it('asks again at once when a provider appeared — the TMDB key being added', () => {
    const state = {
      metadataSource: 'unmatched',
      metadataUpdatedAt: NOW - DAY,
      metadataAttempt: { at: NOW - DAY, category: 'movie', providers: ['jikan', 'anilist'] as Array<'jikan' | 'anilist'> },
    };
    expect(sweepDecision(state, 'movie', ['tmdb', 'jikan', 'anilist'], NOW)).toBe('lookup');
  });

  it('gives every legacy unmatched stamp one look with TVmaze', () => {
    // Written before attempts were recorded: it tried MyAnimeList and AniList.
    const legacy = { metadataSource: 'unmatched', metadataUpdatedAt: NOW - DAY };
    expect(sweepDecision(legacy, 'anime', [...anime], NOW)).toBe('lookup');
  });

  it('rests a keyless film after its local-art pass, and reopens it for a key', () => {
    const keyless = { metadataAttempt: { at: NOW - DAY, category: 'movie', providers: [] } };
    expect(sweepDecision(keyless, 'movie', [], NOW)).toBe('skip');
    expect(sweepDecision(keyless, 'movie', ['tmdb'], NOW)).toBe('lookup');
  });

  it('tops up a match that lacks art only when a new provider could supply it', () => {
    const legacyMatch = { metadataSource: 'jikan', metadataUpdatedAt: NOW - DAY, posterPath: 'artwork/p.jpg' };
    expect(sweepDecision(legacyMatch, 'anime', [...anime], NOW)).toBe('topup');
    expect(sweepDecision({ ...legacyMatch, bannerPath: 'artwork/b.jpg' }, 'anime', [...anime], NOW)).toBe('skip');
    const current = { ...legacyMatch, metadataAttempt: { at: NOW - DAY, category: 'anime', providers: [...anime] } };
    expect(sweepDecision(current, 'anime', [...anime], NOW)).toBe('skip');
  });

  it('never touches a manual correction', () => {
    const manual = {
      metadataSource: 'unmatched',
      metadataUpdatedAt: 0,
      metadataAttempt: { at: 0, category: 'anime', providers: [], manual: true },
    };
    expect(sweepDecision(manual, 'tv', ['tvmaze', 'tmdb'], NOW)).toBe('skip');
  });
});

describe('correctedCategory', () => {
  const tvmaze = (extra: object) => ({ provider: 'tvmaze' as const, ...extra });

  it('moves a fansubbed J-drama out of anime', () => {
    const evidence = tvmaze({ animation: false, language: 'japanese', country: 'JP', showType: 'scripted' });
    expect(correctedCategory('anime', 'anime', evidence, 0.9)).toBe('drama');
  });

  it('moves a scene-named anime out of tv', () => {
    expect(correctedCategory('tv', 'tv', { provider: 'jikan' }, 0.95)).toBe('anime');
    expect(correctedCategory('tv', 'tv', tvmaze({ animation: true, language: 'japanese' }), 0.95)).toBe('anime');
  });

  it('files East Asian scripted live action under drama, the rest under tv', () => {
    expect(correctedCategory('tv', 'tv', tvmaze({ animation: false, language: 'korean', showType: 'scripted' }), 0.9)).toBe('drama');
    expect(correctedCategory('anime', 'anime', tvmaze({ animation: false, language: 'english', showType: 'scripted' }), 0.9)).toBe('tv');
    // A Japanese variety show is live action but not a drama.
    expect(correctedCategory('anime', 'anime', tvmaze({ animation: false, language: 'japanese', showType: 'variety' }), 0.9)).toBe('tv');
  });

  it('leaves a category the user chose alone', () => {
    // The importer would have said anime; the user said tv.
    expect(correctedCategory('tv', 'anime', { provider: 'jikan' }, 1)).toBeNull();
  });

  it('never acts on a reviewed guess or moves a film', () => {
    expect(correctedCategory('tv', 'tv', { provider: 'jikan' }, 0.6)).toBeNull();
    expect(correctedCategory('movie', 'movie', { provider: 'jikan' }, 1)).toBeNull();
  });

  it('does not move non-Japanese animation found on TVmaze into anime', () => {
    expect(correctedCategory('tv', 'tv', tvmaze({ animation: true, language: 'english' }), 0.95)).toBeNull();
  });
});

const run = (season: number, count: number, year: number, title = 'Ep'): GuideEpisode[] =>
  Array.from({ length: count }, (_, index) => ({
    season,
    number: index + 1,
    title: `${title} S${season}E${index + 1}`,
    airedAt: Date.UTC(year, 0, 7 + index * 7),
    stillUrl: `https://static.tvmaze.com/s${season}e${index + 1}.jpg`,
  }));

describe('resolveSeasonForWork', () => {
  it('is the only season when there is one', () => {
    expect(resolveSeasonForWork(run(1, 12, 2023), 2019)).toBe(1);
  });

  it('picks the season that premiered in the work year', () => {
    const show = [...run(1, 25, 2013), ...run(2, 12, 2017), ...run(3, 22, 2018)];
    expect(resolveSeasonForWork(show, 2017)).toBe(2);
  });

  it('narrows a shared year by episode count, and gives up when still unsure', () => {
    const show = [...run(1, 12, 2020), ...run(2, 13, 2020)];
    expect(resolveSeasonForWork(show, 2020, 13)).toBe(2);
    expect(resolveSeasonForWork(show, 2020)).toBeNull();
    expect(resolveSeasonForWork(show, undefined)).toBeNull();
  });
});

describe('mapEpisodesToFiles', () => {
  const show = [...run(1, 3, 2013), ...run(2, 2, 2020)];

  it('maps SxxEyy files exactly and scopes their title maps to the season', () => {
    const { byFile, titlesByFile } = mapEpisodesToFiles(
      [{ id: 'a', season: 1, episode: 2 }, { id: 'b', season: 2, episode: 1 }],
      show,
    );
    expect(byFile.get('a')?.title).toBe('Ep S1E2');
    expect(byFile.get('b')?.title).toBe('Ep S2E1');
    // Each file reads its own season's titles by its own number.
    expect(titlesByFile.get('a')?.['2']).toBe('Ep S1E2');
    expect(titlesByFile.get('b')?.['1']).toBe('Ep S2E1');
  });

  it('numbers season-less files absolutely on a multi-season show', () => {
    const { byFile, titlesByFile } = mapEpisodesToFiles([{ id: 'x', episode: 4 }], show);
    expect(byFile.get('x')?.title).toBe('Ep S2E1');
    expect(titlesByFile.get('x')?.['4']).toBe('Ep S2E1');
  });

  it('uses a resolved season, and in strict mode refuses to guess without one', () => {
    expect(mapEpisodesToFiles([{ id: 'x', episode: 1 }], show, { season: 2 }).byFile.get('x')?.title).toBe('Ep S2E1');
    expect(mapEpisodesToFiles([{ id: 'x', episode: 1 }], show, { strict: true }).byFile.size).toBe(0);
  });

  it('skips files without an episode number and episodes the show lacks', () => {
    const { byFile } = mapEpisodesToFiles([{ id: 'x' }, { id: 'y', season: 9, episode: 1 }], show);
    expect(byFile.size).toBe(0);
  });
});

describe('episodeGuideOf', () => {
  it('orders, caps and drops the remote still URL', () => {
    const guide = episodeGuideOf([...run(2, 2, 2020), ...run(1, 3, 2013)], 4);
    expect(guide).toHaveLength(4);
    expect(guide[0]).toMatchObject({ season: 1, number: 1, title: 'Ep S1E1' });
    expect(guide.every((entry) => !('stillUrl' in entry))).toBe(true);
  });
});
