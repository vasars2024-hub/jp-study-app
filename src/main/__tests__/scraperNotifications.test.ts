// @vitest-environment node
//
// The Notifications settings group. Two halves, tested separately because they
// fail differently:
//
//   the decision — which events a run earned, under which toggles. Pure, and
//                  the half that a wrong answer makes *dishonest* rather than
//                  merely broken (a "ready to study" that is not).
//   the delivery — channel routing, sound and the digest window. Electron's
//                  Notification is stubbed and every raised banner recorded, so
//                  "the system channel fired" is an assertion rather than a hope.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  EpisodeRow,
  ScrapeJobSummary,
  ScrapeResult,
  StreamRow,
} from '../../shared/scraperResults';
import type { ScraperNotificationSettings } from '../../shared/scraperOutputSettings';
import type { ScraperNotice } from '../../shared/scraperNotices';

let tempRoot = '';

/** Every system banner this test raised, in order. */
const systemBanners: { title: string; body: string; silent: boolean }[] = [];
let notificationsSupported = true;

vi.mock('electron', () => {
  class FakeNotification {
    constructor(private readonly options: { title: string; body: string; silent: boolean }) {}

    static isSupported(): boolean {
      return notificationsSupported;
    }

    show(): void {
      systemBanners.push({ ...this.options });
    }
  }
  return {
    app: { getPath: () => tempRoot, getAppMetrics: () => [] },
    ipcMain: { handle: () => undefined },
    Notification: FakeNotification,
  };
});

const {
  describeDigest,
  describeNotice,
  isNoticeEnabled,
  NOTICE_TOGGLE,
  noticesForFinishedJob,
  studiableEpisodeCount,
} = await import('../../shared/scraperNotices');
const {
  flushScraperNoticeDigest,
  notifyScraper,
  resetScraperNotifications,
  SCRAPER_NOTICE_DEDUPE_MS,
  setScraperNoticeSink,
} = await import('../scraper/notifications');
const { clearScraperHistory, previousEpisodeIds, recordJob } = await import('../scraper/history');
const { setScraperStoreRoot } = await import('../scraper/store');
const { DEFAULT_SCRAPER_NOTIFICATION_SETTINGS } =
  await import('../../shared/scraperOutputSettings');

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-notify-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
});

afterAll(async () => {
  setScraperStoreRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

/** In-app notices the sink received. */
let toasts: ScraperNotice[] = [];

beforeEach(() => {
  systemBanners.length = 0;
  toasts = [];
  notificationsSupported = true;
  resetScraperNotifications();
  setScraperNoticeSink((notice) => toasts.push(notice));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetScraperNotifications();
});

function settings(over: Partial<ScraperNotificationSettings> = {}): ScraperNotificationSettings {
  return { ...DEFAULT_SCRAPER_NOTIFICATION_SETTINGS, ...over };
}

function summary(over: Partial<ScrapeJobSummary> = {}): ScrapeJobSummary {
  return {
    id: 'job-1',
    seriesId: 'anilist-21',
    titleEn: 'ONE PIECE',
    titleJa: 'ワンピース',
    provider: 'AniList',
    profile: 'balanced',
    stage: 'done',
    ageMinutes: 0,
    durationSec: 4,
    found: 3,
    failed: 0,
    bytes: 0,
    note: '',
    ...over,
  };
}

function episode(number: number): EpisodeRow {
  return {
    id: `anilist-21-e${number}`,
    seriesId: 'anilist-21',
    number,
    numberLabel: `EP 0${number}`,
    season: 1,
    titleEn: `Episode ${number}`,
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
  };
}

function stream(episodeNumber: number, subtitleUrls: string[]): StreamRow {
  return {
    id: `stream-${episodeNumber}`,
    episodeId: `anilist-21-e${episodeNumber}`,
    sourceId: 'provider',
    sourceLabel: 'Provider',
    resolution: '1080p',
    codec: 'h264',
    container: 'mp4',
    bitrateKbps: 0,
    audioLanguages: ['ja'],
    subtitleLanguages: subtitleUrls.length ? ['ja'] : [],
    latencyMs: 0,
    health: 'ok',
    expiresInSec: null,
    url: 'https://example.test/stream.mp4',
    playback: {
      providerId: 'p',
      providerLabel: 'P',
      server: 's',
      kind: 'mp4',
      url: 'https://example.test/stream.mp4',
      headers: {},
      subtitles: subtitleUrls.map((url) => ({ url, language: 'ja', default: true })),
      dubbed: false,
    },
  };
}

function result(over: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    jobId: 'job-1',
    seriesId: 'anilist-21',
    episodes: [episode(1), episode(2), episode(3)],
    streams: [],
    torrents: [],
    images: [],
    metadata: {
      seriesId: 'anilist-21',
      titleEn: 'ONE PIECE',
      titleJa: 'ワンピース',
      titleRomaji: 'ONE PIECE',
      synopsis: '',
      genres: [],
      studios: [],
      format: 'TV',
      status: 'RELEASING',
      season: '',
      episodeCount: 3,
      averageDurationSec: 1_440,
      contentRating: '',
      communityRating: 0,
      malId: null,
      aniListId: 21,
      openingTheme: '',
      endingTheme: '',
      officialSite: '',
      provenance: {},
    },
    logs: [],
    ...over,
  };
}

// ------------------------------------------------------------- the decision ---

describe('notice toggles', () => {
  it('maps every event to the field the drawer shows', () => {
    expect(NOTICE_TOGGLE).toEqual({
      complete: 'onComplete',
      error: 'onError',
      'new-episode': 'onNewEpisode',
      'schedule-run': 'onScheduleRun',
      'study-ready': 'onStudyReady',
    });
  });

  it('honours each toggle independently', () => {
    const only = settings({
      onComplete: false,
      onError: false,
      onNewEpisode: false,
      onScheduleRun: false,
      onStudyReady: true,
    });
    expect(isNoticeEnabled('study-ready', only)).toBe(true);
    expect(isNoticeEnabled('complete', only)).toBe(false);
    expect(isNoticeEnabled('error', only)).toBe(false);
  });
});

describe('studiableEpisodeCount', () => {
  // The distinction the whole 'study-ready' event rests on.
  it('counts an episode whose resolved stream carries a subtitle file', () => {
    const counted = studiableEpisodeCount(
      result({ streams: [stream(1, ['https://example.test/1.vtt'])] }),
    );
    expect(counted).toBe(1);
  });

  it('does not count a stream that advertises a language but has no file', () => {
    expect(studiableEpisodeCount(result({ streams: [stream(1, [])] }))).toBe(0);
  });

  it('does not count subtitles a torrent index merely advertises', () => {
    const advertised = result({
      episodes: [
        {
          ...episode(1),
          subtitles: [
            { language: 'ja', format: 'ass', embedded: true, quality: 0.5, source: 'nyaa' },
          ],
        },
      ],
    });
    expect(studiableEpisodeCount(advertised)).toBe(0);
  });

  it('counts one episode once however many servers resolved it', () => {
    const many = result({
      streams: [
        stream(1, ['https://example.test/a.vtt']),
        { ...stream(1, ['https://example.test/b.vtt']), id: 'stream-1b' },
      ],
    });
    expect(studiableEpisodeCount(many)).toBe(1);
  });
});

describe('noticesForFinishedJob', () => {
  it('always earns a completion notice', () => {
    const notices = noticesForFinishedJob(summary(), result(), null);
    expect(notices.map((n) => n.kind)).toEqual(['complete']);
    expect(notices[0].facts).toEqual({ subject: 'ONE PIECE', count: 3 });
  });

  // The first scrape of a finished series finds every episode it has. Calling
  // that "28 new episodes" is noise, and noise is what gets a channel muted.
  it('does not announce new episodes on a series never scraped before', () => {
    const notices = noticesForFinishedJob(summary(), result(), null);
    expect(notices.some((n) => n.kind === 'new-episode')).toBe(false);
  });

  it('announces only the episodes the previous run did not have', () => {
    const previous = new Set(['anilist-21-e1', 'anilist-21-e2']);
    const notices = noticesForFinishedJob(summary(), result(), previous);
    const fresh = notices.find((n) => n.kind === 'new-episode');
    expect(fresh?.facts.count).toBe(1);
  });

  it('says nothing when a re-run finds the same episodes', () => {
    const previous = new Set(['anilist-21-e1', 'anilist-21-e2', 'anilist-21-e3']);
    const notices = noticesForFinishedJob(summary(), result(), previous);
    expect(notices.some((n) => n.kind === 'new-episode')).toBe(false);
  });

  // Compared by id, not by count: a run that gains one episode and drops one
  // filler has the same total and is still news.
  it('notices a new episode even when the total did not change', () => {
    const previous = new Set(['anilist-21-e1', 'anilist-21-e2', 'anilist-21-e9']);
    const notices = noticesForFinishedJob(summary(), result(), previous);
    expect(notices.find((n) => n.kind === 'new-episode')?.facts.count).toBe(1);
  });

  it('earns a study-ready notice only when a subtitle file exists', () => {
    const withSubs = noticesForFinishedJob(
      summary(),
      result({ streams: [stream(1, ['https://example.test/1.vtt'])] }),
      null,
    );
    expect(withSubs.map((n) => n.kind)).toEqual(['complete', 'study-ready']);

    const without = noticesForFinishedJob(summary(), result(), null);
    expect(without.some((n) => n.kind === 'study-ready')).toBe(false);
  });

  it('falls back to the provider when a run produced no title', () => {
    const notices = noticesForFinishedJob(
      summary({ titleEn: '', titleJa: '' }),
      result(),
      null,
    );
    expect(notices[0].facts.subject).toBe('AniList');
  });
});

describe('previousEpisodeIds', () => {
  beforeEach(async () => {
    await clearScraperHistory();
  });

  it('is null when the series has never been scraped', async () => {
    expect(await previousEpisodeIds('anilist-21', 'job-2')).toBeNull();
  });

  it('returns the ids the earlier run of that series produced', async () => {
    await recordJob(summary({ id: 'job-1' }), result({ jobId: 'job-1' }));
    const ids = await previousEpisodeIds('anilist-21', 'job-2');
    // The stored (legacy) ids, plus the season-and-kind ids the same rows get today.
    expect([...(ids ?? [])].sort()).toEqual([
      'anilist-21-e1',
      'anilist-21-e2',
      'anilist-21-e3',
      'anilist-21-s1-e1',
      'anilist-21-s1-e2',
      'anilist-21-s1-e3',
    ]);
  });

  it('matches a legacy stored run against today\'s ids, so nothing is falsely new', async () => {
    await recordJob(summary({ id: 'job-1' }), result({ jobId: 'job-1' }));
    const previous = await previousEpisodeIds('anilist-21', 'job-2');
    const today = result({
      jobId: 'job-2',
      episodes: [1, 2, 3].map((n) => ({ ...episode(n), id: `anilist-21-s1-e${n}` })),
    });
    const kinds = noticesForFinishedJob(summary({ id: 'job-2' }), today, previous).map((n) => n.kind);
    expect(kinds).not.toContain('new-episode');
  });

  it('skips an earlier run that found nothing, rather than calling everything new', async () => {
    await recordJob(summary({ id: 'job-1' }), result({ jobId: 'job-1', episodes: [episode(1)] }));
    vi.setSystemTime(Date.now() + 60_000);
    await recordJob(summary({ id: 'job-2', found: 0 }), result({ jobId: 'job-2', episodes: [] }));
    const ids = await previousEpisodeIds('anilist-21', 'job-3');
    expect(ids?.has('anilist-21-e1')).toBe(true);
    expect(ids?.has('anilist-21-e2')).toBe(false);
  });

  it('is null when every earlier run found nothing', async () => {
    await recordJob(summary({ id: 'job-1', found: 0 }), result({ jobId: 'job-1', episodes: [] }));
    expect(await previousEpisodeIds('anilist-21', 'job-2')).toBeNull();
  });

  // Otherwise a re-run would be compared against itself and never be new.
  it('excludes the run doing the asking', async () => {
    await recordJob(summary({ id: 'job-1' }), result({ jobId: 'job-1' }));
    expect(await previousEpisodeIds('anilist-21', 'job-1')).toBeNull();
  });

  it('ignores runs of a different series', async () => {
    await recordJob(
      summary({ id: 'job-1', seriesId: 'anilist-99' }),
      result({ jobId: 'job-1', seriesId: 'anilist-99' }),
    );
    expect(await previousEpisodeIds('anilist-21', 'job-2')).toBeNull();
  });
});

// -------------------------------------------------------------- the delivery ---

describe('notifyScraper channels', () => {
  it('shows an in-app toast on the toast channel and no banner', () => {
    notifyScraper('complete', settings({ channel: 'toast' }), { subject: 'ONE PIECE', count: 3 });
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Scrape complete');
    expect(toasts[0].body).toBe('ONE PIECE — 3 episodes.');
    expect(systemBanners).toEqual([]);
  });

  it('raises a system banner on the system channel and no toast', () => {
    notifyScraper('complete', settings({ channel: 'system' }), { subject: 'ONE PIECE', count: 3 });
    expect(systemBanners).toHaveLength(1);
    expect(systemBanners[0].title).toBe('Scrape complete');
    expect(toasts).toEqual([]);
  });

  it('does both on the both channel', () => {
    notifyScraper('complete', settings({ channel: 'both' }), { subject: 'ONE PIECE', count: 3 });
    expect(toasts).toHaveLength(1);
    expect(systemBanners).toHaveLength(1);
  });

  it('does nothing at all on the none channel', () => {
    const raised = notifyScraper('complete', settings({ channel: 'none' }), {
      subject: 'ONE PIECE',
      count: 3,
    });
    expect(raised).toBe(false);
    expect(toasts).toEqual([]);
    expect(systemBanners).toEqual([]);
  });

  it('stays silent for an event whose toggle is off, whatever the channel', () => {
    const raised = notifyScraper('complete', settings({ channel: 'both', onComplete: false }), {
      subject: 'ONE PIECE',
      count: 3,
    });
    expect(raised).toBe(false);
    expect(toasts).toEqual([]);
    expect(systemBanners).toEqual([]);
  });

  it('marks the banner silent when sound is off, and audible when on', () => {
    notifyScraper('complete', settings({ channel: 'system', soundEnabled: false }), {
      subject: 'A',
      count: 1,
    });
    notifyScraper('complete', settings({ channel: 'system', soundEnabled: true }), {
      subject: 'B',
      count: 1,
    });
    expect(systemBanners.map((banner) => banner.silent)).toEqual([true, false]);
  });

  it('passes the sound flag to the in-app surface too', () => {
    notifyScraper('complete', settings({ channel: 'toast', soundEnabled: true }), {
      subject: 'A',
      count: 1,
    });
    expect(toasts[0].sound).toBe(true);
  });

  // A missing window or an unsupported platform must never fail the run that
  // produced the notice.
  it('survives a platform with no system notifications', () => {
    notificationsSupported = false;
    expect(() =>
      notifyScraper('complete', settings({ channel: 'system' }), { subject: 'A', count: 1 })).not.toThrow();
    expect(systemBanners).toEqual([]);
  });

  it('survives having no window to toast into', () => {
    setScraperNoticeSink(null);
    expect(() =>
      notifyScraper('complete', settings({ channel: 'toast' }), { subject: 'A', count: 1 })).not.toThrow();
  });

  it('carries the job id so a notice can be traced back', () => {
    notifyScraper('error', settings({ channel: 'toast' }), {
      subject: 'https://example.test — nothing matched',
      count: 0,
      correlationId: 'job-7',
    });
    expect(toasts[0].correlationId).toBe('job-7');
    expect(toasts[0].kind).toBe('error');
  });
});

describe('notice safety and language (P7)', () => {
  it('redacts a secret quoted in a failure message, on both surfaces', () => {
    notifyScraper('error', settings({ channel: 'both' }), {
      subject: 'https://t.test/rss?passkey=abc123 — 403',
      count: 0,
    });
    expect(toasts[0].body).not.toContain('abc123');
    expect(systemBanners[0].body).not.toContain('abc123');
    expect(toasts[0].body).toContain('passkey=‹redacted›');
  });

  it('drops an identical notice raised again within the window, not after it', () => {
    const toast = settings({ channel: 'toast' });
    expect(notifyScraper('complete', toast, { subject: 'A', count: 1 })).toBe(true);
    expect(notifyScraper('complete', toast, { subject: 'A', count: 1 })).toBe(false);
    expect(notifyScraper('complete', toast, { subject: 'A', count: 2 })).toBe(true);
    expect(toasts).toHaveLength(2);
    vi.advanceTimersByTime(SCRAPER_NOTICE_DEDUPE_MS);
    expect(notifyScraper('complete', toast, { subject: 'A', count: 1 })).toBe(true);
    expect(toasts).toHaveLength(3);
  });

  it('translates title and body through the main-process language', async () => {
    const { setMainLang } = await import('../i18n');
    const { ensureCatalog } = await import('../../shared/i18n/catalogs');
    await ensureCatalog('ja');
    setMainLang('ja');
    try {
      notifyScraper('complete', settings({ channel: 'toast' }), { subject: 'ONE PIECE', count: 3 });
      expect(toasts[0].title).toBe('スクレイプ完了');
      expect(toasts[0].body).toBe('ONE PIECE — 3 話。');
    } finally {
      setMainLang('en');
    }
  });
});

describe('digest window', () => {
  it('delivers nothing until the window closes', () => {
    const digest = settings({ channel: 'toast', digestMinutes: 5 });
    notifyScraper('complete', digest, { subject: 'A', count: 1 });
    notifyScraper('complete', digest, { subject: 'B', count: 2 });
    expect(toasts).toEqual([]);

    vi.advanceTimersByTime(5 * 60_000);
    expect(toasts).toHaveLength(1);
  });

  it('groups the window by event kind rather than listing every item', () => {
    const digest = settings({ channel: 'toast', digestMinutes: 1 });
    notifyScraper('complete', digest, { subject: 'A', count: 1 });
    notifyScraper('complete', digest, { subject: 'B', count: 1 });
    notifyScraper('error', digest, { subject: 'boom', count: 0 });

    vi.advanceTimersByTime(60_000);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Scraper — 3 updates');
    expect(toasts[0].body).toBe('2 scrapes complete · 1 failure');
  });

  it('opens a fresh window after the first one closes', () => {
    const digest = settings({ channel: 'toast', digestMinutes: 1 });
    notifyScraper('complete', digest, { subject: 'A', count: 1 });
    vi.advanceTimersByTime(60_000);
    notifyScraper('complete', digest, { subject: 'B', count: 1 });
    vi.advanceTimersByTime(60_000);
    expect(toasts).toHaveLength(2);
  });

  it('still drops an event whose toggle is off before the window sees it', () => {
    const digest = settings({ channel: 'toast', digestMinutes: 1, onError: false });
    notifyScraper('error', digest, { subject: 'boom', count: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toasts).toEqual([]);
  });

  it('delivers immediately at zero minutes', () => {
    notifyScraper('complete', settings({ channel: 'toast', digestMinutes: 0 }), {
      subject: 'A',
      count: 1,
    });
    expect(toasts).toHaveLength(1);
  });

  it('flushes what it is holding when asked, without waiting', () => {
    notifyScraper('complete', settings({ channel: 'toast', digestMinutes: 30 }), {
      subject: 'A',
      count: 1,
    });
    flushScraperNoticeDigest();
    expect(toasts).toHaveLength(1);
  });

  it('flushing an empty window delivers nothing', () => {
    flushScraperNoticeDigest();
    expect(toasts).toEqual([]);
  });
});

describe('notice text', () => {
  it('states the count rather than an opinion about it', () => {
    expect(describeNotice('complete', { subject: 'Frieren', count: 1 })).toEqual({
      title: 'Scrape complete',
      body: 'Frieren — 1 episode.',
    });
    expect(describeNotice('study-ready', { subject: 'Frieren', count: 4 }).body).toBe(
      'Frieren — 4 episodes with a subtitle track.',
    );
  });

  it('reports a failure as the message the run produced', () => {
    expect(describeNotice('error', { subject: 'Nothing matched "xyz".', count: 0 })).toEqual({
      title: 'Scrape failed',
      body: 'Nothing matched "xyz".',
    });
  });

  it('orders a digest with the failures last', () => {
    const { body } = describeDigest([
      { kind: 'error', facts: { subject: 'x', count: 0 } },
      { kind: 'complete', facts: { subject: 'y', count: 1 } },
      { kind: 'schedule-run', facts: { subject: 'z', count: 0 } },
    ]);
    expect(body).toBe('1 scrape complete · 1 scheduled run · 1 failure');
  });
});
