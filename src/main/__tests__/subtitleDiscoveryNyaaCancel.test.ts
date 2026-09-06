// @vitest-environment node
//
// Whether `subtitleDiscovery:cancel` reaches the dialog's own acquisition —
// Track 9 gate 15's first half.
//
// The gate says an interrupted acquisition must leave nothing behind. That
// only means anything if the acquisition can be interrupted at all, and until
// `acceptNyaaCandidate` registered itself in `running` it could not:
// `cancelSubtitleDiscovery` marks only ids it finds there, so both the
// per-item call and the cancel-everything the job strip's button sends were
// no-ops against a fetch that was, at that moment, transferring.
//
// Driven through the registered IPC handlers rather than by calling the
// function, because the handler map is the seam the renderer actually has and
// the wiring between the two channels is the thing under test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/types';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  DEFAULT_SCRAPER_TORRENT_SETTINGS,
} from '../../shared/scraperSourceSettings';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaacancel-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, payload: unknown) => { broadcasts.push({ channel, payload }); },
      },
    }],
  },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const handlers = new Map<string, (...args: unknown[]) => unknown>();
/**
 * Every progress line the accept sent.
 *
 * The strip's Cancel button only appears while an unfinished row is in it, so
 * "the IPC can cancel" and "a person can cancel" are different claims and this
 * is the second one.
 */
let broadcasts: Array<{ channel: string; payload: unknown }> = [];

/**
 * Every `isCancelled` reading the fetch took, in order.
 *
 * The stand-in fetch polls exactly the way `qbitAwaitFiles` does — check, wait,
 * check — so "the cancel arrived" and "the fetch noticed" stay separable.
 */
let cancelReadings: boolean[] = [];
/** Resolved by the test once the fetch is genuinely in flight. */
let releaseFetch: (() => void) | null = null;
/** Set by a test that wants the fetch to fail for a reason that is not a cancel. */
let failNextFetch: string | null = null;

vi.mock('../subtitleNyaaSource', () => ({
  emptyRankDrops: () => ({ titleMatched: 0, seeders: 0, title: 0, muxed: 0, shape: 0, language: 0 }),
  nyaaAvailability: async () => ({ ok: true }),
  nyaaSearch: async () => [],
  nyaaSearchDetailed: async () => ({
    candidates: [],
    dropped: { titleMatched: 0, seeders: 0, title: 0, muxed: 0, shape: 0, language: 0 },
  }),
  nyaaFetch: async (
    _candidate: unknown,
    _config: unknown,
    options: { isCancelled?: () => boolean } = {},
  ) => {
    cancelReadings.push(options.isCancelled?.() ?? false);
    await new Promise<void>((resolve) => { releaseFetch = resolve; });
    const stopped = options.isCancelled?.() ?? false;
    cancelReadings.push(stopped);
    if (stopped) return { ok: false, reason: 'Cancelled.' };
    if (failNextFetch) return { ok: false, reason: failNextFetch };
    return { ok: true, value: { text: 'Dialogue: hi', format: 'ass', fileName: 'x.ass' } };
  },
  rememberNyaaCandidates: () => undefined,
  takeRememberedNyaaCandidate: () => ({
    providerId: 'nyaa',
    providerItemId: 'nyaa:abc',
    language: 'ja',
    format: 'ass',
    releaseName: 'Show Subs',
    season: null,
    episode: 7,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: 10,
    fetchToken: '{}',
  }),
}));

const { registerSubtitleDiscoveryIpc } = await import('../subtitleDiscovery');

// The real shape, not a shorthand: `asNyaaAcquisitionConfig` requires the five
// lists the ranker indexes into plus a finite `minSeeders`, and a config it
// refuses returns before the fetch is ever reached — which reads exactly like a
// cancel that worked.
const ACQUISITION = {
  indexers: [],
  torrents: DEFAULT_SCRAPER_TORRENT_SETTINGS,
  qbittorrent: DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
};

const ITEM = {
  id: 'm1',
  title: 'Show',
  seriesTitle: 'Show',
  path: 'C:/media/show.mkv',
  fileName: 'show.mkv',
  addedAt: 1,
  episode: 7,
} as MediaItem;

/** Every patch the accept wrote, which is where a half record would show up. */
let patches: Array<Record<string, unknown>> = [];

function handler(channel: string): (...args: unknown[]) => unknown {
  const found = handlers.get(channel);
  if (typeof found !== 'function') throw new Error(`${channel} was never registered`);
  return found;
}

/** Waits for the mocked fetch to actually be waiting, not merely started. */
async function untilInFlight(): Promise<void> {
  for (let i = 0; i < 200 && !releaseFetch; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 1); });
  }
  if (!releaseFetch) throw new Error('the fetch never reached its wait');
}

beforeEach(() => {
  handlers.clear();
  cancelReadings = [];
  releaseFetch = null;
  patches = [];
  broadcasts = [];
  failNextFetch = null;
  registerSubtitleDiscoveryIpc({
    listItems: () => [ITEM],
    patchItems: (_ids: string[], patch: Record<string, unknown>) => { patches.push(patch); },
  });
});

// `running` and `cancelled` are module-level in the subject, so a test that
// throws before releasing its fetch leaves the id registered and every later
// test in the file reads a state it did not set. That turned one real mutation
// detection into two, which is a false reading in the flattering direction.
afterEach(async () => {
  releaseFetch?.();
  releaseFetch = null;
  // Two turns of the loop: one for the fetch to resume, one for its `finally`.
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await new Promise((resolve) => { setTimeout(resolve, 0); });
});

describe('subtitleDiscovery:cancel reaches the dialog’s acquisition', () => {
  it('the cancel-everything form stops a fetch that is already in flight', async () => {
    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean; message: string }>;
    await untilInFlight();

    // No argument: exactly what the job strip's Cancel button sends. It walks
    // `running`, so this is the call that used to iterate an empty set.
    await handler('subtitleDiscovery:cancel')({}, undefined);
    releaseFetch?.();
    const result = await accept;

    expect(cancelReadings).toEqual([false, true]);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Cancelled.');
    // The half-record half of the gate: nothing was written to the item.
    expect(patches).toEqual([]);
  });

  it('the per-item form stops it too', async () => {
    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean }>;
    await untilInFlight();

    await handler('subtitleDiscovery:cancel')({}, 'm1');
    releaseFetch?.();

    expect((await accept).ok).toBe(false);
    expect(cancelReadings).toEqual([false, true]);
  });

  it('reports itself as running while it fetches, and stops when it is done', async () => {
    const status = (): Promise<{ running: boolean }> =>
      handler('subtitleDiscovery:status')({}) as Promise<{ running: boolean }>;
    expect((await status()).running).toBe(false);

    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja');
    await untilInFlight();
    expect((await status()).running).toBe(true);

    releaseFetch?.();
    await accept;
    expect((await status()).running).toBe(false);
  });

  // CONTROL 1: the cancel is not ambient. A fetch nobody interrupted runs to
  // completion and writes its record, so "cancelled" above is the cancel doing
  // it and not the stand-in refusing on its own.
  it('CONTROL: an untouched fetch completes and writes its record', async () => {
    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean }>;
    await untilInFlight();

    releaseFetch?.();

    expect((await accept).ok).toBe(true);
    expect(cancelReadings).toEqual([false, false]);
    expect(patches).toHaveLength(1);
    expect(Array.isArray(patches[0].subtitles) && (patches[0].subtitles as unknown[]).length).toBe(1);
  });

  it('announces itself to the job strip, and ends on cancelled rather than error', async () => {
    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja');
    await untilInFlight();

    // Unfinished while it runs, which is the condition the Cancel button
    // renders on. Without this line the button never appears and the working
    // IPC behind it is unreachable by a person.
    const phases = (): string[] => broadcasts
      .filter((line) => line.channel === 'subtitleDiscovery:progress')
      .map((line) => (line.payload as { phase: string }).phase);
    expect(phases()).toEqual(['downloading']);

    await handler('subtitleDiscovery:cancel')({}, undefined);
    releaseFetch?.();
    await accept;

    // `cancelled`, not `error`: the row must not report a fault to the person
    // who stopped it.
    expect(phases()).toEqual(['downloading', 'cancelled']);
    const last = broadcasts[broadcasts.length - 1].payload as { mediaId: string; title: string; error?: string };
    expect(last.mediaId).toBe('m1');
    expect(last.title).toBe('Show');
    expect(last.error).toBeUndefined();
  });

  // CONTROL 3: the terminal phase is chosen, not fixed. A fetch that fails for
  // an ordinary reason ends on `error` and carries the reason, so `cancelled`
  // above is the cancel and not the only thing this path can say.
  it('CONTROL: an ordinary failure ends on error, carrying its reason', async () => {
    failNextFetch = 'qBittorrent is not enabled.';
    const accept = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean }>;
    await untilInFlight();
    releaseFetch?.();

    expect((await accept).ok).toBe(false);
    const last = broadcasts[broadcasts.length - 1].payload as { phase: string; error?: string };
    expect(last.phase).toBe('error');
    expect(last.error).toBe('qBittorrent is not enabled.');
  });

  // CONTROL 2: a cancel does not outlive the fetch it stopped. Without the
  // registration being dropped again, the next acquisition on the same item
  // would start already cancelled — a fetch nobody could run.
  it('CONTROL: the next fetch on the same item is not pre-cancelled', async () => {
    const first = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean }>;
    await untilInFlight();
    await handler('subtitleDiscovery:cancel')({}, 'm1');
    releaseFetch?.();
    expect((await first).ok).toBe(false);

    releaseFetch = null;
    cancelReadings = [];
    const second = handler('subtitleDiscovery:nyaaAccept')({}, 'm1', 'c1', ACQUISITION, 'ja') as
      Promise<{ ok: boolean }>;
    await untilInFlight();
    releaseFetch?.();

    expect((await second).ok).toBe(true);
    expect(cancelReadings).toEqual([false, false]);
  });
});
