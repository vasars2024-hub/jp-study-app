// Catalogue lookups for the scrape engine.
//
// `mediaProviderClients.ts` already talks to Jikan and AniList for the Library
// and Discover surfaces, and Discover still uses it. The scraper needs three
// things that client does not expose: the per-episode Japanese title, the
// filler/recap flags the episode-processing settings filter on, and every
// request narrated onto the scraper's own log bus so the Logs tab shows what a
// run actually did.
//
// So this is a second, thinner client over the same public APIs — read-only
// catalogue metadata, no keys, no media.

import type { SeriesMetadata } from '../../shared/scraperResults';
import type {
  ScraperMetadataSettings,
  ScraperTitleLanguage,
} from '../../shared/scraperOutputSettings';
import { isScraperAbortError, scraperRequest } from './http';
import { scraperLog } from './logBus';

const JIKAN = 'https://api.jikan.moe/v4';
const ANILIST = 'https://graphql.anilist.co';
/** Jikan asks for ≤3 requests/second; one every 400 ms stays well inside it. */
const PAGE_DELAY_MS = 400;
/**
 * How far to page an episode list.
 *
 * This was 5 (500 episodes) on the reasoning that a longer list is noise, which
 * held while the list was only ever *displayed*. It stopped holding once it
 * became the thing a download range is picked from: the cap is not a display
 * limit any more, it is the last episode the user is allowed to ask for.
 * Fifteen pages covers the genuine long-runners; the loop still exits at the
 * first empty page, so an ordinary cour costs exactly one request.
 */
const MAX_EPISODE_PAGES = 15;

export interface CatalogueWork {
  provider: 'mal' | 'anilist';
  id: number;
  titleEn: string;
  titleJa: string;
  titleRomaji: string;
  synopsis: string;
  genres: string[];
  studios: string[];
  format: string;
  status: string;
  season: string;
  episodeCount: number;
  averageDurationSec: number;
  contentRating: string;
  communityRating: number;
  malId: number | null;
  aniListId: number | null;
  officialSite: string;
  posterUrl: string;
  /**
   * Every format the provider published the cover in, keyed by file extension.
   *
   * `posterUrl` stays the canonical choice — Discover and everything older read
   * it. This is what lets `images.preferredFormat` pick a variant when the
   * provider offers one, and fall back to the canonical URL when it does not.
   */
  posterVariants: Record<string, string>;
  /** '' when the provider publishes no banner. Jikan never does. */
  bannerUrl: string;
  year: number | null;
}

export interface CatalogueEpisode {
  number: number;
  titleEn: string;
  titleJa: string;
  titleRomaji: string;
  airDate: string | null;
  filler: boolean;
  recap: boolean;
  url: string;
  /** '' unless the provider publishes a per-episode still. Jikan's list does not. */
  thumbnailUrl: string;
}

interface JikanAnime {
  mal_id?: number;
  url?: string;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  titles?: { type?: string; title?: string }[];
  synopsis?: string;
  type?: string;
  status?: string;
  episodes?: number;
  duration?: string;
  rating?: string;
  score?: number;
  season?: string;
  year?: number;
  genres?: { name?: string }[];
  studios?: { name?: string }[];
  images?: {
    jpg?: { large_image_url?: string; image_url?: string };
    // Jikan publishes the same cover in both formats. This is the one place a
    // provider gives `images.preferredFormat` a real choice to make.
    webp?: { large_image_url?: string; image_url?: string };
  };
  external?: { name?: string; url?: string }[];
}

interface JikanEpisode {
  mal_id?: number;
  url?: string;
  title?: string;
  title_japanese?: string;
  title_romanji?: string;
  aired?: string;
  filler?: boolean;
  recap?: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `24 min per ep` / `1 hr 52 min` → seconds. 0 when the string says nothing. */
export function parseDurationSec(text: string | undefined): number {
  if (!text) return 0;
  const hours = /(\d+)\s*hr/i.exec(text);
  const minutes = /(\d+)\s*min/i.exec(text);
  const seconds = /(\d+)\s*sec/i.exec(text);
  const total =
    (hours ? Number(hours[1]) * 3_600 : 0)
    + (minutes ? Number(minutes[1]) * 60 : 0)
    + (seconds ? Number(seconds[1]) : 0);
  return Number.isFinite(total) ? total : 0;
}

function pickTitle(anime: JikanAnime, type: string): string {
  const match = anime.titles?.find((t) => t.type?.toLowerCase() === type);
  return match?.title ?? '';
}

export function toCatalogueWork(anime: JikanAnime): CatalogueWork {
  const external = anime.external ?? [];
  return {
    provider: 'mal',
    id: anime.mal_id ?? 0,
    titleEn: anime.title_english || anime.title || '',
    titleJa: anime.title_japanese || pickTitle(anime, 'japanese'),
    titleRomaji: anime.title || pickTitle(anime, 'default'),
    synopsis: anime.synopsis ?? '',
    genres: (anime.genres ?? []).map((g) => g.name ?? '').filter(Boolean),
    studios: (anime.studios ?? []).map((s) => s.name ?? '').filter(Boolean),
    format: anime.type ?? '',
    status: anime.status ?? '',
    season: [anime.season, anime.year].filter(Boolean).join(' '),
    episodeCount: anime.episodes ?? 0,
    averageDurationSec: parseDurationSec(anime.duration),
    contentRating: anime.rating ?? '',
    communityRating: anime.score ?? 0,
    malId: anime.mal_id ?? null,
    aniListId: null,
    officialSite: external.find((e) => /official/i.test(e.name ?? ''))?.url ?? '',
    posterUrl: anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url ?? '',
    posterVariants: {
      ...(jikanImage(anime, 'jpg') ? { jpg: jikanImage(anime, 'jpg') } : {}),
      ...(jikanImage(anime, 'webp') ? { webp: jikanImage(anime, 'webp') } : {}),
    },
    bannerUrl: '',
    year: anime.year ?? null,
  };
}

/** The largest cover Jikan published in one format, or '' if it published none. */
function jikanImage(anime: JikanAnime, format: 'jpg' | 'webp'): string {
  const set = anime.images?.[format];
  return set?.large_image_url ?? set?.image_url ?? '';
}

async function getJson<T>(url: string, correlationId: string): Promise<T | null> {
  const response = await scraperRequest(url, { correlationId });
  if (response.status !== 200) {
    scraperLog('warn', 'catalogue', `${url} answered ${response.status}.`, { correlationId });
    return null;
  }
  try {
    return JSON.parse(response.body) as T;
  } catch {
    scraperLog('warn', 'catalogue', `${url} did not return JSON.`, { correlationId });
    return null;
  }
}

// ------------------------------------------------------------------ AniList ---

interface AnilistMedia {
  id?: number;
  idMal?: number;
  title?: { romaji?: string; english?: string; native?: string };
  description?: string;
  format?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  episodes?: number;
  duration?: number;
  averageScore?: number;
  isAdult?: boolean;
  genres?: string[];
  studios?: { nodes?: { name?: string }[] };
  coverImage?: { extraLarge?: string; large?: string };
  bannerImage?: string;
  externalLinks?: { site?: string; url?: string }[];
  airingSchedule?: { nodes?: { episode?: number; airingAt?: number }[] };
  streamingEpisodes?: { title?: string; thumbnail?: string }[];
}

/** Shared by the search and by-id queries so the two can never drift apart. */
const ANILIST_MEDIA_FIELDS = `
      id idMal
      title { romaji english native }
      description(asHtml: false)
      format status season seasonYear episodes duration averageScore isAdult
      genres
      studios(isMain: true) { nodes { name } }
      coverImage { extraLarge large }
      bannerImage
      externalLinks { site url }
      airingSchedule(perPage: 100) { nodes { episode airingAt } }
      streamingEpisodes { title thumbnail }`;

const ANILIST_QUERY = `
query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
${ANILIST_MEDIA_FIELDS}
    }
  }
}`;

const ANILIST_BY_ID_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
${ANILIST_MEDIA_FIELDS}
  }
}`;

const ANILIST_ID_BY_MAL_QUERY = `
query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
  }
}`;

/** AniList episode lists arrive with the search, so they are kept for reuse. */
const anilistEpisodeCache = new Map<number, CatalogueEpisode[]>();

function anilistToWork(media: AnilistMedia): CatalogueWork {
  return {
    provider: 'anilist',
    id: media.id ?? 0,
    titleEn: media.title?.english ?? media.title?.romaji ?? '',
    titleJa: media.title?.native ?? '',
    titleRomaji: media.title?.romaji ?? '',
    // AniList descriptions carry a little HTML even with asHtml:false.
    synopsis: (media.description ?? '').replace(/<[^>]+>/g, '').trim(),
    genres: media.genres ?? [],
    studios: (media.studios?.nodes ?? []).map((s) => s.name ?? '').filter(Boolean),
    format: media.format ?? '',
    status: media.status ?? '',
    season: [media.season?.toLowerCase(), media.seasonYear].filter(Boolean).join(' '),
    episodeCount: media.episodes ?? 0,
    averageDurationSec: (media.duration ?? 0) * 60,
    contentRating: media.isAdult ? 'R+' : '',
    // AniList scores out of 100; the UI's scale is out of 10, like MAL's.
    communityRating: media.averageScore ? Math.round(media.averageScore) / 10 : 0,
    malId: media.idMal ?? null,
    aniListId: media.id ?? null,
    officialSite:
      media.externalLinks?.find((l) => /official/i.test(l.site ?? ''))?.url ?? '',
    posterUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? '',
    // AniList serves one cover URL, whose format is whatever its extension
    // says. Keyed by that so `preferredFormat` can match it when it happens to
    // agree, and fall back rather than fabricate a variant when it does not.
    posterVariants: formatKeyed(media.coverImage?.extraLarge ?? media.coverImage?.large ?? ''),
    bannerUrl: media.bannerImage ?? '',
    year: media.seasonYear ?? null,
  };
}

/** `…/cover.webp?x=1` → `{ webp: url }`. `{}` when the URL names no format. */
function formatKeyed(url: string): Record<string, string> {
  if (!url) return {};
  const match = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
  if (!match) return {};
  const format = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  return { [format]: url };
}

/**
 * Builds an episode list from what AniList publishes.
 *
 * There is no per-episode endpoint, so the list is assembled from the airing
 * schedule (numbers and dates) widened to the declared episode count, with
 * `streamingEpisodes` supplying titles where it has them. That is less than
 * Jikan gives, and the missing fields are left empty rather than invented.
 */
function anilistEpisodes(media: AnilistMedia): CatalogueEpisode[] {
  const aired = new Map<number, number>();
  for (const node of media.airingSchedule?.nodes ?? []) {
    if (typeof node.episode === 'number' && typeof node.airingAt === 'number') {
      aired.set(node.episode, node.airingAt);
    }
  }
  const titles = media.streamingEpisodes ?? [];
  const total = Math.max(media.episodes ?? 0, ...[...aired.keys(), 0]);
  const episodes: CatalogueEpisode[] = [];
  for (let number = 1; number <= total; number += 1) {
    const airingAt = aired.get(number);
    // `Episode 1 - The Title` is the shape AniList uses here.
    const raw = titles[number - 1]?.title ?? '';
    const title = raw.replace(/^\s*episode\s*\d+\s*[-–—:]\s*/i, '').trim();
    episodes.push({
      number,
      titleEn: title,
      titleJa: '',
      titleRomaji: '',
      airDate: airingAt ? new Date(airingAt * 1_000).toISOString().slice(0, 10) : null,
      // AniList does not classify fillers or recaps.
      filler: false,
      recap: false,
      url: media.id ? `https://anilist.co/anime/${media.id}` : '',
      // A real per-episode still, where AniList has one. This is the only
      // source of genuine thumbnails either provider offers.
      thumbnailUrl: titles[number - 1]?.thumbnail ?? '',
    });
  }
  return episodes;
}

async function searchAnilist(
  query: string,
  correlationId: string,
  limit: number,
): Promise<CatalogueWork[]> {
  const response = await scraperRequest(ANILIST, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: query, perPage: limit } }),
    correlationId,
  });
  if (response.status !== 200) {
    scraperLog('warn', 'catalogue', `AniList answered ${response.status}.`, { correlationId });
    return [];
  }
  try {
    const json = JSON.parse(response.body) as { data?: { Page?: { media?: AnilistMedia[] } } };
    const media = json.data?.Page?.media ?? [];
    const works: CatalogueWork[] = [];
    for (const item of media) {
      const work = anilistToWork(item);
      if (!work.id) continue;
      anilistEpisodeCache.set(work.id, anilistEpisodes(item));
      works.push(work);
    }
    return works;
  } catch {
    scraperLog('warn', 'catalogue', 'AniList did not return JSON.', { correlationId });
    return [];
  }
}

// ------------------------------------------------------------------- search ---

/** The provider ids `metadata.providerOrder` may name, and what each one calls. */
const PROVIDER_LABELS: Record<string, string> = { jikan: 'Jikan', mal: 'Jikan', anilist: 'AniList' };

async function searchJikan(
  query: string,
  correlationId: string,
  limit: number,
): Promise<CatalogueWork[]> {
  const url = `${JIKAN}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=false`;
  const json = await getJson<{ data?: JikanAnime[] }>(url, correlationId);
  return (json?.data ?? []).map(toCatalogueWork).filter((w) => w.id > 0);
}

/**
 * Title search across both catalogues, in the order the profile asks for.
 *
 * `metadata.providerOrder` decides who is asked first; the default puts Jikan
 * there because it carries per-episode titles, air dates and the filler/recap
 * flags the episode-processing settings act on. Whoever is second is a fallback
 * rather than a widener: when MyAnimeList is down — which it observably is from
 * time to time, and Jikan then answers 504 — a run that dies is worse than a
 * run with a thinner episode list.
 *
 * An unknown id in the list is skipped with a log line rather than failing the
 * search: the field is free text in the settings drawer, and a typo should cost
 * one provider, not the run.
 */
export async function searchCatalogue(
  query: string,
  correlationId: string,
  limit = 5,
  providerOrder: readonly string[] = ['jikan', 'anilist'],
): Promise<CatalogueWork[]> {
  scraperLog('info', 'catalogue', `Searching the catalogue for "${query}".`, { correlationId });

  const order: string[] = [];
  for (const raw of providerOrder) {
    const id = raw.trim().toLowerCase();
    const canonical = id === 'mal' ? 'jikan' : id;
    if (!PROVIDER_LABELS[canonical]) {
      scraperLog('warn', 'catalogue', `Ignoring unknown metadata provider "${raw}".`, {
        correlationId,
      });
      continue;
    }
    if (!order.includes(canonical)) order.push(canonical);
  }
  // An order that named nothing usable still has to search something; falling
  // back to the shipped order beats returning "nothing matches".
  if (!order.length) order.push('jikan', 'anilist');

  for (const [index, provider] of order.entries()) {
    const label = PROVIDER_LABELS[provider];
    let works: CatalogueWork[] = [];
    try {
      works = provider === 'anilist'
        ? await searchAnilist(query, correlationId, limit)
        : await searchJikan(query, correlationId, limit);
    } catch (error) {
      // A refused connection, DNS failure or timeout is exactly when the next
      // configured provider matters. Keep the failure visible in logs, but do
      // not turn a fallback order into a single point of failure.
      scraperLog('warn', 'catalogue', `${label} request failed: ${String(error)}`, {
        correlationId,
      });
    }
    if (works.length) {
      scraperLog('info', 'catalogue', `${works.length} candidate title(s) from ${label}.`, {
        correlationId,
      });
      return works;
    }
    const next = order[index + 1];
    scraperLog(
      next ? 'info' : 'warn',
      'catalogue',
      next
        ? `${label} returned nothing; asking ${PROVIDER_LABELS[next]}.`
        : `${label} returned nothing, and no provider is left to ask.`,
      { correlationId },
    );
  }
  return [];
}

/**
 * Resolve the AniList identity required by Seanime's provider APIs.
 *
 * Jikan is the preferred catalogue because it has richer episode metadata, but
 * its id is a MAL id. Phase 4 must bridge that identity explicitly instead of
 * passing a MAL id to an AniList-shaped Seanime route.
 */
export async function resolveAniListId(
  work: CatalogueWork,
  correlationId: string,
): Promise<number | null> {
  if (work.aniListId) return work.aniListId;
  if (!work.malId) return null;

  const response = await scraperRequest(ANILIST, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      query: ANILIST_ID_BY_MAL_QUERY,
      variables: { idMal: work.malId },
    }),
    correlationId,
  });
  if (response.status !== 200) {
    scraperLog(
      'warn',
      'catalogue',
      `AniList identity lookup answered ${response.status} for MAL ${work.malId}.`,
      { correlationId },
    );
    return null;
  }
  try {
    const payload = JSON.parse(response.body) as { data?: { Media?: { id?: number } } };
    const id = payload.data?.Media?.id;
    return typeof id === 'number' && id > 0 ? id : null;
  } catch {
    scraperLog('warn', 'catalogue', 'AniList identity lookup did not return JSON.', {
      correlationId,
    });
    return null;
  }
}

/**
 * The one work behind a catalogue id, without searching for it by name.
 *
 * The search path exists because a scrape starts from whatever the user typed.
 * A download started from the Discover console starts from something stronger —
 * the entry they actually clicked — and re-searching its title would be a
 * chance to match the wrong season of a long-running series. This asks the
 * provider for that exact record instead.
 */
export async function catalogueWorkById(
  provider: 'mal' | 'jikan' | 'anilist',
  id: number,
  correlationId: string,
): Promise<CatalogueWork | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  if (provider === 'anilist') {
    const response = await scraperRequest(ANILIST, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_BY_ID_QUERY, variables: { id } }),
      correlationId,
    });
    if (response.status !== 200) {
      scraperLog('warn', 'catalogue', `AniList answered ${response.status} for id ${id}.`, {
        correlationId,
      });
      return null;
    }
    try {
      const json = JSON.parse(response.body) as { data?: { Media?: AnilistMedia } };
      const media = json.data?.Media;
      if (!media?.id) return null;
      const work = anilistToWork(media);
      // The episode list rides along with the record, exactly as it does on the
      // search path — `catalogueEpisodes` reads it from here.
      anilistEpisodeCache.set(work.id, anilistEpisodes(media));
      return work;
    } catch {
      scraperLog('warn', 'catalogue', 'AniList id lookup did not return JSON.', { correlationId });
      return null;
    }
  }

  const json = await getJson<{ data?: JikanAnime }>(`${JIKAN}/anime/${id}/full`, correlationId);
  if (!json?.data) return null;
  const work = toCatalogueWork(json.data);
  return work.id > 0 ? work : null;
}

/** One entry's numbering facts and the entries it is a sequel of (for season mapping). */
export interface CataloguePrequelHop {
  id: number;
  format: string;
  episodes: number;
  titles: string[];
  /** Direct prequels, TV entries first. */
  prequelIds: number[];
}

const ANILIST_RELATIONS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id format episodes
    title { romaji english native }
    relations { edges { relationType node { id type format } } }
  }
}`;

interface JikanRelation {
  relation?: string;
  entry?: { mal_id?: number; type?: string; name?: string }[];
}

/**
 * One step along an entry's prequel chain: its format, episode count, titles
 * and direct prequels. `null` when the catalogue did not answer — the caller
 * then treats the chain as incomplete and invents no offset.
 */
export async function cataloguePrequelHop(
  provider: 'mal' | 'jikan' | 'anilist',
  id: number,
  correlationId: string,
): Promise<CataloguePrequelHop | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (provider === 'anilist') {
    const response = await scraperRequest(ANILIST, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_RELATIONS_QUERY, variables: { id } }),
      correlationId,
    });
    if (response.status !== 200) return null;
    try {
      const media = (JSON.parse(response.body) as {
        data?: { Media?: AnilistMedia & { relations?: { edges?: { relationType?: string; node?: { id?: number; type?: string; format?: string } }[] } } };
      }).data?.Media;
      if (!media?.id) return null;
      const prequels = (media.relations?.edges ?? [])
        .filter((edge) => edge.relationType === 'PREQUEL' && edge.node?.type === 'ANIME' && typeof edge.node.id === 'number')
        .sort((a, b) => Number(/^TV/.test(b.node?.format ?? '')) - Number(/^TV/.test(a.node?.format ?? '')))
        .map((edge) => Number(edge.node?.id));
      return {
        id: media.id,
        format: media.format ?? '',
        episodes: media.episodes ?? 0,
        titles: [media.title?.english, media.title?.romaji, media.title?.native].filter((t): t is string => Boolean(t)),
        prequelIds: prequels,
      };
    } catch {
      return null;
    }
  }
  const json = await getJson<{ data?: JikanAnime & { relations?: JikanRelation[] } }>(`${JIKAN}/anime/${id}/full`, correlationId);
  const anime = json?.data;
  if (!anime?.mal_id) return null;
  const prequels = (anime.relations ?? [])
    .filter((r) => (r.relation ?? '').toLowerCase() === 'prequel')
    .flatMap((r) => r.entry ?? [])
    .filter((e) => e.type === 'anime' && typeof e.mal_id === 'number')
    .map((e) => e.mal_id as number);
  return {
    id: anime.mal_id,
    format: anime.type ?? '',
    episodes: anime.episodes ?? 0,
    titles: [anime.title_english, anime.title, anime.title_japanese, ...(anime.titles ?? []).map((t) => t.title)]
      .filter((t): t is string => Boolean(t)),
    prequelIds: prequels,
  };
}

/** Jikan's rate limit between the hops of a chain walk. */
export const CATALOGUE_HOP_DELAY_MS = PAGE_DELAY_MS;

/**
 * Full detail for one title — what the Metadata tab renders.
 *
 * AniList's search already returns everything its detail query would, so only
 * the Jikan path makes a second request.
 */
export async function catalogueDetail(
  work: CatalogueWork,
  correlationId: string,
): Promise<CatalogueWork | null> {
  if (work.provider !== 'mal') return work;
  const json = await getJson<{ data?: JikanAnime }>(
    `${JIKAN}/anime/${work.id}/full`,
    correlationId,
  );
  return json?.data ? toCatalogueWork(json.data) : work;
}

/**
 * The episode list, paged.
 *
 * Stops at the first empty page rather than trusting the pagination flag, so a
 * provider that reports `has_next_page` forever cannot spin this loop.
 */
export async function catalogueEpisodes(
  work: CatalogueWork,
  correlationId: string,
  onPage?: (page: number, count: number) => void,
  /**
   * Called when a page *failed* (an error status or a body that is not JSON) as
   * opposed to coming back empty. The list returned is then a partial one; the
   * caller says so instead of presenting a truncated list as the whole show.
   */
  onIncomplete?: (page: number) => void,
): Promise<CatalogueEpisode[]> {
  if (work.provider === 'anilist') {
    // Already built during the search — AniList publishes it as part of the
    // media record rather than behind its own endpoint.
    const cached = anilistEpisodeCache.get(work.id) ?? [];
    onPage?.(1, cached.length);
    return cached;
  }

  const malId = work.id;
  const episodes: CatalogueEpisode[] = [];
  for (let page = 1; page <= MAX_EPISODE_PAGES; page += 1) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const json = await getJson<{
      data?: JikanEpisode[];
      pagination?: { has_next_page?: boolean };
    }>(`${JIKAN}/anime/${malId}/episodes?page=${page}`, correlationId).catch((error: unknown) => {
      // A network failure on page one is the run's failure; on a later page it
      // leaves a partial list, which is reported below. Cancellation always
      // propagates.
      if (page === 1 || isScraperAbortError(error)) throw error;
      return null;
    });
    if (json === null) {
      scraperLog('warn', 'catalogue', `Episode page ${page} failed; the episode list is incomplete.`, {
        correlationId,
      });
      onIncomplete?.(page);
      break;
    }
    const rows = json?.data ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      const number = row.mal_id;
      if (typeof number !== 'number') continue;
      const aired = row.aired ? Date.parse(row.aired) : Number.NaN;
      episodes.push({
        number,
        titleEn: row.title ?? '',
        titleJa: row.title_japanese ?? '',
        titleRomaji: row.title_romanji ?? '',
        airDate: Number.isFinite(aired) ? new Date(aired).toISOString().slice(0, 10) : null,
        filler: Boolean(row.filler),
        recap: Boolean(row.recap),
        url: row.url ?? '',
        // Jikan's episode list carries no still. Left empty rather than filled
        // with the series poster, which is not a thumbnail of this episode.
        thumbnailUrl: '',
      });
    }
    onPage?.(page, episodes.length);
    if (!json?.pagination?.has_next_page) break;
  }
  return episodes;
}

/** The provider label shown in the UI and recorded as provenance. */
export function providerLabel(work: CatalogueWork): string {
  return work.provider === 'anilist' ? 'AniList' : 'MyAnimeList (Jikan)';
}

/**
 * Which of a work's titles the Metadata group's Title Language asks for.
 *
 * Each choice falls back through the others: a title that exists in only one
 * language is still a better answer than a blank.
 */
export function workTitleFor(work: CatalogueWork, language: ScraperTitleLanguage): string {
  switch (language) {
    case 'romaji':
      return work.titleRomaji || work.titleEn || work.titleJa;
    case 'native':
      return work.titleJa || work.titleEn || work.titleRomaji;
    default:
      return work.titleEn || work.titleRomaji || work.titleJa;
  }
}

/**
 * Projects a catalogue work onto the Metadata tab's shape.
 *
 * `settings` is optional so the projection still works outside a profile — the
 * download dialog and the tests both call it that way — but inside a run it is
 * what makes the group's toggles mean something. A field the user turned off is
 * emptied *and* dropped from `provenance`, because provenance is the record of
 * where a value came from and there is no value to account for.
 */
export function toSeriesMetadata(
  work: CatalogueWork,
  seriesId: string,
  settings?: ScraperMetadataSettings,
): SeriesMetadata {
  const source = providerLabel(work);
  const wants = (flag: boolean | undefined) => flag !== false;
  const synopsis = wants(settings?.fetchSynopsis) ? work.synopsis : '';
  const genres = wants(settings?.fetchGenres) ? work.genres : [];
  const rating = wants(settings?.fetchRatings) ? work.communityRating : 0;
  // `fetchStaff` is deliberately not read. It says "Staff and Cast", and neither
  // endpoint used here returns either — `studios` is the production credit, not
  // staff, so gating it on that toggle would empty a populated field to make a
  // setting look wired. It stays inert until a staff lookup exists.
  const { studios } = work;
  const titleJa = wants(settings?.alsoStoreNativeTitle) ? work.titleJa : '';
  const provenance: SeriesMetadata['provenance'] = {
    titleEn: source,
    episodeCount: source,
  };
  if (titleJa) provenance.titleJa = source;
  if (synopsis) provenance.synopsis = source;
  if (genres.length) provenance.genres = source;
  if (studios.length) provenance.studios = source;
  if (rating) provenance.communityRating = source;

  return {
    seriesId,
    titleEn: workTitleFor(work, settings?.titleLanguage ?? 'english'),
    titleJa,
    titleRomaji: work.titleRomaji,
    synopsis,
    genres,
    studios,
    format: work.format,
    status: work.status,
    season: work.season,
    episodeCount: work.episodeCount,
    averageDurationSec: work.averageDurationSec,
    contentRating: work.contentRating,
    communityRating: rating,
    malId: work.malId,
    aniListId: work.aniListId,
    // Neither theme is published by the endpoints used here; an empty string is
    // honest, a placeholder would not be.
    openingTheme: '',
    endingTheme: '',
    officialSite: work.officialSite,
    provenance,
  };
}
