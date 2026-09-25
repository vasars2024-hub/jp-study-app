import type { BookLevelEstimate } from '../shared/bookLevelEstimate';
import { examSlotsForLang } from '../shared/bookLevelEstimate';
import type { ComprehensibilityScore } from '../shared/comprehensibility';
import {
  buildMediaStudyCorpus,
  buildMediaStudyFlashcardDrafts,
  type MediaStudyCorpus,
  type MediaStudyExtractionOptions,
} from '../shared/mediaStudyExtraction';
import {
  difficultyBandFromJlpt,
  type MediaLanguageProfile,
} from '../shared/mediaStudyDatabase';
import { locateInSeason, type CombinedSeasonSegment } from '../shared/subtitleHarvest';
import type { MediaItem } from '../shared/types';
import {
  buildVisualNovelStudyCardDrafts,
  visualNovelStudyCardKey,
  type VisualNovelStudyCardKind,
} from '../shared/visualNovelStudyCards';
import { estimateLevelFromText } from './bookLevelEstimate';
import { scoreTextComprehensibility } from './comprehensibility';
import { addDeckCardsTracked, loadDeck } from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';
import { matchGrammarPatterns, type GrammarMatchHit } from './grammarMatch';
import { getLevel } from './knownWords';
import { getSlotList } from './levelLists';
import type { Cue } from './subtitles';
import { getTokenizer, tokenizeSync } from './tokenizer';
import { getStudyLang } from './studyEnvironment';
import { studyTokens } from './studyTokens';

export interface MediaStudyAnalysis extends MediaStudyCorpus {
  level: BookLevelEstimate | null;
  comprehensibility: ComprehensibilityScore;
  grammar: GrammarMatchHit[];
}

const MAX_GRAMMAR_SENTENCES = 80;
const MAX_GRAMMAR_HITS = 10;

function rankGrammar(sentences: MediaStudyCorpus['sentences']): GrammarMatchHit[] {
  const hits = new Map<string, { hit: GrammarMatchHit; count: number; first: number }>();
  for (const [index, sentence] of sentences.slice(0, MAX_GRAMMAR_SENTENCES).entries()) {
    for (const hit of matchGrammarPatterns(sentence.text, 3)) {
      const existing = hits.get(hit.id);
      if (existing) existing.count += 1;
      else hits.set(hit.id, { hit, count: 1, first: index });
    }
  }
  return [...hits.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, MAX_GRAMMAR_HITS)
    .map((entry) => entry.hit);
}

/**
 * Bounds for a corpus that is a whole season rather than one episode.
 *
 * `buildMediaStudyCorpus` defaults to 800 cues / 60,000 characters, which is
 * generous for the episode it was written for and stops around episode three of
 * a season harvest — the remaining twenty would be dropped with nothing but a
 * `truncated` flag to say so, and a frequency table built from an eighth of the
 * dialogue is wrong rather than partial. These are sized above a long season
 * (a 26-episode run is roughly 9,000 cues) and are still a real ceiling.
 */
export const SEASON_STUDY_LIMITS = { maxCues: 50_000, maxCharacters: 2_000_000 } as const;

/**
 * Analyse a track in the study language: kuromoji for Japanese, ICU words for
 * Chinese and Russian; the level on that language's scale (JLPT / HSK / CEFR).
 * It used to be Japanese throughout, so a Chinese film's analysis found no
 * sentences at all and a Russian one no vocabulary.
 */
export async function analyzeMediaStudyCues(
  cues: readonly Cue[],
  options: MediaStudyExtractionOptions = {},
): Promise<MediaStudyAnalysis> {
  const lang = options.lang ?? getStudyLang();
  if (lang === 'ja') await getTokenizer();
  const tokenize = lang === 'ja' ? tokenizeSync : (text: string) => studyTokens(text, lang);
  const corpus = buildMediaStudyCorpus(cues, tokenize, { ...options, lang });
  const [level, comprehensibility] = await Promise.all([
    estimateLevelFromText(corpus.text, lang),
    scoreTextComprehensibility(corpus.text, undefined, lang),
  ]);
  return {
    ...corpus,
    level,
    comprehensibility,
    // The pattern matcher is Japanese grammar; other languages report none rather than false hits.
    grammar: lang === 'ja' ? rankGrammar(corpus.sentences) : [],
  };
}

function configuredJlptSets(): Array<{ label: string; words: ReadonlySet<string> }> {
  return examSlotsForLang(getStudyLang()).flatMap((slot) => {
    const list = getSlotList(slot.id);
    return list?.words.length
      ? [{ label: slot.short, words: new Set(list.words.map((word) => word.trim()).filter(Boolean)) }]
      : [];
  });
}

function levelFor(value: string, levels: readonly { label: string; words: ReadonlySet<string> }[]): string | null {
  return levels.find((level) => level.words.has(value))?.label ?? null;
}

function increment(distribution: Record<string, number>, label: string | null): void {
  const key = label ?? 'Unknown';
  distribution[key] = (distribution[key] ?? 0) + 1;
}

/** Difficulty base per level label, on each language's scale (JLPT, HSK, CEFR). */
const LEVEL_DIFFICULTY: Readonly<Record<string, number>> = {
  N5: 20, N4: 35, N3: 55, N2: 75, N1: 90, N0: 90,
  HSK1: 20, HSK2: 30, HSK3: 45, HSK4: 60, HSK5: 75, HSK6: 90, 'HSK7-9': 95,
  A1: 20, A2: 35, B1: 55, B2: 75, C1: 88, C2: 95,
};

function difficultyScore(label: string | null, unknownRatio: number): number {
  const base = (label && LEVEL_DIFFICULTY[label.replace(/\s+/g, '').toUpperCase()]) || 50;
  return Math.min(100, Math.round(base + unknownRatio * 10));
}

/**
 * Which of the three difficulty verdicts a profile earns.
 *
 * Exported so `MediaLanguageProfileCard` can re-derive it at render time instead
 * of printing the English sentence `recommendation()` froze into the store. That
 * sentence is written once, at analysis time, so a later language switch could
 * never reach it — and because `knownRatio` is stored alongside it, profiles
 * written before this existed translate correctly too, with no migration (D175).
 */
export type MediaRecommendationKind = 'comfortable' | 'challenging' | 'intensive';

export function recommendationKind(knownRatio: number): MediaRecommendationKind {
  if (knownRatio >= 0.9) return 'comfortable';
  if (knownRatio >= 0.75) return 'challenging';
  return 'intensive';
}

/**
 * The English sentence, still written into the profile so any consumer reading
 * the stored field keeps working. The card no longer reads it.
 */
function recommendation(knownRatio: number, level: string | null): string {
  const kind = recommendationKind(knownRatio);
  if (kind === 'comfortable') return 'Comfortable for your current vocabulary.';
  if (kind === 'challenging') return `Challenging but suitable${level ? ` around ${level}` : ''}.`;
  return `Intensive study content${level ? `; recommended for ${level}+ learners` : ''}.`;
}

export function createMediaLanguageProfile(
  item: MediaItem,
  analysis: MediaStudyAnalysis,
  now = Date.now(),
): MediaLanguageProfile {
  const levels = configuredJlptSets();
  const vocabularyDistribution: Record<string, number> = {};
  const kanjiDistribution: Record<string, number> = {};
  const grammarDistribution: Record<string, number> = {};
  const vocabulary = analysis.vocabulary.map((entry) => {
    const jlptLevel = levelFor(entry.word, levels);
    increment(vocabularyDistribution, jlptLevel);
    return {
      word: entry.word,
      reading: entry.reading,
      occurrences: entry.occurrences,
      sentence: entry.sentence,
      timestamp: entry.firstSeenAt,
      jlptLevel,
    };
  });
  const kanji = analysis.kanji.map((entry) => {
    const jlptLevel = levelFor(entry.character, levels);
    increment(kanjiDistribution, jlptLevel);
    return { ...entry, jlptLevel };
  });
  for (const hit of analysis.grammar) increment(grammarDistribution, hit.level || null);

  const knownWordsEstimate = vocabulary.filter((entry) => getLevel(entry.word) >= 2).length;
  const unknownWordsEstimate = Math.max(0, vocabulary.length - knownWordsEstimate);
  const knownRatio = analysis.comprehensibility.uniqueTotal
    ? analysis.comprehensibility.uniqueKnown / analysis.comprehensibility.uniqueTotal
    : 0;
  const unknownRatio = 1 - knownRatio;
  const jlptLevel = analysis.level?.label ?? null;

  return {
    mediaId: item.id,
    title: item.title,
    updatedAt: now,
    analyzedCharacters: analysis.text.length,
    truncated: analysis.truncated,
    difficulty: {
      score: difficultyScore(jlptLevel, unknownRatio),
      band: jlptLevel
        ? difficultyBandFromJlpt(jlptLevel)
        : knownRatio >= 0.9 ? 'beginner'
          : knownRatio >= 0.75 ? 'intermediate'
            : knownRatio >= 0.55 ? 'advanced'
              : 'native',
      jlptLevel,
      confidence: analysis.level?.confidence ?? 0,
      knownRatio,
      unknownRatio,
      recommendation: recommendation(knownRatio, jlptLevel),
    },
    vocabulary: {
      totalOccurrences: vocabulary.reduce((total, entry) => total + entry.occurrences, 0),
      uniqueWords: vocabulary.length,
      knownWordsEstimate,
      unknownWordsEstimate,
      jlptDistribution: vocabularyDistribution,
      top: vocabulary.slice(0, 200),
    },
    kanji: {
      totalOccurrences: kanji.reduce((total, entry) => total + entry.occurrences, 0),
      uniqueKanji: kanji.length,
      jlptDistribution: kanjiDistribution,
      top: kanji.slice(0, 200),
    },
    grammar: {
      totalPoints: analysis.grammar.length,
      jlptDistribution: grammarDistribution,
      points: analysis.grammar,
    },
    sentences: {
      total: analysis.sentences.length,
      sample: analysis.sentences.slice(0, 100).map((sentence) => ({
        text: sentence.text,
        timestamp: sentence.start,
      })),
    },
  };
}

/** Knowledge level at and above which a word is no longer worth a card. */
export const MINEABLE_BELOW_LEVEL = 2;

/**
 * Words worth a card: everything the learner is not already at level 2+ on.
 *
 * One function rather than the `getLevel(w) < 2` that was written inline in the
 * visual-novel miner and again in the subtitle-harvest panel. Mining what you
 * already know is the fastest way to make a deck useless, so this is the filter
 * that has to be right — and a filter with three copies is one that drifts, and
 * is only ever tested through whichever copy the test happened to reach.
 */
export function mineableVocabulary<T extends { word: string }>(
  vocabulary: readonly T[],
): T[] {
  return vocabulary.filter((entry) => getLevel(entry.word) < MINEABLE_BELOW_LEVEL);
}

/**
 * `{ id, title }` rather than a full `MediaItem`: those are the only two fields
 * used, and widening the parameter lets the subtitle harvest — which mines a
 * catalogue entry that has no local media file — reuse this instead of forking
 * a second, drifting copy of the same deck write. `MediaItem` still satisfies it.
 */
export interface MediaStudyFlashcardOptions {
  limit?: number;
  /**
   * Season segments from `combineSeasonCues`, when the analysed corpus is a
   * multi-episode harvest.
   *
   * Without them a card mined from a 94-episode range records the title and
   * nothing else, so "where did this word come from" has no answer any surface
   * can show — the combined timestamp is meaningless outside the one run that
   * produced it. With them each card carries the episode number and the
   * episode-relative moment, in `sourceRef`, which is the field the player and
   * Study handoffs already read.
   */
  segments?: readonly CombinedSeasonSegment[];
}

export function addMediaStudyFlashcards(
  item: Pick<MediaItem, 'id' | 'title'>,
  analysis: MediaStudyAnalysis,
  options: MediaStudyFlashcardOptions = {},
): number {
  const existing = new Set(
    loadDeck()
      .filter((card) => card.bookId === item.id)
      .map((card) => card.word),
  );
  const drafts = buildMediaStudyFlashcardDrafts(analysis.vocabulary, {
    limit: options.limit ?? 30,
    excludeWords: existing,
  });
  if (!drafts.length) return 0;
  // `buildMediaStudyFlashcardDrafts` does not carry `firstSeenAt` through, and
  // widening the draft would touch every other caller; the word is the key the
  // ranking already deduplicates on, so this recovers it without that churn.
  const firstSeen = new Map(analysis.vocabulary.map((entry) => [entry.word, entry.firstSeenAt]));
  // Fire and forget: mining must not wait on the one OS voice device.
  void enrichNewCards(addDeckCardsTracked(drafts.map((draft) => {
    const at = firstSeen.get(draft.word);
    const located = options.segments && at !== undefined
      ? locateInSeason(options.segments, at)
      : null;
    return {
      ...draft,
      meaning: '',
      source: 'media' as const,
      bookId: item.id,
      bookTitle: item.title,
      folder: 'Media',
      ...(located
        ? {
          sourceRef: {
            mediaId: item.id,
            sourceKind: 'media' as const,
            episode: located.episode,
            cueStartSec: located.withinSec,
            sentence: draft.sentence,
          },
        }
        : {}),
    };
  })));
  return drafts.length;
}

export interface VisualNovelStudyCardAddResult {
  total: number;
  counts: Record<VisualNovelStudyCardKind, number>;
}

export function addVisualNovelStudyFlashcards(
  item: MediaItem,
  analysis: MediaStudyAnalysis,
  sceneReferences: ReadonlyMap<number, string> = new Map(),
): VisualNovelStudyCardAddResult {
  const existing = new Set<string>();
  for (const card of loadDeck().filter((candidate) => candidate.bookId === item.id)) {
    if (card.studyKind) {
      existing.add(visualNovelStudyCardKey(card.studyKind, card.word, card.sentence));
    } else {
      existing.add(visualNovelStudyCardKey('vocabulary', card.word, card.sentence));
      if (card.sentence) existing.add(visualNovelStudyCardKey('sentence', card.word, card.sentence));
    }
  }
  const miningAnalysis: MediaStudyAnalysis = {
    ...analysis,
    vocabulary: mineableVocabulary(analysis.vocabulary),
  };
  const drafts = buildVisualNovelStudyCardDrafts(miningAnalysis, sceneReferences, existing);
  const levels = configuredJlptSets();
  for (const draft of drafts) {
    if (!draft.jlptLevel && (draft.studyKind === 'vocabulary' || draft.studyKind === 'kanji')) {
      draft.jlptLevel = levelFor(draft.word, levels) ?? '';
    }
  }
  const counts: VisualNovelStudyCardAddResult['counts'] = {
    vocabulary: 0,
    sentence: 0,
    kanji: 0,
    grammar: 0,
  };
  for (const draft of drafts) counts[draft.studyKind] += 1;
  if (drafts.length) {
    void enrichNewCards(addDeckCardsTracked(drafts.map((draft) => ({
      ...draft,
      source: 'media' as const,
      bookId: item.id,
      bookTitle: item.title,
      folder: 'Media',
    }))));
  }
  return { total: drafts.length, counts };
}

export function addMediaStudySentenceFlashcard(
  item: MediaItem,
  sentence: string,
  context = '',
  imagePath = '',
  audioPath = '',
): boolean {
  const japanese = sentence.trim();
  if (!japanese) return false;
  const duplicate = loadDeck().some((card) => card.bookId === item.id && card.sentence === japanese);
  if (duplicate) return false;
  // A card that already carries an aligned clip is skipped by the selection,
  // so a captured cue keeps its real audio instead of gaining a synthetic one.
  void enrichNewCards(addDeckCardsTracked([{
    word: japanese.slice(0, 80),
    reading: '',
    meaning: context,
    sentence: japanese,
    front: japanese,
    back: context,
    source: 'media',
    bookId: item.id,
    bookTitle: item.title,
    folder: 'Media',
    studyKind: 'sentence',
    imagePath: imagePath || undefined,
    audioPath: audioPath || undefined,
  }]));
  return true;
}
