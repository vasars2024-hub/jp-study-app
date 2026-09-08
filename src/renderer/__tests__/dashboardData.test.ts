/*
 * The Dashboard's derivations.
 *
 * These exist because until 2026-08-02 the Dashboard rendered `data/fixtures.ts`
 * end to end — invented series, invented `*.example` source hosts, a scheduled
 * run "in 3h" on an install with nothing scheduled. Rewiring it to the port
 * meant deciding, for the first time, what the real data actually means: what
 * counts as a failed job, what "next scheduled" is when nothing is, what one
 * series means when six jobs touched it.
 */
import { describe, expect, it } from 'vitest';
import type {
  DownloadRow,
  EpisodeRow,
  ScrapeJobSummary,
  SourceStatus,
} from '../../shared/scraperResults';
import type { ScraperSchedulerState } from '../../shared/scraperIpc';
import {
  activeJobs,
  distinctEpisodes,
  distinctSeries,
  downloadedBytes,
  failedDownloads,
  healthySources,
  jobOutcome,
  nextScheduledRun,
  queuedDownloads,
  recentJobs,
} from '../components/scraper/data/dashboardData';

function job(partial: Partial<ScrapeJobSummary>): ScrapeJobSummary {
  return {
    id: 'job-1',
    seriesId: 'anilist-1',
    titleEn: 'A Series',
    titleJa: 'あるシリーズ',
    provider: 'AniList',
    profile: 'balanced',
    stage: 'done',
    ageMinutes: 10,
    durationSec: 15,
    found: 12,
    failed: 0,
    bytes: 0,
    note: '',
    ...partial,
  };
}

function download(partial: Partial<DownloadRow>): DownloadRow {
  return {
    id: 'dl-1',
    episodeId: 'ep-1',
    title: 'Episode 1',
    subtitle: '',
    state: 'queued',
    receivedBytes: 0,
    totalBytes: 0,
    speedBps: 0,
    etaSec: null,
    destination: '',
    error: '',
    ...partial,
  };
}

function source(partial: Partial<SourceStatus>): SourceStatus {
  return {
    id: 'jikan',
    label: 'Jikan',
    host: 'api.jikan.moe',
    kind: 'metadata',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    health: 'ok',
    latencyMs: 100,
    supportsSubtitles: false,
    requiresAuth: false,
    history: [1],
    ...partial,
  } as SourceStatus;
}

describe('jobOutcome', () => {
  it('calls a clean run done', () => {
    expect(jobOutcome(job({ stage: 'done', found: 12, failed: 0 }))).toBe('done');
  });

  it('calls a partial run a warning, not a success', () => {
    // The real ONE PIECE job on the dev machine: found 1147, failed 1078. The
    // fixture list had four fixed outcomes and no way to derive this one, so a
    // run that lost most of what it looked for showed a green dot.
    expect(jobOutcome(job({ stage: 'done', found: 1147, failed: 1078 }))).toBe('warning');
  });

  it('calls a run that found nothing a failure even when it reports done', () => {
    expect(jobOutcome(job({ stage: 'done', found: 0, failed: 0 }))).toBe('failed');
  });

  it('reports the terminal stage ahead of the counts', () => {
    expect(jobOutcome(job({ stage: 'cancelled', found: 5, failed: 0 }))).toBe('cancelled');
    expect(jobOutcome(job({ stage: 'failed', found: 5, failed: 0 }))).toBe('failed');
  });
});

describe('activeJobs / recentJobs', () => {
  const jobs = [
    job({ id: 'a', stage: 'done', ageMinutes: 30 }),
    job({ id: 'b', stage: 'parsing', ageMinutes: 0 }),
    job({ id: 'c', stage: 'done', ageMinutes: 5 }),
    job({ id: 'd', stage: 'cancelled', ageMinutes: 60 }),
  ];

  it('treats every non-terminal stage as in flight', () => {
    expect(activeJobs(jobs).map((j) => j.id)).toEqual(['b']);
  });

  it('lists finished jobs newest first', () => {
    // ageMinutes counts backwards from now, so ascending is newest-first.
    expect(recentJobs(jobs).map((j) => j.id)).toEqual(['c', 'a', 'd']);
  });

  it('does not mutate the array it was handed', () => {
    const original = jobs.map((j) => j.id);
    recentJobs(jobs);
    expect(jobs.map((j) => j.id)).toEqual(original);
  });
});

describe('distinctSeries', () => {
  it('collapses repeated scrapes of one series to its newest job', () => {
    const rows = distinctSeries([
      job({ id: 'old', seriesId: 'anilist-21', ageMinutes: 900, found: 1118 }),
      job({ id: 'new', seriesId: 'anilist-21', ageMinutes: 30, found: 1147 }),
      job({ id: 'other', seriesId: 'anilist-99', ageMinutes: 60, found: 28 }),
    ]);
    expect(rows.map((r) => [r.seriesId, r.jobId, r.episodes])).toEqual([
      ['anilist-21', 'new', 1147],
      ['anilist-99', 'other', 28],
    ]);
  });

  it('honours the limit', () => {
    const many = [1, 2, 3, 4, 5].map((n) => job({ id: `j${n}`, seriesId: `s${n}`, ageMinutes: n }));
    expect(distinctSeries(many, 3)).toHaveLength(3);
  });
});

describe('downloads', () => {
  const rows = [
    download({ id: '1', state: 'queued' }),
    download({ id: '2', state: 'downloading' }),
    download({ id: '3', state: 'paused' }),
    download({ id: '4', state: 'done' }),
    download({ id: '5', state: 'failed' }),
  ];

  it('counts anything not finished as outstanding', () => {
    expect(queuedDownloads(rows)).toBe(3);
  });

  it('counts failures separately', () => {
    expect(failedDownloads(rows)).toBe(1);
  });
});

describe('nextScheduledRun', () => {
  const now = Date.parse('2026-08-02T12:00:00Z');
  const state = (entries: ScraperSchedulerState['entries']): ScraperSchedulerState => ({
    entries,
    heldBy: '',
    runningJobIds: [],
  });

  it('returns nothing when the scheduler has no dated entries', () => {
    // The state on a machine that has never scheduled anything — where the page
    // used to print "in 3h · One Piece · Thorough · daily at 03:00".
    expect(nextScheduledRun(null, now)).toBeNull();
    expect(nextScheduledRun(state([]), now)).toBeNull();
    expect(
      nextScheduledRun(state([{ id: 'a', lastRunAt: null, nextRunAt: null, lastJobId: null }]), now),
    ).toBeNull();
  });

  it('picks the soonest of several', () => {
    expect(
      nextScheduledRun(
        state([
          { id: 'late', lastRunAt: null, nextRunAt: '2026-08-02T18:00:00Z', lastJobId: null },
          { id: 'soon', lastRunAt: null, nextRunAt: '2026-08-02T12:30:00Z', lastJobId: null },
        ]),
        now,
      ),
    ).toEqual({ entryId: 'soon', inMinutes: 30 });
  });

  it('floors an overdue entry at zero rather than reporting negative time', () => {
    expect(
      nextScheduledRun(
        state([{ id: 'overdue', lastRunAt: null, nextRunAt: '2026-08-02T11:00:00Z', lastJobId: null }]),
        now,
      ),
    ).toEqual({ entryId: 'overdue', inMinutes: 0 });
  });

  it('skips an unparseable date instead of rendering NaN', () => {
    expect(
      nextScheduledRun(
        state([{ id: 'bad', lastRunAt: null, nextRunAt: 'not a date', lastJobId: null }]),
        now,
      ),
    ).toBeNull();
  });
});

describe('sources and bytes', () => {
  it('counts only healthy sources', () => {
    expect(
      healthySources([
        source({ id: 'a', health: 'ok' }),
        source({ id: 'b', health: 'degraded' }),
        source({ id: 'c', health: 'offline' }),
      ]),
    ).toBe(1);
  });

  it('sums job bytes and ignores a non-finite one', () => {
    expect(
      downloadedBytes([
        job({ id: 'a', bytes: 1000 }),
        job({ id: 'b', bytes: 2000 }),
        job({ id: 'c', bytes: Number.NaN }),
      ]),
    ).toBe(3000);
  });
});

/*
 * D319b — "Episodes indexed" counted rows, not episodes.
 *
 * Measured live 2026-09-08 on the user's own history: 10 jobs over 5 series,
 * with ONE PIECE scraped twice (1,147 rows each, 1,147 of 1,147 ids identical)
 * and Frieren scraped five times (28 rows each). The Dashboard summed the rows
 * and printed 2,453 in three places; the catalogue holds 1,193 episodes. It is
 * the same double-count `resultLibrary` was fixed for, still live here.
 */
function episode(partial: Partial<EpisodeRow>): EpisodeRow {
  return {
    id: 'anilist-21-e1',
    seriesId: 'anilist-21',
    number: 1,
    numberLabel: '1',
    season: 1,
    titleEn: 'An Episode',
    titleJa: 'あるエピソード',
    kind: 'episode',
    audio: [],
    resolution: '1080p',
    sourceId: 'catalogue',
    sourceLabel: 'Catalogue',
    sizeBytes: 0,
    durationSec: 1440,
    airDate: null,
    url: '',
    thumbnailUrl: null,
    subtitles: [],
    status: 'ready',
    statusNote: '',
    ...partial,
  } as EpisodeRow;
}

describe('distinctEpisodes', () => {
  it('counts one episode once however many runs returned it', () => {
    const twice = [
      episode({ id: 'anilist-21-e1' }),
      episode({ id: 'anilist-21-e2', number: 2 }),
      // Second scrape of the same series: identical ids, new rows.
      episode({ id: 'anilist-21-e1' }),
      episode({ id: 'anilist-21-e2', number: 2 }),
    ];
    expect(twice).toHaveLength(4);
    expect(distinctEpisodes(twice).indexed).toBe(2);
  });

  it('does not merge different episodes that share a number across series', () => {
    expect(distinctEpisodes([
      episode({ id: 'anilist-21-e1', seriesId: 'anilist-21' }),
      episode({ id: 'anilist-154587-e1', seriesId: 'anilist-154587' }),
    ]).indexed).toBe(2);
  });

  it('deduplicates the Japanese-track count on the same identity', () => {
    const ja = { language: 'ja', label: 'Japanese', kind: 'subtitle' } as unknown as
      EpisodeRow['subtitles'][number];
    const rows = [
      episode({ id: 'anilist-21-e1', subtitles: [ja] }),
      episode({ id: 'anilist-21-e1', subtitles: [ja] }),
      episode({ id: 'anilist-21-e2', number: 2 }),
    ];
    expect(distinctEpisodes(rows)).toEqual({ indexed: 2, japanese: 1 });
  });

  it('keeps an id-less row rather than collapsing every one of them into one', () => {
    // Control for the dedupe key itself: falling back to a constant would make
    // any number of unidentifiable rows read as a single episode.
    const rows = [
      episode({ id: '', seriesId: 's', number: 1 }),
      episode({ id: '', seriesId: 's', number: 2 }),
    ];
    expect(distinctEpisodes(rows).indexed).toBe(2);
  });

  it('is empty for no rows', () => {
    expect(distinctEpisodes([])).toEqual({ indexed: 0, japanese: 0 });
  });
});
