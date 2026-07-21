import type { LevelTier } from '../../shared/levelScale';
import {
  CLOZE_PROMPTS,
  COUNTER_PROMPTS,
  GRADED_SENTENCES,
  KANA_PROMPTS,
  KANJI_READING_PROMPTS,
  PARTICLE_PROMPTS,
  VOCAB_PROMPTS,
  type ClozePrompt,
  type CounterPrompt,
  type GradedSentence,
  type KanjiReadingPrompt,
  type ParticlePrompt,
} from '../data/gradedSentences';
import { CLOZE_BLANK, type ClozeItem, type SourceCard, type VocabItem } from './contentSource';
import { autoSelection, kanaInScope, type KanaSelection } from './kanaGroups';
import type { ArenaMistake, GameDefinition, GameId, SourceLang } from './types';

export const GAME_DEFINITIONS: readonly GameDefinition[] = [
  {
    id: 'sentence-builder',
    title: 'Sentence Builder',
    shortTitle: 'Builder',
    description: 'Rebuild the Japanese sentence from shuffled pieces.',
    mode: 'fast',
  },
  {
    id: 'speed-type',
    title: 'Speed Type',
    shortTitle: 'Type',
    description: 'Type the Japanese answer with kana-normalized fuzzy scoring.',
    mode: 'fast',
  },
  {
    id: 'word-match',
    title: 'Word Match Rush',
    shortTitle: 'Match',
    description: 'Pair Japanese words with their meanings.',
    mode: 'fast',
  },
  {
    id: 'kana-sprint',
    title: 'Kana Sprint',
    shortTitle: 'Kana',
    description: 'Pick the romaji for kana prompts.',
    mode: 'fast',
  },
  {
    id: 'kanji-reading',
    title: 'Kanji Reading Attack',
    shortTitle: 'Kanji',
    description: 'Choose the reading of a highlighted word.',
    mode: 'fast',
  },
  {
    id: 'cloze-blitz',
    title: 'Cloze Blitz',
    shortTitle: 'Cloze',
    description: 'Fill the blank in a Japanese sentence.',
    mode: 'fast',
  },
  {
    id: 'listening-flash',
    title: 'Listening Flash',
    shortTitle: 'Listen',
    description: 'Hear Japanese, then pick the right meaning.',
    mode: 'fast',
  },
  {
    id: 'particle-panic',
    title: 'Particle Panic',
    shortTitle: 'Particles',
    description: 'Choose the particle that makes the sentence work.',
    mode: 'fast',
  },
  {
    id: 'counter-quiz',
    title: 'Counter Quiz',
    shortTitle: 'Counters',
    description: 'Pick the correct counter for the object and number.',
    mode: 'fast',
  },
  {
    id: 'reverse-recall',
    title: 'Reverse Recall',
    shortTitle: 'Recall',
    description: 'Read Japanese and type the meaning in your source language.',
    mode: 'fast',
  },
  {
    id: 'star-invaders',
    title: 'Space Invaders',
    shortTitle: 'Invaders',
    description: 'Open-source pygame Space Invaders mechanics adapted to Aero and Wired.',
    mode: 'arcade',
  },
  {
    id: 'comet-courier',
    title: 'LanderSim',
    shortTitle: 'Lander',
    description: 'A compact Lunar Lander physics sim based on the open-source LanderSim.',
    mode: 'arcade',
  },
  {
    id: 'capsule-sorter',
    title: 'Dr. Capsule',
    shortTitle: 'Capsules',
    description: 'A capsule-matching bottle puzzle with themed virus grids.',
    mode: 'arcade',
  },
  {
    id: 'signal-simon',
    title: 'Minesweeper',
    shortTitle: 'Mines',
    description: 'Recursive Minesweeper board logic adapted from the linked Python version.',
    mode: 'arcade',
  },
  {
    id: 'mirror-writing',
    title: 'Mirror Writing',
    shortTitle: 'Mirror',
    description: 'Write from an idea map and submit for asynchronous evaluation.',
    mode: 'writing',
  },
];

export interface RoundBase {
  id: string;
  gameId: Exclude<GameId, 'mirror-writing'>;
  level: LevelTier;
  sourceLang: SourceLang;
  prompt: string;
  jp: string;
  reading?: string;
  mineMeaning: string;
}

/**
 * Every recall game is a typed round: picking from four options let the player
 * recognise an answer they could not produce, which is not what any of these
 * games claim to test. Multiple choice was removed outright.
 */
export interface TypeRound extends RoundBase {
  kind: 'type';
  answer: string;
  acceptable: string[];
  inputLang: 'ja' | SourceLang;
  /**
   * The translated meaning of the missing word — the only clue in a cloze. The
   * prompt itself is the sentence with the word removed.
   */
  hint?: string;
  /** Audio-first round: the prompt is spoken, not shown. */
  speak?: boolean;
}

export interface BuilderRound extends RoundBase {
  kind: 'builder';
  tokens: string[];
  answerTokens: string[];
}

export interface MatchRound extends RoundBase {
  kind: 'match';
  pairs: { jp: string; reading: string; meaning: string }[];
  rightChoices: string[];
}

export type GameRound = TypeRound | BuilderRound | MatchRound;

/**
 * The player's own material for one level, from contentStore. Optional: with an
 * empty deck the games fall back to the bundled tables rather than locking.
 */
export interface GameContent {
  vocab: VocabItem[];
  cloze: ClozeItem[];
  sentences: SourceCard[];
  /** Kana Sprint's scope — kana aren't vocabulary, so they get their own picker. */
  kana?: KanaSelection;
}

export interface RoundOutcome {
  correct: boolean;
  mistake?: ArenaMistake;
}

export interface CompletionScoreInput {
  correct: number;
  total: number;
  bestCombo?: number;
  elapsedMs?: number;
  timeLimitMs?: number;
}

function pickByLevel<T extends { level: LevelTier }>(items: readonly T[], level: LevelTier, seed: number): T {
  const near = items.filter((item) => Math.abs(item.level - level) <= 1);
  const pool = near.length ? near : items;
  return pool[Math.abs(seed) % pool.length];
}

function sentenceFor(level: LevelTier, sourceLang: SourceLang, seed: number): GradedSentence {
  const direct = pickByLevel(GRADED_SENTENCES, level, seed);
  return direct.translations[sourceLang] ? direct : GRADED_SENTENCES[0];
}

function clozeFor(level: LevelTier, seed: number): ClozePrompt {
  return pickByLevel(CLOZE_PROMPTS, level, seed);
}

function kanjiFor(level: LevelTier, seed: number): KanjiReadingPrompt {
  return pickByLevel(KANJI_READING_PROMPTS, level, seed);
}

function particleFor(level: LevelTier, seed: number): ParticlePrompt {
  return pickByLevel(PARTICLE_PROMPTS, level, seed);
}

function counterFor(level: LevelTier, seed: number): CounterPrompt {
  return pickByLevel(COUNTER_PROMPTS, level, seed);
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = Math.abs(seed) + 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffledDifferent<T>(items: readonly T[], seed: number): T[] {
  const out = shuffled(items, seed);
  if (out.length > 1 && out.every((item, i) => item === items[i])) {
    [out[0], out[1]] = [out[1], out[0]];
  }
  return out;
}

function sourceText(sentence: GradedSentence, lang: SourceLang): string {
  return sentence.translations[lang] || sentence.translations.en;
}

function normalizeJapanese(input: string): string {
  return input
    .trim()
    .replace(/[\s、。,.!?！？]/g, '')
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function normalizeLoose(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s、。,.!?！？'"]/g, '');
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < prev.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function fuzzyIncludes(answer: string, acceptable: readonly string[], inputLang: 'ja' | SourceLang): boolean {
  const normalize = inputLang === 'ja' ? normalizeJapanese : normalizeLoose;
  const given = normalize(answer);
  if (!given) return false;
  return acceptable.some((target) => {
    const expected = normalize(target);
    if (given === expected) return true;
    const limit = Math.max(1, Math.floor(expected.length * 0.18));
    return expected.length >= 5 && distance(given, expected) <= limit;
  });
}

function makeMistake(round: GameRound, answer?: string): ArenaMistake {
  const expected =
    round.kind === 'builder'
      ? round.answerTokens.join('')
      : round.kind === 'match'
        ? round.pairs.map((p) => `${p.jp} = ${p.meaning}`).join('; ')
        : round.answer;
  return {
    gameId: round.gameId,
    prompt: round.prompt,
    expected,
    answer,
    jp: round.jp,
    reading: round.reading,
    meaning: round.mineMeaning,
    level: round.level,
    sourceLang: round.sourceLang,
    createdAt: Date.now(),
  };
}

/** Pick from the player's own pool, or null when it can't fill this round. */
function fromPool<T>(pool: readonly T[] | undefined, seed: number): T | null {
  if (!pool || pool.length === 0) return null;
  return pool[Math.abs(seed) % pool.length];
}

/**
 * Typed romaji has more than one correct spelling; rejecting a romanisation the
 * player was taught would be the game's fault, not theirs.
 */
const ROMAJI_ALIASES: Record<string, string[]> = {
  shi: ['si'],
  chi: ['ti'],
  tsu: ['tu'],
  fu: ['hu'],
  ji: ['zi', 'di'],
  ja: ['jya', 'zya'],
  ju: ['jyu', 'zyu'],
  jo: ['jyo', 'zyo'],
  sha: ['sya'],
  shu: ['syu'],
  sho: ['syo'],
  cha: ['tya'],
  chu: ['tyu'],
  cho: ['tyo'],
  n: ['nn'],
};

function kanaPool(sequence: number, content?: GameContent): readonly KanaPrompt[] {
  const selection = content?.kana ?? autoSelection(sequence);
  return kanaInScope(KANA_PROMPTS, selection.mode === 'auto' ? autoSelection(sequence) : selection);
}

export function buildGameRound(
  gameId: Exclude<GameId, 'mirror-writing'>,
  level: LevelTier,
  sourceLang: SourceLang,
  sequence: number,
  content?: GameContent,
): GameRound {
  if (
    gameId === 'star-invaders' ||
    gameId === 'comet-courier' ||
    gameId === 'capsule-sorter' ||
    gameId === 'signal-simon'
  ) {
    throw new Error(`Arcade game ${gameId} does not use language rounds.`);
  }

  const seed = sequence + level * 31 + gameId.length * 13;

  // The player's own material always wins; the bundled tables below are the
  // fallback for an empty or too-thin deck.
  const mined = fromPool(content?.cloze, seed);
  if (mined && (gameId === 'cloze-blitz' || gameId === 'listening-flash')) {
    const speak = gameId === 'listening-flash';
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-mined`,
      gameId,
      level,
      sourceLang,
      // Audio-first: showing the sentence would make listening unnecessary.
      prompt: speak ? '' : mined.masked,
      jp: mined.sentence,
      reading: mined.reading,
      mineMeaning: mined.hint,
      answer: mined.answer,
      acceptable: [mined.answer, mined.reading].filter(Boolean),
      inputLang: 'ja',
      hint: mined.hint,
      speak,
    };
  }

  const word = fromPool(content?.vocab, seed);
  if (word && gameId === 'kanji-reading' && word.reading) {
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${word.word}`,
      gameId,
      level,
      sourceLang,
      prompt: word.word,
      jp: word.word,
      reading: word.reading,
      mineMeaning: word.meaning,
      answer: word.reading,
      acceptable: [word.reading],
      inputLang: 'ja',
      hint: word.meaning,
    };
  }
  if (word && gameId === 'reverse-recall') {
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${word.word}`,
      gameId,
      level,
      sourceLang,
      prompt: word.word,
      jp: word.word,
      reading: word.reading,
      mineMeaning: word.meaning,
      answer: word.meaning,
      acceptable: [word.meaning],
      inputLang: sourceLang,
    };
  }
  const minedVocab = content?.vocab ?? [];
  if (gameId === 'word-match' && minedVocab.length >= 4) {
    const pairs = shuffled(minedVocab, seed)
      .slice(0, 4)
      .map((v) => ({ jp: v.word, reading: v.reading, meaning: v.meaning }));
    return {
      kind: 'match',
      id: `${gameId}-${sequence}-mined`,
      gameId,
      level,
      sourceLang,
      prompt: 'Match each Japanese word to its meaning.',
      jp: pairs.map((p) => p.jp).join(' / '),
      reading: pairs.map((p) => p.reading).join(' / '),
      mineMeaning: pairs.map((p) => p.meaning).join(' / '),
      pairs,
      rightChoices: shuffled(pairs.map((p) => p.meaning), seed + 5),
    };
  }

  if (gameId === 'sentence-builder') {
    const sentence = sentenceFor(level, sourceLang, seed);
    return {
      kind: 'builder',
      id: `${gameId}-${sequence}-${sentence.id}`,
      gameId,
      level,
      sourceLang,
      prompt: sourceText(sentence, sourceLang),
      jp: sentence.jp,
      reading: sentence.reading,
      mineMeaning: sourceText(sentence, sourceLang),
      tokens: shuffledDifferent(sentence.tokens, seed),
      answerTokens: sentence.tokens,
    };
  }

  if (gameId === 'speed-type') {
    const sentence = sentenceFor(level, sourceLang, seed);
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${sentence.id}`,
      gameId,
      level,
      sourceLang,
      prompt: sourceText(sentence, sourceLang),
      jp: sentence.jp,
      reading: sentence.reading,
      mineMeaning: sourceText(sentence, sourceLang),
      answer: sentence.jp,
      acceptable: [sentence.jp, sentence.reading],
      inputLang: 'ja',
    };
  }

  if (gameId === 'word-match') {
    const pairs = shuffled(VOCAB_PROMPTS, seed)
      .filter((v) => Math.abs(v.level - level) <= 2)
      .slice(0, 4)
      .map((v) => ({ jp: v.jp, reading: v.reading, meaning: v.meanings[sourceLang] || v.meanings.en }));
    const safePairs = pairs.length >= 3 ? pairs : VOCAB_PROMPTS.slice(0, 4).map((v) => ({
      jp: v.jp,
      reading: v.reading,
      meaning: v.meanings[sourceLang] || v.meanings.en,
    }));
    return {
      kind: 'match',
      id: `${gameId}-${sequence}`,
      gameId,
      level,
      sourceLang,
      prompt: 'Match each Japanese word to its meaning.',
      jp: safePairs.map((p) => p.jp).join(' / '),
      reading: safePairs.map((p) => p.reading).join(' / '),
      mineMeaning: safePairs.map((p) => p.meaning).join(' / '),
      pairs: safePairs,
      rightChoices: shuffled(safePairs.map((p) => p.meaning), seed + 5),
    };
  }

  if (gameId === 'kana-sprint') {
    const pool = kanaPool(sequence, content);
    const kana = pool[Math.abs(seed) % pool.length];
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${kana.kana}`,
      gameId,
      level,
      sourceLang,
      prompt: kana.kana,
      jp: kana.kana,
      mineMeaning: kana.romaji,
      answer: kana.romaji,
      acceptable: [kana.romaji, ...(ROMAJI_ALIASES[kana.romaji] ?? [])],
      inputLang: 'en',
    };
  }

  if (gameId === 'kanji-reading') {
    const item = kanjiFor(level, seed);
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${item.id}`,
      gameId,
      level,
      sourceLang,
      prompt: item.word,
      jp: item.word,
      reading: item.reading,
      mineMeaning: item.meaning[sourceLang] || item.meaning.en,
      answer: item.reading,
      acceptable: [item.reading],
      inputLang: 'ja',
      hint: item.meaning[sourceLang] || item.meaning.en,
    };
  }

  if (gameId === 'cloze-blitz' || gameId === 'listening-flash') {
    const item = clozeFor(level, seed);
    const speak = gameId === 'listening-flash';
    const full = item.prompt.replace('___', item.answer);
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${item.id}`,
      gameId,
      level,
      sourceLang,
      // The bundled cloze already carries its own blank; swap it for the same
      // blank the mined path uses so both look identical to the player.
      prompt: speak ? '' : item.prompt.replace('___', CLOZE_BLANK),
      jp: full,
      mineMeaning: item.translations[sourceLang] || item.translations.en,
      answer: item.answer,
      acceptable: [item.answer],
      inputLang: 'ja',
      hint: item.translations[sourceLang] || item.translations.en,
      speak,
    };
  }

  if (gameId === 'particle-panic') {
    const item = particleFor(level, seed);
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${item.id}`,
      gameId,
      level,
      sourceLang,
      prompt: item.prompt.replace('___', CLOZE_BLANK),
      jp: item.prompt.replace('___', item.answer),
      mineMeaning: item.hint[sourceLang] || item.hint.en,
      answer: item.answer,
      acceptable: [item.answer],
      inputLang: 'ja',
      hint: item.hint[sourceLang] || item.hint.en,
    };
  }

  if (gameId === 'counter-quiz') {
    const item = counterFor(level, seed);
    const object = item.object[sourceLang] || item.object.en;
    return {
      kind: 'type',
      id: `${gameId}-${sequence}-${item.id}`,
      gameId,
      level,
      sourceLang,
      prompt: `${item.number} ${object}`,
      jp: item.jp,
      reading: item.reading,
      mineMeaning: `${item.number} ${object}`,
      answer: item.answer,
      // 三冊 or さんさつ — the kanji form and its reading are the same recall.
      acceptable: [item.answer, item.reading].filter(Boolean),
      inputLang: 'ja',
    };
  }

  const sentence = sentenceFor(level, sourceLang, seed);
  return {
    kind: 'type',
    id: `${gameId}-${sequence}-${sentence.id}`,
    gameId: 'reverse-recall',
    level,
    sourceLang,
    prompt: sentence.jp,
    jp: sentence.jp,
    reading: sentence.reading,
    mineMeaning: sourceText(sentence, sourceLang),
    answer: sourceText(sentence, sourceLang),
    acceptable: [sourceText(sentence, sourceLang)],
    inputLang: sourceLang,
  };
}

export function evaluateRound(round: GameRound, answer: string | string[] | Record<string, string>): RoundOutcome {
  if (round.kind === 'type') {
    const value = String(answer);
    const correct = fuzzyIncludes(value, round.acceptable, round.inputLang);
    return correct ? { correct } : { correct, mistake: makeMistake(round, value) };
  }

  if (round.kind === 'builder') {
    const tokens = Array.isArray(answer) ? answer : [];
    const expected = normalizeJapanese(round.answerTokens.join(''));
    const given = normalizeJapanese(tokens.join(''));
    const correct = given === expected;
    return correct ? { correct } : { correct, mistake: makeMistake(round, tokens.join('')) };
  }

  const mapping = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  const correct = round.pairs.every((pair) => mapping[pair.jp] === pair.meaning);
  return correct ? { correct } : { correct, mistake: makeMistake(round, JSON.stringify(mapping)) };
}

/**
 * The parts of a play session the round transitions actually touch. The view's
 * own Session extends this with timing/score fields, so the helpers below are
 * generic over T — they preserve whatever else the caller carries.
 */
export interface ArenaSessionState {
  rounds: GameRound[];
  index: number;
  correct: number;
  currentCombo: number;
  bestCombo: number;
  mistakes: ArenaMistake[];
  complete: boolean;
  /** Set while an answered round is held on screen. See advanceToNextRound. */
  reveal: boolean;
  feedback?: RoundOutcome;
}

/**
 * Scores an answer and enters the reveal pause. Deliberately does NOT advance
 * the round: the UI keys each round panel on the round id, so advancing here
 * unmounts the panel instantly and the player never sees whether they were
 * right. Advancing is advanceToNextRound's job, once the reveal has been seen.
 */
export function applyRoundOutcome<T extends ArenaSessionState>(session: T, outcome: RoundOutcome): T {
  if (session.complete || session.reveal) return session;
  return {
    ...session,
    correct: session.correct + (outcome.correct ? 1 : 0),
    currentCombo: outcome.correct ? session.currentCombo + 1 : 0,
    bestCombo: Math.max(session.bestCombo, outcome.correct ? session.currentCombo + 1 : 0),
    mistakes: outcome.mistake ? [...session.mistakes, outcome.mistake] : session.mistakes,
    feedback: outcome,
    reveal: true,
  };
}

export function isFinalRound(session: ArenaSessionState): boolean {
  return session.index >= session.rounds.length - 1;
}

/** Leaves the reveal pause and loads the next round. */
export function advanceToNextRound<T extends ArenaSessionState>(session: T): T {
  if (session.complete || !session.reveal) return session;
  return { ...session, index: session.index + 1, reveal: false, feedback: undefined };
}

/**
 * The stable content identity of a round — the unit the coverage progress
 * counts. Replaying the same word/kana/sentence yields the same key, while
 * `round.id` changes every session.
 */
export function roundItemKey(round: GameRound): string {
  return round.jp;
}

function nearLevel<T extends { level: LevelTier }>(items: readonly T[], level: LevelTier): number {
  const near = items.filter((item) => Math.abs(item.level - level) <= 1).length;
  return near || items.length;
}

/**
 * How many distinct content items a game can draw at this level — the
 * denominator of the "you have seen X% of this level's material" bar. Mirrors
 * buildGameRound's own source order: the player's material when it can fill
 * the game, the bundled near-level table otherwise.
 */
export function gamePoolSize(
  gameId: Exclude<GameId, 'mirror-writing'>,
  level: LevelTier,
  content?: GameContent,
): number {
  switch (gameId) {
    case 'kana-sprint': {
      // Automatic mode widens as the session runs, so its pool is everything
      // it will eventually reach — not the narrow scope it starts on.
      const selection = content?.kana;
      const effective =
        !selection || selection.mode === 'auto' ? autoSelection(Number.MAX_SAFE_INTEGER) : selection;
      return kanaInScope(KANA_PROMPTS, effective).length;
    }
    case 'kanji-reading': {
      const own = (content?.vocab ?? []).filter((v) => v.reading).length;
      return own || nearLevel(KANJI_READING_PROMPTS, level);
    }
    case 'reverse-recall': {
      const own = (content?.vocab ?? []).length;
      return own || nearLevel(GRADED_SENTENCES, level);
    }
    case 'word-match': {
      const own = (content?.vocab ?? []).length;
      return own >= 4 ? own : nearLevel(VOCAB_PROMPTS, level);
    }
    case 'cloze-blitz':
    case 'listening-flash': {
      const own = (content?.cloze ?? []).length;
      return own || nearLevel(CLOZE_PROMPTS, level);
    }
    case 'particle-panic':
      return nearLevel(PARTICLE_PROMPTS, level);
    case 'counter-quiz':
      return nearLevel(COUNTER_PROMPTS, level);
    case 'sentence-builder':
    case 'speed-type':
      return nearLevel(GRADED_SENTENCES, level);
    default:
      return 0;
  }
}

export function completionScore(input: CompletionScoreInput): { score: number; accuracy: number } {
  const { correct, total } = input;
  const accuracy = total > 0 ? correct / total : 0;
  const bestCombo = Math.max(0, input.bestCombo ?? 0);
  const comboRatio = total > 0 ? Math.min(1, bestCombo / total) : 0;
  const elapsedMs = Math.max(0, input.elapsedMs ?? input.timeLimitMs ?? 0);
  const rawTimeLimitMs = input.timeLimitMs ?? elapsedMs;
  const timeLimitMs = Math.max(1, rawTimeLimitMs || 1);
  const timeRatio = Math.max(0, Math.min(1, 1 - elapsedMs / timeLimitMs));
  const score = Math.round(accuracy * 72 + comboRatio * 16 + timeRatio * 12);
  return { score: Math.min(100, Math.max(0, score)), accuracy };
}
