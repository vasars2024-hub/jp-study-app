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
 *   - a word the round tested → its deck card when there is one (a miss sends
 *     the card back to relearning; a right answer on a due card counts as a
 *     Good review), otherwise its known-word level, inferred from how long the
 *     word has been answered right without a miss, through the same interval
 *     thresholds the deck and Anki sync use. A level set by hand is never
 *     touched (`setInferredLevel` skips it).
 */
import { levelForIntervalDays } from '../../shared/anki';
import { isLocalReviewDue } from '../../shared/localSrs';
import { normalizeStudyLang } from '../../shared/studyLang';
import type { StudyLang } from '../../shared/levelScale';
import type { ReviewLogEntry } from '../../shared/reviewLog';
import { loadDeck, reviewDeckCard } from '../flashcardDeck';
import { getLevel, setInferredLevel } from '../knownWords';
import { getActiveProfile } from '../profileState';
import { appendReviewLog, loadReviewLog } from '../reviewLog';
import { recordStudyTime } from '../stats';
import type { GameRound } from './engine';

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

async function feedWord(word: string, lang: StudyLang, correct: boolean, at: number): Promise<void> {
  const card = loadDeck().find((c) => c.word === word && normalizeStudyLang(c.studyLang) === lang);
  if (card) {
    // The deck's own review path does the scheduling, the review row and the
    // known-word inference, so a game answer means the same thing there.
    if (!correct) reviewDeckCard(card.id, 'again', at);
    else if (card.srs && isLocalReviewDue(card.srs, at)) reviewDeckCard(card.id, 'good', at);
    return;
  }
  const rows = await loadReviewLog();
  const level = levelForGameStreak(correctStreakDays(rows, word), correct);
  const current = getLevel(word);
  // A miss lowers a word to Learning; a right answer only ever raises it.
  if (!correct ? current > 1 || current === 0 : level > current) setInferredLevel(word, level);
}

/** Bank one answered round. */
export function bankArenaAnswer(round: GameRound, correct: boolean, at = Date.now()): void {
  appendReviewLog({ mode: 'game', word: (round.word ?? round.jp).slice(0, 120), correct, at });
  if (round.word) void feedWord(round.word, round.studyLang, correct, at).catch(() => undefined);
}

/** Bank a finished session's time as study time. */
export function bankArenaSession(startedAt: number, endedAt = Date.now()): number {
  const seconds = Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.round((endedAt - startedAt) / 1000)));
  if (seconds > 0) recordStudyTime(seconds, endedAt);
  return seconds;
}
