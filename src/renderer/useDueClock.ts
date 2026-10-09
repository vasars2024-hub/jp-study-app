/**
 * A value that changes when cards may have become due.
 *
 * Due lists are memoised on the deck, and "is it due" also depends on the clock. With
 * nothing but the deck in the dependencies, a Flashcards window left open never noticed
 * that a learning card's 10-minute step had passed, or that midnight had brought a new
 * day's reviews: "Start review (0)" stayed until some unrelated edit touched the deck.
 * Found by the e2e harness (tools/e2e, flow `srs`). Adding this value to those memos
 * re-evaluates them once a minute and whenever the window comes back into view.
 */
import { useEffect, useState } from 'react';

/** The clock, in whole minutes: the granularity a due time is shown at. */
export function dueClockMinute(now: number = Date.now()): number {
  return Math.floor(now / 60_000);
}

export function useDueClock(pollMs = 30_000): number {
  const [minute, setMinute] = useState(() => dueClockMinute());
  useEffect(() => {
    const tick = (): void => setMinute(dueClockMinute());
    const timer = window.setInterval(tick, pollMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs]);
  return minute;
}
