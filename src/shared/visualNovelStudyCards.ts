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
  /** The dictionary meaning (vocabulary/kanji) or the grammar gloss — never the example sentence. */
  meaning: string;
  sentence: string;
  front: string;
  back: string;
  frequency: number;
  jlptLevel: string;
  sceneReference: string;
  /** Who said the example line, when the capture carried a speaker. */
  characterName: string;
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

/**
 * What the drafts need to know beyond the text itself.
 *
 * Mined cards used to have no meaning at all: the back was the example
 * sentence, `Scene: 岡部` and `Frequency: 1`, and three captured lines produced
 * 44 cards — 20 of them kanji and 7 grammar — because nothing was filtered.
 * These are the inputs that fix that.
 */
export interface VisualNovelStudyCardContext {
  /** Word → dictionary meaning, from the installed dictionaries. */
  glosses?: ReadonlyMap<string, string>;
  /** Kanji the learner already knows; they get no card of their own. */
  knownKanji?: ReadonlySet<string>;
  /** Sentence offset → speaker of that captured line. */
  speakers?: ReadonlyMap<number, string>;
  /** Character names in this VN, which are never vocabulary cards. */
  characterNames?: ReadonlySet<string>;
}

/** Default caps: a handful of kanji and grammar per batch, not one card per character. */
export const VISUAL_NOVEL_CARD_DEFAULT_LIMITS: Required<VisualNovelStudyCardLimits> = {
  vocabulary: 50,
  sentence: 20,
  kanji: 8,
  grammar: 3,
};

const bounded = (value: number | undefined, fallback: number): number => (
  Math.max(0, Math.min(200, Math.floor(value ?? fallback)))
);

const KANJI = /[\u3400-\u9fff]/u;

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

/** The card back: meaning first, then reading, the example line and where it was said. */
function composeBack(parts: {
  meaning: string;
  reading: string;
  sentence: string;
  sceneReference: string;
  characterName: string;
}): string {
  const where = [parts.characterName, parts.sceneReference].filter(Boolean).join(' · ');
  return [parts.meaning, parts.reading, parts.sentence, where].filter(Boolean).join('\n\n');
}

export function buildVisualNovelStudyCardDrafts(
  analysis: VisualNovelStudyCardAnalysis,
  sceneReferences: ReadonlyMap<number, string> = new Map(),
  existingKeys: ReadonlySet<string> = new Set(),
  limits: VisualNovelStudyCardLimits = {},
  context: VisualNovelStudyCardContext = {},
): VisualNovelStudyCardDraft[] {
  const drafts: VisualNovelStudyCardDraft[] = [];
  const seen = new Set(existingKeys);
  // A word already carded in ANY sentence is not carded again from another one.
  const seenWords = new Set<string>();
  for (const key of existingKeys) {
    const [kind, word] = key.split('\u0000');
    if (kind && word) seenWords.add(`${kind}\u0000${word}`);
  }
  const add = (draft: VisualNovelStudyCardDraft): boolean => {
    const key = cardKey(draft);
    const wordKey = `${draft.studyKind}\u0000${draft.word}`;
    if (seen.has(key) || (draft.studyKind !== 'sentence' && seenWords.has(wordKey))) return false;
    seen.add(key);
    seenWords.add(wordKey);
    drafts.push(draft);
    return true;
  };
  const glosses = context.glosses ?? new Map<string, string>();
  const knownKanji = context.knownKanji ?? new Set<string>();
  const speakers = context.speakers ?? new Map<number, string>();
  const names = context.characterNames ?? new Set<string>();

  const vocabulary = analysis.vocabulary
    .filter((entry) => !entry.proper && !names.has(entry.word) && !names.has(entry.surface))
    .slice(0, bounded(limits.vocabulary, VISUAL_NOVEL_CARD_DEFAULT_LIMITS.vocabulary));
  for (const entry of vocabulary) {
    const sceneReference = sceneReferences.get(entry.firstSeenAt) ?? '';
    const characterName = speakers.get(entry.firstSeenAt) ?? '';
    const meaning = glosses.get(entry.word) ?? '';
    add({
      studyKind: 'vocabulary',
      word: entry.word,
      reading: entry.reading,
      meaning,
      sentence: entry.sentence,
      front: entry.word,
      back: composeBack({ meaning, reading: entry.reading, sentence: entry.sentence, sceneReference, characterName }),
      frequency: entry.occurrences,
      jlptLevel: '',
      sceneReference,
      characterName,
    });
  }

  const sentenceSeen = new Set<string>();
  let sentenceCount = 0;
  for (const entry of analysis.sentences) {
    if (sentenceCount >= bounded(limits.sentence, VISUAL_NOVEL_CARD_DEFAULT_LIMITS.sentence)) break;
    const sentence = entry.text.trim();
    if (!sentence || sentenceSeen.has(sentence)) continue;
    sentenceSeen.add(sentence);
    const sceneReference = sceneReferences.get(entry.start) ?? '';
    const characterName = speakers.get(entry.start) ?? '';
    if (add({
      studyKind: 'sentence',
      word: sentence.slice(0, 80),
      reading: '',
      meaning: '',
      sentence,
      front: sentence,
      back: composeBack({ meaning: '', reading: '', sentence: '', sceneReference, characterName }),
      frequency: 1,
      jlptLevel: '',
      sceneReference,
      characterName,
    })) sentenceCount += 1;
  }

  // Only the kanji of words being mined now, and only ones the learner does not
  // already know — a kanji card for every character on screen is noise.
  const minedCharacters = new Set(vocabulary.flatMap((entry) => [...entry.word].filter((char) => KANJI.test(char))));
  const kanji = analysis.kanji
    .filter((entry) => minedCharacters.has(entry.character) && !knownKanji.has(entry.character))
    .slice(0, bounded(limits.kanji, VISUAL_NOVEL_CARD_DEFAULT_LIMITS.kanji));
  for (const entry of kanji) {
    const examples = vocabulary.filter((item) => item.word.includes(entry.character));
    const readings = [...new Set(examples.map((item) => item.reading).filter(Boolean))].slice(0, 6);
    const example = examples[0];
    const sceneReference = example ? sceneReferences.get(example.firstSeenAt) ?? '' : '';
    const characterName = example ? speakers.get(example.firstSeenAt) ?? '' : '';
    const meaning = glosses.get(entry.character) ?? '';
    const exampleWords = examples.slice(0, 3).map((item) => (
      glosses.get(item.word) ? `${item.word} — ${glosses.get(item.word)}` : item.word
    )).join('\n');
    add({
      studyKind: 'kanji',
      word: entry.character,
      reading: readings.join(' · '),
      meaning,
      sentence: example?.sentence ?? '',
      front: entry.character,
      back: composeBack({
        meaning: [meaning, exampleWords].filter(Boolean).join('\n'),
        reading: readings.join(' · '),
        sentence: example?.sentence ?? '',
        sceneReference,
        characterName,
      }),
      frequency: entry.occurrences,
      jlptLevel: '',
      sceneReference,
      characterName,
    });
  }

  for (const grammar of analysis.grammar.slice(0, bounded(limits.grammar, VISUAL_NOVEL_CARD_DEFAULT_LIMITS.grammar))) {
    const surface = grammar.title.replace(/[～〜\s]/g, '');
    const example = analysis.sentences.find((entry) => (
      surface && entry.text.replace(/\s/g, '').includes(surface)
    )) ?? analysis.sentences[0];
    const sceneReference = example ? sceneReferences.get(example.start) ?? '' : '';
    const characterName = example ? speakers.get(example.start) ?? '' : '';
    add({
      studyKind: 'grammar',
      word: grammar.title,
      reading: '',
      meaning: grammar.meaning,
      sentence: example?.text ?? '',
      front: grammar.title,
      back: composeBack({
        meaning: [grammar.meaning, grammar.level].filter(Boolean).join(' · '),
        reading: '',
        sentence: example?.text ?? '',
        sceneReference,
        characterName,
      }),
      frequency: 1,
      jlptLevel: grammar.level,
      sceneReference,
      characterName,
    });
  }

  return drafts;
}
