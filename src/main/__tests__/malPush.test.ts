// @vitest-environment node
//
// "Push changes to MAL": the diff between the watch library and the stored
// MAL rows, sent only through an explicit call, against a mocked MAL client —
// the real MalSyncClient over a fake transport, so the PATCH bodies are the
// ones MAL would receive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  net: { request: (): void => undefined },
  safeStorage: { isEncryptionAvailable: (): boolean => false },
  shell: { openExternal: async (): Promise<void> => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import { MalSyncClient, type MalHttpRequest, type MalTokens } from '../malSync';
import { malPushPreview, pushWatchChangesToMal } from '../malPush';
import { __setMalLibraryPathForTests, applyMalLibrarySync, readMalLibrary } from '../malLibrary';
import {
  __setWatchLibraryPathsForTests,
  addWatchTitle,
  readWatchLibrary,
  recordWatchLocalProgress,
  updateWatchTitle,
} from '../watchLibrary';

const NOW = Date.UTC(2026, 8, 24, 12);
let dir: string;
let sent: MalHttpRequest[];
let failWith: number | null;

function client(): MalSyncClient {
  let tokens: MalTokens | null = { accessToken: 'FAKE', refreshToken: 'FAKE-R', expiresAt: 4_000_000_000_000 };
  return new MalSyncClient({
    transport: async (request) => {
      sent.push(request);
      if (failWith) return { status: failWith, body: '' };
      const body = new URLSearchParams(request.body ?? '');
      return {
        status: 200,
        body: JSON.stringify({
          status: body.get('status') ?? 'watching',
          score: Number(body.get('score') ?? 0),
          num_episodes_watched: Number(body.get('num_watched_episodes') ?? 0),
          is_rewatching: body.get('is_rewatching') === 'true',
          updated_at: new Date(NOW).toISOString(),
        }),
      };
    },
    store: {
      read: () => tokens,
      write: (next) => { tokens = next; },
      clear: () => { tokens = null; },
      encrypted: () => true,
    },
    config: () => ({ clientId: 'fake-client', clientSecret: '', redirectUri: undefined }),
    now: () => NOW,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-mal-push-'));
  __setWatchLibraryPathsForTests({ watch: () => path.join(dir, 'watch-library.json'), media: () => path.join(dir, 'media.json') });
  __setMalLibraryPathForTests(() => path.join(dir, 'mal-library.json'));
  sent = [];
  failWith = null;
  // The MAL list as last fetched and saved: two shows.
  applyMalLibrarySync({
    media: 'anime',
    entries: [
      { animeId: 1, title: 'Show One', totalEpisodes: 12, status: 'watching', episodesWatched: 3, score: 0, rewatching: false, updatedAt: '2026-09-01T00:00:00Z' },
      { animeId: 2, title: 'Show Two', totalEpisodes: 24, status: 'plan_to_watch', episodesWatched: 0, score: 0, rewatching: false, updatedAt: '2026-09-01T00:00:00Z' },
    ],
  }, NOW - 86_400_000);
  // Any watch-library read folds the stored MAL rows in.
  malPushPreview();
});

afterEach(() => {
  __setWatchLibraryPathsForTests(null);
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const idOf = (malId: number): string => readWatchLibrary().titles.find((title) => title.malId === malId)?.id as string;

describe('push changes to MAL', () => {
  it('has nothing to push right after a sync, and asks for a fetch before one', () => {
    expect(malPushPreview()).toEqual({ changes: [], needsFetch: false });
    fs.rmSync(path.join(dir, 'mal-library.json'));
    expect(malPushPreview().needsFetch).toBe(true);
  });

  it('previews and sends only what the user changed in the app', async () => {
    updateWatchTitle(idOf(1), { progress: 7, score: 8 }, NOW);
    updateWatchTitle(idOf(2), { status: 'watching' }, NOW);
    const preview = malPushPreview();
    expect(preview.changes.map((change) => [change.animeId, change.update])).toEqual([
      [1, { score: 8, episodesWatched: 7 }],
      [2, { status: 'watching' }],
    ]);
    // Nothing reached MAL while previewing.
    expect(sent).toEqual([]);

    const result = await pushWatchChangesToMal(client(), undefined, () => NOW);
    expect(result).toMatchObject({ sent: 2, failed: [], remaining: 0 });
    expect(sent.map((request) => [request.method, request.url.replace(/^.*\/anime\//, '')])).toEqual([
      ['PATCH', '1/my_list_status'],
      ['PATCH', '2/my_list_status'],
    ]);
    expect(new URLSearchParams(sent[0].body).get('num_watched_episodes')).toBe('7');
    expect(new URLSearchParams(sent[0].body).get('score')).toBe('8');
    // The stored rows now agree, so the diff is empty — and the push did not
    // fold itself back in as fresh MAL data.
    expect(malPushPreview().changes).toEqual([]);
    expect(readMalLibrary().entries.find((entry) => entry.malId === 2)?.status).toBe('watching');
  });

  it('includes a title added in the app, but not one merely imported from Letterboxd', async () => {
    addWatchTitle({ kind: 'anime', title: 'Planned Here', malId: 3, status: 'plan' }, NOW);
    const changes = malPushPreview().changes;
    expect(changes).toEqual([expect.objectContaining({ animeId: 3, added: true, update: { status: 'plan_to_watch', episodesWatched: 0 } })]);
  });

  it('stops at an error every title would hit, and reports it', async () => {
    updateWatchTitle(idOf(1), { progress: 5 }, NOW);
    updateWatchTitle(idOf(2), { progress: 1 }, NOW);
    failWith = 503;
    const result = await pushWatchChangesToMal(client(), undefined, () => NOW);
    expect(result.sent).toBe(0);
    expect(result.stoppedBy).toBe('transient');
    expect(result.failed).toHaveLength(1);
    expect(result.remaining).toBe(1);
    expect(malPushPreview().changes).toHaveLength(2);
  });

  it('sends a push only for the ids asked for', async () => {
    updateWatchTitle(idOf(1), { progress: 5 }, NOW);
    updateWatchTitle(idOf(2), { progress: 1 }, NOW);
    const result = await pushWatchChangesToMal(client(), [2], () => NOW);
    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(malPushPreview().changes.map((change) => change.animeId)).toEqual([1]);
  });

  it('player progress (the 90% rule) becomes a pending change, never an automatic write', () => {
    fs.writeFileSync(path.join(dir, 'media.json'), JSON.stringify({
      items: [{ id: 'f4', path: path.join(dir, 'show-one-04.mkv'), title: 'Show One - 04', fileName: 'show-one-04.mkv', addedAt: 1, category: 'anime', seriesTitle: 'Show One', malId: 1, episode: 4, kind: 'video' }],
    }));
    recordWatchLocalProgress({ mediaItemId: 'f4', positionSec: 1400, durationSec: 1440 }, NOW);
    expect(sent).toEqual([]);
    expect(malPushPreview().changes).toEqual([expect.objectContaining({ animeId: 1, update: { episodesWatched: 4 } })]);
  });
});
