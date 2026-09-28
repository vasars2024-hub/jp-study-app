import { describe, expect, it } from 'vitest';
import {
  buildWriteRound,
  gradeWrittenAnswer,
  writeScore,
  type WriteQuestion,
  type WriteSourceCard,
} from '../../shared/flashcardWrite';

/** A deterministic shuffle: identity order, so assertions name real cards. */
const stable = () => 0;

function card(over: Partial<WriteSourceCard> & { id: string }): WriteSourceCard {
  return { word: '', reading: '', meaning: '', ...over };
}

const taberu = card({ id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat' });
const kanji = card({ id: 'b', word: '漢字', reading: 'かんじ', meaning: 'Chinese character' });

function question(direction: 'meaning-to-jp' | 'jp-to-meaning', from = taberu): WriteQuestion {
  const round = buildWriteRound([from], { direction, random: stable });
  expect(round.refusal).toBeNull();
  return round.questions[0];
}

describe('buildWriteRound', () => {
  it('deals one question per usable card, alternating direction by default', () => {
    const round = buildWriteRound([taberu, kanji], { random: stable });
    expect(round.refusal).toBeNull();
    expect(round.questions).toHaveLength(2);
    expect(round.questions.map((q) => q.direction)).toEqual(['meaning-to-jp', 'jp-to-meaning']);
    expect(round.skipped).toBe(0);
  });

  it('refuses a deck where no card carries both a word and a meaning', () => {
    const round = buildWriteRound(
      [card({ id: 'x', word: '猫' }), card({ id: 'y', meaning: 'dog' })],
      { random: stable },
    );
    expect(round.refusal).toBe('no-usable-cards');
    expect(round.questions).toHaveLength(0);
    expect(round.skipped).toBe(2);
  });

  it('drops a second card with the same meaning, because either answer would be right', () => {
    const kuu = card({ id: 'c', word: '食う', reading: 'くう', meaning: 'to eat' });
    const round = buildWriteRound([taberu, kuu], { random: stable });
    expect(round.questions).toHaveLength(1);
    expect(round.skipped).toBe(1);
  });

  it('drops a duplicate Japanese side even when the meanings differ', () => {
    const other = card({ id: 'd', word: '食べる', reading: 'たべる', meaning: 'to have a meal' });
    const round = buildWriteRound([taberu, other], { random: stable });
    expect(round.questions).toHaveLength(1);
    expect(round.skipped).toBe(1);
  });

  it('never lets the reading double as the hint when the reading is an answer', () => {
    const produce = question('meaning-to-jp');
    expect(produce.accepted).toContain('たべる');
    expect(produce.hint).toBe('');
    expect(produce.answerLength).toBe(3);
  });

  it('gives the reading as the hint when the meaning is what gets typed', () => {
    const recognise = question('jp-to-meaning');
    expect(recognise.prompt).toBe('食べる');
    expect(recognise.hint).toBe('たべる');
  });

  it('uses the sentence when a card has no word', () => {
    const only = card({ id: 'e', sentence: '雨が降る', meaning: 'it rains' });
    const round = buildWriteRound([only], { direction: 'meaning-to-jp', random: stable });
    expect(round.questions[0].answer).toBe('雨が降る');
  });
});

describe('gradeWrittenAnswer', () => {
  it('accepts the exact Japanese answer', () => {
    const grade = gradeWrittenAnswer('食べる', question('meaning-to-jp'));
    expect(grade.verdict).toBe('correct');
    expect(grade.viaReading).toBe(false);
  });

  it('accepts the reading and says so, so the host can still show the kanji', () => {
    const grade = gradeWrittenAnswer('たべる', question('meaning-to-jp'));
    expect(grade.verdict).toBe('correct');
    expect(grade.viaReading).toBe(true);
    expect(grade.matched).toBe('たべる');
  });

  it('folds katakana against hiragana, which an IME produces either way', () => {
    const juice = card({ id: 'j', word: 'ジュース', reading: 'じゅーす', meaning: 'juice' });
    const grade = gradeWrittenAnswer('じゅーす', question('meaning-to-jp', juice));
    expect(grade.verdict).toBe('correct');
  });

  it('accepts a single sense typed alone out of a multi-sense gloss', () => {
    const many = card({ id: 'm', word: '見る', reading: 'みる', meaning: 'to see; to watch; to look at' });
    const grade = gradeWrittenAnswer('to watch', question('jp-to-meaning', many));
    expect(grade.verdict).toBe('correct');
  });

  it.each(['/', ';', '、', ','])('keeps parenthetical examples containing "%s" inside their sense', (separator) => {
    const sense = `to watch (TV${separator} movies)`;
    const many = card({ id: 'm', word: '見る', reading: 'みる', meaning: `to see; ${sense}` });
    const q = question('jp-to-meaning', many);
    expect(gradeWrittenAnswer(sense, q).verdict).toBe('correct');
    expect(gradeWrittenAnswer('movies', q).verdict).toBe('wrong');
    expect(gradeWrittenAnswer('see', q).verdict).toBe('correct');
  });

  it.each([['(', ')'], ['（', '）']])('keeps nested %s%s examples together while splitting outer senses', (open, close) => {
    const sense = `to watch ${open}movies, programs ${open}TV${close}${close}`;
    const many = card({ id: 'm', word: '見る', reading: 'みる', meaning: `${sense}/to see` });
    const q = question('jp-to-meaning', many);
    expect(gradeWrittenAnswer(sense, q).verdict).toBe('correct');
    expect(gradeWrittenAnswer('programs TV', q).verdict).toBe('wrong');
    expect(gradeWrittenAnswer('see', q).verdict).toBe('correct');
  });

  it('ignores the infinitive marker and articles on the English side', () => {
    expect(gradeWrittenAnswer('eat', question('jp-to-meaning')).verdict).toBe('correct');
    const house = card({ id: 'h', word: '家', reading: 'いえ', meaning: 'a house' });
    expect(gradeWrittenAnswer('house', question('jp-to-meaning', house)).verdict).toBe('correct');
  });

  it.each([
    ["one's own", 'one’s own'],
    ['one’s own', "one's own"],
    ['“cat”', 'cat'],
    ['cat', '‘cat’'],
  ])('accepts typographic quotes in %s against %s', (typed, meaning) => {
    const quoted = card({ id: 'q', word: '自分', meaning });
    expect(gradeWrittenAnswer(typed, question('jp-to-meaning', quoted)).verdict).toBe('correct');
  });

  it('still rejects a different word inside typographic quotes', () => {
    const cat = card({ id: 'q', word: '猫', meaning: '“cat”' });
    expect(gradeWrittenAnswer('“dog”', question('jp-to-meaning', cat)).verdict).toBe('wrong');
  });

  it('calls a one-letter slip in a long English answer close, not wrong', () => {
    const grade = gradeWrittenAnswer('Chinese charater', question('jp-to-meaning', kanji));
    expect(grade.verdict).toBe('close');
    expect(grade.matched).toBeNull();
  });

  it('REFUSAL: a close answer is never promoted to correct by the grader', () => {
    const grade = gradeWrittenAnswer('Chinese charater', question('jp-to-meaning', kanji));
    expect(grade.verdict).not.toBe('correct');
  });

  it('REFUSAL: a short wrong word gets no typo tolerance', () => {
    // 犬 against 猫 is one character out of one — a different word, never a typo.
    const neko = card({ id: 'n', word: '猫', reading: 'ねこ', meaning: 'cat' });
    const grade = gradeWrittenAnswer('犬', question('meaning-to-jp', neko));
    expect(grade.verdict).toBe('wrong');
  });

  it('REFUSAL: an empty or whitespace-only answer is never graded correct', () => {
    const q = question('meaning-to-jp');
    expect(gradeWrittenAnswer('', q).verdict).toBe('empty');
    expect(gradeWrittenAnswer('   ', q).verdict).toBe('empty');
    expect(gradeWrittenAnswer('。', q).verdict).toBe('empty');
  });

  it('is not fooled by an unrelated word of the right length', () => {
    const grade = gradeWrittenAnswer('to drink', question('jp-to-meaning'));
    expect(grade.verdict).toBe('wrong');
  });
});

describe('writeScore', () => {
  it('keeps overrides out of the correct count', () => {
    const score = writeScore(10, 6, 2, 1);
    expect(score.correct).toBe(6);
    expect(score.overridden).toBe(2);
    expect(score.answered).toBe(9);
    expect(score.done).toBe(false);
  });

  it('is done only once every question has been answered', () => {
    expect(writeScore(3, 3, 0, 0).done).toBe(true);
    expect(writeScore(0, 0, 0, 0).done).toBe(false);
  });
});
