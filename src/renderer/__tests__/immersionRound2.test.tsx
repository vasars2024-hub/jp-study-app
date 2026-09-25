// @vitest-environment jsdom
/**
 * Audit round 2 — the Immersion browser, on the real view.
 *
 * #10 a link followed inside the page is a Back/Forward entry and a visit;
 * #11 tabs come from, and go back to, the session store;
 * #12 bookmarks and history are separate lists, and a star can be undone;
 * #14 today's metrics are shown;
 * the study language (not a hard-coded Japanese) decides the starter row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';
import type { ImmersionSession, ImmersionSitesStore } from '../../shared/immersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = 'https://ja.wikipedia.org/wiki/Main_Page';
const B = 'https://ja.wikipedia.org/wiki/Tokyo';

function site(id: string, url: string, title: string) {
  return {
    id, url, title, lang: 'ja' as const, tags: [], completionPct: 40, lastVisited: 1_700_000_000_000,
    visitCount: 2, estimatedDifficulty: 0, streakDays: 0, totalSeconds: 0, totalChars: 0,
    createdAt: 1, updatedAt: 1,
  };
}

let store: ImmersionSitesStore;
let session: ImmersionSession | null;
let visits: { url: string; countVisit?: boolean }[];
let saved: unknown[];
let setSessions: ImmersionSession[];
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

async function openPage(h: ReadingSurfaceHarness, url: string): Promise<void> {
  const bar = h.container.querySelector<HTMLInputElement>('.immersion-url')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(bar, url);
    bar.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    bar.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

async function pageNavigates(h: ReadingSurfaceHarness, url: string): Promise<void> {
  const wv = h.container.querySelector('webview');
  expect(wv, 'no webview').toBeTruthy();
  await act(async () => {
    wv!.dispatchEvent(Object.assign(new Event('did-navigate'), { url }));
  });
  await h.flush();
}

function button(h: ReadingSurfaceHarness, label: string): HTMLButtonElement {
  const found = [...h.container.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  );
  expect(found, `no button ${label}`).toBeTruthy();
  return found!;
}

async function click(h: ReadingSurfaceHarness, el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

beforeEach(() => {
  localStorage.clear();
  store = { schemaVersion: 2, sites: [], folders: [], bookmarks: [] };
  session = null;
  visits = [];
  saved = [];
  setSessions = [];
  installResizeObserver();
  installReadingSurfaceApi({
    immersionListSites: async () => store,
    onImmersionSitesChanged: () => () => undefined,
    immersionRecordVisit: async (input: { url: string; countVisit?: boolean }) => {
      visits.push(input);
      return { ok: true };
    },
    immersionSaveSite: async (input: unknown) => {
      saved.push(input);
      return { ok: true, bookmark: null };
    },
    immersionGetSession: async () => session,
    immersionSetSession: async (next: ImmersionSession) => {
      setSessions.push(next);
      return { ok: true };
    },
    immersionGetMetrics: async () => ({
      dayKey: '2026-09-24',
      today: { seconds: 300, chars: 1234, wordsMined: 0, videosCaptured: 1, pagesExported: 2 },
      all: {},
    }),
    onImmersionMetricsChanged: () => () => undefined,
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('r2 #10 — a link followed in the page is a history entry and a visit', () => {
  it('Back returns from a page the webview navigated to by itself', async () => {
    const h = await mountImmersion();
    await openPage(h, A);
    // The first did-navigate is the page we asked for: no new entry.
    await pageNavigates(h, A);
    expect(button(h, 'Back').disabled).toBe(true);

    await pageNavigates(h, B);
    expect(visits.filter((v) => v.countVisit !== false).map((v) => v.url)).toEqual([A, B]);
    expect(button(h, 'Back').disabled).toBe(false);

    await click(h, button(h, 'Back'));
    expect(h.container.querySelector<HTMLInputElement>('.immersion-url')!.value).toBe(A);
    expect(button(h, 'Forward').disabled).toBe(false);
  });

  it('a redirect replaces the entry instead of adding one Back would bounce through', async () => {
    const h = await mountImmersion();
    await openPage(h, 'https://example.com/old');
    await pageNavigates(h, 'https://example.com/new');
    expect(button(h, 'Back').disabled).toBe(true);
  });
});

describe('r2 #11 — tabs on the session store', () => {
  it('restores the session and saves a new tab back to it', async () => {
    session = {
      activeTabId: 'tab-2',
      tabs: [
        { id: 'tab-1', url: A, title: 'Main', mode: 'reader' },
        { id: 'tab-2', url: B, title: 'Tokyo', mode: 'reader' },
      ],
      updatedAt: 1,
    };
    const h = await mountImmersion();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await h.flush();
    const tabs = [...h.container.querySelectorAll('[role="tab"].immersion-tab-button')].map((b) => b.textContent);
    expect(tabs).toEqual(['Main', 'Tokyo']);
    expect(h.container.querySelector<HTMLInputElement>('.immersion-url')!.value).toBe(B);

    await click(h, h.container.querySelector('.immersion-tab-new')!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(setSessions.at(-1)?.tabs).toHaveLength(3);
    expect(h.container.querySelector<HTMLInputElement>('.immersion-url')!.value).toBe('');
  });
});

describe('r2 #12 and #14 — bookmarks, history and today', () => {
  it('shows bookmarks and history as separate lists, and a star can be taken back', async () => {
    store = {
      schemaVersion: 2,
      sites: [site('h1', A, 'Main page'), site('h2', B, 'Tokyo')],
      folders: [],
      bookmarks: [{ id: 'b1', url: B, title: 'Tokyo', lang: 'ja', tags: ['geo'], createdAt: 1, updatedAt: 1 }],
    };
    const h = await mountImmersion();
    const rail = () => h.container.querySelector('.immersion-rail')!;
    expect([...rail().querySelectorAll('.immersion-bookmark-row .immersion-site-title')].map((e) => e.textContent)).toEqual(['Tokyo']);
    expect(rail().textContent).toContain('#geo');

    await click(h, rail().querySelector('[data-view="history"]')!);
    const history = [...rail().querySelectorAll('.immersion-site-row .immersion-site-title')].map((e) => e.textContent);
    expect(history).toEqual(['Main page', 'Tokyo']);
    // The rail's language prefix and progress bar now have data to show.
    expect(rail().querySelector('.immersion-site-meta')?.textContent).toMatch(/^JA · /);
    expect(rail().querySelector('.immersion-site-bar')).not.toBeNull();

    await openPage(h, B);
    await click(h, h.container.querySelector('.immersion-bookmark-toggle')!);
    expect(saved.at(-1)).toMatchObject({ url: B, favorite: false });
  });

  it("shows today's reading time and pages from the metrics store", async () => {
    const h = await mountImmersion();
    expect(h.container.querySelector('.immersion-stats-card')?.textContent).toContain('Today: 5 min read, 1,234 characters');
  });
});

describe('the study language, not Japanese, leads the starters', () => {
  it('puts Chinese destinations first for a Chinese learner', async () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    const h = await mountImmersion();
    const main = h.container.querySelector('.immersion-empty > .immersion-starters')!;
    expect([...main.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Chinese Wikipedia']);
  });
});
