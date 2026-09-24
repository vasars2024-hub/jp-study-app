// @vitest-environment jsdom
/**
 * The manga sources dialog with no provider installed.
 *
 * `fetchMangaProviders` answers an empty list as a success, and the dialog read
 * an empty source list as "still loading" — so on a machine with no provider it
 * said "Loading sources…" forever. It now knows when the list has answered and
 * says what is missing and where to get it. The Reading workspace's Sources tab
 * is the second way into the dialog, which was otherwise reachable only from the
 * Scraper's Discover page.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCandidate } from '../../shared/mediaDiscovery';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
// The reader is never opened here; keep its module graph out of the test.
vi.mock('../views/MangaReader', () => ({ default: () => null }));

import MangaProviderBrowser from '../components/reading/MangaProviderBrowser';
import ReadingMangaSources from '../components/reading/ReadingMangaSources';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CANDIDATE: DiscoveryCandidate = { provider: 'anilist', id: 30002, mediaType: 'manga', title: 'Berserk', genres: [] };

let providers: Array<{ id: string; name: string; lang: string }> = [];
const readingMangaChapters = vi.fn(async () => ({ state: 'ready', message: '', data: [] }));
const readingMangaSearch = vi.fn(async () => ({
  state: 'ready',
  message: '',
  data: {
    items: [{
      mediaId: 30002, malId: null, title: 'Berserk', titleNative: 'ベルセルク', description: '', year: 1989,
      format: 'MANGA', status: 'RELEASING', chapterCount: null, genres: [], meanScore: 93, coverUrl: '',
    }],
    page: 1, hasNextPage: false, total: 1,
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  providers = [];
  readingMangaChapters.mockClear();
  (window as unknown as { api: unknown }).api = {
    listLibrary: async () => [],
    readingMangaProviders: async () => ({ state: 'ready', message: '', data: providers }),
    readingMangaChapters,
    readingMangaSearch,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

async function render(node: ReturnType<typeof createElement>): Promise<void> {
  await act(async () => root.render(node));
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

describe('MangaProviderBrowser with no provider installed', () => {
  it('says no provider is installed instead of loading forever, and links to the providers', async () => {
    await render(createElement(MangaProviderBrowser, { candidate: CANDIDATE, onClose: () => undefined }));
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('reading.sources.loading');
    expect(text).toContain('reading.sources.noProviders.title');

    const opened: unknown[] = [];
    const onOpen = (e: Event) => {
      opened.push((e as CustomEvent).detail);
      e.preventDefault();
    };
    window.addEventListener('os:open', onOpen);
    const link = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('reading.sources.noProviders.action'),
    )!;
    await act(async () => link.click());
    window.removeEventListener('os:open', onOpen);
    expect(opened).toEqual(['scraper']);
  });

  it('does not count the local-only provider as a chapter source', async () => {
    providers = [{ id: 'local-manga', name: 'Local', lang: 'ja' }];
    await render(createElement(MangaProviderBrowser, { candidate: CANDIDATE, onClose: () => undefined }));
    expect(document.body.textContent).toContain('reading.sources.noProviders.title');
    expect(readingMangaChapters).not.toHaveBeenCalled();
  });

  it('still shows loading while the provider list has not answered', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.readingMangaProviders = () => new Promise(() => undefined);
    await render(createElement(MangaProviderBrowser, { candidate: CANDIDATE, onClose: () => undefined }));
    expect(document.body.textContent).toContain('reading.sources.loading');
    expect(document.body.textContent).not.toContain('reading.sources.noProviders.title');
  });
});

describe('ReadingMangaSources (Reading workspace > Sources)', () => {
  it('warns up front when no provider is installed', async () => {
    await render(createElement(ReadingMangaSources));
    expect(host.textContent).toContain('reading.sources.noProviders.title');
  });

  it('searches the manga catalogue and opens the sources dialog for a title', async () => {
    providers = [{ id: 'mangadex', name: 'MangaDex', lang: 'en' }];
    await render(createElement(ReadingMangaSources));
    expect(host.textContent).not.toContain('reading.sources.noProviders.title');

    const input = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ベルセルク');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector('form')!.requestSubmit());
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
    expect(readingMangaSearch).toHaveBeenCalledWith({ search: 'ベルセルク', page: 1, perPage: 20 });

    const find = [...host.querySelectorAll('li button')][0] as HTMLButtonElement;
    await act(async () => find.click());
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(readingMangaChapters).toHaveBeenCalledWith({ mediaId: 30002, providerId: 'mangadex' });
  });
});
