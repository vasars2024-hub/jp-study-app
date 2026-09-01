/**
 * MINING gates 1 and 2 — the dub decision, tested against the shapes yt-dlp
 * actually emits for a multi-audio YouTube video.
 *
 * The two assertions that carry the gates are the ones about what does NOT
 * happen: the default path's args must be byte-identical to the strings the app
 * shipped before this feature existed, and a language the video lacks must
 * refuse rather than produce a format string with a fallback tail.
 */
import { describe, expect, it } from 'vitest';
import {
  YOUTUBE_AUDIO_LANGS,
  audioLangMatches,
  audioLangRefusalKey,
  audioLangRefusalMessage,
  isYouTubeAudioLang,
  listAudioTrackLanguages,
  listAudioTracks,
  normalizeYouTubeAudioLang,
  pickAudioTrack,
  planYoutubeAudioTrack,
  youtubeFormatArgs,
  type YtDlpFormat,
} from '../ytAudioLang';

/** A dubbed YouTube video: one video-only track, three tagged audio tracks. */
const DUBBED: YtDlpFormat[] = [
  { format_id: '137', vcodec: 'avc1', acodec: 'none', ext: 'mp4' },
  { format_id: '140-0', vcodec: 'none', acodec: 'mp4a', language: 'en-US', abr: 129, ext: 'm4a', format_note: 'American English original (default)' },
  { format_id: '140-1', vcodec: 'none', acodec: 'mp4a', language: 'ja-JP', abr: 129, ext: 'm4a', format_note: 'Japanese' },
  { format_id: '251-1', vcodec: 'none', acodec: 'opus', language: 'ja-JP', abr: 141, ext: 'webm', format_note: 'Japanese' },
  { format_id: '140-2', vcodec: 'none', acodec: 'mp4a', language: 'es-US', abr: 129, ext: 'm4a', format_note: 'Spanish' },
];

/** The ordinary single-track video: audio exists but carries no language tag. */
const UNTAGGED: YtDlpFormat[] = [
  { format_id: '137', vcodec: 'avc1', acodec: 'none', ext: 'mp4' },
  { format_id: '140', vcodec: 'none', acodec: 'mp4a', language: null, abr: 129, ext: 'm4a' },
  { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', language: null, abr: 96, ext: 'mp4' },
];

describe('YouTubeAudioLang normalisation', () => {
  it('offers original plus the four study languages', () => {
    expect([...YOUTUBE_AUDIO_LANGS]).toEqual(['original', 'ja', 'zh', 'en', 'ru']);
  });

  it('treats absent, unknown and null as original', () => {
    expect(normalizeYouTubeAudioLang(undefined)).toBe('original');
    expect(normalizeYouTubeAudioLang(null)).toBe('original');
    expect(normalizeYouTubeAudioLang('klingon')).toBe('original');
    expect(normalizeYouTubeAudioLang(7)).toBe('original');
    expect(normalizeYouTubeAudioLang('ja')).toBe('ja');
  });

  it('isYouTubeAudioLang rejects the subtitle list\'s "none"', () => {
    expect(isYouTubeAudioLang('none')).toBe(false);
    expect(isYouTubeAudioLang('original')).toBe(true);
  });
});

describe('audioLangMatches', () => {
  it('matches the bare tag and its regional variants, case-insensitively', () => {
    expect(audioLangMatches('ja', 'ja')).toBe(true);
    expect(audioLangMatches('ja-JP', 'ja')).toBe(true);
    expect(audioLangMatches('JA-jp', 'ja')).toBe(true);
    expect(audioLangMatches('zh-Hans', 'zh')).toBe(true);
    expect(audioLangMatches('zh-TW', 'zh')).toBe(true);
  });

  it('does NOT match on a bare prefix — en must not claim enm', () => {
    expect(audioLangMatches('enm', 'en')).toBe(false);
    expect(audioLangMatches('jav', 'ja')).toBe(false);
  });

  it('never matches when nothing was asked for, or the tag is missing', () => {
    expect(audioLangMatches('ja', 'original')).toBe(false);
    expect(audioLangMatches(null, 'ja')).toBe(false);
    expect(audioLangMatches('   ', 'ja')).toBe(false);
  });
});

describe('enumerating a video\'s audio tracks', () => {
  it('lists every distinct tagged audio language, deduped and sorted', () => {
    expect(listAudioTrackLanguages(DUBBED)).toEqual(['en-US', 'es-US', 'ja-JP']);
  });

  it('ignores video-only and muxed formats, so an untagged video lists nothing', () => {
    expect(listAudioTrackLanguages(UNTAGGED)).toEqual([]);
    // `18` is muxed (both codecs present) and must not be counted as a track.
    expect(listAudioTracks(UNTAGGED)).toEqual([]);
  });

  it('flags the uploader\'s primary track from format_note', () => {
    const original = listAudioTracks(DUBBED).find((t) => t.formatId === '140-0');
    expect(original?.isOriginal).toBe(true);
    expect(listAudioTracks(DUBBED).find((t) => t.formatId === '140-1')?.isOriginal).toBe(false);
  });
});

describe('pickAudioTrack', () => {
  it('takes the highest bitrate among the matching tracks', () => {
    expect(pickAudioTrack(DUBBED, 'ja')?.formatId).toBe('251-1');
    expect(pickAudioTrack(DUBBED, 'ja')?.abr).toBe(141);
  });

  it('is deterministic when bitrates tie', () => {
    const tied: YtDlpFormat[] = [
      { format_id: 'b', vcodec: 'none', acodec: 'mp4a', language: 'ja', abr: 100 },
      { format_id: 'a', vcodec: 'none', acodec: 'mp4a', language: 'ja', abr: 100 },
    ];
    expect(pickAudioTrack(tied, 'ja')?.formatId).toBe('a');
    expect(pickAudioTrack([...tied].reverse(), 'ja')?.formatId).toBe('a');
  });

  it('an untagged bitrate loses to a tagged one', () => {
    const mixed: YtDlpFormat[] = [
      { format_id: 'untagged', vcodec: 'none', acodec: 'mp4a', language: 'ja', abr: null },
      { format_id: 'tagged', vcodec: 'none', acodec: 'mp4a', language: 'ja', abr: 64 },
    ];
    expect(pickAudioTrack(mixed, 'ja')?.formatId).toBe('tagged');
  });

  it('returns null rather than the nearest track', () => {
    expect(pickAudioTrack(DUBBED, 'ru')).toBeNull();
    expect(pickAudioTrack(DUBBED, 'zh')).toBeNull();
  });
});

describe('planYoutubeAudioTrack — gate 1', () => {
  it('selects the exact format id whose manifest language matches', () => {
    const plan = planYoutubeAudioTrack('ja', DUBBED);
    expect(plan.action).toBe('select');
    if (plan.action !== 'select') return;
    expect(plan.track.formatId).toBe('251-1');
    // The gate's own wording: the language comes from the manifest, not the flag.
    expect(plan.track.language).toBe('ja-JP');
    expect(plan.wanted).toBe('ja');
  });

  it('does not probe or refuse when no language was asked for', () => {
    expect(planYoutubeAudioTrack('original', DUBBED)).toEqual({ action: 'default' });
    expect(planYoutubeAudioTrack(undefined, null)).toEqual({ action: 'default' });
  });
});

describe('planYoutubeAudioTrack — gate 2, the negative control', () => {
  it('refuses by name for a language the video does not ship, and says what it does', () => {
    const plan = planYoutubeAudioTrack('ru', DUBBED);
    expect(plan.action).toBe('refuse');
    if (plan.action !== 'refuse') return;
    expect(plan.reason).toBe('noSuchAudioLanguage');
    expect(plan.reasonKey).toBe('media.yt.audioLang.refuse.noSuchAudioLanguage');
    expect(plan.available).toEqual(['en-US', 'es-US', 'ja-JP']);
    expect(audioLangRefusalMessage(plan)).toContain('en-US');
  });

  it('distinguishes a single-track video from a missing dub', () => {
    const plan = planYoutubeAudioTrack('ja', UNTAGGED);
    expect(plan.action).toBe('refuse');
    if (plan.action !== 'refuse') return;
    expect(plan.reason).toBe('noTaggedAudioTracks');
    expect(plan.available).toEqual([]);
  });

  it('a failed probe is its own refusal, never a fall back to the default track', () => {
    const plan = planYoutubeAudioTrack('ja', null);
    expect(plan.action).toBe('refuse');
    if (plan.action !== 'refuse') return;
    expect(plan.reason).toBe('audioProbeFailed');
  });

  it('every refusal reason has its own key — never a shared "failed"', () => {
    const keys = (['noSuchAudioLanguage', 'noTaggedAudioTracks', 'audioProbeFailed'] as const).map(
      audioLangRefusalKey,
    );
    expect(new Set(keys).size).toBe(3);
  });
});

describe('youtubeFormatArgs', () => {
  it('reproduces the pre-existing args byte-for-byte on the default path', () => {
    // These two literals are copied from `main/media.ts` as it stood before the
    // audio-language field existed. If this test ever needs updating, the
    // change has altered every download the app makes, not just dubbed ones.
    expect(youtubeFormatArgs({ action: 'default' }, true)).toEqual([
      '-f',
      'ba[ext=m4a]/ba/b',
      '-x',
      '--audio-format',
      'm4a',
    ]);
    expect(youtubeFormatArgs({ action: 'default' }, false)).toEqual([
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--merge-output-format',
      'mp4',
    ]);
  });

  it('puts the chosen format id in the selector, with NO fallback tail', () => {
    const plan = planYoutubeAudioTrack('ja', DUBBED);
    const video = youtubeFormatArgs(plan, false);
    const audio = youtubeFormatArgs(plan, true);
    expect(video[1]).toBe('bv*[ext=mp4]+251-1/bv*+251-1');
    expect(audio[1]).toBe('251-1');
    // Gate 2's failure mode in one assertion: a `/ba/b` tail would silently
    // download the English track and report success.
    for (const args of [video, audio]) {
      expect(args[1]).not.toContain('/ba');
      expect(args[1]).not.toMatch(/\/b$/);
    }
  });

  it('a refusal never produces args a caller could run anyway', () => {
    // A refusal is returned before the format is built; if a caller ignores
    // that, it gets the default rather than a wrong-language selector.
    const plan = planYoutubeAudioTrack('ru', DUBBED);
    expect(youtubeFormatArgs(plan, true)[1]).toBe('ba[ext=m4a]/ba/b');
  });
});
