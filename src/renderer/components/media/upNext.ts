import type { MediaItem } from '../../../shared/types';
import { WATCH_FINISHED_FRACTION } from '../../../shared/watchFinished';

/**
 * Ordering for the Video tab's "Up next" shelf.
 *
 * The shelf used to be `state.items.slice(0, 7)` — library insertion order. For
 * the common case, one series imported from one folder, that renders seven
 * visually identical posters in the order the files happened to land on disk.
 * It answers no question the viewer has: not "where was I", not "what comes
 * after this", not "what have I not seen".
 *
 * The order below is the order someone actually watches in:
 *
 *   1. Resume — anything started and not finished, most recently played first.
 *   2. Next episode — for each series already begun, the lowest unwatched
 *      episode above the furthest one reached. This is the single most likely
 *      next click and it belongs near the front.
 *   3. The rest of a begun series, in episode order.
 *   4. Everything untouched, newest import first.
 *
 * Ties inside a series always fall back to season/episode so the shelf never
 * reorders itself between renders.
 */

/** Fraction of the runtime past which an item counts as watched, not paused. */
const FINISHED_AT = WATCH_FINISHED_FRACTION;

export function watchProgress(item: MediaItem): number {
  if (!item.durationSec || !item.positionSec) return 0;
  return Math.max(0, Math.min(1, item.positionSec / item.durationSec));
}

export function isFinished(item: MediaItem): boolean {
  return watchProgress(item) >= FINISHED_AT;
}

export function isStarted(item: MediaItem): boolean {
  const progress = watchProgress(item);
  return progress > 0 && progress < FINISHED_AT;
}

function seriesOf(item: MediaItem): string {
  return item.seriesKey ?? item.seriesTitle ?? item.title;
}

/** Sort key inside a series: season first, then episode, then title. */
function episodeOrder(a: MediaItem, b: MediaItem): number {
  const season = (a.season ?? 1) - (b.season ?? 1);
  if (season !== 0) return season;
  const episode = (a.episode ?? Number.MAX_SAFE_INTEGER) - (b.episode ?? Number.MAX_SAFE_INTEGER);
  if (episode !== 0) return episode;
  return a.title.localeCompare(b.title);
}

export function orderUpNext(items: MediaItem[]): MediaItem[] {
  const videos = items.filter((item) => item.kind !== 'audio' && item.kind !== 'audiobook');

  const resume = videos.filter(isStarted).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));

  // How recently each series was touched, so a series you watched today ranks
  // above one you abandoned last month.
  const seriesTouchedAt = new Map<string, number>();
  for (const item of videos) {
    if (!item.lastPlayedAt) continue;
    const key = seriesOf(item);
    seriesTouchedAt.set(key, Math.max(seriesTouchedAt.get(key) ?? 0, item.lastPlayedAt));
  }

  const taken = new Set(resume.map((item) => item.id));
  const nextInSeries: MediaItem[] = [];
  const restOfSeries: MediaItem[] = [];

  const begun = [...seriesTouchedAt.keys()]
    .sort((a, b) => (seriesTouchedAt.get(b) ?? 0) - (seriesTouchedAt.get(a) ?? 0));

  for (const key of begun) {
    const unwatched = videos
      .filter((item) => seriesOf(item) === key && !taken.has(item.id) && watchProgress(item) === 0)
      .sort(episodeOrder);
    const [head, ...tail] = unwatched;
    if (head) {
      nextInSeries.push(head);
      taken.add(head.id);
    }
    for (const item of tail) {
      restOfSeries.push(item);
      taken.add(item.id);
    }
  }

  const untouched = videos
    .filter((item) => !taken.has(item.id))
    .sort((a, b) => {
      const sameSeries = seriesOf(a) === seriesOf(b);
      if (sameSeries) return episodeOrder(a, b);
      return b.addedAt - a.addedAt;
    });

  return [...resume, ...nextInSeries, ...restOfSeries, ...untouched];
}
