// @vitest-environment node

/**
 * The YouTube store's lost-update race, and the timer that has to exist for it
 * to matter. Both were found by the 2026-09-08 boss audit against committed code.
 *
 *   F1 (P0) — every writer read a whole-store snapshot, awaited a provider, then
 *             wrote that snapshot back. `writeStore` persists the WHOLE store, so
 *             the unattended auto-update sweep silently reverted every folder
 *             save, `autoUpdate` toggle and playlist removal made while it ran.
 *             A sweep is minutes long and nobody starts it, so the user has no
 *             reason to expect their work to be at risk.
 *
 *   F2 (P2) — `ytAutoUpdateClock.test.ts` calls `runAutoUpdateDue` directly and
 *             never starts the clock, so `startYtAutoUpdateTimer`'s body could be
 *             emptied and all 14 of its cases still pass: the checkbox could go
 *             inert again with its own named suite green.
 *
 * The instrument that makes F1 observable is `ytDlpGate`: the scripted provider
 * parks inside its call until the test releases it, which is the only way to get
 * a user write to land *between* a sweep's read and its write. Without it every
 * sweep completes before the next statement and the race cannot be reached.
 *
 * Nothing here spawns a process or touches the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { YtPlaylist, YtPlaylistsStore } from '../../shared/ytPlaylists';

let userDataDir = '';
let ytDlpReplies: Array<{ ok: true; data: unknown } | { ok: false; error: string }> = [];
let ytDlpCalls: string[][] = [];
/** While set, the scripted provider parks here instead of answering. */
let ytDlpGate: Promise<void> | null = null;

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  ipcMain: { handle: (channel: string, fn: unknown) => handlers.set(channel, fn) },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../media', () => ({
  downloadYoutubeUrl: async () => ({ ok: false as const, error: 'stub' }),
  findYtDlp: async () => null,
  ytDlpJson: async (args: string[]) => {
    ytDlpCalls.push(args);
    if (ytDlpGate) await ytDlpGate;
    return ytDlpReplies.shift() ?? { ok: false as const, error: 'no scripted reply' };
  },
  ytDlpSubtitleLangs: async () => [],
  withYtDlpJsRuntime: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const handlers = new Map<string, unknown>();

const { registerYtPlaylistsIpc, runAutoUpdateDue, startYtAutoUpdateTimer, stopYtAutoUpdateTimer } =
  await import('../ytPlaylists');

registerYtPlaylistsIpc();

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(channel);
  if (typeof fn !== 'function') throw new Error(`no handler for ${channel}`);
  return Promise.resolve((fn as (...a: unknown[]) => T)({} as never, ...args));
}

function storeFile(): string {
  return path.join(userDataDir, 'yt-playlists.json');
}

function playlist(over: Partial<YtPlaylist> & { id: string }): YtPlaylist {
  return {
    title: over.id,
    url: `https://www.youtube.com/playlist?list=${over.id}`,
    youtubePlaylistId: over.id,
    subscriptionStatus: 'subscribed',
    lang: 'ja',
    preferSubs: ['ja'],
    autoUpdate: true,
    updateFrequencyHours: 12,
    sortDefault: 'playlist',
    createdAt: 1,
    ...over,
  };
}

function writeStore(store: Partial<YtPlaylistsStore>): void {
  fs.writeFileSync(
    storeFile(),
    JSON.stringify({ version: 1, playlists: [], videos: [], channels: [], folders: [], ...store }),
    'utf-8',
  );
}

function readStore(): YtPlaylistsStore {
  return JSON.parse(fs.readFileSync(storeFile(), 'utf-8')) as YtPlaylistsStore;
}

function flatReply(title: string, ids: string[]): { ok: true; data: unknown } {
  return {
    ok: true,
    data: {
      title,
      id: 'PLreal',
      entries: ids.map((id, i) => ({ id, title: `v${i}`, duration: 60 })),
    },
  };
}

/** Open the provider gate and hand back the release. */
function holdProvider(): () => void {
  let release!: () => void;
  ytDlpGate = new Promise<void>((resolve) => {
    release = () => {
      ytDlpGate = null;
      resolve();
    };
  });
  return release;
}

/** Let the parked sweep reach its `await`, so a concurrent write lands mid-flight. */
async function untilProviderCalled(): Promise<void> {
  for (let i = 0; i < 20 && ytDlpCalls.length === 0; i++) await Promise.resolve();
  expect(ytDlpCalls.length).toBeGreaterThan(0);
}

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-race-'));
  ytDlpReplies = [];
  ytDlpCalls = [];
  ytDlpGate = null;
});

afterEach(() => {
  stopYtAutoUpdateTimer();
  vi.useRealTimers();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// F1 — a write made during a sweep must survive the sweep
// ---------------------------------------------------------------------------

describe('F1 — the unattended sweep must not revert concurrent writes', () => {
  it('keeps a folder saved while the sweep was in flight', async () => {
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a', 'b'])];

    const release = holdProvider();
    const sweep = runAutoUpdateDue();
    await untilProviderCalled();

    await invoke('yt:saveFolder', { id: 'f1', name: 'Anime' });
    expect(readStore().folders.map((f) => f.id)).toEqual(['f1']);

    release();
    await sweep;

    expect(readStore().folders.map((f) => f.id)).toEqual(['f1']);
  });

  it('keeps autoUpdate off when it is turned off while the sweep is in flight', async () => {
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a'])];

    const release = holdProvider();
    const sweep = runAutoUpdateDue();
    await untilProviderCalled();

    await invoke('yt:setPlaylistPrefs', 'p1', { autoUpdate: false });
    expect(readStore().playlists[0].autoUpdate).toBe(false);

    release();
    await sweep;

    expect(readStore().playlists[0].autoUpdate).toBe(false);
  });

  it('keeps a playlist removed while the sweep is in flight removed', async () => {
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a', 'b'])];

    const release = holdProvider();
    const sweep = runAutoUpdateDue();
    await untilProviderCalled();

    await invoke('yt:removePlaylist', 'p1');
    expect(readStore().playlists).toHaveLength(0);

    release();
    await sweep;

    const after = readStore();
    expect(after.playlists).toHaveLength(0);
    // The videos the in-flight response carried must not arrive on their own
    // either — a resurrected row with no playlist is worse than nothing.
    expect(after.videos).toHaveLength(0);
  });

  it('still lands the sweep result when nothing writes concurrently', async () => {
    // The positive control. Every assertion above is also satisfied by a sweep
    // that writes nothing at all, so the fix has to be shown still working.
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a', 'b'])];

    await runAutoUpdateDue();

    const after = readStore();
    expect(after.videos.map((v) => v.youtubeId).sort()).toEqual(['a', 'b']);
    expect(after.playlists[0].lastCheckedAt).toBeGreaterThan(0);
  });

  it('a user-driven refresh does not revert a folder saved during it', async () => {
    // The same window is open on every long writer, not only the timer. Guarding
    // timer-versus-timer overlap alone would leave this one wide open.
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a'])];

    const release = holdProvider();
    const refresh = invoke('yt:refreshPlaylist', 'p1');
    await untilProviderCalled();

    await invoke('yt:saveFolder', { id: 'f2', name: 'Grammar' });
    release();
    await refresh;

    expect(readStore().folders.map((f) => f.id)).toEqual(['f2']);
    expect(readStore().videos.map((v) => v.youtubeId)).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// F2 — the clock's own body has to be covered
// ---------------------------------------------------------------------------

describe('F2 — the auto-update clock lifecycle', () => {
  it('runs a sweep on its own after the first-tick delay', async () => {
    vi.useFakeTimers();
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a'])];

    startYtAutoUpdateTimer();
    expect(ytDlpCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(ytDlpCalls).toHaveLength(1);
    expect(readStore().videos.map((v) => v.youtubeId)).toEqual(['a']);
  });

  it('keeps ticking on the hourly interval after the first tick', async () => {
    vi.useFakeTimers();
    writeStore({ playlists: [playlist({ id: 'p1', updateFrequencyHours: 1 })] });
    ytDlpReplies = [flatReply('P1', ['a']), flatReply('P1', ['a', 'b'])];

    startYtAutoUpdateTimer();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(ytDlpCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ytDlpCalls).toHaveLength(2);
  });

  it('does not sweep when it is stopped before the first tick', async () => {
    vi.useFakeTimers();
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a'])];

    startYtAutoUpdateTimer();
    stopYtAutoUpdateTimer();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(ytDlpCalls).toHaveLength(0);
    expect(readStore().videos).toHaveLength(0);
  });

  it('starting twice arms one clock, not two', async () => {
    vi.useFakeTimers();
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a']), flatReply('P1', ['a'])];

    startYtAutoUpdateTimer();
    startYtAutoUpdateTimer();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(ytDlpCalls).toHaveLength(1);
  });

  it('can be stopped and started again', async () => {
    vi.useFakeTimers();
    writeStore({ playlists: [playlist({ id: 'p1' })] });
    ytDlpReplies = [flatReply('P1', ['a'])];

    startYtAutoUpdateTimer();
    stopYtAutoUpdateTimer();
    startYtAutoUpdateTimer();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(ytDlpCalls).toHaveLength(1);
  });
});
