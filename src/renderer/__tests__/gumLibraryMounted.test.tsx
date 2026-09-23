// @vitest-environment jsdom
//
// The media library through the real DOM: Home's Customise mode rearranges and
// persists, and the Library's tabs, filters, chips and per-tab sort behave together.
import { act, createElement, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { WatchTitleView } from '../../shared/watchLibrary';
import GumHome from '../components/media/gum/GumHome';
import GumLibrary from '../components/media/gum/GumLibrary';
import { buildGumTitles } from '../components/media/gum/gumModel';
import { GUM_HOME_LAYOUT_KEY, GUM_LIBRARY_PREFS_KEY } from '../components/media/gum/gumLayout';
import { useHomeLayout, useLibraryPrefs, useSavedViews } from '../components/media/gum/useGumPrefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom has no ResizeObserver; the grid renders every row until one reports a size. */
class NoopResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const NOW = Date.now();
const DAY = 86_400_000;

function file(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return { id, title: id, path: `D:/m/${id}.mkv`, fileName: `${id}.mkv`, addedAt: NOW - 40 * DAY, kind: 'video', ...patch } as MediaItem;
}

function tracked(id: string, patch: Partial<WatchTitleView>): WatchTitleView {
  return {
    id,
    kind: 'anime',
    title: id,
    status: 'plan',
    watchDates: [],
    tags: [],
    lists: [],
    sources: ['mal-export'],
    addedAt: NOW - 50 * DAY,
    updatedAt: NOW,
    mediaItemIds: [],
    onDisk: false,
    episodesOnDisk: 0,
    allGenres: [],
    ...patch,
  } as WatchTitleView;
}

const FILES = [
  file('fr-1', { seriesKey: 'fr', seriesTitle: 'Frieren', category: 'anime', episode: 1, season: 1, durationSec: 1400, positionSec: 1400, lastPlayedAt: NOW - DAY }),
  file('fr-2', { seriesKey: 'fr', seriesTitle: 'Frieren', category: 'anime', episode: 2, season: 1, durationSec: 1400 }),
  file('pd', { title: 'Perfect Days', category: 'movie', durationSec: 7400, addedAt: NOW - DAY }),
];
const VIEWS = [
  tracked('mal:1', { title: 'Frieren', status: 'watching', score: 9, episodeCount: 28, progress: 1, mediaItemIds: ['fr-1', 'fr-2'], onDisk: true, allGenres: ['Fantasy'] }),
  tracked('mal:2', { title: 'Mushishi', status: 'completed', score: 10, allGenres: ['Mystery'] }),
  tracked('mal:3', { title: 'Kimi ni Todoke', status: 'plan', allGenres: ['Romance'] }),
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { ResizeObserver: typeof NoopResizeObserver }).ResizeObserver = NoopResizeObserver;
  (window as unknown as { api: Record<string, unknown> }).api = { mediaArtwork: vi.fn(async () => null) };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function HomeHarness() {
  const titles = useMemo(() => buildGumTitles(VIEWS, FILES), []);
  const [savedViews] = useSavedViews();
  const home = useHomeLayout(savedViews.map((view) => view.id));
  return createElement(GumHome, {
    titles,
    continueRows: [],
    arrivals: [],
    savedViews,
    layout: home.layout,
    setLayout: home.setLayout,
    onResetLayout: home.reset,
    loading: false,
    onOpenTitle: () => undefined,
    onPlayTitle: () => undefined,
    onPlayItem: () => undefined,
    onResumeRow: () => undefined,
    onBrowse: () => undefined,
    onAddFiles: () => undefined,
    onAddFolder: () => undefined,
    onImport: () => undefined,
  });
}

function LibraryHarness({ search = '' }: { search?: string }) {
  const titles = useMemo(() => buildGumTitles(VIEWS, FILES), []);
  const [prefs, setPrefs] = useLibraryPrefs();
  const [savedViews, setSavedViews] = useSavedViews();
  const home = useHomeLayout(savedViews.map((view) => view.id));
  return createElement(GumLibrary, {
    titles,
    loading: false,
    search,
    prefs,
    setPrefs,
    savedViews,
    setSavedViews,
    homeLayout: home.layout,
    setHomeLayout: home.setLayout,
    onOpenTitle: () => undefined,
    onPlayTitle: () => undefined,
    onClearSearch: () => undefined,
    onImport: () => undefined,
    onAddFolder: () => undefined,
  });
}

const headings = (): string[] =>
  [...host.querySelectorAll('.gum-section h2')].map((node) => node.textContent ?? '');

const button = (label: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label || node.getAttribute('aria-label') === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
};

describe('Home', () => {
  it('shows only the sections that have something, in the default order', async () => {
    await act(async () => root.render(createElement(HomeHarness)));
    // Continue watching has no rows here, so it hides itself; Up next has Frieren E2.
    expect(headings()).toContain('Up next');
    expect(headings()).toContain('Plan to watch');
    expect(headings()).not.toContain('Continue watching');
  });

  it('rearranges in Customise mode and remembers it', async () => {
    await act(async () => root.render(createElement(HomeHarness)));
    await act(async () => button('Customise').click());
    // Every section is listed while customising, empty ones included.
    expect(headings()).toContain('Continue watching');
    await act(async () => button('Move Plan to watch up').click());
    const stored = JSON.parse(localStorage.getItem(GUM_HOME_LAYOUT_KEY) ?? '{}') as { order: string[] };
    expect(stored.order.indexOf('plan')).toBeLessThan(stored.order.indexOf('justAdded'));
    await act(async () => button('Show Plan to watch on Home').click());
    await act(async () => button('Done').click());
    expect(headings()).not.toContain('Plan to watch');
    // Reset brings the default back.
    await act(async () => button('Customise').click());
    await act(async () => button('Reset layout').click());
    await act(async () => button('Done').click());
    expect(headings()).toContain('Plan to watch');
  });
});

describe('Library', () => {
  const cards = (): string[] =>
    [...host.querySelectorAll('.gum-card__title')].map((node) => node.textContent ?? '').sort();

  it('counts every status tab and filters as tabs, chips and search combine', async () => {
    await act(async () => root.render(createElement(LibraryHarness)));
    expect(cards()).toEqual(['Frieren', 'Kimi ni Todoke', 'Mushishi', 'Perfect Days']);
    const planTab = [...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent?.startsWith('Plan to watch')) as HTMLButtonElement;
    expect(planTab.textContent).toContain('1');
    await act(async () => planTab.click());
    expect(cards()).toEqual(['Kimi ni Todoke']);
    expect(planTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows an active filter as a removable chip with a result count and Clear all', async () => {
    await act(async () => root.render(createElement(LibraryHarness)));
    const onDisk = host.querySelector<HTMLInputElement>('.gum-switch-chip input');
    await act(async () => onDisk?.click());
    expect(cards()).toEqual(['Frieren', 'Perfect Days']);
    expect(host.querySelector('.gum-active__count')?.textContent).toBe('2 titles');
    const chip = [...host.querySelectorAll('.gum-chip')].find((node) => node.textContent?.includes('On this PC')) as HTMLButtonElement;
    expect(chip).toBeTruthy();
    await act(async () => button('Clear all').click());
    expect(cards()).toHaveLength(4);
  });

  it('filters instantly from the search it is given', async () => {
    await act(async () => root.render(createElement(LibraryHarness, { search: 'mushi' })));
    expect(cards()).toEqual(['Mushishi']);
  });

  it('remembers the sort per status tab', async () => {
    await act(async () => root.render(createElement(LibraryHarness)));
    const sortTrigger = [...host.querySelectorAll('summary')].find((node) => node.textContent?.trim().startsWith('Sort')) as HTMLElement;
    // Open the disclosure the way a click does, then let React see the toggle.
    await act(async () => {
      const details = sortTrigger.parentElement as HTMLDetailsElement;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    await act(async () => button('My rating').click());
    const prefs = JSON.parse(localStorage.getItem(GUM_LIBRARY_PREFS_KEY) ?? '{}') as { byStatus: Record<string, { sort: string; dir: string }> };
    expect(prefs.byStatus.all).toMatchObject({ sort: 'score', dir: 'desc' });
    // Another tab keeps its own default.
    expect(prefs.byStatus.watching.sort).toBe('lastWatched');
  });
});
