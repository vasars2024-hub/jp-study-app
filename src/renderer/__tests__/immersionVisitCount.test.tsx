// @vitest-environment jsdom
/**
 * The Sites rail printed a number that was not visits.
 *
 * `useImmersion` banks reading seconds and characters from a 5-second interval by calling
 * `immersionRecordVisit`, and `upsertVisit` in main did `site.visitCount += 1` on every
 * call it received. So the counter measured HOW MANY FIVE-SECOND FLUSHES HAPPENED while a
 * tab was open, and the rail rendered that to the user as "N visits".
 *
 * Measured on the real profile before the fix, 2026-09-05: 1,560 saved sites, one row
 * reading **7,692 visits** against 416,216 recorded seconds — about one "visit" per five
 * seconds of reading. A second row read 1,907. The existing rows cannot be repaired
 * (the real count was never stored), so this defends the rule going forward.
 *
 * The other half was wrong in the opposite direction: the only call that meant "I arrived"
 * was the READER pass, so live mode never counted an arrival at all.
 *
 * What is asserted here is the call SHAPE at the IPC seam, because that seam is where the
 * defect lived. `countVisit` defaults to true in `ImmersionVisitInput`, so the extension
 * bridge and every other existing caller keep counting exactly as before.
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITES = {
  sites: [
    { id: 's-1', url: 'https://www3.nhk.or.jp/news/', title: 'NHK', lang: 'ja', visitCount: 4, favorite: false, lastVisit: 1_700_000_000_000 },
  ],
};

const URL_BAR = '.immersion-url';

type Visit = { url: string; countVisit?: boolean };

let harness: ReadingSurfaceHarness | null = null;
let visits: Visit[] = [];

/** Calls that would move `visitCount` in main — i.e. anything not explicitly opted out. */
const counting = (): Visit[] => visits.filter((v) => v.countVisit !== false);

async function mountImmersion(): Promise<ReadingSurfaceHarness> {
  const { default: ImmersionView } = await import('../views/ImmersionView');
  harness = createReadingSurfaceHarness({
    render: () => createElement(ImmersionView),
    ready: (container) => container.querySelector('.lq-reading.immersion-body') !== null,
  });
  await harness.mount(1200);
  return harness;
}

async function openPage(h: ReadingSurfaceHarness, url: string): Promise<void> {
  const bar = h.container.querySelector<HTMLInputElement>(URL_BAR)!;
  const form = bar.closest('form')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(bar, url);
    bar.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

beforeEach(() => {
  visits = [];
  installResizeObserver();
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
    immersionRecordVisit: async (input: Visit) => {
      visits.push(input);
      return { ok: true };
    },
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('what Immersion counts as a visit', () => {
  it('counts exactly one arrival per navigation', async () => {
    const h = await mountImmersion();
    expect(counting(), 'mounting is not a visit').toHaveLength(0);

    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');

    const counted = counting();
    expect(counted).toHaveLength(1);
    expect(counted[0].url).toBe('https://ja.wikipedia.org/wiki/Main_Page');
  });

  it('does not count a second arrival for the same page', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');
    expect(counting()).toHaveLength(1);

    // Switching view mode re-enters `navigate` with the SAME url; so does Reload. Neither
    // is a new visit, and before the guard both would have added one.
    const live = [...h.container.querySelectorAll<HTMLButtonElement>('.immersion-mode-btn')]
      .find((b) => /live/i.test(b.textContent ?? ''));
    expect(live, 'no Live mode button').toBeTruthy();
    await act(async () => {
      live!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await h.flush();

    expect(counting()).toHaveLength(1);
  });

  it('counts a second arrival when the page really changes', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');
    await openPage(h, 'https://news.ycombinator.com/');

    expect(counting().map((v) => v.url)).toEqual([
      'https://ja.wikipedia.org/wiki/Main_Page',
      'https://news.ycombinator.com/',
    ]);
  });

  it('banks reading time without counting it as a visit', async () => {
    // The 5-second tick, driven for real, which takes two things an earlier draft of this
    // test got wrong. (a) Unmounting is not enough: the interval's cleanup calls the same
    // `flushStats`, but it returns early when it has banked nothing, so no IPC call is ever
    // made and the assertion passed with the fix REMOVED — hence the vacuity guard below.
    // (b) The fake clock has to be installed BEFORE the component mounts, or `setInterval`
    // is the real one and advancing the fake clock drives nothing. `shouldAdvanceTime` lets
    // the mount's own awaits still resolve.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const h = await mountImmersion();
      await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');
      const before = counting().length;
      const totalBefore = visits.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });

      // It really flushed — otherwise this test proves nothing about the flush.
      expect(visits.length, 'the stats flush never ran; this test would be vacuous').toBeGreaterThan(totalBefore);
      const flushed = visits.slice(totalBefore);
      expect(flushed.every((v) => v.countVisit === false)).toBe(true);
      expect(flushed.some((v) => (v as { seconds?: number }).seconds! > 0)).toBe(true);
      // …and not one of them moved the counter.
      expect(counting().length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
