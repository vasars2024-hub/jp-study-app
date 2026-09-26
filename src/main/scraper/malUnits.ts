// Downloadable-unit enumeration for a clicked catalogue entry.
//
// The Discover console hands over an entry the user picked — a MyAnimeList or
// AniList id — and this answers the only question the download dialog needs
// before it can offer a range: what units does this entry actually have?
//
// It reads published catalogue metadata and nothing else. Deciding which of
// those units to fetch is `shared/malDownload.ts`, and fetching them is the
// torrent handoff on the Torrent Manager path — neither belongs here.
//
// Anime only. Manga chapters are per-provider rather than per-catalogue: they
// come from an installed provider extension through the reading boundary
// (`main/reading/`), which already enumerates and downloads them, so routing
// them through here would mean two code paths onto one Seanime call.

import {
  catalogueEpisodes,
  catalogueWorkById,
  providerLabel,
  type CatalogueWork,
} from './catalogue';
import { scraperLog } from './logBus';
import {
  episodeLabel,
  MAL_UNITS_CATALOGUE_BUSY,
  type MalDownloadTarget,
  type MalDownloadUnit,
  type MalUnitsInput,
  type MalUnitsResult,
} from '../../shared/malDownload';

function targetFor(work: CatalogueWork, input: MalUnitsInput): MalDownloadTarget {
  return {
    contentType: 'anime',
    provider: input.provider,
    id: input.id,
    title: work.titleEn || work.titleRomaji,
    nativeTitle: work.titleJa,
    romajiTitle: work.titleRomaji || work.titleEn,
    posterUrl: work.posterUrl,
    totalUnits: work.episodeCount,
  };
}

/**
 * A placeholder list for a title whose episodes the catalogue does not enumerate.
 *
 * Jikan lists episodes only once they have aired, and AniList's schedule can be
 * empty for an older series it never tracked — but the *count* is published in
 * both cases. Offering `1..count` there is better than an empty dialog: the
 * numbers are what the release indexes are searched by anyway, and every field
 * this cannot know stays empty rather than being invented.
 */
function placeholderUnits(count: number): MalDownloadUnit[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      key: `ep-${number}`,
      ordinal: index,
      number,
      label: episodeLabel(number),
      title: '',
      nativeTitle: '',
      airDate: null,
      filler: false,
      recap: false,
      source: null,
    };
  });
}

/** Hard ceiling on a placeholder list, so a bad `episodeCount` cannot flood the UI. */
const MAX_PLACEHOLDER_UNITS = 5_000;

/**
 * The catalogue did not answer. Offer `1..count` from what the caller already knows
 * (the library's episode count), and say — as a code the renderer translates — that
 * the service was busy, so trying again later can fill in titles and air dates.
 */
function catalogueBusy(input: MalUnitsInput): MalUnitsResult {
  const known = input.known && typeof input.known === 'object' ? input.known : undefined;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const declared = Number(known?.episodeCount);
  const count = Number.isFinite(declared) ? Math.min(Math.max(0, Math.trunc(declared)), MAX_PLACEHOLDER_UNITS) : 0;
  scraperLog('warn', 'catalogue', `No record for ${input.provider} ${input.id}; offering ${count} placeholder episode(s).`, {
    correlationId: `mal-units-${input.provider}-${input.id}`,
  });
  const title = text(known?.title);
  return {
    target: {
      contentType: 'anime',
      provider: input.provider,
      id: input.id,
      title,
      nativeTitle: text(known?.nativeTitle),
      romajiTitle: title,
      posterUrl: text(known?.posterUrl),
      totalUnits: count,
    },
    units: placeholderUnits(count),
    servedBy: '',
    note: MAL_UNITS_CATALOGUE_BUSY,
  };
}

export async function listMalUnits(input: MalUnitsInput): Promise<MalUnitsResult> {
  const correlationId = `mal-units-${input.provider}-${input.id}`;
  if (input.contentType !== 'anime') {
    throw new Error(`${input.contentType} units come from the reading providers, not the catalogue.`);
  }

  scraperLog('info', 'catalogue', `Listing units for ${input.provider} ${input.id}.`, {
    correlationId,
  });
  let work: CatalogueWork | null = null;
  try {
    work = await catalogueWorkById(input.provider, input.id, correlationId);
  } catch (error) {
    scraperLog('warn', 'catalogue', `Id lookup failed: ${error instanceof Error ? error.message : String(error)}`, {
      correlationId,
    });
  }
  // No record is almost always the catalogue being busy (Jikan answers 429/5xx under load),
  // not the id being wrong — the id came from that catalogue. This used to throw "The
  // catalogue has no jikan entry 34798.", in English, and the dialog was a dead end.
  if (!work) return catalogueBusy(input);

  const episodes = await catalogueEpisodes(work, correlationId);
  const target = targetFor(work, input);

  if (episodes.length) {
    const units = episodes.map((episode, index): MalDownloadUnit => ({
      key: `ep-${episode.number}`,
      ordinal: index,
      number: episode.number,
      label: episodeLabel(episode.number),
      title: episode.titleEn || episode.titleRomaji,
      nativeTitle: episode.titleJa,
      airDate: episode.airDate,
      filler: episode.filler,
      recap: episode.recap,
      source: null,
    }));
    scraperLog('info', 'catalogue', `${units.length} episode(s) listed.`, { correlationId });
    return { target, units, servedBy: providerLabel(work), note: '' };
  }

  const declared = Math.min(Math.max(0, Math.trunc(work.episodeCount)), MAX_PLACEHOLDER_UNITS);
  if (declared > 0) {
    scraperLog(
      'info',
      'catalogue',
      `No episode list published; offering the declared ${declared} episode(s).`,
      { correlationId },
    );
    return {
      target,
      units: placeholderUnits(declared),
      servedBy: providerLabel(work),
      note: 'no-episode-list',
    };
  }

  scraperLog('warn', 'catalogue', 'The catalogue lists no episodes for this title.', {
    correlationId,
  });
  return { target, units: [], servedBy: providerLabel(work), note: 'nothing-listed' };
}
