/**
 * Test: a whole paper, answered first and graded once — from any local deck.
 *
 * The last of the four deck-agnostic practice modes, and the only one that does
 * not tell the user how they did until the end. That is the point of it: Learn
 * carries a card to mastery and Write drills it, but neither measures, because
 * both correct the user mid-question.
 *
 * Three things this module refuses to do, each of which would make a score that
 * flatters:
 *
 * - An unanswered question is `unanswered`, never rounded to wrong. A paper
 *   abandoned halfway is not a paper failed.
 * - A near miss is `close`, listed as its own line on the results sheet and
 *   counted in neither column. A test that silently promotes typos measures
 *   nothing; one that silently fails them measures spelling.
 * - A question kind the deck cannot support is not generated. A true/false
 *   claim needs a second distinct meaning to be false with, and a choice needs
 *   distractors; without them the paper says which kinds it used instead of
 *   quietly emitting a question with one option.
 */
import {
  buildWriteQuestion,
  gradeWrittenAnswer,
  writeJapaneseText,
  writeMeaningText,
  type WriteQuestion,
  type WriteSourceCard,
} from './flashcardWrite';

export type TestSourceCard = WriteSourceCard;

export type TestQuestionKind = 'written' | 'choice' | 'trueFalse';

export interface TestChoiceOption {
  id: string;
  text: string;
}

interface TestQuestionBase {
  /** Unique within the paper. Responses are keyed by this, not by card. */
  id: string;
  cardId: string;
  /** The canonical right answer, shown on the results sheet. */
  answer: string;
}

export type TestQuestion =
  | (TestQuestionBase & { kind: 'written'; question: WriteQuestion })
  | (TestQuestionBase & { kind: 'choice'; prompt: string; options: TestChoiceOption[]; correctOptionId: string })
  | (TestQuestionBase & { kind: 'trueFalse'; prompt: string; claim: string; claimTrue: boolean });

export interface TestPaper {
  questions: TestQuestion[];
  /** Cards left out: nothing to ask, or a duplicate of one already on the paper. */
  skipped: number;
  /** Which kinds the deck could actually support. Never a kind with no question. */
  kinds: TestQuestionKind[];
  refusal: TestRefusal | null;
}

export type TestRefusal = 'no-usable-cards';

export const DEFAULT_TEST_SIZE = 10;
/** A choice needs at least this many options, so the deck needs this many meanings. */
export const MIN_TEST_CHOICE_OPTIONS = 3;

export type TestOutcome = 'correct' | 'close' | 'wrong' | 'unanswered';

export interface TestLine {
  questionId: string;
  cardId: string;
  kind: TestQuestionKind;
  outcome: TestOutcome;
  /** What the user gave, as they gave it. Empty when they gave nothing. */
  given: string;
  /** The right answer, always shown — a test the user cannot learn from is a grade. */
  answer: string;
}

export interface TestResult {
  lines: TestLine[];
  total: number;
  correct: number;
  close: number;
  wrong: number;
  unanswered: number;
  /** Correct out of total, 0..1. `close` and `unanswered` are in neither column. */
  score: number;
}

/** Responses keyed by question id. Written answers are text; the rest are ids. */
export type TestResponses = Readonly<Record<string, string>>;

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

function usableCards(
  cards: readonly TestSourceCard[],
  random: () => number,
): { usable: TestSourceCard[]; skipped: number } {
  const seenJapanese = new Set<string>();
  const seenMeaning = new Set<string>();
  const usable: TestSourceCard[] = [];
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
  return { usable, skipped };
}

/**
 * Build one paper.
 *
 * Kinds rotate rather than being drawn at random, so a ten-question paper
 * cannot come out as ten of the same thing — which a user reads as a broken
 * generator whether or not the draw was fair.
 */
export function buildTestPaper(
  cards: readonly TestSourceCard[],
  options: { size?: number; random?: () => number } = {},
): TestPaper {
  const size = Math.max(1, Math.floor(options.size ?? DEFAULT_TEST_SIZE));
  const random = options.random ?? Math.random;
  const { usable, skipped } = usableCards(cards, random);

  if (!usable.length) {
    return { questions: [], skipped, kinds: [], refusal: 'no-usable-cards' };
  }

  // What the deck can support, decided once from the pool rather than
  // per-question, so the paper can state it.
  const kinds: TestQuestionKind[] = ['written'];
  if (usable.length >= 2) kinds.push('trueFalse');
  if (usable.length >= MIN_TEST_CHOICE_OPTIONS) kinds.push('choice');

  const chosen = usable.slice(0, size);
  const questions: TestQuestion[] = [];

  chosen.forEach((card, index) => {
    const kind = kinds[index % kinds.length];
    const id = `${card.id}:${kind}`;
    const answer = writeMeaningText(card);

    if (kind === 'written') {
      const question = buildWriteQuestion(card, index % 2 === 0 ? 'meaning-to-jp' : 'jp-to-meaning');
      if (question) questions.push({ id, cardId: card.id, kind, answer: question.answer, question });
      return;
    }

    if (kind === 'choice') {
      const seen = new Set([fold(answer)]);
      const options: TestChoiceOption[] = [{ id: card.id, text: answer }];
      for (const other of shuffle(usable, random)) {
        if (options.length >= MIN_TEST_CHOICE_OPTIONS + 1) break;
        if (other.id === card.id) continue;
        const text = writeMeaningText(other);
        const key = fold(text);
        // An option that reads the same as the answer is a second right answer.
        if (!key || seen.has(key)) continue;
        seen.add(key);
        options.push({ id: other.id, text });
      }
      questions.push({
        id,
        cardId: card.id,
        kind,
        answer,
        prompt: writeJapaneseText(card),
        options: shuffle(options, random),
        correctOptionId: card.id,
      });
      return;
    }

    // true/false: half the claims are the card's own meaning, half are another
    // card's. A false claim never folds to the card's own meaning, or "false"
    // would be the wrong answer to a claim that is in fact true.
    const claimTrue = index % 2 === 0;
    let claim = answer;
    if (!claimTrue) {
      const other = shuffle(usable, random)
        .find((c) => c.id !== card.id && fold(writeMeaningText(c)) !== fold(answer));
      // No distinct meaning to be false with: ask it as true rather than
      // inventing a claim. `usable.length >= 2` makes this near-unreachable.
      claim = other ? writeMeaningText(other) : answer;
    }
    questions.push({
      id,
      cardId: card.id,
      kind,
      answer,
      prompt: writeJapaneseText(card),
      claim,
      claimTrue: fold(claim) === fold(answer),
    });
  });

  if (!questions.length) {
    return { questions: [], skipped, kinds: [], refusal: 'no-usable-cards' };
  }

  // Only the kinds that actually produced a question, so the paper never
  // advertises a kind it does not carry.
  const present = kinds.filter((kind) => questions.some((q) => q.kind === kind));
  return { questions, skipped, kinds: present, refusal: null };
}

function gradeOne(question: TestQuestion, given: string): TestOutcome {
  if (!given.trim()) return 'unanswered';
  if (question.kind === 'written') {
    const grade = gradeWrittenAnswer(given, question.question);
    if (grade.verdict === 'empty') return 'unanswered';
    return grade.verdict;
  }
  if (question.kind === 'choice') {
    return given === question.correctOptionId ? 'correct' : 'wrong';
  }
  const said = given === 'true';
  return said === question.claimTrue ? 'correct' : 'wrong';
}

/**
 * Grade a whole paper at once.
 *
 * Every question produces a line whether or not it was answered, so the sheet
 * shows what was skipped rather than a shorter list that reads as a full one.
 */
export function gradeTestPaper(paper: TestPaper, responses: TestResponses): TestResult {
  const lines: TestLine[] = paper.questions.map((question) => {
    const given = responses[question.id] ?? '';
    const outcome = gradeOne(question, given);
    let shown = given;
    if (question.kind === 'choice') {
      shown = question.options.find((option) => option.id === given)?.text ?? '';
    }
    return {
      questionId: question.id,
      cardId: question.cardId,
      kind: question.kind,
      outcome,
      given: shown,
      answer: question.answer,
    };
  });

  const count = (outcome: TestOutcome): number => lines.filter((l) => l.outcome === outcome).length;
  const total = lines.length;
  const correct = count('correct');

  return {
    lines,
    total,
    correct,
    close: count('close'),
    wrong: count('wrong'),
    unanswered: count('unanswered'),
    score: total > 0 ? correct / total : 0,
  };
}
