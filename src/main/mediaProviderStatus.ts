/**
 * Live availability of the metadata sources the library actually uses.
 *
 * The Settings "Media providers" card used to be a JSON editor over a document
 * nothing wrote — a list of providers that did not exist. It now lists the
 * four real clients (Jikan / MyAnimeList, AniList, TVmaze, TMDB) and asks each
 * one whether it answers, so "why did my drama get no poster" has an answer.
 */
import { httpRequest } from './providers/providerHttp';
import { tmdbAvailable, tmdbSearchMovie, tmdbSearchTv } from './providers/tmdb';
import type { ProviderWork } from './mediaProviderClients';
import { tvmazeSearch } from './providers/tvmaze';
import { hasSubtitleProviderKey, openSubtitlesSearchDetailed } from './subtitleProviderClients';

export type MediaProviderStatusId = 'jikan' | 'anilist' | 'tvmaze' | 'tmdb';

export interface MediaProviderStatus {
  id: MediaProviderStatusId;
  /** `ok`: answered; `down`: no answer; `needs-key`: TMDB without a key. */
  state: 'ok' | 'down' | 'needs-key';
  latencyMs?: number;
}

const PROBES: Record<MediaProviderStatusId, { url: string; method?: string; body?: string; headers?: Record<string, string> }> = {
  jikan: { url: 'https://api.jikan.moe/v4/anime/1' },
  anilist: {
    url: 'https://graphql.anilist.co',
    method: 'POST',
    body: JSON.stringify({ query: '{ Media(id: 1) { id } }' }),
    headers: { 'Content-Type': 'application/json' },
  },
  tvmaze: { url: 'https://api.tvmaze.com/shows/1' },
  tmdb: { url: 'https://api.themoviedb.org/3/configuration' },
};

/** Any HTTP answer below 500 (a 401 from TMDB included) means the service is up. */
export function stateFromStatus(status: number): 'ok' | 'down' {
  return status > 0 && status < 500 ? 'ok' : 'down';
}

export async function probeMediaProviders(): Promise<MediaProviderStatus[]> {
  const ids: MediaProviderStatusId[] = ['jikan', 'anilist', 'tvmaze', 'tmdb'];
  return Promise.all(ids.map(async (id): Promise<MediaProviderStatus> => {
    if (id === 'tmdb' && !tmdbAvailable()) return { id, state: 'needs-key' };
    const probe = PROBES[id];
    const started = Date.now();
    try {
      const answer = await httpRequest(probe.url, { method: probe.method, body: probe.body, headers: probe.headers });
      return { id, state: stateFromStatus(answer.status), latencyMs: Date.now() - started };
    } catch {
      return { id, state: 'down' };
    }
  }));
}

// ---------------------------------------------------------------------------
// Unified search: dramas and films, and subtitle availability
// ---------------------------------------------------------------------------


export interface TvFilmSearchHit {
  provider: 'tvmaze' | 'tmdb';
  id: string;
  title: string;
  nativeTitle?: string;
  year?: number;
  posterUrl?: string;
  kind: 'tv' | 'movie';
  genres: string[];
  rating?: number;
  network?: string;
  country?: string;
}

function hitOf(work: ProviderWork, kind: 'tv' | 'movie'): TvFilmSearchHit {
  return {
    provider: work.provider === 'tmdb' ? 'tmdb' : 'tvmaze',
    id: `${work.provider}:${work.tmdbType ?? kind}:${work.id}`,
    title: work.displayTitle,
    ...(work.nativeTitle ? { nativeTitle: work.nativeTitle } : {}),
    ...(work.year ? { year: work.year } : {}),
    ...(work.posterUrl ? { posterUrl: work.posterUrl } : {}),
    kind,
    genres: work.genres ?? [],
    ...(work.rating ? { rating: work.rating } : {}),
    ...(work.network ? { network: work.network } : {}),
    ...(work.country ? { country: work.country } : {}),
  };
}

/** Dramas and films by title: TVmaze (no key) and, with a key, TMDB films and series. */
export async function searchTvAndFilm(query: string): Promise<TvFilmSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const [shows, films, tv] = await Promise.all([
    tvmazeSearch(q).catch(() => null),
    tmdbSearchMovie(q).catch(() => null),
    tmdbSearchTv(q).catch(() => null),
  ]);
  return [
    ...(shows ?? []).slice(0, 8).map((w) => hitOf(w, 'tv')),
    ...(tv ?? []).slice(0, 6).map((w) => hitOf(w, 'tv')),
    ...(films ?? []).slice(0, 8).map((w) => hitOf(w, 'movie')),
  ];
}

export interface SubtitleAvailabilityHit {
  language: string;
  releases: number;
  sample: string[];
}

/**
 * Whether subtitles exist for a title, per language, before anything is
 * downloaded — one OpenSubtitles title search (it needs a key). `null` when no
 * key is set, so the search can say so rather than report "none".
 */
export async function subtitleAvailability(query: string, languages: readonly string[]): Promise<SubtitleAvailabilityHit[] | null> {
  const q = query.trim();
  if (!q || !hasSubtitleProviderKey('opensubtitles')) return null;
  const langs = [...new Set(languages.map((l) => l.trim().toLowerCase()).filter(Boolean))];
  const reply = await openSubtitlesSearchDetailed({ title: q, season: null, episode: null, languages: langs });
  const byLang = new Map<string, string[]>();
  for (const candidate of reply.candidates) {
    const lang = (candidate.language || '').toLowerCase();
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(candidate.releaseName);
  }
  return [...byLang].map(([language, names]) => ({ language, releases: names.length, sample: names.slice(0, 3) }));
}
