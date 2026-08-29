/**
 * The Test paper builder and its grader.
 *
 * Test is the only one of the four modes that produces a NUMBER, so every way a
 * score could flatter is pinned here rather than left to the surface:
 *
 * - an unanswered question is never rounded to wrong;
 * - a near miss is `close` and counts in neither column;
 * - a question kind the deck cannot support is never generated, so the paper
 *   never carries a "choice" with one option or a false claim that is in fact
 *   true.
 *
 * The last of those is the negative control, and it is Match's ambiguity rule
 * wearing a third coat: a question with two right answers and one accepted one
 * is the same defect in every mode.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_SIZE,
  MIN_TEST_CHOICE_OPTIONS,
  buildTestPaper,
  gradeTestPaper,
  type TestQuestion,
  type TestSourceCard,
} from '../../shared/flashcardTest';

/** Deterministic, so a failure is reproducible rather than a one-in-n flake. */
const fixed = (): number => 0;

function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const four: TestSourceCard[] = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat' },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink' },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run' },
  { id: 'd', word: '書く', reading: 'かく', meaning: 'to write' },
];

function choices(questions: readonly TestQuestion[]) {
  return questions.filter((q): q is Extract<TestQuestion, { kind: 'choice' }> => q.kind === 'choice');
}

function trueFalses(questions: readonly TestQuestion[]) {
  return questions.filter(
    (q): q is Extract<TestQuestion, { kind: 'trueFalse' }> => q.kind === 'trueFalse',
  );
}

describe('buildTestPaper', () => {
  it('refuses a deck with nothing to ask instead of returning an empty paper', () => {
    const paper = buildTestPaper([{ id: 'x', word: '猫' }], { random: fixed });
    expect(paper.refusal).toBe('no-usable-cards');
    expect(paper.questions).toEqual([]);
    expect(paper.kinds).toEqual([]);
  });

  it('asks a one-card deck in writing only — there is nothing to be false with', () => {
    const paper = buildTestPaper([four[0]], { random: fixed });
    expect(paper.refusal).toBeNull();
    expect(paper.kinds).toEqual(['written']);
    expect(paper.questions.map((q) => q.kind)).toEqual(['written']);
  });

  it('adds true/false at two cards but still no choice', () => {
    const paper = buildTestPaper(four.slice(0, 2), { random: fixed });
    expect(paper.kinds).toContain('trueFalse');
    expect(paper.kinds).not.toContain('choice');
    expect(choices(paper.questions)).toHaveLength(0);
  });

  it('uses all three kinds once the deck can support them, and lists only those it used', () => {
    const paper = buildTestPaper(four, { random: fixed });
    expect(paper.kinds.slice().sort()).toEqual(['choice', 'trueFalse', 'written']);
    const used = new Set(paper.questions.map((q) => q.kind));
    expect([...used].sort()).toEqual(paper.kinds.slice().sort());
  });

  it('REFUSAL: no choice question offers an option that reads as the answer', () => {
    // Two cards mean the same thing in different casing. If the paper let both
    // through, a choice question would have two right answers and accept one.
    const ambiguous: TestSourceCard[] = [
      ...four,
      { id: 'e', word: '食う', meaning: 'To Eat' },
      { id: 'f', word: '喰らう', meaning: 'to  eat' },
    ];
    const paper = buildTestPaper(ambiguous, { random: fixed });
    expect(paper.skipped).toBe(2);
    const boards = choices(paper.questions);
    expect(boards.length).toBeGreaterThan(0);
    for (const question of boards) {
      const texts = question.options.map((option) => fold(option.text));
      expect(new Set(texts).size).toBe(texts.length);
      expect(question.options.filter((o) => o.id === question.correctOptionId)).toHaveLength(1);
      expect(question.options.length).toBeGreaterThanOrEqual(MIN_TEST_CHOICE_OPTIONS);
    }
  });

  it('never claims something true is false', () => {
    const many: TestSourceCard[] = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      word: `語${i}`,
      meaning: `meaning ${i}`,
    }));
    const paper = buildTestPaper(many, { size: 12, random: Math.random });
    const claims = trueFalses(paper.questions);
    expect(claims.length).toBeGreaterThan(1);
    for (const question of claims) {
      // The flag is derived from the text, not from which branch built it.
      expect(question.claimTrue).toBe(fold(question.claim) === fold(question.answer));
    }
    expect(new Set(claims.map((q) => q.claimTrue)).size).toBe(2);
  });

  it('caps the paper at the requested size and defaults to ten', () => {
    const many: TestSourceCard[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      word: `語${i}`,
      meaning: `meaning ${i}`,
    }));
    expect(buildTestPaper(many, { random: fixed }).questions).toHaveLength(DEFAULT_TEST_SIZE);
    expect(buildTestPaper(many, { size: 3, random: fixed }).questions).toHaveLength(3);
    expect(buildTestPaper(many, { size: 0, random: fixed }).questions).toHaveLength(1);
  });

  it('gives every question its own id so two questions on one card cannot collide', () => {
    const paper = buildTestPaper(four, { random: fixed });
    const ids = paper.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('gradeTestPaper', () => {
  it('leaves an unanswered question unanswered rather than rounding it to wrong', () => {
    const paper = buildTestPaper(four, { random: fixed });
    const result = gradeTestPaper(paper, {});
    expect(result.total).toBe(paper.questions.length);
    expect(result.unanswered).toBe(paper.questions.length);
    expect(result.wrong).toBe(0);
    expect(result.correct).toBe(0);
    // Every question still produces a line: a shorter sheet reads as a full one.
    expect(result.lines).toHaveLength(paper.questions.length);
    expect(result.lines.every((line) => line.given === '')).toBe(true);
    expect(result.lines.every((line) => line.answer.length > 0)).toBe(true);
  });

  it('counts a near miss as close, in neither column', () => {
    // A one-card paper asks meaning → Japanese, so the near miss is a dropped
    // dakuten: ともたち for ともだち is a slip, not a different word.
    const paper = buildTestPaper([{ id: 'a', word: 'ともだち', meaning: 'friend' }], {
      random: fixed,
    });
    const [question] = paper.questions;
    expect(question.kind).toBe('written');
    expect(question.answer).toBe('ともだち');
    const result = gradeTestPaper(paper, { [question.id]: 'ともたち' });
    expect(result.lines[0].outcome).toBe('close');
    expect(result.close).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.wrong).toBe(0);
    expect(result.score).toBe(0);
  });

  it('grades a full paper and shows what the user actually picked', () => {
    const paper = buildTestPaper(four, { random: fixed });
    const responses: Record<string, string> = {};
    for (const question of paper.questions) {
      if (question.kind === 'written') responses[question.id] = question.answer;
      else if (question.kind === 'choice') responses[question.id] = question.correctOptionId;
      else responses[question.id] = question.claimTrue ? 'true' : 'false';
    }
    const result = gradeTestPaper(paper, responses);
    expect(result.correct).toBe(result.total);
    expect(result.score).toBe(1);
    expect(result.unanswered).toBe(0);
    const board = result.lines.find((line) => line.kind === 'choice');
    // The sheet reads back the option TEXT, never the id it was keyed by.
    expect(board?.given).toBe(board?.answer);
  });

  it('marks a wrong pick wrong and still shows the answer to learn from', () => {
    const paper = buildTestPaper(four, { random: fixed });
    const board = choices(paper.questions)[0];
    const wrong = board.options.find((option) => option.id !== board.correctOptionId);
    if (!wrong) throw new Error('a choice question came back with only the answer on it');
    const result = gradeTestPaper(paper, { [board.id]: wrong.id });
    const line = result.lines.find((l) => l.questionId === board.id);
    expect(line?.outcome).toBe('wrong');
    expect(line?.given).toBe(wrong.text);
    expect(line?.answer).toBe(board.answer);
    expect(result.wrong).toBe(1);
  });

  it('grades a true/false claim against what the claim says, not which button was pressed', () => {
    const paper = buildTestPaper(four, { random: fixed });
    const claim = trueFalses(paper.questions)[0];
    expect(gradeTestPaper(paper, { [claim.id]: String(claim.claimTrue) }).correct).toBe(1);
    expect(gradeTestPaper(paper, { [claim.id]: String(!claim.claimTrue) }).wrong).toBe(1);
  });
});
