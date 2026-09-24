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
import type {
  WatchAddInput,
  WatchStatus,
  WatchTitlePatch,
  WatchTitleView,
} from '../shared/watchLibrary';
import { loadMediaTrackingDocument } from './mediaTrackingStore';
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

/**
 * The watch library is the one tracking store (`shared/watchLibrary.ts`, main-owned). The agent's
 * tool vocabulary keeps the statuses it has always documented to the model, mapped here.
 */
const WATCH_STATUS: Record<MediaTrackingStatus, WatchStatus> = {
  planned: 'plan',
  watching: 'watching',
  completed: 'completed',
  'on-hold': 'on_hold',
  dropped: 'dropped',
};

/** What the tool's arguments ask to change, in the watch library's own terms. */
function watchPatch(arguments_: Readonly<Record<string, unknown>>): {
  patch: WatchTitlePatch;
  fields: string[];
} {
  const patch: WatchTitlePatch = {};
  const fields: string[] = [];
  const status = optionalText(arguments_, 'status', 20) as MediaTrackingStatus | undefined;
  if (status && STATUSES.includes(status)) {
    patch.status = WATCH_STATUS[status];
    fields.push('status');
  }
  if (typeof arguments_.favorite === 'boolean') {
    patch.favorite = arguments_.favorite;
    fields.push('favorite');
  }
  // The tool's rating is 0-100 (what the model has always been told); the library scores 0-10.
  if (arguments_.rating === null) {
    patch.score = null;
    fields.push('rating');
  } else if (typeof arguments_.rating === 'number' && Number.isFinite(arguments_.rating)) {
    patch.score = Math.max(0, Math.min(100, Math.round(arguments_.rating))) / 10;
    fields.push('rating');
  }
  const notes = optionalText(arguments_, 'notes', 1000);
  if (notes !== undefined) {
    patch.notes = notes;
    fields.push('notes');
  }
  return { patch, fields };
}

function identifier(result: MergedMediaResult | undefined, namespace: string): number | undefined {
  const raw = result?.identifiers?.find((entry) => entry.namespace === namespace)?.value;
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function folded(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The library title this anime already has, if any: by MAL / AniList id first, then by an exact
 * (folded) name. The library's own matcher does the same on `watchAdd`, so an add for a title that
 * exists merges instead of duplicating — this lookup only decides whether to report `created`.
 */
async function findWatchTitle(identity: AnimeIdentity): Promise<WatchTitleView | null> {
  const listed = await window.api.watchList({ search: identity.title, limit: 50 });
  const malId = identifier(identity.result, 'mal');
  const anilistId = identifier(identity.result, 'anilist');
  const names = new Set([
    identity.title,
    identity.result?.originalTitle,
    identity.result?.japaneseTitle,
    identity.result?.romajiTitle,
    ...(identity.result?.alternativeTitles ?? []),
  ].map(folded).filter(Boolean));
  const items = listed?.items ?? [];
  return items.find((item) => (malId && item.malId === malId) || (anilistId && item.anilistId === anilistId))
    ?? items.find((item) => [item.title, item.originalTitle, ...(item.altTitles ?? [])]
      .some((name) => names.has(folded(name))))
    ?? null;
}

function watchFailure(t: AnimeAgentTranslate, result: { ok: false; errorKey?: string; error?: string }): Error {
  return new Error(result.errorKey ? t(result.errorKey) : (result.error ?? t('blanc.agent.error.animeNotFound')));
}

/** What `track` and `update-metadata` answer with: the library's record, read back after the write. */
function watchRow(view: WatchTitleView, identity: AnimeIdentity) {
  return {
    identityId: identity.identityId,
    watchTitleId: view.id,
    title: view.title || identity.title,
    status: view.status,
    favorite: view.favorite ?? false,
    rating: typeof view.score === 'number' ? Math.round(view.score * 10) : null,
    progress: { watched: view.progress ?? 0, total: view.episodeCount ?? null },
    updatedAt: view.updatedAt,
  };
}

/**
 * The anime adapters. Writes go to the watch library — the app's one tracking
 * store, owned by main (`window.api.watchAdd` / `watchUpdate`). The old
 * `jp-media-tracking-v1` document is still READ by `search` and
 * `check-releases` for records main has not migrated yet, and is never written
 * here any more. Airing dates are fetched by main (`watchAiring.ts`), so no
 * tool writes a schedule. Only `fetch-external-metadata` leaves the machine,
 * and it is the one operation that declares an `external-connection`
 * confirmation.
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
      const { patch } = watchPatch(arguments_);

      // Episodes the agent was told were watched become the library's progress
      // (episodes watched). The library's per-episode keys belong to local
      // playback, which is the only thing that can vouch for them.
      const marks = episodeMarks(arguments_.watchedEpisodes);
      const highest = marks.reduce((max, mark) => Math.max(max, mark.episode), 0);

      let view = await findWatchTitle(identity);
      const created = !view;
      if (!view) {
        const input: WatchAddInput = {
          kind: 'anime',
          title: identity.title,
          // A first `track` with no status means "put this on my list".
          status: patch.status ?? 'plan',
          ...(identity.result?.japaneseTitle || identity.result?.originalTitle
            ? { originalTitle: (identity.result.japaneseTitle ?? identity.result.originalTitle) as string }
            : {}),
          ...(identity.result?.year ? { year: identity.result.year } : {}),
          ...(identity.result?.episodeCount ? { episodeCount: identity.result.episodeCount } : {}),
          ...(identifier(identity.result, 'mal') ? { malId: identifier(identity.result, 'mal') } : {}),
          ...(identifier(identity.result, 'anilist') ? { anilistId: identifier(identity.result, 'anilist') } : {}),
        };
        const added = await window.api.watchAdd(input);
        if (!added.ok) throw watchFailure(t, added);
        view = added.title;
        delete patch.status;
      }
      if (highest > (view.progress ?? 0)) patch.progress = highest;
      if (Object.keys(patch).length) {
        const updated = await window.api.watchUpdate(view.id, patch);
        if (!updated.ok) throw watchFailure(t, updated);
        view = updated.title;
      }
      return { created, ...watchRow(view, identity) };
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
      const view = await findWatchTitle(identity);
      if (!view) throw new Error(t('blanc.agent.error.animeNotTracked'));

      const { patch, fields } = watchPatch(arguments_);
      // Airing dates are fetched by main (`watchAiring.ts`) from the title's ids;
      // a schedule the agent supplied would be a guess competing with that, so
      // it is refused by name rather than silently dropped.
      const ignored = arguments_.schedule !== undefined ? ['schedule'] : [];
      if (!fields.length) throw new Error(t('blanc.agent.error.nothingToUpdate'));

      const updated = await window.api.watchUpdate(view.id, patch);
      if (!updated.ok) throw watchFailure(t, updated);
      // The store normalizes what it stores, so the answer is read back out of
      // the saved record rather than echoed from the patch.
      return {
        updated: fields,
        ...(ignored.length ? { ignored } : {}),
        ...watchRow(updated.title, identity),
      };
    },

    'anime.analyze-difficulty': async (arguments_) => {
      const identity = resolveAnime(t, textArgument(t, arguments_, 'identityId'));
      // Difficulty is measured from Japanese subtitles, which live on a media
      // item — a tracking record holds no text. The caller may name the item;
      // otherwise the tracked title has to identify exactly one, because
      // analysing the wrong episode is a silently wrong answer.
      const mediaId = optionalText(arguments_, 'mediaId', 200) ?? identity.title;
      const item = await resolveMedia(t as MediaAgentTranslate, mediaId);
      const { record, cueCount, droppedCues, analysis } = await analyzeSubtitles(
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
        // Only when a dual-language release actually lost lines; see `analyzeSubtitles`.
        ...(droppedCues ? { cuesDroppedOtherScript: droppedCues } : {}),
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
