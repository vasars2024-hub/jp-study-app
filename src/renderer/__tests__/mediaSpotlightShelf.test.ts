// @vitest-environment jsdom
/**
 * The one-title shelf, rubric category 4.
 *
 * `.ts` and `createElement` rather than `.tsx` and JSX for the reason
 * `mediaArtworkAlt.test.ts` states at its top: `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx` file here is matched by
 * nothing and never appears in the count anyone reads.
 *
 * What it guards. "Continue watching" holds one title, and at 1264x765 that one
 * 240x438 card sat in a 764px grid with a 284x602 contiguous dead region beside
 * it — 16.5% of the viewport against the rubric's 15% bar. The fix is a
 * presentation decision: one entry is spoken at the size the pane is offering
 * instead of being a card in a void.
 *
 * The regression that matters is the other direction. A denser shelf must keep
 * the grid it had, or every library in the app changes shape; and list view
 * already spans the pane, so it must not be diverted either.
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import MediaLibraryBrowser, {
  type LibraryViewMode,
} from '../components/media/library/MediaLibraryBrowser';
import { invalidateMediaArtwork } from '../components/media/library/useMediaArtwork';
import type { LibraryEntry } from '../../shared/mediaLibraryEntries';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom ships none, and `useElementSize` constructs one on mount — the grid
  // branch throws without it. A no-op is enough here: these cases assert which
  // branch rendered, never a column count (`virtualGridAtScale.test.ts` owns that).
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe = (): undefined => undefined;

    unobserve = (): undefined => undefined;

    disconnect = (): undefined => undefined;
  };
});

beforeEach(() => {
  invalidateMediaArtwork();
  (window as unknown as { api: { mediaArtwork: () => Promise<string | null> } }).api = {
    mediaArtwork: async () => null,
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

/**
 * Enough of a `LibraryEntry` for the browser's own reads. The cast is deliberate:
 * a full `MediaItem` tree would put twenty fields of provider metadata in this
 * file that no assertion here touches.
 */
function entry(id: string, over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id,
    grouping: 'series',
    title: `Title ${id}`,
    category: 'anime',
    items: [{ id: `${id}-1` }],
    extras: [],
    primary: { id: `${id}-1`, durationSec: 1440 },
    artworkItem: { id: `${id}-1` },
    metadataItem: { id: `${id}-1` },
    metadataNeedsReview: false,
    subtitleLanguages: ['ja'],
    hasJapaneseSubtitles: true,
    subtitlesChecked: true,
    year: 2011,
    seasons: [1],
    episodeCount: 26,
    watchedCount: 4,
    progress: null,
    lastPlayedAt: null,
    addedAt: 0,
    favorite: false,
    studyQueue: false,
    ...over,
  } as unknown as LibraryEntry;
}

async function render(entries: LibraryEntry[], view: LibraryViewMode = 'grid'): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(MediaLibraryBrowser, {
      title: 'Continue watching',
      entries,
      category: 'anime',
      sort: 'recentlyAdded',
      onSortChange: () => undefined,
      view,
      onViewChange: () => undefined,
      chips: [],
      activeChip: 'all',
      onChipChange: () => undefined,
      selectedId: null,
      currentId: null,
      onActivate: () => undefined,
      onMenu: () => undefined,
      onAdd: () => undefined,
    }));
  });
  return host;
}

describe('the one-title shelf', () => {
  it('gives a single entry the pane instead of a card and a void', async () => {
    const el = await render([entry('a')]);
    expect(el.querySelector('.medialib-spotlight')).not.toBeNull();
    expect(el.querySelector('.medialib-grid')).toBeNull();
    // The facts are what fill the surplus width; an empty spotlight would move
    // the dead region rather than remove it.
    expect(el.querySelectorAll('.medialib-spotlight__fact').length).toBeGreaterThanOrEqual(3);
  });

  it('leaves a denser shelf on the grid it already had', async () => {
    const el = await render([entry('a'), entry('b')]);
    expect(el.querySelector('.medialib-grid')).not.toBeNull();
    expect(el.querySelector('.medialib-spotlight')).toBeNull();
  });

  it('does not divert list view, whose rows already span the pane', async () => {
    const el = await render([entry('a')], 'list');
    expect(el.querySelector('.medialib-grid')).not.toBeNull();
    expect(el.querySelector('.medialib-spotlight')).toBeNull();
  });

  it('still shows the empty state rather than a spotlight of nothing', async () => {
    const el = await render([]);
    expect(el.querySelector('.medialib-spotlight')).toBeNull();
    expect(el.querySelector('.medialib-empty')).not.toBeNull();
  });

  it('names the title once and keeps the art decorative', async () => {
    // Same contract `mediaArtworkAlt.test.ts` pins for the grid card: the heading
    // names the item, so labelling the picture would announce it twice.
    const el = await render([entry('a')]);
    const heading = el.querySelector('.medialib-spotlight__title');
    expect(heading?.textContent).toBe('Title a');
    expect(el.querySelector('.medialib-card__fallback')?.getAttribute('aria-hidden')).not.toBe(null);
    const img = el.querySelector('.medialib-card__img');
    if (img) expect(img.getAttribute('alt')).toBe('');
  });

  it('offers Resume only once there is progress to resume from', async () => {
    const fresh = await render([entry('a', { progress: null })]);
    expect(fresh.querySelector('.medialib-spotlight__actions')?.textContent).toContain('Open');
    expect(fresh.querySelector('.medialib-spotlight__progress')).toBeNull();

    await act(async () => root?.unmount());
    root = null;
    host?.remove();

    const started = await render([entry('a', { progress: 0.42 })]);
    expect(started.querySelector('.medialib-spotlight__actions')?.textContent).toContain('Resume');
    const bar = started.querySelector('.medialib-spotlight__bar');
    expect(bar?.getAttribute('aria-valuenow')).toBe('42');
  });
});
