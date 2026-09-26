// @vitest-environment jsdom
/**
 * User playlists (coverage D, music): the store behind create/rename/delete,
 * add/remove/reorder and "play this playlist" from the palette.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import {
  PLAYLISTS_KEY,
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  moveTrackInPlaylist,
  movedEntry,
  onPlaylistsChanged,
  reloadPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  requestPlaylistPlay,
  resolvePlaylistTracks,
  takePendingPlaylistPlay,
} from '../musicPlaylists';

const song = (id: string): MediaItem => ({ id, title: id, path: `C:/m/${id}.mp3`, fileName: `${id}.mp3`, addedAt: 0 });

beforeEach(() => {
  localStorage.clear();
  reloadPlaylists();
});

describe('music playlists store', () => {
  it('creates, renames and deletes, and persists across a reload', () => {
    const p = createPlaylist('  Morning   run ', 'Playlist 1');
    expect(p.name).toBe('Morning run');
    expect(createPlaylist('   ', 'Playlist 2').name).toBe('Playlist 2');
    expect(renamePlaylist(p.id, '')).toBe(false);
    expect(renamePlaylist(p.id, 'Evening')).toBe(true);
    reloadPlaylists();
    expect(listPlaylists().map((x) => x.name)).toEqual(['Evening', 'Playlist 2']);
    expect(JSON.parse(localStorage.getItem(PLAYLISTS_KEY) ?? '{}').version).toBe(1);
    expect(deletePlaylist(p.id)).toBe(true);
    reloadPlaylists();
    expect(getPlaylist(p.id)).toBeUndefined();
    expect(listPlaylists()).toHaveLength(1);
  });

  it('adds without duplicates, removes, and reorders', () => {
    const p = createPlaylist('Mix', 'x');
    expect(addTracksToPlaylist(p.id, ['a', 'b', 'a', 'c'])).toBe(3);
    expect(addTracksToPlaylist(p.id, ['b'])).toBe(0);
    expect(moveTrackInPlaylist(p.id, 'c', 0)).toBe(true);
    expect(getPlaylist(p.id)?.trackIds).toEqual(['c', 'a', 'b']);
    expect(moveTrackInPlaylist(p.id, 'c', -5)).toBe(false);
    expect(removeTrackFromPlaylist(p.id, 'a')).toBe(true);
    expect(getPlaylist(p.id)?.trackIds).toEqual(['c', 'b']);
    expect(movedEntry([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
  });

  it('notifies subscribers on every change', () => {
    let n = 0;
    const off = onPlaylistsChanged(() => n++);
    const p = createPlaylist('A', 'x');
    addTracksToPlaylist(p.id, ['a']);
    renamePlaylist(p.id, 'B');
    deletePlaylist(p.id);
    off();
    createPlaylist('C', 'x');
    expect(n).toBe(4);
  });

  it('resolves tracks in playlist order and skips ones no longer in the library', () => {
    const p = createPlaylist('Mix', 'x', ['b', 'gone', 'a']);
    expect(resolvePlaylistTracks(p, [song('a'), song('b')]).map((s) => s.id)).toEqual(['b', 'a']);
    // The missing id is kept, so re-adding the folder brings it back in place.
    expect(getPlaylist(p.id)?.trackIds).toEqual(['b', 'gone', 'a']);
  });

  it('ignores a corrupt document instead of throwing', () => {
    localStorage.setItem(PLAYLISTS_KEY, '{"playlists":[{"id":"p1","name":"ok","trackIds":["a",5,"a"]},{"name":"no id"},null]}');
    reloadPlaylists();
    expect(listPlaylists()).toEqual([expect.objectContaining({ id: 'p1', name: 'ok', trackIds: ['a'] })]);
    localStorage.setItem(PLAYLISTS_KEY, 'not json');
    reloadPlaylists();
    expect(listPlaylists()).toEqual([]);
  });

  it('a play request is claimed exactly once', () => {
    requestPlaylistPlay('p1');
    expect(takePendingPlaylistPlay()).toBe('p1');
    expect(takePendingPlaylistPlay()).toBeNull();
  });
});
