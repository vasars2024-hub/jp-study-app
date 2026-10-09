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
 *    soonest is shown early (Anki's "learn ahead"), so the sitting can finish
 *    instead of stalling on a clock.
 */
import { isInSteps, type SrsPhase } from './learningSteps';

export interface SessionQueueCard {
  id: string;
  srs?: { dueAt: number; phase?: SrsPhase } | null;
}

export function nextSessionCardId(
  cards: readonly SessionQueueCard[],
  answered: ReadonlySet<string>,
  now: number,
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
  return (dueStep ?? firstFresh ?? soonestStep)?.id ?? null;
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
