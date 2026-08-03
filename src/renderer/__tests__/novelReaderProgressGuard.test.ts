// @vitest-environment jsdom
/**
 * Regression: opening a book must not destroy its stored position.
 *
 * `NovelReader`'s load effect restores `p:<part>:<frac>` asynchronously, and its
 * cleanup writes the current position back. Before the fix the cleanup wrote
 * unconditionally, so an unmount that happened *before* the load resolved
 * persisted the initial refs — `part 0, fraction 0` — over a real saved locator,
 * keeping only `percent` (which is seeded from `item.progress`). React.StrictMode
 * tears the first mount down on every mount in development, which made this fire
 * on every open: a book saved at `p:12:0.6207` came back as `p:0:0.0000`.
 *
 * Found live on 2026-07-30 against the real library, during the Phase 5
 * novel/EPUB slice.
 *
 * Written with `createElement` rather than JSX on purpose: `vitest.config.ts`
 * includes only `src/renderer/__tests__/**\/*.test.ts`, so a `.test.tsx` file
 * placed here is silently never run.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';

const setProgress = vi.fn();

function bookItem(): LibraryItem {
  return {
    id: 'book-1',
    title: 'クビシメロマンチスト',
    kind: 'book',
    createdAt: 0,
    epubFile: 'original.epub',
    progress: { location: 'p:12:0.6207', percent: 0.0311 },
  } as unknown as LibraryItem;
}

beforeEach(() => {
  setProgress.mockClear();
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no ResizeObserver; the reader observes its scroller on mount.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observed = 0;
    observe(): void {
      this.observed += 1;
    }
    unobserve(): void {
      this.observed -= 1;
    }
    disconnect(): void {
      this.observed = 0;
    }
  };
  // Importing the reader pulls in modules that call `window.api` at module-eval
  // time (playerBus, keyboardShortcuts). Only two members matter here. Every
  // other member returns a value that is simultaneously awaitable as `null` and
  // callable as an unsubscribe, because the tree uses both shapes.
  const inert = (): unknown => {
    const value = (): null => null;
    (value as unknown as { then: (r: (v: null) => void) => Promise<null> }).then = (resolve) => {
      resolve(null);
      return Promise.resolve(null);
    };
    return value;
  };
  const explicit: Record<string, unknown> = {
    // The load must stay pending for the whole test: that is the window in which
    // the refs still hold their initial zeros.
    readBook: () => new Promise(() => undefined),
    setProgress,
  };
  (window as unknown as { api: unknown }).api = new Proxy(explicit, {
    get: (target, key: string) => (key in target ? target[key] : inert),
    has: () => true,
  });
});

describe('NovelReader position persistence', () => {
  it('does not persist a position before the stored one has been restored', async () => {
    const { default: NovelReader } = await import('../views/NovelReader');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(NovelReader, { item: bookItem(), onClose: () => undefined }));
    });
    // Unmount while `readBook` is still pending — exactly the StrictMode
    // double-mount teardown, and any close of a slow-loading book.
    await act(async () => {
      root.unmount();
    });

    expect(setProgress).not.toHaveBeenCalled();
    document.body.replaceChildren();
  });
});
