import { describe, expect, it } from 'vitest';
import { classifyMediaKind } from '../mediaKind';
import { cuesToSrt, cuesToVtt, formatSrtTime } from '../subtitlesExport';

describe('classifyMediaKind', () => {
  it('classifies video extensions', () => {
    expect(classifyMediaKind('show.mkv')).toBe('video');
    expect(classifyMediaKind('clip.MP4')).toBe('video');
  });

  it('classifies audio and audiobook heuristics', () => {
    expect(classifyMediaKind('song.mp3')).toBe('audio');
    expect(classifyMediaKind('My Audiobook Chapter 1.mp3')).toBe('audiobook');
    expect(classifyMediaKind('long.flac', 40 * 60)).toBe('audiobook');
  });
});

describe('subtitlesExport', () => {
  it('formats SRT timestamps', () => {
    expect(formatSrtTime(3661.5)).toBe('01:01:01,500');
  });

  it('exports SRT and VTT', () => {
    const cues = [
      { start: 0, end: 1.5, text: 'こんにちは' },
      { start: 1.5, end: 3, text: '世界' },
    ];
    const srt = cuesToSrt(cues);
    expect(srt).toContain('1\n');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,500');
    expect(srt).toContain('こんにちは');
    const vtt = cuesToVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
  });
});
