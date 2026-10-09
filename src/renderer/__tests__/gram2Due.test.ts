// @vitest-environment jsdom
/** gram2 — the grammar review queue as Flashcards, the Calendar and Statistics read it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));

import { GRAMMAR_REVIEW_EVENT, grammarDueOnDay, grammarDueSummary, openGrammarReview } from '../grammarDue';
import { enrolGrammarPoints, reviewGrammarPoint } from '../grammarSrs';
import { takeHandoff } from '../pendingHandoff';
import { openAppSection } from '../extensionBridgeUi';
import { DEFAULT_SCHEDULING_CONFIG } from '../../shared/flashcardScheduling';

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 8, 9, 0).getTime();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe('grammarDueSummary', () => {
  it('counts due and scheduled points and finds the next one', () => {
    let s = enrolGrammarPoints({}, ['a', 'b'], T0);
    s = reviewGrammarPoint(s, 'b', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    const summary = grammarDueSummary(s, T0);
    expect(summary).toEqual({ due: 1, scheduled: 2, nextAt: s.b.dueAt });
    expect(grammarDueSummary({}, T0)).toEqual({ due: 0, scheduled: 0, nextAt: null });
  });
});

describe('grammarDueOnDay', () => {
  it('owes overdue points today, and only first-due points on a later day', () => {
    const s = {
      ...enrolGrammarPoints({}, ['overdue'], T0 - 3 * DAY),
      ...enrolGrammarPoints({}, ['tomorrow'], T0 + DAY),
    };
    const todayStart = new Date(2026, 9, 8).getTime();
    expect(grammarDueOnDay(s, todayStart, todayStart + DAY, true)).toBe(1);
    expect(grammarDueOnDay(s, todayStart + DAY, todayStart + 2 * DAY, false)).toBe(1);
    expect(grammarDueOnDay(s, todayStart + 2 * DAY, todayStart + 3 * DAY, false)).toBe(0);
  });
});

describe('openGrammarReview', () => {
  it('leaves a handoff for a Grammar view that is not mounted, opens it, and announces it', () => {
    const heard = vi.fn();
    window.addEventListener(GRAMMAR_REVIEW_EVENT, heard);
    openGrammarReview();
    window.removeEventListener(GRAMMAR_REVIEW_EVENT, heard);
    expect(openAppSection).toHaveBeenCalledWith('grammar');
    expect(heard).toHaveBeenCalledOnce();
    expect(takeHandoff('grammarReview')).toBe('1');
    expect(takeHandoff('grammarReview')).toBeNull();
  });
});
