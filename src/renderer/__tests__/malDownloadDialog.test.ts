// @vitest-environment jsdom
//
// The download dialog through the real DOM, not through its props.
//
// The selection maths is already covered as pure functions in
// `shared/__tests__/malDownload.test.ts`; what these tests add is the part that
// only exists once it is wired: that the right IPC is called with the right
// payload, that the amount controls move the resolved count, and — the ones
// worth having — that the failure paths reach a state the user can act on
// instead of a spinner that never ends.
//
// `createElement` rather than JSX because `vitest.config.ts` only collects
// `*.test.ts`, and that config is out of scope to edit.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCandidate } from '../../shared/mediaDiscovery';
import type { MalUnitsResult } from '../../shared/malDownload';
import MalDownloadDialog from '../components/discover/MalDownloadDialog';

// React only treats `act` as authoritative when the environment declares itself
// one; without this it warns on every update and batches differently.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../views/MangaReader', () => ({ default: () => null }));

vi.mock('../scraperSettingsStore', () => ({
  getActiveScraperSettings: () => ({
    sources: {
      entries: [{ id: 'nyaa', kind: 'torrent', enabled: true }],
      perSourceTimeoutMs: 8_000,
    },
    torrents: { indexerIds: [], minSeeders: 1, resolutionPriority: [1080] },
    qbittorrent: { enabled: false, host: '', savePath: '' },
  }),
}));

function animeUnits(count: number, patch: Partial<MalUnitsResult> = {}): MalUnitsResult {
  return {
    target: {
      contentType: 'anime',
      provider: 'jikan',
      id: 52_991,
      title: 'Frieren',
      nativeTitle: '葬送のフリーレン',
      romajiTitle: 'Sousou no Frieren',
      posterUrl: '',
      totalUnits: count,
    },
    units: Array.from({ length: count }, (_, index) => ({
      key: `ep-${index + 1}`,
      ordinal: index,
      number: index + 1,
      label: `EP 0${index + 1}`,
      title: `Episode ${index + 1}`,
      nativeTitle: '',
      airDate: null,
      filler: false,
      recap: false,
      source: null,
    })),
    servedBy: 'MyAnimeList (Jikan)',
    note: '',
    ...patch,
  };
}

const anime: DiscoveryCandidate = {
  provider: 'jikan',
  id: 52_991,
  mediaType: 'anime',
  title: 'Frieren',
  genres: [],
};

const manga: DiscoveryCandidate = {
  provider: 'anilist',
  id: 30_002,
  mediaType: 'manga',
  title: 'Berserk',
  genres: [],
};

let host: HTMLDivElement;
let root: Root;

type ApiStub = Record<string, ReturnType<typeof vi.fn>>;

function api(): ApiStub {
  return (window as unknown as { api: ApiStub }).api;
}

/** Everything the dialog reaches for. Individual tests override what they exercise. */
function stubApi(overrides: Record<string, unknown> = {}): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    scraperMalUnits: vi.fn(async () => animeUnits(3)),
    readingMangaProviders: vi.fn(async () => ({
      state: 'ready',
      data: [{ id: 'mangadex', name: 'MangaDex', lang: 'en' }],
    })),
    readingMangaChapters: vi.fn(async () => ({
      state: 'ready',
      data: [
        { chapterId: 'c1', editionId: 'e', volumeId: null, number: '1', title: 'Black Swordsman', index: 0, scanlator: '', language: 'en' },
        { chapterId: 'c2', editionId: 'e', volumeId: null, number: '2', title: 'Brand', index: 1, scanlator: '', language: 'en' },
      ],
    })),
    readingMangaDownloadChapter: vi.fn(async () => ({
      state: 'ready',
      data: { item: { id: 'lib-1' }, pageCount: 20, alreadyPresent: false },
    })),
    listLibrary: vi.fn(async () => []),
    scraperSearchTorrents: vi.fn(async () => []),
    scraperGetAcquisitionSnapshot: vi.fn(async () => null),
    scraperRunAcquisitionAction: vi.fn(async () => ({
      ok: true, message: 'sent', accepted: 1, simulation: [],
    })),
    ...overrides,
  };
}

async function open(candidate: DiscoveryCandidate, onClose = () => undefined): Promise<void> {
  await act(async () => {
    root.render(createElement(MalDownloadDialog, { candidate, onClose }));
  });
}

/** The dialog portals into document.body, so queries run against the document. */
function text(): string {
  return document.body.textContent ?? '';
}

function rows(): HTMLLIElement[] {
  return [...document.querySelectorAll<HTMLLIElement>('.mal-dl-units > li')];
}

/** A query that fails the test with a readable reason rather than a null deref. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be present`);
  return value;
}

function focusableIn(selector = 'button, input, select, textarea'): HTMLElement[] {
  const dialog = must(document.querySelector('.mal-dl'), 'the dialog');
  return [...dialog.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => !element.hasAttribute('disabled'));
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')]
    .find((element) => (element.textContent ?? '').includes(label));
  if (!match) throw new Error(`No button matching "${label}"`);
  return match as HTMLButtonElement;
}

/**
 * Type into a controlled input the way React will actually notice.
 *
 * Assigning `input.value` directly updates the DOM node but leaves React's own
 * value tracker holding the old string, so the synthetic change event is
 * suppressed as a no-op and the component never re-renders. Going through the
 * prototype's native setter is what keeps the two in step.
 */
async function setValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stubApi();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('MalDownloadDialog — anime', () => {
  it('lists the episodes the catalogue returned for the clicked entry', async () => {
    await open(anime);
    expect(rows()).toHaveLength(3);
    expect(text()).toContain('Episode 1');
    expect(text()).toContain('3 episodes selected');
  });

  it('asks the backend for that entry by id, not by its title', async () => {
    await open(anime);
    expect(api().scraperMalUnits).toHaveBeenCalledWith({
      contentType: 'anime',
      provider: 'jikan',
      id: 52_991,
    });
  });

  it('narrows to the newest units when the amount is Latest', async () => {
    await open(anime);
    await act(async () => button('Latest').click());
    const howMany = must(
      document.querySelector<HTMLInputElement>('.mal-dl-controls input[type="number"]'),
      'the "how many" input',
    );
    await setValue(howMany, '2');
    expect(text()).toContain('2 episodes selected');
  });

  it('resolves an inclusive range', async () => {
    await open(anime);
    await act(async () => button('Range').click());
    const bounds = [...document.querySelectorAll<HTMLInputElement>('.mal-dl-range input')];
    await setValue(bounds[0], '2');
    await setValue(bounds[1], '3');
    expect(text()).toContain('2 episodes selected');
  });

  // The carry is the whole point: unticking one episode of "everything" must
  // not throw away the rest of the selection.
  it('keeps the rest of the selection when one row is unticked', async () => {
    await open(anime);
    const firstRow = must(rows()[0].querySelector('input'), 'the first row checkbox');
    await act(async () => firstRow.click());
    expect(text()).toContain('2 episodes selected');
    expect(rows()[1].className).toContain('is-picked');
  });

  it('says so when the catalogue publishes no episode list', async () => {
    stubApi({
      scraperMalUnits: vi.fn(async () => ({ ...animeUnits(0), note: 'no-episode-list', units: [] })),
    });
    await open(anime);
    expect(text()).toContain('publishes no episode list');
  });

  // The failure this guards: optional chaining short-circuits a missing bridge
  // method, so the dialog used to sit on its spinner for ever.
  it('reports an absent backend instead of spinning', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {};
    await open(anime);
    expect(text()).toContain('Could not list anything to download');
    expect(text()).not.toContain('Reading what this entry contains');
  });

  it('surfaces a catalogue failure with its reason', async () => {
    stubApi({
      scraperMalUnits: vi.fn(async () => {
        throw new Error('Jikan answered 504.');
      }),
    });
    await open(anime);
    expect(text()).toContain('Jikan answered 504.');
  });

  it('says how many releases the index returned when none of them matched', async () => {
    stubApi({
      scraperSearchTorrents: vi.fn(async () => [{
        id: 't1',
        // Carries no episode number at all, so nothing in the selection matches
        // it — the case where the query named the wrong show.
        name: '[G] Some Other Show [1080p]',
        magnet: 'magnet:?xt=urn:btih:aaa',
        infoHash: 'aaa',
        sizeBytes: 1,
        seeders: 5,
        leechers: 0,
        resolution: '1080p',
        releaseGroup: 'G',
        isBatch: false,
        tracker: 'nyaa',
        subtitleLanguages: [],
      }]),
    });
    await open(anime);
    await act(async () => button('Find releases').click());
    expect(text()).toContain('1 release found');
    expect(text()).toContain('0 of 3 covered');
    expect(text()).toContain('No release matched');
  });

  it('searches the index by the romaji title the catalogue supplied', async () => {
    await open(anime);
    await act(async () => button('Find releases').click());
    expect(api().scraperSearchTorrents.mock.calls[0][0]).toMatchObject({
      query: { text: 'Sousou no Frieren' },
    });
  });

  // The catalogue's title and the one release groups use are routinely
  // different; retyping the query is the fix, so it has to reach the index.
  it('searches by the edited query instead of the catalogue title', async () => {
    await open(anime);
    const field = must(
      document.querySelector<HTMLInputElement>('.mal-dl-query input'),
      'the release query field',
    );
    await setValue(field, 'Frieren Beyond');
    await act(async () => button('Find releases').click());
    expect(api().scraperSearchTorrents.mock.calls[0][0]).toMatchObject({
      query: { text: 'Frieren Beyond' },
    });
  });

  // Losing the send targets is a survivable degradation; losing the search the
  // user just paid for is not.
  it('keeps the plan when the acquisition snapshot cannot be read', async () => {
    stubApi({
      scraperSearchTorrents: vi.fn(async () => [{
        id: 't1',
        name: '[G] Frieren - 01 [1080p]',
        magnet: 'magnet:?xt=urn:btih:aaa',
        infoHash: 'aaa',
        sizeBytes: 1,
        seeders: 5,
        leechers: 0,
        resolution: '1080p',
        releaseGroup: 'G',
        isBatch: false,
        tracker: 'nyaa',
        subtitleLanguages: [],
      }]),
      scraperGetAcquisitionSnapshot: vi.fn(async () => {
        throw new Error('sidecar offline');
      }),
    });
    await open(anime);
    await act(async () => button('Find releases').click());
    expect(text()).toContain('1 of 3 covered');
    expect(text()).toContain('No torrent client is reachable');
    expect(text()).not.toContain('sidecar offline');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    await open(anime, onClose);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus into the dialog on open', async () => {
    await open(anime);
    expect(document.activeElement?.classList.contains('mal-dl')).toBe(true);
  });

  // `aria-modal` makes the rest of the page inert to a screen reader but does
  // nothing to Tab, which would otherwise walk out into the catalogue behind.
  it('wraps Tab from the last control back to the first', async () => {
    await open(anime);
    const focusable = focusableIn();
    const [first] = focusable;
    const last = focusable[focusable.length - 1];
    await act(async () => {
      last.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first control back to the last', async () => {
    await open(anime);
    const focusable = focusableIn();
    const last = focusable[focusable.length - 1];
    await act(async () => {
      focusable[0].focus();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(last);
  });

  it('returns focus to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    await open(anime);
    expect(document.activeElement).not.toBe(opener);
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(opener);
  });
});

describe('MalDownloadDialog — manga', () => {
  it('lists chapters from the installed provider', async () => {
    await open(manga);
    expect(rows()).toHaveLength(2);
    expect(text()).toContain('Black Swordsman');
    expect(text()).toContain('2 chapters selected');
  });

  it('downloads one chapter per selected unit', async () => {
    await open(manga);
    await act(async () => button('Download 2 chapters').click());
    expect(api().readingMangaDownloadChapter).toHaveBeenCalledTimes(2);
    expect(api().readingMangaDownloadChapter.mock.calls[0][0]).toMatchObject({
      mediaId: 30_002,
      providerId: 'mangadex',
      chapterId: 'c1',
      chapterNumber: '1',
    });
  });

  // What makes a range safe to press twice.
  it('leaves out chapters already in the library', async () => {
    stubApi({
      listLibrary: vi.fn(async () => [{
        id: 'lib-1',
        readingSource: {
          kind: 'seanime-manga-chapter',
          mediaId: 30_002,
          providerId: 'mangadex',
          chapterId: 'c1',
        },
      }]),
    });
    await open(manga);
    expect(text()).toContain('In library');
    expect(text()).toContain('1 chapter selected');
    await act(async () => button('Download 1 chapter').click());
    expect(api().readingMangaDownloadChapter).toHaveBeenCalledTimes(1);
    expect(api().readingMangaDownloadChapter.mock.calls[0][0]).toMatchObject({ chapterId: 'c2' });
  });

  // The regression this pins: marking a chapter owned used to invalidate the
  // fetch that listed it, so a twenty-chapter batch re-listed the provider
  // twenty times while it ran.
  it('does not re-list the provider while a batch runs', async () => {
    await open(manga);
    expect(api().readingMangaChapters).toHaveBeenCalledTimes(1);
    await act(async () => button('Download 2 chapters').click());
    expect(api().readingMangaChapters).toHaveBeenCalledTimes(1);
  });

  it('marks what the batch just downloaded as held', async () => {
    await open(manga);
    expect(text()).not.toContain('In library');
    await act(async () => button('Download 2 chapters').click());
    expect(text()).toContain('In library');
    // And with everything held, the default filter leaves nothing to refetch.
    expect(text()).toContain('0 chapters selected');
  });

  it('reports a failed chapter without claiming the batch succeeded', async () => {
    stubApi({
      readingMangaDownloadChapter: vi.fn(async () => ({ state: 'error', message: 'CDN said 403.' })),
    });
    await open(manga);
    await act(async () => button('Download 2 chapters').click());
    expect(text()).toContain('2 failures');
    expect(text()).toContain('CDN said 403.');
  });

  // A long batch outlives the attention that started it, so the result has to
  // reach the user even if the dialog was closed in the meantime.
  it('announces a finished batch as a toast and a shell notification', async () => {
    const toasts: unknown[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);
    window.addEventListener('ui:toast', onToast);
    await open(manga);
    await act(async () => button('Download 2 chapters').click());
    window.removeEventListener('ui:toast', onToast);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ kind: 'success' });
    expect(JSON.stringify(toasts[0])).toContain('Berserk');
  });

  it('announces a wholly failed batch as an error, not a success', async () => {
    const toasts: { kind?: string }[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);
    window.addEventListener('ui:toast', onToast);
    stubApi({
      readingMangaDownloadChapter: vi.fn(async () => ({ state: 'error', message: 'CDN said 403.' })),
    });
    await open(manga);
    await act(async () => button('Download 2 chapters').click());
    window.removeEventListener('ui:toast', onToast);
    expect(toasts[0]?.kind).toBe('error');
  });

  it('offers the reader once a chapter has landed', async () => {
    await open(manga);
    expect(text()).not.toContain('Read now');
    await act(async () => button('Download 2 chapters').click());
    expect(text()).toContain('Read now');
  });

  // No chapter provider used to be a dead end. It falls through to the torrent
  // index instead, which is where raw Japanese volumes are published anyway.
  it('falls through to the release picker when no chapter provider is installed', async () => {
    stubApi({ readingMangaProviders: vi.fn(async () => ({ state: 'ready', data: [] })) });
    await open(manga);
    expect(text()).toContain('No chapter provider is installed');
    expect(text()).toContain('Search the torrent index');
    expect(button('Find releases')).toBeTruthy();
    // And it must not pretend a volume is a numbered chapter.
    expect(text()).toContain('whole volumes or complete series');
  });

  it('keeps the chapters shelf unavailable when nothing can serve it', async () => {
    stubApi({ readingMangaProviders: vi.fn(async () => ({ state: 'ready', data: [] })) });
    await open(manga);
    const chapters = [...document.querySelectorAll('.mal-dl-shelf button')]
      .find((b) => b.textContent?.trim() === 'Chapters') as HTMLButtonElement;
    expect(chapters.disabled).toBe(true);
  });

  // Found live: the built-in local-files provider answers HTTP 500 for an
  // online title, so the dialog errors — and the shelf switch used to live
  // inside the body that only renders on success, stranding the user in the
  // one state where they most need the way out.
  //
  // 2026-08-02: the dialog no longer waits to be rescued. A crash takes the
  // same fall-through the no-provider case takes, so the user lands on the
  // shelf that can actually answer, with the reason and the raw text kept.
  it('falls through to releases when the chapter provider crashes', async () => {
    stubApi({
      readingMangaChapters: vi.fn(async () => {
        throw new Error('/api/v1/manga/chapters -> HTTP 500');
      }),
    });
    await open(manga);
    expect(text()).toContain('The chapter provider failed for this title');
    // The transport text is kept: "the source broke" and "this title has no
    // chapters" are different answers.
    expect(text()).toContain('/api/v1/manga/chapters -> HTTP 500');
    expect(text()).toContain('Search the torrent index');

    const releases = [...document.querySelectorAll('.mal-dl-shelf button')]
      .find((b) => b.textContent?.trim() === 'Releases') as HTMLButtonElement;
    expect(releases).toBeTruthy();
    expect(releases.disabled).toBe(false);
    // And it must not have blamed the manga.
    expect(text()).not.toContain('Could not list anything to download');
  });

  it('searches the index and lets releases be picked directly', async () => {
    stubApi({
      readingMangaProviders: vi.fn(async () => ({ state: 'ready', data: [] })),
      scraperSearchTorrents: vi.fn(async () => [
        {
          id: 'r1',
          name: '[Group] Berserk v01-v41 (Raw)',
          magnet: 'magnet:?xt=urn:btih:bbb',
          infoHash: 'bbb',
          sizeBytes: 8_000_000_000,
          seeders: 42,
          leechers: 2,
          resolution: '',
          releaseGroup: 'Group',
          isBatch: true,
          tracker: 'nyaa',
          subtitleLanguages: [],
        },
      ]),
    });
    await open(manga);
    await act(async () => button('Find releases').click());
    expect(text()).toContain('Berserk v01-v41');
    expect(text()).toContain('42 seeders');
    // Nothing is selected until the user says so — a volume set is a big fetch.
    expect(text()).toContain('0 releases selected');
    const box = must(
      document.querySelector<HTMLInputElement>('.mal-dl-releases input[type="checkbox"]'),
      'a release checkbox',
    );
    await act(async () => box.click());
    expect(text()).toContain('1 release selected');
  });

  it('does not plan chapter coverage for releases', async () => {
    stubApi({
      readingMangaProviders: vi.fn(async () => ({ state: 'ready', data: [] })),
      scraperSearchTorrents: vi.fn(async () => [{
        id: 'r1',
        name: '[Group] Berserk v01 (Raw)',
        magnet: 'magnet:?xt=urn:btih:ccc',
        infoHash: 'ccc',
        sizeBytes: 1,
        seeders: 3,
        leechers: 0,
        resolution: '',
        releaseGroup: 'Group',
        isBatch: false,
        tracker: 'nyaa',
        subtitleLanguages: [],
      }],
      ),
    });
    await open(manga);
    await act(async () => button('Find releases').click());
    expect(text()).not.toContain('covered');
  });
});
