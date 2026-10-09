// @vitest-environment jsdom
/**
 * Due lists must follow the clock, not only the deck.
 *
 * Found by the headless e2e harness (tools/e2e, flow `srs`): FlashcardsContent memoised
 * its due lists on the deck alone, so with the window open a learning card whose
 * 10-minute step had passed (or a new day's reviews) never reached "Start review (N)"
 * until some unrelated edit touched the deck. `useDueClock` is the dependency that moves
 * with time; this pins that it ticks, that a memo keyed on it re-evaluates, and that
 * FlashcardsContent's due memos are keyed on it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dueClockMinute, useDueClock } from '../useDueClock';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A card due at `dueAt`, counted the way the deck's due list counts it: against Date.now. */
function DueCount({ dueAt }: { dueAt: number }) {
  const clock = useDueClock();
  const due = useMemo(() => (Date.now() >= dueAt ? 1 : 0), [dueAt, clock]);
  return <span data-due={due}>{due}</span>;
}

describe('useDueClock', () => {
  it('counts whole minutes', () => {
    expect(dueClockMinute(0)).toBe(0);
    expect(dueClockMinute(59_999)).toBe(0);
    expect(dueClockMinute(60_000)).toBe(1);
  });

  it('a memo keyed on it notices a step that came due while nothing else changed', () => {
    const dueAt = Date.now() + 10 * 60_000; // a learning card's 10-minute step
    root = createRoot(host);
    act(() => root!.render(<DueCount dueAt={dueAt} />));
    expect(host.querySelector('span')?.dataset.due).toBe('0');
    act(() => {
      vi.advanceTimersByTime(9 * 60_000);
    });
    expect(host.querySelector('span')?.dataset.due).toBe('0');
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(host.querySelector('span')?.dataset.due).toBe('1');
  });

  it('coming back to the window re-reads the clock at once', () => {
    const dueAt = Date.now() + 5_000;
    root = createRoot(host);
    act(() => root!.render(<DueCount dueAt={dueAt} />));
    // Time passes without the interval firing (a suspended machine), then focus.
    vi.setSystemTime(Date.now() + 120_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(host.querySelector('span')?.dataset.due).toBe('1');
  });

  it('FlashcardsContent keys every due list on it', () => {
    const source = readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'), 'utf8');
    expect(source).toContain('const dueClock = useDueClock();');
    for (const memo of [
      /dueDeckCards\(epubReviewPool\), \[epubReviewPool, dueClock\]\)/,
      /\[sessionPool, sessionBookKey, reviewDueOnly, dueClock\]/,
      /\[sessionPool, sessionBookKey, reviewDueOnly, reviewMode, dueClock\]/,
      /\[epubReviewPool, reviewDueOnly, reviewMode, dueClock\]/,
    ]) {
      expect(source).toMatch(memo);
    }
  });
});
