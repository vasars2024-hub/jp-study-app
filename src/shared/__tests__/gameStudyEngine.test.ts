/**
 * The engine side of "games that teach": i+1 slots deal due / learning words into the rounds
 * marked for them and known words elsewhere; sentence rounds prefer sentences whose other
 * words are known; a mined cloze names its word (so the answer is credited to the card as
 * practice — game answers never grade a card unless the user opted in) and carries
 * the card's recording into a listening round; Word Match reports each pair.
 */
import { describe, expect, it } from 'vitest';
import { buildSessionRounds, evaluateRound, type MatchRound, type TypeRound } from '../../renderer/games/engine';
import { buildClozePool, type VocabItem } from '../../renderer/games/contentSource';

const vocab: VocabItem[] = ['犬', '猫', '鳥', '魚', '馬', '牛'].map((word, i) => ({
  word,
  reading: `r${i}`,
  meaning: `m${i}`,
  level: 1,
}));

describe('i+1 slots', () => {
  it('deals the target words exactly into the target rounds and known words elsewhere', () => {
    const target = new Set(['犬', '猫']);
    const known = new Set(['鳥', '魚', '馬', '牛']);
    const slots = [true, false, false, true, false, false];
    const rounds = buildSessionRounds('reverse-recall', 1, 'en', 6, { vocab, cloze: [], sentences: [] }, {
      salt: 7, target, known, targetSlots: slots,
    }) as TypeRound[];
    rounds.forEach((round, i) => {
      expect(slots[i] ? target.has(round.word!) : known.has(round.word!)).toBe(true);
    });
    // No word repeats while others remain.
    expect(new Set(rounds.map((r) => r.word)).size).toBe(6);
  });

  it('falls back to any word when a tier is empty rather than failing the round', () => {
    const rounds = buildSessionRounds('reverse-recall', 1, 'en', 3, { vocab, cloze: [], sentences: [] }, {
      salt: 3, target: new Set(['存在しない']), known: new Set(), targetSlots: [true, false, true],
    }) as TypeRound[];
    expect(rounds.every((r) => vocab.some((v) => v.word === r.word))).toBe(true);
  });

  it('prefers i+1 sentences for sentence rounds', () => {
    const cloze = buildClozePool([
      { word: '犬', reading: 'いぬ', meaning: 'dog', sentence: '犬が走る。' },
      { word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫が寝る。' },
      { word: '鳥', reading: 'とり', meaning: 'bird', sentence: '鳥が飛ぶ。' },
    ]);
    for (let salt = 0; salt < 5; salt += 1) {
      const [round] = buildSessionRounds('cloze-blitz', 1, 'en', 1, { vocab: [], cloze, sentences: [] }, {
        salt, prefer: new Set(['猫が寝る。']),
      }) as TypeRound[];
      expect(round.jp).toBe('猫が寝る。');
    }
  });
});

describe('mined rounds carry their word and recording', () => {
  const cloze = buildClozePool([
    { word: '食べる', reading: 'たべる', meaning: 'to eat', sentence: '毎日パンを食べる。', audioDataUrl: 'data:audio/mp3;base64,AAAA' },
  ]);

  it('names the card word on cloze and listening rounds, so the answer is credited to the card as practice', () => {
    const [cl] = buildSessionRounds('cloze-blitz', 1, 'en', 1, { vocab: [], cloze, sentences: [] }) as TypeRound[];
    expect(cl.word).toBe('食べる');
    expect(cl.audio).toBeUndefined();
    const [listen] = buildSessionRounds('listening-flash', 1, 'en', 1, { vocab: [], cloze, sentences: [] }) as TypeRound[];
    expect(listen.speak).toBe(true);
    expect(listen.word).toBe('食べる');
    expect(listen.audio).toEqual({ audioDataUrl: 'data:audio/mp3;base64,AAAA' });
  });
});

describe('Speed Type and Sentence Builder on the learner\'s own material', () => {
  it('Speed Type asks for the word from its meaning, and takes the reading too', () => {
    const [round] = buildSessionRounds('speed-type', 1, 'en', 1, { vocab, cloze: [], sentences: [] }) as TypeRound[];
    expect(vocab.some((v) => v.word === round.word && v.meaning === round.prompt)).toBe(true);
    expect(round.acceptable).toEqual([round.word, vocab.find((v) => v.word === round.word)!.reading]);
    expect(evaluateRound(round, round.word!).correct).toBe(true);
  });

  it('Sentence Builder rebuilds a mined sentence from its pieces, hinted by the word it was mined for', () => {
    const sentences = [{ word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫が庭で寝ている。', pieces: ['猫が', '庭で', '寝ている。'] }];
    const [round] = buildSessionRounds('sentence-builder', 1, 'en', 1, { vocab: [], cloze: [], sentences });
    expect(round.kind).toBe('builder');
    if (round.kind !== 'builder') return;
    expect(round).toMatchObject({ prompt: '猫', hint: 'cat', word: '猫', jp: '猫が庭で寝ている。' });
    expect([...round.tokens].sort()).toEqual([...round.answerTokens].sort());
    expect(round.tokens).not.toEqual(round.answerTokens);
    expect(evaluateRound(round, round.answerTokens).correct).toBe(true);
    // A sentence with too few pieces stays out; the bundled pack fills in.
    const [packRound] = buildSessionRounds('sentence-builder', 1, 'en', 1, {
      vocab: [], cloze: [], sentences: [{ ...sentences[0], pieces: ['猫が', '寝る'] }],
    });
    expect(packRound.word).toBeUndefined();
  });
});

describe('Word Match reports each pair', () => {
  it('marks the wrong pairs only', () => {
    const [round] = buildSessionRounds('word-match', 1, 'en', 1, { vocab, cloze: [], sentences: [] }) as MatchRound[];
    const mapping = Object.fromEntries(round.pairs.map((p) => [p.jp, p.meaning]));
    const right = evaluateRound(round, mapping);
    expect(right.correct).toBe(true);
    expect(right.pairs?.every((p) => p.correct)).toBe(true);
    const [a, b] = round.pairs;
    const swapped = { ...mapping, [a.jp]: b.meaning, [b.jp]: a.meaning };
    const wrong = evaluateRound(round, swapped);
    expect(wrong.correct).toBe(false);
    expect(wrong.pairs?.filter((p) => !p.correct).map((p) => p.jp).sort()).toEqual([a.jp, b.jp].sort());
  });
});
