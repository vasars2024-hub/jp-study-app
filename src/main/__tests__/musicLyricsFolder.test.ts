/**
 * Offline .lrc folder matching: a song with no same-name sidecar still finds its
 * lyrics in its own folder by a near-name, in a `Lyrics` folder beside it or its
 * album, or in the user's lyrics folder (by name or `[ti:]`/`[ar:]` tags), and an
 * ambiguous title matches nothing. Real files in a temp folder; no network, no ffmpeg
 * (the fixtures carry no tags, and `findFolderLrc` never runs it).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lyricMatchKey, pickLrcCandidate, readLrcHeader } from '../../shared/musicLocalLyrics';

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: { handle: (): void => undefined },
  BrowserWindow: { fromWebContents: (): null => null },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
}));
vi.mock('ffmpeg-static', () => ({ default: 'ffmpeg-not-used' }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

let findFolderLrc: typeof import('../musicLyricsFile').findFolderLrc;
let listLrcCandidates: typeof import('../musicLyricsFile').listLrcCandidates;
beforeAll(async () => {
  ({ findFolderLrc, listLrcCandidates } = await import('../musicLyricsFile'));
});

let root = '';
const write = (rel: string, text = ''): string => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, 'utf8');
  return full;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-lrc-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('matching keys and tags (pure)', () => {
  it('ignores track numbers, brackets, width, case and punctuation', () => {
    expect(lyricMatchKey('03 - 夜に駆ける.flac')).toBe(lyricMatchKey('夜に駆ける.lrc'));
    expect(lyricMatchKey('01. Ｓｏｎｇ (Live).mp3')).toBe(lyricMatchKey('song.lrc'));
    expect(lyricMatchKey('1999.mp3')).toBe('1999');
  });

  it('reads [ti:] and [ar:]', () => {
    expect(readLrcHeader('[ar: YOASOBI]\n[ti:アイドル]\n[00:01.00]x')).toEqual({ artist: 'YOASOBI', title: 'アイドル' });
  });

  it('matches artist + title across naming styles, and refuses an ambiguous title', () => {
    const song = { fileName: 'YOASOBI - アイドル.mp3' };
    expect(pickLrcCandidate(song, [{ file: 'a', name: 'アイドル.lrc', artist: 'YOASOBI' }])?.file).toBe('a');
    expect(pickLrcCandidate({ fileName: 'Intro.mp3' }, [
      { file: 'a', name: 'Band A - Intro.lrc' },
      { file: 'b', name: 'Band B - Intro.lrc' },
    ])).toBeNull();
    // A file naming a different artist is another song with the same title.
    expect(pickLrcCandidate(song, [{ file: 'c', name: 'Someone - アイドル.lrc' }])).toBeNull();
  });
});

describe('findFolderLrc', () => {
  const LRC = '[00:01.00]歌詞の一行目';

  it('finds a near-name .lrc next to the song', () => {
    const audio = write('Album/03 - 夜に駆ける.flac');
    write('Album/夜に駆ける.lrc', LRC);
    expect(findFolderLrc(audio, {}, null)).toEqual({ text: LRC, source: 'sidecar' });
  });

  it('finds the .lrc in a Lyrics folder beside the song, or beside its album', () => {
    const audio = write('Artist/Album/Song One.mp3');
    write('Artist/Album/Lyrics/Song One.lrc', LRC);
    expect(findFolderLrc(audio, {}, null)).toEqual({ text: LRC, source: 'folder' });

    const audio2 = write('Artist2/Album/Song Two.mp3');
    write('Artist2/LRC/Album/Song Two.lrc', LRC);
    expect(findFolderLrc(audio2, {}, null)).toEqual({ text: LRC, source: 'folder' });
  });

  it('searches the user\'s lyrics folder by [ti:]/[ar:] tags, three levels deep', () => {
    const audio = write('Music/track07.mp3');
    write('MyLyrics/YOASOBI/THE BOOK/whatever.lrc', `[ar:YOASOBI]\n[ti:群青]\n${LRC}`);
    write('MyLyrics/Other/群青.lrc', `[ar:Other Band]\n[ti:群青]\n[00:01.00]wrong`);
    expect(findFolderLrc(audio, { title: '群青', artist: 'YOASOBI' }, path.join(root, 'MyLyrics'))).toEqual({
      text: `[ar:YOASOBI]\n[ti:群青]\n${LRC}`,
      source: 'folder',
    });
  });

  it('returns null when nothing matches, and lists only .lrc files', () => {
    const audio = write('Solo/Unmatched.mp3');
    write('Solo/notes.txt', 'x');
    write('Solo/Lyrics/Something Else.lrc', LRC);
    expect(findFolderLrc(audio, {}, null)).toBeNull();
    expect(listLrcCandidates(path.join(root, 'Solo')).map((c) => c.name)).toEqual([]);
  });
});
