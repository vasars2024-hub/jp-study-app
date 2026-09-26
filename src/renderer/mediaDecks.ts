/**
 * Named personal decks for a series, kept up to date as episodes arrive.
 *
 * Mining an episode used to drop every card into one "Media" folder. A learner
 * following a show can now name a deck for it and ask for it to be kept
 * current: whenever an episode of that series is analysed (study mode, or the
 * player's analysis), its new words, kanji, sentences and grammar are added to
 * that deck, and nothing already in it is added twice.
 */
import { writeLocalStorageJson } from './localStorageWrite';
import type { VisualNovelStudyCardKind } from '../shared/visualNovelStudyCards';

export const MEDIA_DECKS_KEY = 'jp-media-series-decks-v1';

export interface SeriesDeckSubscription {
  /** Normalised series title, from `seriesKey`. */
  key: string;
  folder: string;
  kinds: VisualNovelStudyCardKind[];
  createdAt: number;
}

/**
 * A file's series title: the part before an episode marker. `Frieren - 07`,
 * `[Group] Frieren S01E07 (1080p)`, `葬送のフリーレン 第7話` all give the show.
 */
export function guessSeriesTitle(title: string): string {
  const cleaned = title
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ')
    .replace(/\.(mkv|mp4|avi|webm|m4v)$/i, '')
    .replace(/[._]+/g, ' ');
  const cut = cleaned.split(/\s(?:-|–|—)\s*\d|\sS\d+E\d+|\sE(?:p(?:isode)?)?\s?\d+|\s#\d+|\s?第\s?\d+\s?[話回集]|\s\d{1,3}(?:v\d)?\s*$/i)[0];
  return (cut || cleaned).replace(/\s+/g, ' ').trim() || title.trim();
}

export function seriesKey(title: string): string {
  return guessSeriesTitle(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function loadSeriesDecks(): SeriesDeckSubscription[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEDIA_DECKS_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((s): s is SeriesDeckSubscription => !!s && typeof s === 'object' && typeof (s as SeriesDeckSubscription).key === 'string' && typeof (s as SeriesDeckSubscription).folder === 'string')
      : [];
  } catch {
    return [];
  }
}

export function subscribeSeriesDeck(
  title: string,
  folder: string,
  kinds: readonly VisualNovelStudyCardKind[],
  now = Date.now(),
): SeriesDeckSubscription {
  const sub: SeriesDeckSubscription = { key: seriesKey(title), folder: folder.trim(), kinds: [...kinds], createdAt: now };
  writeLocalStorageJson(MEDIA_DECKS_KEY, [...loadSeriesDecks().filter((s) => s.key !== sub.key), sub]);
  return sub;
}

export function unsubscribeSeriesDeck(title: string): void {
  const key = seriesKey(title);
  writeLocalStorageJson(MEDIA_DECKS_KEY, loadSeriesDecks().filter((s) => s.key !== key));
}

export function seriesDeckFor(title: string): SeriesDeckSubscription | null {
  const key = seriesKey(title);
  return loadSeriesDecks().find((s) => s.key === key) ?? null;
}
