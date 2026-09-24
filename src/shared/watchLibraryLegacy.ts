/**
 * The two older "my list" stores, folded into the watch library.
 *
 * Before the watch library there were two more lists in the renderer's
 * localStorage, neither of which the library (what Gum shows) could see:
 *
 *  - `jp-media-tracking-v1` — the §7 tracking records (status `planned` /
 *    `on-hold`, rating 0–100), fed by the tracking dashboard, the provider
 *    panel and the AI agent's `anime.track`.
 *  - `jp-discovery-shortlist-v1` — the Discover console's shortlist.
 *
 * Both become watch-library titles with source `manual`. Their rows are only
 * *read*: the old keys stay where they are, and the renderer records how far
 * it has migrated (`watchLegacyMigration.ts`), so a record written to the old
 * store later still arrives. Pure: rows in, observations out.
 */

import type { MediaTrackingRecord } from './mediaTracking';
import type { DiscoveryCandidate } from './mediaDiscovery';
import {
  isWatchKind,
  isWatchStatus,
  type WatchKind,
  type WatchObservation,
  type WatchStatus,
} from './watchLibrary';

/** One legacy row, already resolved to a readable title, as it crosses to main. */
export interface WatchLegacyRow {
  origin: 'tracking' | 'shortlist';
  kind: WatchKind;
  title: string;
  originalTitle?: string;
  altTitles?: string[];
  year?: number;
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  tvmazeId?: number;
  imdbId?: string;
  /** Tracking rows only; a shortlist row is always "plan to watch". */
  status: WatchStatus;
  /** 0–10. */
  score?: number;
  progress?: number;
  episodeCount?: number;
  favorite?: boolean;
  notes?: string;
  /** Epoch ms. */
  addedAt?: number;
  /** Epoch ms of the last change in the old store — the observation's `asOf`. */
  updatedAt?: number;
  format?: string;
  posterUrl?: string;
}

const TRACKING_STATUS: Record<MediaTrackingRecord['status'], WatchStatus> = {
  planned: 'plan',
  watching: 'watching',
  completed: 'completed',
  'on-hold': 'on_hold',
  dropped: 'dropped',
};

/** The watch kind a §7 content type stands for. */
export function watchKindForContentType(contentType: MediaTrackingRecord['contentType']): WatchKind {
  switch (contentType) {
    case 'movie':
      return 'film';
    case 'anime':
    case 'ova':
    case 'special':
      return 'anime';
    default:
      return 'tv';
  }
}

/** What the renderer knows about an identity from its stored provider results. */
export interface LegacyIdentityInfo {
  title: string;
  originalTitle?: string | null;
  altTitles?: readonly string[];
  year?: number | null;
  episodeCount?: number | null;
  identifiers?: readonly { namespace: string; value: string }[];
}

function idNumber(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const n = Number(value.trim());
  return n > 0 ? n : undefined;
}

function isoMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * A tracking record as a legacy row, or null when its identity cannot be named
 * — a title reading as its own raw id would be unreadable everywhere it shows.
 * Such records stay in the old store, untouched.
 */
export function mediaTrackingRecordToLegacyRow(
  record: MediaTrackingRecord,
  info: LegacyIdentityInfo | undefined,
): WatchLegacyRow | null {
  const title = info?.title?.trim();
  if (!title || title === record.identityId) return null;
  const ids = new Map((info?.identifiers ?? []).map((ref) => [ref.namespace, ref.value]));
  const progress = record.progress.kind === 'unit'
    ? (record.progress.watched ? 1 : undefined)
    : record.progress.watchedEpisodes.length || undefined;
  const episodeCount = record.progress.kind === 'episodic'
    ? record.progress.totalEpisodes ?? info?.episodeCount ?? undefined
    : undefined;
  return {
    origin: 'tracking',
    kind: watchKindForContentType(record.contentType),
    title,
    originalTitle: info?.originalTitle ?? undefined,
    altTitles: info?.altTitles?.length ? [...info.altTitles] : undefined,
    year: info?.year ?? undefined,
    malId: idNumber(ids.get('mal')),
    anilistId: idNumber(ids.get('anilist')),
    tmdbId: idNumber(ids.get('tmdb')),
    tvmazeId: idNumber(ids.get('tvmaze')),
    imdbId: ids.get('imdb'),
    status: TRACKING_STATUS[record.status] ?? 'plan',
    score: record.rating !== null ? Math.round(record.rating) / 10 : undefined,
    progress,
    episodeCount: episodeCount && episodeCount > 0 ? episodeCount : undefined,
    favorite: record.favorite || undefined,
    notes: record.notes || undefined,
    addedAt: isoMs(record.addedAt),
    updatedAt: isoMs(record.updatedAt) ?? isoMs(record.addedAt),
  };
}

/** A shortlisted anime as a "plan to watch" row. Manga is not a watch title. */
export function shortlistCandidateToLegacyRow(candidate: DiscoveryCandidate, addedAt: number): WatchLegacyRow | null {
  if (candidate.mediaType === 'manga' || !candidate.title?.trim()) return null;
  return discoveryCandidateToLegacyRow(candidate, addedAt);
}

/** The Discover "Add to library" request for a catalogue hit. */
export function discoveryCandidateToLegacyRow(candidate: DiscoveryCandidate, addedAt?: number): WatchLegacyRow {
  return {
    origin: 'shortlist',
    kind: /^movie$/i.test(candidate.format ?? '') ? 'film' : 'anime',
    title: candidate.title.trim(),
    originalTitle: candidate.nativeTitle,
    year: candidate.year,
    malId: candidate.provider === 'jikan' ? candidate.id : undefined,
    anilistId: candidate.provider === 'anilist' ? candidate.id : undefined,
    status: 'plan',
    episodeCount: candidate.episodeCount,
    addedAt,
    updatedAt: addedAt,
    format: candidate.format,
    posterUrl: candidate.posterUrl,
  };
}

function num(value: unknown, min = 0): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : undefined;
}

function str(value: unknown, max = 500): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/** Re-validates rows that crossed the bridge. Anything malformed is dropped. */
export function sanitizeWatchLegacyRows(value: unknown): WatchLegacyRow[] {
  if (!Array.isArray(value)) return [];
  const out: WatchLegacyRow[] = [];
  for (const raw of value.slice(0, 5000)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.title, 300);
    if (!title || !isWatchKind(r.kind)) continue;
    const intId = (v: unknown): number | undefined => {
      const n = num(v, 1);
      return n !== undefined ? Math.trunc(n) : undefined;
    };
    out.push({
      origin: r.origin === 'shortlist' ? 'shortlist' : 'tracking',
      kind: r.kind,
      title,
      originalTitle: str(r.originalTitle, 300),
      altTitles: Array.isArray(r.altTitles) ? r.altTitles.map((v) => str(v, 300)).filter((v): v is string => !!v).slice(0, 30) : undefined,
      year: intId(r.year),
      malId: intId(r.malId),
      anilistId: intId(r.anilistId),
      tmdbId: intId(r.tmdbId),
      tvmazeId: intId(r.tvmazeId),
      imdbId: typeof r.imdbId === 'string' && /^tt\d{5,10}$/i.test(r.imdbId.trim()) ? r.imdbId.trim().toLowerCase() : undefined,
      status: isWatchStatus(r.status) ? r.status : 'plan',
      score: num(r.score) !== undefined ? Math.min(10, num(r.score) as number) : undefined,
      progress: intId(r.progress),
      episodeCount: intId(r.episodeCount),
      favorite: r.favorite === true || undefined,
      notes: str(r.notes, 2000),
      addedAt: num(r.addedAt, 1),
      updatedAt: num(r.updatedAt, 1),
      format: str(r.format, 40),
      posterUrl: typeof r.posterUrl === 'string' && /^https:\/\//i.test(r.posterUrl) ? r.posterUrl : undefined,
    });
  }
  return out;
}

/**
 * A legacy row as a `manual` observation, dated by the row's own last change —
 * so re-running the migration is a fixed point and a later edit in the watch
 * library outranks it.
 */
export function watchLegacyRowToObservation(row: WatchLegacyRow): WatchObservation {
  const anime = row.kind === 'anime' || row.malId !== undefined || row.anilistId !== undefined || undefined;
  return {
    source: 'manual',
    asOf: row.updatedAt,
    addedAt: row.addedAt,
    identity: {
      kind: row.kind,
      title: row.title,
      originalTitle: row.originalTitle,
      altTitles: row.altTitles,
      year: row.year,
      anime,
      format: row.format,
      malId: row.malId,
      anilistId: row.anilistId,
      tmdbId: row.tmdbId,
      tvmazeId: row.tvmazeId,
      imdbId: row.imdbId,
      posterUrl: row.posterUrl,
    },
    fields: {
      status: row.status,
      score: row.score !== undefined && row.score > 0 ? { score: row.score, scale: 'ten' } : undefined,
      progress: row.progress,
      episodeCount: row.episodeCount,
      favorite: row.favorite,
      notes: row.notes,
    },
  };
}
