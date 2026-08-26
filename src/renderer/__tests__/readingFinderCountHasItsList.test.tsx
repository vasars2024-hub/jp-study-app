// @vitest-environment jsdom
/**
 * Rubric category 2 on Reading Finder: the site count has to name a list that is on screen.
 *
 * Measured through `probes/cat2-clunkiness.cjs` against the running app, driving the surface's
 * dominant task — filter the catalogue, open a match. The task had no ending. Typing a query
 * swapped `ReadingSiteGrid` out for `ReadingUnifiedDiscovery` wholesale, and that panel renders
 * nothing at all until its Search button is pressed, because its results come from providers it
 * has not run yet. So a query matching one site rendered "1 site" above an idle "Press Search"
 * prompt with **zero** cards: the number was a promise the surface could not keep, and the click
 * that would finish the task had no target. The harness could not even complete the task — it
 * refused with `click:.rf-card: no match in surface`, which is what a dead end looks like when
 * the control is not merely inert but absent.
 *
 * A previous fix had already noticed the neighbouring half of this — the comment above the
 * `catalogueNoMatch` branch is about a query with ZERO matches leaving "0 sites" standing beside
 * nothing. That branch was added and the non-empty one was left, which is exactly why this is
 * pinned as an invariant over both cases rather than as a second special case.
 *
 * THE ASSERTIONS READ THE CATALOGUE, NOT A FIXTURE. The query is derived from whichever card the
 * surface itself renders at rest, so no site name, level default or filter default is hardcoded
 * and adding or removing a site cannot make this test stale. What is pinned is only the relation:
 * the number the count states and the number of cards rendered are the same number.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingFinderView from '../views/ReadingFinderView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Opening a book is not what this file measures; the surface only needs the prop to exist. */
const opened: string[] = [];

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((done) => { setTimeout(done, 2); });
  });
};

/** The count renders as "N site"/"N sites" through i18n, so the number is read, not the wording. */
const statedCount = (): number => {
  const label = container.querySelector('.gram-count')?.textContent ?? '';
  const digits = label.match(/\d+/);
  return digits ? Number(digits[0]) : Number.NaN;
};
const renderedCards = (): number => container.querySelectorAll('.rf-card').length;

/**
 * React owns the input, so assigning `.value` leaves its state a render behind. The native setter
 * plus a bubbling `input` event is the path the running app's own keystrokes take.
 */
const type = async (value: string): Promise<void> => {
  const field = container.querySelector<HTMLInputElement>('.gram-search');
  expect(field, 'the search field must exist for the dominant task to be drivable').not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(field, value);
    field?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};

beforeEach(async () => {
  installReadingSurfaceApi();
  installResizeObserver();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ReadingFinderView onOpenBook={(item) => opened.push(item.id)} mode="discover" />);
  });
  await flush();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('Reading Finder — the site count never names cards that are not on screen', () => {
  it('agrees with the grid at rest', () => {
    expect(renderedCards()).toBeGreaterThan(0);
    expect(statedCount()).toBe(renderedCards());
  });

  // The regression itself. Before the fix this was `1` against `0`.
  it('agrees with the grid while a query is filtering', async () => {
    const first = container.querySelector('.rf-card .res-name')?.textContent?.trim() ?? '';
    expect(first, 'a resting card is needed to derive a query that must match').not.toBe('');

    await type(first);

    expect(statedCount()).toBeGreaterThan(0);
    expect(renderedCards()).toBe(statedCount());
  });

  // The card is the dominant task's target, so its absence is not cosmetic: it is the step the
  // user cannot take. Asserted separately from the count so a future regression says which broke.
  it('still offers a clickable card for a query that matches', async () => {
    const first = container.querySelector('.rf-card .res-name')?.textContent?.trim() ?? '';
    await type(first);

    const card = container.querySelector<HTMLButtonElement>('.rf-card');
    expect(card, 'filtering to a match must leave something to open').not.toBeNull();
    expect(card?.tagName).toBe('BUTTON');
    expect(card?.disabled).toBe(false);
  });

  // The neighbouring half, pinned so the two branches cannot drift apart again: a query that
  // matches nothing states zero AND says so, rather than leaving "0 sites" beside blank space.
  it('states zero and explains it when a query matches nothing', async () => {
    await type('zzqqxxnosuchthing');

    expect(renderedCards()).toBe(0);
    expect(statedCount()).toBe(0);
    expect(container.querySelector('.res-empty')?.textContent?.trim() ?? '').not.toBe('');
  });
});
