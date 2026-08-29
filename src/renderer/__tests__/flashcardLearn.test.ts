import { describe, expect, it } from 'vitest';
import {
  applyLearnAnswer,
  isLearnComplete,
  learnProgress,
  nextLearnStep,
  startLearnSession,
  MIN_CHOICE_OPTIONS,
  type LearnSourceCard,
} from '../../shared/flashcardLearn';

const stable = () => 0;

function card(id: string, word: string, reading: string, meaning: string): LearnSourceCard {
  return { id, word, reading, meaning };
}

const deck = [
  card('a', '食べる', 'たべる', 'to eat'),
  card('b', '飲む', 'のむ', 'to drink'),
  card('c', '走る', 'はしる', 'to run'),
  card('d', '書く', 'かく', 'to write'),
  card('e', '読む', 'よむ', 'to read'),
];

describe('startLearnSession', () => {
  it('starts every usable card at the choice stage', () => {
    const session = startLearnSession(deck, { random: stable });
    expect(session.refusal).toBeNull();
    expect(session.cards).toHaveLength(5);
    expect(Object.values(session.stages).every((s) => s === 'choice')).toBe(true);
    expect(session.choiceAvailable).toBe(true);
  });

  it('caps a session at its size without calling the rest skipped', () => {
    const session = startLearnSession(deck, { size: 2, random: stable });
    expect(session.cards).toHaveLength(2);
    expect(session.skipped).toBe(0);
  });

  it('refuses a deck where nothing can be asked', () => {
    const session = startLearnSession([{ id: 'x', word: '猫' }], { random: stable });
    expect(session.refusal).toBe('no-usable-cards');
    expect(session.cards).toHaveLength(0);
  });

  it('drops a duplicate meaning, which would make two options both right', () => {
    const session = startLearnSession(
      [deck[0], card('z', '食う', 'くう', 'to eat')],
      { random: stable },
    );
    expect(session.cards).toHaveLength(1);
    expect(session.skipped).toBe(1);
  });

  it('says a small deck has no multiple choice instead of silently typing only', () => {
    const session = startLearnSession(deck.slice(0, MIN_CHOICE_OPTIONS - 1), { random: stable });
    expect(session.choiceAvailable).toBe(false);
    expect(Object.values(session.stages).every((s) => s === 'recall')).toBe(true);
  });
});

describe('nextLearnStep', () => {
  it('asks a choice question with the answer among the options', () => {
    const session = startLearnSession(deck, { random: stable });
    const step = nextLearnStep(session, deck, { random: stable });
    expect(step?.kind).toBe('choice');
    if (step?.kind !== 'choice') throw new Error('expected a choice step');
    expect(step.options.length).toBeGreaterThanOrEqual(MIN_CHOICE_OPTIONS);
    expect(step.options.filter((o) => o.correct)).toHaveLength(1);
    expect(step.options.find((o) => o.correct)?.text).toBe(step.answer);
  });

  it('REFUSAL: no distractor ever reads the same as the answer', () => {
    // Three cards that all mean the same thing: the dedup at session start
    // keeps one, and the option builder must not reintroduce the others.
    const ambiguous = [
      deck[0],
      card('dup1', '食う', 'くう', 'to eat'),
      card('dup2', '喰らう', 'くらう', 'To Eat'),
      deck[1],
      deck[2],
    ];
    const session = startLearnSession(ambiguous, { random: stable });
    const step = nextLearnStep(session, ambiguous, { random: stable });
    if (step?.kind !== 'choice') throw new Error('expected a choice step');
    const texts = step.options.map((o) => o.text.toLowerCase().trim());
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.filter((text) => text === 'to eat')).toHaveLength(1);
  });

  it('asks the promoted card to be written, not picked', () => {
    let session = startLearnSession([deck[0]], { random: stable });
    // A one-card session has no choice stage at all, so it opens on recall.
    const step = nextLearnStep(session, deck, { random: stable });
    expect(step?.kind).toBe('recall');
    if (step?.kind !== 'recall') throw new Error('expected a recall step');
    expect(step.question.direction).toBe('meaning-to-jp');
    expect(step.question.answer).toBe('食べる');
    session = applyLearnAnswer(session, 'a', true);
    expect(nextLearnStep(session, deck, { random: stable })).toBeNull();
  });

  it('returns null once nothing is pending', () => {
    let session = startLearnSession(deck, { size: 1, random: stable });
    const id = session.cards[0].id;
    session = applyLearnAnswer(session, id, true);
    session = applyLearnAnswer(session, id, true);
    expect(nextLearnStep(session, deck, { random: stable })).toBeNull();
  });
});

describe('applyLearnAnswer', () => {
  it('promotes choice to recall to mastered, one step at a time', () => {
    let session = startLearnSession(deck, { random: stable });
    expect(session.stages.a).toBe('choice');
    session = applyLearnAnswer(session, 'a', true);
    expect(session.stages.a).toBe('recall');
    session = applyLearnAnswer(session, 'a', true);
    expect(session.stages.a).toBe('mastered');
  });

  it('REFUSAL: a wrong pick never promotes and never removes the card', () => {
    let session = startLearnSession(deck, { random: stable });
    session = applyLearnAnswer(session, 'a', false);
    expect(session.stages.a).toBe('choice');
    expect(session.cards.map((c) => c.id)).toContain('a');
  });

  it('demotes a failed recall back to choice, exactly one step', () => {
    let session = startLearnSession(deck, { random: stable });
    session = applyLearnAnswer(session, 'a', true);
    session = applyLearnAnswer(session, 'a', false);
    expect(session.stages.a).toBe('choice');
  });

  it('does not demote to a choice stage that does not exist', () => {
    let session = startLearnSession([deck[0], deck[1]], { random: stable });
    expect(session.choiceAvailable).toBe(false);
    session = applyLearnAnswer(session, 'a', false);
    expect(session.stages.a).toBe('recall');
  });

  it('ignores an id that is not in the session', () => {
    const session = startLearnSession(deck, { random: stable });
    expect(applyLearnAnswer(session, 'nope', true)).toBe(session);
  });
});

describe('learnProgress', () => {
  it('counts only mastered cards, and completes when all of them are', () => {
    let session = startLearnSession(deck, { size: 2, random: stable });
    expect(learnProgress(session)).toEqual({ mastered: 0, total: 2 });
    expect(isLearnComplete(session)).toBe(false);
    for (const c of session.cards) {
      session = applyLearnAnswer(session, c.id, true);
      session = applyLearnAnswer(session, c.id, true);
    }
    expect(learnProgress(session)).toEqual({ mastered: 2, total: 2 });
    expect(isLearnComplete(session)).toBe(true);
  });

  it('an empty session is not complete', () => {
    expect(isLearnComplete(startLearnSession([], { random: stable }))).toBe(false);
  });
});
