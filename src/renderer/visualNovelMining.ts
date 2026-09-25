/**
 * Every path by which the Visual Novel platform puts cards in the deck.
 *
 * Two entry points:
 *   - `mineVisualNovelLine` — the reader overlay's and the panel's one-click
 *     "Mine this line";
 *   - `addVisualNovelStudyCards` — the panel's "Create study deck cards" over a
 *     whole scope of captured lines.
 *
 * The second replaces `mediaStudyWorkflow.addVisualNovelStudyFlashcards` for the
 * VN surface, because that path produced cards with no meaning (the back was
 * the example sentence plus `Frequency: 1`) and carded every kanji and grammar
 * point on screen. Here meanings come from the installed dictionaries
 * (`lookupTermsBatch`), known words AND known kanji are filtered out, kanji and
 * grammar are capped, and each card carries the speaker as its character.
 */
import type { MediaItem } from '../shared/types';
import type { VisualNovelEntry, VisualNovelTextCapture } from '../shared/visualNovel';
import {
  buildVisualNovelStudyCardDrafts,
  visualNovelStudyCardKey,
  type VisualNovelStudyCardKind,
} from '../shared/visualNovelStudyCards';
import { examSlotsForLang } from '../shared/bookLevelEstimate';
import { candidateLookupKey } from '../shared/epubEnrichment';
import { addDeckCardsTracked, loadDeck } from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';
import { getLevel, listKnownEntries } from './knownWords';
import { getSlotList } from './levelLists';
import {
  mineableVocabulary,
  MINEABLE_BELOW_LEVEL,
  type MediaStudyAnalysis,
} from './mediaStudyWorkflow';
import { getTranslateTarget } from './translateTarget';
import { mineToStudy } from './studyMining';
import { getStudyLang } from './studyEnvironment';
import { studyLangFromTag, studyLangOfText } from '../shared/studyLang';

/** The media-item shape the deck and study stores key VN cards by (`vn:<id>`). */
export function visualNovelMediaItem(entry: Pick<VisualNovelEntry, 'id' | 'title' | 'executablePath' | 'language' | 'createdAt'>): MediaItem {
  return {
    id: `vn:${entry.id}`,
    title: entry.title,
    path: entry.executablePath,
    fileName: entry.executablePath.split(/[\\/]/).pop() ?? entry.title,
    addedAt: entry.createdAt,
    kind: 'video',
    lang: entry.language,
    category: 'learning',
  };
}


/**
 * Mine one captured line as a sentence card, with its screenshot and voice clip
 * when it has them. Resolves false when the line is already in the deck.
 *
 * Goes through `mineToStudy`, the one path every surface uses, so the card is
 * deduplicated the same way and gets the same "saved" feedback. The VN surface
 * keeps its Anki hand-off in the VN study deck export, so this is a local save.
 */
export async function mineVisualNovelLine(
  entry: Pick<VisualNovelEntry, 'id' | 'title' | 'executablePath' | 'language' | 'createdAt'>,
  capture: VisualNovelTextCapture,
): Promise<boolean> {
  const item = visualNovelMediaItem(entry);
  const japanese = capture.japanese.trim();
  if (!japanese) return false;
  // Lines mined before the unified path carry no mine key; match them on the
  // same two facts the old path deduplicated on.
  if (loadDeck().some((card) => card.bookId === item.id && card.sentence === japanese)) return false;
  // The meaning is the line's translation, or nothing. The speaker and scene
  // used to be folded into it, so a line with no translation was studied with
  // the speaker's name as its "meaning". They are context and go on the card's
  // own fields for it.
  const where = [capture.chapter, capture.scene].map((part) => part?.trim()).filter(Boolean).join(' · ');
  const mined = await mineToStudy({
    word: japanese.slice(0, 80),
    meaning: capture.translation?.trim() ?? '',
    characterName: capture.speaker?.trim() || undefined,
    sceneReference: where || undefined,
    sentence: japanese,
    source: 'media',
    sourceId: item.id,
    sourceTitle: item.title,
    folder: 'Media',
    studyKind: 'sentence',
    // The game's own language when it names one, else the line's script.
    studyLang: studyLangFromTag(entry.language) ?? studyLangOfText(japanese, getStudyLang()),
    imagePath: capture.screenshotPath || undefined,
    audioPath: capture.audioPath || undefined,
  });
  return mined.created;
}

/**
 * Kanji the learner can be assumed to know: every kanji in a word they have
 * marked familiar or known, plus every kanji that already has its own card.
 * There is no separate kanji-knowledge store in the app; this derives one from
 * the two that exist rather than inventing a third.
 */
export function knownKanjiSet(): Set<string> {
  const known = new Set<string>();
  for (const { word, level } of listKnownEntries()) {
    if (level < MINEABLE_BELOW_LEVEL) continue;
    for (const char of word) if (/[\u3400-\u9fff]/u.test(char)) known.add(char);
  }
  for (const card of loadDeck()) {
    if (card.studyKind === 'kanji' && card.word) known.add(card.word);
  }
  return known;
}

/** Dictionary meanings for many words, in the learner's translation language (English fallback). */
export async function lookupGlosses(words: readonly string[]): Promise<Map<string, string>> {
  const glosses = new Map<string, string>();
  const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, 300);
  if (!unique.length || typeof window === 'undefined' || typeof window.api?.lookupTermsBatch !== 'function') {
    return glosses;
  }
  type GlossLang = 'en' | 'ja' | 'zh' | 'ru';
  const target = getTranslateTarget();
  // Glossaries exist for these four; any other target falls back to English.
  const preferred: GlossLang = target === 'ja' || target === 'zh' || target === 'ru' ? target : 'en';
  const langs: GlossLang[] = [...new Set<GlossLang>([preferred, 'en'])];
  try {
    const result = await window.api.lookupTermsBatch(unique.map((expression) => ({ expression })), langs);
    for (const word of unique) {
      const row = (result[candidateLookupKey(word)] ?? result[word]) as Partial<Record<GlossLang, string>> | undefined;
      const gloss = row ? langs.map((lang) => row[lang]).find((value) => value && value.trim()) : undefined;
      if (gloss) glosses.set(word, gloss.trim());
    }
  } catch {
    /* no dictionary installed yet: cards still carry reading and context */
  }
  return glosses;
}

function jlptLevelFor(word: string): string {
  for (const slot of examSlotsForLang('ja')) {
    const list = getSlotList(slot.id);
    if (list?.words.some((candidate) => candidate.trim() === word)) return slot.short;
  }
  return '';
}

export interface VisualNovelStudyCardResult {
  total: number;
  counts: Record<VisualNovelStudyCardKind, number>;
}

/**
 * Create deck cards from an analysis of `captures` (the scope the learner
 * picked). `analysis` must have been built from `captures` in order — sentence
 * offset `i` is capture `i`, which is how scene and speaker are recovered.
 */
export async function addVisualNovelStudyCards(
  entry: VisualNovelEntry,
  analysis: MediaStudyAnalysis,
  captures: readonly VisualNovelTextCapture[],
): Promise<VisualNovelStudyCardResult> {
  const item = visualNovelMediaItem(entry);
  const existing = new Set<string>();
  for (const card of loadDeck().filter((candidate) => candidate.bookId === item.id)) {
    if (card.studyKind) {
      existing.add(visualNovelStudyCardKey(card.studyKind, card.word, card.sentence));
    } else {
      existing.add(visualNovelStudyCardKey('vocabulary', card.word, card.sentence));
      if (card.sentence) existing.add(visualNovelStudyCardKey('sentence', card.word, card.sentence));
    }
  }
  const vocabulary = mineableVocabulary(analysis.vocabulary)
    .filter((candidate) => getLevel(candidate.word) < MINEABLE_BELOW_LEVEL);
  const sceneReferences = new Map(captures.map((capture, index) => [
    index,
    [capture.chapter, capture.scene].filter(Boolean).join(' · '),
  ]));
  const speakers = new Map(captures.flatMap((capture, index) => (
    capture.speaker ? [[index, capture.speaker] as const] : []
  )));
  const characterNames = new Set([
    ...entry.characters,
    ...captures.map((capture) => capture.speaker).filter(Boolean),
  ]);
  const knownKanji = knownKanjiSet();
  const kanjiCandidates = analysis.kanji.map((item) => item.character).filter((char) => !knownKanji.has(char));
  const glosses = await lookupGlosses([...vocabulary.map((candidate) => candidate.word), ...kanjiCandidates]);
  const drafts = buildVisualNovelStudyCardDrafts(
    { ...analysis, vocabulary },
    sceneReferences,
    existing,
    {},
    { glosses, knownKanji, speakers, characterNames },
  );
  for (const draft of drafts) {
    if (!draft.jlptLevel && (draft.studyKind === 'vocabulary' || draft.studyKind === 'kanji')) {
      draft.jlptLevel = jlptLevelFor(draft.word);
    }
  }
  const counts: VisualNovelStudyCardResult['counts'] = { vocabulary: 0, sentence: 0, kanji: 0, grammar: 0 };
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
