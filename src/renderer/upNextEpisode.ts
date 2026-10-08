/**
 * "Up next" at the end of an episode in the study player — which file, and what to do.
 *
 * ## Which file
 *
 * The library already knows what a series is: `buildLibraryEntries` groups episodic files by
 * `seriesKey`, orders each run by season then episode, and moves OPs, EDs, OVAs and specials
 * out of the numbered run. The episode after this one is simply the next member of that
 * run. Reusing it means the player and the library cannot disagree about what "next" is — a
 * second ordering rule here would be a second chance to offer "NCED 2" after episode 11.
 *
 * A file the library does not hold, a film, a standalone clip, an extra, or the last episode
 * of a run has no next episode, and the card simply does not appear. Guessing from sibling
 * files on disk is deliberately not done: a folder is not a series.
 *
 * ## What to do
 *
 * Only a real `ended` shows the card. A study practice loop (line loop, A-B loop) or
 * auto-pause never produces one — they pause or seek before the end — and if the element
 * is sent back into the file after `ended` (a loop seeking back, the user scrubbing), the
 * card withdraws, because the user is evidently not done with this episode.
 *
 * Autoplay is **off by default**: the card always shows, and only counts down to the next
 * episode when the viewer turned that on. A study session that ends an episode on a line
 * worth mining must not be yanked into the next one by default.
 */
import { mediaCategory } from '../shared/mediaCategories';
import { buildLibraryEntries, groupingForCategory } from '../shared/mediaLibraryEntries';
import { studyLibraryPathKey } from '../shared/seanimeStudyLibrary';
import type { MediaItem } from '../shared/types';
import { writeLocalStorage } from './localStorageWrite';

/** Persisted "play the next episode automatically" preference. `'1'` on, anything else off. */
export const UP_NEXT_AUTOPLAY_STORAGE_KEY = 'jp-study-up-next-autoplay-v1';

/** Seconds the card counts down before autoplay opens the next episode. */
export const UP_NEXT_COUNTDOWN_SEC = 10;

/**
 * The episode after `currentPath` in its library series, or `null` when there is none.
 * Paths are compared through `studyLibraryPathKey`, the join every Phase 6 surface shares,
 * so a lower-cased or forward-slashed path from the player still finds its library row.
 */
export function nextEpisodeAfter(
  items: readonly MediaItem[],
  currentPath: string | null | undefined,
): MediaItem | null {
  const currentKey = studyLibraryPathKey(currentPath ?? '');
  if (!currentKey) return null;
  const originals = new Map<string, MediaItem>();
  const videos: MediaItem[] = [];
  for (const item of items) {
    if (!item || typeof item.path !== 'string' || typeof item.id !== 'string') continue;
    if (item.kind === 'audio' || item.kind === 'audiobook') continue;
    originals.set(item.id, item);
    // A parsed series with numbered episodes is a series even before anything filed it
    // under a category: an "[Group] Show - 03.mkv" fresh from a watch folder lands in
    // `inbox`, where the library would show it alone and the player would offer nothing.
    const numberedSeries = typeof item.seriesKey === 'string'
      && item.seriesKey.trim() !== ''
      && typeof item.episode === 'number'
      && groupingForCategory(mediaCategory(item)) !== 'series';
    videos.push(numberedSeries ? { ...item, category: 'tv' } : item);
  }
  for (const entry of buildLibraryEntries(videos)) {
    if (entry.grouping !== 'series') continue;
    const index = entry.items.findIndex((item) => studyLibraryPathKey(item.path) === currentKey);
    if (index < 0) continue;
    const next = entry.items[index + 1];
    if (!next || studyLibraryPathKey(next.path) === currentKey) return null;
    return originals.get(next.id) ?? next;
  }
  return null;
}

export type UpNextDecision =
  /** Nothing to show. */
  | 'none'
  /** Show the card; wait for Play now. */
  | 'card'
  /** Show the card counting down, then open the next episode. */
  | 'countdown';

export interface UpNextDecisionInput {
  /** The element fired `ended` and has not been sent back into the file since. */
  ended: boolean;
  /** A next episode was found. */
  hasNext: boolean;
  /** The persisted autoplay preference. */
  autoplay: boolean;
  /** The viewer dismissed the card for this episode. */
  dismissed: boolean;
}

export function upNextDecision(input: UpNextDecisionInput): UpNextDecision {
  if (!input.ended || !input.hasNext || input.dismissed) return 'none';
  return input.autoplay ? 'countdown' : 'card';
}

export function readUpNextAutoplay(): boolean {
  try {
    return localStorage.getItem(UP_NEXT_AUTOPLAY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeUpNextAutoplay(on: boolean): void {
  writeLocalStorage(UP_NEXT_AUTOPLAY_STORAGE_KEY, on ? '1' : '0');
}
