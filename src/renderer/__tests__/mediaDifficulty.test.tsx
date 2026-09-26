// @vitest-environment jsdom
/**
 * Difficulty is visible and never "Unrated" for want of uploaded lists: the
 * dictionary fallback, the title-level summary, series decks and the player's
 * known-word marks.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hskLabel, jlptFromKanjidic, levelCovering, levelFromRank } from '../../shared/levelFallback';
import { summarizeMediaLevels, type MediaLanguageProfile } from '../../shared/mediaStudyDatabase';
import { createMediaLanguageProfile, type MediaStudyAnalysis } from '../mediaStudyWorkflow';
import { guessSeriesTitle, seriesDeckFor, seriesKey, subscribeSeriesDeck, unsubscribeSeriesDeck } from '../mediaDecks';
import { hardestLevel } from '../lineLevel';
import SubtitleCueLine from '../components/SubtitleCueLine';
import { setLevel } from '../knownWords';
import { setStudyLang } from '../studyEnvironment';
import { loadMediaStudyDatabase, saveMediaLanguageProfile } from '../mediaStudyStore';

beforeEach(() => localStorage.clear());

describe('dictionary level fallback', () => {
  it('reads KANJIDIC2 levels and HSK bands onto today\'s scales', () => {
    expect(jlptFromKanjidic('4')).toBe('N5');
    expect(jlptFromKanjidic('1')).toBe('N1');
    expect(jlptFromKanjidic('N3')).toBe('N3');
    expect(jlptFromKanjidic('')).toBeNull();
    expect(hskLabel('HSK 3')).toBe('HSK3');
  });

  it('maps frequency ranks to each language\'s levels', () => {
    expect(levelFromRank(100, 'ja')).toBe('N5');
    expect(levelFromRank(50_000, 'ja')).toBe('N1');
    expect(levelFromRank(1_000, 'zh')).toBe('HSK2');
    expect(levelFromRank(2_500, 'ru')).toBe('B1');
    expect(levelFromRank(undefined, 'ru')).toBeNull();
  });

  it('finds the level that covers 90% of the weighted items', () => {
    const items = [
      { level: 'N5', weight: 70 },
      { level: 'N4', weight: 15 },
      { level: 'N2', weight: 10 },
      { level: 'N1', weight: 5 },
      { level: null, weight: 500 },
    ];
    expect(levelCovering(items, 'ja')).toBe('N2');
    expect(levelCovering([{ level: null, weight: 1 }], 'ja')).toBeNull();
    expect(hardestLevel(['A1', 'B2', null, 'A2'], 'ru')).toBe('B2');
  });

  it('gives a profile an estimated level instead of "Unrated" when no lists are uploaded', () => {
    setStudyLang('ja');
    const analysis = {
      text: '猫が好きです',
      truncated: false,
      vocabulary: [
        { word: '猫', reading: 'ねこ', occurrences: 9, sentence: '', firstSeenAt: 0 },
        { word: '好き', reading: 'すき', occurrences: 1, sentence: '', firstSeenAt: 0 },
      ],
      kanji: [{ character: '猫', occurrences: 9 }],
      sentences: [],
      grammar: [],
      level: null,
      comprehensibility: { uniqueKnown: 1, uniqueTotal: 2 },
      dictionaryLevels: { words: { 猫: 'N4', 好き: 'N5' }, chars: { 猫: 'N2' } },
    } as unknown as MediaStudyAnalysis;
    const profile = createMediaLanguageProfile({ id: 'm1', title: 'Cats' }, analysis, 0, { kind: 'episode' });
    expect(profile.difficulty.jlptLevel).toBe('N4');
    expect(profile.difficulty.levelSource).toBe('dictionary');
    expect(profile.vocabulary.jlptDistribution).toMatchObject({ N4: 1, N5: 1 });
    expect(profile.scope).toEqual({ kind: 'episode' });
    // Survives the store's normalisation.
    saveMediaLanguageProfile(profile);
    expect(loadMediaStudyDatabase().profiles.m1.difficulty.levelSource).toBe('dictionary');
  });
});

describe('title level summary', () => {
  const profile = (id: string, level: string, known: number, words: number): MediaLanguageProfile =>
    ({
      mediaId: id,
      title: id,
      updatedAt: 0,
      analyzedCharacters: 0,
      truncated: false,
      difficulty: { score: 50, band: 'intermediate', jlptLevel: level, confidence: 1, knownRatio: known, unknownRatio: 1 - known, recommendation: '' },
      vocabulary: { totalOccurrences: 0, uniqueWords: words, knownWordsEstimate: 0, unknownWordsEstimate: 0, jlptDistribution: {}, top: [] },
      kanji: { totalOccurrences: 0, uniqueKanji: 0, jlptDistribution: {}, top: [] },
      grammar: { totalPoints: 0, jlptDistribution: {}, points: [] },
      sentences: { total: 0, sample: [] },
    }) as MediaLanguageProfile;

  it('takes the hardest level and weights known share by vocabulary', () => {
    const profiles = { a: profile('a', 'N4', 0.9, 100), b: profile('b', 'N2', 0.6, 300) };
    const summary = summarizeMediaLevels(profiles, ['x', 'a', 'b'])!;
    expect(summary.level).toBe('N2');
    expect(summary.knownRatio).toBeCloseTo(0.675);
    expect(summarizeMediaLevels(profiles, ['nope'])).toBeNull();
  });
});

describe('series decks', () => {
  it('reads the series out of episode file names', () => {
    expect(guessSeriesTitle('[Group] Frieren - 07 (1080p).mkv')).toBe('Frieren');
    expect(guessSeriesTitle('Frieren S01E07')).toBe('Frieren');
    expect(guessSeriesTitle('葬送のフリーレン 第7話')).toBe('葬送のフリーレン');
    expect(seriesKey('Frieren - 01')).toBe(seriesKey('Frieren - 12'));
  });

  it('remembers which series keep their deck updated', () => {
    subscribeSeriesDeck('Frieren - 01', 'Frieren deck', ['vocabulary', 'kanji']);
    expect(seriesDeckFor('Frieren - 08')?.folder).toBe('Frieren deck');
    unsubscribeSeriesDeck('Frieren - 08');
    expect(seriesDeckFor('Frieren - 01')).toBeNull();
  });
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe('player subtitle marks', () => {
  it('marks words the learner does not know, per study language', async () => {
    setStudyLang('ru');
    setLevel('кошка', 3);
    host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    root = r;
    await act(async () => {
      r.render(<SubtitleCueLine text="кошка спит" furigana={false} lang="ru" knownHighlight levelBadge="A2" />);
    });
    const words = [...host.querySelectorAll('.media-sub-morpheme')];
    if (words.length) {
      const sleep = words.find((w) => w.textContent === 'спит');
      const cat = words.find((w) => w.textContent === 'кошка');
      expect(sleep?.className).toContain('wk-new');
      expect(cat?.className).not.toContain('wk-new');
    }
    expect(host.querySelector('.study-cue-level')?.textContent).toBe('A2');
  });
});
