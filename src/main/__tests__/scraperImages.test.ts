// @vitest-environment node
//
// The Images settings group.
//
// Five of its nine fields reach code; the other four describe an image
// downloader this backend does not have, and the assertions below are as much
// about the boundary as about the behaviour — in particular that turning a
// switch *off* removes the row rather than merely hiding it, and that the group
// on its shipped defaults produces what the engine produced before it had a
// consumer.

import { describe, expect, it, vi } from 'vitest';
import type { ScraperImageSettings } from '../../shared/scraperOutputSettings';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const {
  buildImageRows,
  episodeThumbnailFor,
  formatOf,
  posterUrlFor,
} = await import('../scraper/imageSet');
const { DEFAULT_SCRAPER_IMAGE_SETTINGS } = await import('../../shared/scraperOutputSettings');
type CatalogueWork = import('../scraper/catalogue').CatalogueWork;
type CatalogueEpisode = import('../scraper/catalogue').CatalogueEpisode;

function images(over: Partial<ScraperImageSettings> = {}): ScraperImageSettings {
  return { ...DEFAULT_SCRAPER_IMAGE_SETTINGS, ...over };
}

function work(over: Partial<CatalogueWork> = {}): CatalogueWork {
  return {
    provider: 'mal',
    id: 52991,
    titleEn: 'Frieren',
    titleJa: '葬送のフリーレン',
    titleRomaji: 'Sousou no Frieren',
    synopsis: '',
    genres: [],
    studios: [],
    format: 'TV',
    status: 'Finished Airing',
    season: 'fall 2023',
    episodeCount: 28,
    averageDurationSec: 1_440,
    contentRating: '',
    communityRating: 0,
    malId: 52991,
    aniListId: null,
    officialSite: '',
    posterUrl: 'https://cdn.test/frieren.jpg',
    posterVariants: {
      jpg: 'https://cdn.test/frieren.jpg',
      webp: 'https://cdn.test/frieren.webp',
    },
    bannerUrl: 'https://cdn.test/banner.jpg',
    year: 2023,
    ...over,
  };
}

function episode(number: number, thumbnailUrl = ''): CatalogueEpisode {
  return {
    number,
    titleEn: `Episode ${number}`,
    titleJa: '',
    titleRomaji: '',
    airDate: null,
    filler: false,
    recap: false,
    url: '',
    thumbnailUrl,
  };
}

describe('formatOf', () => {
  it('reads the extension', () => {
    expect(formatOf('https://cdn.test/a.webp')).toBe('webp');
    expect(formatOf('https://cdn.test/a.PNG')).toBe('png');
  });

  it('normalises jpeg to jpg, so one image is not two formats', () => {
    expect(formatOf('https://cdn.test/a.jpeg')).toBe('jpg');
  });

  it('looks past a query string', () => {
    expect(formatOf('https://cdn.test/a.webp?v=2')).toBe('webp');
  });

  it('is empty when the URL names no format', () => {
    expect(formatOf('https://cdn.test/image')).toBe('');
  });
});

describe('preferredFormat', () => {
  it('picks the variant the provider published in that format', () => {
    expect(posterUrlFor(work(), 'webp')).toBe('https://cdn.test/frieren.webp');
    expect(posterUrlFor(work(), 'jpg')).toBe('https://cdn.test/frieren.jpg');
  });

  // A preference, not a demand: a provider that published one format still gets
  // used, because the alternative is a result with no poster in it.
  it('falls back to the canonical URL when that format was not published', () => {
    const jpgOnly = work({ posterVariants: { jpg: 'https://cdn.test/frieren.jpg' } });
    expect(posterUrlFor(jpgOnly, 'webp')).toBe('https://cdn.test/frieren.jpg');
  });

  it('takes the canonical URL for "original"', () => {
    expect(posterUrlFor(work(), 'original')).toBe('https://cdn.test/frieren.jpg');
  });

  it('survives a work with no variants recorded at all', () => {
    const bare = { ...work(), posterVariants: undefined } as unknown as CatalogueWork;
    expect(posterUrlFor(bare, 'webp')).toBe('https://cdn.test/frieren.jpg');
  });
});

describe('buildImageRows', () => {
  const rows = (over: Partial<ScraperImageSettings>, episodes: CatalogueEpisode[] = []) =>
    buildImageRows(work(), 'mal-52991', episodes, images(over), 'MyAnimeList');

  it('collects the poster on the shipped defaults', () => {
    const built = rows({});
    expect(built).toHaveLength(1);
    expect(built[0].kind).toBe('poster');
    expect(built[0].url).toBe('https://cdn.test/frieren.webp');
    expect(built[0].format).toBe('webp');
  });

  // Off must remove the row, not hide it: the row is what causes the fetch.
  it('collects no poster when Download Posters is off', () => {
    expect(rows({ downloadPosters: false })).toEqual([]);
  });

  it('collects the banner only when asked', () => {
    expect(rows({}).some((row) => row.kind === 'banner')).toBe(false);
    expect(rows({ downloadBanners: true }).some((row) => row.kind === 'banner')).toBe(true);
  });

  it('collects no banner when the provider published none', () => {
    const built = buildImageRows(
      work({ bannerUrl: '' }),
      'mal-52991',
      [],
      images({ downloadBanners: true }),
      'MyAnimeList',
    );
    expect(built.some((row) => row.kind === 'banner')).toBe(false);
  });

  it('collects a per-episode still where the provider has one', () => {
    const built = rows({ downloadPosters: false }, [
      episode(1, 'https://cdn.test/e1.jpg'),
      episode(2),
    ]);
    expect(built).toHaveLength(1);
    expect(built[0].kind).toBe('thumbnail');
    expect(built[0].episodeId).toBe('mal-52991-s1-e1');
  });

  it('collects no stills when Download Thumbnails is off', () => {
    const built = rows({ downloadPosters: false, downloadThumbnails: false }, [
      episode(1, 'https://cdn.test/e1.jpg'),
    ]);
    expect(built).toEqual([]);
  });

  it('caps the list at maxPerEntry', () => {
    const built = rows({ downloadBanners: true, maxPerEntry: 2 }, [
      episode(1, 'https://cdn.test/e1.jpg'),
      episode(2, 'https://cdn.test/e2.jpg'),
    ]);
    expect(built).toHaveLength(2);
  });

  // The cap cuts the least important first, which is why the order is fixed.
  it('keeps the poster and banner ahead of the stills when it cuts', () => {
    const built = rows({ downloadBanners: true, maxPerEntry: 2 }, [
      episode(1, 'https://cdn.test/e1.jpg'),
    ]);
    expect(built.map((row) => row.kind)).toEqual(['poster', 'banner']);
  });

  it('treats a cap of zero as "collect none"', () => {
    expect(rows({ maxPerEntry: 0 })).toEqual([]);
  });

  it('gives every row a distinct id', () => {
    const built = rows({ downloadBanners: true }, [
      episode(1, 'https://cdn.test/e1.jpg'),
      episode(2, 'https://cdn.test/e2.jpg'),
    ]);
    expect(new Set(built.map((row) => row.id)).size).toBe(built.length);
  });

  // Dimensions and byte counts are the group's inert half. They must read as
  // "not measured" rather than as a measurement of zero pixels.
  it('reports no dimensions, because nothing measured them', () => {
    const [poster] = rows({});
    expect(poster.width).toBe(0);
    expect(poster.height).toBe(0);
    expect(poster.sizeBytes).toBe(0);
  });
});

describe('episodeThumbnailFor', () => {
  it('prefers the episode’s own still', () => {
    const url = episodeThumbnailFor(episode(1, 'https://cdn.test/e1.jpg'), work(), images());
    expect(url).toBe('https://cdn.test/e1.jpg');
  });

  // What every row carried before this group had a consumer, so a user who
  // never opened the drawer sees no change.
  it('falls back to the poster when the provider has no still', () => {
    expect(episodeThumbnailFor(episode(1), work(), images())).toBe('https://cdn.test/frieren.webp');
  });

  it('is empty when Download Thumbnails is off', () => {
    expect(episodeThumbnailFor(episode(1, 'https://cdn.test/e1.jpg'), work(), images({
      downloadThumbnails: false,
    }))).toBe('');
  });
});
