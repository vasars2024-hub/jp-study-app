// @vitest-environment node
/**
 * YouTube 7.5: the unattended subscription sweep is rate-limited (oldest first,
 * capped per tick, spaced) and raises ONE notice for the videos it found —
 * never for a playlist's first check, which would list its whole back catalogue.
 * Nothing spawns a process: `../media` supplies a scripted `ytDlpJson`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { YtPlaylist, YtPlaylistsStore } from '../../shared/ytPlaylists';
import { YT5_MAX_CHECKS_PER_SWEEP } from '../../shared/youtubeStudy5';

const HOUR = 60 * 60 * 1000;
let userDataDir = '';
let ytDlpReplies: Array<{ ok: true; data: unknown } | { ok: false; error: string }> = [];
let ytDlpCalls: string[][] = [];
const notices: Array<{ title: string; body: string }> = [];

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  ipcMain: { handle: () => undefined },
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
  withYtDlpJsRuntime: async (args: string[]) => args,
}));

vi.mock('../lockedNotifications', () => ({
  showNativeNotification: (notice: { title: string; body: string }) => {
    notices.push(notice);
    return 'shown';
  },
}));

let sweep: typeof import('../ytPlaylists');
beforeAll(async () => {
  sweep = await import('../ytPlaylists');
});
const runAutoUpdateDue = () => sweep.runAutoUpdateDue();
const setYtSweepSpacingForTests = (ms: number | null) => sweep?.setYtSweepSpacingForTests(ms);

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

function flatReply(title: string, ids: string[]): { ok: true; data: unknown } {
  return { ok: true, data: { title, id: 'PLreal', entries: ids.map((id, i) => ({ id, title: `${title} v${i}`, duration: 60 })) } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-sweep5-'));
  ytDlpReplies = [];
  ytDlpCalls = [];
  notices.length = 0;
  setYtSweepSpacingForTests(0);
});

afterEach(() => {
  setYtSweepSpacingForTests(null);
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe('rate-limited subscription sweep', () => {
  it('checks at most the per-sweep cap, oldest first, and leaves the rest due', async () => {
    const now = Date.now();
    const playlists = Array.from({ length: YT5_MAX_CHECKS_PER_SWEEP + 3 }, (_, i) =>
      playlist({ id: `p${String(i).padStart(2, '0')}`, lastCheckedAt: now - (20 + i) * HOUR }));
    writeStore({ playlists });
    ytDlpReplies = playlists.map((p) => flatReply(p.id, []));

    await runAutoUpdateDue();

    expect(ytDlpCalls).toHaveLength(YT5_MAX_CHECKS_PER_SWEEP);
    // The three stalest went first; the three most recently checked wait for the next tick.
    const urls = ytDlpCalls.map((args) => args.find((a) => a.includes('list=')) ?? '').join(' ');
    expect(urls).toContain(`list=p${String(YT5_MAX_CHECKS_PER_SWEEP + 2).padStart(2, '0')}`);
    expect(urls).not.toContain('list=p00');
  });

  it('notifies once for new videos, but not on a playlist first check', async () => {
    writeStore({
      playlists: [
        playlist({ id: 'seen', title: 'News', lastCheckedAt: Date.now() - 30 * HOUR }),
        playlist({ id: 'fresh', title: 'Brand new' }),
      ],
      videos: [{
        id: 'v-old', playlistId: 'seen', youtubeId: 'aaaaaaaaaaa', title: 'Old', url: 'https://youtu.be/aaaaaaaaaaa',
        downloaded: false, hasOfficialSubs: null, transcribed: false,
      }],
    });
    // Never-checked first (oldest), then the seen one.
    ytDlpReplies = [flatReply('Brand new', ['ccccccccccc']), flatReply('News', ['aaaaaaaaaaa', 'bbbbbbbbbbb'])];

    await runAutoUpdateDue();
    await settle();

    expect(notices).toHaveLength(1);
    expect(notices[0].title).toMatch(/1 new video/);
    expect(notices[0].body).toContain('News v1');
    expect(notices[0].body).not.toContain('Brand new v0');
  });

  it('stays quiet when nothing new arrived', async () => {
    writeStore({ playlists: [playlist({ id: 'seen', lastCheckedAt: Date.now() - 30 * HOUR })] });
    ytDlpReplies = [flatReply('seen', [])];
    await runAutoUpdateDue();
    await settle();
    expect(notices).toEqual([]);
  });
});
