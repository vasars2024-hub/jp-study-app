/**
 * Game Arena results as study evidence.
 *
 * The Arena kept its own XP, streak and badges and told nothing else: a
 * session did not count as study time, an answer never reached the review log,
 * and a word got right twenty times stayed "New" while a word missed twenty
 * times stayed "Known". This routes each answer and each session into the same
 * places the rest of the app already reads:
 *
 *   - every answer → the review log (`game` rows), which also counts it into
 *     the day's practice totals;
 *   - session time → the day's study seconds in Statistics;
 *   - a word the round tested → practice credit on its deck card when there is
 *     one (the schedule is untouched; grading a DUE card is an opt-in setting,
 *     off by default), otherwise its known-word level, inferred from how long the
 *     word has been answered right without a miss, through the same interval
 *     thresholds the deck and Anki sync use. A level set by hand is never
 *     touched (`setInferredLevel` skips it).
 */
import { levelForIntervalDays } from '../../shared/anki';
import { isLocalReviewDue } from '../../shared/localSrs';
import { normalizeStudyLang } from '../../shared/studyLang';
import type { ReviewLogEntry } from '../../shared/reviewLog';
import { ankiOwnsScheduling, hasAnkiTwin } from '../ankiSchedulingOwner';
import { loadDeck, reviewDeckCard, type DeckFlashcard } from '../flashcardDeck';
import { getLevel, setInferredLevel } from '../knownWords';
import { getActiveProfile } from '../profileState';
import { appendReviewLog, loadReviewLog } from '../reviewLog';
import { recordStudyTime } from '../stats';
import type { GameRound } from './engine';
import { loadGameArenaSettings } from './settings';

const DAY_MS = 86_400_000;
/** A session longer than this was left open, not played; count at most this much. */
const MAX_SESSION_SECONDS = 60 * 60;

/**
 * Days a word has been answered right without a miss, from its game rows.
 * Zero when the latest answer was wrong or there is no right answer yet.
 */
export function correctStreakDays(rows: readonly ReviewLogEntry[], word: string): number {
  const own = rows.filter((r) => r.mode === 'game' && r.word === word).sort((a, b) => a.at - b.at);
  if (!own.length || !own[own.length - 1].correct) return 0;
  let first = own[own.length - 1].at;
  for (let i = own.length - 1; i >= 0 && own[i].correct; i -= 1) first = own[i].at;
  return Math.floor((own[own.length - 1].at - first) / DAY_MS);
}

/** The level a streak earns: New words become Learning on the first answer; the rest follows the thresholds. */
export function levelForGameStreak(streakDays: number, correct: boolean): 1 | 2 | 3 {
  if (!correct) return 1;
  return levelForIntervalDays(streakDays, getActiveProfile().deckParams.thresholds);
}

async function inferWordLevel(word: string, correct: boolean): Promise<void> {
  const rows = await loadReviewLog();
  const level = levelForGameStreak(correctStreakDays(rows, word), correct);
  const current = getLevel(word);
  // A miss lowers a word to Learning; a right answer only ever raises it.
  if (!correct ? current > 1 || current === 0 : level > current) setInferredLevel(word, level);
}

/**
 * One session's banking memory. A word answered twice in a session (Word Match deals a
 * word again, a weak word comes back) is evidence once: the first answer is banked, the
 * repeats are not, so the day's totals and the card's history never count it twice.
 */
export interface ArenaBankSession {
  banked: Set<string>;
  /**
   * The deck indexed by study language and word, read once per session on the
   * first answer — not a full deck read and scan per answer.
   */
  cards?: Map<string, DeckFlashcard>;
}

export function newArenaBankSession(): ArenaBankSession {
  return { banked: new Set() };
}

const cardKey = (studyLang: string, word: string): string => `${studyLang}\u0000${word}`;

function indexDeck(): Map<string, DeckFlashcard> {
  const index = new Map<string, DeckFlashcard>();
  for (const card of loadDeck()) {
    const key = cardKey(normalizeStudyLang(card.studyLang), card.word);
    // The first card for a word wins, as `Array.find` did.
    if (!index.has(key)) index.set(key, card);
  }
  return index;
}

function findCard(word: string, studyLang: string, session?: ArenaBankSession): DeckFlashcard | undefined {
  if (!session) return loadDeck().find((c) => c.word === word && normalizeStudyLang(c.studyLang) === studyLang);
  session.cards ??= indexDeck();
  return session.cards.get(cardKey(studyLang, word));
}

/**
 * Whether a game answer may grade this card: only with the opt-in setting, only
 * when it is due, and never a suspended card or one whose schedule Anki owns.
 */
export function gameMayGradeCard(card: DeckFlashcard, at: number, gradeDueCards: boolean): boolean {
  if (!gradeDueCards || !card.srs || card.suspended) return false;
  if (ankiOwnsScheduling() && hasAnkiTwin(card)) return false;
  return isLocalReviewDue(card.srs, at);
}

/**
 * What banking an answer did, for the post-game review:
 *   review    the card was due and the opt-in setting let the answer grade it (Good / Again);
 *   practice  practice credit (a game row in the review log, tied to the card when there is one);
 *   repeat    already banked this session, nothing written.
 */
export interface ArenaBankOutcome {
  kind: 'review' | 'practice' | 'repeat';
  word: string;
  correct: boolean;
  cardId?: string;
}

/**
 * Bank one answered round. A game answer is PRACTICE: it never moves a card's
 * schedule unless the user opted in.
 *
 * - A word with a deck card: practice credit — a `game` row that names the
 *   card, counted in the day's practice, schedule untouched. The post-game
 *   review offers "Review now" for a missed card instead.
 * - Opt-in (`gradeDueCards`, off by default) and the card is DUE, not suspended
 *   and not Anki-owned: the answer grades it (Good / Again) through the deck's
 *   own path, which writes the one review row — tagged `source: 'game'` so FSRS
 *   training and true retention leave it out — and no extra `game` row.
 * - A word with no card: practice row plus known-word inference from its streak.
 * - Any word already banked in this `session`: nothing (see `ArenaBankSession`).
 */
export function bankArenaAnswer(
  round: Pick<GameRound, 'word' | 'jp' | 'studyLang'>,
  correct: boolean,
  at = Date.now(),
  session?: ArenaBankSession,
): ArenaBankOutcome {
  const word = round.word;
  const key = (word ?? round.jp).slice(0, 120);
  const card = word ? findCard(word, round.studyLang, session) : undefined;
  if (session?.banked.has(key)) {
    return { kind: 'repeat', word: key, correct, ...(card ? { cardId: card.id } : {}) };
  }
  session?.banked.add(key);
  if (card && gameMayGradeCard(card, at, loadGameArenaSettings().gradeDueCards)) {
    reviewDeckCard(card.id, correct ? 'good' : 'again', at, { source: 'game' });
    return { kind: 'review', word: key, correct, cardId: card.id };
  }
  appendReviewLog({ mode: 'game', word: key, correct, at, ...(card ? { cardId: card.id } : {}) });
  if (word && !card) void inferWordLevel(word, correct).catch(() => undefined);
  return { kind: 'practice', word: key, correct, ...(card ? { cardId: card.id } : {}) };
}

/**
 * Word Match: each pair is its own answer about its own word, so a board with one wrong
 * pair is three right answers and one miss — not one miss for four words.
 */
export function bankArenaPairs(
  studyLang: GameRound['studyLang'],
  pairs: readonly { jp: string; correct: boolean }[],
  at = Date.now(),
  session?: ArenaBankSession,
): ArenaBankOutcome[] {
  return pairs.map((pair) => bankArenaAnswer({ word: pair.jp, jp: pair.jp, studyLang }, pair.correct, at, session));
}

/** Bank a finished session's time as study time. */
export function bankArenaSession(startedAt: number, endedAt = Date.now()): number {
  const seconds = Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.round((endedAt - startedAt) / 1000)));
  if (seconds > 0) recordStudyTime(seconds, endedAt);
  return seconds;
}
