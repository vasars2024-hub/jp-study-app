import { describe, expect, it } from 'vitest';
import { buildMediaHubSections, buildStorageDiagnostics, diagnoseMediaPaths, mediaCategory, previewMediaOrganization, resolveMediaDuplicates, searchMediaHub } from '../mediaHub';
import type { MediaItem } from '../types';

const item = (id: string, addedAt: number, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, title: id, path: `C:/media/${id}.mp4`, fileName: `${id}.mp4`, addedAt, ...extra,
});

describe('media hub sections', () => {
  it('sorts recent items and limits dashboard shelves', () => {
    const result = buildMediaHubSections(Array.from({ length: 8 }, (_, i) => item(String(i), i)));
    expect(result.recentlyAdded.map((x) => x.id)).toEqual(['7', '6', '5', '4', '3', '2']);
  });

  it('keeps resumable items and excludes remote imports from unorganized files', () => {
    const result = buildMediaHubSections([
      item('resume', 1, { positionSec: 10, durationSec: 100, lastPlayedAt: 5 }),
      item('finished', 2, { positionSec: 98, durationSec: 100 }),
      item('remote', 3, { sourceUrl: 'https://example.test/watch' }),
    ]);
    expect(result.continueWatching.map((x) => x.id)).toEqual(['resume']);
    expect(result.unorganized.map((x) => x.id)).toEqual(['resume', 'finished']);
  });

  it('keeps audio out of continue watching and on recently listened', () => {
    const result = buildMediaHubSections([
      item('ep', 1, { kind: 'video', positionSec: 10, durationSec: 100, lastPlayedAt: 9 }),
      item('song', 2, {
        kind: 'audio',
        fileName: 'song.mp3',
        path: 'C:/media/song.mp3',
        positionSec: 12,
        durationSec: 180,
        lastPlayedAt: 8,
      }),
    ]);
    expect(result.continueWatching.map((x) => x.id)).toEqual(['ep']);
    expect(result.recentlyListened.map((x) => x.id)).toEqual(['song']);
  });
});

describe('media hub diagnostics', () => {
  it('groups normalized duplicate paths and sorts missing paths deterministically', () => {
    const result = diagnoseMediaPaths([
      item('a', 1, { path: 'C:\\Media\\Show.mp4' }),
      item('b', 2, { path: 'c:/media/show.mp4' }),
      item('c', 3, { path: 'C:/missing.mp4' }),
    ], (path) => path.toLowerCase().includes('show'));
    expect(result.duplicates).toEqual([{ path: 'C:\\Media\\Show.mp4', itemIds: ['a', 'b'] }]);
    expect(result.missing).toEqual(['C:/missing.mp4']);
  });
});

describe('media hub contract', () => {
  it('previews bounded organization and resolves duplicate choices deterministically', () => {
    // Target paths follow MASTER_PLAN §10's tree (/Anime/<title>/...), not a flat
    // per-category folder — see `mediaLibraryTarget` in `mediaFileIdentity`.
    const source = item('show', 1, { title: 'Show', fileName: 'Show.mp4', category: 'anime' });
    const existing = item('existing', 2, { path: 'D:/Hub/Anime/Show/Show.mp4' });
    expect(previewMediaOrganization(source, 'D:/Hub', [source, existing])).toMatchObject({ action: 'conflict', targetPath: 'D:/Hub/Anime/Show/Show.mp4', conflictItemIds: ['existing'] });
    expect(resolveMediaDuplicates('keep-existing', 'existing', source, [existing])).toEqual([existing]);
    expect(resolveMediaDuplicates('keep-incoming', 'existing', source, [existing])).toEqual([source]);
  });

  it('projects study, listened, and recommendation shelves', () => {
    const result = buildMediaHubSections([
      item('studied', 1, { lastStudiedAt: 9 }),
      item('song', 2, { kind: 'audio', lastPlayedAt: 8 }),
      item('new', 3),
    ]);
    expect(result.recentlyStudied.map((x) => x.id)).toEqual(['studied']);
    expect(result.recentlyListened.map((x) => x.id)).toEqual(['song']);
    expect(result.recommended.map((x) => x.id)).toEqual(['new']);
  });

  it('classifies and searches by category and metadata', () => {
    const items = [
      item('frieren', 1, { title: 'Frieren', fileName: 'Frieren S01E01.mkv', category: 'anime', lang: 'ja', genres: ['Fantasy'] }),
      item('song', 2, { title: 'Opening', fileName: 'opening.mp3', kind: 'audio', artist: 'Artist' }),
    ];
    expect(mediaCategory(items[0])).toBe('anime');
    expect(searchMediaHub(items, { query: 'fantasy', category: 'anime' }).map((x) => x.id)).toEqual(['frieren']);
    expect(searchMediaHub(items, { query: 'artist', category: 'music' }).map((x) => x.id)).toEqual(['song']);
  });

  it('does not match the directory part of a path, which is on no card', () => {
    const items = [
      item('frieren', 1, { title: 'Frieren', fileName: 'Frieren S01E01.mkv', path: 'C:/Users/arseniy/Downloads/jp-study/Frieren S01E01.mkv' }),
      item('jojo', 2, { title: 'JoJo 38 RAW', fileName: 'JoJo 38 RAW.mp4', path: 'C:/Users/arseniy/Downloads/jp-study/JoJo 38 RAW.mp4' }),
    ];
    // Every item shares the account name and the download folder, so a hit on either returns the
    // whole library for a word no card shows. Measured on the real 36-item library at 36 of 36.
    for (const shared of ['arseniy', 'users', 'downloads', 'jp-study']) {
      expect(searchMediaHub(items, { query: shared, category: 'all' })).toEqual([]);
    }
    // The file name is the part of the path a card does show, and it still matches.
    expect(searchMediaHub(items, { query: 's01e01', category: 'all' }).map((x) => x.id)).toEqual(['frieren']);
    expect(searchMediaHub(items, { query: '.mp4', category: 'all' }).map((x) => x.id)).toEqual(['jojo']);
    expect(searchMediaHub(items, { query: 'jojo', category: 'all' }).map((x) => x.id)).toEqual(['jojo']);
  });

  it('reports storage totals while retaining missing and duplicate diagnostics', () => {
    const items = [item('a', 1, { path: 'a.mp4' }), item('b', 2, { path: 'a.mp4' }), item('c', 3, { path: 'missing.mp4' })];
    expect(buildStorageDiagnostics(items, (path) => path === 'a.mp4' ? 10 : null)).toMatchObject({ totalBytes: 20, existingBytes: 20, missing: ['missing.mp4'] });
  });
});
