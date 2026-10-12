// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  YT5_COMPREHENSION_CACHE_MAX,
  yt5BestStudyTrack,
  yt5CaptionTrackArgs,
  yt5Clock,
  yt5ComprehensionBand,
  yt5IsSafeTrackKey,
  yt5MiningMeta,
  yt5NewVideoNotice,
  yt5NewVideosAfterSync,
  yt5PlanSweep,
  yt5RankCaptionTracks,
  yt5RememberComprehension,
  yt5SanitizeComprehensionCache,
  yt5StudyVideo,
  yt5TimestampFromUrl,
  yt5TimestampUrl,
  yt5TrackKindKey,
  yt5VideoIdFromUrl,
  yt5PlaylistProgress,
  type Yt5PlaylistVideo,
} from '../youtubeStudy5';
import { parseCaptionTracks } from '../youtubeDiscovery';
import { cuePlaybackEndSec, cuePlaybackStartSec } from '../videoCoreStudy';
import { parseSubtitles } from '../subtitleCues';

const VID = 'dQw4w9WgXcQ';

describe('caption track ranking', () => {
  const tracks = parseCaptionTracks(
    { 'ja-JP': [{}], en: [{}], fr: [{}], live_chat: [{}] },
    { 'ja-orig': [{}], ja: [{}], 'en-ja': [{}], de: [{}], en: [{}] },
  );

  it('puts manual study-language captions first, then ASR, then translations, then helpers', () => {
    const ranked = yt5RankCaptionTracks(tracks, 'ja', 'en');
    expect(ranked.map((t) => `${t.kind}:${t.key}`)).toEqual([
      'human:ja-JP',
      'auto:ja-orig',
      'auto:ja',
      'human:en',
      'human:fr',
      'auto:en',
      'auto:en-ja',
      'auto:de',
    ]);
    expect(ranked.find((t) => t.key === 'en-ja')).toMatchObject({ translated: true, role: 'helper' });
    expect(ranked.find((t) => t.key === 'ja-JP')).toMatchObject({ translated: false, role: 'study' });
    expect(yt5BestStudyTrack(ranked)?.key).toBe('ja-JP');
  });

  it('knows no study track when none is in the study language', () => {
    expect(yt5BestStudyTrack(yt5RankCaptionTracks(tracks, 'ko'))).toBeNull();
  });

  it('labels kinds', () => {
    expect(yt5TrackKindKey({ kind: 'human', translated: false })).toBe('manual');
    expect(yt5TrackKindKey({ kind: 'auto', translated: false })).toBe('auto');
    expect(yt5TrackKindKey({ kind: 'auto', translated: true })).toBe('translated');
  });

  it('builds metadata-only argv for one track and refuses unsafe input', () => {
    const args = yt5CaptionTrackArgs(VID, 'ja-orig', 'auto', '/tmp/%(id)s');
    expect(args).toContain('--skip-download');
    expect(args).toContain('--write-auto-subs');
    expect(args).not.toContain('--write-subs');
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('ja-orig');
    expect(yt5CaptionTrackArgs(VID, 'ja', 'human', 'o')).toContain('--write-subs');
    expect(() => yt5CaptionTrackArgs('bad', 'ja', 'human', 'o')).toThrow();
    expect(() => yt5CaptionTrackArgs(VID, 'ja,--exec', 'human', 'o')).toThrow();
    expect(yt5IsSafeTrackKey('zh-Hans')).toBe(true);
    expect(yt5IsSafeTrackKey('all')).toBe(true);
    expect(yt5IsSafeTrackKey('../x')).toBe(false);
  });
});

describe('pre-study vocabulary', () => {
  const levels: Record<string, number> = { 私: 3, 好き: 3, 猫: 0, 犬: 1, 食べる: 3 };
  const levelOf = (w: string) => levels[w] ?? 0;
  const tokenize = (text: string) =>
    text.split(' ').filter(Boolean).map((w) => ({ lemma: w, surface: w, content: w !== 'は', reading: w === '猫' ? 'ねこ' : '' }));

  it('lists unknown words by frequency with first time, and i+1 cues', () => {
    const study = yt5StudyVideo(
      [
        { start: 5, end: 7, text: '私 は 猫 好き' },
        { start: 9, end: 10, text: '猫 犬' },
        { start: 12, end: 14, text: '私 食べる 好き' },
      ],
      tokenize,
      levelOf,
    );
    expect(study.vocabulary.map((v) => [v.lemma, v.count, v.firstSec])).toEqual([['猫', 2, 5], ['犬', 1, 9]]);
    expect(study.vocabulary[0].reading).toBe('ねこ');
    expect(study.iPlusOne).toEqual([{ start: 5, end: 7, text: '私 は 猫 好き', lemma: '猫' }]);
    expect(study.tokens).toBe(8);
    expect(study.knownRatio).toBeCloseTo(5 / 8);
    expect(study.band).toBe('hard');
    expect(study.unknownUnique).toBe(2);
  });

  it('bands comprehension at 95 / 90 / 80 percent', () => {
    expect(yt5ComprehensionBand(0.96)).toBe('easy');
    expect(yt5ComprehensionBand(0.9)).toBe('comfortable');
    expect(yt5ComprehensionBand(0.85)).toBe('stretch');
    expect(yt5ComprehensionBand(0.5)).toBe('hard');
    expect(yt5ComprehensionBand(null)).toBeNull();
  });

  it('remembers per-video estimates, capped, and sanitizes storage', () => {
    let cache = {};
    for (let i = 0; i < YT5_COMPREHENSION_CACHE_MAX + 3; i++) {
      cache = yt5RememberComprehension(cache, `v${String(i).padStart(10, '0')}`, 0.9, i);
    }
    expect(Object.keys(cache)).toHaveLength(YT5_COMPREHENSION_CACHE_MAX);
    expect(yt5RememberComprehension({}, VID, 0.876, 1)[VID].knownPct).toBe(88);
    expect(yt5SanitizeComprehensionCache({ [VID]: { knownPct: 50, at: 1 }, bad: { knownPct: 1, at: 1 }, [`${VID.slice(1)}x`]: { knownPct: 900, at: 1 } })).toEqual({
      [VID]: { knownPct: 50, at: 1 },
    });
  });
});

describe('subscriptions', () => {
  it('plans a sweep oldest-checked first, capped', () => {
    const due = [
      { id: 'b', lastCheckedAt: 5 },
      { id: 'a' },
      { id: 'c', lastCheckedAt: 1 },
    ];
    expect(yt5PlanSweep(due, 2).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('reports only videos new to the playlist, never on its first check', () => {
    const after = [
      { youtubeId: 'old', title: 'Old', playlistId: 'p' },
      { youtubeId: 'new', title: 'New', playlistId: 'p' },
      { youtubeId: 'gone', title: 'Gone', playlistId: 'p', removedFromYouTube: true },
      { youtubeId: 'other', title: 'Other', playlistId: 'q' },
    ];
    expect(yt5NewVideosAfterSync(new Set(['old']), after, 'p', false)).toEqual([{ youtubeId: 'new', title: 'New' }]);
    expect(yt5NewVideosAfterSync(new Set(), after, 'p', true)).toEqual([]);
    expect(yt5NewVideoNotice([{ playlistTitle: 'P', titles: [] }])).toBeNull();
    expect(yt5NewVideoNotice([{ playlistTitle: 'P', titles: [] }, { playlistTitle: 'Q', titles: ['x', 'y'] }])).toEqual({
      count: 2,
      firstTitle: 'x',
      playlists: ['Q'],
    });
  });
});

describe('mining metadata', () => {
  it('formats clocks and builds a timestamp link that round-trips', () => {
    expect(yt5Clock(83.9)).toBe('1:23');
    expect(yt5Clock(3723)).toBe('1:02:03');
    const url = yt5TimestampUrl(VID, 83.9);
    expect(url).toBe(`https://www.youtube.com/watch?v=${VID}&t=83s`);
    expect(yt5VideoIdFromUrl(url)).toBe(VID);
    expect(yt5TimestampFromUrl(url)).toBe(83);
    expect(yt5TimestampFromUrl(`https://youtu.be/${VID}?t=1m23s`)).toBe(83);
    expect(yt5VideoIdFromUrl(`https://youtu.be/${VID}`)).toBe(VID);
    expect(yt5VideoIdFromUrl(`https://www.youtube.com/shorts/${VID}`)).toBe(VID);
    expect(yt5VideoIdFromUrl('https://example.com/watch?v=x')).toBe('');
    expect(yt5TimestampUrl('nope', 3)).toBe('');
  });

  it('gives every surface the same title, scene label and link', () => {
    expect(yt5MiningMeta({ videoId: VID, title: ' 動画 ', startSec: 61 })).toEqual({
      sourceTitle: '動画',
      sceneReference: '1:01',
      webUrl: `https://www.youtube.com/watch?v=${VID}&t=61s`,
    });
    expect(yt5MiningMeta({ videoId: 'x', title: 't', startSec: 1 })).toBeNull();
  });
});

describe('playlist study progress', () => {
  const v = (id: string, position: number, over: Partial<Yt5PlaylistVideo> = {}): Yt5PlaylistVideo => ({
    id,
    position,
    downloaded: true,
    watch: null,
    ...over,
  });

  it('sums watched, in-progress and downloads, with a half-watched video counting by its fraction', () => {
    const progress = yt5PlaylistProgress([
      v('a', 0, { watch: { kind: 'watched' }, knownPct: 92, mined: 3 }),
      v('b', 1, { watch: { kind: 'resume', fraction: 0.5 }, knownPct: 80, mined: 1 }),
      v('c', 2),
      v('d', 3, { downloaded: false }),
    ]);
    expect(progress).toMatchObject({ total: 4, downloaded: 3, watched: 1, inProgress: 1, progressPct: 38, avgKnownPct: 86, measured: 2, mined: 4 });
    // The video in progress comes first.
    expect(progress.next).toEqual({ id: 'b', reason: 'resume' });
  });

  it('then the first unwatched download in playlist order, then a video still to download', () => {
    expect(yt5PlaylistProgress([v('late', 5), v('early', 1), v('done', 0, { watch: { kind: 'watched' } })]).next)
      .toEqual({ id: 'early', reason: 'next' });
    expect(yt5PlaylistProgress([v('done', 0, { watch: { kind: 'watched' } }), v('remote', 1, { downloaded: false })]).next)
      .toEqual({ id: 'remote', reason: 'download' });
    const finished = yt5PlaylistProgress([v('done', 0, { watch: { kind: 'watched' } })]);
    expect(finished.next).toBeNull();
    expect(finished.progressPct).toBe(100);
  });

  it('skips a video gone from YouTube unless a download of it exists', () => {
    const progress = yt5PlaylistProgress([
      v('gone', 0, { removedFromYouTube: true, downloaded: false }),
      v('kept', 1, { removedFromYouTube: true }),
    ]);
    expect(progress.total).toBe(1);
    expect(progress.next).toEqual({ id: 'kept', reason: 'next' });
    expect(yt5PlaylistProgress([]).progressPct).toBe(0);
    expect(yt5PlaylistProgress([]).avgKnownPct).toBeNull();
  });
});

describe('mining timestamps: the card, its audio and its still all point at the same moment', () => {
  // A cue the subtitle file places at 1:23.950-1:26.400, played with the subtitles
  // delayed by +0.3 s to match the audio.
  const cue = { startMs: 83_950, endMs: 86_400 };
  const delay = 0.3;

  it('audio is cut over the PLAYED range, the still is taken at its middle', () => {
    const start = cuePlaybackStartSec(cue, delay);
    const end = cuePlaybackEndSec(cue, delay);
    expect(start).toBeCloseTo(84.25, 6);
    expect(end).toBeCloseTo(86.7, 6);
    expect((start + end) / 2).toBeCloseTo(85.475, 6);
    // A negative delay never asks for audio before the file starts.
    expect(cuePlaybackStartSec({ startMs: 100 }, -0.5)).toBe(0);
  });

  it('the scene link and label start at (never after) the played line', () => {
    const start = cuePlaybackStartSec(cue, delay);
    const meta = yt5MiningMeta({ videoId: VID, title: '  ', startSec: start });
    expect(meta).toEqual({ sourceTitle: VID, sceneReference: '1:24', webUrl: `https://www.youtube.com/watch?v=${VID}&t=84s` });
    expect(yt5TimestampFromUrl(meta?.webUrl)).toBeLessThanOrEqual(start);
    // Hours roll over; a line in the first second links without t=.
    expect(yt5MiningMeta({ videoId: VID, title: 'x', startSec: 3723.9 })?.sceneReference).toBe('1:02:03');
    expect(yt5MiningMeta({ videoId: VID, title: 'x', startSec: 0.4 })?.webUrl).toBe(`https://www.youtube.com/watch?v=${VID}`);
  });

  it('a rolling auto-caption line is timed from when it starts being said', () => {
    const cues = parseSubtitles([
      'WEBVTT', '',
      '00:01:23.950 --> 00:01:26.400 align:start position:0%', ' ', 'これは<00:01:24.500><c>テスト</c>', '',
      '00:01:26.400 --> 00:01:26.410 align:start position:0%', 'これはテスト', ' ', '',
      '00:01:26.410 --> 00:01:29.000 align:start position:0%', 'これはテスト', '次の<00:01:27.000><c>行</c>', '',
    ].join('\n'));
    expect(cues.map((c) => [c.start, c.text])).toEqual([[83.95, 'これはテスト'], [86.41, '次の行']]);
    const studyCue = { startMs: Math.round(cues[0].start * 1000), endMs: Math.round(cues[0].end * 1000) };
    expect(cuePlaybackStartSec(studyCue, 0)).toBeCloseTo(83.95, 6);
    expect(cuePlaybackEndSec(studyCue, 0)).toBeCloseTo(86.41, 6);
  });
});
