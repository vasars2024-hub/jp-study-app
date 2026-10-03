import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { buildSearchIndex, searchSongs } from '../musicLibrary';

describe('music library search', () => {
  const song = { id: 'song', fileName: 'Ｔｒａｃｋ０１.mp3' } as MediaItem;
  const other = { id: 'other', fileName: 'other.mp3' } as MediaItem;
  const songs = [song, other];
  const index = buildSearchIndex(songs, (item) => item.id === 'song'
    ? { title: 'ガラスの花', artist: 'ﾊﾟﾚｰﾄﾞ' }
    : { title: '別の曲', artist: 'Other' });

  it.each(['ｶﾞﾗｽ', 'ガラス', 'パレード', 'ﾊﾟﾚｰﾄﾞ', 'track01', 'ＴＲＡＣＫ０１'])(
    'finds titles, artists and filenames across character widths: %s', (query) => {
      expect(searchSongs(index, query)).toEqual([song]);
    },
  );

  it('preserves original song objects and ordering for a blank query', () => {
    expect(searchSongs(index, '　 ')).toEqual(songs);
    expect(searchSongs(index, 'track01')[0]).toBe(song);
    expect(song.fileName).toBe('Ｔｒａｃｋ０１.mp3');
  });

  it('does not return unrelated songs', () => {
    expect(searchSongs(index, '見つからない')).toEqual([]);
  });
});
