// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ScrapeJobSummary, ScrapeResult } from '../../shared/scraperResults';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const {
  clearScraperHistory,
  recordJob,
  scraperHistoryJobsFromStoredDocument,
  SCRAPER_HISTORY_INDEX_FILE,
  SCRAPER_HISTORY_RESULTS_DIRECTORY,
  storedResult,
  storedSummaries,
} =
  await import('../scraper/history');
const { setScraperStoreRoot } = await import('../scraper/store');

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-history-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
});

afterAll(async () => {
  setScraperStoreRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearScraperHistory();
});

function summary(id: string, overrides: Partial<ScrapeJobSummary> = {}): ScrapeJobSummary {
  return {
    id,
    seriesId: 'anilist-154587',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'AniList',
    profile: 'default',
    stage: 'done',
    ageMinutes: 0,
    durationSec: 4,
    found: 28,
    failed: 0,
    bytes: 0,
    note: '',
    ...overrides,
  };
}

function result(id: string): ScrapeResult {
  return {
    jobId: id,
    seriesId: 'anilist-154587',
    episodes: [
      {
        id: 'anilist-154587-e1',
        seriesId: 'anilist-154587',
        number: 1,
        numberLabel: 'EP 01',
        season: 1,
        titleEn: 'The Journey’s End',
        titleJa: '',
        kind: 'episode',
        audio: 'sub',
        resolution: '1080p',
        sourceId: 'catalogue',
        sourceLabel: 'AniList',
        sizeBytes: 0,
        durationSec: 1_440,
        airDate: null,
        url: '',
        thumbnailUrl: '',
        subtitles: [],
        status: 'ok',
        statusNote: '',
      },
    ],
    streams: [],
    torrents: [],
    images: [],
    metadata: {
      seriesId: 'anilist-154587',
      titleEn: 'Frieren',
      titleJa: '葬送のフリーレン',
      titleRomaji: 'Sousou no Frieren',
      synopsis: '',
      genres: [],
      studios: ['MADHOUSE'],
      format: 'TV',
      status: 'FINISHED',
      season: 'fall 2023',
      episodeCount: 28,
      averageDurationSec: 1_440,
      contentRating: '',
      communityRating: 9.1,
      malId: 52991,
      aniListId: 154587,
      openingTheme: '',
      endingTheme: '',
      officialSite: '',
      provenance: { titleEn: 'AniList' },
    },
    logs: [],
  };
}

function resultWithProviderStream(id: string): ScrapeResult {
  const value = result(id);
  value.streams = [{
    id: 'seanime-provider-e1-main-0',
    episodeId: 'anilist-154587-e1',
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
    url: 'https://signed.test/master.m3u8?token=secret',
    playback: {
      providerId: 'provider',
      providerLabel: 'Provider',
      server: 'main',
      kind: 'hls',
      url: 'https://signed.test/master.m3u8?token=secret',
      headers: {
        Authorization: 'Bearer secret',
        Cookie: 'session=secret',
      },
      subtitles: [{
        url: 'https://signed.test/subtitle.vtt?token=secret',
        language: 'en',
        default: true,
      }],
      dubbed: false,
    },
  }];
  return value;
}

describe('job history', () => {
  it('exposes one defensive persistence contract for Files catalogue consumers', () => {
    expect(SCRAPER_HISTORY_INDEX_FILE).toBe('history.json');
    expect(SCRAPER_HISTORY_RESULTS_DIRECTORY).toBe('results');
    expect(scraperHistoryJobsFromStoredDocument({
      jobs: [
        { id: 'job-a', finishedAt: 123, titleEn: 'Kept' },
        { id: 'job-old', titleEn: 'Legacy timestamp' },
        null,
        { titleEn: 'missing id' },
      ],
    })).toEqual([
      { id: 'job-a', finishedAt: 123, titleEn: 'Kept' },
      { id: 'job-old', finishedAt: 0, titleEn: 'Legacy timestamp' },
    ]);
    expect(scraperHistoryJobsFromStoredDocument({ jobs: {} })).toEqual([]);
    expect(scraperHistoryJobsFromStoredDocument('not an index')).toEqual([]);
  });

  it('round-trips a summary and its result', async () => {
    await recordJob(summary('job-a'), result('job-a'));
    const listed = await storedSummaries();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('job-a');
    expect(listed[0].titleJa).toBe('葬送のフリーレン');

    const stored = await storedResult('job-a');
    expect(stored?.episodes).toHaveLength(1);
    expect(stored?.metadata.studios).toEqual(['MADHOUSE']);
  });

  it('recomputes age from when the job finished, not from what it was saved with', async () => {
    await recordJob(summary('job-a', { ageMinutes: 999 }), result('job-a'));
    const listed = await storedSummaries();
    expect(listed[0].ageMinutes).toBe(0);
  });

  it('keeps provider playback credentials in memory only', async () => {
    const live = resultWithProviderStream('job-stream');
    await recordJob(summary('job-stream'), live);

    // recordJob must not mutate the live result used by the current session.
    expect(live.streams[0].playback?.headers.Authorization).toBe('Bearer secret');
    expect(live.streams[0].url).toContain('token=secret');

    const stored = await storedResult('job-stream');
    expect(stored?.streams[0].url).toBe('');
    expect(stored?.streams[0].playback).toMatchObject({
      url: '',
      headers: {},
      refreshRequired: true,
    });
  });

  it('lists the newest job first', async () => {
    await recordJob(summary('job-a'), result('job-a'));
    await recordJob(summary('job-b'), result('job-b'));
    expect((await storedSummaries()).map((j) => j.id)).toEqual(['job-b', 'job-a']);
  });

  it('replaces an entry when the same job is recorded again', async () => {
    await recordJob(summary('job-a', { found: 12 }), result('job-a'));
    await recordJob(summary('job-a', { found: 28 }), result('job-a'));
    const listed = await storedSummaries();
    expect(listed).toHaveLength(1);
    expect(listed[0].found).toBe(28);
  });

  it('prunes beyond the cap and deletes the dropped result files', async () => {
    for (let i = 0; i < 55; i += 1) {
      await recordJob(summary(`job-${i}`), result(`job-${i}`));
    }
    const listed = await storedSummaries();
    expect(listed).toHaveLength(50);
    expect(listed[0].id).toBe('job-54');
    // The oldest five are gone from the index and from disk.
    expect(listed.some((j) => j.id === 'job-0')).toBe(false);
    expect(await storedResult('job-0')).toBeNull();
    expect(await storedResult('job-54')).not.toBeNull();
  });

  it('returns null for a job that was never stored', async () => {
    expect(await storedResult('job-missing')).toBeNull();
  });

  it('refuses a job id that could escape the results directory', async () => {
    await expect(storedResult('../../evil')).resolves.toBeNull();
    // Recording swallows the error rather than failing a finished run, but
    // nothing must be written outside the store.
    await recordJob(summary('../../evil'), result('x'));
    const outside = path.join(tempRoot, 'evil.json');
    await expect(fsp.stat(outside)).rejects.toThrow();
  });

  it('survives a corrupt index instead of losing the whole page', async () => {
    await recordJob(summary('job-a'), result('job-a'));
    await fsp.writeFile(path.join(tempRoot, 'scraper', 'history.json'), '{ not json', 'utf-8');
    await expect(storedSummaries()).resolves.toEqual([]);
    // A later write repairs it.
    await recordJob(summary('job-b'), result('job-b'));
    expect((await storedSummaries()).map((j) => j.id)).toEqual(['job-b']);
  });

  it('survives valid JSON with the wrong index shape', async () => {
    await fsp.mkdir(path.join(tempRoot, 'scraper'), { recursive: true });
    await fsp.writeFile(path.join(tempRoot, 'scraper', 'history.json'), '{"jobs":{}}', 'utf-8');
    await expect(storedSummaries()).resolves.toEqual([]);
  });
});
