// @vitest-environment jsdom
/**
 * D396 — a reader extraction that finished after the user had moved on published
 * its article anyway.
 *
 * `loadReader` is a long async pass: up to 12 attempts with waits between them,
 * each awaiting `fetchReadableArticle`. Every one of its `setReaderHtml` /
 * `setTitle` / `setError` / `immersionRecordVisit` calls sat after an await with
 * nothing checking that the page it was extracting is still the page on screen.
 * So closing a page mid-extraction restored the starter copy and then had the
 * closed article reappear under it, with an empty URL bar; and switching pages
 * mid-extraction could have the OLD article replace the new one.
 *
 * The hook is mounted directly rather than through `ImmersionView` because the
 * reader pass is only reachable from a test when there is no webview element:
 * with one mounted, `navigate` hands the load to the guest and waits for
 * `did-stop-loading`, which jsdom's inert `<webview>` never fires.
 *
 * Both suppression cases ship with the positive control that proves the pass
 * publishes normally when nothing invalidated it — without it, a `loadReader`
 * that silently never resolved would score as a pass.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImmersionState } from '../components/immersion/ImmersionContent';
import { catalogFor } from '../../shared/i18n/catalogs';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WIKI = 'https://ja.wikipedia.org/wiki/%E7%8C%AB';
const NOTE = 'https://note.com/';

/** Enough plain text to clear `loadReader`'s 900-char "article is ready" bar. */
const article = (title: string) => ({
  ok: true,
  title,
  url: `https://example.test/${title}`,
  content: `<p>${'ねこはかわいい。'.repeat(200)}</p>`,
  meta: {},
});

let root: Root;
let host: HTMLDivElement;
let state: ImmersionState;
/** Resolvers for every in-flight `extractReadableArticle`, oldest first. */
let pending: Array<(value: unknown) => void>;
const extract = vi.fn(() => new Promise((resolve) => { pending.push(resolve); }));
const recordVisit = vi.fn(async () => ({ ok: true }));

async function mount() {
  const { useImmersion } = await import('../components/immersion/ImmersionContent');
  function Surface() {
    state = useImmersion();
    return createElement('div', {
      className: 'probe-reader',
      dangerouslySetInnerHTML: state.readerHtmlProp ?? { __html: '' },
    });
  }
  await act(async () => { root.render(createElement(Surface)); });
}

/** Let the pass run to its next await after a resolver fires. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  installResizeObserver();
  pending = [];
  extract.mockClear();
  recordVisit.mockClear();
  installReadingSurfaceApi({
    immersionListSites: async () => ({ sites: [] }),
    onImmersionSitesChanged: () => () => undefined,
    immersionRecordVisit: recordVisit,
    extractReadableArticle: extract,
    fetchPage: async () => ({ ok: false }),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.restoreAllMocks();
});

describe('a reader pass may only publish for the page still on screen', () => {
  it('publishes normally when nothing invalidated it — the control', async () => {
    await mount();
    await act(async () => { state.navigate(WIKI); });
    expect(extract).toHaveBeenCalledTimes(1);

    await act(async () => { pending[0](article('ネコ')); });
    await settle();

    expect(state.readerHtml).toContain('ねこはかわいい');
    expect(state.title).toBe('ネコ');
    expect(state.currentUrl).toBe(WIKI);
    expect(state.loading).toBe(false);
  });

  it('drops a pass whose page was closed while it was running', async () => {
    await mount();
    await act(async () => { state.navigate(WIKI); });
    expect(extract).toHaveBeenCalledTimes(1);

    await act(async () => { state.closePage(); });
    expect(state.currentUrl).toBe('');
    const visitsAtClose = recordVisit.mock.calls.length;

    // The extraction the user walked away from now finishes, successfully.
    await act(async () => { pending[0](article('ネコ')); });
    await settle();

    expect(state.readerHtml).toBe('');
    expect(state.currentUrl).toBe('');
    expect(state.title).toBe('Immersion');
    expect(state.loading).toBe(false);
    expect(host.querySelector('.probe-reader')!.innerHTML).toBe('');
    // The closed page must not bank a visit either — it is not a page the user is on.
    expect(recordVisit.mock.calls.length).toBe(visitsAtClose);
  });

  /**
   * The catch branch is NOT one await away: `fetchReadableArticle` swallows a bad
   * response, so `loadReader` retries six times with a real `setTimeout` between
   * attempts and only throws after the loop. A version of this test that resolved
   * one attempt and asserted immediately passed under the mutation control — it
   * was reading state from a pass still parked on a timer, not a suppressed error.
   */
  async function drainRetries() {
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        while (pending.length) pending.shift()!({ ok: false, error: 'offline' });
        await vi.advanceTimersByTimeAsync(4000);
      });
    }
  }

  it('shows the failure when the page is still open — the control for the case below', async () => {
    vi.useFakeTimers();
    try {
      await mount();
      await act(async () => { state.navigate(WIKI); });
      await drainRetries();
      // Read from the catalog rather than pasting the copy, so an edit to the
      // wording is not a test failure — the assertion is about which state the
      // pass reached, not about the sentence.
      expect(state.error).toBe(catalogFor('en')['immersion.readerExtractionFailed']);
      expect(state.loading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a failing pass whose page was closed, rather than showing its error', async () => {
    vi.useFakeTimers();
    try {
      await mount();
      await act(async () => { state.navigate(WIKI); });
      await act(async () => { state.closePage(); });
      await drainRetries();
      expect(state.error).toBe(null);
      expect(state.readerHtml).toBe('');
      expect(state.loading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the newer page win when an older extraction lands late', async () => {
    await mount();
    await act(async () => { state.navigate(WIKI); });
    await act(async () => { state.navigate(NOTE); });
    expect(state.currentUrl).toBe(NOTE);
    expect(extract).toHaveBeenCalledTimes(2);

    // The SECOND page answers first, then the first page's stale pass lands.
    await act(async () => { pending[1](article('note')); });
    await settle();
    expect(state.title).toBe('note');

    await act(async () => { pending[0](article('ネコ')); });
    await settle();

    expect(state.title).toBe('note');
    expect(state.readerHtml).toContain('note');
    expect(state.currentUrl).toBe(NOTE);
  });
});
