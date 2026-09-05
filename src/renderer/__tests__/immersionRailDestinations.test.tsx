// @vitest-environment jsdom
/**
 * The curated destinations were unreachable from a page.
 *
 * `IMMERSION_STARTERS` had exactly two routes into the classic Study OS surface:
 * `ImmersionStage`'s empty state, and — on the aero variant only — `ImmersionView`'s
 * Sites menu. The empty state is by definition gone the moment a page loads, so on the
 * surface the Sites rail belongs to, the only way back to a curated destination was to
 * CLOSE the page you were reading, which discards its extraction. That is the same
 * "one-way door" shape `immersionClosePage.test.tsx` was written for, one level in.
 *
 * These tests hold the fix and the two things it must not become:
 *
 *   - the group is in the rail and reaches every starter, WITHOUT closing the page;
 *   - it does NOT render in the starter state, where the stage already shows the same
 *     five destinations larger and with its own disclosure split — a second copy on
 *     screen would be the clutter category 5 spent a slice removing;
 *   - the reverse transition works: close the page and the group goes away again.
 *
 * jsdom lays nothing out, so the dead-region number this slice was written against
 * (15.6 pct maximized, against a 15 bar) is a live measurement and lives in the
 * scorecard. What a unit test can hold is the structure that produced it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';
import { IMMERSION_STARTERS } from '../../shared/immersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITES = {
  sites: [
    { id: 's-1', url: 'https://www3.nhk.or.jp/news/', title: 'NHK ニュース', lang: 'ja', visitCount: 12, favorite: true, lastVisit: 1_700_000_000_000 },
  ],
};

const GROUP = '.immersion-rail-destinations';
const DESTINATION = '.immersion-rail-destination';
const URL_BAR = '.immersion-url';
const CLOSE = '.immersion-close-page';

let harness: ReadingSurfaceHarness | null = null;

async function mountImmersion(): Promise<ReadingSurfaceHarness> {
  const { default: ImmersionView } = await import('../views/ImmersionView');
  harness = createReadingSurfaceHarness({
    render: () => createElement(ImmersionView),
    ready: (container) => container.querySelector('.lq-reading.immersion-body') !== null,
  });
  await harness.mount(1200);
  return harness;
}

/** Navigate the way a user does: type into the address bar and submit the form. */
async function openPage(h: ReadingSurfaceHarness, url: string): Promise<void> {
  const bar = h.container.querySelector<HTMLInputElement>(URL_BAR);
  expect(bar, 'no address bar').not.toBe(null);
  const form = bar!.closest('form');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(bar!, url);
    bar!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
    immersionRecordVisit: async () => ({ ok: true }),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the Sites rail carries the curated destinations once a page is open', () => {
  it('does not render them in the starter state, where the stage already shows them', async () => {
    const h = await mountImmersion();
    // The negative control for every assertion below: the group is conditional, not
    // unconditional-and-hidden. If this ever passes trivially the guard has been deleted.
    expect(h.container.querySelector('.immersion-empty'), 'not in the starter state').not.toBe(null);
    expect(h.container.querySelector('.immersion-starters'), 'the stage lost its own copy').not.toBe(null);
    expect(h.container.querySelector(GROUP)).toBe(null);
  });

  it('renders every starter in the rail once a page is open, each with its label', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');
    expect(h.container.querySelector('.immersion-empty'), 'the page did not open').toBe(null);

    const group = h.container.querySelector(GROUP);
    expect(group, 'the rail has no destinations group with a page open').not.toBe(null);

    const buttons = [...group!.querySelectorAll<HTMLButtonElement>(DESTINATION)];
    expect(buttons).toHaveLength(IMMERSION_STARTERS.length);
    // Every one of them, not a hand-picked subset — the rail is the route that stays
    // available, so tucking any of them away here would recreate the gap.
    for (const starter of IMMERSION_STARTERS) {
      const match = buttons.find((b) => b.textContent?.includes(starter.label));
      expect(match, `no rail destination for ${starter.label}`).toBeTruthy();
      expect(match!.title, 'the row does not disclose where it goes').toBe(starter.url);
    }
  });

  it('reaches a destination WITHOUT closing the page, which is the whole point', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');

    const target = IMMERSION_STARTERS[0];
    const buttons = [...h.container.querySelectorAll<HTMLButtonElement>(DESTINATION)];
    const row = buttons.find((b) => b.textContent?.includes(target.label));
    expect(row, `no rail destination for ${target.label}`).toBeTruthy();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await h.flush();

    // Navigated, and the surface never passed back through the starter state to do it.
    expect(h.container.querySelector<HTMLInputElement>(URL_BAR)!.value).toBe(target.url);
    expect(h.container.querySelector('.immersion-empty')).toBe(null);
    // Still there afterwards: the group is not a one-shot launcher.
    expect(h.container.querySelector(GROUP)).not.toBe(null);
  });

  it('takes the group away again when the page closes', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');
    expect(h.container.querySelector(GROUP)).not.toBe(null);

    await h.click(CLOSE);

    expect(h.container.querySelector('.immersion-empty'), 'close did not return the starter state').not.toBe(null);
    expect(h.container.querySelector(GROUP)).toBe(null);
    // …and the saved-sites list the group sits under is untouched by either transition.
    expect(h.container.querySelectorAll('.immersion-site-card').length).toBe(SITES.sites.length);
  });
});
