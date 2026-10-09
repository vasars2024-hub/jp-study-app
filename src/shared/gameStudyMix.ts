/**
 * What the Game Arena teaches, decided in one pure place.
 *
 * The games used to draw any word from the deck at random, so a session was as likely to
 * drill a word known for a year as one failed this morning, and nothing tied a game to what
 * the learner actually had to study. This module answers four questions the Arena asks:
 *
 *   - **Where does a word stand?** (`studyWordStatus`) — due now, still being learned, known,
 *     or new — from the card's own schedule, else its known-word level.
 *   - **Which items should a session deal?** (`studyMixSlots`, `iPlusOneScore`) — i+1: mostly
 *     words the learner knows, with a few due or learning ones in every session, and sentence
 *     rounds whose other words are already known so the one gap is the thing being learned.
 *   - **How hard should it be?** (`adaptiveTuning`) — recent accuracy in this game moves the
 *     level, the share of learning words, and the time per round.
 *   - **What is today's warm-up?** (`pickWarmUp`) — the game that best fits what is due.
 *
 * Pure: plain data in, plain decisions out.
 */

export type StudyWordStatus = 'due' | 'learning' | 'known' | 'new';

/** The schedule fields read here (a `LocalSrsState` subset). */
export interface StudyMixSchedule {
  dueAt?: number;
  intervalDays?: number;
  repetitions?: number;
}

/** Days of interval from which a scheduled word counts as known for i+1 purposes. */
export const KNOWN_INTERVAL_DAYS = 7;

/**
 * Where a word stands. A scheduled card is due when its time has come; otherwise it is
 * learning until its interval reaches a week. A word with no schedule falls back to its
 * known-word level (2 = familiar, 3 = known), then to "new".
 */
export function studyWordStatus(
  srs: StudyMixSchedule | null | undefined,
  knownLevel: number,
  now: number,
): StudyWordStatus {
  if (srs && Number.isFinite(srs.dueAt)) {
    if ((srs.dueAt as number) <= now) return 'due';
    const interval = Number(srs.intervalDays) || 0;
    return interval >= KNOWN_INTERVAL_DAYS ? 'known' : 'learning';
  }
  if (knownLevel >= 2) return 'known';
  if (knownLevel === 1) return 'learning';
  return 'new';
}

/** Due and learning words are what a session is for; known ones are the context around them. */
export function isStudyTarget(status: StudyWordStatus): boolean {
  return status === 'due' || status === 'learning';
}

/**
 * Which rounds of a session deal a target (due / learning) word: about one in `every`,
 * spread evenly from the first round, never zero when the session has any targets.
 * With no known words to surround them, every round is a target round.
 */
export function studyMixSlots(rounds: number, every: number, haveTargets: boolean, haveKnown: boolean): boolean[] {
  const n = Math.max(0, Math.floor(rounds));
  if (!haveTargets) return Array.from({ length: n }, () => false);
  if (!haveKnown) return Array.from({ length: n }, () => true);
  const step = Math.max(1, Math.floor(every));
  return Array.from({ length: n }, (_, i) => i % step === 0);
}

/**
 * How well a sentence suits an i+1 round, given how many of its words besides the answer
 * the learner does not know yet: 0 unknown is ideal, 1 is acceptable, more is noise.
 * Higher is better; never negative.
 */
export function iPlusOneScore(unknownOthers: number): number {
  const n = Math.max(0, Math.floor(unknownOthers));
  return n === 0 ? 3 : n === 1 ? 2 : n === 2 ? 1 : 0;
}

export interface RecentGameResult {
  gameId: string;
  accuracy: number;
  createdAt: number;
}

export interface AdaptiveTuning {
  /** Added to the learner's level for this session (-1, 0 or +1). */
  levelDelta: -1 | 0 | 1;
  /** One round in this many deals a due / learning word. */
  targetEvery: number;
  /** Seconds the timer gives each round. */
  secondsPerRound: number;
  /** Why, for the Arena's one-line note; null when nothing moved. */
  reason: 'up' | 'down' | null;
}

export const DEFAULT_TUNING: AdaptiveTuning = { levelDelta: 0, targetEvery: 3, secondsPerRound: 12, reason: null };

/**
 * From the last three sessions of this game: all at 90 % or better steps up (a level, more
 * learning words, a little less time); an average at or under 55 % steps down (a level,
 * fewer learning words, more time). Fewer than two sessions is too little to judge.
 */
export function adaptiveTuning(recent: readonly RecentGameResult[], gameId: string): AdaptiveTuning {
  const own = recent
    .filter((entry) => entry.gameId === gameId && Number.isFinite(entry.accuracy))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);
  if (own.length < 2) return DEFAULT_TUNING;
  const average = own.reduce((sum, entry) => sum + entry.accuracy, 0) / own.length;
  if (own.every((entry) => entry.accuracy >= 0.9)) {
    return { levelDelta: 1, targetEvery: 2, secondsPerRound: 10, reason: 'up' };
  }
  if (average <= 0.55) return { levelDelta: -1, targetEvery: 4, secondsPerRound: 16, reason: 'down' };
  return DEFAULT_TUNING;
}

export interface WarmUpInput {
  studyLang: 'ja' | 'zh' | 'ru';
  /** Due or learning cards that carry a sentence the word can be blanked out of. */
  dueCloze: number;
  /** Due or learning cards whose reading the game can check. */
  dueReadable: number;
  /** Due or learning cards with a usable meaning. */
  dueVocab: number;
  /** Total cards in the deck for this language. */
  deckCards: number;
  /** A voice or card audio exists, so a listening round can be heard. */
  canListen: boolean;
}

export interface WarmUpPick {
  gameId: 'cloze-blitz' | 'listening-flash' | 'kanji-reading' | 'reverse-recall' | 'word-match' | 'kana-sprint' | 'sentence-builder';
  /** `due` draws from due and learning cards; `auto` is the usual mix. */
  material: 'due' | 'auto';
  rounds: number;
  /** Why this game, for the card's one line. */
  reason: 'due-sentences' | 'due-listening' | 'due-readings' | 'due-words' | 'learning-pairs' | 'starter';
}

export const WARM_UP_ROUNDS = 5;

export interface ArenaProgressInput {
  xp: number;
  streak: number;
  lastPlayedDay?: string;
  recent: readonly { gameId: string; score: number; accuracy: number; createdAt: number }[];
  highScores: readonly { gameId: string; score: number; accuracy: number; level: number }[];
}

export interface ArenaProgressSummary {
  xp: number;
  /** The play streak as it stands today: a streak whose last day is before yesterday is over. */
  streak: number;
  sessionsThisWeek: number;
  /** Mean accuracy of the last ten sessions, 0..1, or null with none. */
  recentAccuracy: number | null;
  /** The last five sessions against the five before: better, worse, or about the same. */
  trend: 'up' | 'down' | 'flat' | null;
  /** Best score per game, highest first. */
  best: { gameId: string; score: number; accuracy: number; level: number }[];
}

function localKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The Arena's progress as Statistics shows it. */
export function summarizeArenaProgress(input: ArenaProgressInput, now = new Date()): ArenaProgressSummary {
  const today = localKey(now);
  const yesterday = localKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = input.lastPlayedDay === today || input.lastPlayedDay === yesterday ? Math.max(0, input.streak) : 0;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const recent = [...input.recent].sort((a, b) => b.createdAt - a.createdAt);
  const mean = (rows: typeof recent): number | null =>
    rows.length ? rows.reduce((sum, row) => sum + (Number.isFinite(row.accuracy) ? row.accuracy : 0), 0) / rows.length : null;
  const last5 = mean(recent.slice(0, 5));
  const prev5 = mean(recent.slice(5, 10));
  const trend = last5 === null || prev5 === null ? null : last5 - prev5 > 0.05 ? 'up' : prev5 - last5 > 0.05 ? 'down' : 'flat';
  const bestByGame = new Map<string, ArenaProgressSummary['best'][number]>();
  for (const entry of input.highScores) {
    const kept = bestByGame.get(entry.gameId);
    if (!kept || entry.score > kept.score) bestByGame.set(entry.gameId, { ...entry });
  }
  return {
    xp: Math.max(0, input.xp),
    streak,
    sessionsThisWeek: recent.filter((row) => row.createdAt >= weekStart).length,
    recentAccuracy: mean(recent.slice(0, 10)),
    trend,
    best: [...bestByGame.values()].sort((a, b) => b.score - a.score),
  };
}

/**
 * Today's warm-up: the game that best exercises what is due. Sentences first (recall in
 * context), then readings, then meanings; a learner with nothing due but a deck still gets
 * a short pairing round, and an empty deck gets the starter for the language.
 */
export function pickWarmUp(input: WarmUpInput, dayOfYear = 0): WarmUpPick {
  const rounds = WARM_UP_ROUNDS;
  if (input.dueCloze >= 3) {
    // Alternate listening in on even days when it can be heard, so the ear gets practice too.
    if (input.canListen && dayOfYear % 2 === 0) {
      return { gameId: 'listening-flash', material: 'due', rounds, reason: 'due-listening' };
    }
    return { gameId: 'cloze-blitz', material: 'due', rounds, reason: 'due-sentences' };
  }
  if (input.dueReadable >= 3) return { gameId: 'kanji-reading', material: 'due', rounds, reason: 'due-readings' };
  if (input.dueVocab >= 3) return { gameId: 'reverse-recall', material: 'due', rounds, reason: 'due-words' };
  if (input.deckCards >= 4) return { gameId: 'word-match', material: 'auto', rounds, reason: 'learning-pairs' };
  return {
    gameId: input.studyLang === 'ja' ? 'kana-sprint' : 'sentence-builder',
    material: 'auto',
    rounds,
    reason: 'starter',
  };
}
