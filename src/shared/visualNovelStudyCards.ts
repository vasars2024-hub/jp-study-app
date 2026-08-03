import type {
  MediaStudyKanjiEntry,
  MediaStudySentence,
  MediaStudyVocabularyEntry,
} from './mediaStudyExtraction';

export type VisualNovelStudyCardKind = 'vocabulary' | 'sentence' | 'kanji' | 'grammar';

export interface VisualNovelStudyCardDraft {
  studyKind: VisualNovelStudyCardKind;
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
  front: string;
  back: string;
  frequency: number;
  jlptLevel: string;
  sceneReference: string;
}

export interface VisualNovelStudyCardAnalysis {
  vocabulary: readonly MediaStudyVocabularyEntry[];
  sentences: readonly MediaStudySentence[];
  kanji: readonly MediaStudyKanjiEntry[];
  grammar: ReadonlyArray<{ id: string; title: string; level: string; meaning: string }>;
}

export interface VisualNovelStudyCardLimits {
  vocabulary?: number;
  sentence?: number;
  kanji?: number;
  grammar?: number;
}

const bounded = (value: number | undefined, fallback: number): number => (
  Math.max(0, Math.min(200, Math.floor(value ?? fallback)))
);

function cardKey(card: Pick<VisualNovelStudyCardDraft, 'studyKind' | 'word' | 'sentence'>): string {
  return `${card.studyKind}\u0000${card.word}\u0000${card.sentence}`;
}

export function visualNovelStudyCardKey(
  studyKind: VisualNovelStudyCardKind,
  word: string,
  sentence = '',
): string {
  return `${studyKind}\u0000${word.trim()}\u0000${sentence.trim()}`;
}

export function buildVisualNovelStudyCardDrafts(
  analysis: VisualNovelStudyCardAnalysis,
  sceneReferences: ReadonlyMap<number, string> = new Map(),
  existingKeys: ReadonlySet<string> = new Set(),
  limits: VisualNovelStudyCardLimits = {},
): VisualNovelStudyCardDraft[] {
  const drafts: VisualNovelStudyCardDraft[] = [];
  const seen = new Set(existingKeys);
  const add = (draft: VisualNovelStudyCardDraft): boolean => {
    const key = cardKey(draft);
    if (seen.has(key)) return false;
    seen.add(key);
    drafts.push(draft);
    return true;
  };

  for (const entry of analysis.vocabulary.slice(0, bounded(limits.vocabulary, 50))) {
    const sceneReference = sceneReferences.get(entry.firstSeenAt) ?? '';
    const detail = [
      entry.reading,
      entry.sentence,
      sceneReference ? `Scene: ${sceneReference}` : '',
      `Frequency: ${entry.occurrences}`,
    ].filter(Boolean).join('\n\n');
    add({
      studyKind: 'vocabulary',
      word: entry.word,
      reading: entry.reading,
      meaning: detail,
      sentence: entry.sentence,
      front: entry.word,
      back: detail,
      frequency: entry.occurrences,
      jlptLevel: '',
      sceneReference,
    });
  }

  const sentenceSeen = new Set<string>();
  let sentenceCount = 0;
  for (const entry of analysis.sentences) {
    if (sentenceCount >= bounded(limits.sentence, 20)) break;
    const sentence = entry.text.trim();
    if (!sentence || sentenceSeen.has(sentence)) continue;
    sentenceSeen.add(sentence);
    const sceneReference = sceneReferences.get(entry.start) ?? '';
    if (add({
      studyKind: 'sentence',
      word: sentence.slice(0, 80),
      reading: '',
      meaning: sceneReference ? `Scene: ${sceneReference}` : '',
      sentence,
      front: sentence,
      back: sceneReference ? `Scene: ${sceneReference}` : '',
      frequency: 1,
      jlptLevel: '',
      sceneReference,
    })) sentenceCount += 1;
  }

  for (const entry of analysis.kanji.slice(0, bounded(limits.kanji, 20))) {
    const examples = analysis.vocabulary.filter((item) => item.word.includes(entry.character));
    const readings = [...new Set(examples.map((item) => item.reading).filter(Boolean))].slice(0, 6);
    const example = examples[0];
    const sceneReference = example ? sceneReferences.get(example.firstSeenAt) ?? '' : '';
    const detail = [
      readings.length ? `Readings in mined words: ${readings.join(' · ')}` : '',
      example?.sentence ?? '',
      sceneReference ? `Scene: ${sceneReference}` : '',
      `Frequency: ${entry.occurrences}`,
    ].filter(Boolean).join('\n\n');
    add({
      studyKind: 'kanji',
      word: entry.character,
      reading: readings.join(' · '),
      meaning: detail,
      sentence: example?.sentence ?? '',
      front: entry.character,
      back: detail,
      frequency: entry.occurrences,
      jlptLevel: '',
      sceneReference,
    });
  }

  for (const grammar of analysis.grammar.slice(0, bounded(limits.grammar, 10))) {
    const surface = grammar.title.replace(/[～〜\s]/g, '');
    const example = analysis.sentences.find((entry) => (
      surface && entry.text.replace(/\s/g, '').includes(surface)
    )) ?? analysis.sentences[0];
    const sceneReference = example ? sceneReferences.get(example.start) ?? '' : '';
    const detail = [
      grammar.meaning,
      grammar.level ? `Level: ${grammar.level}` : '',
      example?.text ?? '',
      sceneReference ? `Scene: ${sceneReference}` : '',
    ].filter(Boolean).join('\n\n');
    add({
      studyKind: 'grammar',
      word: grammar.title,
      reading: '',
      meaning: detail,
      sentence: example?.text ?? '',
      front: grammar.title,
      back: detail,
      frequency: 1,
      jlptLevel: grammar.level,
      sceneReference,
    });
  }

  return drafts;
}
