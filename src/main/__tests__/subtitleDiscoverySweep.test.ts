// @vitest-environment node
//
// A driver for the WHOLE sweep, with every provider client stubbed.
//
// Everything about subtitle discovery had been tested one pure function at a
// time — `recentlyFailed` in isolation, `scoreCandidates` in isolation — and the
// three defects fixed on 2026-09-07 (D250-D252) all lived in the *wiring*
// between them, where no test could see. `discoverForItem` is not exported and
// nothing drove `runSubtitleDiscovery` end to end, so "an outage now records
// `provider-down` instead of `no-match`" was verified by reading the call site.
//
// This file is the seam that verification needed, and it is deliberately
// parameterised rather than written per-defect: `sweep()` takes one item and one
// set of provider replies and returns what was actually written to the store, so
// a new provider arm or a new failure reason is a new case, not a new file.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/types';
import type { SubtitleSearchFailure } from '../../shared/subtitleRecord';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subsweep-test-'));

// The profile this sweep runs against, written before the module is imported.
//
// NOT optional, and not cosmetic: `nyaa` ships `enabled: false`, so an empty
// temp profile leaves it out of `orderedSubtitleProviders` entirely and every
// assertion that the sweep does not ask nyaa passes for the wrong reason. That
// is not hypothetical — the first version of this file asserted exactly that and
// the mutation control caught it: deleting the manual-only skip from the product
// changed nothing and all tests stayed green.
//
// The values mirror the user's real `subtitle-discovery.json` on 2026-09-07,
// where nyaa IS enabled, which is why their library carries 127 nyaa rows.
fs.writeFileSync(path.join(tmpRoot, 'subtitle-discovery.json'), JSON.stringify({
  autoDiscover: true,
  autoDownloadLanguages: ['ja'],
  minConfidence: 70,
  autoTranscribe: false,
  providers: [
    { id: 'embedded', enabled: true, priority: 0 },
    { id: 'sidecar', enabled: true, priority: 1 },
    { id: 'jimaku', enabled: true, priority: 2 },
    { id: 'opensubtitles', enabled: true, priority: 3 },
    { id: 'nyaa', enabled: true, priority: 4 },
  ],
  retryAfterDays: 7,
}), 'utf-8');

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

// ---------------------------------------------------------------- provider stubs

/** What each provider is told to answer this run. Reset per test. */
interface ProviderScript {
  jimaku: { candidates: unknown[]; down: boolean; downStatus: number };
  opensubtitles: { candidates: unknown[]; down: boolean; downStatus: number };
  nyaa: {
    availability: { ok: true } | { ok: false; reason: string; detail: string };
    candidates: unknown[];
  };
  /** Text returned for a chosen candidate. `null` models a failed download. */
  fetchText: string | null;
  /** The download is refused on OpenSubtitles' daily quota. */
  fetchQuota: boolean;
  /** What the audio-sync estimator reports for a downloaded track. */
  sync: { offsetSec: number; score: number; rivalScore: number; confident: boolean };
  keys: Record<string, boolean>;
}

const script: ProviderScript = {} as ProviderScript;
/** Which provider clients were actually reached, in order. */
const asked: string[] = [];
/** The arguments each Jimaku call carried, in order. */
const jimakuAsked: { anilistId?: number; title?: string; episode?: number | null }[] = [];
/** Every OpenSubtitles query the tiered search sent, in order. */
const osQueries: { languages: string[]; episode: number | null; title: string }[] = [];
/** When set, Jimaku does not answer until it resolves — holds a sweep open. */
let jimakuGate: Promise<void> | null = null;
resetScript();

function resetScript(): void {
  script.jimaku = { candidates: [], down: false, downStatus: 200 };
  script.opensubtitles = { candidates: [], down: false, downStatus: 200 };
  script.nyaa = { availability: { ok: true }, candidates: [] };
  script.fetchText = '1\n00:00:01,000 --> 00:00:02,000\nテスト\n';
  script.fetchQuota = false;
  script.sync = { offsetSec: 0, score: 0, rivalScore: 0, confident: false };
  script.keys = { jimaku: true, opensubtitles: true };
  asked.length = 0;
  osQueries.length = 0;
}

vi.mock('../subtitleProviderClients', () => ({
  hasSubtitleProviderKey: (id: string) => script.keys[id] === true,
  setSubtitleProviderKey: () => undefined,
  testSubtitleProvider: async () => ({ ok: true }),
  jimakuSearchDetailed: async (anilistId?: number, title?: string, episode?: number | null) => {
    if (jimakuGate) await jimakuGate;
    asked.push('jimaku');
    // The question actually asked, not just that one was. D266 is a defect
    // entirely about WHICH entry and WHICH episode number went over the wire,
    // and a stub that drops its arguments cannot see it.
    jimakuAsked.push({ anilistId, title, episode });
    return { ...script.jimaku, entry: null, basis: 'anilist', rejectedEntry: null };
  },
  openSubtitlesSearchDetailed: async (query: { languages: string[]; episode: number | null; title: string }) => {
    asked.push('opensubtitles');
    osQueries.push(query);
    return script.opensubtitles;
  },
  // The tiered search keys its per-run listing cache on the query string.
  openSubtitlesSearchParams: (query: unknown) => JSON.stringify(query),
  fetchSubtitleCandidate: async () => script.fetchText,
  fetchSubtitleCandidateDetailed: async () => (script.fetchQuota
    ? { text: null, quotaExceeded: true, resetAt: null, remaining: 0 }
    : { text: script.fetchText, quotaExceeded: false, resetAt: null, remaining: null }),
}));

vi.mock('../subtitleNyaaSource', () => ({
  emptyRankDrops: () => ({ titleMatched: 0, seeders: 0, title: 0, muxed: 0, shape: 0, language: 0 }),
  nyaaAvailability: async () => {
    asked.push('nyaa:availability');
    return script.nyaa.availability;
  },
  nyaaSearch: async () => {
    asked.push('nyaa:search');
    return script.nyaa.candidates;
  },
  nyaaSearchDetailed: async () => {
    asked.push('nyaa:search');
    return { candidates: script.nyaa.candidates, dropped: {} };
  },
  nyaaFetch: async () => ({ ok: false, reason: 'not in this test' }),
  rememberNyaaCandidates: () => undefined,
  takeRememberedNyaaCandidate: () => null,
}));

// Local sources are a different ladder rung with their own suites; stub them out
// so a provider case is not silently satisfied by a sidecar on the test machine.
vi.mock('../subtitleLocalSources', () => ({
  READABLE_EXTENSIONS: ['.srt', '.ass'],
  extractEmbeddedSubtitle: async () => null,
  findSidecarSubtitles: () => [],
  guessSidecarLanguage: () => null,
  listEmbeddedSubtitleStreams: async () => [],
  normalizeStreamLanguage: (raw?: string) => raw ?? null,
}));

vi.mock('../osdbHash', () => ({ osdbHashFile: async () => null }));

// The audio-sync estimator spawns ffmpeg; its answer is scripted instead.
vi.mock('../subtitleSync', () => ({ estimateSubtitleOffset: async () => script.sync }));

const transcriptionQueue: unknown[] = [];
vi.mock('../transcriptionJobs', () => ({
  enqueueTranscription: (job: unknown) => { transcriptionQueue.push(job); },
}));

vi.mock('../subtitleHarvest', () => ({ storedMalFacts: () => null }));

const { registerSubtitleDiscoveryIpc, runSubtitleDiscovery } = await import('../subtitleDiscovery');
const { resetSubtitleNoticesForTests, activeSubtitleNotices } = await import('../subtitleDiscoveryNotices');

// ------------------------------------------------------------------- the driver

const DAY = 24 * 60 * 60 * 1000;

function mediaItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    title: 'The Big O - 07',
    seriesTitle: 'The Big O',
    seriesKey: 'the big o',
    fileName: 'The Big O - 07.mkv',
    path: path.join(tmpRoot, 'The Big O - 07.mkv'),
    addedAt: 1,
    episode: 7,
    anilistId: 567,
    kind: 'video',
    durationSec: 1425,
    ...over,
  } as MediaItem;
}

function osCandidate(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerId: 'opensubtitles',
    providerItemId: 'opensubtitles:1',
    language: 'ja',
    format: 'srt',
    releaseName: 'The Big O - 07 [BDRip]',
    season: null,
    episode: 7,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: 100,
    fetchToken: '1',
    ...over,
  };
}

/**
 * Runs one real sweep over one item and hands back what the store received.
 *
 * The host is the seam: `runSubtitleDiscovery` reads items from it and patches
 * them back, so capturing the patch is capturing the product's own output rather
 * than a re-derivation of it.
 */
async function sweep(item: MediaItem, request: Record<string, unknown> = {}): Promise<{
  failures: SubtitleSearchFailure[];
  records: { lang: string; providerId?: string }[];
  asked: string[];
}> {
  // Per sweep, not per test: a case that runs two sweeps to compare them would
  // otherwise read the first one's calls in the second one's result, and
  // `asked` assertions would pass or fail for the wrong reason.
  asked.length = 0;
  jimakuAsked.length = 0;
  let current = item;
  registerSubtitleDiscoveryIpc({
    listItems: () => [current],
    patchItems: (_ids, patch) => { current = { ...current, ...patch }; },
  });
  await runSubtitleDiscovery(request);
  return {
    failures: (current.subtitleFailures ?? []) as SubtitleSearchFailure[],
    records: (current.subtitles ?? []) as { lang: string; providerId?: string }[],
    asked: [...asked],
  };
}

/**
 * Same driver, but handing back the RESULT ENVELOPE as well as the store.
 *
 * `sweep()` deliberately returns only what was persisted, because that is what
 * outlives the run. The counts the caller is shown are a separate claim and can
 * disagree with it — which is D268.
 */
async function sweepResult(item: MediaItem, request: Record<string, unknown> = {}): Promise<{
  result: { attached: number; empty: number; files: number };
  records: { lang: string; providerId?: string }[];
}> {
  asked.length = 0;
  jimakuAsked.length = 0;
  let current = item;
  registerSubtitleDiscoveryIpc({
    listItems: () => [current],
    patchItems: (_ids, patch) => { current = { ...current, ...patch }; },
  });
  const result = await runSubtitleDiscovery(request);
  return {
    result: result as unknown as { attached: number; empty: number; files: number },
    records: (current.subtitles ?? []) as { lang: string; providerId?: string }[],
  };
}

const reasons = (failures: SubtitleSearchFailure[], providerId: string): string[] =>
  failures.filter((f) => f.providerId === providerId).map((f) => f.reason);

beforeEach(() => {
  resetScript();
  transcriptionQueue.length = 0;
  resetSubtitleNoticesForTests();
});

// ------------------------------------------------------------------------ cases

describe('an outage is never recorded as a fact about the show', () => {
  // Asserted on the STORE rather than on the reason string, because the store is
  // the only thing that outlives the sweep and `no-match` is the only reason that
  // changes what the next one does. A `provider-down` row is pruned on write (it
  // has no reader), so "recorded provider-down" and "recorded nothing" are the
  // same outcome — what must never happen is an evidential `no-match`.
  it('leaves no no-match behind when Jimaku is rate-limited', async () => {
    script.jimaku = { candidates: [], down: true, downStatus: 429 };
    const out = await sweep(mediaItem());
    expect(reasons(out.failures, 'jimaku')).toEqual([]);
  });

  it('leaves no no-match behind when OpenSubtitles 5xxs', async () => {
    // The defect this file was written for. `openSubtitlesSearch` returned `[]`
    // for a 429, a 500, a timeout and a genuinely empty catalogue alike, and the
    // loop turned every one of them into `no-match` — which IS evidential and
    // suppresses the provider for `retryAfterDays`, 7 by default.
    script.opensubtitles = { candidates: [], down: true, downStatus: 503 };
    const out = await sweep(mediaItem());
    expect(reasons(out.failures, 'opensubtitles')).toEqual([]);
  });

  it('still files a genuine empty catalogue as no-match', async () => {
    // The negative control, and the one that makes the two above mean something:
    // if the outage arms merely stopped recording, this would stop recording too,
    // the back-off would never engage, and every sweep would re-ask forever.
    script.opensubtitles = { candidates: [], down: false, downStatus: 200 };
    const out = await sweep(mediaItem());
    expect(reasons(out.failures, 'opensubtitles')).toEqual(['no-match']);
  });

  it('lets the next sweep retry after an outage, and not after a no-match', async () => {
    const afterOutage = mediaItem({
      subtitleFailures: [
        { providerId: 'opensubtitles', lang: 'ja', reason: 'provider-down', attemptedAt: Date.now() - DAY },
      ],
    } as Partial<MediaItem>);
    expect((await sweep(afterOutage)).asked).toContain('opensubtitles');

    const afterNoMatch = mediaItem({
      subtitleFailures: [
        { providerId: 'opensubtitles', lang: 'ja', reason: 'no-match', attemptedAt: Date.now() - DAY },
      ],
    } as Partial<MediaItem>);
    expect((await sweep(afterNoMatch)).asked).not.toContain('opensubtitles');
  });
});

describe('a manual-only provider is not asked by the sweep at all', () => {
  it('never probes nyaa, because the loop is forbidden to keep what it returns', async () => {
    // Measured on the real library 2026-09-07: 127 stored `nyaa | not-configured`
    // rows across 39 items, written by a provider whose result the attach step
    // discards by design. Nothing in `src/` reads `manual-only` or any
    // `NyaaUnavailableReason` off an item, so all of it was write-only.
    const out = await sweep(mediaItem());
    expect(out.asked.filter((entry) => entry.startsWith('nyaa'))).toEqual([]);
    expect(reasons(out.failures, 'nyaa')).toEqual([]);
  });

  it('does not ask it on a forced re-search either', async () => {
    const out = await sweep(mediaItem(), { force: true });
    expect(out.asked.filter((entry) => entry.startsWith('nyaa'))).toEqual([]);
  });

  it('leaves the providers that CAN attach untouched', async () => {
    // The control for the skip: proving nyaa is gone is worthless if the guard
    // also swallowed the two providers the sweep exists to run.
    const out = await sweep(mediaItem());
    expect(out.asked).toEqual(['jimaku', 'opensubtitles']);
  });
});

describe('a configuration refusal does not suppress the search it enables', () => {
  it('re-asks OpenSubtitles once a key is added, ignoring the stored no-key row', async () => {
    const item = mediaItem({
      subtitleFailures: [
        { providerId: 'opensubtitles', lang: 'ja', reason: 'no-key', attemptedAt: Date.now() - 5.98 * DAY },
      ],
    } as Partial<MediaItem>);
    expect((await sweep(item)).asked).toContain('opensubtitles');
  });

  it('asks nothing at all when no key is stored, and blocks no later sweep', async () => {
    script.keys = { jimaku: false, opensubtitles: false };
    const out = await sweep(mediaItem());
    expect(out.asked).toEqual([]);
    expect(out.failures).toEqual([]);
  });
});

describe('the store keeps only the rows the back-off actually reads', () => {
  it('drops the historical rows nothing consults, and keeps the ones that matter', async () => {
    // The real library's shape: 550 rows, 498 of them non-evidential. The list
    // is capped at 24 and FIFO, so those rows were evicting the back-off's own
    // subject until it forgot everything and re-asked every sweep.
    const item = mediaItem({
      subtitleFailures: [
        { providerId: 'nyaa', lang: 'ja', reason: 'not-configured', attemptedAt: Date.now() - DAY },
        { providerId: 'opensubtitles', lang: 'ja', reason: 'no-key', attemptedAt: Date.now() - DAY },
        { providerId: 'jimaku', lang: 'ja', reason: 'provider-down', attemptedAt: Date.now() - DAY },
        { providerId: 'jimaku', lang: 'ja', reason: 'no-match', attemptedAt: Date.now() - DAY },
      ],
    } as Partial<MediaItem>);
    script.opensubtitles = { candidates: [osCandidate()], down: false, downStatus: 200 };
    const out = await sweep(item);
    expect(out.failures.map((f) => `${f.providerId}|${f.reason}`)).toEqual(['jimaku|no-match']);
  });

  it('does not let a stored nyaa configuration row suppress anything', async () => {
    // `NyaaUnavailableReason` is a statement about this machine's settings, never
    // about the show. It is a standing guard rather than a live path today —
    // the manual-only skip above means the sweep no longer asks nyaa at all —
    // but it is what stops a change to `MANUAL_ONLY_SUBTITLE_PROVIDERS` from
    // silently reinstating a 7-day blackout after the user fixes their config.
    const item = mediaItem({
      subtitleFailures: [
        { providerId: 'jimaku', lang: 'ja', reason: 'qbit-disabled', attemptedAt: Date.now() - DAY },
      ],
    } as Partial<MediaItem>);
    expect((await sweep(item)).asked).toContain('jimaku');
  });
});

describe('the sweep still attaches when a provider answers', () => {
  it('writes a record for a matching candidate', async () => {
    script.opensubtitles = { candidates: [osCandidate()], down: false, downStatus: 200 };
    const out = await sweep(mediaItem());
    expect(out.records.map((record) => record.lang)).toEqual(['ja']);
    expect(out.records[0].providerId).toBe('opensubtitles');
  });

  it('files download-failed when the bytes do not arrive', async () => {
    script.opensubtitles = { candidates: [osCandidate()], down: false, downStatus: 200 };
    script.fetchText = null;
    const out = await sweep(mediaItem());
    expect(reasons(out.failures, 'opensubtitles')).toEqual(['download-failed']);
    expect(out.records).toEqual([]);
  });
});

// D268, found by driving the D266 fix on the real library: a forced re-search of
// `The Big O - 07` returned `{attached: 0, empty: 3, files: 1}` while the store
// held the freshly attached record. The user who pressed *Find subtitles* is
// told "0 subtitles" about a search that worked.
describe('what the sweep reports back to the caller', () => {
  /** An item that already has one provider record, as most of the library does. */
  const withRecord = (): MediaItem => mediaItem({
    subtitles: [{
      id: 'rec-1',
      lang: 'ja',
      source: 'provider',
      providerId: 'opensubtitles',
      path: 'subtitles/m1/old.srt',
      format: 'srt',
      addedAt: 1,
    }],
  } as Partial<MediaItem>);

  it('counts a forced re-search that re-attached as attached, not empty', async () => {
    script.opensubtitles = { candidates: [osCandidate()], down: false, downStatus: 200 };
    const out = await sweepResult(withRecord(), { force: true });
    expect(out.result).toMatchObject({ attached: 1, empty: 0 });
  });

  it('still counts a forced re-search that found nothing as empty', async () => {
    // The discriminating positive. Without it, "always attached" passes above
    // and the count becomes as useless in the other direction.
    const out = await sweepResult(withRecord(), { force: true });
    expect(out.result).toMatchObject({ attached: 0, empty: 1 });
  });

  it('counts an unforced run against everything the item already had', async () => {
    // Not forced: nothing was dropped, so the item's own list IS the baseline
    // and an item that gains nothing must still read as empty. The existing
    // record is English, because an item that already has the wanted language
    // is skipped by the sweep entirely and never counted either way — measured
    // here, not assumed.
    const english = { ...withRecord() } as MediaItem;
    (english as { subtitles: { lang: string }[] }).subtitles = [
      { ...(english.subtitles ?? [])[0], lang: 'en' } as unknown as { lang: string },
    ];
    expect((await sweepResult(english, {})).result).toMatchObject({ attached: 0, empty: 1 });
    // And the skip itself, stated rather than implied.
    expect((await sweepResult(withRecord(), {})).result).toMatchObject({ attached: 0, empty: 0 });
  });
});

// D266. The user's `The Big O` folder is 26 files, all stamped `anilistId: 567`
// — season 1, `episodes: 13`. Jimaku entry 1178 holds exactly E01–E13, so
// episodes 14–26 were asked about under an entry that cannot contain them and
// the correct "nothing" was stored as evidential, suppressing every retry.
describe('a folder holding two seasons', () => {
  const SEQUEL = {
    anilistId: 568, relationType: 'SEQUEL', title: 'The Big O II', format: 'TV', episodeCount: 13,
  };
  /** Episode 26 of the folder, i.e. episode 13 of the second entry. */
  const episode26 = (over: Partial<MediaItem> = {}): MediaItem => mediaItem({
    id: 'm26',
    title: 'The Big O - 26',
    fileName: 'The Big O - 26.mkv',
    path: path.join(tmpRoot, 'The Big O - 26.mkv'),
    episode: 26,
    episodeCount: 13,
    relatedWorks: [SEQUEL],
    ...over,
  } as Partial<MediaItem>);

  const jimakuCandidate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    providerId: 'jimaku',
    providerItemId: 'jimaku:1179:The Big O II.E13.Bandai.ja.srt',
    language: 'ja',
    format: 'srt',
    releaseName: 'The Big O II.E13.Bandai.ja.srt',
    season: null,
    // What the sequel entry's own numbering says, which is NOT the folder's.
    episode: 13,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: null,
    fetchToken: 'https://x/e13.srt',
    ...over,
  });

  it('asks the SEQUEL entry, about its own episode 13', async () => {
    await sweep(episode26());
    expect(jimakuAsked).toEqual([{ anilistId: 568, title: 'The Big O II', episode: 13 }]);
  });

  it('still asks the matched entry for an episode inside it', async () => {
    // The discriminating positive. Without it, "always hop to the sequel" passes
    // every other case here and breaks all thirteen episodes that worked.
    await sweep(mediaItem());
    expect(jimakuAsked).toEqual([{ anilistId: 567, title: 'The Big O', episode: 7 }]);
  });

  it('attaches the sequel file to the folder-numbered item', async () => {
    // The half a naive fix drops: the candidate comes back numbered 13 in the
    // sequel's frame, the item is episode 26 in the folder's, and the matcher
    // reads that disagreement as the wrong episode and rejects it — so the
    // search succeeds and nothing is attached.
    script.jimaku = { candidates: [jimakuCandidate()], down: false, downStatus: 200 };
    const out = await sweep(episode26());
    expect(out.records.map((record) => record.providerId)).toEqual(['jimaku']);
    expect(reasons(out.failures, 'jimaku')).toEqual([]);
  });

  it('does not renumber a candidate that is a different episode of the sequel', async () => {
    // Only the requested episode is rewritten. A stray E04 in the same listing
    // must stay wrong, or the remap becomes "attach whatever came back".
    script.jimaku = {
      candidates: [jimakuCandidate({
        providerItemId: 'jimaku:1179:The Big O II.E04.Bandai.ja.srt',
        releaseName: 'The Big O II.E04.Bandai.ja.srt',
        episode: 4,
      })],
      down: false,
      downStatus: 200,
    };
    const out = await sweep(episode26());
    expect(out.records).toEqual([]);
    expect(reasons(out.failures, 'jimaku')).toEqual(['no-match']);
  });

  it('says why, rather than "no-match", when no sequel accounts for the episode', async () => {
    const out = await sweep(episode26({ relatedWorks: [] } as Partial<MediaItem>));
    // Still asked. `episodeCount` is AniList's and the entry's contents are
    // Jimaku's: a split cour filed as one entry really can hold episode 20 of a
    // 12-episode season, and skipping the request would lose that.
    expect(out.asked).toContain('jimaku');
    expect(reasons(out.failures, 'jimaku')).toEqual(['episode-out-of-range:no-sequel']);
  });

  it('says why when the episode is past the sequel as well', async () => {
    const out = await sweep(episode26({ episode: 40 } as Partial<MediaItem>));
    expect(reasons(out.failures, 'jimaku')).toEqual(['episode-out-of-range:beyond-sequel']);
  });

  it('records plain no-match for an in-range episode the catalogue really lacks', async () => {
    // The discriminating positive: `episode-out-of-range` must not become the
    // universal label for an empty Jimaku answer, or it says nothing at all.
    const out = await sweep(mediaItem());
    expect(reasons(out.failures, 'jimaku')).toEqual(['no-match']);
  });

  it('still attaches when an out-of-range item turns out to have the file anyway', async () => {
    // The capability the earlier skip would have cost: AniList says 13, the
    // Jimaku entry holds the episode regardless, and the record must land.
    script.jimaku = {
      candidates: [jimakuCandidate({ episode: 26, releaseName: 'The Big O.E26.Bandai.ja.srt' })],
      down: false,
      downStatus: 200,
    };
    const out = await sweep(episode26({ relatedWorks: [] } as Partial<MediaItem>));
    expect(out.records.map((record) => record.providerId)).toEqual(['jimaku']);
    expect(reasons(out.failures, 'jimaku')).toEqual([]);
  });

  it('leaves an item with no published episode count alone', async () => {
    // No boundary, no "outside" it. This is most of the library.
    await sweep(episode26({ episodeCount: undefined } as Partial<MediaItem>));
    expect(jimakuAsked).toEqual([{ anilistId: 567, title: 'The Big O', episode: 26 }]);
  });
});

// ---------------------------------------------------------------------------
// Subtitle automation (2026-09-23): the helper line, per-series batching, the
// download quota, machine translations, and timing correction.
// ---------------------------------------------------------------------------

describe('the helper line is wanted everywhere but downloaded per episode', () => {
  it('a library sweep asks OpenSubtitles for Japanese only', async () => {
    await sweep(mediaItem({ anilistId: undefined } as Partial<MediaItem>));
    expect(osQueries.map((query) => query.languages)).toEqual([['ja']]);
  });

  it('a targeted request (a played episode, "Search now") fetches English too', async () => {
    script.opensubtitles = {
      candidates: [
        osCandidate(),
        osCandidate({ providerItemId: 'opensubtitles:2', language: 'en', releaseName: 'The Big O - 07 [BDRip]' }),
      ],
      down: false,
      downStatus: 200,
    };
    const out = await sweep(mediaItem(), { mediaIds: ['m1'] });
    expect(osQueries[0].languages).toEqual(['ja', 'en']);
    expect(out.records.map((record) => record.lang).sort()).toEqual(['en', 'ja']);
  });

  it('does not re-walk an item that has Japanese just because English is missing', async () => {
    const out = await sweep(mediaItem({
      subtitles: [{ id: 'j', lang: 'ja', source: 'provider', format: 'srt', path: 'p', addedAt: 1 }],
    } as Partial<MediaItem>));
    expect(out.asked).toEqual([]);
  });

  it('does not count a machine translation as having the language', async () => {
    const out = await sweep(mediaItem({
      subtitles: [{
        id: 'mt', lang: 'ja', source: 'generated', derivation: 'machine-translation', format: 'srt', path: 'p', addedAt: 1,
      }],
    } as Partial<MediaItem>));
    expect(out.asked).toContain('jimaku');
    // …and a forced or unforced search never throws it away: it cannot be rediscovered.
    expect(out.records.map((record) => (record as { id?: string }).id)).toContain('mt');
  });
});

describe('OpenSubtitles is asked once per series, not once per episode', () => {
  it('two episodes of one season in one sweep share one listing', async () => {
    script.keys = { jimaku: false, opensubtitles: true };
    script.opensubtitles = {
      candidates: [
        osCandidate({ providerItemId: 'opensubtitles:7', episode: 7 }),
        osCandidate({ providerItemId: 'opensubtitles:8', episode: 8, releaseName: 'The Big O - 08 [BDRip]' }),
      ],
      down: false,
      downStatus: 200,
    };
    let library = [
      mediaItem({ id: 'e7' } as Partial<MediaItem>),
      mediaItem({ id: 'e8', episode: 8, title: 'The Big O - 08', fileName: 'The Big O - 08.mkv' } as Partial<MediaItem>),
    ];
    registerSubtitleDiscoveryIpc({
      listItems: () => library,
      patchItems: (ids, patch) => {
        library = library.map((entry) => (ids.includes(entry.id) ? { ...entry, ...patch } : entry));
      },
    });
    await runSubtitleDiscovery({});
    expect(osQueries).toHaveLength(1);
    expect(osQueries[0].episode).toBeNull();
    const ids = library.map((entry) => entry.subtitles?.map((record) => record.providerItemId));
    expect(ids).toEqual([['opensubtitles:7'], ['opensubtitles:8']]);
  });
});

describe('the OpenSubtitles download quota', () => {
  it('is not stored as a failed download, and raises the panel notice', async () => {
    script.fetchQuota = true;
    script.opensubtitles = { candidates: [osCandidate()], down: false, downStatus: 200 };
    const out = await sweep(mediaItem());
    expect(out.records).toEqual([]);
    // `quota` is non-evidential: nothing is kept that would suppress tomorrow's retry.
    expect(reasons(out.failures, 'opensubtitles')).toEqual([]);
    expect(activeSubtitleNotices([], { hasOpenSubtitlesKey: true, translationAvailable: true }).active)
      .toEqual(['opensubtitles-quota']);
  });

  it('says once that OpenSubtitles needs a key, only when it would have been asked', async () => {
    script.keys = { jimaku: true, opensubtitles: false };
    await sweep(mediaItem());
    expect(activeSubtitleNotices([], { hasOpenSubtitlesKey: false, translationAvailable: true }).active)
      .toEqual(['opensubtitles-key-missing']);
  });
});

describe('a downloaded track is moved onto this file\'s audio', () => {
  const video = path.join(tmpRoot, 'The Big O - 07.real.mkv');
  const cues = Array.from({ length: 12 }, (_, i) =>
    `${i + 1}\n00:00:${String(10 + i * 3).padStart(2, '0')},000 --> 00:00:${String(11 + i * 3).padStart(2, '0')},000\n台詞${i}\n`).join('\n');

  it('shifts the stored file when the estimate is confident', async () => {
    fs.writeFileSync(video, 'not really a video');
    script.fetchText = cues;
    script.sync = { offsetSec: -2, score: 0.3, rivalScore: 0.05, confident: true };
    script.jimaku = {
      candidates: [{
        providerId: 'jimaku', providerItemId: 'jimaku:1:e07.srt', language: 'ja', format: 'srt',
        releaseName: 'The Big O.E07.srt', season: null, episode: 7, releaseGroup: null,
        hearingImpaired: false, hashMatch: false, downloads: null, fetchToken: 'x',
      }],
      down: false,
      downStatus: 200,
    };
    const out = await sweep(mediaItem({ path: video } as Partial<MediaItem>));
    const record = out.records[0] as unknown as { path: string; syncOffsetSec?: number };
    expect(record.syncOffsetSec).toBe(-2);
    const stored = fs.readFileSync(path.join(tmpRoot, record.path), 'utf-8');
    expect(stored).toContain('00:00:08,000 --> 00:00:09,000');
  });

  it('leaves a hash-matched track exactly as served', async () => {
    fs.writeFileSync(video, 'not really a video');
    script.keys = { jimaku: false, opensubtitles: true };
    script.fetchText = cues;
    script.sync = { offsetSec: -2, score: 0.3, rivalScore: 0.05, confident: true };
    script.opensubtitles = { candidates: [osCandidate({ hashMatch: true })], down: false, downStatus: 200 };
    const out = await sweep(mediaItem({ path: video } as Partial<MediaItem>));
    const record = out.records[0] as unknown as { path: string; syncOffsetSec?: number };
    expect(record.syncOffsetSec).toBeUndefined();
    expect(fs.readFileSync(path.join(tmpRoot, record.path), 'utf-8')).toContain('00:00:10,000 --> 00:00:11,000');
  });
});

describe('an import that lands while a sweep is running', () => {
  it('is searched by one follow-up sweep, not left until the next launch', async () => {
    script.keys = { jimaku: true, opensubtitles: false };
    let library = [mediaItem({ id: 'a' } as Partial<MediaItem>)];
    registerSubtitleDiscoveryIpc({
      listItems: () => library,
      patchItems: (ids, patch) => {
        library = library.map((entry) => (ids.includes(entry.id) ? { ...entry, ...patch } : entry));
      },
    });
    let release: () => void = () => undefined;
    jimakuGate = new Promise<void>((resolve) => { release = resolve; });
    jimakuAsked.length = 0;

    const first = runSubtitleDiscovery({});
    // A watch folder imports episode 8 while episode 7 is being searched.
    library = [...library, mediaItem({ id: 'b', episode: 8 } as Partial<MediaItem>)];
    const refused = await runSubtitleDiscovery({});
    expect(refused).toMatchObject({ ok: false });

    jimakuGate = null;
    release();
    await first;
    await vi.waitFor(() => {
      expect(jimakuAsked.map((call) => call.episode)).toEqual([7, 8]);
    });
  });
});
