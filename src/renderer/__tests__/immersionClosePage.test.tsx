// @vitest-environment jsdom
/**
 * Opening a page in Immersion was a ONE-WAY DOOR.
 *
 * Measured live 2026-08-26 while scoring this surface for rubric category 6: the toolbar
 * offers Back, Forward, Reload, the three view modes and eight page actions, and every one
 * of them needs a page. Once anything had loaded, the starter state — the five curated
 * destinations and the "open a page to begin immersion reading" copy — was unreachable
 * without destroying the window, which is exactly the "every enable/open flow owes a
 * disable/close path" invariant.
 *
 * These tests are the reverse transition, asserted on the real component: the state before,
 * the state after, and the two things closing a page must NOT take with it — the saved-sites
 * rail (which is the route back to what was just closed) and the rail's own open/closed
 * state.
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
    { id: 's-1', url: 'https://www3.nhk.or.jp/news/', title: 'NHK ニュース', lang: 'ja', visitCount: 12, favorite: true, lastVisit: 1_700_000_000_000 },
    { id: 's-2', url: 'https://note.com/', title: 'note', lang: 'ja', visitCount: 3, favorite: false, lastVisit: 1_700_000_001_000 },
  ],
};

const CLOSE = '.immersion-close-page';
const URL_BAR = '.immersion-url';

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
  expect(form, 'the address bar is not in a form').not.toBe(null);
  await act(async () => {
    // React does not see `input.value = x`; drive the native setter.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
      .set!.call(bar!, url);
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

describe('closing an Immersion page', () => {
  it('offers the control from the starter state, disabled and saying why', async () => {
    const h = await mountImmersion();
    const close = h.container.querySelector<HTMLButtonElement>(CLOSE);
    expect(close, 'no close-page control in the toolbar').not.toBe(null);
    expect(close!.disabled).toBe(true);
    // The greyed-out state explains itself rather than repeating the label — the
    // same shape Back and Forward already use.
    expect(close!.title).toBe('No page is open — choose a destination to begin.');
    // …while the accessible name survives that, which is the defect the
    // title-only version of Back and Forward had.
    expect(close!.getAttribute('aria-label')).toBe('Close page');
    expect(h.container.querySelector('.immersion-empty')).not.toBe(null);
  });

  it('returns the surface to the starter state, and the control disables again', async () => {
    const h = await mountImmersion();
    // ASCII on purpose: `ensureProtocol` percent-encodes a non-ASCII path, which is
    // correct and is the live app's behaviour, but it is not what this test is about.
    await openPage(h, 'https://ja.wikipedia.org/wiki/Main_Page');

    // Loaded: the starter state is gone, the guest is mounted, the bar shows it.
    expect(h.container.querySelector('.immersion-empty')).toBe(null);
    expect(h.container.querySelector('.immersion-webview')).not.toBe(null);
    expect(h.container.querySelector<HTMLInputElement>(URL_BAR)!.value)
      .toBe('https://ja.wikipedia.org/wiki/Main_Page');
    expect(h.container.querySelector<HTMLButtonElement>(CLOSE)!.disabled).toBe(false);
    expect(h.container.querySelector<HTMLButtonElement>(CLOSE)!.title).toBe('Close page');

    await h.click(CLOSE);

    // Closed: byte-for-byte the state the surface mounts in.
    expect(h.container.querySelector('.immersion-empty')).not.toBe(null);
    expect(h.container.querySelector('.immersion-webview')).toBe(null);
    expect(h.container.querySelector('.immersion-reader')).toBe(null);
    expect(h.container.querySelector<HTMLInputElement>(URL_BAR)!.value).toBe('');
    expect(h.container.querySelector<HTMLButtonElement>(CLOSE)!.disabled).toBe(true);
  });

  it('leaves the saved-sites rail alone, because the rail is the route back', async () => {
    const h = await mountImmersion();
    const rows = () => h.container.querySelectorAll('.immersion-site-row').length;
    expect(rows()).toBe(SITES.sites.length);

    await openPage(h, 'https://note.com/');
    await h.click(CLOSE);

    expect(rows()).toBe(SITES.sites.length);
    // And the tool is still mounted at the same placement: closing a page is not
    // a reason for the rail to collapse.
    expect(h.tool('sites')).not.toBe(null);
    expect(h.container.querySelector('.immersion-sites-toggle')!.getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('does not disturb Reload, which is disabled by the same absent page', async () => {
    const h = await mountImmersion();
    const reload = () => h.container.querySelectorAll<HTMLButtonElement>('.immersion-toolbar .icon-btn')[2];
    // Third icon button in the bar: Back, Forward, Reload. It used to be enabled
    // with nothing to reload, which is a control that does nothing and says nothing.
    expect(reload().disabled).toBe(true);
    await openPage(h, 'https://note.com/');
    expect(reload().disabled).toBe(false);
    await h.click(CLOSE);
    expect(reload().disabled).toBe(true);
  });
});
