/**
 * TVmaze — TV series and live-action drama metadata. No key.
 *
 * The anime databases know nothing about a Japanese live-action drama, a
 * Western series or a documentary, so without this every one of those stayed
 * `unmatched` forever with a frame grab for a poster. TVmaze covers them all,
 * including Japanese dramas (`Naoki Hanzawa`, TBS) and most TV anime (as
 * `type: Animation`), and it lists the whole episode run — titles, air dates,
 * runtimes and per-episode stills — in the same answer as the show.
 *
 * One request per series: `singlesearch/shows` with `embed[]=episodes`,
 * `embed[]=akas` and `embed[]=images` returns the show, its run, its alternate
 * titles and its poster/background art together (verified against the live API
 * on 2026-09-23; the fixtures under `__tests__/fixtures/metadata` are those
 * answers). `search/shows` is asked only when the single best hit does not
 * score, to look at the runners-up.
 *
 * TVmaze allows 20 calls per 10 seconds per IP and answers 429 beyond that, so
 * the limiter runs at 2/s. Images are served from `static.tvmaze.com`, which
 * `downloadArtwork`'s host allowlist admits.
 */

import type { ProviderEpisode, ProviderWork } from '../mediaProviderClients';
import {
  METADATA_ACCEPT_CONFIDENCE,
  pickMetadataMatch,
  type MetadataMatch,
  type MetadataTarget,
} from '../../shared/mediaMetadataMatch';
import {
  RateLimiter,
  num,
  readCache,
  requestJsonStatus,
  plainTextFromHtml,
  text,
  writeCache,
  yearOf,
} from './providerHttp';

const TVMAZE = 'https://api.tvmaze.com';
const EMBEDS = 'embed%5B%5D=episodes&embed%5B%5D=akas&embed%5B%5D=images';

/** 20 per 10 s is TVmaze's published ceiling; this stays just under it. */
const limiter = new RateLimiter(2, 110);

export interface TvmazeImage {
  id?: number;
  type?: string | null;
  main?: boolean;
  resolutions?: {
    original?: { url?: string | null; width?: number | null; height?: number | null } | null;
    medium?: { url?: string | null; width?: number | null; height?: number | null } | null;
  } | null;
}

export interface TvmazeEpisode {
  id?: number;
  name?: string | null;
  season?: number | null;
  number?: number | null;
  /** `regular`, `significant_special`, `insignificant_special`. */
  type?: string | null;
  airdate?: string | null;
  airstamp?: string | null;
  runtime?: number | null;
  image?: { medium?: string | null; original?: string | null } | null;
}

interface TvmazeChannel {
  name?: string | null;
  country?: { code?: string | null } | null;
}

export interface TvmazeShow {
  id: number;
  name?: string | null;
  /** `Scripted`, `Animation`, `Documentary`, `Reality`, … */
  type?: string | null;
  language?: string | null;
  genres?: string[] | null;
  status?: string | null;
  runtime?: number | null;
  averageRuntime?: number | null;
  premiered?: string | null;
  rating?: { average?: number | null } | null;
  weight?: number | null;
  network?: TvmazeChannel | null;
  webChannel?: TvmazeChannel | null;
  externals?: { imdb?: string | null; thetvdb?: number | null } | null;
  image?: { medium?: string | null; original?: string | null } | null;
  summary?: string | null;
  _embedded?: {
    episodes?: TvmazeEpisode[] | null;
    akas?: Array<{ name?: string | null; country?: { code?: string | null } | null }> | null;
    images?: TvmazeImage[] | null;
  } | null;
}

/** Han, kana and hangul — what makes an alternate title a native one. */
const NATIVE_SCRIPT = /[぀-ヿ㐀-鿿가-힯]/;

/**
 * The poster, background and banner out of a show's image list.
 *
 * `main` is TVmaze's own pick and wins when present; otherwise the first poster
 * and the widest background. Only `original` resolutions are kept — `medium`
 * posters are 210 px wide, smaller than the library's own tiles.
 */
export function tvmazeImages(images: readonly TvmazeImage[] | null | undefined): {
  poster?: string;
  background?: string;
  banner?: string;
} {
  const list = (images ?? []).filter((image) => text(image?.resolutions?.original?.url));
  const pick = (type: string, widest = false): string | undefined => {
    const ofType = list.filter((image) => image.type === type);
    const main = ofType.find((image) => image.main);
    if (main) return text(main.resolutions?.original?.url);
    if (widest) {
      const sorted = [...ofType].sort((a, b) =>
        (num(b.resolutions?.original?.width) ?? 0) - (num(a.resolutions?.original?.width) ?? 0));
      return text(sorted[0]?.resolutions?.original?.url);
    }
    return text(ofType[0]?.resolutions?.original?.url);
  };
  return { poster: pick('poster'), background: pick('background', true), banner: pick('banner') };
}

/**
 * The regular episodes of a run. Specials are dropped: TVmaze numbers them
 * `null`, and a file named `S01E05` must never be matched to one.
 */
export function tvmazeEpisodes(episodes: readonly TvmazeEpisode[] | null | undefined): ProviderEpisode[] {
  const out: ProviderEpisode[] = [];
  for (const episode of episodes ?? []) {
    if (episode?.type && episode.type !== 'regular') continue;
    const number = num(episode?.number ?? undefined);
    if (number === undefined) continue;
    const stamp = Date.parse(episode.airstamp ?? episode.airdate ?? '');
    out.push({
      season: num(episode.season ?? undefined),
      number,
      title: text(episode.name),
      airedAt: Number.isFinite(stamp) ? stamp : undefined,
      runtimeMin: num(episode.runtime ?? undefined),
      stillUrl: text(episode.image?.original) ?? text(episode.image?.medium),
    });
  }
  return out;
}

/** A TVmaze show, embeds and all, in the shape every provider shares. */
export function tvmazeToWork(show: TvmazeShow): ProviderWork {
  const akas = (show._embedded?.akas ?? [])
    .map((aka) => text(aka?.name))
    .filter((name): name is string => Boolean(name));
  const name = text(show.name) ?? akas[0] ?? '';
  const images = tvmazeImages(show._embedded?.images);
  const episodes = tvmazeEpisodes(show._embedded?.episodes);
  const channel = show.network ?? show.webChannel ?? null;
  return {
    provider: 'tvmaze',
    id: show.id,
    tvmazeId: show.id,
    titles: [...new Set([name, ...akas].filter(Boolean))],
    displayTitle: name,
    nativeTitle: akas.find((aka) => NATIVE_SCRIPT.test(aka)),
    synopsis: plainTextFromHtml(show.summary),
    year: yearOf(show.premiered),
    // The format vocabulary the matcher shares with Jikan and AniList, so a
    // parsed `S01E05` scores its format match here too.
    format: 'TV',
    status: text(show.status),
    episodeCount: episodes.length > 0 ? episodes.length : undefined,
    genres: (show.genres ?? []).map((genre) => text(genre)).filter((genre): genre is string => Boolean(genre)),
    rating: num(show.rating?.average ?? undefined),
    popularity: num(show.weight ?? undefined),
    posterUrl: images.poster ?? text(show.image?.original) ?? text(show.image?.medium),
    // TVmaze "banners" are the old 758x140 TheTVDB strips — lower quality than
    // the 1920x1080 backgrounds, which make the better hero when cropped.
    backdropUrl: images.background,
    imdbId: text(show.externals?.imdb),
    runtimeMin: num(show.averageRuntime ?? undefined) ?? num(show.runtime ?? undefined),
    network: text(channel?.name),
    language: text(show.language)?.toLowerCase(),
    country: text(channel?.country?.code)?.toUpperCase(),
    animation: text(show.type)?.toLowerCase() === 'animation',
    showType: text(show.type)?.toLowerCase(),
    episodes,
  };
}

/** A show with its embeds, or `null` for "no such show"; `down` when unanswered. */
async function single(title: string): Promise<{ show: TvmazeShow | null; down: boolean }> {
  const query = title.trim();
  if (!query) return { show: null, down: false };
  const key = `tvmaze:single:${query.toLowerCase()}`;
  const cached = readCache<TvmazeShow>(key);
  if (cached && num(cached.id) !== undefined) return { show: cached, down: false };
  const answer = await requestJsonStatus<TvmazeShow>(
    `${TVMAZE}/singlesearch/shows?q=${encodeURIComponent(query)}&${EMBEDS}`,
    limiter,
  );
  // `singlesearch` answers an empty result with a 404 (body `null`). That is a
  // real answer about the title; only a missing answer counts as down.
  if (answer.status === 404) return { show: null, down: false };
  if (answer.status === 0) return { show: null, down: true };
  const show = answer.data;
  if (!show || num(show.id) === undefined) return { show: null, down: false };
  writeCache(key, show);
  return { show, down: false };
}

/**
 * Up to ten scored candidates for a title, without embeds. `null` when TVmaze
 * did not answer — the same contract as `jikanSearch`.
 */
export async function tvmazeSearch(title: string): Promise<ProviderWork[] | null> {
  const query = title.trim();
  if (!query) return [];
  const key = `tvmaze:search:${query.toLowerCase()}`;
  const cached = readCache<Array<{ show?: TvmazeShow }>>(key);
  let rows = cached;
  if (!rows) {
    const answer = await requestJsonStatus<Array<{ show?: TvmazeShow }>>(
      `${TVMAZE}/search/shows?q=${encodeURIComponent(query)}`,
      limiter,
    );
    if (answer.status === 0 || !Array.isArray(answer.data)) return answer.status === 0 ? null : [];
    rows = answer.data;
    writeCache(key, rows);
  }
  return rows
    .map((row) => row?.show)
    .filter((show): show is TvmazeShow => Boolean(show) && num(show?.id) !== undefined)
    .map(tvmazeToWork);
}

/** One show by id, with its run, alternate titles and images. */
export async function tvmazeShowById(id: number): Promise<ProviderWork | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const key = `tvmaze:show:${id}`;
  const cached = readCache<TvmazeShow>(key);
  if (cached && num(cached.id) !== undefined) return tvmazeToWork(cached);
  const answer = await requestJsonStatus<TvmazeShow>(`${TVMAZE}/shows/${id}?${EMBEDS}`, limiter);
  const show = answer.data;
  if (!show || num(show.id) === undefined) return null;
  writeCache(key, show);
  return tvmazeToWork(show);
}

export interface TvmazeFindResult {
  match: MetadataMatch<ProviderWork> | null;
  /** TVmaze never answered, so an empty `match` says nothing about the title. */
  down: boolean;
}

/**
 * The best TVmaze show for a target, scored by the same rules as every other
 * provider.
 *
 * `titles` are other names the work is known by — an anime match's English
 * title, say, because TVmaze indexes anime under its English name while the
 * file carries the romaji one. Each is both a query (tried in order until one
 * scores) and a name the candidates are scored against.
 */
export async function findTvmazeShow(
  target: MetadataTarget,
  titles: ReadonlyArray<string | undefined> = [],
): Promise<TvmazeFindResult> {
  const queries = [...new Set(
    [target.title, ...titles]
      .map((title) => (title ?? '').trim())
      .filter(Boolean),
  )].slice(0, 3);
  const targets = queries.map((title) => ({ ...target, title }));
  const better = (
    current: MetadataMatch<ProviderWork> | null,
    candidates: readonly ProviderWork[],
  ): MetadataMatch<ProviderWork> | null => {
    let best = current;
    for (const each of targets) {
      const match = pickMetadataMatch(each, candidates);
      if (match && (!best || match.confidence > best.confidence)) best = match;
    }
    return best;
  };

  let down = false;
  let best: MetadataMatch<ProviderWork> | null = null;
  for (const query of queries) {
    const answer = await single(query);
    down = down || answer.down;
    if (answer.show) best = better(best, [tvmazeToWork(answer.show)]);
    if (best && best.confidence >= METADATA_ACCEPT_CONFIDENCE) return { match: best, down: false };
  }

  // The single best hit did not score: look at the runners-up for the primary
  // title before settling. One extra request, only in the uncertain case.
  const runnersUp = await tvmazeSearch(target.title);
  if (runnersUp === null) down = true;
  else best = better(best, runnersUp);

  if (best && !best.candidate.episodes?.length) {
    // A `search/shows` row carries no embeds; fetch the show it picked.
    const full = await tvmazeShowById(best.candidate.id);
    if (full) return { match: { ...best, candidate: full }, down: false };
  }
  return { match: best, down: best ? false : down };
}
