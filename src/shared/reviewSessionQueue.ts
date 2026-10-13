/**
 * Which card a review sitting shows next once same-day steps exist.
 *
 * Before steps, a sitting was two lists — still to answer, and answered — and
 * the next card was simply the first unanswered one. A card inside its steps
 * changes that: it is unanswered, but it is not due until its step has passed,
 * and when it IS due it should come back promptly rather than after every
 * other card in the sitting (a "1 minute" step that returns forty cards later
 * is not a one-minute step).
 *
 * The rule, Anki's in miniature:
 *
 * 1. A step card whose due time has arrived comes first, earliest due first.
 * 2. Otherwise the first unanswered card that is not waiting on a step, in the
 *    sitting's own order.
 * 3. Otherwise only step cards are left and none is due yet: the one due
 *    soonest is shown early, but only when it is due within the learn-ahead
 *    limit (Anki's "learn ahead limit", 20 minutes by default). A step due
 *    later than that is not shown early: a "1 day" or "3 hour" step answered
 *    after ten seconds was no step at all. The sitting then waits
 *    (`nextStepWait`) instead of skipping it.
 */
import { DEFAULT_LEARN_AHEAD_MINUTES } from './flashcardScheduling';
import { isInSteps, type SrsPhase } from './learningSteps';

const MINUTE_MS = 60_000;

export interface SessionQueueCard {
  id: string;
  srs?: { dueAt: number; phase?: SrsPhase } | null;
}

function learnAheadMs(minutes: number | undefined): number {
  const m = minutes === undefined ? DEFAULT_LEARN_AHEAD_MINUTES : Number(minutes);
  return Number.isFinite(m) && m > 0 ? m * MINUTE_MS : 0;
}

/**
 * The one "is this card due for the queue" rule, shared by the review queue,
 * its counts and the per-deck Due in Statistics: an unscheduled card is due
 * (the new-card budget is applied separately), a card in its steps is due
 * within the learn-ahead limit (Anki counts those in "Learning"), and any
 * other card when its due time has passed.
 */
export function isQueueDue(
  srs: { dueAt?: unknown; phase?: unknown } | null | undefined,
  now: number,
  learnAheadMinutes?: number,
): boolean {
  if (!srs || typeof srs !== 'object') return true;
  const due = srs.dueAt;
  if (typeof due !== 'number' || !Number.isFinite(due)) return true;
  if (isInSteps(srs as { phase?: SrsPhase })) return due <= now + learnAheadMs(learnAheadMinutes);
  return due <= now;
}

export function nextSessionCardId(
  cards: readonly SessionQueueCard[],
  answered: ReadonlySet<string>,
  now: number,
  learnAheadMinutes: number = DEFAULT_LEARN_AHEAD_MINUTES,
): string | null {
  let dueStep: SessionQueueCard | null = null;
  let firstFresh: SessionQueueCard | null = null;
  let soonestStep: SessionQueueCard | null = null;
  for (const card of cards) {
    if (answered.has(card.id)) continue;
    if (card.srs && isInSteps(card.srs)) {
      const due = card.srs.dueAt;
      if (due <= now && (!dueStep || due < (dueStep.srs?.dueAt ?? 0))) dueStep = card;
      if (!soonestStep || due < (soonestStep.srs?.dueAt ?? 0)) soonestStep = card;
    } else if (!firstFresh) {
      firstFresh = card;
    }
  }
  const ahead = soonestStep && (soonestStep.srs?.dueAt ?? 0) <= now + learnAheadMs(learnAheadMinutes)
    ? soonestStep
    : null;
  return (dueStep ?? firstFresh ?? ahead)?.id ?? null;
}

/**
 * When `nextSessionCardId` has nothing to show but step cards are still
 * unanswered: the epoch ms at which the soonest one comes inside the
 * learn-ahead limit, so a sitting can wait for it. Null when nothing waits.
 */
export function nextStepWait(
  cards: readonly SessionQueueCard[],
  answered: ReadonlySet<string>,
  learnAheadMinutes: number = DEFAULT_LEARN_AHEAD_MINUTES,
): { cardId: string; dueAt: number; showAt: number } | null {
  let soonest: SessionQueueCard | null = null;
  for (const card of cards) {
    if (answered.has(card.id) || !card.srs || !isInSteps(card.srs)) continue;
    if (!soonest || card.srs.dueAt < (soonest.srs?.dueAt ?? 0)) soonest = card;
  }
  if (!soonest?.srs) return null;
  const dueAt = soonest.srs.dueAt;
  return { cardId: soonest.id, dueAt, showAt: dueAt - learnAheadMs(learnAheadMinutes) };
}

/**
 * Put a just-answered card that is still inside its steps at the end of the
 * unanswered block, ahead of the answered ones — where Again has always put a
 * card. Which card is SHOWN next is `nextSessionCardId`'s decision; this only
 * keeps the visible order honest.
 */
export function requeueStepCard<T extends { id: string }>(
  cards: readonly T[],
  cardId: string,
  answered: ReadonlySet<string>,
): T[] {
  const index = cards.findIndex((card) => card.id === cardId);
  if (index < 0) return [...cards];
  const rest = cards.filter((card) => card.id !== cardId);
  const firstAnswered = rest.findIndex((card) => answered.has(card.id));
  const at = firstAnswered === -1 ? rest.length : firstAnswered;
  return [...rest.slice(0, at), cards[index], ...rest.slice(at)];
}
