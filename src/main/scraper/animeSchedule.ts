// Airing schedule -> torrent index, the network half.
//
// The schedule comes from AniList, which this app already talks to
// (`catalogue.ts` uses the same endpoint). No second anime API is introduced:
// a second catalogue means two disagreeing episode numberings, and the whole
// point of this surface is that the schedule is authoritative.
//
// Releases come from the same Nyaa RSS reader the Torrent Manager uses
// (`torrents.ts`), so a release parsed here and a release parsed there are the
// same object with the same fields.
//
// Pacing is explicit. `scraperRequest` applies the safety policy only when a
// scrape *runtime* is active (`http.ts:580-581`), and a schedule read is not a
// scrape job — so without the delay below this would fan out one unthrottled
// request per scheduled episode at whatever speed the event loop allows.

import {
  matchScheduleReleases,
  releaseQueryFor,
  scheduleReleaseKey,
  summariseSchedule,
  type AiringEntry,
  type AnimeScheduleRequest,
  type AnimeScheduleResponse,
} from '../../shared/animeSchedule';
import type { TorrentRow } from '../../shared/scraperResults';
import { DEFAULT_TRACKERS, buildIndexUrl, parseTorrentFeed } from './torrents';
import { scraperRequest } from './http';
import { scraperLog } from './logBus';

const ANILIST = 'https://graphql.anilist.co';
const NYAA_HOST = 'nyaa.si';

/**
 * Gap between index requests.
 *
 * `safetyPolicy.ts` defaults nyaa.si to 60 requests/minute; 1.2 s keeps this
 * comfortably under that even though the policy is not enforcing it here.
 */
const INDEX_DELAY_MS = 1_200;

/** Ceiling on schedule entries per read, so one wide window cannot fan out forever. */
const MAX_ENTRIES = 40;
const ANILIST_PER_PAGE = 50;

const CORRELATION = 'anime-schedule';

const ANILIST_SCHEDULE_QUERY = `
query ($from: Int, $to: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      episode
      airingAt
      media {
        id
        title { romaji english native }
        format
        episodes
        siteUrl
        coverImage { large }
      }
    }
  }
}`;

interface AniListScheduleNode {
  episode?: number;
  airingAt?: number;
  media?: {
    id?: number;
    title?: { romaji?: string; english?: string; native?: string };
    format?: string;
    episodes?: number;
    siteUrl?: string;
    coverImage?: { large?: string };
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

function toEntry(node: AniListScheduleNode): AiringEntry | null {
  const media = node.media;
  const episode = node.episode;
  const airingAt = node.airingAt;
  if (!media?.id || typeof episode !== 'number' || typeof airingAt !== 'number') return null;

  const titles = [media.title?.romaji, media.title?.english, media.title?.native]
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());
  if (titles.length === 0) return null;

  return {
    mediaId: media.id,
    episode,
    airingAt,
    titles: [...new Set(titles)],
    displayTitle: titles[0],
    format: media.format ?? null,
    episodeCount: typeof media.episodes === 'number' ? media.episodes : null,
    siteUrl: media.siteUrl ?? '',
    coverUrl: media.coverImage?.large ?? '',
  };
}

/**
 * Scheduled episodes airing in a window.
 *
 * Throws rather than returning `[]` on a transport failure: an empty schedule
 * and an unreachable catalogue are different answers, and the caller renders
 * them differently.
 */
export async function fetchAiringSchedule(
  from: number,
  to: number,
  limit = MAX_ENTRIES,
): Promise<{ entries: AiringEntry[]; total: number }> {
  const entries: AiringEntry[] = [];
  let total = 0;
  let page = 1;

  // AniList pages at 50; stop as soon as the cap is met rather than draining
  // the window, which for a busy season is several hundred rows.
  while (page <= 5) {
    const response = await scraperRequest(ANILIST, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        query: ANILIST_SCHEDULE_QUERY,
        variables: { from, to, page, perPage: ANILIST_PER_PAGE },
      }),
      correlationId: CORRELATION,
    });

    if (response.status !== 200) {
      throw new Error(`AniList answered ${response.status}.`);
    }

    let parsed: {
      data?: { Page?: { pageInfo?: { hasNextPage?: boolean }; airingSchedules?: AniListScheduleNode[] } };
      errors?: { message?: string }[];
    };
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new Error('AniList returned a body that is not JSON.');
    }
    if (parsed.errors?.length) {
      throw new Error(parsed.errors.map((e) => e.message ?? 'unknown').join('; '));
    }

    const nodes = parsed.data?.Page?.airingSchedules ?? [];
    total += nodes.length;
    for (const node of nodes) {
      const entry = toEntry(node);
      if (entry) entries.push(entry);
      if (entries.length >= limit) return { entries, total };
    }
    if (!parsed.data?.Page?.pageInfo?.hasNextPage) break;
    page += 1;
  }

  return { entries, total };
}

/**
 * Releases the index has for one scheduled episode.
 *
 * `null` means the lookup failed and the row must say so. `[]` means the index
 * answered and genuinely has nothing — a real and common state on the day a
 * show airs, and it must not be reported as an error.
 */
export async function fetchReleasesFor(entry: AiringEntry): Promise<TorrentRow[] | null> {
  const url = buildIndexUrl(NYAA_HOST, { text: releaseQueryFor(entry), category: '1_0' });
  try {
    const response = await scraperRequest(url, { correlationId: CORRELATION });
    if (response.status !== 200) {
      scraperLog('warn', 'schedule', `${NYAA_HOST} answered ${response.status} for "${entry.displayTitle}".`, {
        correlationId: CORRELATION,
      });
      return null;
    }
    return parseTorrentFeed(response.body, { tracker: 'Nyaa', trackers: [...DEFAULT_TRACKERS] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog('error', 'schedule', `${NYAA_HOST} failed for "${entry.displayTitle}": ${message}`, {
      correlationId: CORRELATION,
    });
    return null;
  }
}

/** The whole read: schedule, then one paced index lookup per scheduled episode. */
export async function loadAnimeSchedule(
  request: AnimeScheduleRequest,
): Promise<AnimeScheduleResponse> {
  const limit = Math.max(1, Math.min(MAX_ENTRIES, request.limit ?? MAX_ENTRIES));
  const fetchedAt = Date.now();

  let entries: AiringEntry[] = [];
  let scheduleTotal = 0;
  try {
    const schedule = await fetchAiringSchedule(request.from, request.to, limit);
    entries = schedule.entries;
    scheduleTotal = schedule.total;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog('error', 'schedule', `Airing schedule unavailable: ${message}`, {
      correlationId: CORRELATION,
    });
    return {
      rows: [],
      summary: { total: 0, exact: 0, review: 0, none: 0, searchFailed: 0 },
      scheduleError: message,
      scheduleTotal: 0,
      fetchedAt,
    };
  }

  scraperLog('info', 'schedule', `${entries.length} scheduled episodes in window.`, {
    correlationId: CORRELATION,
  });

  // Keyed by show and episode: keyed by show alone, episode 6's search replaced
  // episode 5's when both aired inside the window, and episode 5 was matched
  // against episode 6's releases.
  const releases = new Map<string, readonly TorrentRow[] | null>();
  if (!request.scheduleOnly) {
    // Sequential and paced on purpose. Promise.all here would issue one request
    // per scheduled episode simultaneously, which is exactly the behaviour a
    // public index blocks for.
    for (const [index, entry] of entries.entries()) {
      if (index > 0) await sleep(INDEX_DELAY_MS);
      releases.set(scheduleReleaseKey(entry), await fetchReleasesFor(entry));
    }
  }

  const rows = request.scheduleOnly
    ? entries.map((entry) => ({
      entry,
      release: null,
      disposition: 'none' as const,
      confidence: 0,
      matchedTitle: '',
      reason: 'search-failed' as const,
      consideredCount: 0,
      episodeMatchCount: 0,
      scheduleSource: 'anilist' as const,
      releaseSource: null,
    }))
    : matchScheduleReleases(entries, releases, { allowBatches: request.allowBatches });

  const summary = summariseSchedule(rows);
  scraperLog('info', 'schedule', `${summary.exact} exact, ${summary.review} review, ${summary.none} without a release.`, {
    correlationId: CORRELATION,
  });

  return { rows, summary, scheduleError: null, scheduleTotal, fetchedAt };
}
