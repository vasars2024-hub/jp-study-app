// @vitest-environment node
//
// The YouTube manager takes channel URLs (@handle, /channel/UC…, /c/…,
// /user/…) as their uploads, and a playlist download asks for auto-generated
// ja/en captions alongside creator subtitles, with the options passed through IPC.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { YouTubeDownloadOptions } from '../../shared/types';
import { parseYoutubeChannelUrl } from '../../shared/ytPlaylists';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yt-channel-'));
const handlers = new Map<string, unknown>();
let ytDlpCalls: string[][] = [];
let ytDlpReplies: Array<{ ok: true; data: unknown } | { ok: false; error: string }> = [];
let downloadCalls: Array<{ url: string; opts: YouTubeDownloadOptions }> = [];

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  ipcMain: { handle: (channel: string, fn: unknown) => handlers.set(channel, fn) },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../media', () => ({
  downloadYoutubeUrl: async (url: string, opts: YouTubeDownloadOptions) => {
    downloadCalls.push({ url, opts });
    return { error: 'stub' };
  },
  findYtDlp: async () => null,
  ytDlpJson: async (args: string[]) => {
    ytDlpCalls.push(args);
    return ytDlpReplies.shift() ?? { ok: false as const, error: 'no scripted reply' };
  },
  ytDlpSubtitleLangs: async () => [],
  withYtDlpJsRuntime: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const { registerYtPlaylistsIpc } = await import('../ytPlaylists');
registerYtPlaylistsIpc();

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(channel);
  if (typeof fn !== 'function') throw new Error(`no handler for ${channel}`);
  return Promise.resolve((fn as (...a: unknown[]) => T)({ sender: { send: () => undefined } } as never, ...args));
}

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

beforeEach(() => {
  ytDlpCalls = [];
  ytDlpReplies = [];
  downloadCalls = [];
  fs.rmSync(path.join(userDataDir, 'yt-playlists.json'), { force: true });
});

afterAll(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

describe('channel URLs', () => {
  it('recognises the shapes people paste, and leaves playlists alone', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/@nihongo_teacher')).toMatchObject({
      kind: 'handle', value: 'nihongo_teacher', fetchUrl: 'https://www.youtube.com/@nihongo_teacher/videos',
    });
    expect(parseYoutubeChannelUrl('youtube.com/@nihongo_teacher/featured')?.kind).toBe('handle');
    expect(parseYoutubeChannelUrl(`https://m.youtube.com/channel/${CHANNEL_ID}/videos`)).toMatchObject({
      kind: 'channel', uploadsPlaylistId: `UU${CHANNEL_ID.slice(2)}`,
    });
    expect(parseYoutubeChannelUrl('https://www.youtube.com/c/SomeName')?.fetchUrl).toBe('https://www.youtube.com/c/SomeName/videos');
    expect(parseYoutubeChannelUrl('https://www.youtube.com/user/oldname')?.kind).toBe('user');
    expect(parseYoutubeChannelUrl('https://www.youtube.com/playlist?list=PLx')).toBeNull();
    expect(parseYoutubeChannelUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(parseYoutubeChannelUrl('https://example.com/@someone')).toBeNull();
  });

  it('adds an @handle channel as its uploads, named after the channel', async () => {
    ytDlpReplies.push({
      ok: true,
      data: {
        id: CHANNEL_ID, channel_id: CHANNEL_ID, title: 'Nihongo Teacher - Videos', channel: 'Nihongo Teacher',
        entries: [{ id: 'vid00000001', title: 'Lesson 1', duration: 300 }, { id: 'vid00000002', title: 'Lesson 2', duration: 320 }],
      },
    });
    const result = await invoke<{ playlist?: { youtubePlaylistId: string; title: string; url: string }; error?: string }>(
      'yt:addPlaylist', 'https://www.youtube.com/@nihongo_teacher',
    );
    expect(result.error).toBeUndefined();
    expect(ytDlpCalls[0].at(-1)).toBe('https://www.youtube.com/@nihongo_teacher/videos');
    expect(result.playlist).toMatchObject({ youtubePlaylistId: `UU${CHANNEL_ID.slice(2)}`, title: 'Nihongo Teacher' });
  });

  it('fetches a /channel/UC… URL through its uploads playlist', async () => {
    ytDlpReplies.push({ ok: true, data: { id: `UU${CHANNEL_ID.slice(2)}`, title: 'Uploads from X', entries: [{ id: 'vid00000003', title: 'a' }] } });
    await invoke('yt:addPlaylist', `https://www.youtube.com/channel/${CHANNEL_ID}`);
    expect(ytDlpCalls[0].at(-1)).toBe(`https://www.youtube.com/playlist?list=UU${CHANNEL_ID.slice(2)}`);
  });

  it('refuses anything else with a sentence, without calling yt-dlp', async () => {
    const result = await invoke<{ error?: string }>('yt:addPlaylist', 'https://www.youtube.com/watch?v=abcdefghijk');
    expect(result.error).toMatch(/not a YouTube playlist or channel/);
    expect(ytDlpCalls).toEqual([]);
  });
});

describe('playlist downloads', () => {
  it('ask for creator subtitles and auto captions in ja and en, through the IPC options', async () => {
    ytDlpReplies.push({ ok: true, data: { id: 'PLreal', title: 'P', entries: [{ id: 'vid00000009', title: 'x' }] } });
    const added = await invoke<{ store: { videos: Array<{ id: string }> } }>('yt:addPlaylist', 'https://www.youtube.com/playlist?list=PLreal');
    const videoId = added.store.videos[0].id;

    await invoke('yt:downloadVideos', [videoId], { autoCaptions: true });
    expect(downloadCalls[0].opts).toMatchObject({ autoCaptions: true });
    expect(downloadCalls[0].opts.subtitleLangs).toEqual(expect.arrayContaining(['ja', 'en']));

    await invoke('yt:downloadVideos', [videoId], { autoCaptions: false });
    expect(downloadCalls[1].opts.autoCaptions).toBe(false);

    // An old caller that sends no options still gets auto captions.
    await invoke('yt:downloadVideos', [videoId]);
    expect(downloadCalls[2].opts.autoCaptions).toBe(true);
  });
});
