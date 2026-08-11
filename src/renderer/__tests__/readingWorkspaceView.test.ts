// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../views/ReadingFinderView', () => ({
  default: ({ mode }: { mode?: string }) => createElement('div', {
    'data-surface': 'finder',
    'data-mode': mode,
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

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(initialSection: 'discover' | 'plan' = 'discover') {
  await act(async () => {
    root.render(createElement(ReadingWorkspaceView, {
      initialSection,
      onOpenBook: () => undefined,
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

  it('lands the Reading compatibility entry on Discover inside one seven-destination shell', async () => {
    await render();

    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(7);
    expect(tab('discover').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-surface="finder"]')).not.toBeNull();
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
