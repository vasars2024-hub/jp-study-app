// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';
import type { ScrapeJobEvent, StreamRow, TorrentRow } from '../../shared/scraperResults';
import type { CatalogueEpisode, CatalogueWork } from '../scraper/catalogue';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

// The engine's network edges are the catalogue client and the torrent search;
// both are stubbed so the pipeline — stages, ordering, cancellation, validation
// — is what is under test. Each of those modules has its own tests against real
// documents.
const catalogue = vi.hoisted(() => ({
  works: [] as CatalogueWork[],
  episodes: [] as CatalogueEpisode[],
  detailCalls: 0,
  searchCalls: 0,
  delayMs: 0,
}));

const torrents = vi.hoisted(() => ({ rows: [] as TorrentRow[], calls: 0 }));
const seanime = vi.hoisted(() => ({ rows: [] as StreamRow[], calls: 0 }));

vi.mock('../scraper/catalogue', async () => {
  const actual = await vi.importActual<typeof import('../scraper/catalogue')>(
    '../scraper/catalogue',
  );
  return {
    ...actual,
    searchCatalogue: async () => {
      catalogue.searchCalls += 1;
      return catalogue.works;
    },
    catalogueDetail: async () => {
      catalogue.detailCalls += 1;
      return catalogue.works[0] ?? null;
    },
    catalogueEpisodes: async (
      _work: CatalogueWork,
      _cid: string,
      onPage?: (page: number, count: number) => void,
    ) => {
      if (catalogue.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, catalogue.delayMs));
      }
      onPage?.(1, catalogue.episodes.length);
      return catalogue.episodes;
    },
  };
});

vi.mock('../scraper/torrents', () => ({
  searchTorrents: async () => {
    torrents.calls += 1;
    return torrents.rows;
  },
}));

vi.mock('../scraper/seanimeSources', () => ({
  resolveSeanimeStreams: async () => {
    seanime.calls += 1;
    return seanime.rows;
  },
}));

const {
  buildEpisodeRows,
  cancelScrape,
  cleanPageTitle,
  isSiteNameOnly,
  slugFromUrl,
  jobResult,
  jobSummaries,
  resetScrapeJobs,
  startScrape,
  validateRows,
} = await import('../scraper/engine');

function work(overrides: Partial<CatalogueWork> = {}): CatalogueWork {
  return {
    provider: 'mal',
    id: 52991,
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    titleRomaji: 'Sousou no Frieren',
    synopsis: 'A long life after the journey.',
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
    posterUrl: 'https://cdn.test/frieren.jpg',
    posterVariants: { jpg: 'https://cdn.test/frieren.jpg' },
    bannerUrl: '',
    year: 2023,
    ...overrides,
  };
}

function episode(number: number, overrides: Partial<CatalogueEpisode> = {}): CatalogueEpisode {
  return {
    number,
    titleEn: `The Journey ${number}`,
    titleJa: `旅 ${number}`,
    titleRomaji: `Tabi ${number}`,
    airDate: '2023-09-29',
    filler: false,
    recap: false,
    url: `https://myanimelist.net/anime/52991/episode/${number}`,
    thumbnailUrl: '',
    ...overrides,
  };
}

function release(overrides: Partial<TorrentRow> = {}): TorrentRow {
  return {
    id: 'r1',
    infoHash: 'aa11',
    name: '[SubsPlease] Sousou no Frieren - 01 (1080p) [Multiple Subtitle]',
    releaseGroup: 'SubsPlease',
    resolution: '1080p',
    seeders: 500,
    leechers: 10,
    availability: 20,
    tracker: 'Nyaa',
    sizeBytes: 1_500_000_000,
    ageDays: 2,
    fileCount: 1,
    subtitleLanguages: ['en', 'ja'],
    isBatch: false,
    magnet: 'magnet:?xt=urn:btih:aa11',
    ...overrides,
  };
}

/** Default profile settings, with an optional tweak applied. */
function settingsWith(patch?: (s: ScraperSettings) => void): ScraperSettings {
  const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
  patch?.(settings);
  return settings;
}

/** Runs a job to completion and returns every event it emitted, in order. */
async function runJob(settings: ScraperSettings, target = 'frieren'): Promise<{
  jobId: string;
  events: ScrapeJobEvent[];
}> {
  const events: ScrapeJobEvent[] = [];
  const jobId = startScrape(
    { request: { targetUrl: target, profileId: 'default' }, settings },
    (_id, event) => events.push(event),
  );
  await vi.waitFor(
    () => {
      const last = events[events.length - 1];
      const settled = events.some(
        (e) => e.kind === 'done'
          || e.kind === 'error'
          || (e.kind === 'stage' && e.stage === 'cancelled'),
      );
      if (!settled) throw new Error(`not finished: ${last?.kind ?? 'nothing'}`);
    },
    { timeout: 5_000, interval: 10 },
  );
  return { jobId, events };
}

beforeEach(() => {
  resetScrapeJobs();
  catalogue.works = [work()];
  catalogue.episodes = [episode(1), episode(2), episode(3)];
  catalogue.detailCalls = 0;
  catalogue.searchCalls = 0;
  catalogue.delayMs = 0;
  torrents.rows = [];
  torrents.calls = 0;
  seanime.rows = [];
  seanime.calls = 0;
});

describe('cleanPageTitle', () => {
  it('strips the site suffix a pasted page title carries', () => {
    expect(cleanPageTitle('Frieren | Watch on Example')).toBe('Frieren');
    expect(cleanPageTitle('Frieren - MyAnimeList.net')).toBe('Frieren');
    expect(cleanPageTitle('Frieren · AniList')).toBe('Frieren');
    expect(cleanPageTitle('  Sousou   no Frieren ')).toBe('Sousou no Frieren');
  });
});

describe('reading a target out of a URL', () => {
  it('recognises a title that is only the site name', () => {
    // anilist.co is client-rendered: the served HTML's title is the brand.
    expect(isSiteNameOnly('AniList', 'https://anilist.co/anime/21/ONE-PIECE/')).toBe(true);
    expect(isSiteNameOnly('MyAnimeList', 'https://myanimelist.net/anime/52991')).toBe(true);
    expect(isSiteNameOnly('ONE PIECE', 'https://anilist.co/anime/21/ONE-PIECE/')).toBe(false);
    expect(isSiteNameOnly('', 'https://anilist.co/')).toBe(true);
  });

  it('reads a name out of the URL, skipping numeric ids', () => {
    expect(slugFromUrl('https://anilist.co/anime/21/ONE-PIECE/')).toBe('ONE PIECE');
    expect(slugFromUrl('https://myanimelist.net/anime/52991/Sousou_no_Frieren')).toBe(
      'Sousou no Frieren',
    );
    expect(slugFromUrl('https://example.test/watch/frieren-beyond-journeys-end?x=1')).toBe(
      'frieren beyond journeys end',
    );
    // Nothing wordy anywhere in the path.
    expect(slugFromUrl('https://example.test/12/34')).toBe('');
  });

  it('decodes percent-escapes in the path', () => {
    expect(slugFromUrl('https://example.test/watch/Journey%27s_End')).toBe("Journey's End");
  });

  // Regression: a stray `%` made decodeURIComponent throw a URIError out of the
  // engine, surfacing as a scrape failure that never mentioned the URL.
  it('survives a malformed percent-escape', () => {
    expect(() => slugFromUrl('https://example.test/watch/100%_pure')).not.toThrow();
    expect(slugFromUrl('https://example.test/watch/100%_pure')).toBe('100% pure');
  });
});

describe('buildEpisodeRows', () => {
  it('builds one row per catalogue episode', () => {
    const rows = buildEpisodeRows(work(), catalogue.episodes, settingsWith(), []);
    expect(rows).toHaveLength(3);
    // P6: the id carries season and kind, so S2E1 and special 1 cannot collide with S1E1.
    expect(rows[0].id).toBe('mal-52991-s1-e1');
    expect(rows[0].seriesId).toBe('mal-52991');
    expect(rows[0].sourceLabel).toBe('MyAnimeList (Jikan)');
    expect(rows[0].numberLabel).toBe('EP 01');
    expect(rows[0].titleJa).toBe('旅 1');
    expect(rows[0].durationSec).toBe(1_440);
    expect(rows[0].airDate).toBe('2023-09-29');
    expect(rows[0].status).toBe('pending');
  });

  it('leaves size at zero when no index release matches', () => {
    const rows = buildEpisodeRows(work(), catalogue.episodes, settingsWith(), []);
    expect(rows.every((row) => row.sizeBytes === 0)).toBe(true);
    expect(rows[0].sourceLabel).toBe('MyAnimeList (Jikan)');
  });

  it('attaches the matching release to the episode it names', () => {
    const rows = buildEpisodeRows(work(), catalogue.episodes, settingsWith(), [release()]);
    expect(rows[0].sizeBytes).toBe(1_500_000_000);
    expect(rows[0].sourceLabel).toBe('Nyaa');
    expect(rows[0].subtitles.map((s) => s.language).sort()).toEqual(['en', 'ja']);
    // Episode 2 is not named by that release, so it gets nothing from it.
    expect(rows[1].sizeBytes).toBe(0);
    expect(rows[1].subtitles).toEqual([]);
  });

  it('treats a batch release as evidence for every episode', () => {
    const rows = buildEpisodeRows(work(), catalogue.episodes, settingsWith(), [
      release({ name: '[SubsPlease] Frieren 01-28 [Batch]', isBatch: true }),
    ]);
    expect(rows.every((row) => row.subtitles.length === 2)).toBe(true);
    // A batch's size belongs to the batch, not to one episode.
    expect(rows.every((row) => row.sizeBytes === 0)).toBe(true);
  });

  it('honours ignoreRecaps and ignoreFiller', () => {
    const episodes = [episode(1), episode(2, { recap: true }), episode(3, { filler: true })];
    const kept = buildEpisodeRows(
      work(),
      episodes,
      settingsWith((s) => {
        s.episodeProcessing.ignoreRecaps = true;
        s.episodeProcessing.ignoreFiller = true;
      }),
      [],
    );
    expect(kept.map((r) => r.number)).toEqual([1]);
  });

  it('sorts naturally when asked', () => {
    const rows = buildEpisodeRows(
      work(),
      [episode(10), episode(2), episode(1)],
      settingsWith((s) => {
        s.episodeProcessing.naturalSort = true;
      }),
      [],
    );
    expect(rows.map((r) => r.number)).toEqual([1, 2, 10]);
  });
});

describe('validateRows', () => {
  const rows = () => buildEpisodeRows(work(), catalogue.episodes, settingsWith(), []);

  it('marks everything ok when nothing is wrong', () => {
    const out = validateRows(rows(), settingsWith());
    expect(out.failures).toBe(0);
    expect(out.rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('does not fail a row whose duration is simply unknown', () => {
    const unknown = buildEpisodeRows(
      work({ averageDurationSec: 0 }),
      catalogue.episodes,
      settingsWith(),
      [],
    );
    const out = validateRows(
      unknown,
      settingsWith((s) => {
        s.validation.minEpisodeDurationSec = 600;
      }),
    );
    expect(out.failures).toBe(0);
  });

  it('fails a row that is genuinely too short', () => {
    const short = buildEpisodeRows(
      work({ averageDurationSec: 120 }),
      catalogue.episodes,
      settingsWith(),
      [],
    );
    const out = validateRows(
      short,
      settingsWith((s) => {
        s.validation.minEpisodeDurationSec = 600;
      }),
    );
    expect(out.failures).toBe(3);
    expect(out.rows[0].statusNote).toMatch(/minimum episode duration/i);
  });

  it('rejects placeholder titles', () => {
    const placeholder = buildEpisodeRows(
      work(),
      [episode(1, { titleEn: 'Episode 1', titleRomaji: 'Episode 1' })],
      settingsWith(),
      [],
    );
    const out = validateRows(
      placeholder,
      settingsWith((s) => {
        s.validation.rejectPlaceholderTitles = true;
      }),
    );
    expect(out.failures).toBe(1);
  });

  it('warns rather than dropping when onFailure is warn', () => {
    const out = validateRows(
      rows(),
      settingsWith((s) => {
        s.validation.verifySubtitlePresence = true;
        s.validation.onFailure = 'warn';
      }),
    );
    expect(out.rows).toHaveLength(3);
    expect(out.rows.every((r) => r.status === 'warning')).toBe(true);
  });

  it('drops failing rows when onFailure is skip', () => {
    const out = validateRows(
      rows(),
      settingsWith((s) => {
        s.validation.verifySubtitlePresence = true;
        s.validation.onFailure = 'skip';
      }),
    );
    expect(out.rows).toHaveLength(0);
    expect(out.failures).toBe(3);
  });
});

describe('a scrape run', () => {
  it('walks the stages in order and finishes', async () => {
    const { events } = await runJob(settingsWith());
    const stages = events.filter((e) => e.kind === 'stage').map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual([
      'searching',
      'fetching',
      'streams',
      'parsing',
      'subtitles',
      'validating',
      'done',
    ]);
    expect(events.at(-1)?.kind).toBe('done');
  });

  it('records how long each stage actually took, in the order it ran', async () => {
    // A slow episode list makes the fetching stage measurably the longest one —
    // the old History chart gave every run the same fixed split.
    catalogue.delayMs = 60;
    const { events } = await runJob(settingsWith());
    const done = events.find((e) => e.kind === 'done') as { summary: { stageTimings?: { stage: string; ms: number }[] } };
    const timings = done.summary.stageTimings ?? [];
    expect(timings.map((t) => t.stage)).toEqual([
      'queued',
      'searching',
      'fetching',
      'streams',
      'parsing',
      'subtitles',
      'validating',
    ]);
    expect(timings.every((t) => t.ms >= 0)).toBe(true);
    const fetching = timings.find((t) => t.stage === 'fetching')?.ms ?? 0;
    expect(fetching).toBeGreaterThanOrEqual(50);
    expect(fetching).toBe(Math.max(...timings.map((t) => t.ms)));
  });

  it('streams one row event per episode before it finishes', async () => {
    const { events } = await runJob(settingsWith());
    const rows = events.filter((e) => e.kind === 'row');
    expect(rows).toHaveLength(3);
    const doneIndex = events.findIndex((e) => e.kind === 'done');
    const lastRowIndex = events.map((e) => e.kind).lastIndexOf('row');
    expect(lastRowIndex).toBeLessThan(doneIndex);
  });

  it('reports progress against the real episode total', async () => {
    const { events } = await runJob(settingsWith());
    const progress = events.filter((e) => e.kind === 'progress') as {
      done: number;
      total: number;
    }[];
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)?.done).toBe(3);
    expect(progress.at(-1)?.total).toBe(3);
  });

  it('produces a summary and a retrievable result', async () => {
    const { jobId, events } = await runJob(settingsWith());
    const done = events.find((e) => e.kind === 'done') as { summary: { found: number } };
    expect(done.summary.found).toBe(3);

    const result = jobResult(jobId);
    expect(result?.episodes).toHaveLength(3);
    expect(result?.metadata.titleJa).toBe('葬送のフリーレン');
    expect(result?.metadata.provenance.titleEn).toContain('Jikan');
    expect(result?.images[0]?.url).toBe('https://cdn.test/frieren.jpg');
    expect(result?.logs.length).toBeGreaterThan(0);
    expect(jobSummaries().map((s) => s.id)).toContain(jobId);
  });

  it('does not touch a torrent index in streaming-only mode', async () => {
    await runJob(settingsWith((s) => {
      s.sources.mode = 'streaming';
      s.sources.entries = [
        {
          id: 'nyaa',
          label: 'Nyaa',
          host: 'nyaa.si',
          kind: 'torrent',
          enabled: true,
          priority: 1,
          fallbackIds: [],
          verifiedSiteId: '',
          requiresAuth: false,
          supportsSubtitles: true,
          health: 'ok',
          lastCheckedAt: null,
          notes: '',
        },
      ];
    }));
    expect(torrents.calls).toBe(0);
  });

  it('searches the index when the profile allows torrents', async () => {
    torrents.rows = [release()];
    const { jobId } = await runJob(settingsWith((s) => {
      s.sources.mode = 'both';
      s.sources.entries = [
        {
          id: 'nyaa',
          label: 'Nyaa',
          host: 'nyaa.si',
          kind: 'torrent',
          enabled: true,
          priority: 1,
          fallbackIds: [],
          verifiedSiteId: '',
          requiresAuth: false,
          supportsSubtitles: true,
          health: 'ok',
          lastCheckedAt: null,
          notes: '',
        },
      ];
    }));
    expect(torrents.calls).toBe(1);
    expect(jobResult(jobId)?.torrents).toHaveLength(1);
  });

  it('keeps provider-resolved playable streams on the shared result', async () => {
    seanime.rows = [{
      id: 'seanime-provider-mal-52991-s1-e1-main-0',
      episodeId: 'mal-52991-s1-e1',
      sourceId: 'seanime:provider',
      sourceLabel: 'Provider · main',
      resolution: '1080p',
      codec: 'unknown',
      container: 'hls',
      bitrateKbps: 0,
      audioLanguages: ['ja'],
      subtitleLanguages: ['en'],
      latencyMs: 0,
      health: 'unknown',
      expiresInSec: null,
      url: 'https://stream.test/master.m3u8',
      playback: {
        providerId: 'provider',
        providerLabel: 'Provider',
        server: 'main',
        kind: 'hls',
        url: 'https://stream.test/master.m3u8',
        headers: { Referer: 'https://provider.test/' },
        subtitles: [{
          url: 'https://stream.test/subtitle.vtt',
          language: 'en',
          default: true,
        }],
        dubbed: false,
      },
    }];

    const { jobId } = await runJob(settingsWith());
    expect(seanime.calls).toBe(1);
    expect(jobResult(jobId)?.streams).toEqual(seanime.rows);
    expect(jobSummaries().find((summary) => summary.id === jobId)?.note)
      .toContain('1 playable stream');
  });

  it('fails with a readable message when nothing matches', async () => {
    catalogue.works = [];
    const { events } = await runJob(settingsWith());
    const error = events.find((e) => e.kind === 'error') as { message: string } | undefined;
    expect(error?.message).toMatch(/nothing in the catalogue matches/i);
    expect(events.some((e) => e.kind === 'stage' && e.stage === 'failed')).toBe(true);
  });

  it('fails when there is nothing to search for', async () => {
    const { events } = await runJob(settingsWith(), '   ');
    const error = events.find((e) => e.kind === 'error') as { message: string } | undefined;
    expect(error?.message).toMatch(/nothing to search for/i);
  });

  it('does not silently send a future manga job through the anime catalogue', async () => {
    const events: ScrapeJobEvent[] = [];
    startScrape(
      {
        request: { targetUrl: 'Vagabond', profileId: 'default', contentType: 'manga' },
        settings: settingsWith(),
      },
      (_id, event) => events.push(event),
    );
    await vi.waitFor(() => {
      if (!events.some((event) => event.kind === 'error')) throw new Error('not finished');
    });
    const error = events.find((event) => event.kind === 'error');
    expect(error?.kind === 'error' && error.message).toMatch(/manga acquisition/i);
    expect(catalogue.searchCalls).toBe(0);
  });

  it('aborts the run when validation says abort', async () => {
    const { events } = await runJob(settingsWith((s) => {
      s.validation.verifySubtitlePresence = true;
      s.validation.onFailure = 'abort';
    }));
    const error = events.find((e) => e.kind === 'error') as { message: string } | undefined;
    expect(error?.message).toMatch(/failed validation/i);
  });

  it('stops on cancel and reports the cancelled stage', async () => {
    catalogue.delayMs = 300;
    const events: ScrapeJobEvent[] = [];
    const jobId = startScrape(
      { request: { targetUrl: 'frieren', profileId: 'default' }, settings: settingsWith() },
      (_id, event) => events.push(event),
    );
    await vi.waitFor(
      () => {
        if (!events.some((e) => e.kind === 'stage' && e.stage === 'fetching')) {
          throw new Error('not started');
        }
      },
      { timeout: 3_000, interval: 10 },
    );
    cancelScrape(jobId);
    await vi.waitFor(
      () => {
        if (!events.some((e) => e.kind === 'stage' && e.stage === 'cancelled')) {
          throw new Error('not cancelled');
        }
      },
      { timeout: 3_000, interval: 10 },
    );
    expect(events.some((e) => e.kind === 'done')).toBe(false);
    expect(jobResult(jobId)).toBeNull();
  });
});
