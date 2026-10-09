/**
 * The Arena's daily warm-up: one short game, picked by what is due (`shared/gameStudyMix.ts`
 * `pickWarmUp`), offered until it has been played today.
 */
import { pickWarmUp, type WarmUpPick } from '../../shared/gameStudyMix';
import type { StudyLang } from '../../shared/levelScale';
import { writeLocalStorage } from '../localStorageWrite';
import { warmUpQueue } from './contentStore';

const WARM_UP_DAY_KEY = 'jp-game-warmup-day';
export const WARM_UP_EVENT = 'jp-game-warmup-changed';

function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dayOfYear(now = new Date()): number {
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function warmUpDoneToday(now = new Date()): boolean {
  try {
    return localStorage.getItem(WARM_UP_DAY_KEY) === todayKey(now);
  } catch {
    return false;
  }
}

export function markWarmUpDone(now = new Date()): void {
  writeLocalStorage(WARM_UP_DAY_KEY, todayKey(now));
  try {
    window.dispatchEvent(new CustomEvent(WARM_UP_EVENT));
  } catch {
    /* non-browser context */
  }
}

/** Today's warm-up for the study language, from the deck's current queue. */
export function todaysWarmUp(studyLang: StudyLang, canListen: boolean, now = new Date()): WarmUpPick & { due: number } {
  const queue = warmUpQueue(now.getTime());
  const pick = pickWarmUp(
    { studyLang, dueCloze: queue.dueCloze, dueReadable: queue.dueReadable, dueVocab: queue.dueVocab, deckCards: queue.deckCards, canListen },
    dayOfYear(now),
  );
  return { ...pick, due: queue.dueVocab };
}
