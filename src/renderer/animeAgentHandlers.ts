import type { AgentToolHandlers } from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import type {
  MediaEpisodeMark,
  MediaTrackingRecord,
  MediaTrackingStatus,
} from '../shared/mediaTracking';
import type { MergedMediaResult } from '../shared/mediaResultPresentation';
import {
  mergeStoredMediaResults,
  presentStoredMediaResults,
} from '../shared/mediaResultPresentation';
import { summarizeMediaTrackingProgress } from '../shared/mediaTracking';
import {
  loadMediaTrackingDocument,
  markMediaTrackingEpisodesWatched,
  upsertMediaTrackingEntry,
  type MediaTrackingPatch,
} from './mediaTrackingStore';
import { loadMediaProvidersDocument } from './mediaProviderStore';
import { analyzeSubtitles, resolveMedia, type MediaAgentTranslate } from './mediaAgentHandlers';

export type AnimeAgentTranslate = (key: string, vars?: TVars) => string;

const STATUSES: readonly MediaTrackingStatus[] = [
  'planned',
  'watching',
  'completed',
  'on-hold',
  'dropped',
];

function textArgument(
  t: AnimeAgentTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('blanc.agent.error.needsArgument', { name }));
  }
  return value.trim().slice(0, 500);
}

function optionalText(
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
  limit = 200,
): string | undefined {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, limit);
}

function boundedCount(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

interface AnimeIdentity {
  identityId: string;
  title: string;
  result?: MergedMediaResult;
  record?: MediaTrackingRecord;
}

/**
 * Resolves the `identityId` argument. An identity id is opaque, so a title is
 * accepted — but only when it names exactly one stored anime, and only from the
 * catalogue the user's own searches already stored. Nothing here reaches a
 * network: `mergeStoredMediaResults` reads the local providers document.
 *
 * `track` cannot create a record for an identity the catalogue does not know,
 * because a record whose title resolves to its own raw id is unreadable in every
 * surface that renders it.
 */
function resolveAnime(t: AnimeAgentTranslate, id: string): AnimeIdentity {
  const anime = mergeStoredMediaResults(loadMediaProvidersDocument())
    .filter((result) => result.contentType === 'anime');
  const records = loadMediaTrackingDocument().records
    .filter((record) => record.contentType === 'anime');

  const byId = anime.find((result) => result.identityId === id);
  const recordById = records.find((record) => record.identityId === id);
  if (byId || recordById) {
    return {
      identityId: id,
      title: byId?.title ?? id,
      ...(byId ? { result: byId } : {}),
      ...(recordById ? { record: recordById } : {}),
    };
  }

  const needle = id.toLocaleLowerCase();
  const byTitle = anime.filter((result) => [
    result.title,
    result.originalTitle,
    result.japaneseTitle,
    result.romajiTitle,
    ...result.alternativeTitles,
  ].some((title) => title && title.toLocaleLowerCase() === needle));
  if (byTitle.length !== 1) throw new Error(t('blanc.agent.error.animeNotFound'));
  const match = byTitle[0];
  const record = records.find((candidate) => candidate.identityId === match.identityId);
  return {
    identityId: match.identityId,
    title: match.title,
    result: match,
    ...(record ? { record } : {}),
  };
}

function trackedRow(record: MediaTrackingRecord, title: string) {
  return {
    identityId: record.identityId,
    title,
    status: record.status,
    favorite: record.favorite,
    rating: record.rating,
    progress: summarizeMediaTrackingProgress(record),
    schedule: record.schedule,
    updatedAt: record.updatedAt,
  };
}

function episodeMarks(value: unknown): MediaEpisodeMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return [{ season: 1, episode: Math.max(0, Math.floor(raw)) }];
    }
    if (!raw || typeof raw !== 'object') return [];
    const mark = raw as Record<string, unknown>;
    const episode = typeof mark.episode === 'number' && Number.isFinite(mark.episode)
      ? Math.max(0, Math.floor(mark.episode))
      : null;
    if (episode === null) return [];
    const season = typeof mark.season === 'number' && Number.isFinite(mark.season)
      ? Math.max(0, Math.floor(mark.season))
      : 1;
    return [{ season, episode }];
  }).slice(0, 200);
}

function trackingPatch(
  arguments_: Readonly<Record<string, unknown>>,
): MediaTrackingPatch {
  const patch: MediaTrackingPatch = {};
  const status = optionalText(arguments_, 'status', 20) as MediaTrackingStatus | undefined;
  if (status && STATUSES.includes(status)) patch.status = status;
  if (typeof arguments_.favorite === 'boolean') patch.favorite = arguments_.favorite;
  if (arguments_.rating === null) patch.rating = null;
  else if (typeof arguments_.rating === 'number' && Number.isFinite(arguments_.rating)) {
    patch.rating = Math.max(0, Math.min(100, Math.round(arguments_.rating)));
  }
  const notes = optionalText(arguments_, 'notes', 1000);
  if (notes !== undefined) patch.notes = notes;
  return patch;
}

/**
 * The anime adapters. "Tracked anime" is the local `jp-media-tracking-v1`
 * document — records carrying status, progress and a release schedule, keyed by
 * the identity the local providers catalogue resolved. Only
 * `fetch-external-metadata` leaves the machine, and it is the one operation that
 * declares an `external-connection` confirmation.
 */
export function createAnimeAgentHandlers(t: AnimeAgentTranslate): AgentToolHandlers {
  return {
    'anime.search': async (arguments_) => {
      const query = optionalText(arguments_, 'query', 200) ?? '';
      const status = optionalText(arguments_, 'status', 20) as MediaTrackingStatus | undefined;
      const limit = boundedCount(arguments_.limit, 25, 100);
      const trackedOnly = arguments_.trackedOnly === true;

      const records = new Map(loadMediaTrackingDocument().records
        .filter((record) => record.contentType === 'anime')
        .map((record) => [record.identityId, record]));
      const catalogue = mergeStoredMediaResults(loadMediaProvidersDocument())
        .filter((result) => result.contentType === 'anime');
      // `presentStoredMediaResults` both filters and orders, so its length is the
      // MATCH count, never the catalogue size — reporting it as `catalogue` would
      // make "you have 1 anime stored" true only for the current query.
      const results = presentStoredMediaResults(
        catalogue,
        { contentTypes: ['anime'], ...(query ? { query } : {}) },
      );

      const rows = results.flatMap((result) => {
        const record = records.get(result.identityId);
        if (trackedOnly && !record) return [];
        if (status && record?.status !== status) return [];
        return [{
          identityId: result.identityId,
          title: result.title,
          japaneseTitle: result.japaneseTitle,
          year: result.year,
          episodeCount: result.episodeCount,
          studio: result.studio,
          tracked: Boolean(record),
          ...(record ? { tracking: trackedRow(record, result.title) } : {}),
        }];
      });

      // A tracked record whose identity has fallen out of the stored catalogue is
      // still tracked. Dropping it would make "what am I watching?" quietly wrong.
      const orphans = [...records.values()]
        .filter((record) => !results.some((result) => result.identityId === record.identityId))
        .filter((record) => !status || record.status === status)
        .filter(() => !query)
        .map((record) => ({
          identityId: record.identityId,
          title: record.identityId,
          japaneseTitle: null,
          year: null,
          episodeCount: null,
          studio: null,
          tracked: true,
          catalogueEntryMissing: true,
          tracking: trackedRow(record, record.identityId),
        }));

      return {
        catalogue: catalogue.length,
        tracked: records.size,
        matched: rows.length + orphans.length,
        anime: [...rows, ...orphans].slice(0, limit),
      };
    },

    'anime.track': async (arguments_) => {
      const identity = resolveAnime(t, textArgument(t, arguments_, 'identityId'));
      const patch = trackingPatch(arguments_);
      const created = !identity.record;
      // A first `track` with no status means "put this on my list", not "leave it
      // in whatever state the empty record defaults to".
      if (created && !patch.status) patch.status = 'planned';

      let document = upsertMediaTrackingEntry(identity.identityId, 'anime', patch);
      const marks = episodeMarks(arguments_.watchedEpisodes);
      if (marks.length) {
        document = markMediaTrackingEpisodesWatched(identity.identityId, 'anime', marks);
      }

      const record = document.records.find((candidate) => (
        candidate.identityId === identity.identityId
      ));
      if (!record) throw new Error(t('blanc.agent.error.animeNotFound'));
      return { created, ...trackedRow(record, identity.title) };
    },

    'anime.check-releases': async (arguments_) => {
      const limit = boundedCount(arguments_.limit, 25, 100);
      const id = optionalText(arguments_, 'identityId', 200);
      const titleFor = new Map(mergeStoredMediaResults(loadMediaProvidersDocument())
        .map((result) => [result.identityId, result.title]));
      const records = loadMediaTrackingDocument().records
        .filter((record) => record.contentType === 'anime')
        .filter((record) => !id || record.identityId === resolveAnime(t, id).identityId);

      // Cached only, by contract: `MediaReleaseSchedule` is a stored record and
      // this operation is `read-only`. Refreshing it is what
      // `anime.fetch-external-metadata` is for, and that one asks first.
      return {
        checkedAt: null,
        tracked: records.length,
        releases: records
          .map((record) => ({
            identityId: record.identityId,
            title: titleFor.get(record.identityId) ?? record.identityId,
            status: record.status,
            release: record.schedule,
            nextEpisodeNumber: record.schedule.nextEpisodeNumber,
            nextAirDate: record.schedule.nextAirDate,
            updatedAt: record.updatedAt,
          }))
          .sort((a, b) => (a.nextAirDate ?? '').localeCompare(b.nextAirDate ?? ''))
          .slice(0, limit),
      };
    },

    'anime.update-metadata': async (arguments_) => {
      const identity = resolveAnime(t, textArgument(t, arguments_, 'identityId'));
      if (!identity.record) throw new Error(t('blanc.agent.error.animeNotTracked'));

      const patch = trackingPatch(arguments_);
      const schedule = arguments_.schedule;
      if (schedule && typeof schedule === 'object' && !Array.isArray(schedule)) {
        const raw = schedule as Record<string, unknown>;
        patch.schedule = {
          ...(typeof raw.status === 'string' ? { status: raw.status as never } : {}),
          ...(typeof raw.nextEpisodeNumber === 'number'
            ? { nextEpisodeNumber: Math.max(0, Math.floor(raw.nextEpisodeNumber)) }
            : {}),
          ...(typeof raw.nextAirDate === 'string' ? { nextAirDate: raw.nextAirDate.slice(0, 40) } : {}),
          ...(typeof raw.broadcastDay === 'string' ? { broadcastDay: raw.broadcastDay as never } : {}),
        };
      }
      if (!Object.keys(patch).length) throw new Error(t('blanc.agent.error.nothingToUpdate'));

      const document = upsertMediaTrackingEntry(identity.identityId, 'anime', patch);
      const record = document.records.find((candidate) => (
        candidate.identityId === identity.identityId
      ));
      if (!record) throw new Error(t('blanc.agent.error.animeNotFound'));
      // The store normalizes what it stores, so the answer is read back out of the
      // saved document rather than echoed from the patch.
      return { updated: Object.keys(patch), ...trackedRow(record, identity.title) };
    },

    'anime.analyze-difficulty': async (arguments_) => {
      const identity = resolveAnime(t, textArgument(t, arguments_, 'identityId'));
      // Difficulty is measured from Japanese subtitles, which live on a media
      // item — a tracking record holds no text. The caller may name the item;
      // otherwise the tracked title has to identify exactly one, because
      // analysing the wrong episode is a silently wrong answer.
      const mediaId = optionalText(arguments_, 'mediaId', 200) ?? identity.title;
      const item = await resolveMedia(t as MediaAgentTranslate, mediaId);
      const { record, cueCount, analysis } = await analyzeSubtitles(
        t as MediaAgentTranslate,
        item,
        arguments_,
      );

      return {
        identityId: identity.identityId,
        title: identity.title,
        mediaId: item.id,
        mediaTitle: item.title,
        subtitle: { id: record.id, lang: record.lang, source: record.source },
        cues: cueCount,
        distinctVocabulary: analysis.vocabulary.length,
        distinctKanji: analysis.kanji.length,
        truncated: analysis.truncated,
        level: analysis.level
          ? {
            scheme: analysis.level.scheme,
            label: analysis.level.label,
            confidence: analysis.level.confidence,
            metThreshold: analysis.level.metThreshold,
          }
          : null,
        comprehensibility: analysis.comprehensibility,
        grammar: analysis.grammar.map((hit) => hit.id),
      };
    },

    'anime.fetch-external-metadata': async (arguments_) => {
      // The only anime operation that leaves the machine, and the only one
      // carrying an `external-connection` confirmation. The window is bounded
      // here as well as in main: an unbounded range is a scrape, not a fetch.
      const days = boundedCount(arguments_.days, 7, 31);
      const from = Math.floor(Date.now() / 1000);
      const response = await window.api.animeSchedule({
        from,
        to: from + days * 86_400,
        limit: boundedCount(arguments_.limit, 50, 200),
        scheduleOnly: arguments_.scheduleOnly !== false,
      });
      if (response.scheduleError) throw new Error(response.scheduleError);

      return {
        fetchedAt: response.fetchedAt,
        days,
        returned: response.rows.length,
        available: response.scheduleTotal,
        summary: response.summary,
        rows: response.rows,
      };
    },
  };
}
