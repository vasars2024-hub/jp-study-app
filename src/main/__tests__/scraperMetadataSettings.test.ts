// @vitest-environment node
//
// The Metadata settings group.
//
// Provider Order is asserted against a stubbed transport rather than a local
// server, because the two catalogue hosts are module constants pointing at
// api.jikan.moe and graphql.anilist.co — the thing under test is *which host is
// asked, in what order*, and a stub is the only way to observe that without
// making the suite depend on two public APIs being up.
//
// Everything else in the group is a projection, and is tested as one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

const asked: string[] = [];
let jikanHasResults = true;
let anilistHasResults = true;

vi.mock('../scraper/http', () => ({
  MAX_BODY_BYTES: 4 * 1024 * 1024,
  SCRAPER_USER_AGENT: 'test',
  redactHeaders: (h: Record<string, string>) => h,
  charsetOf: () => 'utf-8',
  probeHttp: async () => {
    throw new Error('not used here');
  },
  scraperRequest: async (url: string) => {
    const body = url.includes('anilist')
      ? JSON.stringify({
        data: {
          Page: {
            media: anilistHasResults
              ? [{
                id: 21,
                idMal: 21,
                title: { romaji: 'AniList Romaji', english: 'AniList English', native: 'アニリスト' },
                episodes: 1,
              }]
              : [],
          },
        },
      })
      : JSON.stringify({
        data: jikanHasResults
          ? [{ mal_id: 52991, title: 'Jikan Romaji', title_english: 'Jikan English', title_japanese: 'ジカン' }]
          : [],
      });
    asked.push(url.includes('anilist') ? 'anilist' : 'jikan');
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      body,
      bytes: body.length,
      truncated: false,
      finalUrl: url,
      timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 0, total: 0 },
    };
  },
}));

const { searchCatalogue, toSeriesMetadata, workTitleFor } = await import('../scraper/catalogue');
const { buildEpisodeRows, episodeTitleFor } = await import('../scraper/engine');
const { recentScraperLogs, resetScraperLogs } = await import('../scraper/logBus');

beforeEach(() => {
  asked.length = 0;
  jikanHasResults = true;
  anilistHasResults = true;
  resetScraperLogs();
});

const work = {
  provider: 'mal' as const,
  id: 52991,
  titleEn: 'Frieren: Beyond Journey’s End',
  titleJa: '葬送のフリーレン',
  titleRomaji: 'Sousou no Frieren',
  synopsis: 'A mage outlives her party.',
  genres: ['Adventure', 'Drama'],
  studios: ['Madhouse'],
  format: 'TV',
  status: 'Finished Airing',
  season: 'fall 2023',
  episodeCount: 28,
  averageDurationSec: 1_440,
  contentRating: 'PG-13',
  communityRating: 9.3,
  malId: 52991,
  aniListId: null,
  officialSite: 'https://frieren-anime.jp/',
  posterUrl: 'https://cdn.test/poster.jpg',
  posterVariants: { jpg: 'https://cdn.test/poster.jpg' },
  bannerUrl: '',
  year: 2023,
};

function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  patch(value);
  return value;
}

// ------------------------------------------------------------ providerOrder ---

describe('metadata.providerOrder', () => {
  it('asks the first provider in the list', async () => {
    await searchCatalogue('frieren', 'job', 5, ['jikan', 'anilist']);
    expect(asked).toEqual(['jikan']);
  });

  it('asks AniList first when the profile puts it first', async () => {
    const works = await searchCatalogue('frieren', 'job', 5, ['anilist', 'jikan']);
    expect(asked).toEqual(['anilist']);
    expect(works[0].provider).toBe('anilist');
  });

  it('falls through to the next provider when the first has nothing', async () => {
    jikanHasResults = false;
    const works = await searchCatalogue('frieren', 'job', 5, ['jikan', 'anilist']);
    expect(asked).toEqual(['jikan', 'anilist']);
    expect(works[0].provider).toBe('anilist');
  });

  it('never asks a provider the profile left out', async () => {
    anilistHasResults = false;
    const works = await searchCatalogue('frieren', 'job', 5, ['anilist']);
    expect(asked).toEqual(['anilist']);
    expect(works).toEqual([]);
  });

  it('treats "mal" as Jikan rather than as an unknown provider', async () => {
    await searchCatalogue('frieren', 'job', 5, ['mal']);
    expect(asked).toEqual(['jikan']);
  });

  it('skips an unknown provider id with a log line, and keeps searching', async () => {
    await searchCatalogue('frieren', 'job', 5, ['tvdb', 'jikan']);
    expect(asked).toEqual(['jikan']);
    const logged = recentScraperLogs().map((l) => l.message).join('\n');
    expect(logged).toContain('unknown metadata provider "tvdb"');
  });

  it('still searches when the list names nothing usable', async () => {
    await searchCatalogue('frieren', 'job', 5, ['tvdb']);
    expect(asked).toEqual(['jikan']);
  });

  it('is the default order when no list is passed at all', async () => {
    await searchCatalogue('frieren', 'job');
    expect(asked).toEqual(['jikan']);
  });
});

// ----------------------------------------------------------- titleLanguage ---

describe('metadata.titleLanguage', () => {
  it.each([
    ['english', 'Frieren: Beyond Journey’s End'],
    ['romaji', 'Sousou no Frieren'],
    ['native', '葬送のフリーレン'],
  ] as const)('picks the %s title', (language, expected) => {
    expect(workTitleFor(work, language)).toBe(expected);
  });

  it('falls back rather than returning a blank title', () => {
    const romajiOnly = { ...work, titleEn: '', titleJa: '' };
    expect(workTitleFor(romajiOnly, 'native')).toBe('Sousou no Frieren');
  });

  it('applies to episode titles too', () => {
    const episode = {
      number: 1,
      titleEn: 'The Journey’s End',
      titleJa: '冒険の終わり',
      titleRomaji: 'Bouken no Owari',
      airDate: '2023-09-29',
      filler: false,
      recap: false,
      url: '',
      thumbnailUrl: '',
    };
    expect(episodeTitleFor(episode, 'english')).toBe('The Journey’s End');
    expect(episodeTitleFor(episode, 'romaji')).toBe('Bouken no Owari');
    expect(episodeTitleFor(episode, 'native')).toBe('冒険の終わり');
  });
});

// ----------------------------------------------------------- field toggles ---

describe('toSeriesMetadata', () => {
  it('carries everything when every fetch toggle is on', () => {
    const metadata = toSeriesMetadata(work, 'mal-52991', settings().metadata);
    expect(metadata.synopsis).toContain('outlives');
    expect(metadata.genres).toEqual(['Adventure', 'Drama']);
    expect(metadata.communityRating).toBe(9.3);
    expect(metadata.titleJa).toBe('葬送のフリーレン');
  });

  // `fetchStaff` is the one toggle in the group with no consumer: nothing here
  // fetches staff or cast, and studios are a production credit rather than
  // either. Asserting that it does *not* silently blank the studio list is what
  // keeps a future session from wiring it to the nearest available field.
  it('leaves the studio credit alone whatever Fetch Staff and Cast says', () => {
    for (const fetchStaff of [true, false]) {
      const metadata = toSeriesMetadata(work, 'mal-52991', settings((s) => {
        s.metadata.fetchStaff = fetchStaff;
      }).metadata);
      expect(metadata.studios).toEqual(['Madhouse']);
    }
  });

  it('empties a field the profile turned off, and drops it from provenance', () => {
    const metadata = toSeriesMetadata(work, 'mal-52991', settings((s) => {
      s.metadata.fetchSynopsis = false;
      s.metadata.fetchGenres = false;
      s.metadata.fetchRatings = false;
      s.metadata.alsoStoreNativeTitle = false;
    }).metadata);
    expect(metadata.synopsis).toBe('');
    expect(metadata.genres).toEqual([]);
    expect(metadata.communityRating).toBe(0);
    expect(metadata.titleJa).toBe('');
    expect(metadata.provenance.synopsis).toBeUndefined();
    expect(metadata.provenance.genres).toBeUndefined();
    expect(metadata.provenance.communityRating).toBeUndefined();
    expect(metadata.provenance.titleJa).toBeUndefined();
    // Still accounted for, because these are still populated.
    expect(metadata.provenance.titleEn).toBe('MyAnimeList (Jikan)');
    expect(metadata.provenance.episodeCount).toBe('MyAnimeList (Jikan)');
  });

  it('follows the profile title language', () => {
    expect(toSeriesMetadata(work, 'x', settings((s) => {
      s.metadata.titleLanguage = 'romaji';
    }).metadata).titleEn).toBe('Sousou no Frieren');
  });

  it('behaves as before when called without settings', () => {
    const metadata = toSeriesMetadata(work, 'x');
    expect(metadata.titleEn).toBe('Frieren: Beyond Journey’s End');
    expect(metadata.synopsis).toContain('outlives');
    // fetchStaff defaults off in the model, but "no settings" means "no opinion".
    expect(metadata.studios).toEqual(['Madhouse']);
  });
});

describe('buildEpisodeRows under the metadata group', () => {
  const episodes = [
    {
      number: 1,
      titleEn: 'The Journey’s End',
      titleJa: '冒険の終わり',
      titleRomaji: 'Bouken no Owari',
      airDate: '2023-09-29',
      filler: false,
      recap: false,
      url: 'https://example.test/1',
      thumbnailUrl: '',
    },
  ];

  it('keeps the air date and Japanese title by default', () => {
    const [row] = buildEpisodeRows(work, episodes, settings(), []);
    expect(row.airDate).toBe('2023-09-29');
    expect(row.titleJa).toBe('冒険の終わり');
  });

  it('drops the air date when Fetch Air Dates is off', () => {
    const [row] = buildEpisodeRows(work, episodes, settings((s) => {
      s.metadata.fetchAirDates = false;
    }), []);
    expect(row.airDate).toBeNull();
  });

  it('drops the second Japanese line when Also Store Japanese Title is off', () => {
    const [row] = buildEpisodeRows(work, episodes, settings((s) => {
      s.metadata.alsoStoreNativeTitle = false;
    }), []);
    expect(row.titleJa).toBe('');
  });

  it('titles rows in the profile language', () => {
    const [row] = buildEpisodeRows(work, episodes, settings((s) => {
      s.metadata.titleLanguage = 'romaji';
    }), []);
    expect(row.titleEn).toBe('Bouken no Owari');
  });
});
