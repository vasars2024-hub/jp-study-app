import { describe, expect, it } from 'vitest';
import type { TorrentRow } from '../scraperResults';
import {
  asNyaaAcquisitionConfig,
  buildSubtitleQuery,
  couldCarrySidecarSubtitles,
  episodeFromFileName,
  isBitmapSubtitleFile,
  JAPANESE_KANA_FLOOR,
  languageFromFileName,
  looksJapaneseSubtitle,
  looksLikeSameTitle,
  looksLikeSubtitleOnly,
  packCoversEpisodeCount,
  rankSubtitleCandidates,
  SUBTITLE_PACK_BYTES_PER_EPISODE,
  selectSubtitleFiles,
  subtitleFormatFor,
  subtitleKanaCount,
  subtitlePackSignals,
  SUBTITLE_SIZE_CEILING_BYTES,
} from '../subtitleNyaa';

const MB = 1024 * 1024;

function row(overrides: Partial<TorrentRow> & { name: string }): TorrentRow {
  return {
    id: overrides.name,
    infoHash: 'a'.repeat(40),
    releaseGroup: '',
    resolution: '',
    seeders: 10,
    leechers: 0,
    availability: 0,
    tracker: 'nyaa',
    sizeBytes: 2 * MB,
    ageDays: 1,
    fileCount: 1,
    subtitleLanguages: [],
    isBatch: false,
    magnet: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
    ...overrides,
  };
}

describe('subtitleFormatFor / isBitmapSubtitleFile', () => {
  it('maps text cue extensions to record formats', () => {
    expect(subtitleFormatFor('ep01.ass')).toBe('ass');
    expect(subtitleFormatFor('Show - 01.ja.SRT')).toBe('srt');
    expect(subtitleFormatFor('lyrics.lrc')).toBe('lrc');
  });

  it('refuses bitmap subtitles by name, distinctly from "not a subtitle"', () => {
    expect(isBitmapSubtitleFile('movie.idx')).toBe(true);
    expect(isBitmapSubtitleFile('movie.sup')).toBe(true);
    expect(subtitleFormatFor('movie.idx')).toBeNull();

    // A font shipped alongside the cues is neither.
    expect(isBitmapSubtitleFile('gandhi.ttf')).toBe(false);
    expect(subtitleFormatFor('gandhi.ttf')).toBeNull();
  });
});

describe('subtitlePackSignals', () => {
  it('does not fire on release groups whose name contains subtitle words', () => {
    // The single biggest false-positive source: these are all video releases.
    expect(subtitlePackSignals('[SubsPlease] Frieren - 01 (1080p) [F1F2E3D4].mkv')).toEqual([]);
    expect(subtitlePackSignals('[HorribleSubs] Show - 12 [720p].mkv')).toEqual([]);
    expect(subtitlePackSignals('[Erai-raws] Show - 01 [1080p][Multiple Subtitle]')).toEqual([]);
  });

  it('does not fire on phrasings that describe a video carrying subtitles', () => {
    expect(subtitlePackSignals('Show S01 [Dual Audio][Softsub]')).toEqual([]);
    expect(subtitlePackSignals('Show - 05 [English Subbed]')).toEqual([]);
    expect(subtitlePackSignals('Show 01-12 [Multi-Sub]')).toEqual([]);
  });

  it('fires on genuine subtitle-pack naming', () => {
    expect(subtitlePackSignals('[Kitsunekko] Frieren Japanese Subtitles')).toContain('subtitles');
    expect(subtitlePackSignals('Show - Subtitle Pack (01-24)')).toContain('sub-pack');
    expect(subtitlePackSignals('Show 01-12 [ASS]')).toContain('format-tag');
    expect(subtitlePackSignals('進撃の巨人 字幕')).toContain('jp-subtitles');
    expect(subtitlePackSignals('Show - subs only')).toContain('subs-only');
  });

  it('does not treat a word merely containing a format name as a tag', () => {
    expect(subtitlePackSignals('Cassiopeia Dossier')).toEqual([]);
    expect(subtitlePackSignals('Subaru Chronicles')).toEqual([]);
  });
});

describe('looksLikeSubtitleOnly', () => {
  it('accepts a small, subtitle-named release', () => {
    expect(looksLikeSubtitleOnly(row({
      name: '[Kitsunekko] Frieren Japanese Subtitles',
      sizeBytes: 400 * 1024,
    }))).toBe(true);
  });

  it('rejects above the ceiling rather than letting it fall through', () => {
    // The whole safety property: a mislabelled entry must not reach the fetcher
    // on any path, including an otherwise-empty result set.
    const mislabelled = row({
      name: 'Frieren Complete Subtitles',
      sizeBytes: SUBTITLE_SIZE_CEILING_BYTES + 1,
    });
    expect(subtitlePackSignals(mislabelled.name)).not.toEqual([]);
    expect(looksLikeSubtitleOnly(mislabelled)).toBe(false);
    expect(rankSubtitleCandidates([mislabelled], { languages: ['ja'] })).toEqual([]);
  });

  it('rejects an unparseable size instead of trusting it', () => {
    expect(looksLikeSubtitleOnly(row({ name: 'Show Subtitles', sizeBytes: 0 }))).toBe(false);
  });

  it('rejects a name that looks sub-only but names a video container', () => {
    expect(looksLikeSubtitleOnly(row({
      name: 'Show - 01 subtitles.mkv',
      sizeBytes: 8 * MB,
    }))).toBe(false);
  });

  it('rejects a small release with no subtitle signal at all', () => {
    expect(looksLikeSubtitleOnly(row({ name: 'Show OP Single [FLAC]', sizeBytes: 30 * MB }))).toBe(false);
  });
});

describe('couldCarrySidecarSubtitles', () => {
  it('accepts a batch, where per-file priorities can isolate the sidecars', () => {
    expect(couldCarrySidecarSubtitles(row({
      name: '[Group] Show 01-12 [1080p]',
      isBatch: true,
      sizeBytes: 12_000 * MB,
    }))).toBe(true);
  });

  it('refuses a single-file release, whose track is interleaved', () => {
    // There is no contiguous subset to request, so wanting the track means
    // wanting the whole 1.4 GB episode. This is the case the provider exists
    // to avoid.
    expect(couldCarrySidecarSubtitles(row({
      name: '[Group] Show - 01 [1080p].mkv',
      isBatch: false,
      sizeBytes: 1_400 * MB,
    }))).toBe(false);
  });
});

describe('rankSubtitleCandidates', () => {
  const pack = row({
    id: 'pack',
    name: '[Kitsunekko] Show Japanese Subtitles 01-12',
    sizeBytes: 500 * 1024,
    subtitleLanguages: ['ja'],
    isBatch: true,
    seeders: 4,
  });
  const batch = row({
    id: 'batch',
    name: '[Group] Show 01-12 [1080p]',
    sizeBytes: 12_000 * MB,
    subtitleLanguages: ['ja'],
    isBatch: true,
    seeders: 900,
  });

  it('puts a 500 KB pack above a 12 GB batch even with far fewer seeders', () => {
    const ranked = rankSubtitleCandidates([batch, pack], { languages: ['ja'] });
    expect(ranked.map((c) => c.row.id)).toEqual(['pack', 'batch']);
    expect(ranked[0].route).toBe('sub-pack');
    expect(ranked[1].route).toBe('batch-sidecar');
  });

  it('drops a release of a different show, using the two the index really returned', () => {
    // Both names are verbatim from a live nyaa search for "The Big O 01", which
    // returned them alongside the real ones. Before the title guard they were
    // ranked as usable subtitle sources for The Big O, so accepting one added
    // ~4 GB of an unrelated series to the user's torrent client.
    const wrong = row({
      id: 'wrong',
      name: '[HYSUB]The Legend of Heroes - Sen no Kiseki - Northern War -[01~12][BIG5_MP4][1920X1080]',
      sizeBytes: 3_972_844_749,
      isBatch: true,
      seeders: 2,
    });
    const right = row({
      id: 'right',
      name: '[NanaOne-Yamayurikai] The Big O 01-26 (GerSub Hi10P BD 576p) [v2]',
      sizeBytes: 6_442_450_944,
      isBatch: true,
      seeders: 3,
    });
    const ranked = rankSubtitleCandidates([wrong, right], { languages: ['ja'], title: 'The Big O' });
    expect(ranked.map((c) => c.row.id)).toEqual(['right']);
    // Without a title nothing is dropped — the older callers' behaviour.
    expect(rankSubtitleCandidates([wrong, right], { languages: ['ja'] })).toHaveLength(2);
  });

  it('keeps a release whose name only half covers the title', () => {
    // Half, not all: releases abbreviate and re-order, and demanding a full
    // cover would throw away good rows to catch bad ones.
    expect(looksLikeSameTitle('[Erai-raws] Nanatsu no Taizai - Seisen no Shirushi - 01 ~ 04', 'Nanatsu no Taizai: Seisen no Shirushi')).toBe(true);
    expect(looksLikeSameTitle('【悠哈璃羽字幕社】[Kishibe Rohan wa Ugokanai][01-04][BDRIP]', 'Kishibe Rohan wa Ugokanai')).toBe(true);
    expect(looksLikeSameTitle('[GB] Cyber City Oedo 808 Bluray 1080p SUBS ONLY', 'Cyber City Oedo 808')).toBe(true);
    // "the" is a stopword, so this shares nothing that counts.
    expect(looksLikeSameTitle('The Legend of Heroes - Sen no Kiseki - Northern War', 'The Big O')).toBe(false);
    // A particle is not a stopword: dropping "no" would make these look alike.
    expect(looksLikeSameTitle('Nanatsu no Taizai 01-24', 'Sen no Kiseki')).toBe(false);
  });

  it('refuses a batch of another show for a title that is only digits', () => {
    // Measured live on the user's own MAL list: the 1-episode title "001"
    // listed 23 releases, because every batch numbers an episode 001. Each was
    // one click from adding someone else's show to their torrent client.
    expect(looksLikeSameTitle('[Naruto-Kun.Hu] Bleach 001-063 [1080p]', '001')).toBe(false);
    expect(looksLikeSameTitle('[Erai-raws] Naruto Shippuuden - 001 ~ 079 [480p][MultiSub] [BATCH]', '001')).toBe(false);
    expect(looksLikeSameTitle('Saint Seiya (1986) 001-114 [WEB 720p] [Multi-Subs]', '001')).toBe(false);
    // A name that is nothing but tags leaves no claim to read, so the number's
    // own shape has to answer: 001-208 is a range, not a title.
    expect(looksLikeSameTitle('[GM-Team][国漫][神印王座][Throne of Seal][2022][001-208 Fin][AVC][GB][1080P]', '001')).toBe(false);
    // The control: a release that names no other work outside its tags is still
    // accepted, or a numerically titled show could never be found at all.
    expect(looksLikeSameTitle('[SomeGroup] 001 (2010) [BDRip 1080p]', '001')).toBe(true);
  });

  it('does not let a bare number stand in for the words of a title', () => {
    // "Gundam 00" against a Naruto batch: the digits were the whole match.
    expect(looksLikeSameTitle('[Group] Naruto 00 - 12 [1080p]', 'Gundam 00')).toBe(false);
    // And the digits are not *required* either — the words still carry it.
    expect(looksLikeSameTitle('[Group] Gundam 00 S1 01-25', 'Gundam 00')).toBe(true);
    expect(looksLikeSameTitle('[GB] Cyber City Oedo 808 Bluray 1080p SUBS ONLY', 'Cyber City Oedo 808')).toBe(true);
  });

  it('drops rows advertising only unwanted languages', () => {
    const ru = row({ id: 'ru', name: 'Show Subtitles', sizeBytes: MB, subtitleLanguages: ['ru'] });
    expect(rankSubtitleCandidates([ru], { languages: ['ja'] })).toEqual([]);
  });

  it('keeps a pack that states no language, below one that matches', () => {
    const unstated = row({ id: 'unstated', name: 'Show Subtitles', sizeBytes: MB });
    const ranked = rankSubtitleCandidates([unstated, pack], { languages: ['ja'] });
    expect(ranked.map((c) => c.row.id)).toEqual(['pack', 'unstated']);
    expect(ranked[1].reasons).toContain('language:unstated');
  });

  it('honours minSeeders and preferred groups', () => {
    expect(rankSubtitleCandidates([pack], { languages: ['ja'], minSeeders: 5 })).toEqual([]);

    const grouped = { ...pack, releaseGroup: 'Kitsunekko' };
    const plain = rankSubtitleCandidates([pack], { languages: ['ja'] })[0];
    const boosted = rankSubtitleCandidates([grouped], {
      languages: ['ja'],
      preferredGroups: ['kitsunekko'],
    })[0];
    expect(boosted.score).toBeGreaterThan(plain.score);
    expect(boosted.reasons).toContain('preferred-group:Kitsunekko');
  });

  it('breaks a score tie on the smaller download', () => {
    const small = row({ id: 'small', name: 'Show Subtitles', sizeBytes: 100 * 1024, subtitleLanguages: ['ja'], seeders: 4 });
    const large = row({ id: 'large', name: 'Show Subtitles', sizeBytes: 9 * MB, subtitleLanguages: ['ja'], seeders: 4 });
    const ranked = rankSubtitleCandidates([large, small], { languages: ['ja'] });
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked.map((c) => c.row.id)).toEqual(['small', 'large']);
  });

  it('never returns a row that fails both routes', () => {
    const single = row({ name: '[Group] Show - 01 [1080p].mkv', sizeBytes: 1_400 * MB, subtitleLanguages: ['ja'] });
    expect(rankSubtitleCandidates([single], { languages: ['ja'] })).toEqual([]);
  });
});

describe('packCoversEpisodeCount', () => {
  // Both halves matter. The floor exists to refuse a one-episode file offered
  // for a season; it must not refuse a one-episode file offered for one episode,
  // which is what the short end of a real library is made of.
  it('imposes no floor when the episode count is unknown, zero or one', () => {
    expect(packCoversEpisodeCount(26_726, undefined)).toBe(true);
    expect(packCoversEpisodeCount(26_726, null)).toBe(true);
    // MAL writes 0 for "still airing", which is an unknown count, not none.
    expect(packCoversEpisodeCount(26_726, 0)).toBe(true);
    expect(packCoversEpisodeCount(26_726, 1)).toBe(true);
    expect(packCoversEpisodeCount(26_726, Number.NaN)).toBe(true);
  });

  it('scales with the episodes asked for', () => {
    expect(packCoversEpisodeCount(8 * SUBTITLE_PACK_BYTES_PER_EPISODE, 8)).toBe(true);
    expect(packCoversEpisodeCount(8 * SUBTITLE_PACK_BYTES_PER_EPISODE - 1, 8)).toBe(false);
  });
});

describe('rankSubtitleCandidates episode floor', () => {
  // Measured, not invented: this exact release was nominated as a whole-series
  // pack for the 8-episode Black★Rock Shooter (TV) by the 2026-08-17 library
  // survey. It is one episode of Dawn Fall, a different work.
  const tooSmall = row({
    id: 'yuri',
    name: '[IsThisYuri] Black Rock Shooter - Dawn Fall 08 subtitles (DROPPED: This is yuri!)',
    sizeBytes: 26_726,
    subtitleLanguages: ['ja'],
    seeders: 1,
  });

  it('drops a one-episode subtitle file offered as a pack for a whole show', () => {
    expect(rankSubtitleCandidates([tooSmall], { languages: ['ja'], episodeCount: 8 })).toEqual([]);
  });

  it('keeps the very same release when only one episode is asked for', () => {
    // The negative control for the gate above: if this also came back empty the
    // floor would be refusing small files rather than refusing bad answers.
    const ranked = rankSubtitleCandidates([tooSmall], { languages: ['ja'] });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].route).toBe('sub-pack');
  });

  it('keeps a genuine season pack, measured against a real one', () => {
    // `Eureka Seven - Psalms of Planets - subs only`, 39.20 MB, 50 episodes —
    // found live by the same survey, and the case the floor must not break.
    const real = row({
      id: 'eureka',
      name: 'Eureka Seven - Psalms of Planets - subs only (for the 50 episode TV series)',
      sizeBytes: Math.round(39.2 * MB),
      subtitleLanguages: ['ja'],
      seeders: 1,
      isBatch: true,
    });
    const ranked = rankSubtitleCandidates([real], { languages: ['ja'], episodeCount: 50 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].route).toBe('sub-pack');
  });

  it('drops the undersized pack rather than demoting it to a batch download', () => {
    // The failure this guards: falling through to `batch-sidecar` would answer
    // "this 26 KB file is too small" by offering a multi-gigabyte video torrent.
    const flagged = row({ ...tooSmall, id: 'flagged', isBatch: true, fileCount: 0 });
    expect(rankSubtitleCandidates([flagged], { languages: ['ja'], episodeCount: 8 })).toEqual([]);
  });
});

describe('selectSubtitleFiles', () => {
  const file = (index: number, name: string, sizeBytes = 20_000) => ({ index, name, sizeBytes });

  it('distinguishes a bitmap-only release from one with no subtitles', () => {
    // These must not collapse into "no results": one means the release is
    // unusable to this app, the other means the ranker picked wrong.
    expect(selectSubtitleFiles([file(0, 'movie.idx'), file(1, 'movie.sub')], {}).reason)
      .toBe('bitmap-only');
    expect(selectSubtitleFiles([file(0, 'readme.txt'), file(1, 'font.ttf')], {}).reason)
      .toBe('no-subtitles');
  });

  it('picks the episode asked for and reports when it is absent', () => {
    const files = [
      file(0, 'Subs/Show - 06.ja.ass'),
      file(1, 'Subs/Show - 07.ja.ass'),
      file(2, 'Subs/Show - 08.ja.ass'),
    ];
    const hit = selectSubtitleFiles(files, { episode: 7, languages: ['ja'] });
    expect(hit.reason).toBe('ok');
    expect(hit.files.map((f) => f.index)).toEqual([1]);
    expect(hit.format).toBe('ass');

    expect(selectSubtitleFiles(files, { episode: 99 }).reason).toBe('no-episode-match');
  });

  it('excludes a stated unwanted language but keeps unlabelled files', () => {
    const files = [
      file(0, 'Subs/eng/Show - 07.ass'),
      file(1, 'Subs/jpn/Show - 07.ass'),
      file(2, 'Show - 07.ass'),
    ];
    const chosen = selectSubtitleFiles(files, { episode: 7, languages: ['ja'] });
    expect(chosen.files.map((f) => f.index).sort()).toEqual([1, 2]);
  });

  it('falls back to every subtitle when the language filter empties the pool', () => {
    const files = [file(0, 'Subs/eng/Show - 07.srt')];
    const chosen = selectSubtitleFiles(files, { languages: ['ja'] });
    expect(chosen.reason).toBe('ok');
    expect(chosen.files).toHaveLength(1);
  });

  it('prefers the format the pack mostly uses, and returns one format only', () => {
    const files = [
      file(0, 'Show - 01.ass'),
      file(1, 'Show - 02.ass'),
      file(2, 'Show - 03.srt'),
    ];
    const chosen = selectSubtitleFiles(files, {});
    expect(chosen.format).toBe('ass');
    expect(chosen.files.every((f) => f.name.endsWith('.ass'))).toBe(true);
  });

  it('ignores bitmap files sitting alongside usable text cues', () => {
    const chosen = selectSubtitleFiles([file(0, 'Show.idx'), file(1, 'Show.ass')], {});
    expect(chosen.reason).toBe('ok');
    expect(chosen.files.map((f) => f.index)).toEqual([1]);
  });
});

describe('episodeFromFileName / languageFromFileName', () => {
  it('reads episode numbers from the shapes packs actually use', () => {
    expect(episodeFromFileName('Subs/Show - 07.ja.ass')).toBe(7);
    expect(episodeFromFileName('[Group] Show S02E12.ass')).toBe(12);
    expect(episodeFromFileName('Show Episode 3.srt')).toBe(3);
    expect(episodeFromFileName('Show Movie.ass')).toBeNull();
  });

  // The names below are verbatim from the first Route A pack this pipeline ever
  // acquired (47 files, `After War Gundam X`). Under the previous patterns all
  // 47 read null, so an episode range — the whole point of the feature —
  // selected nothing.
  it('reads the bracketed episode group that fansub packs use', () => {
    expect(episodeFromFileName('[Kidou Shin Seiki Gundam X][01][BDRIP][1440x1080][H264_FLACx2].ass')).toBe(1);
    expect(episodeFromFileName('[Kidou Shin Seiki Gundam X][21][BDRIP][1440x1080][H264_FLAC].ass')).toBe(21);
    expect(episodeFromFileName('[Kidou Shin Seiki Gundam X][39][BDRIP][1440x1080][H264_FLACx3].ass')).toBe(39);
  });

  it('control: brackets that are not an episode number stay unparsed', () => {
    // The specials in that same pack. If these ever parse, they collide with
    // real episodes 1-8 and the range silently gains eight wrong files.
    expect(episodeFromFileName('[Kidou Shin Seiki Gundam X][Vol.07][SP02][NCOP2][BDRIP][1440x1080][H264_FLAC].ass')).toBeNull();
    expect(episodeFromFileName('[Kidou Shin Seiki Gundam X][Vol.07][SP03][NCED][BDRIP][1440x1080][H264_FLAC].ass')).toBeNull();
    // Resolution, codec, a year and a CRC32 are all bracketed digits too.
    expect(episodeFromFileName('[Group] Show Movie [1440x1080][H264_FLAC].ass')).toBeNull();
    expect(episodeFromFileName('[Group] Show Movie [2011][BDRIP].ass')).toBeNull();
    expect(episodeFromFileName('[Group] Show Movie [12345678].ass')).toBeNull();
  });

  it('still prefers an explicit episode marker over a bracket beside it', () => {
    expect(episodeFromFileName('[Group] Show - 07 [1080p][ABC123].ass')).toBe(7);
    expect(episodeFromFileName('[Group] Show S02E12 [10bit].ass')).toBe(12);
  });

  it('reads a language from a directory, a dotted tag, or a spelled-out name', () => {
    expect(languageFromFileName('Subs/ja/Show.ass')).toBe('ja');
    expect(languageFromFileName('Show - 07.ja.ass')).toBe('ja');
    expect(languageFromFileName('Japanese/Show.ass')).toBe('ja');
    expect(languageFromFileName('Subs/eng/Show.srt')).toBe('en');
    expect(languageFromFileName('Show - 07.ass')).toBeNull();
  });
});

describe('buildSubtitleQuery', () => {
  it('defaults to the whole anime tree, because nyaa has no subtitles category', () => {
    expect(buildSubtitleQuery({ title: 'Frieren' })).toEqual({ text: 'Frieren', category: '1_0' });
  });

  it('zero-pads an episode number and honours an explicit category', () => {
    expect(buildSubtitleQuery({ title: 'Frieren', episode: 5, category: '1_3' }))
      .toEqual({ text: 'Frieren 05', category: '1_3' });
  });

  it('omits the episode when there is none', () => {
    expect(buildSubtitleQuery({ title: 'Frieren', episode: null }).text).toBe('Frieren');
  });
});

describe('asNyaaAcquisitionConfig', () => {
  const whole = {
    indexers: [{ id: 'nyaa', kind: 'torrent', enabled: true }],
    torrents: { maxSizeBytes: 1 },
    qbittorrent: { enabled: true, savePath: '' },
  };

  it('accepts a config carrying all three pieces', () => {
    expect(asNyaaAcquisitionConfig(whole)).toBe(whole);
  });

  it.each([
    ['no indexers array', { ...whole, indexers: undefined }],
    ['indexers not an array', { ...whole, indexers: 'nyaa' }],
    ['no torrent settings', { ...whole, torrents: null }],
    ['no qbittorrent settings', { ...whole, qbittorrent: undefined }],
    ['not an object', 'nyaa'],
    ['absent', undefined],
  ])('treats a config with %s as absent rather than half-configuring it', (_label, input) => {
    // Half-accepting would pass the availability check and then fail at fetch
    // time — the same failure one step later and much harder to read.
    expect(asNyaaAcquisitionConfig(input)).toBeUndefined();
  });
});

describe('looksJapaneseSubtitle / subtitleKanaCount', () => {
  /** An ASS header shaped like the real acquired files: styles, then dialogue. */
  const ass = (lines: string[]): string => [
    '[Script Info]',
    'Title: Default Aegisub file',
    'ScriptType: v4.00+',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize',
    'Style: Default,Open Sans SemiBold,70',
    '',
    '[Events]',
    ...lines.map((text) => `Dialogue: 0,0:00:06.27,0:00:09.19,Default,,0,0,0,,${text}`),
  ].join('\n');

  it('refuses the English pack that was actually acquired', () => {
    // Not a hypothetical: MAL 92's Route A release is `After War Gundam X …
    // Official Subtitles`, and all 47 files measured 0 kana against 292,568
    // Latin letters. It reached the miner and produced 11,136 cues and 0 words.
    const english = ass([
      'There once was a war.',
      "A conflict that arose from a single colony's independence movement...",
      '...grew into an all-out war that engulfed the entire Earth.',
    ]);
    expect(subtitleKanaCount(english)).toBe(0);
    expect(looksJapaneseSubtitle(english)).toBe(false);
  });

  it('accepts a Japanese file', () => {
    const japanese = ass([
      'かつて、戦争があった。',
      'ひとつのコロニーの独立運動から始まった戦いは',
      '地球全体を巻き込む全面戦争へと発展した。',
    ]);
    expect(subtitleKanaCount(japanese)).toBeGreaterThanOrEqual(JAPANESE_KANA_FLOOR);
    expect(looksJapaneseSubtitle(japanese)).toBe(true);
  });

  it('refuses a Chinese release, which is the reason kanji is not counted', () => {
    // nyaa carries a great many of these — `[GM-Team][国漫][神印王座]` is one this
    // plan already had to guard the title matcher against. Every character is a
    // han ideograph, so a kanji-inclusive test would call it Japanese.
    const chinese = ass(['曾经有过一场战争。', '一个殖民地的独立运动引发的冲突', '发展成了席卷整个地球的全面战争。']);
    expect(subtitleKanaCount(chinese)).toBe(0);
    expect(looksJapaneseSubtitle(chinese)).toBe(false);
  });

  it('does not count kana outside the dialogue — a Japanese font name is not a Japanese subtitle', () => {
    // The control for the measurement itself. Style blocks are where an English
    // release legitimately carries kana, and a whole-file count would read this
    // as language. 24 kana of font names, still English dialogue.
    const styled = [
      '[V4+ Styles]',
      'Style: Default,ヒラギノ角ゴシックプロダブル,70',
      'Style: Sign,モトヤシーダウンロード用フォント,60',
      '',
      '[Events]',
      'Dialogue: 0,0:00:06.27,0:00:09.19,Default,,0,0,0,,There once was a war.',
    ].join('\n');
    expect(subtitleKanaCount(styled)).toBe(0);
    expect(looksJapaneseSubtitle(styled)).toBe(false);
  });

  it('ignores override blocks, so karaoke timing tags cannot carry a file', () => {
    const tagged = ass(['{\k21}ka{\k18}ra{\k30}o{\k25}ke', '{\pos(100,200)\fadeこんにちは}Hello there.']);
    expect(subtitleKanaCount(tagged)).toBe(0);
  });

  it('measures every line when nothing is an ASS dialogue line, so srt and vtt still count', () => {
    const srt = [
      '1\n00:00:01,000 --> 00:00:02,000\nこんにちは、みなさん。\n',
      '2\n00:00:03,000 --> 00:00:05,000\nおはようございます。\n',
      '3\n00:00:06,000 --> 00:00:08,000\n今日はいい天気ですね。\n',
    ].join('\n');
    expect(subtitleKanaCount(srt)).toBeGreaterThanOrEqual(JAPANESE_KANA_FLOOR);
    expect(looksJapaneseSubtitle(srt)).toBe(true);

    // The floor is not decorative: a single cue of the same dialogue is 18 kana
    // and does not clear it. Three lines of a real file do.
    expect(subtitleKanaCount('1\n00:00:01,000 --> 00:00:02,000\nこんにちは、みなさん。おはようございます。\n')).toBe(18);
  });

  it('treats a title card as the incidental Japanese it is', () => {
    // A single Japanese line in an otherwise English file is below the floor,
    // which is the whole point of having one rather than testing for `> 0`.
    const credit = ass(['字幕', 'Translated by a fan group.', 'There once was a war.']);
    expect(subtitleKanaCount(credit)).toBeLessThan(JAPANESE_KANA_FLOOR);
    expect(looksJapaneseSubtitle(credit)).toBe(false);
  });

  it.each([['empty', ''], ['whitespace', '   \n  '], ['absent', undefined as unknown as string]])(
    'treats %s text as no Japanese rather than throwing',
    (_label, input) => {
      expect(subtitleKanaCount(input)).toBe(0);
      expect(looksJapaneseSubtitle(input)).toBe(false);
    },
  );
});
