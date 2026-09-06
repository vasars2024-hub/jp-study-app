// @vitest-environment jsdom
/**
 * Four defects found by driving the live Immersion surface (register rows D53, D55,
 * D56, D57), held here so they cannot come back:
 *
 *   - D53 the Live / Live·Reader / Focus segment said which mode was active with a
 *     CSS class only, while the page-lookup toggle immediately beside it already
 *     exposed `aria-pressed`;
 *   - D55 the address bar had a placeholder and nothing else, so once a page is open
 *     — exactly when you would tab to it — it announced as an unnamed text box;
 *   - D56 every saved site's Remove button announced the single word "Remove", in a
 *     rail that on the user's own machine is 82,696 px of them;
 *   - D57 a curated destination hardcoded reader mode, so choosing Live or Focus and
 *     then clicking one silently threw that choice away.
 *
 * D57's control is the half that matters and ships in the same file: from the default
 * reader mode a destination must STILL open in reader. Deleting the fix has to turn
 * the Live case red while leaving the reader case green, or the fix has merely swapped
 * one hardcoded mode for another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
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
    { id: 's-2', url: 'https://ja.wikipedia.org/', title: 'ウィキペディア', lang: 'ja', visitCount: 3, favorite: false, lastVisit: 1_700_000_000_000 },
  ],
};

const ROOT = '.immersion-root';
const MODE_BTN = '.immersion-mode-btn';
const URL_BAR = '.immersion-url';
const REMOVE = '.immersion-site-remove';
const DESTINATION = '.immersion-rail-destination';

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

async function click(h: ReadingSurfaceHarness, el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

function modeButton(h: ReadingSurfaceHarness, label: string): HTMLButtonElement {
  const found = [...h.container.querySelectorAll<HTMLButtonElement>(MODE_BTN)].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(found, `no mode button labelled ${label}`).toBeTruthy();
  return found!;
}

function modeOf(h: ReadingSurfaceHarness): string {
  const root = h.container.querySelector(ROOT);
  expect(root, 'no immersion root').not.toBe(null);
  return [...root!.classList].find((c) => c.startsWith('immersion-mode-')) ?? 'none';
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

describe('the Immersion toolbar says which mode it is in, and what its boxes are', () => {
  it('exposes aria-pressed on every mode button, with exactly one pressed', async () => {
    const h = await mountImmersion();
    const buttons = [...h.container.querySelectorAll<HTMLButtonElement>(MODE_BTN)];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      expect(b.getAttribute('aria-pressed'), `${b.textContent} has no pressed state`).not.toBe(null);
    }
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('moves the pressed state when the user picks a different mode', async () => {
    const h = await mountImmersion();
    const live = modeButton(h, 'Live');
    expect(live.getAttribute('aria-pressed')).toBe('false');
    await click(h, live);
    expect(live.getAttribute('aria-pressed')).toBe('true');
    // The attribute tracks state rather than being a constant: the one that WAS
    // pressed has to give it up.
    expect(
      [...h.container.querySelectorAll<HTMLButtonElement>(MODE_BTN)].filter(
        (b) => b.getAttribute('aria-pressed') === 'true',
      ),
    ).toHaveLength(1);
  });

  it('names the address bar without relying on the placeholder', async () => {
    const h = await mountImmersion();
    const bar = h.container.querySelector<HTMLInputElement>(URL_BAR);
    expect(bar, 'no address bar').not.toBe(null);
    const label = bar!.getAttribute('aria-label');
    expect(label, 'the address bar has no accessible name').toBeTruthy();
    // Not the placeholder itself doing the work — the placeholder is gone once a URL
    // is in the box, which is the state this defect was found in.
    expect(label).toBe(bar!.getAttribute('placeholder'));
  });

  it('names each saved site Remove button after the site it removes', async () => {
    const h = await mountImmersion();
    const removes = [...h.container.querySelectorAll<HTMLButtonElement>(REMOVE)];
    expect(removes.length).toBe(SITES.sites.length);
    const names = removes.map((b) => b.getAttribute('aria-label') ?? '');
    for (const site of SITES.sites) {
      expect(names.some((n) => n.includes(site.title)), `no Remove names ${site.title}`).toBe(true);
    }
    // Distinct, which is the entire complaint: before the fix all of them read "Remove".
    expect(new Set(names).size).toBe(removes.length);
  });
});

describe('a curated destination opens in the mode the user chose', () => {
  async function openStarterFrom(mode: 'Live' | 'Live·Reader'): Promise<ReadingSurfaceHarness> {
    const h = await mountImmersion();
    await click(h, modeButton(h, mode));
    // The starter row in the empty state, which is where a user meets these first.
    const target = IMMERSION_STARTERS[0];
    const starter = [...h.container.querySelectorAll<HTMLButtonElement>('.immersion-starters button, ' + DESTINATION)]
      .find((b) => b.textContent?.includes(target.label));
    expect(starter, `no starter for ${target.label}`).toBeTruthy();
    await click(h, starter!);
    expect(h.container.querySelector<HTMLInputElement>(URL_BAR)!.value).toBe(target.url);
    return h;
  }

  it('keeps Live when a destination is opened from Live', async () => {
    const h = await openStarterFrom('Live');
    expect(modeOf(h)).toBe('immersion-mode-live');
  });

  it('still opens in reader from the default reader mode — the control', async () => {
    const h = await openStarterFrom('Live·Reader');
    expect(modeOf(h)).toBe('immersion-mode-reader');
  });
});
