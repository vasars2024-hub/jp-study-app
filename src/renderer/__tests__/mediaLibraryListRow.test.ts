// @vitest-environment jsdom
/**
 * List view's own layout, rubric category 2.
 *
 * What it guards. List view had no layout of its own: the browser handed the
 * uncapped full-pane width to the same stacked poster card, and `cardRowHeight`
 * derived the row height from that width through the 2:3 ratio. Measured live
 * on 2026-08-25 in the Video window at 1080x700, shelf "Recently added", pane
 * 612x464: each row was **578x945** and the 8 titles scrolled **7,560px** — 0.49
 * titles on screen at once, against grid view's 1,060px for the same shelf. The
 * dense view was 7.1x taller than the airy one.
 *
 * So the row height is now a constant and the art takes its size from that
 * height, not from the pane's width. Both directions are asserted: grid must
 * keep the ratio-derived callback, because an aspect-ratio card genuinely does
 * depend on its column.
 *
 * `.ts` and `createElement` rather than `.tsx` and JSX for the reason
 * `mediaSpotlightShelf.test.ts` states: `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx` file here is matched by
 * nothing and never appears in the count anyone reads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import MediaLibraryBrowser, {
  type LibraryViewMode,
} from '../components/media/library/MediaLibraryBrowser';
import { LIST_ROW_HEIGHT, cardRowHeight } from '../components/media/library/MediaPosterCard';
import { invalidateMediaArtwork } from '../components/media/library/useMediaArtwork';
import type { LibraryEntry } from '../../shared/mediaLibraryEntries';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

async function render(entries: LibraryEntry[], view: LibraryViewMode): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(MediaLibraryBrowser, {
      title: 'Recently added',
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

/** The absolutely-positioned row containers `VirtualGrid` lays out. */
function rowHeights(el: HTMLElement): string[] {
  const inner = el.querySelector('.medialib-grid')?.firstElementChild;
  return [...(inner?.children ?? [])].map((row) => (row as HTMLElement).style.height);
}

describe('list view rows', () => {
  it('keeps the persistent browser header in the shared contextual role', async () => {
    const el = await render([entry('a')], 'list');
    const header = el.querySelector('.medialib-browser__head');
    expect(header).not.toBeNull();
    expect(header?.tagName).toBe('HEADER');
    expect(header?.classList.contains('lq-contextual')).toBe(true);
    expect(header?.getAttribute('data-lq-role')).toBe('contextual');
  });

  it('compacts redundant toolbar labels without removing their accessible text', async () => {
    const el = await render([entry('a')], 'list');
    const labels = [...el.querySelectorAll('.medialib-view__head > span')]
      .map((node) => node.textContent);
    expect(labels).toEqual(['View']);

    const source = readFileSync(
      join(__dirname, '..', 'components', 'media', 'library', 'MediaLibraryBrowser.tsx'),
      'utf8',
    );
    // The kind disclosure is data-dependent and this fixture has no kind chips,
    // so guard its accessible label at the source seam as well as the mounted View label.
    expect(source).toContain("<span>{t('media.browser.filter')}</span>");
    expect(source).toContain("<span>{t('media.browser.view')}</span>");

    const css = readFileSync(
      join(__dirname, '..', 'components', 'media', 'library', 'mediaLibrary.css'),
      'utf8',
    ).replace(/\r/g, '');
    const compact = css.slice(css.indexOf('@container medialib (max-width: 420px)'));
    expect(compact).toMatch(/\.medialib-view__head > span \{[\s\S]*?position: absolute;[\s\S]*?clip-path: inset\(50%\)/);
    expect(compact).toMatch(/\.medialib-view__head small \{ max-width: 5ch; \}/);
    expect(compact).toMatch(/\.medialib-browser__title \{[\s\S]*?white-space: normal;/);
    expect(compact).not.toMatch(/\.medialib-view__head > span \{[\s\S]*?display: none/);
  });

  it('lays its cards out as rows, and grid view keeps the stacked card', async () => {
    const list = await render([entry('a'), entry('b')], 'list');
    expect([...list.querySelectorAll('.medialib-card')].map((c) => c.getAttribute('data-layout')))
      .toEqual(['row', 'row']);

    await act(async () => root?.unmount());
    root = null;
    host?.remove();

    const grid = await render([entry('a'), entry('b')], 'grid');
    expect([...grid.querySelectorAll('.medialib-card')].map((c) => c.getAttribute('data-layout')))
      .toEqual(['card', 'card']);
  });

  it('gives every list row the fixed height, not one derived from the pane width', async () => {
    const el = await render([entry('a'), entry('b'), entry('c')], 'list');
    const heights = rowHeights(el);
    expect(heights.length).toBeGreaterThan(0);
    expect(new Set(heights)).toEqual(new Set([`${LIST_ROW_HEIGHT}px`]));
    // The defect this replaces, stated as a number rather than as "smaller":
    // the same list path through the ratio callback at the measured 578px pane.
    expect(cardRowHeight('poster', 14)(578)).toBe(945);
    expect(LIST_ROW_HEIGHT).toBeLessThan(cardRowHeight('poster', 14)(578) / 10);
  });

  it('leaves grid rows on the ratio-derived height they need', async () => {
    const el = await render([entry('a'), entry('b')], 'grid');
    const heights = rowHeights(el);
    // jsdom reports no element size, so `VirtualGrid` falls back to `minColWidth`
    // (168 for a poster) — the assertion is that the callback still ran, not the
    // production pixel value.
    expect(heights[0]).toBe(`${cardRowHeight('poster', 14)(168)}px`);
    expect(heights[0]).not.toBe(`${LIST_ROW_HEIGHT}px`);
  });

  it('keeps the overflow trigger reachable in a row, out of the 45px art', async () => {
    const el = await render([entry('a')], 'list');
    const card = el.querySelector('.medialib-card[data-layout="row"]');
    const more = card?.querySelector('.medialib-card__more');
    expect(more).not.toBeNull();
    // Parity, not presence: in a row it is the card's own trailing child, so the
    // 26px overlay does not cover a thumbnail that is only 45px wide.
    expect(more?.parentElement).toBe(card);
    expect(more?.closest('.medialib-card__art')).toBeNull();

    await act(async () => root?.unmount());
    root = null;
    host?.remove();

    const grid = await render([entry('a'), entry('b')], 'grid');
    const gridMore = grid.querySelector('.medialib-card[data-layout="card"] .medialib-card__more');
    expect(gridMore).not.toBeNull();
    expect(gridMore?.closest('.medialib-card__art')).not.toBeNull();
  });

  it('sizes the row art off its own height, never off the pane', () => {
    // The first pass shipped `height: 100%`, which resolves cyclically against a
    // `min-height: auto` grid cell: the art fell back to the pane width and the
    // ratio made it 482x723 inside an 84px row — the same defect one level down.
    // `\r` is stripped because this repo has `core.autocrlf=true` and no
    // `.gitattributes`, so a fresh worktree writes this sheet CRLF.
    const css = readFileSync(
      join(__dirname, '..', 'components', 'media', 'library', 'mediaLibrary.css'),
      'utf8',
    ).replace(/\r/g, '');
    const rule = css.match(/\.medialib-card\[data-layout='row'\] \.medialib-card__art \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/height:\s*var\(--medialib-row-art-h/);
    expect(rule?.[1]).not.toMatch(/height:\s*100%/);
  });
});
