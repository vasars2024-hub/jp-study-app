// @vitest-environment jsdom
//
// The harvest panel's nyaa path, driven through the real component.
//
// The honesty properties here are the ones no unit test of the handlers can
// reach, because they are decisions the panel makes about the reply:
//
//   listing never starts a transfer — the fetch is a second, separate click;
//   a release whose episodes miss the requested range STOPS and says which
//     episodes it holds, rather than studying whatever it happened to contain;
//   the count it reports is the count it used, against the count it received.
//
// That middle one is the failure mode this whole plan is written against: a run
// that quietly substitutes different episodes produces a frequency table for a
// show the user did not ask about, and nothing downstream can tell.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Keys, not English: what matters here is which string the panel chose, and a
// catalog reword must not turn into a red suite in a different track.
vi.mock('../i18n', () => ({
  useT: () => ({
    lang: 'en',
    t: (key: string, vars?: Record<string, string | number>) =>
      (vars ? `${key}:${Object.values(vars).join(',')}` : key),
  }),
}));
// `acquisitionConfigFrom` reads indexers from `sources.entries`, not
// `torrents.indexers` — the latter does not exist, and a probe that assumes it
// gets an unhandled TypeError before the panel ever renders its offer.
vi.mock('../scraperSettingsStore', () => ({
  getActiveScraperSettings: () => ({ sources: { entries: [] }, torrents: {}, qbittorrent: {} }),
}));
vi.mock('../components/ui/Toast', () => ({ showToast: () => undefined }));
vi.mock('../knownWords', () => ({ getLevel: () => 0 }));
vi.mock('../mediaStudyWorkflow', () => ({
  // The analysis itself has its own suites and needs a tokenizer; what this
  // file asserts is everything up to and around it.
  SEASON_STUDY_LIMITS: {},
  addMediaStudyFlashcards: () => 0,
  analyzeMediaStudyCues: async () => ({
    text: 'x', vocabulary: [], kanji: [], grammar: [],
    comprehensibility: { uniqueKnown: 0, uniqueTotal: 0 },
  }),
  mineableVocabulary: () => [],
}));

import SubtitleHarvestPanel from '../components/discover/SubtitleHarvestPanel';

const nyaaList = vi.fn();
const nyaaFetch = vi.fn();
const harvestList = vi.fn();

let host: HTMLDivElement;
let root: Root;

/** The offer, and therefore the button, only render when Jimaku filed nothing. */
function jimakuEmpty(nyaa: unknown) {
  return {
    ok: true, needsKey: false, files: [], message: '',
    matchedBy: null, entry: null, idLookupDown: false, nyaa,
  };
}

function candidate(id = 'nyaa:aaa') {
  return {
    id, releaseName: '[Group] Show Subs', route: 'sub-pack' as const,
    sizeBytes: 36_175_872, seeders: 4, languages: ['ja'], score: 90, reasons: ['sub-pack'],
  };
}

function srt(text: string): string {
  return `1\n00:00:01,000 --> 00:00:02,000\n${text}\n`;
}

beforeEach(() => {
  nyaaList.mockReset();
  nyaaFetch.mockReset();
  harvestList.mockReset();
  harvestList.mockResolvedValue(jimakuEmpty({ available: true, reason: null, detail: '' }));
  (window as unknown as { api: unknown }).api = {
    subtitleHarvestList: harvestList,
    subtitleHarvestFetch: vi.fn(),
    subtitleHarvestNyaaList: nyaaList,
    subtitleHarvestNyaaFetch: nyaaFetch,
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

/** Every button on screen, by its rendered label. */
function button(label: string): HTMLButtonElement | null {
  return [...host.querySelectorAll('button')]
    .find((element) => (element.textContent ?? '').includes(label)) as HTMLButtonElement ?? null;
}

async function click(label: string): Promise<void> {
  const target = button(label);
  if (!target) throw new Error(`no button matching ${label}; saw ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  await act(async () => { target.click(); });
}

async function mount(episodes: number[], altTitles?: string[]): Promise<void> {
  await act(async () => {
    root.render(
      <SubtitleHarvestPanel
        anilistId={null}
        malId={1352}
        title="Cyber City Oedo 808"
        altTitles={altTitles}
        episodes={episodes}
        sourceId="mal:1352"
      />,
    );
  });
  await click('subHarvest.action.find');
}

describe('SubtitleHarvestPanel — the nyaa fallback', () => {
  it('lists without fetching: the search button starts no transfer', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    await mount([1]);
    expect(host.textContent).toContain('subHarvest.nyaa.offered');

    await click('subHarvest.nyaa.search');

    expect(nyaaList).toHaveBeenCalledTimes(1);
    expect(nyaaList.mock.calls[0][0]).toMatchObject({ title: 'Cyber City Oedo 808' });
    expect(host.textContent).toContain('[Group] Show Subs');
    // The control this test exists for. A listing that acquired would put a
    // torrent into the user's client for a release they had not chosen.
    expect(nyaaFetch).not.toHaveBeenCalled();
    // Size and swarm health are on screen before the click that costs something.
    expect(host.textContent).toContain('subHarvest.nyaa.meta:35,4');
  });

  // Measured live 2026-08-17: MAL 2596 is filed `Shinreigari` and nyaa has the
  // show only as `Ghost Hound` — the primary title alone returned 0 candidates
  // for a release with 4 seeders sitting on the index. The panel therefore has
  // to hand the aliases down; a handler that can walk them is no use if the one
  // surface that has the other names keeps them.
  it('hands the catalogue’s other names down to the index search', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '', searchedAs: null });
    await mount([1], ['Ghost Hound', '心霊狩り']);

    await click('subHarvest.nyaa.search');

    expect(nyaaList.mock.calls[0][0]).toMatchObject({
      title: 'Cyber City Oedo 808',
      titles: ['Ghost Hound', '心霊狩り'],
    });
  });

  it('says which name found the releases, when it is not the one on screen', async () => {
    nyaaList.mockResolvedValue({
      ok: true, candidates: [candidate()], message: '', searchedAs: 'Ghost Hound',
    });
    await mount([1], ['Ghost Hound']);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).toContain('subHarvest.nyaa.searchedAs:Ghost Hound');
  });

  it('stays quiet about the name when the title itself found them', async () => {
    // The negative control: a line that always appears cannot tell the user
    // that this particular list came from somewhere other than the heading.
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '', searchedAs: null });
    await mount([1], ['Ghost Hound']);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).not.toContain('subHarvest.nyaa.searchedAs');
  });

  it('refuses a release whose episodes miss the range, and names what it holds', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    nyaaFetch.mockResolvedValue({
      ok: true,
      message: '',
      files: [
        { episode: 1, text: srt('いち'), format: 'srt', fileName: '01.srt' },
        { episode: 2, text: srt('に'), format: 'srt', fileName: '02.srt' },
      ],
    });
    // The user asked for 100–101; the release carries 1–2.
    await mount([100, 101]);
    await click('subHarvest.nyaa.search');
    await click('subHarvest.nyaa.take');

    expect(host.textContent).toContain('subHarvest.nyaa.outOfRange:1–2');
    // Nothing was studied, and the panel does not claim otherwise.
    expect(host.textContent).not.toContain('subHarvest.nyaa.took');
  });

  it('studies the overlap and reports both numbers', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    nyaaFetch.mockResolvedValue({
      ok: true,
      message: '',
      files: [
        { episode: 1, text: srt('いち'), format: 'srt', fileName: '01.srt' },
        { episode: 2, text: srt('に'), format: 'srt', fileName: '02.srt' },
        { episode: 3, text: srt('さん'), format: 'srt', fileName: '03.srt' },
      ],
    });
    await mount([1, 2]);
    await click('subHarvest.nyaa.search');
    await click('subHarvest.nyaa.take');

    // 2 used of 3 received — the release carried more than was asked for, and
    // the panel states both rather than rounding the surprise away.
    expect(host.textContent).toContain('subHarvest.nyaa.took:2,3');
  });

  it('shows the provider’s own refusal instead of an empty success', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    nyaaFetch.mockResolvedValue({
      ok: false,
      files: [],
      message: 'This release only has image-based subtitles, which cannot be read as text.',
    });
    await mount([1]);
    await click('subHarvest.nyaa.search');
    await click('subHarvest.nyaa.take');

    expect(host.textContent).toContain('image-based subtitles');
    expect(host.textContent).not.toContain('subHarvest.nyaa.took');
  });

  it('offers no search button when the fallback cannot run, and says why', async () => {
    harvestList.mockResolvedValue(jimakuEmpty({
      available: false, reason: 'no-indexer', detail: 'No torrent index is enabled in this profile.',
    }));
    await mount([1]);

    expect(host.textContent).toContain('subHarvest.nyaa.unavailable:No torrent index is enabled in this profile.');
    // A button that would report a misconfiguration only after starting a
    // transfer is worse than no button.
    expect(button('subHarvest.nyaa.search')).toBeNull();
  });
});
