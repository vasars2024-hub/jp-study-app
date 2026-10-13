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
import type { ArenaMistake, GameId } from '../../renderer/games/types';
import { loadGamePack } from '../../renderer/data/gamePacks/registry';
import type { GamePack } from '../../renderer/data/gamePacks/types';
import type { VocabItem } from '../../renderer/games/contentSource';
import type { StudyLang } from '../levelScale';

// The Chinese and Russian packs load on demand (data/gamePacks/registry.ts); every
// pack is loaded here so the rounds below can draw on all three.
const GAME_PACKS: Record<StudyLang, GamePack> = {
  ja: await loadGamePack('ja'),
  zh: await loadGamePack('zh'),
  ru: await loadGamePack('ru'),
};

/** Every game these loops visit is a fast one; Mirror Writing has no rounds to build. */
function fastId(id: GameId): Exclude<GameId, 'mirror-writing'> {
  if (id === 'mirror-writing') throw new Error('mirror-writing builds no rounds');
  return id;
}

describe('Game Arena engine', () => {
  it('builds a local first round for every fast game', () => {
    for (const game of GAME_DEFINITIONS.filter((g) => g.mode === 'fast')) {
      const round = buildGameRound(fastId(game.id), 3, 'en', 0);
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
      const round = buildGameRound(fastId(game.id), 3, 'en', 0);
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
        const round = buildGameRound(fastId(game.id), 3, 'en', seq);
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
      level: 3 as const,
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

/**
 * D330: the prompt element carried a fixed `lang="ja"`, so Sentence Builder's
 * `I eat dinner together with my family.` was announced in a Japanese voice and
 * set in the Japanese font stack. `promptLang` is the round's own answer to
 * "what language did I just ask this in", and it has to stay true for every
 * game, level and source language — not only the two the DOM suite drives.
 */
describe('every round declares the language its prompt is written in', () => {
  const KANA = /[぀-ヿ]/;
  const JAPANESE = /[぀-ヿ㐀-鿿]/;
  const fast = GAME_DEFINITIONS.filter((g) => g.mode === 'fast');

  it('never names a language the round is not played in', () => {
    for (const source of ['en', 'ru', 'zh'] as const) {
      for (const game of fast) {
        for (let seed = 0; seed < 6; seed++) {
          const round = buildGameRound(fastId(game.id), ((seed % 7) + 1) as 1, source, seed);
          // A displayed prompt is either the Japanese under study or the
          // player's own source language — never a third one. A keyed prompt
          // is the exception and is checked on its own terms below: its
          // `prompt` is the English mining literal, whatever the source is.
          const allowed = round.promptKey ? ['en'] : ['ja', source];
          expect(allowed, `${game.id}/${source}/${seed}`).toContain(round.promptLang);
        }
      }
    }
  });

  // Mutation control: flip any constructor's `promptLang` to `'ja'` and this
  // case goes red for that game — a Latin or Cyrillic prompt has no kana in it.
  it('marks a source-language prompt as the source language', () => {
    let checked = 0;
    for (const source of ['en', 'ru'] as const) {
      for (const game of fast) {
        for (let seed = 0; seed < 6; seed++) {
          const round = buildGameRound(fastId(game.id), ((seed % 7) + 1) as 1, source, seed);
          // A keyed prompt is UI chrome; `prompt` stays English as the mining
          // payload, so its script says nothing about what the player reads.
          if (round.promptKey || round.promptLang === 'ja') continue;
          checked++;
          expect(round.prompt, `${game.id}/${source}/${seed}`).not.toMatch(KANA);
        }
      }
    }
    // Guard against the check silently covering nothing.
    expect(checked, 'no source-language prompt was reached at all').toBeGreaterThan(10);
  });

  // The other direction, so "mark everything as the source language" is not a
  // way to pass the case above.
  it('marks a Japanese prompt as Japanese', () => {
    let checked = 0;
    for (const source of ['en', 'ru', 'zh'] as const) {
      for (const game of fast) {
        for (let seed = 0; seed < 6; seed++) {
          const round = buildGameRound(fastId(game.id), ((seed % 7) + 1) as 1, source, seed);
          if (round.promptLang !== 'ja') continue;
          // An audio round deliberately shows nothing.
          if (!round.prompt) continue;
          checked++;
          expect(round.prompt, `${game.id}/${source}/${seed}`).toMatch(JAPANESE);
        }
      }
    }
    expect(checked, 'no Japanese prompt was reached at all').toBeGreaterThan(10);
  });

  it('gives the fixed match instruction a catalog key instead of an English literal', () => {
    const round = buildGameRound('word-match', 3, 'ru', 0);
    expect(round.kind).toBe('match');
    expect(round.promptKey).toBe('games.match.instruction');
  });
});

/**
 * Answer checking where the exact form is the skill. An audit found edit-distance
 * tolerance (18% from five characters) on Kanji Reading, so a different word passed, no
 * NFKC (half-width katakana failed), digits refused in Counter Quiz, and Reverse Recall
 * taking one clause of a sentence as the whole translation.
 */
describe('Game Arena answer checking', () => {
  const ownWord = (word: string, reading: string, meaning = 'x'): VocabItem => ({ word, reading, meaning, level: 3 });
  const readingRound = (word: string, reading: string) =>
    buildGameRound('kanji-reading', 3, 'en', 0, { vocab: [ownWord(word, reading)], cloze: [], sentences: [] });
  const withPack = (studyLang: StudyLang, over: Partial<GamePack>) => ({
    vocab: [],
    cloze: [],
    sentences: [],
    studyLang,
    pack: { ...GAME_PACKS[studyLang], ...over },
  });
  const answers = (round: ReturnType<typeof buildGameRound>, typed: string) => evaluateRound(round, typed).correct;

  describe('Kanji Reading: no typo room on a reading', () => {
    it('rejects びよういん (美容院) for びょういん (病院): small kana is not a typo', () => {
      const round = readingRound('病院', 'びょういん');
      expect(answers(round, 'びょういん')).toBe(true);
      expect(answers(round, 'びよういん')).toBe(false);
    });

    it('rejects おばさん for おばあさん: a dropped mora is a different word', () => {
      const round = readingRound('お祖母さん', 'おばあさん');
      expect(answers(round, 'おばあさん')).toBe(true);
      expect(answers(round, 'おばさん')).toBe(false);
      // And the other way round: an added mora is wrong too.
      expect(answers(readingRound('叔母さん', 'おばさん'), 'おばあさん')).toBe(false);
    });

    it('also holds on the bundled reading table', () => {
      const pack = withPack('ja', {
        reading: [{ id: 'r-hosp', level: 3, word: '病院', reading: 'びょういん', meaning: { en: 'hospital' } }],
      });
      const round = buildGameRound('kanji-reading', 3, 'en', 0, pack);
      expect(answers(round, 'びょういん')).toBe(true);
      expect(answers(round, 'びよういん')).toBe(false);
    });

    it('keeps the safe folds: katakana, half-width ｶﾀｶﾅ, full-width spaces', () => {
      const round = readingRound('片仮名', 'かたかな');
      expect(answers(round, 'カタカナ')).toBe(true);
      expect(answers(round, 'ｶﾀｶﾅ')).toBe(true);
      expect(answers(round, '　かたかな　')).toBe(true);
      // Half-width voiced kana compose under NFKC: ｶﾞｯｺｳ is がっこう.
      expect(answers(readingRound('学校', 'がっこう'), 'ｶﾞｯｺｳ')).toBe(true);
      expect(answers(readingRound('学校', 'がっこう'), 'がこう')).toBe(false);
    });

    it('reads ー as the same vowel written out, and nothing looser', () => {
      expect(answers(readingRound('お母さん', 'おかあさん'), 'おかーさん')).toBe(true);
      expect(answers(readingRound('拉麺', 'らーめん'), 'ラーメン')).toBe(true);
      expect(answers(readingRound('拉麺', 'らーめん'), 'らあめん')).toBe(true);
      // せんせー is how 先生 sounds, not how its reading is spelled; and length still counts.
      expect(answers(readingRound('先生', 'せんせい'), 'せんせー')).toBe(false);
      expect(answers(readingRound('お母さん', 'おかあさん'), 'おかさん')).toBe(false);
    });
  });

  describe('Particle Panic and Counter Quiz: exact forms', () => {
    it('rejects a near-miss Russian case ending', () => {
      const pack = withPack('ru', {
        particles: [
          { id: 'p-ok', level: 3, prompt: 'По ___ (окончание) университета он уехал.', answer: 'окончании', hint: { en: 'case' } },
        ],
      });
      const round = buildGameRound('particle-panic', 3, 'en', 0, pack);
      expect(answers(round, 'окончании')).toBe(true);
      expect(answers(round, 'окончание')).toBe(false);
    });

    it('accepts 3冊 and full-width ３冊 for 三冊, and still the reading さんさつ', () => {
      const pack = withPack('ja', { counters: GAME_PACKS.ja.counters.filter((c) => c.id === 'ctr-book') });
      const round = buildGameRound('counter-quiz', 2, 'en', 0, pack);
      expect(round.kind === 'type' && round.answer).toBe('三冊');
      for (const typed of ['三冊', 'さんさつ', 'サンサツ', '3冊', '３冊']) expect(answers(round, typed), typed).toBe(true);
      for (const typed of ['三本', '3本', '4冊', 'さんさく']) expect(answers(round, typed), typed).toBe(false);
    });

    it('takes digits for a multi-character numeral and for Chinese 两', () => {
      const ageCounters = GAME_PACKS.ja.counters.filter((c) => c.id === 'ctr-age');
      const age = buildGameRound('counter-quiz', 3, 'en', 0, withPack('ja', { counters: ageCounters }));
      expect(answers(age, '20歳')).toBe(true);
      expect(answers(age, '２０歳')).toBe(true);
      expect(answers(age, 'はたち')).toBe(true);
      const geCounters = GAME_PACKS.zh.counters.filter((c) => c.id === 'zh-m-ge');
      const zh = buildGameRound('counter-quiz', 1, 'en', 0, withPack('zh', { counters: geCounters }));
      expect(answers(zh, '两个')).toBe(true);
      expect(answers(zh, '2个')).toBe(true);
      expect(answers(zh, '２个')).toBe(true);
      expect(answers(zh, '2只')).toBe(false);
    });

    it('rejects a Russian number with the wrong agreement, digits or words', () => {
      const pack = withPack('ru', { counters: GAME_PACKS.ru.counters.filter((c) => c.id === 'ru-n-minuta') });
      const round = buildGameRound('counter-quiz', 3, 'en', 0, pack);
      expect(answers(round, 'двадцать одна минута')).toBe(true);
      expect(answers(round, '21 минута')).toBe(true);
      expect(answers(round, 'двадцать одна минуты')).toBe(false);
      expect(answers(round, '21 минут')).toBe(false);
    });
  });

  const bundledSentence = (id: string) => {
    const sentence = GAME_PACKS.ja.sentences.find((s) => s.id === id);
    if (!sentence) throw new Error(`no bundled sentence ${id}`);
    return sentence;
  };

  describe('Reverse Recall on a sentence wants the whole translation', () => {
    const rain = bundledSentence('ja-x2-rain');
    const rainRound = (source: 'en' | 'ru' | 'zh' = 'en') =>
      buildGameRound('reverse-recall', 2, source, 0, withPack('ja', { sentences: [rain] }));

    it('rejects either half of 雨が降っているので、家にいます。', () => {
      const round = rainRound();
      expect(round.prompt).toBe('雨が降っているので、家にいます。');
      expect(answers(round, "so I'm staying home.")).toBe(false);
      expect(answers(round, "It's raining")).toBe(false);
      expect(answers(rainRound('ru'), 'поэтому я дома')).toBe(false);
      expect(answers(rainRound('zh'), '所以我在家')).toBe(false);
    });

    it('accepts the full sentence, loosely punctuated, with or without contractions', () => {
      const round = rainRound();
      expect(answers(round, "It's raining, so I'm staying home.")).toBe(true);
      expect(answers(round, 'its raining so im staying home')).toBe(true);
      expect(answers(round, 'It is raining, so I am staying home')).toBe(true);
      expect(answers(round, 'It is raining so I am staying at home')).toBe(true);
      expect(answers(round, "It's rainig, so I'm staying home.")).toBe(true);
      expect(answers(rainRound('ru'), 'Идет дождь, поэтому я дома')).toBe(true);
      expect(answers(rainRound('zh'), '因为在下雨，所以我在家。')).toBe(true);
    });

    it('rejects an answer that flips the negation', () => {
      expect(answers(rainRound(), "It's raining, so I'm not staying home.")).toBe(false);
      const forget = bundledSentence('ja-x4-forget');
      const round = buildGameRound('reverse-recall', 4, 'en', 0, withPack('ja', { sentences: [forget] }));
      expect(answers(round, "Please make sure you don't forget your homework.")).toBe(true);
      expect(answers(round, 'Please make sure you forget your homework.')).toBe(false);
    });

    it('accepts every bundled sentence typed in full, and no lone clause of the English ones', () => {
      let clauses = 0;
      for (const lang of ['ja', 'zh', 'ru'] as const) {
        for (const sentence of GAME_PACKS[lang].sentences) {
          const round = buildGameRound('reverse-recall', sentence.level, 'en', 0, withPack(lang, { sentences: [sentence] }));
          if (round.kind !== 'type') continue;
          expect(answers(round, round.answer), `${sentence.id} whole`).toBe(true);
          const parts = round.answer.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
          if (parts.length < 2) continue;
          for (const part of parts) {
            clauses += 1;
            expect(answers(round, part), `${sentence.id}: ${part}`).toBe(false);
          }
        }
      }
      expect(clauses).toBeGreaterThan(20);
    });

    it("still takes any one sense of a word gloss from the learner's own deck", () => {
      const content = { vocab: [ownWord('犬', 'いぬ', 'dog, hound')], cloze: [], sentences: [] };
      const round = buildGameRound('reverse-recall', 3, 'en', 0, content);
      expect(answers(round, 'dog')).toBe(true);
      expect(answers(round, 'hound')).toBe(true);
      expect(answers(round, 'cat')).toBe(false);
    });
  });
});
