import { describe, expect, it } from 'vitest';
import { shiftSubtitleText, worthShifting } from '../subtitleDiscoveryTiming';
import { parseSubtitles } from '../subtitleCues';

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:02,500',
  'それがおかしい',
  '',
  '2',
  '00:01:59,900 --> 00:02:01,000',
  '二行目 00:00:01,000 は本文',
  '',
].join('\n');

describe('shiftSubtitleText — SRT / VTT', () => {
  it('moves every cue and leaves the text alone', () => {
    const out = shiftSubtitleText(SRT, 'srt', 9.05);
    expect(out).toContain('00:00:10,050 --> 00:00:11,550');
    expect(out).toContain('00:02:08,950 --> 00:02:10,050');
    // A timestamp-looking string inside the text is not a timing line.
    expect(out).toContain('二行目 00:00:01,000 は本文');
    const cues = parseSubtitles(out);
    expect(cues.map((cue) => cue.start)).toEqual([10.05, 128.95]);
  });

  it('clamps at zero when moving earlier', () => {
    const out = shiftSubtitleText(SRT, 'srt', -1.5);
    expect(out).toContain('00:00:00,000 --> 00:00:01,000');
  });

  it('keeps a VTT stamp without hours, and its dot separator', () => {
    const vtt = 'WEBVTT\n\n01:02.345 --> 01:04.000\nhello\n';
    expect(shiftSubtitleText(vtt, 'vtt', 1)).toContain('01:03.345 --> 01:05.000');
  });

  it('preserves CRLF line endings', () => {
    const crlf = SRT.replace(/\n/g, '\r\n');
    const out = shiftSubtitleText(crlf, 'srt', 1);
    expect(out).toContain('\r\n00:00:02,000 --> 00:00:03,500\r\n');
    expect(out.split('\r\n').length).toBe(crlf.split('\r\n').length);
  });

  it('returns the text untouched for a zero or non-finite offset', () => {
    expect(shiftSubtitleText(SRT, 'srt', 0)).toBe(SRT);
    expect(shiftSubtitleText(SRT, 'srt', Number.NaN)).toBe(SRT);
  });
});

describe('shiftSubtitleText — ASS', () => {
  const ASS = [
    '[Script Info]',
    'Title: test',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname',
    'Style: JP,Noto',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:02.50,JP,,0,0,0,,{\\pos(10,20)}こんにちは、世界',
    'Comment: 0,0:01:59.95,0:02:00.00,JP,,0,0,0,,note',
  ].join('\n');

  it('shifts only the Start and End fields, keeping styles and commas in the text', () => {
    const out = shiftSubtitleText(ASS, 'ass', 2.25);
    expect(out).toContain('Dialogue: 0,0:00:03.25,0:00:04.75,JP,,0,0,0,,{\\pos(10,20)}こんにちは、世界');
    expect(out).toContain('Comment: 0,0:02:02.20,0:02:02.25,JP,,0,0,0,,note');
    expect(out).toContain('Style: JP,Noto');
  });

  it('follows a file\'s own Format column order', () => {
    const custom = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:05.00,0:00:06.00,a, b';
    expect(shiftSubtitleText(custom, 'ass', -1)).toContain('Dialogue: 0:00:04.00,0:00:05.00,a, b');
  });
});

describe('worthShifting', () => {
  it('needs confidence and at least a quarter second', () => {
    expect(worthShifting({ offsetSec: 9.05, confident: true })).toBe(true);
    expect(worthShifting({ offsetSec: -0.3, confident: true })).toBe(true);
    expect(worthShifting({ offsetSec: 0.1, confident: true })).toBe(false);
    expect(worthShifting({ offsetSec: 9, confident: false })).toBe(false);
  });
});
