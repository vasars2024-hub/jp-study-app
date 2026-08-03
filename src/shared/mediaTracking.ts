/**
 * MASTER_PLAN §7 — Tracking System Expansion (offline data-model).
 *
 * Stores the user's *tracking state* for a title: watch/read status, per-content-type
 * progress (anime/drama episodes + seasons, movie watched status), the release
 * schedule, and language/subtitle preferences. Every record is keyed on a
 * {@link MediaIdentity} id (see `mediaIdentity.ts`), so a title carried by several
 * providers has exactly one tracking record no matter how many descriptors describe it.
 *
 * Progress is modeled per content type as a discriminated union:
 *   - `episodic` — anime, dramas, TV, web series: a set of watched (season, episode)
 *     marks plus known episode/season totals.
 *   - `unit`     — movies and specials: a single watched flag.
 * {@link mediaProgressKindForContentType} gives the *default* kind for a content type;
 * a stored record may override it (an OVA that is really a mini-series can be episodic).
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - networking, scraping, playback/downloads, authentication, provider execution,
 *   - result merging across providers,
 *   - clock access: timestamps are stored/validated, never generated here, so every
 *     function stays deterministic. A future store layer supplies the clock.
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

import type { MediaContentType } from './mediaProviders';

export const MEDIA_TRACKING_MODEL_VERSION = 1;

/** Where a title sits in the user's list. 'watching' doubles as "reading/watched-in-progress". */
export type MediaTrackingStatus = 'planned' | 'watching' | 'completed' | 'on-hold' | 'dropped';

/** How the underlying release is progressing. Detection/record only — nothing is polled. */
export type MediaReleaseStatus = 'unknown' | 'upcoming' | 'airing' | 'finished' | 'hiatus';

export type MediaWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Preferred subtitle rendering style (§8 alignment; managed elsewhere, stored here). */
export type MediaSubtitleStyle = 'full' | 'signs-songs' | 'forced';

/** Which progress shape a content type uses. */
export type MediaProgressKind = 'episodic' | 'unit';

/** One watched unit of episodic content. Season 0 is allowed for specials. */
export interface MediaEpisodeMark {
  season: number;
  episode: number;
}

export type MediaTrackingProgress =
  | {
      kind: 'episodic';
      /** Watched marks, de-duplicated and sorted by (season, episode). */
      watchedEpisodes: MediaEpisodeMark[];
      totalEpisodes: number | null;
      totalSeasons: number | null;
    }
  | {
      kind: 'unit';
      watched: boolean;
    };

export interface MediaReleaseSchedule {
  status: MediaReleaseStatus;
  nextEpisodeNumber: number | null;
  nextAirDate: string | null;
  episodesPerWeek: number | null;
  broadcastDay: MediaWeekday | null;
}

export interface MediaTrackingPreferences {
  /** Preferred audio / dub language tag (e.g. "ja"). */
  audioLanguage: string | null;
  /** Primary subtitle language tag. */
  subtitleLanguage: string | null;
  /** Secondary subtitle language tag (for dual-subtitle study). */
  secondarySubtitleLanguage: string | null;
  subtitleStyle: MediaSubtitleStyle;
}

export interface MediaTrackingRecord {
  /** Key → {@link MediaIdentity.id}. */
  identityId: string;
  contentType: MediaContentType;
  status: MediaTrackingStatus;
  favorite: boolean;
  progress: MediaTrackingProgress;
  schedule: MediaReleaseSchedule;
  preferences: MediaTrackingPreferences;
  /** Optional 0–100 user score. */
  rating: number | null;
  notes: string;
  /** ISO-8601, validated/stored only — never generated here. */
  addedAt: string | null;
  updatedAt: string | null;
}

export interface MediaTrackingDocument {
  version: typeof MEDIA_TRACKING_MODEL_VERSION;
  records: MediaTrackingRecord[];
}

export interface MediaTrackingIssue { path: string; message: string }
export interface MediaTrackingValidationResult {
  value: MediaTrackingDocument;
  issues: MediaTrackingIssue[];
}

/** Converts the pre-versioned/legacy list shape into the current document envelope. */
export function migrateMediaTrackingDocument(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (input.version === MEDIA_TRACKING_MODEL_VERSION) return input;
  const legacy = Array.isArray(input.records) ? input.records : Array.isArray(input.items) ? input.items : [];
  return {
    version: MEDIA_TRACKING_MODEL_VERSION,
    records: legacy.map((entry) => {
      if (!isRecord(entry)) return entry;
      const progress = isRecord(entry.progress) ? entry.progress : {};
      return {
        ...entry,
        identityId: entry.identityId ?? entry.id ?? entry.animeId,
        contentType: entry.contentType ?? 'anime',
        favorite: entry.favorite ?? entry.isFavorite,
        progress: {
          ...progress,
          watchedEpisodes: progress.watchedEpisodes ?? entry.watchedEpisodes,
          totalEpisodes: progress.totalEpisodes ?? entry.totalEpisodes,
        },
      };
    }),
  };
}

/** Deterministic projection of a record's progress into display-ready counts. */
export interface MediaTrackingProgressSummary {
  kind: MediaProgressKind;
  watchedCount: number;
  totalCount: number | null;
  remainingCount: number | null;
  /** watched / total, clamped 0–1; null when the total is unknown. */
  completionRatio: number | null;
  isComplete: boolean;
  /** Furthest watched (season, episode); episodic only, null otherwise. */
  furthestEpisode: MediaEpisodeMark | null;
}

type UnknownRecord = Record<string, unknown>;

const STATUSES: MediaTrackingStatus[] = ['planned', 'watching', 'completed', 'on-hold', 'dropped'];
const RELEASE_STATUSES: MediaReleaseStatus[] = ['unknown', 'upcoming', 'airing', 'finished', 'hiatus'];
const WEEKDAYS: MediaWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SUBTITLE_STYLES: MediaSubtitleStyle[] = ['full', 'signs-songs', 'forced'];
const CONTENT_TYPES: MediaContentType[] = [
  'anime', 'jdrama', 'cdrama', 'kdrama', 'movie', 'tv', 'documentary', 'special', 'ova', 'webseries',
];
/** Content types whose default progress shape is a single watched unit. */
const UNIT_CONTENT_TYPES = new Set<MediaContentType>(['movie', 'special']);

/** The default progress shape for a content type; a stored record may override it. */
export function mediaProgressKindForContentType(contentType: MediaContentType): MediaProgressKind {
  return UNIT_CONTENT_TYPES.has(contentType) ? 'unit' : 'episodic';
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: MediaTrackingIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function id(value: unknown, path: string, issues: MediaTrackingIssue[]): string {
  return text(value, '', 80, path, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as T
    : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finite(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: MediaTrackingIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

function integer(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: MediaTrackingIssue[]): number | null {
  const bounded = finite(value, fallback, min, max, path, issues);
  return bounded === null ? null : Math.trunc(bounded);
}

function isoDateTime(value: unknown, path: string, issues: MediaTrackingIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!Number.isNaN(Date.parse(trimmed))) return trimmed;
  }
  issues.push({ path, message: 'Expected an ISO-8601 date-time or null.' });
  return null;
}

function weekday(value: unknown, path: string, issues: MediaTrackingIssue[]): MediaWeekday | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && (WEEKDAYS as string[]).includes(value.trim().toLowerCase())) {
    return value.trim().toLowerCase() as MediaWeekday;
  }
  issues.push({ path, message: 'Expected a weekday (mon-sun) or null.' });
  return null;
}

function normalizeMark(value: unknown, path: string, issues: MediaTrackingIssue[]): MediaEpisodeMark | null {
  if (!isRecord(value)) {
    issues.push({ path, message: 'Ignored invalid episode mark.' });
    return null;
  }
  const season = integer(value.season, 1, 0, 100_000, `${path}.season`, issues) ?? 1;
  const episode = integer(value.episode, null, 1, 100_000_000, `${path}.episode`, issues);
  if (episode === null) {
    issues.push({ path, message: 'An episode mark requires an episode number.' });
    return null;
  }
  return { season, episode };
}

function normalizeEpisodeMarks(value: unknown, path: string, issues: MediaTrackingIssue[]): MediaEpisodeMark[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const marks: MediaEpisodeMark[] = [];
  value.forEach((raw, index) => {
    const mark = normalizeMark(raw, `${path}.${index}`, issues);
    if (!mark) return;
    const key = `${mark.season}\0${mark.episode}`;
    if (seen.has(key)) {
      issues.push({ path: `${path}.${index}`, message: 'Ignored duplicate episode mark.' });
      return;
    }
    seen.add(key);
    marks.push(mark);
  });
  marks.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return marks.slice(0, 50_000);
}

function normalizeProgress(value: unknown, contentType: MediaContentType, path: string, issues: MediaTrackingIssue[]): MediaTrackingProgress {
  const raw = isRecord(value) ? value : {};
  const explicit = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  const kind: MediaProgressKind = explicit === 'episodic' || explicit === 'unit'
    ? explicit
    : mediaProgressKindForContentType(contentType);
  if (kind === 'unit') {
    return { kind: 'unit', watched: boolean(raw.watched, false) };
  }
  return {
    kind: 'episodic',
    watchedEpisodes: normalizeEpisodeMarks(raw.watchedEpisodes, `${path}.watchedEpisodes`, issues),
    totalEpisodes: integer(raw.totalEpisodes, null, 0, 100_000_000, `${path}.totalEpisodes`, issues),
    totalSeasons: integer(raw.totalSeasons, null, 0, 100_000, `${path}.totalSeasons`, issues),
  };
}

function normalizeSchedule(value: unknown, path: string, issues: MediaTrackingIssue[]): MediaReleaseSchedule {
  const raw = isRecord(value) ? value : {};
  return {
    status: oneOf(raw.status, RELEASE_STATUSES, 'unknown'),
    nextEpisodeNumber: integer(raw.nextEpisodeNumber, null, 1, 100_000_000, `${path}.nextEpisodeNumber`, issues),
    nextAirDate: isoDateTime(raw.nextAirDate, `${path}.nextAirDate`, issues),
    episodesPerWeek: finite(raw.episodesPerWeek, null, 0, 100, `${path}.episodesPerWeek`, issues),
    broadcastDay: weekday(raw.broadcastDay, `${path}.broadcastDay`, issues),
  };
}

function normalizePreferences(value: unknown, path: string, issues: MediaTrackingIssue[]): MediaTrackingPreferences {
  const raw = isRecord(value) ? value : {};
  return {
    audioLanguage: text(raw.audioLanguage, '', 35, `${path}.audioLanguage`, issues) || null,
    subtitleLanguage: text(raw.subtitleLanguage, '', 35, `${path}.subtitleLanguage`, issues) || null,
    secondarySubtitleLanguage: text(raw.secondarySubtitleLanguage, '', 35, `${path}.secondarySubtitleLanguage`, issues) || null,
    subtitleStyle: oneOf(raw.subtitleStyle, SUBTITLE_STYLES, 'full'),
  };
}

function normalizeRecord(value: unknown, index: number, issues: MediaTrackingIssue[]): MediaTrackingRecord | null {
  const prefix = `records.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid tracking record.' });
    return null;
  }
  const identityId = id(value.identityId, `${prefix}.identityId`, issues);
  if (!identityId) {
    issues.push({ path: prefix, message: 'A tracking record requires an identity ID.' });
    return null;
  }
  const contentType = oneOf(value.contentType, CONTENT_TYPES, 'anime');
  return {
    identityId,
    contentType,
    status: oneOf(value.status, STATUSES, 'planned'),
    favorite: value.favorite === true,
    progress: normalizeProgress(value.progress, contentType, `${prefix}.progress`, issues),
    schedule: normalizeSchedule(value.schedule, `${prefix}.schedule`, issues),
    preferences: normalizePreferences(value.preferences, `${prefix}.preferences`, issues),
    rating: finite(value.rating, null, 0, 100, `${prefix}.rating`, issues),
    notes: text(value.notes, '', 2_000, `${prefix}.notes`, issues),
    addedAt: isoDateTime(value.addedAt, `${prefix}.addedAt`, issues),
    updatedAt: isoDateTime(value.updatedAt, `${prefix}.updatedAt`, issues),
  };
}

export function createEmptyMediaTrackingDocument(): MediaTrackingDocument {
  return { version: MEDIA_TRACKING_MODEL_VERSION, records: [] };
}

export function normalizeMediaTrackingDocument(input: unknown): MediaTrackingValidationResult {
  const issues: MediaTrackingIssue[] = [];
  if (isRecord(input) && typeof input.version === 'number' && input.version > MEDIA_TRACKING_MODEL_VERSION) {
    return { value: createEmptyMediaTrackingDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  input = migrateMediaTrackingDocument(input);
  if (!isRecord(input)) {
    return { value: createEmptyMediaTrackingDocument(), issues: [{ path: '', message: 'Expected a media-tracking document.' }] };
  }
  const rawRecords = Array.isArray(input.records) ? input.records : [];
  const records = rawRecords.map((item, index) => normalizeRecord(item, index, issues))
    .filter((item): item is MediaTrackingRecord => item !== null);
  const seen = new Set<string>();
  const unique = records.filter((record, index) => {
    if (seen.has(record.identityId)) {
      issues.push({ path: `records.${index}.identityId`, message: 'Ignored duplicate tracking record.' });
      return false;
    }
    seen.add(record.identityId);
    return true;
  });
  return { value: { version: MEDIA_TRACKING_MODEL_VERSION, records: unique }, issues };
}

/** The tracking record for an identity, or null. Reads a normalized snapshot. */
export function getMediaTrackingRecord(document: MediaTrackingDocument, identityId: string): MediaTrackingRecord | null {
  const normalizedId = identityId.trim().toLowerCase();
  const current = normalizeMediaTrackingDocument(document).value;
  return current.records.find((record) => record.identityId === normalizedId) ?? null;
}

/** Inserts or replaces a record by identity ID. Pure and local; returns the normalized document. */
export function upsertMediaTrackingRecord(document: MediaTrackingDocument, input: unknown): MediaTrackingValidationResult {
  const normalizedInput = normalizeMediaTrackingDocument({ records: [input] });
  const record = normalizedInput.value.records[0];
  const current = normalizeMediaTrackingDocument(document).value;
  if (!record) return { value: current, issues: normalizedInput.issues };
  return {
    value: { ...current, records: [...current.records.filter((item) => item.identityId !== record.identityId), record] },
    issues: normalizedInput.issues,
  };
}

/** Removes the record for an identity, if present. */
export function removeMediaTrackingRecord(document: MediaTrackingDocument, identityId: string): MediaTrackingDocument {
  const normalizedId = identityId.trim().toLowerCase();
  return normalizeMediaTrackingDocument({
    ...document,
    records: document.records.filter((record) => record.identityId !== normalizedId),
  }).value;
}

/**
 * Adds watched (season, episode) marks to an episodic record, keeping the set
 * de-duplicated and sorted. A no-op on a unit record. Returns a new record; the
 * caller (store layer) is responsible for bumping `updatedAt`.
 */
export function markMediaEpisodesWatched(record: MediaTrackingRecord, marks: MediaEpisodeMark[]): MediaTrackingRecord {
  if (record.progress.kind !== 'episodic') return record;
  const merged = normalizeEpisodeMarks([...record.progress.watchedEpisodes, ...marks], 'watchedEpisodes', []);
  return { ...record, progress: { ...record.progress, watchedEpisodes: merged } };
}

/** Sets the watched flag on a unit record. A no-op on an episodic record. */
export function setMediaWatched(record: MediaTrackingRecord, watched: boolean): MediaTrackingRecord {
  if (record.progress.kind !== 'unit') return record;
  return { ...record, progress: { kind: 'unit', watched } };
}

/** Projects a record's progress into deterministic display counts. */
export function summarizeMediaTrackingProgress(record: MediaTrackingRecord): MediaTrackingProgressSummary {
  if (record.progress.kind === 'unit') {
    const watched = record.progress.watched || record.status === 'completed';
    return {
      kind: 'unit',
      watchedCount: watched ? 1 : 0,
      totalCount: 1,
      remainingCount: watched ? 0 : 1,
      completionRatio: watched ? 1 : 0,
      isComplete: watched,
      furthestEpisode: null,
    };
  }
  const { watchedEpisodes, totalEpisodes } = record.progress;
  const watchedCount = watchedEpisodes.length;
  const hasTotal = totalEpisodes !== null && totalEpisodes > 0;
  return {
    kind: 'episodic',
    watchedCount,
    totalCount: totalEpisodes,
    remainingCount: hasTotal ? Math.max(totalEpisodes - watchedCount, 0) : null,
    completionRatio: hasTotal ? Math.min(watchedCount / totalEpisodes, 1) : null,
    isComplete: record.status === 'completed' || (hasTotal && watchedCount >= totalEpisodes),
    furthestEpisode: watchedCount > 0 ? watchedEpisodes[watchedCount - 1] : null,
  };
}
