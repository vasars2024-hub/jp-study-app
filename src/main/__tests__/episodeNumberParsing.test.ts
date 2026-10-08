import { describe, expect, it } from 'vitest';
import {
  parseKanjiNumeral,
  parseReleaseEpisode,
  releaseEpisodeRange,
  releaseMarkerIsEpisode,
} from '../../shared/releaseEpisodeNumber';
import { parseMediaFileName } from '../../shared/mediaFileIdentity';
import { releaseCoversEpisode } from '../../shared/malDownload';
import { looksLikeBatch } from '../scraper/torrents';
import { normalizeEpisodeNumbering } from '../scraper/extractionRules';

interface Case {
  name: string;
  season: number | null;
  episode: number | null;
}

const CASES: Case[] = [
  { name: 'Show - 05 [E9ED99BE].mkv', season: null, episode: 5 },
  { name: '[SubsPlease] Show - 05 [E9ED99BE] [1080p].mkv', season: null, episode: 5 },
  { name: '[SubsPlease] Sousou no Frieren - 12 (1080p) [ABCD1234].mkv', season: null, episode: 12 },
  { name: '86 - Eighty Six - 05.mkv', season: null, episode: 5 },
  { name: '【推しの子】 第2期 第3話.mkv', season: 2, episode: 3 },
  { name: '響け！ユーフォニアム ３ 第１２話.mkv', season: null, episode: 12 },
  { name: 'ゆるキャン△ #03.mkv', season: null, episode: 3 },
  { name: '葬送のフリーレン 第05話.mkv', season: null, episode: 5 },
  { name: '葬送のフリーレン 5話.mkv', season: null, episode: 5 },
  { name: '葬送のフリーレン 第三話.mkv', season: null, episode: 3 },
  { name: 'ちびまる子ちゃん 第1024回', season: null, episode: 1024 },
  { name: 'Mob Psycho 100 - 07 [1080p].mkv', season: null, episode: 7 },
  { name: 'Steins;Gate 0 - 05 [720p].mkv', season: null, episode: 5 },
  { name: 'Gum Test Show 100 - 01 (1080p) [JPN]', season: null, episode: 1 },
  { name: 'Frieren S01E07 1080p WEB-DL', season: 1, episode: 7 },
  { name: 'Show Season 2 - 04 [1080p]', season: 2, episode: 4 },
  { name: 'Show 2nd Season EP 04', season: 2, episode: 4 },
  { name: 'Show S2 - 04', season: 2, episode: 4 },
  { name: 'ショー 3期 第４話', season: 3, episode: 4 },
  { name: 'The Big O.E01.Bandai.ja.srt', season: null, episode: 1 },
  { name: 'Frieren [07][1080p]', season: null, episode: 7 },
  { name: 'Frieren_07_1080p', season: null, episode: 7 },
  // Negatives: nothing here is an episode number.
  { name: 'Mob Psycho 100 (2016) [1080p].mkv', season: null, episode: null },
  { name: '[Group] Title [ABCD1234].mkv', season: null, episode: null },
  { name: '[Group] Title [E9ED99BE] (1080p x264 AAC).mkv', season: null, episode: null },
  { name: 'Show 全12話', season: null, episode: null },
  { name: 'Show - 2.5 [1080p]', season: null, episode: null },
];

describe('parseReleaseEpisode', () => {
  it.each(CASES)('$name', ({ name, season, episode }) => {
    const parsed = parseReleaseEpisode(name);
    expect(parsed.episode).toBe(episode);
    expect(parsed.season).toBe(season);
  });

  it('reads a Japanese episode range', () => {
    const parsed = parseReleaseEpisode('ショー 第1話～第12話');
    expect([parsed.episode, parsed.episodeEnd]).toEqual([1, 12]);
  });

  it('reads simple kanji numerals', () => {
    expect(parseKanjiNumeral('十二')).toBe(12);
    expect(parseKanjiNumeral('二十五')).toBe(25);
    expect(parseKanjiNumeral('百')).toBe(100);
    expect(parseKanjiNumeral('五')).toBe(5);
    expect(parseKanjiNumeral('abc')).toBeNull();
  });
});

describe('episode matching', () => {
  it.each([
    ['Show - 05 [E9ED99BE].mkv', 5, true],
    ['Show - 05 [E9ED99BE].mkv', 9, false],
    ['[SubsPlease] Show - 05 [E9ED99BE] [1080p].mkv', 9, false],
    ['86 - Eighty Six - 05.mkv', 86, false],
    ['86 - Eighty Six - 05.mkv', 5, true],
    ['響け！ユーフォニアム ３ 第１２話.mkv', 12, true],
    ['響け！ユーフォニアム ３ 第１２話.mkv', 3, false],
    ['【推しの子】 第2期 第3話.mkv', 3, true],
    ['【推しの子】 第2期 第3話.mkv', 2, false],
    ['ゆるキャン△ #03.mkv', 3, true],
    ['Mob Psycho 100 - 07', 100, false],
    ['[SubsPlease] Frieren - 12 (1080p) [ABCD1234].mkv', 1080, false],
  ] as const)('%s covers %i: %s', (name, n, expected) => {
    expect(releaseMarkerIsEpisode(name, n)).toBe(expected);
    expect(releaseCoversEpisode(name, n)).toBe(expected);
  });
});

describe('looksLikeBatch', () => {
  it.each([
    ['[X] Frieren 01-12 (1080p)', true],
    ['[X] Frieren 01~12 (1080p)', true],
    ['[X] Frieren E01-E12', true],
    ['[X] Frieren (01 - 12) [1080p]', true],
    ['[X] Frieren [Batch]', true],
    ['[X] Frieren Complete', true],
    ['[X] Frieren S01 complete', true],
    ['フリーレン 全12話', true],
    ['フリーレン 全１２話', true],
    ['フリーレン 第1話～第12話', true],
    ['Mob Psycho 100 - 07 [1080p]', false],
    ['Steins;Gate 0 - 05 [1080p]', false],
    ['[GumSubs] Gum Test Show 100 - 01 (1080p) [JPN]', false],
    ['[SubsPlease] Frieren - 01 (1080p) [F1A2B3C4].mkv', false],
    ['[X] Title (2020) 1080p', false],
    ['[X] Title 1920x1080', false],
    ['[X] Title 2023-01-05', false],
    ['【推しの子】 第2期 第3話', false],
  ] as const)('%s -> %s', (name, expected) => {
    expect(looksLikeBatch(name)).toBe(expected);
  });

  it('exposes the range it read', () => {
    expect(releaseEpisodeRange('[X] Frieren 01-28 [Batch]')).toEqual({ start: 1, end: 28 });
    expect(releaseEpisodeRange('Mob Psycho 100 - 07')).toBeNull();
  });
});

describe('parseMediaFileName on Japanese names', () => {
  it.each([
    ['【推しの子】 第2期 第3話.mkv', 2, 3, '【推しの子】'],
    ['響け！ユーフォニアム ３ 第１２話.mkv', null, 12, '響け！ユーフォニアム ３'],
    ['ゆるキャン△ #03.mkv', null, 3, 'ゆるキャン△'],
    ['葬送のフリーレン 第05話.mkv', null, 5, '葬送のフリーレン'],
    ['86 - Eighty Six - 05.mkv', null, 5, '86 - Eighty Six'],
    ['Show - 05 [E9ED99BE].mkv', null, 5, 'Show'],
    ['[SubsPlease] Sousou no Frieren - 12 (1080p) [ABCD1234].mkv', null, 12, 'Sousou no Frieren'],
  ] as const)('%s', (name, season, episode, title) => {
    const parsed = parseMediaFileName(name);
    expect(parsed.episode).toBe(episode);
    expect(parsed.season).toBe(season);
    expect(parsed.title).toBe(title);
  });
});

describe('normalizeEpisodeNumbering', () => {
  it.each([
    ['第３話 はじまり', 3, 'はじまり'],
    ['第3回 はじまり', 3, 'はじまり'],
    ['第十二話 終わり', 12, '終わり'],
    ['＃５ タイトル', 5, 'タイトル'],
    ['Episode 3 - Killing Magic', 3, 'Killing Magic'],
    ['The Village at Episode 3', null, 'The Village at Episode 3'],
  ] as const)('%s', (title, number, rest) => {
    expect(normalizeEpisodeNumbering(title)).toEqual({ number, title: rest });
  });
});
