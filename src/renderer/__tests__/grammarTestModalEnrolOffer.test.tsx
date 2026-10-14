// @vitest-environment jsdom
/**
 * G13: a practice test used to enrol every unscheduled point it asked about
 * (`recordTestAnswer` wrote a first review for any point with no schedule), so a
 * 20-question test over an N1 filter quietly put 20 N1 points into the Review
 * tab. Now a test moves only the schedule of points that are scheduled and due,
 * and the unscheduled ones are offered at the end — "Add N new points to
 * reviews" — and join only when the learner presses it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GrammarTestModal from '../components/grammar/GrammarTestModal';
import { DEFAULT_PRACTICE_FILTERS } from '../data/grammar/practiceFilters';
import type { NormalizedGrammarPoint } from '../data/grammar';
import { loadGrammarSrs, reviewGrammarPoint, saveGrammarSrs } from '../grammarSrs';
import { SESSION_OPTIONS_KEY } from '../grammarSession';
import { DEFAULT_SCHEDULING_CONFIG } from '../../shared/flashcardScheduling';

const point = (id: string): NormalizedGrammarPoint =>
  ({
    id,
    lang: 'ja',
    level: 'N5',
    title: `〜${id}`,
    meaning: `meaning ${id}`,
    structure: '',
    explanation: '',
    categories: [],
    functions: [],
    examples: [],
    provenance: { verification: 'verified', tagSource: 'authored' },
  }) as unknown as NormalizedGrammarPoint;

const POOL = [point('a'), point('b'), point('c')];
const DAY = 86_400_000;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function render(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(<GrammarTestModal pool={POOL} initialFilters={DEFAULT_PRACTICE_FILTERS} onClose={() => undefined} />);
  });
  return host;
}

function button(el: HTMLElement, match: RegExp | string): HTMLButtonElement {
  const found = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    typeof match === 'string' ? b.textContent?.trim() === match : match.test(b.textContent ?? ''),
  );
  if (!found) throw new Error(`no button ${String(match)}`);
  return found;
}

function click(el: HTMLElement): void {
  act(() => {
    el.click();
  });
}

/** Start a flip-only test of every point and answer each one Good. */
function takeTest(el: HTMLElement): void {
  click(button(el, 'Start'));
  for (let i = 0; i < POOL.length; i += 1) {
    click(button(el, 'Reveal meaning'));
    click(el.querySelector<HTMLButtonElement>('.gx-grade-good')!);
  }
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    SESSION_OPTIONS_KEY,
    JSON.stringify({ count: 3, direction: 'recognition', types: ['flip'], mastered: 'include', newRatio: 0.7 }),
  );
  // `a` is scheduled and due (reviewed two days ago, one-day interval); b and c are new.
  saveGrammarSrs(reviewGrammarPoint({}, 'a', 'good', DEFAULT_SCHEDULING_CONFIG, Date.now() - 2 * DAY));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('practice test and unscheduled points (G13)', () => {
  it('moves only the due point, and enrols nothing new by itself', () => {
    const before = loadGrammarSrs().a;
    const el = render();
    takeTest(el);
    expect(el.querySelector('.gx-test-done')).toBeTruthy();
    const after = loadGrammarSrs();
    expect(Object.keys(after)).toEqual(['a']);
    expect(after.a.repetitions).toBe(before.repetitions + 1);
    // The offer names exactly the two unscheduled points.
    expect(el.querySelector('.gx-test-enrol')?.textContent).toContain('You answered 2 points that are not in your reviews');
    expect(button(el, 'Add 2 new points to reviews')).toBeTruthy();
  });

  it('enrols them when the learner accepts, from their test answer', () => {
    const el = render();
    takeTest(el);
    click(button(el, 'Add 2 new points to reviews'));
    const after = loadGrammarSrs();
    expect(Object.keys(after).sort()).toEqual(['a', 'b', 'c']);
    // Answered Good: the first review is already done, so neither is due again right away.
    expect(after.b.lastRating).toBe('good');
    expect(after.c.dueAt).toBeGreaterThan(Date.now());
    expect(el.querySelector('.gx-test-enrol-done')?.textContent).toBe(
      'Added 2 points to reviews. They come back when they are due.',
    );
    expect(el.querySelector('.gx-test-enrol-add')).toBeNull();
  });

  it('makes no offer when every tested point is already scheduled', () => {
    saveGrammarSrs({
      ...loadGrammarSrs(),
      ...reviewGrammarPoint({}, 'b', 'good', DEFAULT_SCHEDULING_CONFIG, Date.now()),
      ...reviewGrammarPoint({}, 'c', 'good', DEFAULT_SCHEDULING_CONFIG, Date.now()),
    });
    const el = render();
    takeTest(el);
    expect(el.querySelector('.gx-test-enrol')).toBeNull();
  });
});
