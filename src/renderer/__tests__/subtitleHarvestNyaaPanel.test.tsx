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
const listMedia = vi.fn();
const attachText = vi.fn();

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
  listMedia.mockReset();
  listMedia.mockResolvedValue([]);
  attachText.mockReset();
  harvestList.mockResolvedValue(jimakuEmpty({ available: true, reason: null, detail: '' }));
  (window as unknown as { api: unknown }).api = {
    subtitleHarvestList: harvestList,
    subtitleHarvestFetch: vi.fn(),
    subtitleHarvestNyaaList: nyaaList,
    subtitleHarvestNyaaFetch: nyaaFetch,
    // Read once a harvest has attachable files, for the attach picker. Empty
    // here on purpose: these tests are about the nyaa route, and an empty
    // library is the state where attaching is offered but has no target.
    listMedia: listMedia,
    attachSubtitleText: attachText,
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

  // This panel offered a 34 MB subtitle pack and a 7,782 MB video batch whose
  // subtitles are unconfirmed with nothing on screen to tell them apart — the
  // route was on the contract and never rendered. Measured across 4 titles, 10
  // batch candidates reached a subtitle verdict and none carried sidecars.
  it('names the route, and warns only when a batch is actually offered', async () => {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    await mount([1]);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).toContain('subHarvest.nyaa.route.sub-pack');
    // The negative control: a listing of packs alone must not warn about a
    // batch it is not offering.
    expect(host.textContent).not.toContain('subHarvest.nyaa.sidecarNote');
  });

  it('marks a video batch as unconfirmed and explains what picking it does', async () => {
    nyaaList.mockResolvedValue({
      ok: true,
      candidates: [{
        ...candidate('nyaa:batch'),
        releaseName: '[DeadFish] Ghost Hound - Batch [BD][1080p][MP4][AAC]',
        route: 'batch-sidecar' as const,
        sizeBytes: 8_160_437_862,
      }],
      message: '',
    });
    await mount([1]);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).toContain('subHarvest.nyaa.route.batch-sidecar');
    expect(host.textContent).toContain('subHarvest.nyaa.sidecarNote');
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
      available: false, reason: 'no-indexer', detail: 'Every torrent index in this profile is turned off.',
    }));
    await mount([1]);

    // The reason is TRANSLATED, not main's own English sentence: `detail` is
    // built in the main process, so no catalog carries it and a Japanese user
    // was answered in English (D171).
    expect(host.textContent).toContain('subHarvest.nyaa.unavailable:subHarvest.nyaa.cannot.noIndexer');
    expect(host.textContent).not.toContain('Every torrent index in this profile is turned off.');
    // A button that would report a misconfiguration only after starting a
    // transfer is worse than no button.
    expect(button('subHarvest.nyaa.search')).toBeNull();
  });

  // D171. The two causes were one reason, so the app told a user with no
  // torrent source at all to "enable one" — hunting for a toggle that does not
  // exist. `TorrentManagerPage` had already split them; this path had not.
  it('tells a profile with NO torrent source to add one, not to enable one', async () => {
    harvestList.mockResolvedValue(jimakuEmpty({
      available: false, reason: 'no-torrent-source', detail: 'This profile has no torrent index to search.',
    }));
    await mount([1]);

    expect(host.textContent).toContain('subHarvest.nyaa.cannot.noTorrentSource');
    expect(host.textContent).not.toContain('subHarvest.nyaa.cannot.noIndexer');
  });

  // The listing half of the same defect: `findNyaa` set main's raw `message`
  // straight into the panel, with no translated frame at all.
  it('translates the LISTING refusal too, and does not print main’s English', async () => {
    harvestList.mockResolvedValue(jimakuEmpty({ available: true, reason: null, detail: '' }));
    nyaaList.mockResolvedValue({
      ok: false,
      candidates: [],
      message: 'This profile has no torrent index to search.',
      searchedAs: null,
      reason: 'no-torrent-source',
    });
    await mount([1]);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).toContain('subHarvest.nyaa.cannot.noTorrentSource');
    expect(host.textContent).not.toContain('This profile has no torrent index to search.');
  });

  // A refusal that is NOT an availability question carries no reason, and main's
  // text is the only account of it there is — it must still reach the user.
  it('still shows main’s own words for a refusal that carries no reason', async () => {
    harvestList.mockResolvedValue(jimakuEmpty({ available: true, reason: null, detail: '' }));
    nyaaList.mockResolvedValue({
      ok: false,
      candidates: [],
      message: 'The index did not answer.',
      searchedAs: null,
      reason: null,
    });
    await mount([1]);
    await click('subHarvest.nyaa.search');

    expect(host.textContent).toContain('The index did not answer.');
  });
});

// The last link in the subs-only route (MAL pipeline gate 31): before this the
// panel could mine a harvested season and export it, but the cues had no way to
// reach the player, because every other path into a `SubtitleRecord` starts
// from a media item and this panel starts from a catalogue entry.
describe('SubtitleHarvestPanel — attaching a harvest to a library item', () => {
  const files = [
    { episode: 1, text: srt('いち'), format: 'srt', fileName: '01.srt' },
    { episode: 2, text: srt('に'), format: 'ass', fileName: '02.ass' },
  ];

  /** Drive a nyaa harvest to the state where the attach control renders. */
  async function harvestTwo(): Promise<void> {
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    nyaaFetch.mockResolvedValue({ ok: true, message: '', files });
    await mount([1, 2]);
    await click('subHarvest.nyaa.search');
    await click('subHarvest.nyaa.take');
  }

  function select(index: number): HTMLSelectElement {
    return host.querySelectorAll('select')[index] as HTMLSelectElement;
  }

  async function choose(element: HTMLSelectElement, value: string): Promise<void> {
    await act(async () => {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('writes the chosen file onto the chosen item, with its provenance', async () => {
    listMedia.mockResolvedValue([
      { id: 'm2', title: 'Zebra', path: 'C:/z.mkv', fileName: 'z.mkv', addedAt: 2 },
      { id: 'm1', title: 'Alpha', path: 'C:/a.mkv', fileName: 'a.mkv', addedAt: 1 },
    ]);
    attachText.mockResolvedValue({ ok: true, message: '', lang: 'ja' });
    await harvestTwo();

    expect(host.textContent).toContain('subHarvest.attach.heading');
    // Sorted by title, not by the library's own date-added order.
    expect([...select(0).options].map((option) => option.textContent))
      .toEqual(['subHarvest.attach.choose', 'Alpha', 'Zebra']);

    // The button cannot fire before a target is picked — an attach with no
    // item would be main's refusal for something the UI could have prevented.
    expect(button('subHarvest.attach.action')?.disabled).toBe(true);
    await choose(select(0), 'm1');
    await choose(select(1), '1:02.ass');
    await click('subHarvest.attach.action');

    expect(attachText).toHaveBeenCalledTimes(1);
    expect(attachText.mock.calls[0][0]).toMatchObject({
      mediaId: 'm1',
      // The second file's own bytes and its own format — not the combined
      // corpus, and not the first file by default.
      text: srt('に'),
      format: 'ass',
      lang: 'ja',
      providerId: 'nyaa',
      providerItemId: 'nyaa:aaa',
    });
    expect(host.textContent).toContain('subHarvest.attach.done:Alpha');
  });

  it('shows the refusal verbatim rather than a success', async () => {
    listMedia.mockResolvedValue([
      { id: 'm1', title: 'Alpha', path: 'C:/a.mkv', fileName: 'a.mkv', addedAt: 1 },
    ]);
    attachText.mockResolvedValue({ ok: false, message: 'That media item is no longer in the library.' });
    await harvestTwo();
    await choose(select(0), 'm1');
    await click('subHarvest.attach.action');

    expect(host.textContent).toContain('no longer in the library');
    expect(host.textContent).not.toContain('subHarvest.attach.done');
  });

  it('says the library is empty instead of offering an empty picker', async () => {
    listMedia.mockResolvedValue([]);
    await harvestTwo();

    expect(host.textContent).toContain('subHarvest.attach.empty');
    expect(button('subHarvest.attach.action')).toBeNull();
  });

  // The negative control for the format filter: a harvest whose files the
  // player cannot read must not offer an attach that main would refuse.
  it('offers nothing to attach when no fetched file is a readable format', async () => {
    listMedia.mockResolvedValue([
      { id: 'm1', title: 'Alpha', path: 'C:/a.mkv', fileName: 'a.mkv', addedAt: 1 },
    ]);
    nyaaList.mockResolvedValue({ ok: true, candidates: [candidate()], message: '' });
    nyaaFetch.mockResolvedValue({
      ok: true,
      message: '',
      files: [{ episode: 1, text: srt('いち'), format: 'txt', fileName: '01.txt' }],
    });
    await mount([1]);
    await click('subHarvest.nyaa.search');
    await click('subHarvest.nyaa.take');

    expect(host.textContent).not.toContain('subHarvest.attach.heading');
    expect(listMedia).not.toHaveBeenCalled();
  });
});
