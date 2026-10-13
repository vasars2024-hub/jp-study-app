// @vitest-environment node
/**
 * Subtitle-language tags in release names. `\b` is ASCII-only, so the old
 * patterns could never see 中文/简体/繁體/Русск, and `rus` with no closing
 * boundary tagged "Rusty Lake" as Russian. Fixture names only; no index is
 * contacted.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { parseSubtitleLanguages } = await import('../scraper/torrents');

function langs(name: string): string[] {
  return parseSubtitleLanguages(name).sort();
}

describe('parseSubtitleLanguages: Chinese tags', () => {
  it.each([
    ['[Nekomoe kissaten][Frieren][01][1080p][CHS].mp4', ['zh']],
    ['[Nekomoe kissaten][Frieren][01][1080p][CHT].mp4', ['zh']],
    ['[Sakurato] Frieren [01][AVC-8bit 1080p][CHS_JP]', ['ja', 'zh']],
    ['[LoliHouse] 葬送的芙莉莲 - 01 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]', ['zh']],
    ['[桜都字幕组] 葬送的芙莉莲 [01][1080P][简体内嵌]', ['zh']],
    ['[桜都字幕組] 葬送的芙莉蓮 [01][1080P][繁體內嵌]', ['zh']],
    ['[喵萌奶茶屋] 葬送的芙莉莲 [01][1080p][简日双语]', ['ja', 'zh']],
    ['[喵萌奶茶屋] 葬送的芙莉蓮 [01][1080p][繁日雙語]', ['ja', 'zh']],
    ['[DMG] Title [01][720P][GB].mp4', ['zh']],
    ['[DMG] Title [01][720P][BIG5].mp4', ['zh']],
    ['[DMG] Title [01][GB_MP4][1080P]', ['zh']],
    ['[DMG] Title [01][BIG5_MP4][1080P]', ['zh']],
    ['[DMG] Title 01 (CHS&GB)', ['zh']],
    ['[X] Title - 01 [中文字幕]', ['zh']],
    ['[X] Title 01 [ＣＨＳ]', ['zh']],
    ['[X] Title 01 ［ＧＢ］', ['zh']],
    ['[X] Title 01 [JPSC]', ['ja', 'zh']],
  ])('%s -> %j', (name, expected) => {
    expect(langs(name)).toEqual(expected);
  });

  it.each([
    '[SubsPlease] Frieren - 01 (1080p) [F1A2B3C4].mkv',
    '[X] Title Vol.1 (BD 1080p) 1.4 GB',
    '[X] Title Vol.1 [1.4GB]',
    '[X] Title Batch 700GB',
    '[X] Chi\'s Sweet Home - 01',
    '[X] Matchstick Girl - 02',
    '[X] Bigfoot - 03',
  ])('%s -> no Chinese tag', (name) => {
    expect(parseSubtitleLanguages(name)).not.toContain('zh');
  });
});

describe('parseSubtitleLanguages: Russian tags', () => {
  it.each([
    ['[AniLibria] Frieren - 01 [RUS]', ['ru']],
    ['Frieren.S01E01.1080p.RUS.mkv', ['ru']],
    ['[X] Frieren - 01 (Rus Sub)', ['ru']],
    ['[X] Frieren - 01 [RusSub]', ['ru']],
    ['[X] Frieren - 01 [Russian]', ['ru']],
    ['[X] Провожающая в последний путь Фрирен - 01 [русские субтитры]', ['ru']],
    ['[X] Фрирен - 01 [Русская озвучка]', ['ru']],
    ['[X] Фрирен 01 (рус. суб.)', ['ru']],
    ['[X] Фрирен 01 [РУС]', ['ru']],
    ['[X] Frieren 01 [RUS_SUB]', ['ru']],
  ])('%s -> %j', (name, expected) => {
    expect(langs(name)).toEqual(expected);
  });

  it.each([
    'Rusty Lake Hotel - 01',
    'Trust Me - 01',
    '[X] Russo Brothers Documentary',
    '[X] Crush Gear Turbo - 05',
    '[X] Русь изначальная',
    '[X] Corrupted - 01',
  ])('%s -> no Russian tag', (name) => {
    expect(parseSubtitleLanguages(name)).not.toContain('ru');
  });
});

describe('parseSubtitleLanguages: Japanese, English and multi-sub tags', () => {
  it.each([
    ['[X] Title - 01 [JPN]', ['ja']],
    ['[X] Title - 01 [JP]', ['ja']],
    ['[X] Title - 01 RAW', ['ja']],
    ['[X] Title - 01 [日本語字幕]', ['ja']],
    ['[X] Title - 01 [日語]', ['ja']],
    ['[X] Title - 01 [ENG]', ['en']],
    ['[X] Title - 01 [English Sub]', ['en']],
    ['[X] Title - 01 [EngSub]', ['en']],
    ['[X] Title - 01 [Softsubs]', ['en']],
    ['[Erai-raws] Title - 01 [1080p][Multiple Subtitle]', ['en', 'ja']],
    ['[X] Title - 01 [Multi-Sub]', ['en', 'ja']],
    ['[X] Title - 01 [Multi-Subs]', ['en', 'ja']],
    ['[X] Title - 01 [MultiSub]', ['en', 'ja']],
    ['[X] Title - 01 [Multi Subtitles]', ['en', 'ja']],
    ['[X] Title - 01 [ENG][RUS][CHS]', ['en', 'ru', 'zh']],
    ['[X] Title - 01 [日本語][简体]', ['ja', 'zh']],
  ])('%s -> %j', (name, expected) => {
    expect(langs(name)).toEqual(expected);
  });

  it.each([
    ['[X] Engage Kiss - 01', 'en'],
    ['[X] Strawberry Panic - 01', 'ja'],
    ['[X] Japan Sinks 2020 - 01', 'ja'],
    ['[X] Multiverse - 01', 'en'],
    ['[X] 日本沈没 - 01', 'ja'],
  ])('%s -> not %s', (name, language) => {
    expect(parseSubtitleLanguages(name)).not.toContain(language);
  });

  it('returns nothing for a name with no tags', () => {
    expect(parseSubtitleLanguages('[SubsPlease] Frieren - 01 (1080p) [F1A2B3C4].mkv')).toEqual([]);
    expect(parseSubtitleLanguages('')).toEqual([]);
  });
});
