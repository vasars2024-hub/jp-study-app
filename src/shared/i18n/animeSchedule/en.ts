// Airing schedule -> release matching (audit C1-3) — English source of truth.
//
// Every state this surface can be in has its own string, on purpose. The
// failure modes are the point of the feature: "no release found", "the index
// could not be reached" and "releases exist but not for this episode" are
// three different facts, and collapsing them into one empty state is what
// makes a screen look complete while telling the user nothing.

import type { Catalog } from '../core';

export const ANIME_SCHEDULE_EN: Catalog = {
  'schedule.title': 'Airing schedule',
  'schedule.sub': 'Episodes airing now, with releases matched from the torrent index.',
  'schedule.load': 'Load schedule',
  'schedule.refresh': 'Refresh',
  'schedule.loading': 'Reading the schedule…',
  'schedule.empty': 'Nothing is scheduled in this window.',
  'schedule.unavailable': 'The airing schedule could not be read: {detail}',
  'schedule.summary': 'Matched {exact} · Needs review {review} · No release {none}',
  'schedule.episode': 'Episode {episode}',
  'schedule.window.day': 'Next 24 hours',
  'schedule.window.week': 'Next 7 days',
  'schedule.allowBatches': 'Accept season packs',

  // Per-row verdicts. `review` must never read like `exact`.
  'schedule.state.exact': 'Release found',
  'schedule.state.review': 'Possible match — unverified',
  'schedule.state.none': 'No release found',

  // Why there is no release. One reason per row, never a guess.
  'schedule.reason.searchFailed': 'The index could not be reached for this title.',
  'schedule.reason.noReleases': 'The index returned nothing for this title.',
  'schedule.reason.noEpisodeMatch': 'Releases exist for this title, but none for this episode.',
  'schedule.reason.belowConfidence': 'Nothing the index returned matched this title closely enough.',

  'schedule.matchedAs': 'Matched as “{title}” at {percent}% confidence',
  'schedule.source': 'Schedule: AniList · Release: {source}',
  'schedule.sourceNone': 'Schedule: AniList · no release',
  'schedule.seeders': 'Seeders',
  'schedule.considered': 'Considered {count}',
  'schedule.copyMagnet': 'Copy magnet',
  'schedule.copied': 'Magnet copied',
};
