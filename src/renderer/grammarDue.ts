/**
 * The grammar review queue as the rest of the study loop sees it.
 *
 * Grammar points have had a real schedule (`grammarSrs.ts`) since the Review tab
 * landed, but only that tab knew: Flashcards said "0 due" on a day with twelve
 * grammar points waiting, the Calendar's day view counted cards only, and
 * Statistics reported grammar reviewed but never grammar due. A queue nobody is
 * shown is a queue nobody clears. This is the one reader those surfaces share,
 * and the one way to jump into the reviews.
 *
 * It deliberately does not import the grammar corpus (~2 MB): the schedule is
 * keyed by point id and the counts need nothing else, so Flashcards and the
 * Calendar can show them without paying for the data set.
 */
import { useEffect, useState } from 'react';
import type { LocalSrsState } from '../shared/localSrs';
import { loadGrammarSrs, onGrammarSrsChanged, type GrammarSrsState } from './grammarSrs';
import { setHandoff, clearHandoff } from './pendingHandoff';
import { openAppSection } from './extensionBridgeUi';

export const GRAMMAR_REVIEW_EVENT = 'grammar:open-review';

export interface GrammarDueSummary {
  /** Points due at `now`. */
  due: number;
  /** Points with any schedule. */
  scheduled: number;
  /** When the next not-yet-due point falls due, or null. */
  nextAt: number | null;
}

export function grammarDueSummary(state: GrammarSrsState, now = Date.now()): GrammarDueSummary {
  let due = 0;
  let scheduled = 0;
  let nextAt: number | null = null;
  for (const s of Object.values(state) as LocalSrsState[]) {
    scheduled += 1;
    if (s.dueAt <= now) due += 1;
    else if (nextAt === null || s.dueAt < nextAt) nextAt = s.dueAt;
  }
  return { due, scheduled, nextAt };
}

/**
 * Points falling due on one calendar day, for the Calendar's day view: for today
 * everything due by the end of the day (overdue included, since it is still owed
 * today); for a later day only what first falls due within it.
 */
export function grammarDueOnDay(
  state: GrammarSrsState,
  dayStart: number,
  dayEnd: number,
  isToday: boolean,
): number {
  let count = 0;
  for (const s of Object.values(state) as LocalSrsState[]) {
    if (s.dueAt >= dayEnd) continue;
    if (isToday || s.dueAt >= dayStart) count += 1;
  }
  return count;
}

/** Live summary, following reviews from any surface and the clock (relearn steps are minutes). */
export function useGrammarDue(): GrammarDueSummary {
  const [summary, setSummary] = useState(() => grammarDueSummary(loadGrammarSrs()));
  useEffect(() => {
    const refresh = (): void => setSummary(grammarDueSummary(loadGrammarSrs()));
    const off = onGrammarSrsChanged(refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);
  return summary;
}

/**
 * Open Grammar on its Review tab. The handoff covers a Grammar view that is not
 * mounted yet (it lives in a lazy chunk); a mounted one takes the event and
 * clears the handoff itself.
 */
export function openGrammarReview(): void {
  setHandoff('grammarReview', '1');
  openAppSection('grammar');
  window.dispatchEvent(new CustomEvent(GRAMMAR_REVIEW_EVENT));
}

/** For a mounted Grammar view: the request arrived as an event, so drop the handoff. */
export function consumeGrammarReviewEvent(): void {
  clearHandoff('grammarReview');
}
