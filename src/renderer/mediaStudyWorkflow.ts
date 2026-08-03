import type { BookLevelEstimate } from '../shared/bookLevelEstimate';
import { examSlotsForLang } from '../shared/bookLevelEstimate';
import type { ComprehensibilityScore } from '../shared/comprehensibility';
import {
  buildMediaStudyCorpus,
  buildMediaStudyFlashcardDrafts,
  type MediaStudyCorpus,
} from '../shared/mediaStudyExtraction';
import {
  difficultyBandFromJlpt,
  type MediaLanguageProfile,
} from '../shared/mediaStudyDatabase';
import type { MediaItem } from '../shared/types';
import {
  buildVisualNovelStudyCardDrafts,
  visualNovelStudyCardKey,
  type VisualNovelStudyCardKind,
} from '../shared/visualNovelStudyCards';
import { estimateLevelFromText } from './bookLevelEstimate';
import { scoreTextComprehensibility } from './comprehensibility';
import { addDeckCards, loadDeck } from './flashcardDeck';
import { matchGrammarPatterns, type GrammarMatchHit } from './grammarMatch';
import { getLevel } from './knownWords';
import { getSlotList } from './levelLists';
import type { Cue } from './subtitles';
import { getTokenizer, tokenizeSync } from './tokenizer';

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

export async function analyzeMediaStudyCues(cues: readonly Cue[]): Promise<MediaStudyAnalysis> {
  await getTokenizer();
  const corpus = buildMediaStudyCorpus(cues, tokenizeSync);
  const [level, comprehensibility] = await Promise.all([
    estimateLevelFromText(corpus.text, 'ja'),
    scoreTextComprehensibility(corpus.text),
  ]);
  return {
    ...corpus,
    level,
    comprehensibility,
    grammar: rankGrammar(corpus.sentences),
  };
}

function configuredJlptSets(): Array<{ label: string; words: ReadonlySet<string> }> {
  return examSlotsForLang('ja').flatMap((slot) => {
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

function difficultyScore(label: string | null, unknownRatio: number): number {
  const base = label === 'N5' ? 20
    : label === 'N4' ? 35
      : label === 'N3' ? 55
        : label === 'N2' ? 75
          : label === 'N1' || label === 'N0' ? 90
            : 50;
  return Math.min(100, Math.round(base + unknownRatio * 10));
}

function recommendation(knownRatio: number, level: string | null): string {
  if (knownRatio >= 0.9) return 'Comfortable for your current vocabulary.';
  if (knownRatio >= 0.75) return `Challenging but suitable${level ? ` around ${level}` : ''}.`;
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

export function addMediaStudyFlashcards(
  item: MediaItem,
  analysis: MediaStudyAnalysis,
  limit = 30,
): number {
  const existing = new Set(
    loadDeck()
      .filter((card) => card.bookId === item.id)
      .map((card) => card.word),
  );
  const drafts = buildMediaStudyFlashcardDrafts(analysis.vocabulary, {
    limit,
    excludeWords: existing,
  });
  if (!drafts.length) return 0;
  addDeckCards(drafts.map((draft) => ({
    ...draft,
    meaning: '',
    source: 'media' as const,
    bookId: item.id,
    bookTitle: item.title,
    folder: 'Media',
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
    vocabulary: analysis.vocabulary.filter((entry) => getLevel(entry.word) < 2),
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
    addDeckCards(drafts.map((draft) => ({
      ...draft,
      source: 'media' as const,
      bookId: item.id,
      bookTitle: item.title,
      folder: 'Media',
    })));
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
  addDeckCards([{
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
  }]);
  return true;
}
