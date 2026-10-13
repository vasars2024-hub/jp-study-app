/**
 * Spaced review for grammar points.
 *
 * Grammar had a four-band familiarity counter and no schedule: nothing ever
 * came back on its own, so a pattern learned in March was either re-drilled by
 * hand or forgotten. This gives each studied point a real schedule, computed by
 * the SAME scheduler the flashcard deck uses (`scheduleReview`, honouring the
 * user's SM-2 / FSRS choice and interval ceiling) rather than a second opinion.
 *
 * What feeds it:
 *   - a grammar practice-test answer on a point that is due or not yet
 *     scheduled (right → Good, wrong → Again); answers on a point that is not
 *     due are practice only (`recordTestAnswer`);
 *   - the recently-missed points from session history, which enter as due now;
 *   - ratings given on the Review tab itself.
 *
 * Familiarity stays as it is — it is the coarse "how well do I know this"
 * label the filters use; this is only "when should I see it next".
 */
import { LOCAL_SRS_DEFAULT_EASE, type LocalSrsRating, type LocalSrsState } from '../shared/localSrs';
import { migrateSrsState, scheduleReview, type SchedulingConfig } from '../shared/flashcardScheduling';
import { loadSchedulingConfig } from './flashcardScheduling';
import { writeLocalStorageJson } from './localStorageWrite';
import type { AnswerGrade } from './grammarFamiliarity';

export const GRAMMAR_SRS_KEY = 'jp-grammar-srs-v1';
const CHANGED_EVENT = 'grammar-srs-changed';

export type GrammarSrsState = Readonly<Record<string, LocalSrsState>>;

export function parseGrammarSrs(raw: string | null): Record<string, LocalSrsState> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, LocalSrsState> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const state = migrateSrsState(value);
      if (state) out[id] = state;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadGrammarSrs(): Record<string, LocalSrsState> {
  try {
    return parseGrammarSrs(localStorage.getItem(GRAMMAR_SRS_KEY));
  } catch {
    return {};
  }
}

export function saveGrammarSrs(state: GrammarSrsState): void {
  writeLocalStorageJson(GRAMMAR_SRS_KEY, state);
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* non-browser context */
  }
}

export function onGrammarSrsChanged(callback: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, callback);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === GRAMMAR_SRS_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

/** Schedule one review of one point. Pure: returns the next state. */
export function reviewGrammarPoint(
  state: GrammarSrsState,
  id: string,
  rating: LocalSrsRating,
  config: SchedulingConfig = loadSchedulingConfig(),
  now = Date.now(),
): Record<string, LocalSrsState> {
  if (!id) return { ...state };
  return { ...state, [id]: scheduleReview(schedulerPrior(state[id]), rating, config, now) };
}

/**
 * Whether a stored state is a placeholder for a point that has never been
 * reviewed: what `enrolGrammarPoints` and `seedMissed` write so the point has a
 * due date. The scheduler must see such a point as the new card it is (no state
 * at all, which is how a flashcard is new), not as a zero-day interval.
 *
 * "Zero repetitions and a zero-day interval" alone is NOT that: a card inside
 * its learning or relearning steps looks exactly the same, and reading it as new
 * erased its lapse and ease penalty (SM-2), reset its memory model (FSRS) and
 * kept a "1m 10m" card on its last step forever. So a placeholder also has no
 * step state, no FSRS memory (every FSRS review writes one) and the default
 * ease (an SM-2 Again always lowers it).
 */
export function isUnreviewedGrammarState(state: LocalSrsState | undefined): boolean {
  if (!state) return true;
  return (
    state.phase === undefined &&
    state.step === undefined &&
    state.stability === undefined &&
    state.difficulty === undefined &&
    state.repetitions === 0 &&
    state.intervalDays === 0 &&
    state.ease === LOCAL_SRS_DEFAULT_EASE
  );
}

/** What the scheduler is handed for a point: nothing for a never-reviewed placeholder. */
export function schedulerPrior(state: LocalSrsState | undefined): LocalSrsState | undefined {
  return isUnreviewedGrammarState(state) ? undefined : state;
}

/** Due at `now`, or not scheduled at all. */
export function isGrammarPointDueOrUnscheduled(state: GrammarSrsState, id: string, now = Date.now()): boolean {
  const current = state[id];
  return !current || current.dueAt <= now;
}

/**
 * A practice-test answer as a schedule step, but only for a point the schedule
 * is asking about (due) or does not know yet (unscheduled). An answer on a
 * point that is not due is practice only: writing every answer used to push a
 * brand-new point to an 8-day interval after three Goods inside one sitting.
 * Returns `state` itself when nothing is written.
 */
export function recordTestAnswer(
  state: GrammarSrsState,
  id: string,
  rating: LocalSrsRating,
  config: SchedulingConfig = loadSchedulingConfig(),
  now = Date.now(),
): GrammarSrsState {
  if (!id || !isGrammarPointDueOrUnscheduled(state, id, now)) return state;
  return reviewGrammarPoint(state, id, rating, config, now);
}

/**
 * Put one point's schedule back as it was before a rating (`undefined`: it had
 * none). The Review tab's one-step Undo.
 */
export function restoreGrammarPoint(
  state: GrammarSrsState,
  id: string,
  previous: LocalSrsState | undefined,
): Record<string, LocalSrsState> {
  const next: Record<string, LocalSrsState> = { ...state };
  if (previous) next[id] = previous;
  else delete next[id];
  return next;
}

/**
 * A practice-test answer as a scheduler rating. The test's self-grade has three
 * steps; "hard" is the one that counts as wrong everywhere else (session
 * history, review log), so it is Again here too.
 */
export function ratingForTestAnswer(grade: AnswerGrade): LocalSrsRating {
  if (grade === 'hard') return 'again';
  if (grade === 'okay') return 'hard';
  return 'good';
}

/**
 * Put points missed in recent practice sessions into the schedule as due now,
 * unless they already have a schedule of their own. A point that was missed and
 * then reviewed keeps the schedule its review gave it.
 */
export function seedMissed(
  state: GrammarSrsState,
  missedIds: readonly string[],
  now = Date.now(),
): Record<string, LocalSrsState> {
  const next: Record<string, LocalSrsState> = { ...state };
  for (const id of missedIds) {
    if (!id || next[id]) continue;
    next[id] = {
      version: 2,
      dueAt: now,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 1,
      lastReviewedAt: now,
      lastRating: 'again',
    };
  }
  return next;
}

/** Add points (e.g. the study queue) to the schedule as new cards due now. */
export function enrolGrammarPoints(
  state: GrammarSrsState,
  ids: readonly string[],
  now = Date.now(),
): Record<string, LocalSrsState> {
  const next: Record<string, LocalSrsState> = { ...state };
  for (const id of ids) {
    if (!id || next[id]) continue;
    next[id] = {
      version: 2,
      dueAt: now,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: now,
      lastRating: 'good',
    };
  }
  return next;
}

/** Ids due at `now`, most overdue first. `known` limits to points that still exist. */
export function dueGrammarIds(
  state: GrammarSrsState,
  now = Date.now(),
  known?: ReadonlySet<string>,
): string[] {
  return Object.entries(state)
    .filter(([id, s]) => s.dueAt <= now && (!known || known.has(id)))
    .sort((a, b) => a[1].dueAt - b[1].dueAt || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** When the next point falls due after `now`, or null when none is scheduled. */
export function nextGrammarDueAt(state: GrammarSrsState, now = Date.now()): number | null {
  let next: number | null = null;
  for (const s of Object.values(state)) {
    if (s.dueAt > now && (next === null || s.dueAt < next)) next = s.dueAt;
  }
  return next;
}
