export interface MediaStudyCueInput {
  start: number;
  end: number;
  text: string;
}

export interface MediaStudyTokenInput {
  surface: string;
  lemma: string;
  content: boolean;
  proper?: boolean;
  reading?: string;
}

export interface MediaStudySentence {
  start: number;
  end: number;
  text: string;
}

export interface MediaStudyVocabularyEntry {
  word: string;
  surface: string;
  reading: string;
  occurrences: number;
  sentence: string;
  firstSeenAt: number;
  proper?: boolean;
}

export interface MediaStudyKanjiEntry {
  character: string;
  occurrences: number;
}

export interface MediaStudyCorpus {
  text: string;
  sentences: MediaStudySentence[];
  vocabulary: MediaStudyVocabularyEntry[];
  kanji: MediaStudyKanjiEntry[];
  truncated: boolean;
}

export interface MediaStudyExtractionOptions {
  maxCues?: number;
  maxCharacters?: number;
  includeProperNouns?: boolean;
  /** The subtitles' language. Japanese when omitted (the corpus predates the others). */
  lang?: 'ja' | 'zh' | 'ru';
}

export interface MediaStudyFlashcardDraft {
  word: string;
  reading: string;
  sentence: string;
  front: string;
  back: string;
}

const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff々]/;
const KANJI_RE = /[\u3400-\u9fff\uf900-\ufaff々]/g;

/** A line (and a word) in the study language: kana/kanji, hanzi, or Cyrillic. */
const STUDY_TEXT_RE: Readonly<Record<'ja' | 'zh' | 'ru', RegExp>> = {
  ja: JAPANESE_TEXT_RE,
  zh: /[\u3400-\u9fff\uf900-\ufaff]/,
  ru: /[\u0400-\u04ff]/,
};

function normalizeSentence(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Builds a bounded, deterministic study corpus from subtitle cues.
 * Tokenization is injected so the pure extraction and ranking can be tested.
 */
export function buildMediaStudyCorpus(
  cues: readonly MediaStudyCueInput[],
  tokenize: (text: string) => readonly MediaStudyTokenInput[],
  options: MediaStudyExtractionOptions = {},
): MediaStudyCorpus {
  const maxCues = Math.max(1, Math.floor(options.maxCues ?? 800));
  const maxCharacters = Math.max(1, Math.floor(options.maxCharacters ?? 60_000));
  const lang = options.lang ?? 'ja';
  const studyText = STUDY_TEXT_RE[lang];
  const sentences: MediaStudySentence[] = [];
  const vocabulary = new Map<string, MediaStudyVocabularyEntry>();
  const kanjiCounts = new Map<string, number>();
  let characters = 0;
  let truncated = false;

  for (const cue of cues) {
    if (sentences.length >= maxCues || characters >= maxCharacters) {
      truncated = true;
      break;
    }
    const normalized = normalizeSentence(cue.text);
    if (!normalized || !studyText.test(normalized)) continue;
    const remaining = maxCharacters - characters;
    const text = normalized.slice(0, remaining);
    if (!text) {
      truncated = true;
      break;
    }
    if (text.length < normalized.length) truncated = true;
    characters += text.length;
    sentences.push({
      start: Number.isFinite(cue.start) ? Math.max(0, cue.start) : 0,
      end: Number.isFinite(cue.end) ? Math.max(0, cue.end) : 0,
      text,
    });

    // Kanji / hanzi; a Russian corpus has none to count.
    for (const character of lang === 'ru' ? [] : text.match(KANJI_RE) ?? []) {
      kanjiCounts.set(character, (kanjiCounts.get(character) ?? 0) + 1);
    }

    for (const token of tokenize(text)) {
      if (!token.content || (token.proper && !options.includeProperNouns)) continue;
      const word = (token.lemma || token.surface).trim();
      if (!word || !studyText.test(word)) continue;
      const existing = vocabulary.get(word);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.reading && token.reading) existing.reading = token.reading;
        continue;
      }
      vocabulary.set(word, {
        word,
        surface: token.surface.trim() || word,
        reading: token.reading?.trim() ?? '',
        occurrences: 1,
        sentence: text,
        firstSeenAt: Number.isFinite(cue.start) ? Math.max(0, cue.start) : 0,
        proper: token.proper === true,
      });
    }
  }

  const rankedVocabulary = [...vocabulary.values()].sort(
    (a, b) => b.occurrences - a.occurrences
      || a.firstSeenAt - b.firstSeenAt
      || a.word.localeCompare(b.word, lang),
  );
  const rankedKanji = [...kanjiCounts.entries()]
    .map(([character, occurrences]) => ({ character, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences || a.character.localeCompare(b.character, lang));

  return {
    text: sentences.map((sentence) => sentence.text).join('\n'),
    sentences,
    vocabulary: rankedVocabulary,
    kanji: rankedKanji,
    truncated,
  };
}

export function buildMediaStudyFlashcardDrafts(
  vocabulary: readonly MediaStudyVocabularyEntry[],
  options: { limit?: number; excludeWords?: ReadonlySet<string> } = {},
): MediaStudyFlashcardDraft[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 30));
  const excluded = options.excludeWords ?? new Set<string>();
  const drafts: MediaStudyFlashcardDraft[] = [];
  for (const entry of vocabulary) {
    if (drafts.length >= limit) break;
    if (excluded.has(entry.word)) continue;
    const reading = entry.reading.trim();
    drafts.push({
      word: entry.word,
      reading,
      sentence: entry.sentence,
      front: entry.word,
      back: [reading, entry.sentence].filter(Boolean).join('\n\n'),
    });
  }
  return drafts;
}
