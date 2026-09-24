// @vitest-environment jsdom
//
// The Gum library's visual-audit fixes (2026-09), each pinned where jsdom can see it:
// the hero's next episode, tracked shows in Continue watching, one-slot keyboard moves
// and compact Customise bars, named filter chips, one rating scale, the typographic
// poster's fitting, popover placement, the top bar's fit, the import zone claiming its
// drop, the title page's lean Details and missing-episode actions, and the cover cache
// dropping a stale "no art" when the watch library changes.
import { act, createElement, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { WatchTitleView } from '../../shared/watchLibrary';
import type { ContinueWatchingRow } from '../components/media/ContinueWatchingShelf';
import GumHome from '../components/media/gum/GumHome';
import GumImport from '../components/media/gum/GumImport';
import GumTitlePage from '../components/media/gum/GumTitlePage';
import { formatScore, monogram, typoFontSize } from '../components/media/gum/GumCards';
import { placePopover } from '../components/media/gum/GumPopover';
import { chooseTopNavFit, fitNavCount } from '../components/media/gum/gumTopNav';
import { gumHandoff, invalidateTitleArt, useTitleArtUrl } from '../components/media/gum/gumBackend';
import { EXTERNAL_PLAYER_STORAGE_KEY } from '../externalPlayerStore';
import { activeFilterChips, buildGumTitles, nextEpisodeOf, type GumTitle } from '../components/media/gum/gumModel';
import { continueCards, justAddedCards, pickHero, titleIndex, trackedNextCards, upNextCards } from '../components/media/gum/gumShelves';
import { useHomeLayout, useSavedViews } from '../components/media/gum/useGumPrefs';
import { translate } from '../../shared/i18n/core';
import { GUM_LIBRARY_EN } from '../../shared/i18n/gumLibrary/en';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tr = (key: string, vars?: Record<string, string | number>): string =>
  translate(key, vars, { lang: 'en', catalog: GUM_LIBRARY_EN, fallback: GUM_LIBRARY_EN });

const NOW = Date.now();
const DAY = 86_400_000;

function ep(series: string, n: number, patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: `${series}-${n}`,
    title: `${series} ${n}`,
    path: `D:/${series}/${n}.mkv`,
    fileName: `${series}-${n}.mkv`,
    addedAt: NOW - 30 * DAY,
    kind: 'video',
    category: 'anime',
    seriesKey: series,
    seriesTitle: series,
    season: 1,
    episode: n,
    durationSec: 1400,
    ...patch,
  } as MediaItem;
}

function tracked(id: string, title: string, patch: Partial<WatchTitleView> = {}): WatchTitleView {
  return {
    id,
    kind: 'anime',
    title,
    status: 'watching',
    watchDates: [],
    tags: [],
    lists: [],
    sources: ['mal-export'],
    addedAt: NOW - 90 * DAY,
    updatedAt: NOW,
    mediaItemIds: [],
    onDisk: false,
    episodesOnDisk: 0,
    allGenres: [],
    ...patch,
  } as WatchTitleView;
}

class NoopResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

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

// ---------------------------------------------------------------------------
// Home: the hero, Continue watching, Customise
// ---------------------------------------------------------------------------

describe('the hero offers the right episode', () => {
  it('plays the lowest unwatched episode on disk, not the file that arrived last', () => {
    // E3 arrived last; E1 and E2 are on disk and unwatched.
    const files = [ep('camp', 1), ep('camp', 2), ep('camp', 3, { addedAt: NOW - DAY })];
    const titles = buildGumTitles([], files);
    const added = justAddedCards(titles, [{ at: NOW, itemIds: ['camp-3'], title: 'camp', source: 'watch-folder' }], NOW);
    const hero = pickHero([], added, titles);
    expect(hero?.item?.episode).toBe(1);
  });

  it('counts the tracker\u2019s progress as watched, so a MAL show at 2/12 offers episode 3', () => {
    const files = [ep('fr', 1), ep('fr', 2), ep('fr', 3)];
    const [title] = buildGumTitles([tracked('mal:1', 'Frieren', { progress: 2, episodeCount: 12, mediaItemIds: files.map((f) => f.id), onDisk: true })], files);
    expect(nextEpisodeOf(title)?.episode).toBe(3);
    expect(upNextCards([title])[0]?.item.episode).toBe(3);
  });

  it('drops a resume row whose file is gone instead of featuring it', () => {
    const titles = buildGumTitles([], [ep('a', 1)]);
    const orphan = { entry: { pathKey: 'x', localFilePath: 'D:/gone.mkv', title: 'Gone', positionSec: 10 } } as unknown as ContinueWatchingRow;
    expect(continueCards([orphan], titleIndex(titles))).toEqual([]);
  });

  it('says "Episode 3", never "Episode E3"', () => {
    expect(tr('gum.hero.episodeLine', { n: 3 })).toBe('Episode 3');
    const source = readFileSync(join(__dirname, '..', 'components', 'media', 'gum', 'GumHome.tsx'), 'utf8');
    expect(source).not.toContain("t('gum.hero.episodeLine', { episode })");
  });
});

function HomeHarness({ titles, onFind }: { titles: GumTitle[]; onFind?: (title: GumTitle, episode?: number) => void }) {
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
    onFindDownload: onFind,
    onAddFiles: () => undefined,
    onAddFolder: () => undefined,
    onImport: () => undefined,
  });
}

describe('Continue watching includes tracked shows', () => {
  const mal = () => buildGumTitles([tracked('mal:9', 'Mushishi Zoku Shou', { progress: 12, episodeCount: 26 })], []);

  it('lists a Watching title at 12/26 with no files, offering episode 13', () => {
    const [title] = mal();
    expect(trackedNextCards([title], new Set())).toEqual([{ title, episode: 13 }]);
  });

  it('shows it on Home with a "Find episode 13" action', async () => {
    const onFind = vi.fn();
    const titles = mal();
    await act(async () => root.render(createElement(HomeHarness, { titles, onFind })));
    const headings = [...host.querySelectorAll('.gum-section h2')].map((node) => node.textContent);
    expect(headings).toContain('Continue watching');
    const action = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Find episode 13');
    expect(action).toBeTruthy();
    await act(async () => action?.click());
    expect(onFind).toHaveBeenCalledWith(titles[0], 13);
  });
});

describe('Customise', () => {
  function HarnessWithFiles() {
    const titles = useMemo(() => buildGumTitles(
      [tracked('mal:1', 'Frieren', { progress: 1, episodeCount: 28, mediaItemIds: ['fr-1', 'fr-2'], onDisk: true }), tracked('mal:3', 'Kimi ni Todoke', { status: 'plan' })],
      [ep('fr', 1, { positionSec: 1400 }), ep('fr', 2)],
    ), []);
    return createElement(HomeHarness, { titles });
  }

  it('collapses every section to its bar while customising', async () => {
    await act(async () => root.render(createElement(HarnessWithFiles)));
    expect(host.querySelectorAll('.gum-section__body').length).toBeGreaterThan(0);
    const customise = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Customise') as HTMLButtonElement;
    await act(async () => customise.click());
    expect(host.querySelectorAll('.gum-section__body')).toHaveLength(0);
    expect(host.querySelectorAll('.gum-section__editbar').length).toBeGreaterThan(3);
  });

  it('announces the section that moved, not the neighbour it displaced', async () => {
    await act(async () => root.render(createElement(HarnessWithFiles)));
    const customise = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Customise') as HTMLButtonElement;
    await act(async () => customise.click());
    const down = host.querySelector('button[aria-label="Move Continue watching down"]') as HTMLButtonElement;
    await act(async () => down.click());
    const live = [...host.querySelectorAll('[role="status"]')].map((node) => node.textContent).join(' ');
    expect(live).toContain('Continue watching: position 2');
  });
});

// ---------------------------------------------------------------------------
// Library pieces
// ---------------------------------------------------------------------------

describe('filter chips name their field', () => {
  const resolve = (chip: ReturnType<typeof activeFilterChips>[number]): string => {
    const value = chip.key ? tr(chip.key, chip.vars) : chip.label ?? '';
    return chip.field ? tr(chip.field, { value }) : value;
  };

  it('reads "Episodes: 14–26" and "Watch progress: In progress"', () => {
    const labels = activeFilterChips({ episodes: ['season'], watch: ['progress'], genres: ['Drama'] }).map(resolve);
    expect(labels).toContain('Episodes: 14–26');
    expect(labels).toContain('Watch progress: In progress');
    expect(labels).toContain('Genre: Drama');
  });

  it('prints years as years, not grouped numbers', () => {
    const [chip] = activeFilterChips({ yearMin: 2010, yearMax: 2019 });
    expect(resolve(chip)).toBe('Years 2010–2019');
  });

  it('gives the two "Watched" groups distinct names', () => {
    expect(GUM_LIBRARY_EN['gum.filter.watchState']).not.toBe(GUM_LIBRARY_EN['gum.filter.watched']);
  });
});

describe('one rating scale', () => {
  it('prints a MAL score and a Letterboxd rating on the same scale', () => {
    // Mushishi: MAL 10. Spirited Away: Letterboxd 5 stars, stored as score 10.
    expect(formatScore({ score: 10 }, 'ten', 'en')).toBe('★ 10');
    expect(formatScore({ score: 10, stars: 5 }, 'ten', 'en')).toBe('★ 10');
    expect(formatScore({ score: 10 }, 'stars')).toBe('★★★★★');
    expect(formatScore({ score: 9, stars: 4.5 }, 'stars')).toBe('★★★★½');
    expect(formatScore({}, 'ten')).toBe('');
  });
});

describe('the typographic poster', () => {
  it('sizes the type so the longest word fits one line', () => {
    // 11.5cqw would split "Bakemonogatari" (14 letters) across two lines.
    expect(typoFontSize('Bakemonogatari') * 14 * 0.64).toBeLessThanOrEqual(80);
    expect(typoFontSize('Spirited Away')).toBe(11.5);
    expect(typoFontSize('Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen')).toBeLessThan(9);
  });

  it('falls back to a monogram for a thumbnail', () => {
    expect(monogram('Spirited Away')).toBe('SA');
    expect(monogram('Bakemonogatari')).toBe('B');
    expect(monogram('ゆるキャン△')).toBe('ゆ');
  });

  it('keeps the rule in the flow, under the badge no more', () => {
    const css = readFileSync(join(__dirname, '..', 'components', 'media', 'gum', 'gum.css'), 'utf8').replace(/\r/g, '');
    const rule = css.match(/\.gum-typo__rule \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).not.toMatch(/position:\s*absolute/);
    const title = css.match(/\.gum-typo__title \{([^}]*)\}/)?.[1] ?? '';
    expect(title).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe('popover placement', () => {
  const bound = { left: 0, top: 0, right: 1266, bottom: 683 };

  it('clamps a panel that would run off the right edge', () => {
    const place = placePopover({ left: 1000, right: 1150, top: 300, bottom: 334 }, bound, { width: 420, height: 200 }, 'start');
    expect(place.left + 420).toBeLessThanOrEqual(bound.right - 8);
  });

  it('flips above when there is more room there, and caps the height to the room', () => {
    const place = placePopover({ left: 100, right: 250, top: 560, bottom: 594 }, bound, { width: 300, height: 900 }, 'start');
    expect(place.placement).toBe('above');
    expect(place.maxHeight).toBeLessThanOrEqual(560 - 16);
    expect(place.top).toBeGreaterThanOrEqual(bound.top);
  });

  it('keeps a menu below its trigger when it fits', () => {
    const place = placePopover({ left: 900, right: 1100, top: 120, bottom: 154 }, bound, { width: 220, height: 380 }, 'end');
    expect(place.placement).toBe('below');
    expect(place.left).toBe(1100 - 220);
  });
});

describe('the top bar fit', () => {
  it('folds destinations from the end, then folds the search to an icon', () => {
    const widths = [70, 80, 110, 90];
    expect(fitNavCount(widths, 80, 1000)).toBe(4);
    expect(fitNavCount(widths, 80, 250)).toBe(2);
    // Room for everything beside the field.
    expect(chooseTopNavFit(widths, 80, 600, 760)).toEqual({ visible: 4, searchCollapsed: false });
    // Room for two beside the field: search keeps its field.
    expect(chooseTopNavFit(widths, 80, 250, 410)).toEqual({ visible: 2, searchCollapsed: false });
    // Not even Home and Library beside the field: the field folds to an icon.
    expect(chooseTopNavFit(widths, 80, 120, 282)).toEqual({ visible: 2, searchCollapsed: true });
  });
});

describe('the library header', () => {
  it('lets only the results flex, so the control rows cannot be squeezed', () => {
    const css = readFileSync(join(__dirname, '..', 'components', 'media', 'gum', 'gum.css'), 'utf8').replace(/\r/g, '');
    expect(css).toMatch(/\.gum-library > \* \{\s*flex-shrink: 0;/);
    expect(css).toMatch(/\.gum-library > \.gum-library__results \{[^}]*flex: 1 1 auto;/);
    // The watch-history list no longer shares the top bar's history class.
    expect(css).not.toMatch(/\n\.gum-history \{\n {2}display: flex;\n {2}flex-direction: column;/);
  });
});

// ---------------------------------------------------------------------------
// Import, title page, covers
// ---------------------------------------------------------------------------

describe('the import drop zone claims its drop', () => {
  it('stops the desktop file-drop router from seeing a drop on the zone', async () => {
    const getFilePath = vi.fn(() => 'D:/animelist.xml.gz');
    const watchImportFile = vi.fn(async () => ({ ok: false, errorKey: 'x' }));
    (window as unknown as { api: Record<string, unknown> }).api = { getFilePath, watchImportFile, mediaArtwork: vi.fn(async () => null) };
    await act(async () => root.render(createElement(GumImport, { titles: [], onBack: () => undefined, backLabel: 'Back', onOpenSettings: () => undefined })));
    const router = vi.fn();
    window.addEventListener('drop', router);
    window.addEventListener('dragenter', router);
    try {
      const zone = host.querySelector('.gum-drop') as HTMLElement;
      const file = new File(['x'], 'animelist.xml.gz');
      for (const type of ['dragenter', 'drop']) {
        const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
        Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'], dropEffect: 'none' } });
        await act(async () => { zone.dispatchEvent(event); });
      }
      expect(router).not.toHaveBeenCalled();
      expect(getFilePath).toHaveBeenCalled();
    } finally {
      window.removeEventListener('drop', router);
      window.removeEventListener('dragenter', router);
    }
  });
});

describe('the title page', () => {
  function render(title: GumTitle) {
    return createElement(GumTitlePage, {
      title,
      onBack: () => undefined,
      backLabel: 'Library',
      onPlayItem: () => undefined,
      resumeAt: () => undefined,
      onFindDownload: vi.fn(),
      onOpenSubtitleSettings: () => undefined,
      onOpenApiKeys: () => undefined,
      fileTools: { currentId: null },
    });
  }

  it('offers one "Find missing episodes" and a small icon per missing row', async () => {
    const files = [ep('ms', 1)];
    const [title] = buildGumTitles([tracked('mal:2', 'Mushishi', { progress: 0, episodeCount: 5, mediaItemIds: ['ms-1'], onDisk: true })], files);
    await act(async () => root.render(render(title)));
    const bigFind = [...host.querySelectorAll('button')].filter((node) => node.textContent?.includes('Find missing episodes'));
    expect(bigFind).toHaveLength(1);
    const rowFinds = host.querySelectorAll('.gum-episode__find');
    expect(rowFinds).toHaveLength(4);
    expect(rowFinds[0].getAttribute('aria-label')).toBe('Find episode 2');
    expect(rowFinds[0].textContent?.trim()).toBe('');
  });

  it('renders Details natively, without the old drawer', async () => {
    const files = [ep('ms', 1, { studio: 'Artland', nativeTitle: '蟲師' })];
    const [title] = buildGumTitles([tracked('mal:2', 'Mushishi', { status: 'completed', malId: 457, altTitles: ['Mushi-Shi'], mediaItemIds: ['ms-1'], onDisk: true })], files);
    await act(async () => root.render(render(title)));
    const details = [...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === 'Details') as HTMLButtonElement;
    await act(async () => details.click());
    expect(host.querySelector('.medialib-drawer')).toBeNull();
    const text = host.querySelector('#gum-title-panel')?.textContent ?? '';
    expect(text).toContain('Artland');
    expect(text).toContain('Mushi-Shi');
    expect(text).toContain('MyAnimeList (457)');
    expect(text).toContain('D:/ms/1.mkv');
  });

  it('keeps the watch-history list off the top bar\u2019s class', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'media', 'gum', 'GumTitlePage.tsx'), 'utf8');
    expect(source).toContain('className="gum-watch-history"');
    expect(source).not.toContain('className="gum-history"');
    expect(source).not.toContain('MediaDetailPanel');
  });
});

describe('covers after an import', () => {
  it('drops a cached "no art" and re-asks when the watch library changes', async () => {
    let changed: (() => void) | null = null;
    const watchArtwork = vi.fn(async () => null as string | null);
    (window as unknown as { api: Record<string, unknown> }).api = {
      watchArtwork,
      onWatchChanged: (cb: () => void) => { changed = cb; return () => undefined; },
    };
    invalidateTitleArt();
    const [title] = buildGumTitles([tracked('mal:5', 'Ergo Proxy', { status: 'plan' })], []);
    let seen: string | null = 'unset';
    function Probe() {
      seen = useTitleArtUrl(title);
      return null;
    }
    await act(async () => root.render(createElement(Probe)));
    expect(watchArtwork).toHaveBeenCalledTimes(1);
    expect(seen).toBeNull();
    watchArtwork.mockResolvedValueOnce('https://cdn.myanimelist.net/images/anime/1/ergo.jpg');
    await act(async () => { changed?.(); });
    expect(watchArtwork).toHaveBeenCalledTimes(2);
    expect(seen).toBe('https://cdn.myanimelist.net/images/anime/1/ergo.jpg');
  });
});

describe('open in an external player', () => {
  const openMenu = async (label: string): Promise<void> => {
    const summary = host.querySelector(`summary[aria-label="${label}"]`) as HTMLElement;
    expect(summary).toBeTruthy();
    await act(async () => {
      const details = summary.parentElement as HTMLDetailsElement;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
  };
  const page = (onSetUp = vi.fn()) => {
    const files = [ep('ms', 1, {
      positionSec: 300,
      preferredSubtitleId: 'sub-ja',
      subtitles: [{ id: 'sub-ja', lang: 'ja', source: 'sidecar', format: 'srt', path: 'D:/ms/1.ja.srt', external: true }] as never,
    }), ep('ms', 2)];
    const [title] = buildGumTitles([tracked('mal:2', 'Mushishi', { progress: 0, episodeCount: 2, mediaItemIds: ['ms-1', 'ms-2'], onDisk: true })], files);
    return createElement(GumTitlePage, {
      title,
      onBack: () => undefined,
      backLabel: 'Library',
      onPlayItem: () => undefined,
      resumeAt: () => 290,
      onFindDownload: () => undefined,
      onOpenSubtitleSettings: () => undefined,
      onOpenApiKeys: () => undefined,
      fileTools: { currentId: null },
      onOpenExternalPlayerSettings: onSetUp,
    });
  };

  it('hands over the path, the resume point, the chosen subtitle and the episode', () => {
    const handoff = gumHandoff(ep('ms', 3, {
      preferredSubtitleId: 'a',
      subtitles: [{ id: 'a', lang: 'ja', path: 'D:/ms/3.ja.ass' }] as never,
    }), 412.4);
    expect(handoff).toMatchObject({ mediaPath: 'D:/ms/3.mkv', resumePositionSec: 412, subtitlePath: 'D:/ms/3.ja.ass', episodeNumber: 3 });
    // A cached track is a path under the app's own storage, which no other program can open.
    expect(gumHandoff(ep('ms', 4, { subtitles: [{ id: 'b', lang: 'ja', path: 'subtitles/4.srt' }] as never })).subtitlePath).toBeNull();
  });

  it('offers only the way to set one up when none is configured', async () => {
    const onSetUp = vi.fn();
    await act(async () => root.render(page(onSetUp)));
    await openMenu('More ways to play');
    const buttons = [...host.querySelectorAll('.gum-menu button')].map((node) => node.textContent?.trim());
    expect(buttons.some((text) => text?.startsWith('Open in'))).toBe(false);
    const setUp = [...host.querySelectorAll('.gum-menu button')].find((node) => node.textContent?.trim() === 'Set up an external player…') as HTMLButtonElement;
    await act(async () => setUp.click());
    expect(onSetUp).toHaveBeenCalled();
  });

  it('opens the resumed episode in the default player through media:handoff', async () => {
    localStorage.setItem(EXTERNAL_PLAYER_STORAGE_KEY, JSON.stringify({
      profiles: [{ id: 'mpv', name: 'mpv', executablePath: 'C:/mpv/mpv.exe', os: 'windows', contentType: 'video', arguments: ['{media}'], supportsSubtitles: true, supportsResume: true }],
      defaultProfileId: 'mpv',
    }));
    const handoffMedia = vi.fn(async () => null);
    (window as unknown as { api: Record<string, unknown> }).api = { mediaArtwork: vi.fn(async () => null), handoffMedia };
    await act(async () => root.render(page()));
    await openMenu('More ways to play');
    const open = [...host.querySelectorAll('.gum-menu button')].find((node) => node.textContent?.trim() === 'Open in mpv') as HTMLButtonElement;
    expect(open).toBeTruthy();
    await act(async () => open.click());
    expect(handoffMedia).toHaveBeenCalledTimes(1);
    const [handoff, profile] = handoffMedia.mock.calls[0] as unknown as [Record<string, unknown>, { id: string }];
    expect(profile.id).toBe('mpv');
    expect(handoff).toMatchObject({ mediaPath: 'D:/ms/1.mkv', resumePositionSec: 290, subtitlePath: 'D:/ms/1.ja.srt', episodeNumber: 1 });
    // Every episode row has the same menu.
    expect(host.querySelector('summary[aria-label="More for episode 2"]')).toBeTruthy();
  });
});
