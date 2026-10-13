/**
 * Music/lyrics karaoke timing: the sung line ends at its LRC end (so an instrumental
 * break lights nothing while the anchor holds), enhanced-LRC word times come back for
 * per-word karaoke, bilingual sheets pair a line with its translation, and a per-song
 * nudge shifts every time.
 */
import { describe, expect, it } from 'vitest';
import { parseSubtitles } from '../subtitleCues';
import {
  attachLrcWords,
  lyricCompanions,
  lyricPositionAt,
  lyricWordAt,
  parseLrcWordLines,
  shiftWords,
} from '../lrcKaraoke';
import { shiftCues } from '../subtitleSync';

const WITH_BREAK = [
  '[00:10.00]一行目',
  '[00:14.00]',
  '[00:40.00]二行目',
  '[00:44.00]三行目',
].join('\n');

describe('which line is lit', () => {
  const cues = parseSubtitles(WITH_BREAK);

  it('lights a line from its start to its END, not until the next line starts', () => {
    expect(lyricPositionAt(cues, 12, lyricCompanions(cues))).toEqual({ sung: 0, anchor: 0 });
  });

  it('lights nothing in an instrumental break, while the anchor stays on the line just sung', () => {
    // The old rule (`start <= t`) kept line 0 lit from 10 s to 40 s.
    expect(lyricPositionAt(cues, 14, lyricCompanions(cues))).toEqual({ sung: -1, anchor: 0 });
    expect(lyricPositionAt(cues, 30, lyricCompanions(cues))).toEqual({ sung: -1, anchor: 0 });
  });

  it('picks the next line up when it starts, and nothing before the first', () => {
    expect(lyricPositionAt(cues, 40, lyricCompanions(cues))).toEqual({ sung: 1, anchor: 1 });
    expect(lyricPositionAt(cues, 5, lyricCompanions(cues))).toEqual({ sung: -1, anchor: -1 });
  });
});

describe('enhanced LRC word times', () => {
  const SHEET = [
    '[00:01.00]<00:01.00>おはよう、<00:02.00>新しい<00:03.00>朝<00:04.00>',
    '[00:08.00]パンを食べて出かけよう',
  ].join('\n');

  it('reads each word with its start, and the closing time ends the last word', () => {
    const cues = parseSubtitles(SHEET);
    const words = attachLrcWords(cues, SHEET);
    expect(cues.map((c) => c.text)).toEqual(['おはよう、新しい朝', 'パンを食べて出かけよう']);
    expect(words[0]).toEqual([
      { text: 'おはよう、', start: 1, end: 2 },
      { text: '新しい', start: 2, end: 3 },
      { text: '朝', start: 3, end: 4 },
    ]);
    // A line with no word times has none.
    expect(words[1]).toBeNull();
  });

  it('knows the word being sung, and none once the line is over', () => {
    const cues = parseSubtitles(SHEET);
    const words = attachLrcWords(cues, SHEET)[0];
    expect(lyricWordAt(words, 1.5)).toBe(0);
    expect(lyricWordAt(words, 2.2)).toBe(1);
    expect(lyricWordAt(words, 3.9)).toBe(2);
    expect(lyricWordAt(words, 4.5)).toBe(-1);
    expect(lyricWordAt(words, 0.5)).toBe(-1);
  });

  it('keeps the spaces between Latin words, and text before the first word time', () => {
    const sheet = '[00:05.00]Hello <00:06.00>bright <00:07.00>world<00:08.00>';
    const cues = parseSubtitles(sheet);
    const words = attachLrcWords(cues, sheet)[0];
    expect(words?.map((w) => w.text)).toEqual(['Hello ', 'bright ', 'world']);
    expect(words?.[0]).toMatchObject({ start: 5, end: 6 });
  });

  it('applies [offset:] to word times exactly as parseLrc does to lines', () => {
    const sheet = ['[offset:+500]', '[00:02.00]<00:02.00>ab<00:03.00>cd<00:04.00>'].join('\n');
    const cues = parseSubtitles(sheet);
    expect(cues[0].start).toBeCloseTo(1.5);
    const words = attachLrcWords(cues, sheet)[0];
    expect(words?.map((w) => w.start)).toEqual([1.5, 2.5]);
    expect(words?.[1].end).toBeCloseTo(3.5);
  });

  it('shifts a repeated line\'s word times with each of its time tags', () => {
    const sheet = '[00:10.00][01:00.00]<00:10.00>ラ<00:11.00>ラ<00:12.00>';
    const lines = parseLrcWordLines(sheet);
    expect(lines.map((l) => l.words.map((w) => w.start))).toEqual([[10, 11], [60, 61]]);
  });

  it('refuses word times that do not spell the line (would light the wrong characters)', () => {
    const cues = [{ start: 1, end: 4, text: '全然違う行' }];
    expect(attachLrcWords(cues, '[00:01.00]<00:01.00>あ<00:02.00>い<00:03.00>')).toEqual([null]);
  });
});

describe('bilingual sheets', () => {
  const SHEET = [
    '[00:05.00]Rain is falling softly',
    '[00:05.00]雨が静かに降っている',
    '[00:09.00]窓辺で歌おう',
  ].join('\n');

  it('pairs a translation with the Japanese line under the same tag', () => {
    const cues = parseSubtitles(SHEET);
    const owners = lyricCompanions(cues);
    const jp = cues.findIndex((c) => c.text.startsWith('雨'));
    const en = cues.findIndex((c) => c.text.startsWith('Rain'));
    expect(owners[en]).toBe(jp);
    expect(owners[jp]).toBe(-1);
    expect(owners[2]).toBe(-1);
  });

  it('lights the Japanese line, not its translation, while both are sung', () => {
    const cues = parseSubtitles(SHEET);
    const jp = cues.findIndex((c) => c.text.startsWith('雨'));
    expect(lyricPositionAt(cues, 6, lyricCompanions(cues))).toEqual({ sung: jp, anchor: jp });
  });
});

describe('per-song nudge', () => {
  it('moves every line and word, clamped at zero', () => {
    const cues = [{ start: 0.05, end: 2, text: 'a' }, { start: 3, end: 4, text: 'b' }];
    expect(shiftCues(cues, 0.3)).toEqual([{ start: 0.35, end: 2.3, text: 'a' }, { start: 3.3, end: 4.3, text: 'b' }]);
    expect(shiftCues(cues, -0.1)[0].start).toBe(0);
    expect(shiftWords([[{ text: 'a', start: 1, end: 2 }], null], 0.5)).toEqual([[{ text: 'a', start: 1.5, end: 2.5 }], null]);
  });
});
