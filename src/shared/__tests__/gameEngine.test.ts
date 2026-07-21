import { describe, expect, it } from 'vitest';
import {
  GAME_DEFINITIONS,
  advanceToNextRound,
  applyRoundOutcome,
  buildGameRound,
  completionScore,
  evaluateRound,
  gamePoolSize,
  isFinalRound,
  roundItemKey,
  type ArenaSessionState,
  type RoundOutcome,
} from '../../renderer/games/engine';
import type { ArenaMistake } from '../../renderer/games/types';

describe('Game Arena engine', () => {
  it('builds a local first round for every fast game', () => {
    for (const game of GAME_DEFINITIONS.filter((g) => g.mode === 'fast')) {
      const round = buildGameRound(game.id, 3, 'en', 0);
      expect(round.gameId).toBe(game.id);
      expect(round.jp.length).toBeGreaterThan(0);
      // An audio round deliberately has no visible prompt — printing the
      // sentence would mean there was nothing to listen for.
      const audio = round.kind === 'type' && round.speak;
      if (!audio) expect(round.prompt.length, `${game.id} prompt`).toBeGreaterThan(0);
    }
  });

  it('has no multiple-choice rounds left: every recall game is typed', () => {
    for (const game of GAME_DEFINITIONS.filter((g) => g.mode === 'fast')) {
      const round = buildGameRound(game.id, 3, 'en', 0);
      expect(['type', 'builder', 'match'], `${game.id}`).toContain(round.kind);
    }
  });

  it('shuffles Sentence Builder tokens away from the original order', () => {
    const round = buildGameRound('sentence-builder', 2, 'en', 0);
    expect(round.kind).toBe('builder');
    if (round.kind !== 'builder') return;
    expect(round.tokens.join('|')).not.toBe(round.answerTokens.join('|'));
    expect(evaluateRound(round, round.answerTokens).correct).toBe(true);
  });

  it('accepts kana-normalized Speed Type readings', () => {
    const round = buildGameRound('speed-type', 2, 'en', 0);
    expect(round.kind).toBe('type');
    if (round.kind !== 'type') return;
    expect(evaluateRound(round, round.reading ?? '').correct).toBe(true);
  });

  it('requires all Word Match pairs to align', () => {
    const round = buildGameRound('word-match', 3, 'ru', 0);
    expect(round.kind).toBe('match');
    if (round.kind !== 'match') return;
    const correct = Object.fromEntries(round.pairs.map((pair) => [pair.jp, pair.meaning]));
    const wrong = { ...correct, [round.pairs[0].jp]: round.pairs[1].meaning };
    expect(evaluateRound(round, correct).correct).toBe(true);
    expect(evaluateRound(round, wrong).correct).toBe(false);
  });

  // The prompt the player reads must not contain what they are being asked to
  // produce. `jp` on a round is the mining payload (it becomes the flashcard
  // for a missed round) and holds the full answer — the view rendered it as a
  // sub-line under the prompt, which handed over the answer in Speed Type,
  // Sentence Builder, Cloze Blitz, Particle Panic and Counter Quiz.
  it('never puts the answer in the prompt the player reads', () => {
    const answerable = GAME_DEFINITIONS.filter((g) => g.mode === 'fast');
    for (const game of answerable) {
      for (let seq = 0; seq < 6; seq++) {
        const round = buildGameRound(game.id, 3, 'en', seq);
        if (round.gameId === 'reverse-recall') continue; // prompt IS the Japanese, by design
        const answer =
          round.kind === 'builder'
            ? round.answerTokens.join('')
            : round.kind === 'match'
              ? null // the grid shows both sides; nothing to leak
              : round.answer;
        if (!answer) continue;
        expect(round.prompt, `${game.id} #${seq} prompt leaks its answer`).not.toContain(answer);
      }
    }
  });

  it('accepts the kana reading of a counter, not only the kanji form', () => {
    // Counter Quiz is typed; forcing the kanji form would fail a player who
    // produced exactly the right counter in kana.
    for (let seq = 0; seq < 6; seq++) {
      const round = buildGameRound('counter-quiz', 3, 'en', seq);
      expect(round.kind).toBe('type');
      if (round.kind !== 'type') continue;
      expect(round.acceptable.length).toBeGreaterThanOrEqual(2);
      expect(evaluateRound(round, round.acceptable[1]).correct).toBe(true);
    }
  });

  it('sizes each game pool from the player content it would actually draw', () => {
    const vocab = Array.from({ length: 30 }, (_, i) => ({
      word: `語${i}`,
      reading: `ご${i}`,
      meaning: `word ${i}`,
    }));
    const withDeck = { vocab, cloze: [], sentences: [] };
    expect(gamePoolSize('kanji-reading', 3, withDeck)).toBe(30);
    expect(gamePoolSize('word-match', 3, withDeck)).toBe(30);
    // No deck → bundled near-level table, never zero.
    expect(gamePoolSize('kanji-reading', 3)).toBeGreaterThan(0);
    expect(gamePoolSize('counter-quiz', 3)).toBeGreaterThan(0);
    expect(gamePoolSize('kana-sprint', 1)).toBeGreaterThan(0);
  });

  it('keeps a stable item key across sessions of the same content', () => {
    const a = buildGameRound('kanji-reading', 3, 'en', 2);
    const b = buildGameRound('kanji-reading', 3, 'en', 2);
    expect(roundItemKey(a)).toBe(roundItemKey(b));
    expect(roundItemKey(a)).toBeTruthy();
  });

  it('narrows Kana Sprint to a manual selection', () => {
    const selection = { mode: 'manual' as const, scripts: ['katakana' as const], groups: ['look-alike' as const] };
    for (let seq = 0; seq < 8; seq++) {
      const round = buildGameRound('kana-sprint', 1, 'en', seq, {
        vocab: [],
        cloze: [],
        sentences: [],
        kana: selection,
      });
      expect('シツソンノメヌ').toContain(round.jp);
    }
  });

  it('adds combo and time pressure to completion scoring', () => {
    const plain = completionScore({ correct: 4, total: 5, bestCombo: 1, elapsedMs: 60_000, timeLimitMs: 60_000 });
    const cleanFast = completionScore({ correct: 4, total: 5, bestCombo: 4, elapsedMs: 12_000, timeLimitMs: 60_000 });
    expect(cleanFast.score).toBeGreaterThan(plain.score);
    expect(cleanFast.accuracy).toBe(0.8);
  });
});

describe('Game Arena round transitions', () => {
  const session = (over: Partial<ArenaSessionState> = {}): ArenaSessionState => ({
    rounds: [0, 1, 2].map((i) => buildGameRound('kana-sprint', 2, 'en', i)),
    index: 0,
    correct: 0,
    currentCombo: 0,
    bestCombo: 0,
    mistakes: [],
    complete: false,
    reveal: false,
    ...over,
  });

  const hit: RoundOutcome = { correct: true };
  const miss: RoundOutcome = { correct: false, mistake: { gameId: 'kana-sprint' } as ArenaMistake };

  // The regression this guards: answering used to advance the index in the
  // same update. The round panel is keyed on the round id, so the answered
  // round unmounted instantly and the correct/wrong styling never rendered.
  it('scores an answer without advancing the round', () => {
    const answered = applyRoundOutcome(session(), hit);
    expect(answered.index).toBe(0);
    expect(answered.reveal).toBe(true);
    expect(answered.correct).toBe(1);
    expect(answered.feedback).toBe(hit);
  });

  it('ignores a second answer while the first is still revealing', () => {
    const answered = applyRoundOutcome(session(), hit);
    expect(applyRoundOutcome(answered, hit)).toBe(answered);
  });

  it('advances only out of a reveal, clearing the feedback', () => {
    const answered = applyRoundOutcome(session(), hit);
    const next = advanceToNextRound(answered);
    expect(next.index).toBe(1);
    expect(next.reveal).toBe(false);
    expect(next.feedback).toBeUndefined();
    // An unanswered round must not skip.
    expect(advanceToNextRound(session())).toEqual(session());
  });

  it('builds and breaks combos, keeping the best', () => {
    const first = applyRoundOutcome(session(), hit);
    const second = applyRoundOutcome(advanceToNextRound(first), hit);
    expect(second.currentCombo).toBe(2);
    expect(second.bestCombo).toBe(2);

    const broken = applyRoundOutcome(advanceToNextRound(second), miss);
    expect(broken.currentCombo).toBe(0);
    expect(broken.bestCombo).toBe(2);
    expect(broken.mistakes).toHaveLength(1);
  });

  it('knows when it is on the final round', () => {
    expect(isFinalRound(session({ index: 1 }))).toBe(false);
    expect(isFinalRound(session({ index: 2 }))).toBe(true);
  });

  it('never mutates the session it is given', () => {
    const start = session();
    const snapshot = JSON.stringify(start);
    applyRoundOutcome(start, miss);
    advanceToNextRound(applyRoundOutcome(start, hit));
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
