import { describe, expect, it } from 'vitest';
import type { TorrentRow } from '../scraperResults';
import {
  asNyaaAcquisitionConfig,
  buildSubtitleQuery,
  couldCarrySidecarSubtitles,
  episodeFromFileName,
  isBitmapSubtitleFile,
  languageFromFileName,
  looksLikeSubtitleOnly,
  rankSubtitleCandidates,
  selectSubtitleFiles,
  subtitleFormatFor,
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
