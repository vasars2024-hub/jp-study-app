/**
 * Surfaces that used to write the deck (or Anki) directly, routed through the
 * one mining path. `mineToStudy` owns the duplicate check, the Anki half and the
 * queue, so a grammar point, an AI studio card, a reader-collection word or an
 * agent-created card mined twice finds the card it already made instead of
 * adding a second one.
 *
 * Each helper keeps its surface's own payload (field mapping, deck override,
 * front/back text); only the write goes through `mineToStudy`.
 */

import { mineToStudy, type MineToStudyInput, type MineToStudyResult } from './studyMining';
import { updateDeckCard, type DeckFlashcard } from './flashcardDeck';
import { normalizeStudyLang, studyLangOfText, type StudyLang } from '../shared/studyLang';
import { getStudyLang } from './studyEnvironment';
import type { MineNoteRequest, MineNoteResult } from '../shared/anki';
import { bookLocationRef } from '../shared/bookLocation';

/** Front/back text a surface wrote itself: kept on the card `mineToStudy` made. */
function keepFrontBack(result: MineToStudyResult, front?: string, back?: string): void {
  if (!result.created || (front === undefined && back === undefined)) return;
  const patch: Partial<Pick<DeckFlashcard, 'front' | 'back'>> = {};
  if (front !== undefined) patch.front = front;
  if (back !== undefined) patch.back = back;
  updateDeckCard(result.card.id, patch);
}

// ---------------------------------------------------------------------------
// Grammar (Explorer, Practice, Test)

export interface GrammarMinePoint {
  title: string;
  meaning: string;
  structure?: string;
  examples: ReadonlyArray<{ jp?: string }>;
  lang?: unknown;
}

function grammarBack(point: GrammarMinePoint): string {
  return `${point.meaning}${point.structure ? `\n${point.structure}` : ''}`;
}

export function grammarStudyInput(
  point: GrammarMinePoint,
  folder: string,
  anki?: MineNoteRequest,
): MineToStudyInput {
  return {
    word: point.title,
    reading: '',
    meaning: point.meaning,
    sentence: point.examples[0]?.jp || undefined,
    source: 'import',
    folder,
    // A grammar card is not evidence about one word: without the kind its
    // review wrote "〜てしまう" into the known-words store.
    studyKind: 'grammar',
    studyLang: normalizeStudyLang(point.lang),
    notify: false,
    ...(anki ? { anki } : {}),
  };
}

/** "Add to deck" from the grammar surfaces: local cards only, one per point. */
export async function mineGrammarPoints(
  points: readonly GrammarMinePoint[],
  folder: string,
): Promise<MineToStudyResult[]> {
  const results: MineToStudyResult[] = [];
  for (const point of points) {
    const result = await mineToStudy(grammarStudyInput(point, folder));
    keepFrontBack(result, point.title, grammarBack(point));
    results.push(result);
  }
  return results;
}

/** Grammar Practice "Export to Anki": the same note as before, plus the local card. */
export async function exportGrammarPointsToAnki(
  points: readonly GrammarMinePoint[],
  folder: string,
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (const point of points) {
    try {
      const result = await mineToStudy(grammarStudyInput(point, folder, {
        route: { source: 'other', cardKind: 'word', language: normalizeStudyLang(point.lang) },
        term: point.title,
        meaning: point.meaning,
        sentence: point.examples[0]?.jp,
        translation: point.structure,
      }));
      keepFrontBack(result, point.title, grammarBack(point));
      if (result.anki === 'added' || result.anki === 'duplicate') ok += 1;
      else fail += 1;
    } catch {
      fail += 1;
    }
  }
  return { ok, fail };
}

// ---------------------------------------------------------------------------
// AI Card Studio

/**
 * The AI studio sends each generated card (several per expression) to Anki as a
 * prebuilt note; the local mirror goes through `mineToStudy` with that answer,
 * so a re-sent batch finds the card it already made.
 */
export async function mirrorAiStudioCard(input: {
  expression: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  front: string;
  back: string;
  deckLabel: string;
  ankiResult: MineNoteResult;
}): Promise<MineToStudyResult> {
  const result = await mineToStudy({
    word: input.expression,
    reading: input.reading || '',
    meaning: input.meaning || '',
    sentence: input.sentence || undefined,
    source: 'epub-ai',
    sourceTitle: input.deckLabel,
    studyLang: studyLangOfText(`${input.expression} ${input.sentence ?? ''}`, getStudyLang()),
    ankiResult: input.ankiResult,
    notify: false,
  });
  keepFrontBack(result, input.front, input.back);
  return result;
}

// ---------------------------------------------------------------------------
// Reader collection (novel reader inbox)

export interface ReaderCollectionMine {
  front: string;
  back: string;
  reading: string;
  sentence?: string;
  bookId?: string;
  bookTitle?: string;
  /** The reader's locator where it was mined (`bookRoundTrip.ts`); kept on the card's `sourceRef`. */
  position?: string;
  percent?: number;
  studyLang: StudyLang;
  /** Set when "auto-send to Anki" is on: the note goes to this deck (or the profile default). */
  ankiDeck?: string;
  sendToAnki: boolean;
}

export function readerCollectionStudyInput(input: ReaderCollectionMine): MineToStudyInput {
  const sentence = input.sentence?.trim() || undefined;
  // `sourceRef`, never `sourceUrl`: the URL is part of the dedupe key, and a
  // word mined on two pages of the same book is still one card.
  const sourceRef = input.bookId && input.position
    ? bookLocationRef(input.bookId, input.position, input.percent, sentence)
    : undefined;
  return {
    word: input.front,
    reading: input.reading,
    meaning: input.back,
    sentence,
    source: 'epub',
    ...(input.bookId ? { sourceId: input.bookId } : {}),
    ...(input.bookTitle ? { sourceTitle: input.bookTitle } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    studyLang: input.studyLang,
    notify: false,
    ...(input.sendToAnki
      ? {
          anki: {
            route: { source: 'reader', cardKind: sentence ? 'sentence' : 'word', language: input.studyLang },
            term: input.front,
            reading: input.reading || undefined,
            meaning: input.back || undefined,
            sentence,
            ...(input.ankiDeck ? { deckName: input.ankiDeck } : {}),
          } satisfies MineNoteRequest,
        }
      : {}),
  };
}

export async function mineReaderCollectionCard(input: ReaderCollectionMine): Promise<MineToStudyResult> {
  const result = await mineToStudy(readerCollectionStudyInput(input));
  keepFrontBack(result, input.front, input.back);
  if (input.sendToAnki && input.ankiDeck && (result.anki === 'added' || result.anki === 'duplicate')) {
    updateDeckCard(result.card.id, { ankiDeck: input.ankiDeck });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Agent "flashcard.add-cards"

export interface AgentCardDraft {
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  folder?: string;
}

export async function mineAgentCards(cards: readonly AgentCardDraft[]): Promise<MineToStudyResult[]> {
  const results: MineToStudyResult[] = [];
  for (const card of cards) {
    results.push(await mineToStudy({
      word: card.word,
      reading: card.reading,
      meaning: card.meaning,
      sentence: card.sentence || undefined,
      // `import` is the existing provenance for a row the user did not type by hand.
      source: 'import',
      ...(card.folder ? { folder: card.folder } : {}),
      studyLang: studyLangOfText(`${card.word} ${card.sentence ?? ''}`, getStudyLang()),
      notify: false,
    }));
  }
  return results;
}
