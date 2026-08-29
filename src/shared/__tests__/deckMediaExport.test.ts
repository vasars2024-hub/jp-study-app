import { describe, expect, it } from 'vitest';
import {
  DECK_EXPORT_HEADERS,
  buildDeckMediaExport,
  extensionForDataUrl,
  mediaFileNameFor,
} from '../deckMediaExport';

describe('naming a card\'s media file', () => {
  it('keys on the card id, so one word twice does not overwrite itself', () => {
    // Naming by word is the obvious choice and is silently wrong: a deck holds
    // 食べる mined from two different sentences, with two different clips.
    const a = mediaFileNameFor({ id: 'card-1', word: '食べる', audioPath: 'C:/a/x.mp3' });
    const b = mediaFileNameFor({ id: 'card-2', word: '食べる', audioPath: 'C:/a/y.mp3' });
    expect(a).not.toBe(b);
  });

  it('keeps the real extension, because Anki plays by it', () => {
    expect(mediaFileNameFor({ id: 'c1', audioPath: '/x/clip.WAV' })).toBe('jpstudy-c1.wav');
    expect(mediaFileNameFor({ id: 'c1', audioPath: '/x/clip.aiff' })).toBe('jpstudy-c1.aiff');
    // An unknown extension falls back to the format every clip cut here uses.
    expect(mediaFileNameFor({ id: 'c1', audioPath: '/x/clip' })).toBe('jpstudy-c1.mp3');
  });

  it('derives an inline clip\'s extension from its mime type', () => {
    expect(extensionForDataUrl('data:audio/wav;base64,AA')).toBe('wav');
    expect(extensionForDataUrl('data:audio/mpeg;base64,AA')).toBe('mp3');
    expect(extensionForDataUrl('data:audio/ogg;base64,AA')).toBe('ogg');
    expect(mediaFileNameFor({ id: 'c1', audioDataUrl: 'data:audio/wav;base64,AA' }))
      .toBe('jpstudy-c1.wav');
  });

  it('strips a filesystem-hostile id rather than writing it', () => {
    expect(mediaFileNameFor({ id: '../../etc/passwd', audioPath: '/x/a.mp3' }))
      .toBe('jpstudy-etcpasswd.mp3');
    expect(mediaFileNameFor({ id: '///', audioPath: '/x/a.mp3' })).toBe('jpstudy-card.mp3');
  });

  it('has no file for a card with no audio', () => {
    expect(mediaFileNameFor({ id: 'c1', word: '猫' })).toBeNull();
  });
});

describe('building the export', () => {
  it('writes a sound tag only for cards that have audio', () => {
    const built = buildDeckMediaExport([
      { id: 'a', word: '猫', reading: 'ねこ', meaning: 'cat', audioPath: 'C:/m/a.mp3' },
      { id: 'b', word: '犬', reading: 'いぬ', meaning: 'dog' },
    ]);

    expect(built.rows[0]).toEqual(DECK_EXPORT_HEADERS);
    expect(built.rows[1]).toEqual(['猫', 'ねこ', 'cat', '', '', '', '[sound:jpstudy-a.mp3]']);
    expect(built.rows[2][6]).toBe('');
    // The card without audio is exported, and counted — not dropped.
    expect(built.withoutAudio).toBe(1);
    expect(built.media).toEqual([{ fileName: 'jpstudy-a.mp3', sourcePath: 'C:/m/a.mp3' }]);
  });

  it('prefers the managed file over the same audio carried inline', () => {
    const built = buildDeckMediaExport([
      { id: 'a', word: '猫', audioPath: 'C:/m/a.mp3', audioDataUrl: 'data:audio/wav;base64,AA' },
    ]);
    expect(built.media).toEqual([{ fileName: 'jpstudy-a.mp3', sourcePath: 'C:/m/a.mp3' }]);
  });

  it('never lets two cards claim one filename', () => {
    // Two cards sharing an id is a bug elsewhere; here it would silently export
    // one card's audio under the other's name.
    const built = buildDeckMediaExport([
      { id: 'dup', word: '一', audioPath: 'C:/m/1.mp3' },
      { id: 'dup', word: '二', audioPath: 'C:/m/2.mp3' },
    ]);
    expect(built.media.map((item) => item.fileName))
      .toEqual(['jpstudy-dup.mp3', 'jpstudy-dup-2.mp3']);
    expect(built.rows[2][6]).toBe('[sound:jpstudy-dup-2.mp3]');
  });

  it('exports an empty deck as a header and nothing else', () => {
    const built = buildDeckMediaExport([]);
    expect(built.rows).toEqual([DECK_EXPORT_HEADERS]);
    expect(built.media).toEqual([]);
    expect(built.withoutAudio).toBe(0);
  });
});
