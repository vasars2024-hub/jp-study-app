// @vitest-environment node
//
// The MAL library's file half: what actually lands on disk, and what a malformed
// row crossing the bridge costs.
//
// Real files in a real temp directory rather than a mocked `fs` — the atomic
// rename and the "unreadable file reads as empty, not as a throw" behaviour are
// both properties of the filesystem call, and a memfs stub asserts the stub.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `malLibrary` imports electron only for `app.getPath` and `ipcMain.handle`;
// the path is overridden below and no handler is registered by these tests.
vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
}));

import {
  __setMalLibraryPathForTests,
  applyMalLibrarySync,
  readMalLibrary,
  writeMalLibrary,
} from '../malLibrary';
import { emptyMalLibrary } from '../../shared/malLibrary';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-mal-library-'));
  file = path.join(dir, 'mal-library.json');
  __setMalLibraryPathForTests(() => file);
});

afterEach(() => {
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const entry = {
  animeId: 5081,
  title: 'Bakemonogatari',
  totalEpisodes: 15,
  status: 'completed',
  episodesWatched: 15,
  score: 9,
  rewatching: false,
  updatedAt: '2026-01-02T03:04:05+00:00',
};

describe('readMalLibrary', () => {
  it('answers an empty library when the file does not exist', () => {
    expect(readMalLibrary()).toEqual(emptyMalLibrary());
  });

  it('answers an empty library rather than throwing on unparseable content', () => {
    fs.writeFileSync(file, '{ this is not json', 'utf-8');
    expect(readMalLibrary().entries).toEqual([]);
    // The bad file is evidence; nothing here deletes it.
    expect(fs.existsSync(file)).toBe(true);
  });

  it('refuses to read a document from a newer schema with older rules', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 99, entries: [{ malId: 1, media: 'anime', title: 'future' }] }),
      'utf-8',
    );
    expect(readMalLibrary().entries).toEqual([]);
  });
});

describe('writeMalLibrary', () => {
  it('leaves no .tmp file behind', () => {
    writeMalLibrary(emptyMalLibrary());
    expect(fs.readdirSync(dir)).toEqual(['mal-library.json']);
  });
});

describe('applyMalLibrarySync', () => {
  it('persists the fetched list and reports the numbers', () => {
    const report = applyMalLibrarySync({ entries: [entry] }, 1000);
    expect(report).toMatchObject({ added: 1, updated: 0, unchanged: 0, rejected: 0 });
    expect(report.summary).toMatchObject({ total: 1, byStatus: { completed: 1 }, derivatives: 0 });

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored.entries[0]).toMatchObject({ malId: 5081, media: 'anime', origin: 'list' });
  });

  it('a second sync of the same list adds nothing', () => {
    applyMalLibrarySync({ entries: [entry] }, 1000);
    const second = applyMalLibrarySync({ entries: [entry] }, 2000);
    expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect(second.summary.total).toBe(1);
    expect(second.summary.lastSyncAt).toBe(2000);
  });

  it('counts a row it had to drop instead of silently shrinking the sync', () => {
    const report = applyMalLibrarySync(
      { entries: [entry, { animeId: 'not-a-number', title: 'bad' }, { title: 'no id' }] },
      1000,
    );
    expect(report.added).toBe(1);
    expect(report.rejected).toBe(2);
  });

  it('drops a derivative whose relation MAL has not published before', () => {
    const report = applyMalLibrarySync(
      { derivatives: [{ animeId: 11597, relation: 'brand_new_relation', fromAnimeId: 5081, depth: 1 }] },
      1000,
    );
    expect(report.added).toBe(0);
    expect(report.rejected).toBe(1);
  });

  it('merges the list before the walk, so a title in both stays the user row', () => {
    const report = applyMalLibrarySync(
      {
        entries: [{ ...entry, animeId: 11597, episodesWatched: 11 }],
        derivatives: [{
          animeId: 11597,
          title: 'Nisemonogatari',
          relation: 'sequel',
          relationLabel: 'Sequel',
          fromAnimeId: 5081,
          depth: 1,
        }],
      },
      1000,
    );
    expect(report.summary.total).toBe(1);
    const stored = readMalLibrary();
    expect(stored.entries[0]).toMatchObject({
      origin: 'list',
      episodesWatched: 11,
      relation: 'sequel',
      fromMalId: 5081,
    });
  });

  it('stores manga separately from an anime with the same id', () => {
    applyMalLibrarySync({ entries: [entry] }, 1000);
    const report = applyMalLibrarySync({ media: 'manga', entries: [{ ...entry, title: 'Bakemonogatari (novel)' }] }, 2000);
    expect(report.added).toBe(1);
    expect(report.summary.total).toBe(2);
  });
});
