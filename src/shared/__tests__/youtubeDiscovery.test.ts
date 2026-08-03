// @vitest-environment node

/**
 * The pure half of YouTube discovery (Phase 8 item 3).
 *
 * Every case here runs with no network, no `yt-dlp` and no clock — the module
 * under test has none of those by construction. The payload fixtures are hand-
 * written in yt-dlp's `-J` shape rather than captured from a live run, which is
 * stated plainly because it is the one thing these tests cannot prove: they show
 * the parser handles that shape correctly, not that yt-dlp emits it.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSISTENT_CHANNEL_SHARE,
  captionPrimaryLang,
  deriveStudySignals,
  durationBand,
  estimateSpeechRate,
  japaneseScriptRatio,
  paceFromCharsPerMinute,
  parseCaptionTracks,
  parseYoutubeProbePayload,
  parseYoutubeSearchPayload,
  parseYoutubeUploadDate,
  rankYoutubeCandidates,
  scoreYoutubeCandidate,
  summariseChannelConsistency,
  youtubeCandidateId,
  type YoutubeDiscoveryCandidate,
  type YoutubeProbe,
} from '../youtubeDiscovery';

function candidate(over: Partial<YoutubeDiscoveryCandidate> = {}): YoutubeDiscoveryCandidate {
  return {
    provider: 'youtube',
    videoId: 'abcdefghijk',
    title: 'A video',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    channelId: 'UC0000000000000000000A',
    channelTitle: 'A channel',
    durationSec: 600,
    ...over,
  };
}

function probe(over: Partial<YoutubeProbe> = {}): YoutubeProbe {
  return {
    videoId: 'abcdefghijk',
    captions: [],
    audioLangs: [],
    categories: [],
    tags: [],
    probedAt: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe('caption inventory', () => {
  it('separates author-written tracks from ASR by container, not by language key', () => {
    const tracks = parseCaptionTracks({ ja: [{ ext: 'vtt' }] }, { ja: [{ ext: 'vtt' }], 'ja-en': [{ ext: 'vtt' }] });

    expect(tracks).toEqual([
      { key: 'ja', lang: 'ja', kind: 'human' },
      { key: 'ja', lang: 'ja', kind: 'auto' },
      { key: 'ja-en', lang: 'ja', kind: 'auto' },
    ]);
  });

  /**
   * The regression this feature exists to avoid.
   *
   * Every past livestream carries `subtitles.live_chat`, so the obvious check —
   * "does `subtitles` have any keys?" — reports author-written captions for a
   * three-hour unsubtitled stream, which is the single most misleading thing
   * this console could tell a learner.
   */
  it('does not count a live-chat replay as an author-written caption track', () => {
    const tracks = parseCaptionTracks({ live_chat: [{ ext: 'json' }] }, { ja: [{ ext: 'vtt' }] });

    expect(tracks.filter((track) => track.kind === 'human')).toEqual([]);
    expect(tracks).toHaveLength(1);
  });

  it('drops keys with no track behind them and keys that are not languages', () => {
    expect(parseCaptionTracks({ ja: [], '???': [{}] }, null)).toEqual([]);
  });

  it('reduces a regional key to its primary subtag', () => {
    expect(captionPrimaryLang('ja-JP')).toBe('ja');
    expect(captionPrimaryLang('zh-Hans')).toBe('zh');
    expect(captionPrimaryLang('live_chat')).toBe('');
  });

  it('survives a malformed container instead of throwing', () => {
    expect(parseCaptionTracks('nonsense', 42)).toEqual([]);
  });
});

describe('caption verdict', () => {
  it('reports unknown — not none — before anything has been probed', () => {
    expect(deriveStudySignals(candidate(), null).captions).toBe('unknown');
  });

  it('distinguishes all four probed outcomes', () => {
    const human = probe({ captions: [{ key: 'ja', lang: 'ja', kind: 'human' }] });
    const other = probe({ captions: [{ key: 'en', lang: 'en', kind: 'human' }] });
    const auto = probe({ captions: [{ key: 'ja', lang: 'ja', kind: 'auto' }] });

    expect(deriveStudySignals(candidate(), human).captions).toBe('human-target');
    expect(deriveStudySignals(candidate(), other).captions).toBe('human-other');
    expect(deriveStudySignals(candidate(), auto).captions).toBe('auto-only');
    expect(deriveStudySignals(candidate(), probe()).captions).toBe('none');
  });

  it('lists the author-written languages and flags an auto track in the target language', () => {
    const signals = deriveStudySignals(candidate(), probe({
      captions: [
        { key: 'en', lang: 'en', kind: 'human' },
        { key: 'ja', lang: 'ja', kind: 'auto' },
      ],
    }));

    expect(signals.humanCaptionLangs).toEqual(['en']);
    expect(signals.hasAutoTarget).toBe(true);
  });
});

describe('audio language', () => {
  it('believes a declared target language', () => {
    expect(deriveStudySignals(candidate(), probe({ declaredAudioLang: 'ja' })).audio).toBe('target');
  });

  it('reads a multi-audio upload from its audio formats', () => {
    expect(deriveStudySignals(candidate(), probe({ audioLangs: ['en', 'ja'] })).audio).toBe('target');
  });

  /**
   * Hand-written *translation* subtitles are as common as hand-written
   * transcripts, so a Japanese caption track must not override an explicit
   * English audio declaration — that would relabel every fansubbed English
   * video as Japanese audio.
   */
  it('does not let a Japanese caption track override a declared English audio language', () => {
    const signals = deriveStudySignals(candidate(), probe({
      declaredAudioLang: 'en',
      captions: [{ key: 'ja', lang: 'ja', kind: 'human' }],
    }));

    expect(signals.captions).toBe('human-target');
    expect(signals.audio).toBe('other');
  });

  it('falls back to the caption track only when nothing was declared', () => {
    const signals = deriveStudySignals(candidate(), probe({
      captions: [{ key: 'ja', lang: 'ja', kind: 'human' }],
    }));

    expect(signals.audio).toBe('target');
  });

  it('stays unknown when there is nothing to go on', () => {
    expect(deriveStudySignals(candidate(), probe()).audio).toBe('unknown');
  });
});

describe('japanese script ratio', () => {
  it('is 1 for pure Japanese and 0 for pure latin', () => {
    expect(japaneseScriptRatio('日本語')).toBe(1);
    expect(japaneseScriptRatio('hello world')).toBe(0);
  });

  it('excludes punctuation and digits from the denominator', () => {
    // Lenticular brackets are furniture, not content: a title wrapped in them is
    // still 100% Japanese.
    expect(japaneseScriptRatio('【日本語】')).toBe(1);
    expect(japaneseScriptRatio('日本語 #12!')).toBe(1);
  });

  it('mixes proportionally', () => {
    expect(japaneseScriptRatio('日本語 vlog')).toBeCloseTo(3 / 7, 5);
  });

  it('is 0 for an empty or non-string input', () => {
    expect(japaneseScriptRatio('')).toBe(0);
    expect(japaneseScriptRatio(undefined as unknown as string)).toBe(0);
  });
});

describe('speech rate', () => {
  it('divides by captioned time, not by wall clock', () => {
    // Six characters across two 2-second cues ten seconds apart: 4 s of speech,
    // not 12 s of video. Dividing by wall clock would report 30 ch/min and call
    // a normal speaker slow.
    const rate = estimateSpeechRate([
      { start: 0, end: 2, text: 'あいう' },
      { start: 10, end: 12, text: 'あいう' },
    ]);

    expect(rate).toBeCloseTo(90, 5);
  });

  it('merges overlapping cues instead of double-counting the overlap', () => {
    // Rolling auto-captions overlap. Summing raw durations gives 6 s here; the
    // cues actually span 5 s.
    const rate = estimateSpeechRate([
      { start: 0, end: 3, text: 'あいう' },
      { start: 2, end: 5, text: 'あいう' },
    ]);

    expect(rate).toBeCloseTo(72, 5);
  });

  it('counts only target-script characters, so a bilingual track is not inflated', () => {
    const japaneseOnly = estimateSpeechRate([{ start: 0, end: 60, text: 'あいうえお' }]);
    const bilingual = estimateSpeechRate([{ start: 0, end: 60, text: 'あいうえお / aiueo' }]);

    expect(japaneseOnly).toBe(5);
    expect(bilingual).toBe(5);
  });

  it('returns undefined rather than a zero when there is nothing to measure', () => {
    expect(estimateSpeechRate([])).toBeUndefined();
    expect(estimateSpeechRate([{ start: 5, end: 5, text: 'あ' }])).toBeUndefined();
    expect(estimateSpeechRate([{ start: 0, end: 10, text: 'hello' }])).toBeUndefined();
  });

  it('bands a rate, and calls an absent rate unknown', () => {
    expect(paceFromCharsPerMinute(200)).toBe('slow');
    expect(paceFromCharsPerMinute(340)).toBe('moderate');
    expect(paceFromCharsPerMinute(500)).toBe('fast');
    expect(paceFromCharsPerMinute(undefined)).toBe('unknown');
    expect(paceFromCharsPerMinute(0)).toBe('unknown');
  });

  it('prefers a rate the caller already measured over re-deriving one', () => {
    const signals = deriveStudySignals(candidate(), probe(), { charsPerMinute: 500 });

    expect(signals.pace).toBe('fast');
    expect(signals.charsPerMinute).toBe(500);
  });
});

describe('duration bands', () => {
  it('separates a Short from a clip, a standard video and a long sitting', () => {
    expect(durationBand(45)).toBe('short');
    expect(durationBand(5 * 60)).toBe('clip');
    expect(durationBand(20 * 60)).toBe('standard');
    expect(durationBand(90 * 60)).toBe('long');
    expect(durationBand(undefined)).toBe('unknown');
  });
});

describe('channel consistency', () => {
  const withCaptions = probe({ captions: [{ key: 'ja', lang: 'ja', kind: 'human' }] });

  function entry(videoId: string, p: YoutubeProbe | null, title = 'x') {
    const c = candidate({ videoId, title });
    return { candidate: c, signals: deriveStudySignals(c, p) };
  }

  it('counts only probed videos towards the caption share', () => {
    const rows = summariseChannelConsistency([
      entry('aaaaaaaaaaa', withCaptions),
      entry('bbbbbbbbbbb', withCaptions),
      entry('ccccccccccc', null),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].videos).toBe(3);
    expect(rows[0].probed).toBe(2);
    expect(rows[0].withHumanTargetCaptions).toBe(2);
    expect(rows[0].humanCaptionShare).toBe(1);
  });

  it('reports an unknown share below the sample floor rather than a confident 0 or 1', () => {
    const rows = summariseChannelConsistency([entry('aaaaaaaaaaa', withCaptions)]);

    expect(rows[0].probed).toBe(1);
    expect(rows[0].humanCaptionShare).toBeNull();
  });

  it('measures how much of a channel is titled in Japanese', () => {
    const rows = summariseChannelConsistency([
      entry('aaaaaaaaaaa', null, '日本語の練習'),
      entry('bbbbbbbbbbb', null, 'English lesson'),
    ]);

    expect(rows[0].japaneseTitleShare).toBe(0.5);
  });
});

describe('scoring', () => {
  const level = 'N3' as const;

  it('scores an unchecked video at the midpoint, not at zero', () => {
    const unchecked = scoreYoutubeCandidate(candidate(), deriveStudySignals(candidate(), null), { level });
    const confirmedNone = scoreYoutubeCandidate(candidate(), deriveStudySignals(candidate(), probe()), { level });

    // The differential is the point: "not checked" must outrank "checked and
    // there is nothing there", or the list only ever sorts by what was clicked.
    expect(unchecked.studyScore).toBeGreaterThan(confirmedNone.studyScore);
    expect(confirmedNone.studyScore).toBeGreaterThan(0);
  });

  it('ranks a hand-captioned Japanese video above an auto-only one', () => {
    const human = deriveStudySignals(candidate(), probe({
      declaredAudioLang: 'ja',
      captions: [{ key: 'ja', lang: 'ja', kind: 'human' }],
    }));
    const auto = deriveStudySignals(candidate(), probe({
      declaredAudioLang: 'ja',
      captions: [{ key: 'ja', lang: 'ja', kind: 'auto' }],
    }));

    expect(scoreYoutubeCandidate(candidate(), human, { level }).studyScore)
      .toBeGreaterThan(scoreYoutubeCandidate(candidate(), auto, { level }).studyScore);
  });

  it('penalises a live stream', () => {
    const live = candidate({ liveStatus: 'is_live' });
    const signals = deriveStudySignals(live, null);

    const ranking = scoreYoutubeCandidate(live, signals, { level });
    expect(signals.live).toBe(true);
    expect(ranking.reasons.some((reason) => reason.code === 'is-live')).toBe(true);
    expect(ranking.studyScore)
      .toBeLessThan(scoreYoutubeCandidate(candidate(), deriveStudySignals(candidate(), null), { level }).studyScore);
  });

  it('rewards a consistent channel only once the share clears the bar', () => {
    const signals = deriveStudySignals(candidate(), probe({ declaredAudioLang: 'ja' }));
    const consistent = new Map([[
      'UC0000000000000000000A',
      {
        channelId: 'UC0000000000000000000A',
        videos: 4,
        probed: 4,
        withHumanTargetCaptions: 4,
        humanCaptionShare: 1,
        japaneseTitleShare: 1,
      },
    ]]);
    const patchy = new Map([[
      'UC0000000000000000000A',
      {
        channelId: 'UC0000000000000000000A',
        videos: 4,
        probed: 4,
        withHumanTargetCaptions: 1,
        humanCaptionShare: 0.25,
        japaneseTitleShare: 1,
      },
    ]]);

    expect(0.25).toBeLessThan(CONSISTENT_CHANNEL_SHARE);
    expect(scoreYoutubeCandidate(candidate(), signals, { level, consistency: consistent }).studyScore)
      .toBeGreaterThan(scoreYoutubeCandidate(candidate(), signals, { level, consistency: patchy }).studyScore);
  });

  it('matches pace to the level rather than always preferring slow speech', () => {
    const slow = deriveStudySignals(candidate(), probe({ declaredAudioLang: 'ja' }), { charsPerMinute: 150 });
    const fast = deriveStudySignals(candidate(), probe({ declaredAudioLang: 'ja' }), { charsPerMinute: 600 });

    expect(scoreYoutubeCandidate(candidate(), slow, { level: 'N5' }).studyScore)
      .toBeGreaterThan(scoreYoutubeCandidate(candidate(), fast, { level: 'N5' }).studyScore);
    expect(scoreYoutubeCandidate(candidate(), fast, { level: 'N1' }).studyScore)
      .toBeGreaterThan(scoreYoutubeCandidate(candidate(), slow, { level: 'N1' }).studyScore);
  });
});

describe('ranking', () => {
  const level = 'N3' as const;

  function entryFor(videoId: string, p: YoutubeProbe | null, over: Partial<YoutubeDiscoveryCandidate> = {}) {
    const c = candidate({ videoId, ...over });
    return { candidate: c, signals: deriveStudySignals(c, p) };
  }

  it('drops confirmed misses but keeps unprobed rows when captions are required', () => {
    const ranked = rankYoutubeCandidates([
      entryFor('aaaaaaaaaaa', probe({ captions: [{ key: 'ja', lang: 'ja', kind: 'human' }] })),
      entryFor('bbbbbbbbbbb', probe()),
      entryFor('ccccccccccc', null),
    ], { level, requireHumanCaptions: true });

    // An unprobed row is not evidence of missing captions, so turning the filter
    // on must not silently empty a list nobody has checked yet.
    expect(ranked.map((entry) => entry.candidate.videoId).sort())
      .toEqual(['aaaaaaaaaaa', 'ccccccccccc']);
  });

  it('hides live streams when asked', () => {
    const ranked = rankYoutubeCandidates([
      entryFor('aaaaaaaaaaa', null),
      entryFor('bbbbbbbbbbb', null, { liveStatus: 'is_live' }),
    ], { level, hideLive: true });

    expect(ranked.map((entry) => entry.candidate.videoId)).toEqual(['aaaaaaaaaaa']);
  });

  it('dedupes by video id and orders deterministically on a tie', () => {
    const ranked = rankYoutubeCandidates([
      entryFor('aaaaaaaaaaa', null, { title: 'Zebra', viewCount: 10 }),
      entryFor('aaaaaaaaaaa', null, { title: 'Duplicate', viewCount: 999 }),
      entryFor('bbbbbbbbbbb', null, { title: 'Apple', viewCount: 10 }),
    ], { level });

    expect(ranked).toHaveLength(2);
    expect(ranked.map((entry) => entry.candidate.title)).toEqual(['Apple', 'Zebra']);
  });

  it('honours the limit', () => {
    const ranked = rankYoutubeCandidates([
      entryFor('aaaaaaaaaaa', null),
      entryFor('bbbbbbbbbbb', null),
    ], { level, limit: 1 });

    expect(ranked).toHaveLength(1);
  });
});

describe('yt-dlp payload parsing', () => {
  it('parses a flat-playlist search payload and skips unavailable entries', () => {
    const parsed = parseYoutubeSearchPayload({
      title: 'ytsearch',
      entries: [
        {
          id: 'aaaaaaaaaaa',
          title: '日本語ラジオ',
          channel: 'Nihongo',
          channel_id: 'UC1',
          duration: 900,
          view_count: 1234,
          upload_date: '20260115',
          thumbnails: [{ url: 'https://example.invalid/a.jpg' }],
          live_status: 'not_live',
        },
        // yt-dlp emits `_` for an entry it could not resolve.
        { id: '_', title: 'gone' },
        { url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', title: 'By URL' },
        'not an object',
      ],
    });

    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({
      provider: 'youtube',
      videoId: 'aaaaaaaaaaa',
      title: '日本語ラジオ',
      channelTitle: 'Nihongo',
      durationSec: 900,
      viewCount: 1234,
      thumbUrl: 'https://example.invalid/a.jpg',
      liveStatus: 'not_live',
    });
    expect(parsed.candidates[0].publishedAt).toBe(Date.UTC(2026, 0, 15));
    expect(parsed.candidates[1].videoId).toBe('bbbbbbbbbbb');
    expect(parsed.candidates[1].url).toBe('https://www.youtube.com/watch?v=bbbbbbbbbbb');
  });

  it('inherits the channel from the payload root on a channel browse', () => {
    const parsed = parseYoutubeSearchPayload({
      channel: 'Nihongo',
      channel_id: 'UC1',
      entries: [{ id: 'aaaaaaaaaaa', title: 'x' }],
    });

    expect(parsed.candidates[0]).toMatchObject({ channelTitle: 'Nihongo', channelId: 'UC1' });
  });

  it('drops a duplicate video id inside one payload', () => {
    const parsed = parseYoutubeSearchPayload({
      entries: [{ id: 'aaaaaaaaaaa', title: 'x' }, { id: 'aaaaaaaaaaa', title: 'x again' }],
    });

    expect(parsed.candidates).toHaveLength(1);
  });

  it('returns an empty result for junk instead of throwing', () => {
    expect(parseYoutubeSearchPayload(null).candidates).toEqual([]);
    expect(parseYoutubeSearchPayload({ entries: 'nope' }).candidates).toEqual([]);
  });

  it('parses a probe payload and ignores video-only formats when reading audio languages', () => {
    const parsed = parseYoutubeProbePayload({
      id: 'aaaaaaaaaaa',
      language: 'ja',
      subtitles: { ja: [{ ext: 'vtt' }], live_chat: [{ ext: 'json' }] },
      automatic_captions: { en: [{ ext: 'vtt' }] },
      chapters: [{ title: 'one' }, { title: 'two' }],
      categories: ['Education'],
      tags: ['japanese'],
      formats: [
        { acodec: 'none', language: 'en' },
        { acodec: 'mp4a.40.2', language: 'ja' },
        { acodec: 'opus', language: 'en' },
      ],
    }, 999);

    expect(parsed).not.toBeNull();
    expect(parsed!.declaredAudioLang).toBe('ja');
    expect(parsed!.audioLangs).toEqual(['ja', 'en']);
    expect(parsed!.chapterCount).toBe(2);
    expect(parsed!.probedAt).toBe(999);
    expect(parsed!.captions).toEqual([
      { key: 'ja', lang: 'ja', kind: 'human' },
      { key: 'en', lang: 'en', kind: 'auto' },
    ]);
  });

  it('returns null for a probe payload with no identifiable video', () => {
    expect(parseYoutubeProbePayload({ title: 'no id' }, 1)).toBeNull();
    expect(parseYoutubeProbePayload(null, 1)).toBeNull();
  });

  it('reads all three shapes yt-dlp uses for an upload date', () => {
    expect(parseYoutubeUploadDate('20260115')).toBe(Date.UTC(2026, 0, 15));
    expect(parseYoutubeUploadDate(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseYoutubeUploadDate(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseYoutubeUploadDate('nonsense')).toBeUndefined();
  });
});

describe('identity', () => {
  it('namespaces the shortlist key so a YouTube id cannot collide with a catalogue id', () => {
    expect(youtubeCandidateId(candidate())).toBe('youtube:abcdefghijk');
  });
});
