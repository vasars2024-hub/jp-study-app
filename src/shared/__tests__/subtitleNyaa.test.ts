import { describe, expect, it } from 'vitest';
import type { TorrentRow } from '../scraperResults';
import {
  asNyaaAcquisitionConfig,
  buildSubtitleQuery,
  couldCarrySidecarSubtitles,
  declaresExternalSubtitles,
  declaresMuxedSubtitles,
  describeEmptyNyaaListing,
  episodeFromFileName,
  isBitmapSubtitleFile,
  JAPANESE_KANA_FLOOR,
  languageFromFileName,
  looksJapaneseSubtitle,
  looksLikeSameTitle,
  looksLikeSubtitleOnly,
  packCoversEpisodeCount,
  rankSubtitleCandidates,
  rankSubtitleCandidatesDetailed,
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
    expect(subtitlePackSignals('進撃の巨人 字幕')).toContain('cjk-subtitles');
    expect(subtitlePackSignals('Show - subs only')).toContain('subs-only');
  });

  it('NEGATIVE CONTROL: a Chinese fansub group name is not a payload claim', () => {
    // `字幕社`/`字幕組` name the releaser. Before this the group bracket alone
    // made a multi-GB BDRip look like a subtitle pack; only the 50 MB ceiling
    // was stopping it, which is one guard for two independent mistakes.
    expect(subtitlePackSignals(
      '【悠哈璃羽字幕社＆諸神字幕組】[岸邊露伴一動不動][01-04][BDRIP x264_1080p][繁日雙語]',
    )).not.toContain('cjk-subtitles');
    // The same name with a real payload claim still fires.
    expect(subtitlePackSignals('【悠哈璃羽字幕社】[Show][01-04] 外挂字幕')).toContain('cjk-subtitles');
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

  it('refuses a batch that declares its subtitles muxed', () => {
    // The real one, verbatim: 2,662.40 MB, walked live, 4 files and 4 video.
    expect(couldCarrySidecarSubtitles(row({
      name: '[Erai-raws] Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai - 01 ~ 04 '
        + '[1080p][HEVC][BATCH][Multiple Subtitle] [ENG][SPA][ARA][FRE][GER][ITA][RUS]',
      isBatch: true,
      sizeBytes: 2_662 * MB,
    }))).toBe(false);
  });

  it('refuses a single file the feed flagged a batch on its episode range', () => {
    // Real, from the 2026-08-17 survey of MAL indices 134-213: a two-episode
    // special in one container, `isBatch` inferred from the `23-24`. Offered on
    // this route it means downloading the whole file, which is the one outcome
    // this function's contract says nothing may reach.
    expect(couldCarrySidecarSubtitles(row({
      name: '[Vivid] Mushishi Zoku Shou - 23-24 - Suzu no Shizuku [BD 720p AAC] [8BDF3E31].mkv',
      isBatch: true,
      sizeBytes: 620 * MB,
    }))).toBe(false);
  });

  it('still accepts a batch that says nothing about where its subtitles are', () => {
    // The control the gate must not swallow: these are the rows that genuinely
    // need the file list before anyone can say. `[SubsPlease]` muxes too, but
    // its name does not claim to, and a name gate may only act on the name.
    expect(couldCarrySidecarSubtitles(row({
      name: '[SubsPlease] Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai (01-04) (1080p) [Batch]',
      isBatch: true,
      sizeBytes: 5_939 * MB,
    }))).toBe(true);
  });
});

describe('declaresMuxedSubtitles', () => {
  it('reads the three phrasings that state where the subtitles are', () => {
    // Each is a claim about the container, not about existence.
    expect(declaresMuxedSubtitles('[Erai-raws] Heya Camp - 01 ~ 12 [1080p][Multiple Subtitle]')).toBe(true);
    expect(declaresMuxedSubtitles('[Judas] Jujutsu Kaisen (Season 03) [1080p][Dual-Audio][Multi-Subs] (Batch)')).toBe(true);
    expect(declaresMuxedSubtitles('Show S01 [Softsub]')).toBe(true);
    expect(declaresMuxedSubtitles('Show S01 [Hardsub]')).toBe(true);
  });

  it('does not read a claim about audio, or an unqualified "subbed", as one', () => {
    // The negative controls that keep this narrower than `VIDEO_WITH_SUBS_RE`:
    // neither says whether there is a file to fetch, so neither may retire a
    // candidate before its file list is read.
    expect(declaresMuxedSubtitles('[DB] Yuru Camp△ (Season 1-3+Specials) [Dual Audio 10bit BD1080p] (Batch)')).toBe(false);
    expect(declaresMuxedSubtitles('Show - 05 [English Subbed]')).toBe(false);
    expect(declaresMuxedSubtitles('[SubsPlease] Show (00-17) (1080p) [Batch]')).toBe(false);
  });

  it('does not fire on a release group whose own name contains the phrase', () => {
    // `withoutReleaseGroup` exists for exactly this, and it is why the leading
    // tag is stripped before the test rather than after.
    expect(declaresMuxedSubtitles('[Multi-Subs] Show - 01 (1080p) [Batch]')).toBe(false);
  });

  it('reads the Chinese statements of the same two facts', () => {
    // Real corpus names. `内封` is the container, `内嵌` is the picture.
    expect(declaresMuxedSubtitles(
      '[SweetSub&LoliHouse] 章鱼噼的原罪 / Takopii no Genzai [01-06][WebRip 1080p][简繁日内封字幕][Fin]',
    )).toBe(true);
    expect(declaresMuxedSubtitles(
      '[❀拨雪寻春❀] 送葬者芙莉莲 / 葬送のフリーレン [01-28 Fin][BDRip][HEVC-10bit 1080p][简繁日内封]',
    )).toBe(true);
    expect(declaresMuxedSubtitles('[Group] Show 01-12 [1080p][简繁内嵌]')).toBe(true);
  });

  it('NEGATIVE CONTROL: an external declaration is not a muxing one', () => {
    // The pair that must not collapse. Both names are Chinese, both name the
    // same three languages, and they differ only in where the files are — so a
    // rule that fired on script or on `字幕` would return true for both.
    expect(declaresMuxedSubtitles(
      '【喵萌奶茶屋】[无能的奈奈/無能なナナ/Munou na Nana][01-13][BDRip][1080p][简繁日外挂][招募翻译]',
    )).toBe(false);
    expect(declaresExternalSubtitles(
      '【喵萌奶茶屋】[无能的奈奈/無能なナナ/Munou na Nana][01-13][BDRip][1080p][简繁日外挂][招募翻译]',
    )).toBe(true);
  });

  it('lets an external declaration win when a name states both', () => {
    // Synthetic, and said so: 0 of the 1,748 corpus names declare both. Pinned
    // anyway because the precedence is a real branch, and an unpinned branch is
    // one a later edit can silently invert. A release shipping muxed tracks
    // *and* a sidecar folder still has a file to fetch.
    expect(declaresMuxedSubtitles('[Group] Show 01-12 [1080p][简繁内封][日文外挂]')).toBe(false);
  });
});

describe('declaresExternalSubtitles', () => {
  it('reads both the simplified and traditional forms', () => {
    expect(declaresExternalSubtitles(
      '[DBD-Raws][龙珠Z 剧场版/Dragon Ball Z The Movies][01-17合集][1080P][BDRip][简繁日双语外挂][MKV]',
    )).toBe(true);
    expect(declaresExternalSubtitles(
      '[漫游字幕组] Mobile Suit Gundam Unicorn 1-7 BDrip HEVC 1080p 简繁外挂',
    )).toBe(true);
  });

  it('NEGATIVE CONTROL: says nothing about a release that states no placement', () => {
    // If this fired on a silent batch the ranking bonus would be noise: 53 of
    // the 60 surveyed titles carry at least one batch and almost none say where
    // their subtitles are.
    expect(declaresExternalSubtitles('[SubsPlease] Show (00-17) (1080p) [Batch]')).toBe(false);
    expect(declaresExternalSubtitles('[Erai-raws] Heya Camp - 01 ~ 12 [1080p][Multiple Subtitle]')).toBe(false);
    expect(declaresExternalSubtitles('[Group] Show [简繁日内封字幕]')).toBe(false);
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

  it('ranks a batch that states it ships sidecars above one that says nothing', () => {
    // The one thing separating two batches before the metadata handshake, which
    // costs 6-47 s each and has come back empty 10 times out of 10. The silent
    // row is given 900 seeders and the declared one 4, so seeders cannot be what
    // orders them.
    const declared = row({
      id: 'declared',
      name: '【喵萌奶茶屋】[无能的奈奈/無能なナナ/Munou na Nana][01-13][BDRip][1080p][简繁日外挂][招募翻译]',
      sizeBytes: 9_000 * MB,
      subtitleLanguages: ['ja'],
      isBatch: true,
      seeders: 4,
    });
    const ranked = rankSubtitleCandidates([batch, declared], { languages: ['ja'] });
    expect(ranked.map((c) => c.row.id)).toEqual(['declared', 'batch']);
    expect(ranked[0].reasons).toContain('signal:external-subs');
    expect(ranked[1].reasons).not.toContain('signal:external-subs');
  });

  it('NEGATIVE CONTROL: the sidecar bonus never lifts a batch over a pack', () => {
    // A 12 GB download must not outrank 500 KB of text on the strength of one
    // name token. The pack here is given the worse seeder count of the two.
    const declared = row({
      id: 'declared',
      name: '[DBD-Raws][Show][01-17合集][1080P][BDRip][简繁日双语外挂][MKV]',
      sizeBytes: 12_000 * MB,
      subtitleLanguages: ['ja'],
      isBatch: true,
      seeders: 900,
    });
    const ranked = rankSubtitleCandidates([declared, pack], { languages: ['ja'] });
    expect(ranked.map((c) => c.row.id)).toEqual(['pack', 'declared']);
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

  it('refuses a sequel for its predecessor, and in both directions', () => {
    // Measured live 2026-08-17: a search for MAL 2402 `Ashita no Joe` (79
    // episodes) accepted this release of `Ashita no Joe 2` (47 episodes, a
    // different work). Every token of the shorter title is inside the longer
    // one, so the half-the-words rule scores it a perfect match. It was
    // harmless only by luck — the release was refused for language a step later.
    expect(looksLikeSameTitle("Ashita no Joe 2 (Tomorrow's Joe 2) [CR] (Subtitles only)", 'Ashita no Joe')).toBe(false);
    // The same mistake mirrored, which a one-directional rule would miss.
    expect(looksLikeSameTitle('[Group] Ashita no Joe 01-79 [BD]', 'Ashita no Joe 2')).toBe(false);
    // The match that has to survive: the sequel found by its own name.
    expect(looksLikeSameTitle("Ashita no Joe 2 (Tomorrow's Joe 2) [CR]", 'Ashita no Joe 2')).toBe(true);
    // Written forms of the same claim.
    expect(looksLikeSameTitle('[Group] Some Show S2 01-12', 'Some Show')).toBe(false);
    expect(looksLikeSameTitle('[Group] Some Show 2nd Season 01-12', 'Some Show')).toBe(false);
    expect(looksLikeSameTitle('[Group] Some Show II [BD]', 'Some Show')).toBe(false);
  });

  it('does not mistake an episode number for a sequel', () => {
    // The false-negative controls, and the reason the rule is this narrow: the
    // pool this filter guards is small enough that throwing away a good release
    // costs a candidate. Each of these is a real numbering form from the
    // fixtures already in this file.
    expect(looksLikeSameTitle('[Group] Ashita no Joe - 07 [1080p]', 'Ashita no Joe')).toBe(true);
    expect(looksLikeSameTitle('[F-R] Les Miserables Shoujo Cosette 01-52 BATCH (WEB 1080p)', 'Les Miserables: Shoujo Cosette')).toBe(true);
    expect(looksLikeSameTitle('[Group] Ashita no Joe - 7', 'Ashita no Joe')).toBe(true);
    // A year is not a sequel, and neither is a first season.
    expect(looksLikeSameTitle('[Group] Some Show (2010) [BDRip 1080p]', 'Some Show')).toBe(true);
    expect(looksLikeSameTitle('[Group] Some Show S1 01-25', 'Some Show')).toBe(true);
    expect(looksLikeSameTitle('[Group] Some Show 1st Season', 'Some Show')).toBe(true);
  });

  it('reads a season out of the tags, where release groups actually put it', () => {
    // Measured 2026-08-17 in the survey at `debug/g31n-routeb-54.json`: the
    // 1-episode movie `Jujutsu Kaisen 0 Movie` was offered a 4,300.80 MB
    // `(Season 03)` batch with 392 seeders. `untaggedPart` deletes parenthesised
    // tags along with the codec ones, so the release's own season claim was
    // thrown away before anything could read it.
    expect(looksLikeSameTitle('[Judas] Jujutsu Kaisen (Season 03) [1080p][HEVC x265 10bit][Dual-Audio][Multi-Subs] (Batch)', 'Jujutsu Kaisen 0 Movie')).toBe(false);
    // The control, on the same shape: a first season in the tags is not a
    // sequel, so this stays a match.
    expect(looksLikeSameTitle('[Trix] Some Show S01 (Batch) [WEBRip 1080p AV1 Opus]', 'Some Show')).toBe(true);
    // And a group whose name merely starts with an S is not a season marker.
    expect(looksLikeSameTitle('[SubsPlease] Some Show (01-04) (480p) [Batch]', 'Some Show')).toBe(true);
  });

  it('refuses a longer work that merely contains a one-word title', () => {
    // Both measured live 2026-08-17 against the user's own completed list. MAL
    // 16528 `Hal` is ハル, so the alias walk searched `Haru` — one common romaji
    // word — and `listNyaaHarvest` returned 4 rows of an unrelated show, the
    // cheapest 2,969.60 MB with 52 seeders.
    expect(looksLikeSameTitle('[Trix] Agents of the Four Seasons S01 (Batch) [WEBRip 1080p AV1 Opus] (Multi Subs, VOSTFR) | Shunkashuutou Daikousha: Haru no Mai', 'Haru')).toBe(false);
    expect(looksLikeSameTitle('[DKB] Shunkashuutou Daikousha: Haru no Mai - (Season 01) [1080p][HEVC x265 10bit][Dual-Audio]', 'Haru')).toBe(false);
    // MAL 7024 `Heya` is one episode; this is a 12-episode Yuru Camp spin-off
    // that happens to open with the same word.
    expect(looksLikeSameTitle('[Erai-raws] Heya Camp - 01 ~ 12 [1080p][Multiple Subtitle]', 'Heya')).toBe(false);
    // Two words are just as degenerate: one hit out of two still clears the
    // half-the-tokens bar outright.
    expect(looksLikeSameTitle('[Group] Big Windup - 01-25 [BD]', 'Big O')).toBe(false);
  });

  it('still matches a short title the release really carries', () => {
    // The false-negative controls. Every extra word here is the release talking
    // about itself, which is exactly what `RELEASE_VOCABULARY` and
    // `RELEASE_MARKER` exist to forgive.
    expect(looksLikeSameTitle('[Group] Haru [1080p][HEVC][Multi Sub]', 'Haru')).toBe(true);
    expect(looksLikeSameTitle('[Group] Haru (2013) [BDRip 1080p x264 AAC]', 'Haru')).toBe(true);
    expect(looksLikeSameTitle('[Group] Monster - Complete Series 01-74 [BD 1080p]', 'Monster')).toBe(true);
    expect(looksLikeSameTitle('Akira 1988 Remastered 4K UHD Dual Audio', 'Akira')).toBe(true);
    expect(looksLikeSameTitle('[Group] Some Show S1 01-25', 'Some Show')).toBe(true);
    // A name that is nothing but tags carries no counter-evidence, only the
    // absence of any, so the digits rule above stays the one that judges it.
    expect(looksLikeSameTitle('[SomeGroup] 001 (2010) [BDRip 1080p]', '001')).toBe(true);
    // Three significant words are enough ratio to score on, and this row is a
    // real one the pool would lose if the rule reached further.
    expect(looksLikeSameTitle('[Erai-raws] Nanatsu no Taizai - Seisen no Shirushi - 01 ~ 04', 'Nanatsu no Taizai: Seisen no Shirushi')).toBe(true);
  });

  it('reads a native title as the same work, not as another work', () => {
    // This is the single release name in the 2,685 this repo has recorded that
    // advertises external subtitles, i.e. the one Route B candidate the whole
    // survey found — and the short-title rule refused it in BOTH directions:
    // the romaji search tripped on `銀魂`, the native-alias search on `gintama`.
    // `ep001` was a second refusal on the same row: the range `ep001-201` splits
    // into a bare `201`, which is dropped as digits, and an `ep001` that was not.
    const gintama = '[Yousei-raws] Gintama 銀魂 (2006-2010) ep001-201 [DVDrip 760x576 x264 FLAC] + Subs';
    expect(looksLikeSameTitle(gintama, 'Gintama')).toBe(true);
    expect(looksLikeSameTitle(gintama, '銀魂')).toBe(true);
    // NEGATIVE CONTROL: unreadable is not the same as forgiven. A release naming
    // a genuinely different work in the SAME script is still refused, because
    // the half-the-tokens ratio judges it before this rule is asked.
    expect(looksLikeSameTitle('[SubsPlease] Shingeki no Kyojin 進撃の巨人 - 01-25 [1080p]', '銀魂')).toBe(false);
    expect(looksLikeSameTitle('[Group] 進撃の巨人 Attack on Titan 01-25', 'Gintama')).toBe(false);
  });

  it('counts a repeated title word once, not twice', () => {
    // Measured 2026-08-17 in the survey: the 2018 film `Mirai no Mirai` reads as
    // three tokens, so it escaped the short-title rule entirely and was offered
    // two releases of a 2025 show that shares one word and a particle.
    expect(looksLikeSameTitle('[EMBER] Miru: Watashi no Mirai (2025) [1080p]', 'Mirai no Mirai')).toBe(false);
    expect(looksLikeSameTitle('[SubsPlease] Miru - Watashi no Mirai - 01 (1080p)', 'Mirai no Mirai')).toBe(false);
    // The control the rule must not break: the work's own releases still match,
    // whichever way the name is written.
    expect(looksLikeSameTitle('[Group] Mirai no Mirai (2018) [BDRip 1080p x264]', 'Mirai no Mirai')).toBe(true);
    expect(looksLikeSameTitle('[Group] Mirai [1080p][Dual Audio]', 'Mirai no Mirai')).toBe(true);
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

describe('rankSubtitleCandidatesDetailed drops / describeEmptyNyaaListing', () => {
  // Every row below is a real name from the 2026-08-17 survey.
  const muxed = row({
    id: 'erai',
    name: '[Erai-raws] Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai - 01 ~ 04 '
      + '[1080p][HEVC][BATCH][Multiple Subtitle] [ENG][SPA][ARA][FRE][GER][ITA][RUS]',
    isBatch: true,
    sizeBytes: 2_662 * MB,
    seeders: 7,
  });
  const plain = row({
    id: 'subsplease',
    name: '[SubsPlease] Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai (01-04) (1080p) [Batch]',
    isBatch: true,
    sizeBytes: 5_939 * MB,
    seeders: 61,
  });
  const want = { languages: ['ja'], title: 'Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai' };

  it('attributes a muxing declaration separately from an unusable shape', () => {
    const { candidates, dropped } = rankSubtitleCandidatesDetailed([muxed, plain], want);
    expect(candidates.map((c) => c.row.id)).toEqual(['subsplease']);
    expect(dropped.titleMatched).toBe(2);
    expect(dropped.muxed).toBe(1);
    expect(dropped.shape).toBe(0);
  });

  it('counts a row that is neither muxed nor fetchable as shape, not muxed', () => {
    // A single-file release: refused for having no addressable subset, and the
    // listing must not tell the user it was refused for muxing.
    const single = row({ id: 'one', name: 'Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai - 01 [1080p].mkv' });
    const { dropped } = rankSubtitleCandidatesDetailed([single], want);
    expect(dropped.shape).toBe(1);
    expect(dropped.muxed).toBe(0);
  });

  it('does not credit muxing for a row that was unusable anyway', () => {
    // The number the listing quotes has to mean "withheld because of this".
    // A single-file release is refused for its shape whatever its name says,
    // and counting it read 11 of 38 live where only 4 matches were batches.
    const singleMuxed = row({
      id: 'single-muxed',
      name: 'Kaguya-sama wa Kokurasetai - First Kiss wa Owaranai - 01 [1080p][Multi-Subs].mkv',
      isBatch: false,
    });
    const { dropped } = rankSubtitleCandidatesDetailed([singleMuxed], want);
    expect(declaresMuxedSubtitles(singleMuxed.name)).toBe(true);
    expect(dropped.muxed).toBe(0);
    expect(dropped.shape).toBe(1);
  });

  it('names the number when every match declared muxing, and stays quiet otherwise', () => {
    const { candidates, dropped } = rankSubtitleCandidatesDetailed([muxed], want);
    expect(candidates).toEqual([]);
    // The whole point of the counter: this refusal can be checked. Both counts
    // agree independently — live, one shared noun phrase produced "1 of 1
    // matching release declare their subtitles", then "1 of 38 matching
    // release declares".
    expect(describeEmptyNyaaListing(dropped)).toContain('Of 1 release matching it, 1 declares its subtitles');
    expect(describeEmptyNyaaListing(dropped)).toContain('muxed into the video');
    expect(describeEmptyNyaaListing({ ...dropped, muxed: 1, titleMatched: 38 }))
      .toContain('Of 38 releases matching it, 1 declares its subtitles');
    expect(describeEmptyNyaaListing({ ...dropped, muxed: 4, titleMatched: 7 }))
      .toContain('Of 7 releases matching it, 4 declare their subtitles');

    // Negative control: nothing muxed, so no muxing claim is made up.
    const { dropped: none } = rankSubtitleCandidatesDetailed([], want);
    expect(describeEmptyNyaaListing(none)).toBe(
      'No release on the index looks like it carries subtitles for this title.',
    );
  });

  it('separates a title miss from a match it could not use', () => {
    const other = row({ id: 'other', name: '[Trix] Agents of the Four Seasons S01 (Batch)', isBatch: true });
    const { dropped } = rankSubtitleCandidatesDetailed([other, muxed], want);
    expect(dropped.title).toBe(1);
    expect(dropped.titleMatched).toBe(1);
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

  it('falls back to the files that stated nothing when the language filter empties the pool', () => {
    // The legitimate half of the fallback: single-language packs routinely
    // label nothing, and refusing them would refuse most of nyaa.
    const files = [file(0, 'Subs/Show - 07.srt')];
    const chosen = selectSubtitleFiles(files, { languages: ['ja'] });
    expect(chosen.reason).toBe('ok');
    expect(chosen.files).toHaveLength(1);
  });

  it('refuses a release whose files all state a language we did not ask for', () => {
    // This assertion used to read the other way — `ok`, 1 file — and that was
    // the defect, not a preference. Measured on a real release:
    // `Ashita no Joe 2 … [CR] (Subtitles only)` ships 47 files each named
    // `[CR] Tomorrow's Joe 2 - E19 [Eng].ass`, so a `ja` harvest filtered all 47
    // out, found the pool empty, restored all 47 and downloaded them. A release
    // that declares its language is the one case that must not be overridden.
    const files = [file(0, 'Subs/eng/Show - 07.srt'), file(1, "Show - 08 [Eng].ass")];
    const chosen = selectSubtitleFiles(files, { languages: ['ja'] });
    expect(chosen.reason).toBe('wrong-language');
    expect(chosen.files).toHaveLength(0);
  });

  it('still takes the wanted-language files when the release labels both', () => {
    // The control for the refusal above: the filter must be selecting, not
    // simply failing whenever a language is stated anywhere.
    const files = [file(0, 'Subs/eng/Show - 07.srt'), file(1, 'Subs/jpn/Show - 07.srt')];
    const chosen = selectSubtitleFiles(files, { languages: ['ja'] });
    expect(chosen.reason).toBe('ok');
    expect(chosen.files.map((entry) => entry.name)).toEqual(['Subs/jpn/Show - 07.srt']);
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
    const tagged = ass([
      String.raw`{\k21}ka{\k18}ra{\k30}o{\k25}ke`,
      String.raw`{\pos(100,200)\fadeこんにちは}Hello there.`,
    ]);
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
