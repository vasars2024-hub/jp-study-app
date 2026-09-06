// @vitest-environment jsdom
/**
 * Reading Finder's filtered-empty state has to offer its own way out.
 *
 * Measured live 2026-09-06 against the running app (debug bridge, window 1, the
 * `reading` workspace tab). `document.documentElement`'s `data-material` read
 * **null** — the default theme — and `AppChrome` returns `<>{children}</>` with no
 * menu bar at all unless the secret `aero`/`wired` material set is active
 * (`components/ui/AppChrome.tsx:62`). `resetFilters` was wired to exactly one
 * control, the View ▸ "Show all sites" menu item at `views/ReadingFinderView.tsx:77`,
 * so on the default theme it had no reachable trigger: a live inventory of the whole
 * reading window found **36 controls and zero** whose name matched
 * /reset|clear|show all|remove filter/.
 *
 * The dead end is one click deep. With the arrival level selection, setting Genre to
 * Classics alone took the grid to "0 sites" under "No sites match those filters." —
 * a sentence that states the cause and then offers nothing that acts on it. Getting
 * back meant re-driving the select by hand, which is the escape a user has to guess.
 *
 * WHAT IS PINNED, and why it is phrased this way: not "a button exists", but that the
 * filtered-empty state can be left BY PRESSING SOMETHING INSIDE IT and that pressing
 * it brings the catalogue back. A reset that renders but restores nothing would pass
 * a presence assertion and fail this one.
 *
 * The narrowing is derived from the surface's own select options rather than named,
 * so adding, renaming or removing a genre cannot make this test stale.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingFinderView from '../views/ReadingFinderView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((done) => { setTimeout(done, 2); });
  });
};

const cards = (): number => container.querySelectorAll('.rf-card').length;
const emptyState = (): HTMLElement | null => container.querySelector('.res-empty');
const resetButton = (): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>('.res-empty button');

/** React owns the select, so its native setter plus a bubbling `change` is the real path. */
const choose = async (select: HTMLSelectElement, value: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
};

/**
 * Walk the surface's OWN genre options until one empties the grid, and return it.
 * Deriving the corner rather than naming a genre is what keeps this test honest when
 * the catalogue changes: if no genre can empty the grid the corner does not exist and
 * the test says so instead of quietly passing.
 */
const narrowToEmpty = async (): Promise<string> => {
  const selects = [...container.querySelectorAll<HTMLSelectElement>('select')];
  const genre = selects[0];
  expect(genre, 'the Genre select must exist to narrow the catalogue').toBeTruthy();
  for (const option of [...genre.options].map((o) => o.value).filter((v) => v !== 'All')) {
    await choose(genre, option);
    if (cards() === 0) return option;
  }
  throw new Error('no genre empties the grid, so the filtered-empty state cannot be reached');
};

beforeEach(async () => {
  installReadingSurfaceApi();
  installResizeObserver();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ReadingFinderView onOpenBook={() => {}} mode="discover" />);
  });
  await flush();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('Reading Finder — a filtered-empty catalogue is escapable from the empty state', () => {
  it('reaches an empty grid through the surface\'s own Genre select', async () => {
    const resting = cards();
    expect(resting, 'the catalogue must render at rest for narrowing to mean anything').toBeGreaterThan(0);

    await narrowToEmpty();

    expect(cards()).toBe(0);
    expect(emptyState()?.textContent?.trim() ?? '', 'the empty state must say something').not.toBe('');
  });

  // The regression. Before the fix this found nothing: the only trigger was an
  // Aero-only menu item, and the default theme renders no menu bar.
  it('offers a reset control inside the empty state', async () => {
    await narrowToEmpty();

    const reset = resetButton();
    expect(reset, 'the filtered-empty state must carry its own way out').not.toBeNull();
    expect(reset?.disabled).toBe(false);
    expect(reset?.textContent?.trim() ?? '', 'the reset must be named, not a bare glyph').not.toBe('');
  });

  // Presence is not the property that matters — pressing it has to actually restore
  // the catalogue. This is the assertion a decorative reset would fail.
  //
  // The restored count is a SUPERSET of the resting one, not equal to it: at rest the
  // level chips are already narrowed to the reader's own tier (8 of 23 sites here),
  // and "Show all sites" clears the level filter too, exactly as its name says. So the
  // property is "strictly more than the empty state, and at least what we started
  // with" — asserting equality would pin the level default instead of the reset.
  it('restores the catalogue when that control is pressed', async () => {
    const resting = cards();
    await narrowToEmpty();
    expect(cards()).toBe(0);

    const reset = resetButton();
    expect(reset).not.toBeNull();
    await act(async () => { reset?.click(); });
    await flush();

    expect(cards()).toBeGreaterThanOrEqual(resting);
    expect(cards()).toBeGreaterThan(0);
    expect(emptyState(), 'the empty state must be gone once the catalogue is back').toBeNull();
  });

  // The reset must not appear where it would do nothing. At rest the grid is not
  // empty at all, so the empty state — and with it the button — must be absent.
  it('shows no reset while the catalogue is unfiltered', () => {
    expect(cards()).toBeGreaterThan(0);
    expect(emptyState()).toBeNull();
    expect(resetButton()).toBeNull();
  });
});
