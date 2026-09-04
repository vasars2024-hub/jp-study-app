// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../shared/readingWorkspace';
import type { LibraryItem } from '../../shared/types';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../views/ReadingFinderView', () => ({
  default: ({ mode, initialQuery }: { mode?: string; initialQuery?: string }) => createElement('div', {
    'data-surface': 'finder',
    'data-mode': mode,
    'data-query': initialQuery ?? '',
  }),
}));
vi.mock('../views/ReadingListsView', () => ({
  default: ({ onFindWork }: { onFindWork: (title: string) => void }) => createElement('button', {
    'data-surface': 'lists',
    onClick: () => onFindWork('コンビニ人間'),
  }),
}));
vi.mock('../views/LibraryView', () => ({
  default: () => createElement('div', { 'data-surface': 'library' }),
}));
vi.mock('../views/NovelsView', () => ({
  default: ({ mode }: { mode?: string }) => createElement('div', {
    'data-surface': 'novels',
    'data-mode': mode,
  }),
}));

import ReadingWorkspaceView from '../views/ReadingWorkspaceView';
import {
  consumePendingReadingWorkspaceRoute,
  publishReadingWorkspaceRoute,
} from '../readingWorkspaceNavigation';

let host: HTMLDivElement;
let root: Root;
let originalApiDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  consumePendingReadingWorkspaceRoute('reading');
  consumePendingReadingWorkspaceRoute('novels');
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor);
  } else {
    delete (window as unknown as { api?: unknown }).api;
  }
});

async function render(
  initialSection: 'discover' | 'plan' = 'discover',
  onOpenBook: (item: LibraryItem) => void = () => undefined,
) {
  await act(async () => {
    root.render(createElement(ReadingWorkspaceView, {
      initialSection,
      onOpenBook,
    }));
    await Promise.resolve();
  });
}

function tab(section: string): HTMLButtonElement {
  const result = host.querySelector<HTMLButtonElement>(
    `[aria-controls="reading-workspace-panel-${section}"]`,
  );
  if (!result) throw new Error(`Missing ${section} tab`);
  return result;
}

describe('ReadingWorkspaceView', () => {
  it('ships every workspace destination label in all four catalogs', () => {
    const labelKeys = [
      'settings.nav.home',
      'palette.section.reading',
      'palette.section.library',
      'readingLists.view.title',
      'reading.continue.title',
      'novelsView.plan',
      'library.aero.toolbar.import',
      'novelsView.sources',
    ];
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      for (const key of labelKeys) {
        expect(catalog[key], `${language} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('lands the Reading compatibility entry on Discover inside one nine-destination shell', async () => {
    await render();

    // Eight since the lens passage lane landed — Captures is the destination
    // `resolveReadingLensWorkflow`'s `reading` target had been routing to for
    // its whole life with nothing there to receive it — and nine since Reading
    // Lists P4b mounted §6's surface as a sibling of Library.
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(9);
    expect(host.querySelector('[role="tablist"]')?.classList.contains('lq-contextual')).toBe(true);
    expect(host.querySelector('[role="tablist"]')?.getAttribute('data-lq-role')).toBe('contextual');
    expect(tab('captures')).not.toBeNull();
    expect(tab('discover').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-surface="finder"]')).not.toBeNull();
  });

  it('carries a list row title into Discover instead of dropping the user in an empty box', async () => {
    await render();

    await act(async () => tab('lists').click());
    const lists = host.querySelector<HTMLButtonElement>('[data-surface="lists"]');
    expect(lists).not.toBeNull();

    // §11.1's acquisition path, end to end: the unbound row asks, the workspace
    // switches tab, and the title arrives with it. A tab switch that lost the
    // title would leave a search box the user has to retype into.
    await act(async () => lists?.click());
    expect(host.querySelector('[data-reading-section="discover"]')).not.toBeNull();
    expect(host.querySelector('[data-surface="finder"]')?.getAttribute('data-query')).toBe(
      'コンビニ人間',
    );
  });

  it('lands the Novels compatibility entry on Plan', async () => {
    await render('plan');

    expect(tab('plan').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-surface="novels"]')).not.toBeNull();
  });

  it('moves between retained surfaces without leaving the Reading workspace', async () => {
    await render();

    await act(async () => tab('library').click());
    expect(host.querySelector('[data-reading-section="library"]')).not.toBeNull();
    expect(host.querySelector('[data-surface="library"]')).not.toBeNull();

    await act(async () => tab('sources').click());
    expect(host.querySelector('[data-surface="novels"]')).not.toBeNull();
  });

  it('gives Plan, Imports, and Sources distinct Novels intents', async () => {
    await render('plan');

    expect(host.querySelector('[data-surface="novels"]')?.getAttribute('data-mode')).toBe('plan');

    await act(async () => tab('imports').click());
    expect(host.querySelector('[data-surface="novels"]')?.getAttribute('data-mode')).toBe('imports');

    await act(async () => tab('sources').click());
    expect(host.querySelector('[data-surface="novels"]')?.getAttribute('data-mode')).toBe('sources');
  });

  it('gives Home, Discover, and Continue distinct Finder intents', async () => {
    await render();

    expect(host.querySelector('[data-surface="finder"]')?.getAttribute('data-mode')).toBe('discover');

    await act(async () => tab('home').click());
    expect(host.querySelector('[data-surface="finder"]')?.getAttribute('data-mode')).toBe('home');

    await act(async () => tab('continue').click());
    expect(host.querySelector('[data-surface="finder"]')?.getAttribute('data-mode')).toBe('continue');
  });

  it('consumes a route retained while its lazy desktop host was opening', async () => {
    publishReadingWorkspaceRoute({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'imports',
      intent: 'import',
    });
    await render('plan');

    expect(host.querySelector('[data-reading-section="imports"]')).not.toBeNull();
    expect(host.querySelector('[data-surface="novels"]')?.getAttribute('data-mode')).toBe('imports');
  });

  it('responds to a deep link while mounted and opens its current library item', async () => {
    const item = { id: 'book-1', title: '本', kind: 'book', createdAt: 1 } as LibraryItem;
    const onOpenBook = vi.fn();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { listLibrary: vi.fn().mockResolvedValue([item]) },
    });
    await render('discover', onOpenBook);

    await act(async () => {
      publishReadingWorkspaceRoute({
        version: READING_WORKSPACE_SCHEMA_VERSION,
        section: 'library',
        intent: 'open',
        workId: 'work-1',
        editionId: 'edition-1',
        itemId: 'book-1',
      });
      await Promise.resolve();
    });

    expect(host.querySelector('[data-reading-section="library"]')).not.toBeNull();
    expect(onOpenBook).toHaveBeenCalledWith(item);
  });

  it('supports roving arrow, Home, and End keyboard navigation', async () => {
    await render();

    tab('discover').focus();
    await act(async () => tab('discover').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true,
    })));
    expect(tab('library').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('library'));

    await act(async () => tab('library').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'End', bubbles: true,
    })));
    expect(tab('sources').getAttribute('aria-selected')).toBe('true');

    await act(async () => tab('sources').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Home', bubbles: true,
    })));
    expect(tab('home').getAttribute('aria-selected')).toBe('true');
  });
});
