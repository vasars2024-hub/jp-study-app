// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';

vi.mock('../i18n', () => ({
  useT: () => ({
    lang: 'en',
    t: (key: string, vars?: { count?: number }) => vars?.count == null ? key : `${key}:${vars.count}`,
  }),
}));

let ReadingFinderView: typeof import('../views/ReadingFinderView').default;
let host: HTMLDivElement;
let root: Root;

const inProgressItem = {
  id: 'continue-1',
  title: '続きの本',
  kind: 'book',
  createdAt: 1,
  lastReadAt: 2,
  sourcePath: 'https://example.com/chapter',
  progress: { location: 'p:0:0.5', percent: 0.5 },
} as LibraryItem;

beforeAll(async () => {
  (window as unknown as { api: unknown }).api = {
    listLibrary: async () => [inProgressItem],
    onLibraryChanged: () => () => undefined,
  };
  ReadingFinderView = (await import('../views/ReadingFinderView')).default;
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
});

async function render(mode: 'home' | 'discover' | 'continue') {
  await act(async () => {
    root.render(createElement(ReadingFinderView, { mode, onOpenBook: vi.fn() }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ReadingFinderView workspace modes', () => {
  it('keeps catalogue controls and results in Discover only', async () => {
    await render('discover');

    expect(host.querySelector('[data-reading-finder-mode="discover"]')).not.toBeNull();
    expect(host.querySelector('.rf-controls')).not.toBeNull();
    expect(host.querySelector('.res-grid')).not.toBeNull();
    expect(host.querySelector('.rf-continue')).toBeNull();
  });

  it('makes Home a focused overview with resumable reading', async () => {
    await render('home');

    expect(host.querySelector('[data-reading-finder-mode="home"]')).not.toBeNull();
    expect(host.querySelector('.view-head')).not.toBeNull();
    expect(host.querySelector('.rf-continue-card')?.textContent).toContain('続きの本');
    expect(host.querySelector('.rf-controls')).toBeNull();
    expect(host.querySelector('.res-grid')).toBeNull();
  });

  it('makes Continue a dedicated resume list without discovery chrome', async () => {
    await render('continue');

    expect(host.querySelector('[data-reading-finder-mode="continue"]')).not.toBeNull();
    expect(host.querySelector('.rf-continue-card')).not.toBeNull();
    expect(host.querySelector('.view-head')).toBeNull();
    expect(host.querySelector('.rf-controls')).toBeNull();
    expect(host.querySelector('.res-grid')).toBeNull();
  });
});
