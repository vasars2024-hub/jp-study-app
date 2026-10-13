// @vitest-environment jsdom
/**
 * LRCLIB search-by-artist/title fallback: the metadata guess handles Japanese release
 * names and download noise and prefers library tags; the fuzzy search accepts only a
 * hit that is plausibly this song (title agrees, and length or artist), keeps looking
 * past a bad batch, and asks the structured search first. LRCLIB is faked here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { acceptLyricsHit, fetchLyrics, guessSongMeta, lyricsMatchKey } from '../lyrics';

function item(fileName: string, path = `C:/Music/${fileName}`, extra: Partial<MediaItem> = {}): MediaItem {
  return { id: fileName, title: fileName, path, fileName, addedAt: 0, ...extra } as MediaItem;
}

describe('guessing artist and title', () => {
  it('reads the Japanese 「」 release layout', () => {
    expect(guessSongMeta(item('YOASOBI「アイドル」 Official Music Video.mp3'), false)).toEqual({
      artist: 'YOASOBI',
      album: '',
      title: 'アイドル',
    });
  });

  it('drops download noise after the title', () => {
    expect(guessSongMeta(item('Aimer - Ref_rain Official Music Video.m4a'), false).title).toBe('Ref rain');
    expect(guessSongMeta(item('LiSA - 紅蓮華 (TV size) MV.mp3'), false).title).toBe('紅蓮華');
  });

  it('prefers the artist and album the library knows', () => {
    const meta = guessSongMeta(item('01 - 夜に駆ける.flac', 'C:/Music/x/y/01 - 夜に駆ける.flac', { artist: 'YOASOBI', album: 'THE BOOK' }), true);
    expect(meta).toEqual({ artist: 'YOASOBI', album: 'THE BOOK', title: '夜に駆ける' });
  });
});

describe('matching keys', () => {
  it('folds width, case, brackets, feat. credits and punctuation', () => {
    expect(lyricsMatchKey('ＬｉＳＡ')).toBe(lyricsMatchKey('lisa'));
    expect(lyricsMatchKey('夜に駆ける (Remix)')).toBe(lyricsMatchKey('夜に駆ける！'));
    expect(lyricsMatchKey('Song feat. Someone')).toBe('song');
  });
});

describe('accepting a fuzzy hit', () => {
  const meta = { artist: 'YOASOBI', album: '', title: '夜に駆ける' };
  const hit = (over: Record<string, unknown>) => ({
    trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: '[00:01.00]x', ...over,
  });

  it('takes the same title, artist and length', () => {
    expect(acceptLyricsHit(meta, hit({}), 260)).toBe(true);
  });

  it('refuses another song, whatever else matches', () => {
    expect(acceptLyricsHit(meta, hit({ trackName: 'アイドル' }), 261)).toBe(false);
  });

  it('refuses the same title by another artist unless the length agrees closely', () => {
    expect(acceptLyricsHit(meta, hit({ artistName: 'Someone Else', duration: 200 }), 261)).toBe(false);
    expect(acceptLyricsHit(meta, hit({ artistName: 'Someone Else', duration: 262 }), 261)).toBe(true);
  });

  it('refuses a recording of a very different length', () => {
    expect(acceptLyricsHit(meta, hit({ duration: 400 }), 261)).toBe(false);
    // With the artist confirmed, a slightly longer cut is still the song.
    expect(acceptLyricsHit(meta, hit({ duration: 275 }), 261)).toBe(true);
  });
});

describe('fetchLyrics fallback', () => {
  const urls: string[] = [];
  let routes: Array<[RegExp, unknown]> = [];

  beforeEach(() => {
    urls.length = 0;
    routes = [];
    (window as unknown as { api: unknown }).api = {
      fetchJson: vi.fn(async (url: string) => {
        urls.push(url);
        const hit = routes.find(([re]) => re.test(decodeURIComponent(url.replace(/\+/g, ' '))));
        if (hit) return { ok: true, data: hit[1] };
        if (url.includes('/api/get')) return { ok: false, error: '404 Not Found' };
        return { ok: true, data: [] };
      }),
    };
  });

  it('asks the structured search (track + artist) before free text', async () => {
    await fetchLyrics({ artist: 'YOASOBI', album: '', title: '夜に駆ける' }, 261);
    const searches = urls.filter((u) => u.includes('/api/search'));
    expect(searches[0]).toContain('track_name=');
    expect(searches[0]).toContain('artist_name=');
  });

  it('returns nothing rather than another song from a bad batch', async () => {
    routes.push([/\/api\/search/, [{ trackName: 'Different Song', artistName: 'Other', duration: 200, syncedLyrics: '[00:01.00]wrong' }]]);
    expect(await fetchLyrics({ artist: 'YOASOBI', album: '', title: '夜に駆ける' }, 261)).toBeNull();
  });

  it('keeps searching past a bad batch and takes the plausible hit', async () => {
    routes.push([/track_name=/, [{ trackName: 'Different Song', artistName: 'Other', duration: 200, syncedLyrics: '[00:01.00]wrong' }]]);
    routes.push([/q=YOASOBI 夜に駆ける/, [{ trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 260, syncedLyrics: '[00:01.00]right' }]]);
    expect(await fetchLyrics({ artist: 'YOASOBI', album: '', title: '夜に駆ける' }, 261)).toEqual({
      lrc: '[00:01.00]right',
      source: 'lrclib',
    });
  });

  it('prefers a synced hit over a plain one of the same song', async () => {
    routes.push([/track_name=/, [
      { trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 261, plainLyrics: 'plain' },
      { trackName: '夜に駆ける', artistName: 'YOASOBI', albumName: 'x', duration: 262, syncedLyrics: '[00:01.00]synced' },
    ]]);
    expect(await fetchLyrics({ artist: 'YOASOBI', album: '', title: '夜に駆ける' }, 261)).toEqual({
      lrc: '[00:01.00]synced',
      source: 'lrclib',
    });
  });
});
