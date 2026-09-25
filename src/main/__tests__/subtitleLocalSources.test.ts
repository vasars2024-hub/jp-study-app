import { describe, expect, it } from 'vitest';
import {
  guessSidecarLanguage,
  normalizeStreamLanguage,
  parseSubtitleStreams,
} from '../subtitleLocalSources';

describe('parseSubtitleStreams', () => {
  it('finds nothing in a file with no subtitle streams', () => {
    // Real output from the user's Big O rip: video + audio only, and chapter
    // titles that must not be mistaken for stream metadata.
    const stderr = `
  Duration: 00:23:45.53, start: 0.000000, bitrate: 11980 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 90.000000
      Metadata:
        title           : Opening
    Chapter #0:1: start 90.000000, end 1380.000000
      Metadata:
        title           : Main
  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt709), 1440x1080, 29.97 fps
  Stream #0:1(jpn): Audio: flac, 48000 Hz, stereo, s16 (default)
`;
    expect(parseSubtitleStreams(stderr)).toEqual([]);
  });

  it('reads language, codec and index from tagged streams', () => {
    const stderr = `
  Stream #0:0: Video: h264, yuv420p, 1920x1080
  Stream #0:1(jpn): Audio: aac, 48000 Hz
  Stream #0:2(jpn): Subtitle: subrip (default)
  Stream #0:3(eng): Subtitle: ass
`;
    const streams = parseSubtitleStreams(stderr);
    expect(streams).toHaveLength(2);
    expect(streams[0]).toMatchObject({ subtitleIndex: 0, streamIndex: 2, language: 'jpn', codec: 'subrip' });
    expect(streams[1]).toMatchObject({ subtitleIndex: 1, streamIndex: 3, language: 'eng', codec: 'ass' });
  });

  it('keeps the -map counter aligned when a bitmap track is skipped', () => {
    // The PGS track is not extractable, but it still occupies `0:s:0` — numbering
    // the ASS track as 0 would extract the wrong stream.
    const stderr = `
  Stream #0:1: Subtitle: hdmv_pgs_subtitle
  Stream #0:2(jpn): Subtitle: ass
`;
    const streams = parseSubtitleStreams(stderr);
    expect(streams).toHaveLength(1);
    expect(streams[0].codec).toBe('ass');
    expect(streams[0].subtitleIndex).toBe(1);
  });

  it('handles an untagged stream', () => {
    const streams = parseSubtitleStreams('  Stream #0:2: Subtitle: webvtt\n');
    expect(streams[0]).toMatchObject({ language: null, codec: 'webvtt' });
  });

  it('reads a stream title from its own metadata block', () => {
    const stderr = `
  Stream #0:2(eng): Subtitle: ass
      Metadata:
        title           : Signs & Songs
  Stream #0:3(eng): Subtitle: subrip
      Metadata:
        title           : Full SDH
`;
    const streams = parseSubtitleStreams(stderr);
    expect(streams[0].title).toBe('Signs & Songs');
    expect(streams[1].title).toBe('Full SDH');
    expect(streams[1].hearingImpaired).toBe(true);
  });

  it('does not read a following chapter title as a stream title', () => {
    const stderr = `
  Stream #0:2(jpn): Subtitle: subrip
  Chapter #0:0: start 0.000000, end 90.000000
      Metadata:
        title           : Opening
`;
    expect(parseSubtitleStreams(stderr)[0].title).toBeNull();
  });

  it('detects forced tracks from the disposition trailer', () => {
    const streams = parseSubtitleStreams('  Stream #0:4(eng): Subtitle: subrip (forced)\n');
    expect(streams[0].forced).toBe(true);
  });
});

describe('normalizeStreamLanguage', () => {
  it('maps three-letter container tags to the app form', () => {
    expect(normalizeStreamLanguage('jpn')).toBe('ja');
    expect(normalizeStreamLanguage('eng')).toBe('en');
    expect(normalizeStreamLanguage('zho')).toBe('zh');
  });

  it('collapses a region unless it is a real script distinction', () => {
    expect(normalizeStreamLanguage('ja-JP')).toBe('ja');
    expect(normalizeStreamLanguage('zh-Hans')).toBe('zh-hans');
    expect(normalizeStreamLanguage('zh-Hant')).toBe('zh-hant');
  });

  it('treats undefined tags as unknown', () => {
    expect(normalizeStreamLanguage('und')).toBeNull();
    expect(normalizeStreamLanguage('')).toBeNull();
    expect(normalizeStreamLanguage(null)).toBeNull();
  });
});

describe('guessSidecarLanguage', () => {
  const stem = 'The Big O - 07';

  it('reads a tag or a language word after the media stem', () => {
    expect(guessSidecarLanguage(`${stem}.ja.srt`, stem)).toBe('ja');
    expect(guessSidecarLanguage(`${stem}.jpn.ass`, stem)).toBe('ja');
    expect(guessSidecarLanguage(`${stem}.Japanese.srt`, stem)).toBe('ja');
    expect(guessSidecarLanguage(`${stem}_en_US.vtt`, stem)).toBe('en');
  });

  it('returns null when the name carries no language', () => {
    expect(guessSidecarLanguage(`${stem}.srt`, stem)).toBeNull();
  });

  it('only looks after the stem, so a title word is not read as a language', () => {
    // "English Teacher" must not be detected as an English subtitle.
    const showStem = 'My English Teacher - 01';
    expect(guessSidecarLanguage(`${showStem}.srt`, showStem)).toBeNull();
    expect(guessSidecarLanguage(`${showStem}.ja.srt`, showStem)).toBe('ja');
  });
});

describe('Simplified and Traditional Chinese tags stay distinct', () => {
  it('maps fansub and region tags to zh-hans / zh-hant instead of "ch"', () => {
    expect(normalizeStreamLanguage('chs')).toBe('zh-hans');
    expect(normalizeStreamLanguage('cht')).toBe('zh-hant');
    expect(normalizeStreamLanguage('zh-TW')).toBe('zh-hant');
    expect(normalizeStreamLanguage('zh_CN')).toBe('zh-hans');
    expect(guessSidecarLanguage('Show.01.chs.ass', 'Show.01')).toBe('zh-hans');
    expect(guessSidecarLanguage('Show.01.cht.ass', 'Show.01')).toBe('zh-hant');
    expect(guessSidecarLanguage('Show.01.Chinese.Traditional.srt', 'Show.01')).toBe('zh-hant');
  });
});
