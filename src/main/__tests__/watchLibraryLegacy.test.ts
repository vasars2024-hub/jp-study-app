// @vitest-environment node
//
// The old renderer lists (jp-media-tracking-v1, the Discover shortlist) fold
// into the watch library: statuses and ratings mapped, a repeat is a fixed
// point, and a shortlisted title never demotes one the library already tracks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import { __setWatchLibraryPathsForTests, addWatchTitle, importWatchLegacyRows, readWatchLibrary, updateWatchTitle } from '../watchLibrary';
import { __setMalLibraryPathForTests } from '../malLibrary';
import { normalizeMediaTrackingDocument } from '../../shared/mediaTracking';
import { mediaTrackingRecordToLegacyRow, shortlistCandidateToLegacyRow } from '../../shared/watchLibraryLegacy';

const NOW = Date.UTC(2026, 8, 24, 12);
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-watch-legacy-'));
  __setWatchLibraryPathsForTests({ watch: () => path.join(dir, 'watch-library.json'), media: () => path.join(dir, 'media.json') });
  __setMalLibraryPathForTests(() => path.join(dir, 'mal-library.json'));
});

afterEach(() => {
  __setWatchLibraryPathsForTests(null);
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const records = normalizeMediaTrackingDocument({
  records: [
    {
      identityId: 'frieren', contentType: 'anime', status: 'on-hold', rating: 85, favorite: true, notes: 'rewatch arc 2',
      progress: { kind: 'episodic', watchedEpisodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }], totalEpisodes: 28 },
      addedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-02-03T00:00:00.000Z',
    },
    { identityId: 'mystery-id', contentType: 'movie', status: 'planned' },
  ],
}).value.records;

describe('legacy tracking migration', () => {
  it('maps status, 0–100 rating, favourite, progress and ids; leaves unnamed records alone', () => {
    const row = mediaTrackingRecordToLegacyRow(records[0], {
      title: 'Sousou no Frieren', year: 2023, identifiers: [{ namespace: 'mal', value: '52991' }],
    });
    expect(row).toMatchObject({ status: 'on_hold', score: 8.5, favorite: true, progress: 2, episodeCount: 28, malId: 52991, kind: 'anime' });
    expect(mediaTrackingRecordToLegacyRow(records[1], undefined)).toBeNull();
    expect(mediaTrackingRecordToLegacyRow(records[1], { title: 'mystery-id' })).toBeNull();
  });

  it('imports once, and a repeat changes nothing', () => {
    const row = mediaTrackingRecordToLegacyRow(records[0], { title: 'Sousou no Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] });
    const first = importWatchLegacyRows([row], NOW);
    expect(first).toMatchObject({ added: 1 });
    const title = readWatchLibrary().titles[0];
    expect(title).toMatchObject({ malId: 52991, status: 'on_hold', score: 8.5, favorite: true, sources: ['manual'] });
    expect(importWatchLegacyRows([row], NOW + 1000)).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
  });

  it('a later edit in the library outranks the older tracking record', () => {
    const row = mediaTrackingRecordToLegacyRow(records[0], { title: 'Sousou no Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] });
    importWatchLegacyRows([row], NOW);
    const id = readWatchLibrary().titles[0].id;
    updateWatchTitle(id, { status: 'watching' }, NOW + 1000);
    importWatchLegacyRows([row], NOW + 2000);
    expect(readWatchLibrary().titles[0].status).toBe('watching');
  });

  it('turns the shortlist into Plan to watch without demoting a tracked title', () => {
    addWatchTitle({ kind: 'anime', title: 'Mushishi', malId: 457, status: 'completed' }, NOW);
    const tracked = shortlistCandidateToLegacyRow({ provider: 'jikan', id: 457, title: 'Mushi-shi', genres: [] }, NOW + 5000);
    const fresh = shortlistCandidateToLegacyRow({ provider: 'anilist', id: 21, title: 'One Piece', genres: [], episodeCount: 1100 }, NOW + 5000);
    const manga = shortlistCandidateToLegacyRow({ provider: 'anilist', id: 30013, mediaType: 'manga', title: 'One Piece', genres: [] }, NOW);
    expect(manga).toBeNull();
    const result = importWatchLegacyRows([tracked, fresh], NOW + 6000);
    expect(result).toMatchObject({ added: 1, alreadyTracked: 1 });
    const titles = readWatchLibrary().titles;
    expect(titles.find((title) => title.malId === 457)?.status).toBe('completed');
    expect(titles.find((title) => title.anilistId === 21)).toMatchObject({ status: 'plan', episodeCount: 1100 });
  });

  it('drops malformed rows that crossed the bridge', () => {
    expect(importWatchLegacyRows([{ title: '' }, { kind: 'bogus', title: 'x' }, 'nope'], NOW)).toMatchObject({ added: 0 });
  });
});
