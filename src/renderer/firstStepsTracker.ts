/**
 * Ticks the "first five minutes" checklist from activity the app already
 * reports, so the list measures what the user actually did rather than which
 * buttons they pressed on the card.
 *
 *   lookup  — a dictionary lookup was recorded (`lookupHistory`)
 *   mine    — the deck grew past its size when the checklist armed, or a
 *             media mine was counted in Statistics
 *   review  — a flashcard review or practice was recorded
 *   media   — watching, reading or listening time was recorded, or a video /
 *             book was opened
 *
 * Lazy-loaded by the checklist card (it imports the deck store), so none of
 * this sits in the Study OS boot graph.
 */
import { LOOKUP_HISTORY_EVENT } from './lookupHistory';
import {
  LISTEN_RECORDED_EVENT,
  MEDIA_STUDY_RECORDED_EVENT,
  READING_RECORDED_EVENT,
  REVIEW_RECORDED_EVENT,
  WATCH_RECORDED_EVENT,
} from './stats';
import { FLASHCARD_DECK_EVENT, loadDeck } from './flashcardDeck';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../shared/mediaWorkspace';
import { BOOK_OPEN_AT_EVENT } from './bookRoundTrip';
import { loadFirstRun, markFirstStepDone, type FirstStepsTaskId } from './firstRunSetup';

/** The deck's size right now, or null when it cannot be read. */
export function currentDeckSize(): number | null {
  try {
    return loadDeck().length;
  } catch {
    return null;
  }
}

/** Pure: has the deck grown past the armed baseline? */
export function deckGrew(baseline: number | null, size: number | null): boolean {
  if (size === null) return false;
  return size > (baseline ?? 0);
}

export function installFirstStepsTracker(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const mark = (task: FirstStepsTaskId) => (): void => {
    markFirstStepDone(task);
  };
  const onDeck = (): void => {
    if (deckGrew(loadFirstRun().deckBaseline, currentDeckSize())) markFirstStepDone('mine');
  };
  const onMediaStudy = (event: Event): void => {
    const detail = (event as CustomEvent<{ kind?: string } | undefined>).detail;
    if (detail?.kind === 'mined') markFirstStepDone('mine');
  };
  const listeners: Array<[string, (event: Event) => void]> = [
    [LOOKUP_HISTORY_EVENT, mark('lookup')],
    [REVIEW_RECORDED_EVENT, mark('review')],
    [FLASHCARD_DECK_EVENT, onDeck],
    [MEDIA_STUDY_RECORDED_EVENT, onMediaStudy],
    [WATCH_RECORDED_EVENT, mark('media')],
    [READING_RECORDED_EVENT, mark('media')],
    [LISTEN_RECORDED_EVENT, mark('media')],
    [MEDIA_WORKSPACE_OPEN_EVENT, mark('media')],
    [BOOK_OPEN_AT_EVENT, mark('media')],
  ];
  for (const [name, fn] of listeners) window.addEventListener(name, fn);
  // A card mined in another window before this one loaded still counts.
  onDeck();
  return () => {
    for (const [name, fn] of listeners) window.removeEventListener(name, fn);
  };
}
