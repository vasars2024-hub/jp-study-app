// @vitest-environment node
//
// The harvest side of nyaa: a title, no media item, and text back rather than a
// record.
//
// The acquisition itself is covered against a stand-in qBittorrent in
// `subtitleNyaaFetch.test.ts`, so what this file owns is the seam — what the
// handler hands down, what it refuses, and what it maps back. Those are exactly
// the parts a mocked provider can prove and the HTTP test cannot: that the
// search is asked with `episode: null`, that a fetch can only ever name a
// candidate main itself listed, and that every file in a pack survives the trip.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: () => undefined } }));

/** What the provider is currently pretending to be. Reset per test. */
let availability: { ok: true } | { ok: false; reason: string; detail: string } = { ok: true };
let searchResult: unknown[] = [];
let searchInput: Record<string, unknown> | null = null;
let searchThrows: Error | null = null;
/** Every search this listing made, in order — the alias walk needs the sequence. */
const searchCalls: Record<string, unknown>[] = [];
/** Per-title results, for the alias cases. Falls back to `searchResult`. */
const searchByTitle = new Map<string, unknown[]>();
let fetchOutcome: unknown = { ok: true, files: [] };
let fetchedWith: { candidate: unknown; config: unknown } | null = null;
const remembered = new Map<string, unknown>();

vi.mock('../subtitleNyaaSource', () => ({
  nyaaAvailability: async () => availability,
  nyaaSearch: async (input: Record<string, unknown>) => {
    searchInput = input;
    searchCalls.push(input);
    if (searchThrows) throw searchThrows;
    const byTitle = searchByTitle.get(String(input.title));
    return byTitle ?? (searchByTitle.size ? [] : searchResult);
  },
  nyaaFetchAll: async (candidate: unknown, config: unknown) => {
    fetchedWith = { candidate, config };
    return fetchOutcome;
  },
  rememberNyaaCandidates: (candidates: readonly { providerItemId: string }[]) => {
    for (const candidate of candidates) remembered.set(candidate.providerItemId, candidate);
  },
  takeRememberedNyaaCandidate: (id: string) => remembered.get(id) ?? null,
}));

// The Jimaku client reaches the credential store, so it is stood in for. It is
// controllable rather than constant because the outage cases below turn on the
// one distinction the real client now makes: a 200 carrying `[]` against a
// request that never answered.
let jimakuMatch: Record<string, unknown> = {
  candidates: [], entry: null, basis: 'title', down: false, downStatus: 0,
};
let jimakuKey = false;

vi.mock('../subtitleProviderClients', () => ({
  fetchSubtitleCandidate: async () => '',
  hasSubtitleProviderKey: () => jimakuKey,
  jimakuSearchDetailed: async () => jimakuMatch,
}));

const { listNyaaHarvest, fetchNyaaHarvest, listSubtitleHarvest } = await import('../subtitleHarvest');

/** A profile shaped enough for `asNyaaAcquisitionConfig` to accept it. */
function acquisition() {
  return {
    indexers: [{
      id: 'nyaa', label: 'nyaa', host: 'nyaa.si', kind: 'torrent', enabled: true,
      priority: 1, fallbackIds: [], verifiedSiteId: '', requiresAuth: false,
      supportsSubtitles: true, health: 'unknown', lastCheckedAt: null, notes: '',
    }],
    torrents: { minSeeders: 1, preferredResolutions: [], blockedGroups: [], maxSizeGb: 0 },
    qbittorrent: {
      enabled: true, scheme: 'http', host: '127.0.0.1', port: 8080, basePath: '',
      username: 'admin', passwordRef: '', category: 'jp-study', tags: [], savePath: '',
      authMode: 'password', apiKeyRef: '',
    },
  };
}

function candidateRow(id: string) {
  return {
    providerItemId: id,
    releaseName: '[Group] Show Subs',
    route: 'sub-pack' as const,
    sizeBytes: 1_200_000,
    seeders: 9,
    language: 'ja',
    score: 88,
    reasons: ['sub-pack', 'ja'],
  };
}

beforeEach(() => {
  availability = { ok: true };
  searchResult = [];
  searchInput = null;
  searchThrows = null;
  searchCalls.length = 0;
  searchByTitle.clear();
  fetchOutcome = { ok: true, files: [] };
  fetchedWith = null;
  remembered.clear();
  jimakuMatch = { candidates: [], entry: null, basis: 'title', down: false, downStatus: 0 };
  jimakuKey = false;
});

describe('listNyaaHarvest', () => {
  it('searches the whole title, not one episode', async () => {
    // The defect this pins: a harvest asks for a *range*, and the releases that
    // can serve a range carry it whole. Pinning an episode at search time is
    // what would make a 100-episode request resolve to a single-episode release.
    searchResult = [candidateRow('nyaa:aaa')];

    const result = await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    expect(result.ok).toBe(true);
    expect(searchInput?.episode).toBeNull();
    expect(searchInput?.title).toBe('The Big O');
    // Japanese only — the point of the harvest is a vocabulary corpus.
    expect(searchInput?.languages).toEqual(['ja']);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: 'nyaa:aaa', route: 'sub-pack', seeders: 9, sizeBytes: 1_200_000, languages: ['ja'],
    });
  });

  it('needs no media item at all — a title the library has never held still lists', async () => {
    // The whole reason this exists next to `subtitleDiscovery`'s pair, which
    // refuses anything `host.listItems()` does not hold.
    searchResult = [candidateRow('nyaa:bbb')];
    const result = await listNyaaHarvest({ title: 'Never Downloaded', acquisition: acquisition() });
    expect(result.ok).toBe(true);
    expect(result.candidates.map((row) => row.id)).toEqual(['nyaa:bbb']);
  });

  it('passes the provider’s own refusal through instead of an empty list', async () => {
    availability = { ok: false, reason: 'no-indexer', detail: 'No torrent index is enabled in this profile.' };
    const result = await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('No torrent index is enabled in this profile.');
    // Negative control for the whole refusal branch: it must not have searched.
    expect(searchInput).toBeNull();
  });

  it('says an empty listing is empty, distinctly from a misconfiguration', async () => {
    searchResult = [];
    const result = await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/looks like it carries subtitles/i);
  });

  it('refuses a blank title before touching the network', async () => {
    const result = await listNyaaHarvest({ title: '   ', acquisition: acquisition() });
    expect(result.ok).toBe(false);
    expect(searchInput).toBeNull();
  });

  // The Shinreigari case, measured live 2026-08-17: MAL files the show as
  // `Shinreigari` and nyaa has it only as `Ghost Hound`. One title string
  // returned "no release looks like it carries subtitles for this title" for a
  // show with a 4-seeder batch on the index.
  it('falls through to an alias when the primary title finds nothing', async () => {
    searchByTitle.set('Ghost Hound', [candidateRow('nyaa:ghost')]);

    const result = await listNyaaHarvest({
      title: 'Shinreigari',
      titles: ['Ghost Hound', '心霊狩り'],
      acquisition: acquisition(),
    });

    expect(result.ok).toBe(true);
    expect(result.candidates.map((row) => row.id)).toEqual(['nyaa:ghost']);
    // Primary first, alias second — and it stopped, rather than asking the
    // third name it did not need.
    expect(searchCalls.map((call) => call.title)).toEqual(['Shinreigari', 'Ghost Hound']);
  });

  it('names the alias it found them under, so the list is checkable', async () => {
    searchByTitle.set('Ghost Hound', [candidateRow('nyaa:ghost')]);
    const result = await listNyaaHarvest({
      title: 'Shinreigari', titles: ['Ghost Hound'], acquisition: acquisition(),
    });
    expect(result.searchedAs).toBe('Ghost Hound');
  });

  it('reports no alias when the title itself found them', async () => {
    // The negative control for the field above: a `searchedAs` that is always
    // populated tells the user nothing, and would read as if every listing came
    // from a different show.
    searchByTitle.set('The Big O', [candidateRow('nyaa:bigo')]);
    const result = await listNyaaHarvest({
      title: 'The Big O', titles: ['Big O'], acquisition: acquisition(),
    });
    expect(result.searchedAs).toBeNull();
    expect(searchCalls).toHaveLength(1);
  });

  it('does not spend a request on an alias that is the title again', async () => {
    searchByTitle.set('Ghost Hound', [candidateRow('nyaa:ghost')]);
    const result = await listNyaaHarvest({
      title: 'Ghost Hound',
      titles: ['ghost  hound', 'Ghost Hound', '  '],
      acquisition: acquisition(),
    });
    expect(result.ok).toBe(true);
    expect(searchCalls).toHaveLength(1);
  });

  it('still refuses when no alias finds anything, in the index’s own words', async () => {
    // The alias walk must not turn an empty index into an error, nor an error
    // into an empty index.
    const result = await listNyaaHarvest({
      title: 'Shinreigari', titles: ['Ghost Hound'], acquisition: acquisition(),
    });
    expect(result.ok).toBe(true);
    expect(result.candidates).toHaveLength(0);
    expect(result.searchedAs).toBeNull();
    expect(result.message).toMatch(/looks like it carries subtitles/i);
    expect(searchCalls).toHaveLength(2);
  });

  it('reports a thrown search rather than rejecting across IPC', async () => {
    searchThrows = new Error('index answered 503');
    const result = await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('index answered 503');
  });
});

describe('listSubtitleHarvest — an outage is not an answer about the title', () => {
  // Measured live 2026-08-17: eight titles listed 0 files with the nyaa
  // fallback offered, and the same eight returned 125/57/168/36/95/48/60/47
  // files when the identical requests were spaced 6 s apart. The zeros were a
  // rate limit reported as a fact about the catalogue, one click away from a
  // torrent transfer for subtitles Jimaku already had.

  it('says Jimaku did not answer, and never claims it filed nothing', async () => {
    jimakuKey = true;
    jimakuMatch = { candidates: [], entry: null, basis: 'title', down: true, downStatus: 429 };

    const result = await listSubtitleHarvest({ anilistId: null, title: 'Bakuman.', acquisition: acquisition() });
    expect(result.jimakuDown).toBe(true);
    expect(result.message).toMatch(/did not answer/i);
    expect(result.message).toContain('429');
    // The load-bearing half: the old sentence must be gone, not merely joined.
    expect(result.message).not.toMatch(/has no Japanese subtitles filed/i);
  });

  it('still says "nothing filed" when Jimaku genuinely answered with nothing', async () => {
    // The discriminating positive. Without it, a change that reported every
    // empty list as an outage would pass the test above and be just as
    // dishonest in the other direction.
    jimakuKey = true;
    jimakuMatch = { candidates: [], entry: null, basis: 'title', down: false, downStatus: 0 };

    const result = await listSubtitleHarvest({ anilistId: null, title: 'Bakuman.', acquisition: acquisition() });
    expect(result.jimakuDown).toBe(false);
    expect(result.message).toMatch(/has no Japanese subtitles filed/i);
    expect(result.message).not.toMatch(/did not answer/i);
  });

  it('leaves the nyaa fallback reachable during an outage — waiting is the user’s call', async () => {
    jimakuKey = true;
    jimakuMatch = { candidates: [], entry: null, basis: 'title', down: true, downStatus: 0 };

    const result = await listSubtitleHarvest({ anilistId: null, title: 'Bakuman.', acquisition: acquisition() });
    expect(result.nyaa?.available).toBe(true);
    // No status to name when nothing answered at all, so the sentence must not
    // grow an empty parenthetical.
    expect(result.message).not.toContain('HTTP');
  });

  it('reports a thrown client as down rather than as an empty catalogue', async () => {
    jimakuKey = true;
    jimakuMatch = null as unknown as Record<string, unknown>; // makes the await throw on property access

    const result = await listSubtitleHarvest({ anilistId: null, title: 'Bakuman.', acquisition: acquisition() });
    expect(result.ok).toBe(false);
    expect(result.jimakuDown).toBe(true);
  });
});

describe('fetchNyaaHarvest', () => {
  it('returns every episode in the release, each keyed to its own number', async () => {
    searchResult = [candidateRow('nyaa:ccc')];
    await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    fetchOutcome = {
      ok: true,
      files: [
        { episode: 7, text: 'Dialogue: seven', format: 'ass', fileName: 'Show - 07.ja.ass' },
        { episode: 8, text: 'Dialogue: eight', format: 'ass', fileName: 'Show - 08.ja.ass' },
      ],
    };

    const result = await fetchNyaaHarvest('nyaa:ccc', acquisition());
    expect(result.ok).toBe(true);
    expect(result.files.map((file) => file.episode)).toEqual([7, 8]);
    expect(result.files[1].text).toBe('Dialogue: eight');
    // The candidate handed down is the one main listed, never anything the
    // caller made up — the id-exchange rule the module header states.
    expect((fetchedWith?.candidate as { providerItemId: string }).providerItemId).toBe('nyaa:ccc');
  });

  it('refuses an id it never listed, and does not acquire anything', async () => {
    // The negative control for the id exchange. Without it a renderer could name
    // any magnet it liked and main would fetch it.
    const result = await fetchNyaaHarvest('nyaa:never-listed', acquisition());
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no longer in this session/i);
    expect(fetchedWith).toBeNull();
  });

  it('refuses with no acquisition configuration, before consuming the candidate', async () => {
    searchResult = [candidateRow('nyaa:ddd')];
    await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });

    const result = await fetchNyaaHarvest('nyaa:ddd', undefined);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no scraper configuration/i);
    expect(fetchedWith).toBeNull();
  });

  it('reports the provider’s refusal verbatim rather than an empty success', async () => {
    searchResult = [candidateRow('nyaa:eee')];
    await listNyaaHarvest({ title: 'The Big O', acquisition: acquisition() });
    fetchOutcome = { ok: false, reason: 'This release only has image-based subtitles, which cannot be read as text.' };

    const result = await fetchNyaaHarvest('nyaa:eee', acquisition());
    expect(result.ok).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.message).toMatch(/image-based/i);
  });
});
