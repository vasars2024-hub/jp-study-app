// @vitest-environment jsdom
/**
 * Rubric category 5 Q4 on Immersion: "advanced tools discoverable without cluttering",
 * scored NO. Measured live 2026-08-26 at 820x580 in forest-night, standard presentation:
 * **23 chrome controls to scan in the default state against a bar of 12, and zero
 * disclosures** — sixteen of them in one toolbar row, five more as a flat grid of starter
 * destinations in the empty stage, and the Sites rail's own close control.
 *
 * The remedy is progressive disclosure in two places, and the thing these tests actually
 * defend is that it stayed disclosure and never became deletion:
 *
 *   - every control that moved is STILL RENDERED, still carries its accessible name, and
 *     is still one click from the surface it left;
 *   - both groups are COLLAPSED by default, because a disclosure that ships open scans
 *     exactly like the flat row it replaced;
 *   - the controls that answer Q1 and Q3 — the address bar and the view-mode segment —
 *     and the two stateful toggles stay in the open, since a toggle whose state is only
 *     visible once you open a menu is a toggle you cannot read.
 *
 * jsdom lays nothing out, so this file asserts STRUCTURE. The 23 -> 12 number itself is a
 * live measurement and lives in `baselines/cat5-l6-immersion.json`; what a unit test can
 * hold is the shape that produced it.
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
import { IMMERSION_STARTERS, IMMERSION_SUBJECT_LANG } from '../../shared/immersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITES = {
  sites: [
    { id: 's-1', url: 'https://www3.nhk.or.jp/news/', title: 'NHK', lang: 'ja', visitCount: 4, favorite: false, lastVisit: 1_700_000_000_000 },
  ],
};

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

/** Text a control offers a user, whatever shape it offers it in. */
const accessibleName = (el: Element): string =>
  (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();

describe('the Immersion toolbar tucks its page actions behind one disclosure', () => {
  it('renders every moved action inside a collapsed <details>, with its name intact', async () => {
    const h = await mountImmersion();
    const overflow = h.container.querySelector<HTMLDetailsElement>('.immersion-overflow');
    expect(overflow, 'the toolbar has no overflow disclosure').not.toBe(null);
    // Collapsed, or the count it was built to reduce is unchanged.
    expect(overflow!.open, 'the overflow ships open, which scans like the flat row it replaced')
      .toBe(false);

    const body = overflow!.querySelector('.immersion-overflow-body');
    expect(body, 'the overflow has no body').not.toBe(null);
    const tucked = [...body!.querySelectorAll('button')];
    // Seven from the toolbar plus the `overflow` slot's Visual Novel launcher, which
    // `ImmersionView` passes in. Blanc passes nothing and gets seven.
    expect(tucked.length, 'the overflow lost an action').toBe(8);
    for (const button of tucked) {
      expect(accessibleName(button), 'a tucked action has no accessible name').not.toBe('');
    }
    // The named ones, by class rather than by label: labels are localised.
    expect(body!.querySelector('.immersion-close-page'), 'Close page left the overflow').not.toBe(null);
    expect(body!.querySelector('.visual-novel-open'), 'the Visual Novel launcher left the overflow').not.toBe(null);
  });

  it('leaves the controls Q1 and Q3 resolve to, and both stateful toggles, in the open', async () => {
    const h = await mountImmersion();
    const bar = h.container.querySelector('.immersion-toolbar');
    expect(bar, 'no toolbar').not.toBe(null);
    const inTheOpen = (sel: string) => {
      const el = bar!.querySelector(sel);
      expect(el, `${sel} is not in the toolbar at all`).not.toBe(null);
      expect(el!.closest('details'), `${sel} was tucked into a disclosure`).toBe(null);
    };
    // Q1's entry point and Q3's primary action.
    inTheOpen('.immersion-url');
    inTheOpen('.immersion-mode-seg');
    // A toggle reports its state through `aria-pressed`; collapsed, it reports nothing.
    inTheOpen('.immersion-sites-toggle');
    expect(bar!.querySelector('.immersion-sites-toggle')!.getAttribute('aria-pressed')).toBe('true');
    // Transport stays where a browser puts it.
    expect([...bar!.querySelectorAll(':scope > .icon-btn')].length,
      'Back, Forward and Reload left the open row').toBeGreaterThanOrEqual(3);
  });

  it('keeps the overflow inside the toolbar row, not floated over the reading canvas', async () => {
    // The regression `immersionCanvas.test.tsx` pinned for `.visual-novel-open`: a host
    // control in the overlay layer sat on the Sites rail's close button and killed it.
    const h = await mountImmersion();
    const overflow = h.container.querySelector('.immersion-overflow')!;
    expect(overflow.closest('.immersion-toolbar')).not.toBe(null);
    expect(overflow.closest('.lq-reading')).toBe(null);
  });
});

describe('the Immersion empty state tucks its non-subject destinations', () => {
  it('splits the starters on the data, not on a hand-picked list', async () => {
    const h = await mountImmersion();
    const openGrid = h.container.querySelector('.immersion-empty > .immersion-starters');
    expect(openGrid, 'the empty state lost its starter grid').not.toBe(null);
    const open = [...openGrid!.querySelectorAll('button')].map((b) => b.textContent);
    const expected = IMMERSION_STARTERS.filter((s) => s.lang === IMMERSION_SUBJECT_LANG).map((s) => s.label);
    expect(open, 'the visible starters are not the subject-language ones').toEqual(expected);
    expect(open.length, 'the split degenerated to "all of them"').toBeLessThan(IMMERSION_STARTERS.length);
  });

  it('renders the rest inside a collapsed disclosure, so none of the five is lost', async () => {
    const h = await mountImmersion();
    const more = h.container.querySelector<HTMLDetailsElement>('.immersion-starters-more');
    expect(more, 'the empty state has no destinations disclosure').not.toBe(null);
    expect(more!.open, 'the destinations disclosure ships open').toBe(false);
    const tucked = [...more!.querySelectorAll('button')].map((b) => b.textContent);
    const expected = IMMERSION_STARTERS.filter((s) => s.lang !== IMMERSION_SUBJECT_LANG).map((s) => s.label);
    expect(tucked).toEqual(expected);

    // Nothing removed: every curated destination is still reachable from this surface.
    const all = [...h.container.querySelectorAll('.immersion-empty button')].map((b) => b.textContent);
    for (const starter of IMMERSION_STARTERS) {
      expect(all, `${starter.label} is no longer rendered anywhere in the empty state`).toContain(starter.label);
    }
  });

  it('opens a tucked destination when it is clicked, same as an open one', async () => {
    const h = await mountImmersion();
    const more = h.container.querySelector<HTMLDetailsElement>('.immersion-starters-more')!;
    const target = IMMERSION_STARTERS.find((s) => s.lang !== IMMERSION_SUBJECT_LANG)!;
    const button = [...more.querySelectorAll('button')]
      .find((b) => b.textContent === target.label);
    expect(button, 'the tucked destination has no button').not.toBe(undefined);
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The reverse of the empty state: the starter grid is gone because a page opened.
    expect(h.container.querySelector('.immersion-empty'),
      'clicking a tucked destination did nothing').toBe(null);
    expect(h.container.querySelector<HTMLInputElement>('.immersion-url')!.value)
      .toContain(new URL(target.url).host);
  });
});
