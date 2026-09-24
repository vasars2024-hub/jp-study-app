// @vitest-environment jsdom
/**
 * The Immersion sites rail is a real collection, and it was rendering all of it.
 *
 * Measured live on one real profile through
 * `probes/cat7-collection-weight.cjs --title Immersion --container .immersion-rail`:
 * **883** saved sites, `scrollHeight` **46,822px** inside a **418px** viewport —
 * 112x overdraw — and **6,182** elements under `.immersion-rail`. Verdict
 * UNWINDOWED. That is rubric category 7 on a surface L6 has already certified,
 * and dragging the window that contains it pays for all 6,182 of them.
 *
 * The geometry below is that measurement, not an invented one: 418px viewport,
 * 883 rows, 53px slots. It reproduces the live arithmetic exactly —
 * 883 x 53 + 4 + 12 padding = 46,815, and the four rows that were 50/51px
 * instead of 49 account for the remaining 7px of the measured 46,822.
 *
 * ## Why this file exists rather than more assertions in immersionCanvas
 *
 * This repo has shipped virtualisation that was PRESENT AND INERT before
 * (`4e2c46e1`), so "it renders a VirtualList" is not the claim. The claim is
 * that the DOM row count DEPENDS on the viewport, which needs a control where
 * the viewport changes and the count changes with it — the last test here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The live profile's size, so the numbers here mean the same thing there. */
const SITE_COUNT = 883;
const RAIL_VIEWPORT = 418;
/**
 * Written out rather than imported, so the arithmetic below reads. It is checked
 * against the exported constant in the first test — a static import of anything
 * from `ImmersionContent` evaluates `DictionaryPopup` -> `playerBus` before the
 * `window.api` stub exists and the whole suite fails to load.
 */
const ROW_HEIGHT = 53;

const SITES = {
  sites: Array.from({ length: SITE_COUNT }, (_, i) => ({
    id: `s-${i}`,
    url: `https://example.test/${i}`,
    title: `Site ${i}`,
    lang: 'ja',
    visitCount: i % 7,
    favorite: false,
    // Descending, so the store's sort is the identity and index === position.
    lastVisited: 2_000_000_000_000 - i,
    streakDays: 0,
    completionPct: 0,
  })),
};

let harness: ReadingSurfaceHarness | null = null;
let railViewport = RAIL_VIEWPORT;
let railScrollTop = 0;
const realClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
const realScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');

/**
 * jsdom has no layout, so `useElementSize` would read 0 and the window would be
 * overscan-only — a windowing test that passes for the wrong reason. These give
 * the scroll container (and only it) the live viewport and a settable scrollTop.
 */
function installRailGeometry(): void {
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return this.classList?.contains('immersion-site-list') ? railViewport : 0;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return this.classList?.contains('immersion-site-list') ? railScrollTop : 0;
    },
    set(this: Element, value: number) {
      if (this.classList?.contains('immersion-site-list')) railScrollTop = value;
    },
  });
}

/*
 * Loaded ONCE, in `beforeAll`, with its own budget — not inside the first test.
 *
 * Run alone, this file failed 7 of 8 (audit, reproducible on a loaded machine):
 * the first test's `await import('../views/ImmersionView')` is a COLD transform
 * of the whole Immersion graph (dictionary popup, player bus, shortcuts, the VN
 * panel) — measured 8.6 s of that test's 8.7 s on an idle machine, and past the
 * 20 s test timeout with other suites running. In a full run another file had
 * already warmed the transform cache, which is why it only failed alone. The
 * timed-out test then left its mount in flight while `afterEach` restored the
 * geometry stubs and emptied the body, and every later test read that
 * half-torn-down tree: `aria-posinset` "1" after a scroll, a null list, an
 * input from a detached realm. Module cost is setup, so it is paid in setup.
 */
let ImmersionView: typeof import('../views/ImmersionView').default;
let IMMERSION_SITE_ROW_HEIGHT: number;

beforeAll(async () => {
  // The graph touches `window.api` at module-eval time (player bus), so the
  // stub has to exist before the import; `beforeEach` reinstalls it per test.
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
  });
  ({ default: ImmersionView } = await import('../views/ImmersionView'));
  ({ IMMERSION_SITE_ROW_HEIGHT } = await import('../components/immersion/ImmersionContent'));
}, 120_000);

async function mountImmersion(width = 1200): Promise<ReadingSurfaceHarness> {
  harness = createReadingSurfaceHarness({
    render: () => createElement(ImmersionView),
    ready: (container) => container.querySelector('.immersion-site-row') !== null,
  });
  await harness.mount(width);
  return harness;
}

const rows = (h: ReadingSurfaceHarness): HTMLElement[] =>
  Array.from(h.container.querySelectorAll<HTMLElement>('.immersion-site-row'));
const slots = (h: ReadingSurfaceHarness): HTMLElement[] =>
  Array.from(h.container.querySelectorAll<HTMLElement>('.immersion-site-list [role="listitem"]'));

async function searchSites(h: ReadingSurfaceHarness, query: string): Promise<HTMLInputElement> {
  const input = h.container.querySelector<HTMLInputElement>('.immersion-site-search input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await h.flush();
  return input;
}

beforeEach(() => {
  railViewport = RAIL_VIEWPORT;
  railScrollTop = 0;
  installResizeObserver();
  installRailGeometry();
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  if (realClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', realClientHeight);
  if (realScrollTop) Object.defineProperty(Element.prototype, 'scrollTop', realScrollTop);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the Immersion sites rail under real load', () => {
  it('keeps a screenful in the DOM, not the whole library', async () => {
    const h = await mountImmersion();
    // ceil(418 / 53) = 8 rows on screen, plus VirtualList's 6-row overscan on
    // each side. At the top there is nothing above, so the window is [0, 20).
    expect(rows(h).length).toBe(20);
    expect(rows(h).length).toBeLessThan(SITE_COUNT);
    // Every slot is the declared height, so the constant is the one in force
    // rather than one the component only documents.
    expect(IMMERSION_SITE_ROW_HEIGHT).toBe(ROW_HEIGHT);
    expect(new Set(slots(h).map((s) => s.style.height))).toEqual(new Set([`${ROW_HEIGHT}px`]));
  });

  it('reports the full library height, so the scrollbar is honest', async () => {
    const h = await mountImmersion();
    const spacer = h.container.querySelector<HTMLElement>('.immersion-site-list > div');
    expect(spacer, 'no total-height spacer').not.toBe(null);
    // 883 x 53 = 46,799. The live scroller measured 46,822 with the list's own
    // 4px/12px padding and four rows that were 1-2px over; both are accounted
    // for above. A windowed list that lies here gives the user a scrollbar that
    // does not correspond to the collection.
    expect(spacer!.style.height).toBe(`${SITE_COUNT * ROW_HEIGHT}px`);
  });

  it('announces the real size, not the rendered one', async () => {
    const h = await mountImmersion();
    const s = slots(h);
    expect(s.length).toBe(20);
    // The whole accessibility risk of windowing in one assertion: without this a
    // screen reader says "1 of 20" for a library of 883.
    expect(new Set(s.map((el) => el.getAttribute('aria-setsize')))).toEqual(
      new Set([String(SITE_COUNT)]),
    );
    expect(s.map((el) => el.getAttribute('aria-posinset'))).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    // The list still owns its items across the two structural wrappers.
    const list = h.container.querySelector<HTMLElement>('.immersion-site-list')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(
      Array.from(list.querySelectorAll<HTMLElement>(':scope > div, :scope > div > div')).map((d) =>
        d.getAttribute('role'),
      ),
    ).toEqual(['presentation', 'presentation']);
  });

  it('moves the window when the rail is scrolled, and renumbers with it', async () => {
    const h = await mountImmersion();
    const list = h.container.querySelector<HTMLElement>('.immersion-site-list')!;
    list.scrollTop = 20_000;
    list.dispatchEvent(new Event('scroll'));
    await h.flush();

    // floor(20000 / 53) = 377, minus the 6-row overscan.
    const first = slots(h)[0];
    expect(first.getAttribute('aria-posinset')).toBe('372');
    expect(rows(h)[0].textContent).toContain('Site 371');
    // Still a window, not a growing list: nothing accumulated on the way down.
    expect(rows(h).length).toBe(20);
  });

  it('searches the whole collection after scrolling, by title and URL', async () => {
    const h = await mountImmersion();
    const list = h.container.querySelector<HTMLElement>('.immersion-site-list')!;
    list.scrollTop = 20_000;
    list.dispatchEvent(new Event('scroll'));
    await h.flush();
    expect(rows(h)[0].textContent).toContain('Site 371');

    // A full-width pasted title matches outside the old virtual window.
    await searchSites(h, '  ＳＩＴＥ ８８２  ');
    expect(rows(h)).toHaveLength(1);
    expect(rows(h)[0].textContent).toContain('Site 882');
    expect(slots(h)[0].getAttribute('aria-setsize')).toBe('1');
    await searchSites(h, 'EXAMPLE.TEST/712');
    expect(rows(h)).toHaveLength(1);
    expect(rows(h)[0].textContent).toContain('Site 712');
  });

  it('names an empty result and Escape restores the list without closing the rail', async () => {
    const h = await mountImmersion();
    const input = await searchSites(h, 'no-such-saved-site');
    expect(rows(h)).toHaveLength(0);
    // Scoped to the rail: the view also keeps an always-mounted sr-only capture announcer
    // (role=status) ahead of it in the DOM, which is empty here.
    expect(h.container.querySelector('.immersion-rail-empty[role="status"]')?.textContent).toContain('No saved sites match');
    await act(async () => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await h.flush();
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(h.container.querySelector('.immersion-rail')).not.toBeNull();
    expect(rows(h)).toHaveLength(20);
    expect(h.container.querySelector('.immersion-rail-empty')).toBeNull();
  });

  it('the completion bar costs no height, so every slot is the same row', async () => {
    // 0 of the 883 sites in the measured profile have `completionPct > 0`, so
    // the branch that used to add `margin-top: 4 + height: 2` in flow — making
    // those rows 55px against a 53px slot — cannot be exercised live. It is
    // exercised here instead, and held by the stylesheet rather than by luck.
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
    const bar = /^\.immersion-site-bar \{([^}]*)\}/m.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(bar, '.immersion-site-bar rule not found').not.toBe(null);
    expect(bar![1]).toMatch(/position:\s*absolute/);
    expect(bar![1]).not.toMatch(/margin-top/);
    // A declaration existing is not a declaration winning: nothing else anywhere
    // in the stylesheet may put the bar back into flow.
    const reflow = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .match(/[^}]*\.immersion-site-bar[^{]*\{[^}]*position:\s*(static|relative)[^}]*\}/g);
    expect(reflow, 'a later rule returns the bar to flow').toBe(null);

    // Both text lines are pinned too. `line-height: normal` is what made 4 of
    // 883 rows 50 and 51px: titles holding `(`, `[` or `.` fall back to a font
    // with a taller line box, and a fixed-height slot cannot absorb that.
    for (const cls of ['immersion-site-title', 'immersion-site-meta']) {
      const rule = new RegExp(`^\\.${cls} \\{([^}]*)\\}`, 'm').exec(
        css.replace(/\/\*[\s\S]*?\*\//g, ''),
      );
      expect(rule, `.${cls} rule not found`).not.toBe(null);
      expect(rule![1]).toMatch(/line-height:\s*\d+px/);
    }
  });

  it('CONTROL — the row count follows the viewport, it is not a constant', async () => {
    // The inert-virtualisation control. `4e2c46e1` shipped a VirtualList in this
    // repo that was present and had no effect; a test that only counts rows once
    // cannot tell the two apart. Give the rail the whole library's height and
    // every row must appear; a component ignoring its container renders the same
    // 20 either way.
    railViewport = SITE_COUNT * ROW_HEIGHT;
    const h = await mountImmersion();
    expect(rows(h).length).toBe(SITE_COUNT);
    expect(slots(h)[SITE_COUNT - 1].getAttribute('aria-posinset')).toBe(String(SITE_COUNT));
  });
});
