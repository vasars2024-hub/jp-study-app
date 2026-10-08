// Episode row identity (P6, 2026-10).
//
// A row id used to be `${seriesId}-e${number}`, so season 2 episode 1 and a
// special numbered 1 collided with season 1 episode 1: the second one replaced
// the first in every map keyed by id, and "new episode" detection compared the
// wrong rows. The id now carries the season and the kind.
//
// Stored results written before this change still hold the old ids, so every
// comparison against stored ids goes through `episodeIdAliases`, which yields
// the id a stored row would get today alongside the one it was saved with.

import type { EpisodeKind, EpisodeRow } from './scraperResults';

/** `e` for an ordinary episode, the kind's own name otherwise. */
function kindCode(kind: EpisodeKind | string): string {
  return !kind || kind === 'episode' ? 'e' : String(kind);
}

export function episodeRowId(
  seriesId: string,
  season: number,
  kind: EpisodeKind | string,
  number: number,
): string {
  const s = Number.isFinite(season) && season > 0 ? Math.round(season) : 1;
  return `${seriesId}-s${s}-${kindCode(kind)}${number}`;
}

/**
 * Every id a stored row may be known by: the id it was saved with, the id it
 * would be given today, and the legacy `${seriesId}-e${number}` form.
 */
export function episodeIdAliases(
  row: Pick<EpisodeRow, 'id' | 'seriesId' | 'season' | 'kind' | 'number'>,
): string[] {
  const ids = new Set<string>([row.id]);
  if (row.seriesId && Number.isFinite(row.number)) {
    ids.add(episodeRowId(row.seriesId, row.season, row.kind, row.number));
    const legacySeasonOne = (row.season ?? 1) === 1 && (!row.kind || row.kind === 'episode');
    if (legacySeasonOne) ids.add(`${row.seriesId}-e${row.number}`);
  }
  return [...ids];
}
