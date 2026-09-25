/**
 * J11: one show, one name in Statistics. Watch time is recorded per played file under
 * whatever title the player had, so one show over three episodes was three rows with
 * three names. Rows fold into one per Watch-library title and carry the library's title.
 */
import { describe, expect, it } from 'vitest';
import { fileResumeKey, groupShowsByLibraryTitle, libraryTitlesByResumeKey } from '../statsShowTitles';

describe('Statistics "By show" rows', () => {
  const titles = [{ id: 'mal:1', title: 'Frieren', mediaItemIds: ['m1', 'm2'] }];
  const media = [
    { id: 'm1', path: 'D:\\Anime\\Frieren\\01.mkv' },
    { id: 'm2', path: 'D:/Anime/Frieren/02.mkv' },
  ];
  const byKey = libraryTitlesByResumeKey(titles, media);

  it('keys files the way the player records them', () => {
    expect(fileResumeKey('D:\\Anime\\Frieren\\01.MKV')).toBe('file:d:/anime/frieren/01.mkv');
    expect(byKey.get('file:d:/anime/frieren/02.mkv')).toEqual({ id: 'mal:1', title: 'Frieren' });
  });

  it('folds a show\'s episodes into one row under the library title; unknown files stay as recorded', () => {
    const rows = groupShowsByLibraryTitle(
      [
        { id: 'file:d:/anime/frieren/01.mkv', title: 'Frieren - 01 [1080p]', seconds: 1400, lastWatched: 1 },
        { id: 'file:d:/anime/frieren/02.mkv', title: 'The Journey\'s End', seconds: 1200, lastWatched: 3 },
        { id: 'file:d:/other/clip.mp4', title: 'clip', seconds: 20, lastWatched: 2 },
      ],
      byKey,
    );
    expect(rows).toEqual([
      { id: 'file:d:/anime/frieren/02.mkv', title: 'Frieren', seconds: 2600, lastWatched: 3, libraryTitleId: 'mal:1' },
      { id: 'file:d:/other/clip.mp4', title: 'clip', seconds: 20, lastWatched: 2 },
    ]);
  });
});
