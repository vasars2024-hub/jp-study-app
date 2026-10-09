// @vitest-environment jsdom
/**
 * The novel reader applies the book's own (sanitised, scoped) CSS, can turn it
 * off, and claims an "Open in book" request for the book it is showing.
 *
 * The loader is stubbed with a one-chapter book carrying `publisherCss`; the
 * sanitiser itself is pinned in `shared/__tests__/epubPublisherCss.test.ts`.
 */
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';
import { BOOK_OPEN_AT_EVENT } from '../bookRoundTrip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLISHER_CSS = '.epub-pub .tcy { text-combine-upright: all; }';

// The dictionary-backed tokenizer would fetch its data files; this test is about styles.
vi.mock('../tokenizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tokenizer')>()),
  getTokenizer: () => new Promise(() => undefined),
  tokenizerReady: () => false,
}));

vi.mock('../epubLoader', () => ({
  readableCharCount: () => 0,
  loadEpub: async () => ({
    title: '本',
    chapters: [
      { href: 'c1.xhtml', absPath: '/c1.xhtml', html: '<p>第<span class="tcy">12</span>章</p>', chars: 4, label: '一' },
      { href: 'c2.xhtml', absPath: '/c2.xhtml', html: '<p>二章の本文</p>', chars: 5, label: '二' },
    ],
    toc: [],
    totalChars: 9,
    direction: 'rtl',
    publisherCss: PUBLISHER_CSS,
    destroy: () => undefined,
  }),
}));

function bookItem(): LibraryItem {
  return {
    id: 'book-css',
    title: '本',
    kind: 'book',
    createdAt: 0,
    epubFile: 'original.epub',
    progress: { location: 'p:0:0', percent: 0 },
  } as unknown as LibraryItem;
}

let harness: ReadingSurfaceHarness | null = null;

async function mountReader(): Promise<ReadingSurfaceHarness> {
  const { default: NovelReader } = await import('../views/NovelReader');
  harness = createReadingSurfaceHarness({
    render: () => createElement(NovelReader, { item: bookItem(), onClose: () => undefined }),
    ready: (container) => container.querySelector('.novel-content') !== null,
  });
  await harness.mount(1200);
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
  return harness;
}

beforeEach(() => {
  installResizeObserver();
  // jsdom has no scrolling; the reader positions its page with `scrollTo`.
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = (): void => undefined;
  installReadingSurfaceApi({
    // Not a PDF ("%PDF"), so the EPUB path (the stubbed loader) runs.
    readBook: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer,
    setProgress: vi.fn(),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('NovelReader publisher styles', () => {
  it('injects the scoped book CSS and puts its scope on the page', async () => {
    const h = await mountReader();
    const root = h.doc().ownerDocument;
    const style = root.querySelector('style[data-publisher-css]');
    expect(style?.textContent).toBe(PUBLISHER_CSS);
    expect(root.querySelector('.novel-content')?.classList.contains('epub-pub')).toBe(true);
  });

  it('applies none of it with the reader setting off', async () => {
    localStorage.setItem('jp-reader-settings', JSON.stringify({ publisherStyles: false }));
    const h = await mountReader();
    const root = h.doc().ownerDocument;
    expect(root.querySelector('style[data-publisher-css]')).toBeNull();
    expect(root.querySelector('.novel-content')?.classList.contains('epub-pub')).toBe(false);
  });

  it('claims an "Open in book" request for this book only', async () => {
    await mountReader();
    const ask = (bookId: string) => {
      const event = new CustomEvent(BOOK_OPEN_AT_EVENT, { detail: { bookId, loc: 'p:1:0.5000' }, cancelable: true });
      act(() => {
        window.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    expect(ask('book-css')).toBe(true);
    expect(ask('another-book')).toBe(false);
  });
});
