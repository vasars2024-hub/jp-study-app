// @vitest-environment node

/**
 * The YouTube playlist auto-update clock, and what is allowed to move it.
 *
 * Three defects share one sentence with the subtitle chain: a request that never
 * answered was written down as an answer, and the record then suppressed the
 * retry that would have corrected it.
 *
 *   D240 — `yt:refreshChannel` stamped `lastCheckedAt` on every playlist of the
 *          channel, including the ones whose sync returned `{ error }`.
 *   D241 — `addVideoByUrl` stored the raw 11-character video id as the title when
 *          yt-dlp did not answer, and the next save of the same URL short-circuited
 *          on `duplicate: true` without re-asking.
 *   D242 — the auto-update sweep had no caller at all, so the shipped
 *          "Update automatically" checkbox and its frequency select persisted a
 *          preference nothing read.
 *
 * Nothing here spawns a process or touches the network: `electron` is stubbed onto
 * a temp userData dir and `../media` supplies a scripted `ytDlpJson`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeYtStore } from '../../shared/ytPlaylists';
import type { YtPlaylist, YtPlaylistsStore, YtVideo } from '../../shared/ytPlaylists';

const HOUR = 60 * 60 * 1000;

let userDataDir = '';
/** Queue of replies `ytDlpJson` hands out, oldest first. */
let ytDlpReplies: Array<{ ok: true; data: unknown } | { ok: false; error: string }> = [];
let ytDlpCalls: string[][] = [];

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
    return ytDlpReplies.shift() ?? { ok: false as const, error: 'no scripted reply' };
  },
  ytDlpSubtitleLangs: async () => [],
  withYtDlpJsRuntime: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const handlers = new Map<string, unknown>();

const { addVideoByUrl, registerYtPlaylistsIpc, runAutoUpdateDue } = await import('../ytPlaylists');

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

/** A `-J --flat-playlist` reply carrying `n` entries. */
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

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-clock-'));
  ytDlpReplies = [];
  ytDlpCalls = [];
});

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// D240 — a failed sync is not a check
// ---------------------------------------------------------------------------

describe('D240 — yt:refreshChannel and the failed sync', () => {
  it('does not stamp lastCheckedAt on a playlist whose sync failed', async () => {
    writeStore({
      channels: [
        {
          id: 'c1',
          channelId: 'UCzzz',
          title: 'Chan',
          subscriptionStatus: 'subscribed',
          updateFrequencyHours: 12,
          playlistIds: ['p1'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [playlist({ id: 'p1', channelId: 'UCzzz' })],
    });
    ytDlpReplies = [{ ok: false, error: 'HTTP Error 429: Too Many Requests' }];

    const out = await invoke<{ errors: string[] }>('yt:refreshChannel', 'UCzzz');

    expect(out.errors).toHaveLength(1);
    const after = readStore();
    expect(after.playlists[0].lastCheckedAt).toBeUndefined();
    expect(after.channels[0].lastCheckedAt).toBeUndefined();
  });

  it('stamps both when the sync succeeds', async () => {
    writeStore({
      channels: [
        {
          id: 'c1',
          channelId: 'UCzzz',
          title: 'Chan',
          subscriptionStatus: 'subscribed',
          updateFrequencyHours: 12,
          playlistIds: ['p1'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [playlist({ id: 'p1', channelId: 'UCzzz' })],
    });
    ytDlpReplies = [flatReply('Chan uploads', ['aaaaaaaaaaa'])];

    const out = await invoke<{ errors: string[]; refreshedPlaylistIds: string[] }>(
      'yt:refreshChannel',
      'UCzzz',
    );

    expect(out.errors).toEqual([]);
    expect(out.refreshedPlaylistIds).toEqual(['p1']);
    const after = readStore();
    expect(after.playlists[0].lastCheckedAt).toBeGreaterThan(0);
    expect(after.channels[0].lastCheckedAt).toBeGreaterThan(0);
  });

  it('leaves the failed half of a mixed refresh due, and the succeeded half checked', async () => {
    writeStore({
      channels: [
        {
          id: 'c1',
          channelId: 'UCzzz',
          title: 'Chan',
          subscriptionStatus: 'subscribed',
          updateFrequencyHours: 12,
          playlistIds: ['p1', 'p2'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [
        playlist({ id: 'p1', channelId: 'UCzzz' }),
        playlist({ id: 'p2', channelId: 'UCzzz' }),
      ],
    });
    ytDlpReplies = [flatReply('ok', ['aaaaaaaaaaa']), { ok: false, error: 'network unreachable' }];

    await invoke('yt:refreshChannel', 'UCzzz');

    const after = readStore();
    expect(after.playlists.find((p) => p.id === 'p1')?.lastCheckedAt).toBeGreaterThan(0);
    expect(after.playlists.find((p) => p.id === 'p2')?.lastCheckedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D243 — the channel clock is derived, not stored. Pinned so the next reader of
// `YtChannel.lastCheckedAt` does not take it for an independent field.
// ---------------------------------------------------------------------------

describe('D243 — YtChannel.lastCheckedAt is overwritten on read', () => {
  it('takes the value from its playlist, discarding what was written to it', () => {
    const written = Date.now() - 30 * HOUR;
    writeStore({
      channels: [
        {
          id: 'c1',
          channelId: 'UCzzz',
          title: 'Chan',
          subscriptionStatus: 'subscribed',
          updateFrequencyHours: 12,
          lastCheckedAt: written,
          playlistIds: ['p1'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [playlist({ id: 'p1', channelId: 'UCzzz', lastCheckedAt: written + 29 * HOUR })],
    });

    // `normalizeYtStore` runs on every `readStore()`, so this is what main sees.
    const seen = normalizeYtStore(JSON.parse(fs.readFileSync(storeFile(), 'utf-8')));

    expect(seen.channels[0].lastCheckedAt).toBe(written + 29 * HOUR);
    expect(seen.channels[0].lastCheckedAt).not.toBe(written);
  });
});

// ---------------------------------------------------------------------------
// D242 — the sweep the checkbox promises
// ---------------------------------------------------------------------------

describe('D242 — runAutoUpdateDue', () => {
  it('syncs a playlist that is past its own frequency window', async () => {
    writeStore({
      playlists: [playlist({ id: 'p1', lastCheckedAt: Date.now() - 13 * HOUR })],
    });
    ytDlpReplies = [flatReply('Fresh', ['aaaaaaaaaaa', 'bbbbbbbbbbb'])];

    await runAutoUpdateDue();

    expect(ytDlpCalls).toHaveLength(1);
    expect(readStore().videos).toHaveLength(2);
  });

  it('leaves a playlist inside its window alone', async () => {
    writeStore({ playlists: [playlist({ id: 'p1', lastCheckedAt: Date.now() - 1 * HOUR })] });

    await runAutoUpdateDue();

    expect(ytDlpCalls).toEqual([]);
  });

  it('respects the autoUpdate checkbox — off means never swept', async () => {
    writeStore({
      playlists: [playlist({ id: 'p1', autoUpdate: false, lastCheckedAt: Date.now() - 99 * HOUR })],
    });

    await runAutoUpdateDue();

    expect(ytDlpCalls).toEqual([]);
  });

  it('sweeps a stale playlist that BELONGS TO A TRACKED CHANNEL — the self-negating filter', async () => {
    // This is the whole defect. `normalizeYtStore` copies the playlist's clock and
    // frequency onto its channel, so the old `!dueChannels.has(p.channelId)` clause
    // was the negation of the due test standing right beside it: `due && !due`.
    // Every playlist with a `channelId` was excluded, permanently.
    const stale = Date.now() - 30 * HOUR;
    writeStore({
      channels: [
        {
          id: 'c1',
          channelId: 'UCzzz',
          title: 'Chan',
          subscriptionStatus: 'subscribed',
          updateFrequencyHours: 12,
          lastCheckedAt: stale,
          playlistIds: ['p1'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [playlist({ id: 'p1', channelId: 'UCzzz', lastCheckedAt: stale })],
    });
    ytDlpReplies = [flatReply('Chan uploads', ['aaaaaaaaaaa'])];

    await runAutoUpdateDue();

    expect(ytDlpCalls).toHaveLength(1);
    expect(readStore().playlists[0].lastCheckedAt).toBeGreaterThan(stale);
  });

  it('leaves a failed sweep due, so the next tick re-asks', async () => {
    const stale = Date.now() - 30 * HOUR;
    writeStore({
      playlists: [playlist({ id: 'p1', channelId: 'UCzzz', lastCheckedAt: stale })],
    });
    ytDlpReplies = [{ ok: false, error: 'HTTP Error 403' }];

    await runAutoUpdateDue();

    expect(readStore().playlists[0].lastCheckedAt).toBe(stale);
  });

  it('is still reachable on the IPC channel the preload binding uses', async () => {
    writeStore({ playlists: [playlist({ id: 'p1', lastCheckedAt: Date.now() - 13 * HOUR })] });
    ytDlpReplies = [flatReply('Fresh', ['aaaaaaaaaaa'])];

    await invoke('yt:autoUpdateDue');

    expect(ytDlpCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D241 — a hollow row is not the answer
// ---------------------------------------------------------------------------

describe('D241 — addVideoByUrl after a yt-dlp outage', () => {
  const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  function meta(over: Record<string, unknown>): { ok: true; data: unknown } {
    return { ok: true, data: { title: 'Real title', duration: 212, channel: 'Real channel', ...over } };
  }

  it('still stores the capture when yt-dlp does not answer', async () => {
    writeStore({});
    ytDlpReplies = [{ ok: false, error: 'yt-dlp not found' }];

    const out = await addVideoByUrl(URL);

    expect(out.ok).toBe(true);
    const v = readStore().videos[0] as YtVideo;
    expect(v.youtubeId).toBe('dQw4w9WgXcQ');
    expect(v.title).toBe('dQw4w9WgXcQ');
    expect(v.durationSec).toBeUndefined();
  });

  it('re-asks on the next save of the same URL and patches the row in place', async () => {
    writeStore({});
    ytDlpReplies = [{ ok: false, error: 'yt-dlp not found' }, meta({})];

    const first = await addVideoByUrl(URL);
    const second = await addVideoByUrl(URL);

    expect(ytDlpCalls).toHaveLength(2);
    expect(second).toMatchObject({ ok: true, duplicate: true });
    const after = readStore();
    expect(after.videos).toHaveLength(1);
    expect(after.videos[0].id).toBe((first as { videoId: string }).videoId);
    expect(after.videos[0].title).toBe('Real title');
    expect(after.videos[0].durationSec).toBe(212);
    expect(after.videos[0].channelTitle).toBe('Real channel');
  });

  it('keeps progress the user earned on the hollow row', async () => {
    writeStore({});
    ytDlpReplies = [{ ok: false, error: 'offline' }, meta({})];
    await addVideoByUrl(URL);

    const mid = readStore();
    mid.videos[0].downloaded = true;
    mid.videos[0].transcribed = true;
    fs.writeFileSync(storeFile(), JSON.stringify(mid), 'utf-8');

    await addVideoByUrl(URL);

    const after = readStore();
    expect(after.videos[0].downloaded).toBe(true);
    expect(after.videos[0].transcribed).toBe(true);
    expect(after.videos[0].title).toBe('Real title');
  });

  it('does NOT re-ask for a row that already has real metadata', async () => {
    writeStore({});
    ytDlpReplies = [meta({})];

    await addVideoByUrl(URL);
    const before = ytDlpCalls.length;
    const again = await addVideoByUrl(URL);

    expect(again).toMatchObject({ duplicate: true });
    expect(ytDlpCalls).toHaveLength(before);
  });
});
