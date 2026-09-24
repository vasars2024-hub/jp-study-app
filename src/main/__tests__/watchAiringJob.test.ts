// @vitest-environment node
//
// The airing-schedule job against a real watch-library file and a fake
// AniList: next episodes are stored, an aired episode of a watched title is
// announced once, and offline leaves the stored schedule alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  net: { isOnline: () => true, request: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import { __setWatchLibraryPathsForTests, addWatchTitle, readWatchLibrary, updateWatchTitle } from '../watchLibrary';
import { __setMalLibraryPathForTests } from '../malLibrary';
import { __setWatchAiringDepsForTests, runWatchAiringCheck } from '../watchAiring';
import type { AiredEpisode, AiringRow } from '../../shared/watchAiring';

const NOW = Date.UTC(2026, 8, 24, 12);
const HOUR = 3_600_000;
let dir: string;
let clock: number;
let online: boolean;
let answer: AiringRow[] | null;
let asked: Array<{ by: string; ids: readonly number[] }>;
let announced: AiredEpisode[][];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-watch-airing-'));
  __setWatchLibraryPathsForTests({ watch: () => path.join(dir, 'watch-library.json'), media: () => path.join(dir, 'media.json') });
  __setMalLibraryPathForTests(() => path.join(dir, 'mal-library.json'));
  clock = NOW;
  online = true;
  asked = [];
  announced = [];
  answer = [];
  __setWatchAiringDepsForTests({
    fetchBatch: async (ids, by) => {
      asked.push({ by, ids });
      return answer;
    },
    online: () => online,
    statePath: () => path.join(dir, 'watch-airing.json'),
    announce: (episodes) => {
      announced.push(episodes);
      return true;
    },
  });
  addWatchTitle({ kind: 'anime', title: 'Airing Show', malId: 100, status: 'watching' }, NOW - 10 * HOUR);
  addWatchTitle({ kind: 'anime', title: 'Planned Show', anilistId: 200, status: 'plan' }, NOW - 10 * HOUR);
  addWatchTitle({ kind: 'anime', title: 'Old Show', malId: 300, status: 'completed' }, NOW - 10 * HOUR);
});

afterEach(() => {
  __setWatchAiringDepsForTests(null);
  __setWatchLibraryPathsForTests(null);
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const byTitle = (name: string) => readWatchLibrary().titles.find((title) => title.title === name);

describe('airing-schedule job', () => {
  it('stores next episodes from batched AniList answers, only for watching / plan titles', async () => {
    answer = [
      { anilistId: 1, malId: 100, status: 'RELEASING', nextEpisode: 6, nextAiringAt: NOW + 2 * HOUR },
      { anilistId: 200, status: 'RELEASING', nextEpisode: 1, nextAiringAt: NOW + 48 * HOUR },
    ];
    const status = await runWatchAiringCheck(() => clock);
    expect(asked).toEqual([{ by: 'mal', ids: [100] }, { by: 'anilist', ids: [200] }]);
    expect(byTitle('Airing Show')?.nextAiring).toEqual({ episode: 6, at: NOW + 2 * HOUR });
    expect(byTitle('Planned Show')?.nextAiring).toEqual({ episode: 1, at: NOW + 48 * HOUR });
    expect(byTitle('Old Show')?.nextAiring).toBeUndefined();
    expect(status).toMatchObject({ lastCheckedAt: NOW, lastError: null, scheduled: 2, checked: 2 });
  });

  it('announces an aired episode once, even offline, and keeps the schedule when offline', async () => {
    answer = [{ anilistId: 1, malId: 100, nextEpisode: 6, nextAiringAt: NOW + 2 * HOUR }];
    await runWatchAiringCheck(() => clock);
    expect(announced).toEqual([]);

    clock = NOW + 3 * HOUR; // episode 6 has aired
    online = false;
    const offline = await runWatchAiringCheck(() => clock);
    expect(offline.lastError).toBe('offline');
    expect(announced).toEqual([[expect.objectContaining({ title: 'Airing Show', episode: 6 })]]);
    expect(byTitle('Airing Show')?.nextAiring?.episode).toBe(6);

    await runWatchAiringCheck(() => clock);
    expect(announced, 'once per episode').toHaveLength(1);

    online = true;
    answer = [{ anilistId: 1, malId: 100, nextEpisode: 7, nextAiringAt: NOW + 170 * HOUR }];
    await runWatchAiringCheck(() => clock);
    expect(byTitle('Airing Show')?.nextAiring?.episode).toBe(7);
    expect(announced).toHaveLength(1);
  });

  it('keeps the stored schedule when AniList does not answer', async () => {
    answer = [{ anilistId: 1, malId: 100, nextEpisode: 6, nextAiringAt: NOW + 2 * HOUR }];
    await runWatchAiringCheck(() => clock);
    answer = null;
    const status = await runWatchAiringCheck(() => clock);
    expect(status.lastError).toBe('unreachable');
    expect(byTitle('Airing Show')?.nextAiring?.episode).toBe(6);
  });

  it('a user edit does not wipe the schedule', async () => {
    answer = [{ anilistId: 1, malId: 100, nextEpisode: 6, nextAiringAt: NOW + 2 * HOUR }];
    await runWatchAiringCheck(() => clock);
    const id = byTitle('Airing Show')?.id as string;
    updateWatchTitle(id, { progress: 5 }, NOW + HOUR);
    expect(byTitle('Airing Show')?.nextAiring?.episode).toBe(6);
  });
});
