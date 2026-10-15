// @vitest-environment jsdom
/**
 * F3 for the immersion reader: why no article could be read reaches the banner
 * as a code translated in the UI language, never as main's or fetch's English
 * (`ImmersionContent` used to print `e.message` / `res.error` verbatim).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImmersionState } from '../components/immersion/ImmersionContent';
import { classifyReaderFetchError, fetchReadableArticle, ReaderArticleError } from '../readabilityArticle';
import { IMMERSION_UI_EN } from '../../shared/i18n/immersionUi/en';
import { IMMERSION_UI_JA } from '../../shared/i18n/immersionUi/ja';
import { IMMERSION_UI_RU } from '../../shared/i18n/immersionUi/ru';
import { IMMERSION_UI_ZH } from '../../shared/i18n/immersionUi/zh';
import { setUiLang } from '../i18n';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('classifyReaderFetchError', () => {
  it.each([
    ['404 Not Found', 'http', 404],
    ['503 Service Unavailable', 'http', 503],
    ['The page took too long to load.', 'timeout', undefined],
    ['Not a web page (application/pdf).', 'not-html', undefined],
    ['Enter a full http(s):// address.', 'bad-url', undefined],
    ['No readable article found on that page.', 'no-article', undefined],
    ['Reader extraction returned too little text.', 'no-article', undefined],
    ['fetch failed', 'network', undefined],
    ['getaddrinfo ENOTFOUND example.invalid', 'network', undefined],
    ['net::ERR_NAME_NOT_RESOLVED', 'network', undefined],
    ['Something odd happened', 'failed', undefined],
  ])('%s -> %s', (message, code, status) => {
    expect(classifyReaderFetchError(message)).toEqual(status ? { code, status } : { code });
  });
});

describe('fetchReadableArticle throws a coded error', () => {
  beforeEach(() => {
    (window as unknown as { api: unknown }).api = {};
  });

  it('prefers the site\'s status over "no article", and keeps the English message for logs', async () => {
    Object.assign(window.api, {
      extractReadableArticle: async () => ({ ok: false, error: 'No readable article found on that page.' }),
      fetchPage: async () => ({ ok: false, error: '404 Not Found' }),
    });
    const error = await fetchReadableArticle('https://example.test/missing').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReaderArticleError);
    expect(error).toMatchObject({ code: 'http', status: 404, message: 'No readable article found on that page.' });
  });

  it('a page with nothing to read is "no-article"', async () => {
    Object.assign(window.api, {
      extractReadableArticle: async () => ({ ok: false }),
      fetchPage: async () => ({ ok: false }),
    });
    await expect(fetchReadableArticle('https://example.test/empty')).rejects.toMatchObject({ code: 'no-article' });
  });
});

describe('the immersionUi pack', () => {
  const keys = Object.keys(IMMERSION_UI_EN).sort();
  it.each([['ja', IMMERSION_UI_JA], ['zh', IMMERSION_UI_ZH], ['ru', IMMERSION_UI_RU]])('%s has every key, none left in English', (_lang, pack) => {
    expect(Object.keys(pack).sort()).toEqual(keys);
    for (const key of keys) expect(pack[key], key).not.toEqual(IMMERSION_UI_EN[key]);
  });
});

describe('the reader banner shows the coded error, translated', () => {
  let root: Root;
  let host: HTMLDivElement;
  let state: ImmersionState;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installResizeObserver();
    installReadingSurfaceApi({
      immersionListSites: async () => ({ sites: [] }),
      onImmersionSitesChanged: () => () => undefined,
      immersionRecordVisit: async () => ({ ok: true }),
      extractReadableArticle: async () => ({ ok: false, error: '404 Not Found' }),
      fetchPage: async () => ({ ok: false, error: '404 Not Found' }),
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    setUiLang('en');
    vi.useRealTimers();
  });

  it('in Russian, a 404 reads as the Russian sentence with the status, not "404 Not Found"', async () => {
    setUiLang('ru');
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    const { useImmersion } = await import('../components/immersion/ImmersionContent');
    function Surface() {
      state = useImmersion();
      return null;
    }
    await act(async () => { root.render(createElement(Surface)); });
    await act(async () => { state.navigate('https://example.test/missing'); });
    // Six attempts with growing waits between them.
    for (let i = 0; i < 20 && !state.error; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    }
    const expected = (IMMERSION_UI_RU['immersionUi.error.http'] as string).replace('{status}', '404');
    expect(state.error).toBe(expected);
    expect(state.error).not.toContain('Not Found');
  });
});
