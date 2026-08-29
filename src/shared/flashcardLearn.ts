/**
 * Learn: introduce, then drill, then master — from any local deck.
 *
 * The third of the four deck-agnostic practice modes, and the only one with a
 * memory across questions. A card is met first as a multiple choice, promoted
 * to typed recall once it is recognised, and mastered only after it has been
 * produced from nothing. Getting it wrong at the typed stage sends it back to
 * choice rather than out of the session, because the point is to finish knowing
 * the card, not to be scored on it.
 *
 * Two rules are load-bearing and are the reason this is a pure module:
 *
 * - A distractor equal to the answer makes a question with two right answers
 *   and one accepted one. That is Match's ambiguity bug wearing a different
 *   coat, and it is invisible to any test that only counts the options.
 * - A deck too small for multiple choice is *told to the user*, not silently
 *   downgraded to typing. A mode that quietly changes what it is doing is the
 *   dishonest state this repo keeps finding.
 */
import {
  buildWriteQuestion,
  writeJapaneseText,
  writeMeaningText,
  type WriteQuestion,
  type WriteSourceCard,
} from './flashcardWrite';

export type LearnSourceCard = WriteSourceCard;

/** Where a card stands in this session. Sessions do not persist; SRS does. */
export type LearnStage = 'choice' | 'recall' | 'mastered';

export interface LearnSession {
  /** The cards this session will carry to mastery, in no particular order. */
  cards: LearnSourceCard[];
  stages: Readonly<Record<string, LearnStage>>;
  /** Cards left out: nothing to ask, or a duplicate of one already in. */
  skipped: number;
  /**
   * False when the deck holds too few distinct meanings to build a choice
   * question. The session still runs, entirely on typed recall, and the host
   * says so.
   */
  choiceAvailable: boolean;
  refusal: LearnRefusal | null;
}

export type LearnRefusal = 'no-usable-cards';

export interface LearnChoiceOption {
  id: string;
  text: string;
  correct: boolean;
}

export type LearnStep =
  | { kind: 'choice'; cardId: string; prompt: string; answer: string; options: LearnChoiceOption[] }
  | { kind: 'recall'; cardId: string; question: WriteQuestion };

/** Below this there are not enough distinct meanings for a choice to mean anything. */
export const MIN_CHOICE_OPTIONS = 3;
export const DEFAULT_CHOICE_OPTIONS = 4;
/** A sitting, not a marathon: a 600-card deck is still a dozen cards at a time. */
export const DEFAULT_LEARN_SIZE = 12;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function startLearnSession(
  cards: readonly LearnSourceCard[],
  options: { size?: number; random?: () => number } = {},
): LearnSession {
  const size = Math.max(1, Math.floor(options.size ?? DEFAULT_LEARN_SIZE));
  const random = options.random ?? Math.random;

  const seenJapanese = new Set<string>();
  const seenMeaning = new Set<string>();
  const usable: LearnSourceCard[] = [];
  let skipped = 0;

  for (const card of shuffle(cards, random)) {
    const japanese = fold(writeJapaneseText(card));
    const meaning = fold(writeMeaningText(card));
    if (!japanese || !meaning || seenJapanese.has(japanese) || seenMeaning.has(meaning)) {
      skipped += 1;
      continue;
    }
    seenJapanese.add(japanese);
    seenMeaning.add(meaning);
    usable.push(card);
  }

  const chosen = usable.slice(0, size);
  if (!chosen.length) {
    return { cards: [], stages: {}, skipped, choiceAvailable: false, refusal: 'no-usable-cards' };
  }

  // Distractors come from the whole usable pool, not just this sitting, so a
  // twelve-card session inside a large deck still gets varied wrong answers.
  const choiceAvailable = usable.length >= MIN_CHOICE_OPTIONS;
  const stages: Record<string, LearnStage> = {};
  for (const card of chosen) stages[card.id] = choiceAvailable ? 'choice' : 'recall';

  return { cards: chosen, stages, skipped, choiceAvailable, refusal: null };
}

/** Cards still to master, in stage order so the newest material comes first. */
function pending(session: LearnSession): LearnSourceCard[] {
  return session.cards.filter((card) => session.stages[card.id] !== 'mastered');
}

export function learnProgress(session: LearnSession): { mastered: number; total: number } {
  const total = session.cards.length;
  const mastered = session.cards.filter((card) => session.stages[card.id] === 'mastered').length;
  return { mastered, total };
}

/**
 * The next question, or `null` when everything is mastered.
 *
 * `pool` is the full usable set the session was built from, which is where
 * distractors come from. Passing the session's own cards works and simply
 * yields a narrower set of wrong answers.
 */
export function nextLearnStep(
  session: LearnSession,
  pool: readonly LearnSourceCard[] = session.cards,
  options: { random?: () => number; choiceCount?: number } = {},
): LearnStep | null {
  const random = options.random ?? Math.random;
  const queue = pending(session);
  if (!queue.length) return null;

  const card = queue[Math.floor(random() * queue.length) % queue.length];
  const stage = session.stages[card.id];

  if (stage === 'recall') {
    // Production, not recognition: by this point the card has been picked out
    // of a lineup and the user is asked to write it.
    const question = buildWriteQuestion(card, 'meaning-to-jp');
    if (question) return { kind: 'recall', cardId: card.id, question };
    return null;
  }

  const answer = writeMeaningText(card);
  const wanted = Math.max(MIN_CHOICE_OPTIONS, Math.floor(options.choiceCount ?? DEFAULT_CHOICE_OPTIONS));
  const answerKey = fold(answer);
  const seen = new Set([answerKey]);
  const distractors: LearnChoiceOption[] = [];

  for (const other of shuffle(pool, random)) {
    if (distractors.length >= wanted - 1) break;
    if (other.id === card.id) continue;
    const text = writeMeaningText(other);
    const key = fold(text);
    // The ambiguity rule: an option that reads the same as the answer is a
    // second correct answer the grader will reject.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distractors.push({ id: other.id, text, correct: false });
  }

  const options_ = shuffle(
    [{ id: card.id, text: answer, correct: true }, ...distractors],
    random,
  );

  return {
    kind: 'choice',
    cardId: card.id,
    prompt: writeJapaneseText(card),
    answer,
    options: options_,
  };
}

/**
 * Record one answer and return the next session state.
 *
 * Promotion is one step at a time and demotion is exactly one step back:
 * a card that was typed wrong returns to choice, and a card that was picked
 * wrong stays where it is. Nothing ever leaves the session unmastered.
 */
export function applyLearnAnswer(
  session: LearnSession,
  cardId: string,
  correct: boolean,
): LearnSession {
  const stage = session.stages[cardId];
  if (!stage) return session;

  let next: LearnStage = stage;
  if (correct) {
    if (stage === 'choice') next = 'recall';
    else if (stage === 'recall') next = 'mastered';
  } else if (stage === 'recall') {
    // Only demote when there is a choice stage to demote to.
    next = session.choiceAvailable ? 'choice' : 'recall';
  }

  if (next === stage) return session;
  return { ...session, stages: { ...session.stages, [cardId]: next } };
}

export function isLearnComplete(session: LearnSession): boolean {
  return session.cards.length > 0 && pending(session).length === 0;
}
