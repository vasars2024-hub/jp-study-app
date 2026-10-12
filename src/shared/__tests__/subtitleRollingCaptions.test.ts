// @vitest-environment node
/**
 * YouTube auto-captions, as yt-dlp saves them (`fixtures/youtube-auto-ja.vtt`):
 * every cue opens with a spacer line holding one space, repeats the previous
 * line above the new one, carries word-timing tags, and is followed by a 10 ms
 * cue holding the old line alone. The parser used to split cues on that spacer
 * (losing the first line outright) and then showed every line twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRollingCaptionTrack, parseSubtitles } from '../subtitleCues';

const AUTO_VTT = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-auto-ja.vtt'), 'utf8');

describe('YouTube rolling auto-captions', () => {
  it('keeps every spoken line exactly once, with its own timing', () => {
    const cues = parseSubtitles(AUTO_VTT);
    expect(cues.map((cue) => cue.text)).toEqual([
      '皆さんこんにちは今日は',
      '日本語の勉強をしましょう',
      'まずひらがなから始めます',
      'はいはい',
    ]);
    expect(cues[0].start).toBeCloseTo(0.16, 3);
    // Each line stays up until the next one starts: no 10 ms gaps to auto-pause on.
    expect(cues[0].end).toBeCloseTo(2.879, 3);
    expect(cues[1].start).toBeCloseTo(2.879, 3);
    expect(cues[1].end).toBeCloseTo(5.44, 3);
    expect(cues[3].end).toBeCloseTo(10.01, 3);
    for (const cue of cues) expect(cue.end - cue.start).toBeGreaterThan(1);
  });

  it('collapses the same shape after an SRT conversion (no timing tags left)', () => {
    const srt = [
      ['00:00:00,160', '00:00:02,869', '一行目です'],
      ['00:00:02,869', '00:00:02,879', '一行目です'],
      ['00:00:02,879', '00:00:05,430', '一行目です\n二行目です'],
      ['00:00:05,430', '00:00:05,440', '二行目です'],
      ['00:00:05,440', '00:00:08,200', '二行目です\n三行目です'],
      ['00:00:08,200', '00:00:08,210', '三行目です'],
      ['00:00:08,210', '00:00:10,000', '三行目です\n四行目です'],
    ].map(([a, b, text], i) => `${i + 1}\n${a} --> ${b}\n${text}\n`).join('\n');
    expect(isRollingCaptionTrack(srt)).toBe(true);
    expect(parseSubtitles(srt).map((cue) => cue.text)).toEqual(['一行目です', '二行目です', '三行目です', '四行目です']);
  });

  it('leaves ordinary two-line subtitles alone', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nおはよう\nございます\n\n2\n00:00:04,000 --> 00:00:06,000\nいい天気ですね\n';
    expect(isRollingCaptionTrack(srt)).toBe(false);
    expect(parseSubtitles(srt).map((cue) => cue.text)).toEqual(['おはよう\nございます', 'いい天気ですね']);
  });

  it('still parses a sloppy SRT whose cues are separated by whitespace-only lines', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\n一つ目\n \n2\n00:00:03,000 --> 00:00:04,000\n二つ目\n';
    expect(parseSubtitles(srt).map((cue) => [cue.start, cue.text])).toEqual([[1, '一つ目'], [3, '二つ目']]);
  });
});
