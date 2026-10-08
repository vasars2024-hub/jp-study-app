import type { LevelTier, StudyLang } from '../../shared/levelScale';
import {
  KANA_PROMPTS,
  type ClozePrompt,
  type CounterPrompt,
  type Glosses,
  type GradedSentence,
  type KanaPrompt,
  type KanjiReadingPrompt,
  type ParticlePrompt,
} from '../data/gradedSentences';
import { GAME_PACKS } from '../data/gamePacks';
import type { GamePack } from '../data/gamePacks/types';
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
    description: 'Type the romaji for each kana.',
    mode: 'fast',
  },
  {
    id: 'kanji-reading',
    title: 'Kanji Reading Attack',
    shortTitle: 'Kanji',
    description: 'Type the reading of the word in kana.',
    mode: 'fast',
  },
  {
    id: 'cloze-blitz',
    title: 'Cloze Blitz',
    shortTitle: 'Cloze',
    description: 'Type the word that fills the blank.',
    mode: 'fast',
  },
  {
    id: 'listening-flash',
    title: 'Listening Flash',
    shortTitle: 'Listen',
    description: 'Listen, then type the missing word.',
    mode: 'fast',
  },
  {
    id: 'particle-panic',
    title: 'Particle Panic',
    shortTitle: 'Particles',
    description: 'Type the particle that completes the sentence.',
    mode: 'fast',
  },
  {
    id: 'counter-quiz',
    title: 'Counter Quiz',
    shortTitle: 'Counters',
    description: 'Type the number with the right counter.',
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
    description: 'Move and fire to stop the alien waves before they reach your bunkers.',
    mode: 'arcade',
  },
  {
    id: 'comet-courier',
    title: 'LanderSim',
    shortTitle: 'Lander',
    description: 'Steer and throttle the craft to a slow, level landing on the pad.',
    mode: 'arcade',
  },
  {
    id: 'capsule-sorter',
    title: 'Dr. Capsule',
    shortTitle: 'Capsules',
    description: 'Rotate and drop capsules to line up four of a color and clear the viruses.',
    mode: 'arcade',
  },
  {
    id: 'signal-simon',
    title: 'Minesweeper',
    shortTitle: 'Mines',
    description: 'Open cells and flag the mines until the board is clear.',
    mode: 'arcade',
  },
  { id: 'aero-breakout', title: 'Aero Breakout', shortTitle: 'Breakout', description: 'Break glossy bricks with a paddle and ball.', mode: 'arcade' },
  { id: 'aero-blocks', title: 'Aero Blocks', shortTitle: 'Blocks', description: 'Fit falling blocks together and clear lines.', mode: 'arcade' },
  { id: 'aero-pong', title: 'Aero Pong', shortTitle: 'Pong', description: 'A paddle match on a glass court.', mode: 'arcade' },
  { id: 'aero-snake', title: 'Aero Snake', shortTitle: 'Snake', description: 'Collect food and grow a snake.', mode: 'arcade' },
  {
    id: 'mirror-writing',
    title: 'Mirror Writing',
    shortTitle: 'Mirror',
    description: 'Write a paragraph from an idea map and get it scored against a model answer.',
    mode: 'writing',
  },
];

export interface RoundBase {
  id: string;
  gameId: Exclude<GameId, 'mirror-writing'>;
  level: LevelTier;
  sourceLang: SourceLang;
  /** The language being studied in this round (Japanese, Chinese or Russian). */
  studyLang: StudyLang;
  prompt: string;
  /**
   * The language `prompt` is actually written in. Half these games ask their
   * question in the player's own language — Sentence Builder and Speed Type
   * show the meaning and want the study-language sentence back — so a blanket
   * study-language `lang` on the prompt announced English in a Japanese voice
   * and picked the wrong font stack for Latin text. Required, not optional, so
   * a new game cannot be added without answering the question.
   */
  promptLang: 'ja' | SourceLang;
  /**
   * Set when the prompt is fixed UI chrome rather than study material. The
   * renderer resolves it through the catalog and ignores `prompt`, which stays
   * English because it is also the mining payload (`makeMistake`). A round with
   * a key renders in the UI language, so it carries no `lang` override at all.
   */
  promptKey?: string;
  /** The study-language item (the mining payload; also the coverage key). Field name is historical. */
  jp: string;
  reading?: string;
  mineMeaning: string;
  /**
   * Set when the round tests one word, so a right or wrong answer can count as
   * evidence about that word (known-words, and its deck card if it has one).
   */
  word?: string;
}

/**
 * How a typed answer is compared, when plain text comparison is wrong:
 *   pinyin       tones optional (hǎo, hao3 and hao all match)
 *   pinyin-tone  the tone is the point (mā must come back as ma1 or mā)
 *   stress       Russian stress: the stressed vowel in capitals (молокО) or with an accent
 */
export type AnswerMode = 'pinyin' | 'pinyin-tone' | 'stress';

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
  answerMode?: AnswerMode;
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
 * empty deck the games fall back to the bundled pack rather than locking.
 */
export interface GameContent {
  vocab: VocabItem[];
  cloze: ClozeItem[];
  sentences: SourceCard[];
  /** Kana Sprint's scope — kana aren't vocabulary, so they get their own picker. */
  kana?: KanaSelection;
  /** The study language. Absent reads as Japanese, the only language the games once had. */
  studyLang?: StudyLang;
  /** The bundled pack for that language, already extended by the player's imported items. */
  pack?: GamePack;
}

/**
 * How a session chooses its rounds. Without this every session dealt the same
 * rounds in the same order: the seed was the round index, so "play again" was
 * a replay. A per-session salt varies the draw; `seen` and `weak` bias it
 * towards material the player has not met yet and material they got wrong.
 */
export interface PickContext {
  /** Per-session salt (e.g. the session's start time). */
  salt?: number;
  /** Item keys already met in this game at this level (seenProgress). Preferred last. */
  seen?: ReadonlySet<string>;
  /** Item keys recently answered wrong. They come back about one round in three. */
  weak?: ReadonlySet<string>;
  /** Keys dealt so far this session; filled in as rounds are built so none repeats while others remain. */
  used?: Set<string>;
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

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mixSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const part of parts) {
    h ^= part | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/**
 * The pick every round goes through. Tiers, best first: a recently missed item
 * (about one round in three), then an item never seen, then anything not yet
 * dealt this session, then anything at all.
 */
function choose<T>(pool: readonly T[], seed: number, keyOf: (item: T) => string, ctx?: PickContext): T | null {
  if (pool.length === 0) return null;
  const used = ctx?.used;
  const fresh = used ? pool.filter((item) => !used.has(keyOf(item))) : [...pool];
  const base = fresh.length ? fresh : [...pool];
  const weakSet = ctx?.weak;
  const seenSet = ctx?.seen;
  const weak = weakSet && weakSet.size ? base.filter((item) => weakSet.has(keyOf(item))) : [];
  const unseen = seenSet ? base.filter((item) => !seenSet.has(keyOf(item))) : [];
  const tier = weak.length && seed % 3 === 0 ? weak : unseen.length ? unseen : base;
  const item = tier[seed % tier.length];
  used?.add(keyOf(item));
  return item;
}

function pickByLevel<T extends { level: LevelTier }>(
  items: readonly T[],
  level: LevelTier,
  seed: number,
  keyOf: (item: T) => string,
  ctx?: PickContext,
): T {
  const near = items.filter((item) => Math.abs(item.level - level) <= 1);
  return choose(near.length ? near : items, seed, keyOf, ctx) ?? items[0];
}

const fillBlank = (prompt: string, answer: string): string => prompt.replace('___', answer);

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

/** A gloss in the player's language; English when the pack has none (or the player studies that language). */
function gloss(glosses: Glosses, lang: SourceLang, studyLang: StudyLang): string {
  if ((lang as string) === studyLang) return glosses.en;
  return glosses[lang] || glosses.en;
}

function normalizeJapanese(input: string): string {
  return input
    .trim()
    .replace(/[\s、。,.!?！？]/g, '')
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/** Tone and stress marks are optional in a typed answer; ё and е are the same letter to a typist. */
const TONE_AND_STRESS_MARKS = /[\u0300\u0301\u0304\u030c]/g;

function normalizeLoose(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(TONE_AND_STRESS_MARKS, '')
    .normalize('NFC')
    .replace(/ё/g, 'е')
    .replace(/[\s、。，,.!?！？；;：:'"“”«»‘’()（）-]/g, '');
}

/** Pinyin with tones ignored: hǎo, hao3 and hao all read as "hao". ü may be typed as v or u:. */
function normalizePinyin(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/u\u0308|u:/g, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-5\s'’·.,!?，。！？]/g, '');
}

const TONE_OF_MARK: Record<string, string> = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4' };

/** A single syllable as letters + tone number: mā → ma1, ma1 → ma1, nǚ / nu:3 / nv3 → nv3. */
function toneNumbered(input: string): string {
  const decomposed = input.trim().toLowerCase().normalize('NFD').replace(/u\u0308|u:/g, 'v');
  let tone = '';
  let letters = '';
  for (const ch of decomposed) {
    if (TONE_OF_MARK[ch]) tone = TONE_OF_MARK[ch];
    else if (/[1-5]/.test(ch)) tone = ch;
    else if (/[a-z]/.test(ch)) letters += ch;
  }
  return `${letters}${tone}`;
}

const RU_VOWELS = 'аеёиоуыэюя';

/**
 * A Russian word as its letters plus the positions of its stressed vowels.
 * Stress is read from a combining acute after a vowel, an upper-case vowel in an
 * otherwise lower-case word (молокО), or ё, which is always stressed.
 */
function stressShape(input: string): { letters: string; stressed: string } {
  const chars = [...input.trim().normalize('NFD')];
  const hasLower = chars.some((ch) => ch !== ch.toUpperCase());
  let letters = '';
  const stressed: number[] = [];
  const accents: number[] = [];
  const capitals: number[] = [];
  chars.forEach((ch, i) => {
    if (ch === '\u0301') return;
    const lower = ch.toLowerCase();
    if (!/[а-яё]/.test(lower)) return;
    const index = letters.length;
    if (RU_VOWELS.includes(lower)) {
      if (chars[i + 1] === '\u0301') accents.push(index);
      if (hasLower && ch !== lower) capitals.push(index);
      if (lower === 'ё') stressed.push(index);
    }
    letters += lower === 'ё' ? 'е' : lower;
  });
  // An accent mark wins over capitals (a sentence-initial capital is not stress).
  stressed.push(...(accents.length ? accents : capitals));
  return { letters, stressed: [...new Set(stressed)].sort((a, b) => a - b).join(',') };
}

function sameStress(given: string, target: string): boolean {
  const a = stressShape(given);
  const b = stressShape(target);
  return a.letters === b.letters && a.stressed !== '' && a.stressed === b.stressed;
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

function fuzzyIncludes(
  answer: string,
  acceptable: readonly string[],
  inputLang: 'ja' | SourceLang,
  mode?: AnswerMode,
): boolean {
  if (!answer.trim()) return false;
  if (mode === 'stress') return acceptable.some((target) => sameStress(answer, target));
  if (mode === 'pinyin-tone') {
    const given = toneNumbered(answer);
    return acceptable.some((target) => toneNumbered(target) === given && /\d$/.test(given));
  }
  if (mode === 'pinyin') {
    const given = normalizePinyin(answer);
    return !!given && acceptable.some((target) => normalizePinyin(target) === given);
  }
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
      ? round.answerTokens.join(round.studyLang === 'ru' ? ' ' : '')
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
    studyLang: round.studyLang,
    word: round.word,
    createdAt: Date.now(),
  };
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
  const base = content?.pack?.sprint ?? KANA_PROMPTS;
  return kanaInScope(base, selection.mode === 'auto' ? autoSelection(sequence) : selection);
}

/** The Russian stressed form written with a capital vowel, for the verdict line. */
function capitalStress(reading: string): string {
  const chars = [...reading.normalize('NFD')];
  let out = '';
  chars.forEach((ch, i) => {
    if (ch === '\u0301') return;
    out += chars[i + 1] === '\u0301' ? ch.toUpperCase() : ch;
  });
  return out;
}

/** Item keys for the bundled tables — each equals the `jp` its round carries, which is what seenProgress counts. */
const KEY = {
  sentence: (s: GradedSentence) => s.jp,
  cloze: (c: ClozePrompt) => fillBlank(c.prompt, c.answer),
  reading: (k: KanjiReadingPrompt) => k.word,
  particle: (p: ParticlePrompt) => fillBlank(p.prompt, p.answer),
  counter: (c: CounterPrompt) => c.jp,
  kana: (k: KanaPrompt) => k.kana,
  vocab: (v: VocabItem) => v.word,
  mined: (c: ClozeItem) => c.sentence,
};

export function buildGameRound(
  gameId: Exclude<GameId, 'mirror-writing'>,
  level: LevelTier,
  sourceLang: SourceLang,
  sequence: number,
  content?: GameContent,
  ctx?: PickContext,
): GameRound {
  if (GAME_DEFINITIONS.some((game) => game.id === gameId && game.mode === 'arcade')) {
    throw new Error(`Arcade game ${gameId} does not use language rounds.`);
  }

  const studyLang: StudyLang = content?.studyLang ?? 'ja';
  const pack = content?.pack ?? GAME_PACKS[studyLang];
  const sl = studyLang;
  const seed = mixSeed(sequence, level, hashText(gameId), ctx?.salt ?? 0);
  const base = { gameId, level, sourceLang, studyLang } as const;
  const id = (key: string) => `${gameId}-${ctx?.salt ?? 0}-${sequence}-${key}`;

  // The player's own material always wins; the bundled pack below is the
  // fallback for an empty or too-thin deck.
  const mined = choose(content?.cloze ?? [], seed, KEY.mined, ctx);
  if (mined && (gameId === 'cloze-blitz' || gameId === 'listening-flash')) {
    const speak = gameId === 'listening-flash';
    return {
      ...base,
      kind: 'type',
      id: id('mined'),
      // Audio-first: showing the sentence would make listening unnecessary.
      prompt: speak ? '' : mined.masked,
      promptLang: sl,
      jp: mined.sentence,
      reading: mined.reading,
      mineMeaning: mined.hint,
      answer: mined.answer,
      acceptable: [mined.answer, mined.reading].filter(Boolean),
      inputLang: sl,
      hint: mined.hint,
      speak,
    };
  }

  const ownVocab = content?.vocab ?? [];
  if (gameId === 'kanji-reading') {
    // Only words whose reading this language's game can check.
    const readable = ownVocab.filter((v) =>
      sl === 'ru' ? v.reading.normalize('NFD').includes('\u0301') : !!v.reading,
    );
    const word = choose(readable, seed, KEY.vocab, ctx);
    if (word) {
      return {
        ...base,
        kind: 'type',
        id: id(word.word),
        prompt: word.word,
        promptLang: sl,
        jp: word.word,
        word: word.word,
        reading: word.reading,
        mineMeaning: word.meaning,
        answer: sl === 'ru' ? capitalStress(word.reading) : word.reading,
        acceptable: [word.reading],
        inputLang: sl === 'ja' ? 'ja' : sl === 'zh' ? 'en' : 'ru',
        answerMode: sl === 'zh' ? 'pinyin' : sl === 'ru' ? 'stress' : undefined,
        hint: word.meaning,
      };
    }
  }
  if (gameId === 'reverse-recall') {
    const word = choose(ownVocab, seed, KEY.vocab, ctx);
    if (word) {
      return {
        ...base,
        kind: 'type',
        id: id(word.word),
        prompt: word.word,
        promptLang: sl,
        jp: word.word,
        word: word.word,
        reading: word.reading,
        mineMeaning: word.meaning,
        answer: word.meaning,
        // "cat; feline" — either sense is a right answer, not only the whole gloss.
        acceptable: meaningAlternatives(word.meaning),
        inputLang: sourceLang,
      };
    }
  }
  if (gameId === 'word-match' && distinctMeanings(ownVocab).length >= 4) {
    // Two words sharing a meaning made a board with two identical right-hand
    // tiles, where a correct pairing could be marked wrong.
    const pairs = shuffled(distinctMeanings(ownVocab), seed)
      .slice(0, 4)
      .map((v) => ({ jp: v.word, reading: v.reading, meaning: v.meaning }));
    return {
      ...base,
      kind: 'match',
      id: id('mined'),
      prompt: 'Match each word to its meaning.',
      promptLang: 'en',
      promptKey: 'games.match.instruction',
      jp: pairs.map((p) => p.jp).join(' / '),
      reading: pairs.map((p) => p.reading).join(' / '),
      mineMeaning: pairs.map((p) => p.meaning).join(' / '),
      pairs,
      rightChoices: shuffled(pairs.map((p) => p.meaning), seed + 5),
    };
  }

  if (gameId === 'sentence-builder') {
    const sentence = pickByLevel(pack.sentences, level, seed, KEY.sentence, ctx);
    return {
      ...base,
      kind: 'builder',
      id: id(sentence.id),
      prompt: gloss(sentence.translations, sourceLang, sl),
      promptLang: sourceLang,
      jp: sentence.jp,
      reading: sentence.reading || undefined,
      mineMeaning: gloss(sentence.translations, sourceLang, sl),
      tokens: shuffledDifferent(sentence.tokens, seed),
      answerTokens: sentence.tokens,
    };
  }

  if (gameId === 'speed-type') {
    const sentence = pickByLevel(pack.sentences, level, seed, KEY.sentence, ctx);
    return {
      ...base,
      kind: 'type',
      id: id(sentence.id),
      prompt: gloss(sentence.translations, sourceLang, sl),
      promptLang: sourceLang,
      jp: sentence.jp,
      reading: sentence.reading || undefined,
      mineMeaning: gloss(sentence.translations, sourceLang, sl),
      answer: sentence.jp,
      acceptable: [sentence.jp, sentence.reading].filter(Boolean),
      inputLang: sl,
    };
  }

  if (gameId === 'word-match') {
    const near = pack.vocab.filter((v) => Math.abs(v.level - level) <= 2);
    const pool = near.length >= 4 ? near : pack.vocab;
    const pairs = shuffled(pool, seed)
      .slice(0, 4)
      .map((v) => ({ jp: v.jp, reading: v.reading, meaning: gloss(v.meanings, sourceLang, sl) }));
    return {
      ...base,
      kind: 'match',
      id: id('pack'),
      prompt: 'Match each word to its meaning.',
      promptLang: 'en',
      promptKey: 'games.match.instruction',
      jp: pairs.map((p) => p.jp).join(' / '),
      reading: pairs.map((p) => p.reading).join(' / '),
      mineMeaning: pairs.map((p) => p.meaning).join(' / '),
      pairs,
      rightChoices: shuffled(pairs.map((p) => p.meaning), seed + 5),
    };
  }

  if (gameId === 'kana-sprint') {
    const pool = sl === 'ja' ? kanaPool(sequence, content) : pack.sprint;
    const kana = choose(pool, seed, KEY.kana, ctx) ?? pool[0];
    const aliases = [...(ROMAJI_ALIASES[kana.romaji] ?? []), ...(kana.aliases ?? [])];
    return {
      ...base,
      kind: 'type',
      id: id(kana.kana),
      prompt: kana.kana,
      promptLang: sl,
      jp: kana.kana,
      mineMeaning: kana.romaji,
      answer: kana.romaji,
      acceptable: [kana.romaji, ...aliases],
      inputLang: 'en',
      answerMode: sl === 'zh' ? 'pinyin-tone' : undefined,
    };
  }

  if (gameId === 'kanji-reading') {
    const item = pickByLevel(pack.reading, level, seed, KEY.reading, ctx);
    const meaning = gloss(item.meaning, sourceLang, sl);
    return {
      ...base,
      kind: 'type',
      id: id(item.id),
      prompt: item.word,
      promptLang: sl,
      jp: item.word,
      word: item.word,
      reading: item.reading,
      mineMeaning: meaning,
      answer: sl === 'ru' ? capitalStress(item.reading) : item.reading,
      acceptable: [item.reading],
      inputLang: sl === 'ja' ? 'ja' : sl === 'zh' ? 'en' : 'ru',
      answerMode: sl === 'zh' ? 'pinyin' : sl === 'ru' ? 'stress' : undefined,
      hint: meaning,
    };
  }

  if (gameId === 'cloze-blitz' || gameId === 'listening-flash') {
    const item = pickByLevel(pack.cloze, level, seed, KEY.cloze, ctx);
    const speak = gameId === 'listening-flash';
    const meaning = gloss(item.translations, sourceLang, sl);
    return {
      ...base,
      kind: 'type',
      id: id(item.id),
      // The bundled cloze already carries its own blank; swap it for the same
      // blank the mined path uses so both look identical to the player.
      prompt: speak ? '' : item.prompt.replace('___', CLOZE_BLANK),
      promptLang: sl,
      jp: fillBlank(item.prompt, item.answer),
      mineMeaning: meaning,
      answer: item.answer,
      acceptable: [item.answer, ...(item.alternatives ?? [])],
      inputLang: sl,
      hint: meaning,
      speak,
    };
  }

  if (gameId === 'particle-panic') {
    const item = pickByLevel(pack.particles, level, seed, KEY.particle, ctx);
    const hint = gloss(item.hint, sourceLang, sl);
    return {
      ...base,
      kind: 'type',
      id: id(item.id),
      prompt: item.prompt.replace('___', CLOZE_BLANK),
      promptLang: sl,
      jp: fillBlank(item.prompt, item.answer),
      mineMeaning: hint,
      answer: item.answer,
      acceptable: [item.answer, ...(item.alternatives ?? [])],
      inputLang: sl,
      hint,
    };
  }

  if (gameId === 'counter-quiz') {
    const item = pickByLevel(pack.counters, level, seed, KEY.counter, ctx);
    const object = gloss(item.object, sourceLang, sl);
    // Russian: "5 книг" with digits is the same recall as "пять книг".
    const digits = sl === 'ru' ? [`${item.number} ${item.answer.split(' ').pop() ?? ''}`.trim()] : [];
    return {
      ...base,
      kind: 'type',
      id: id(item.id),
      prompt: `${item.number} ${object}`,
      promptLang: sourceLang,
      jp: item.jp,
      reading: item.reading || undefined,
      mineMeaning: `${item.number} ${object}`,
      answer: item.answer,
      // 三冊 or さんさつ — the kanji form and its reading are the same recall.
      acceptable: [item.answer, item.reading, ...digits].filter(Boolean),
      inputLang: sl,
    };
  }

  const sentence = pickByLevel(pack.sentences, level, seed, KEY.sentence, ctx);
  const meaning = gloss(sentence.translations, sourceLang, sl);
  return {
    ...base,
    gameId: 'reverse-recall',
    kind: 'type',
    id: id(sentence.id),
    prompt: sentence.jp,
    promptLang: sl,
    jp: sentence.jp,
    reading: sentence.reading || undefined,
    mineMeaning: meaning,
    answer: meaning,
    acceptable: meaningAlternatives(meaning),
    inputLang: sourceLang,
  };
}

/**
 * Every sense of a gloss as its own acceptable answer: "to eat; to live on (e.g.
 * a salary)" accepts "to eat", "to live on" and the whole string. Parenthetical
 * notes are dropped from each sense.
 */
export function meaningAlternatives(meaning: string): string[] {
  const whole = (meaning ?? '').trim();
  if (!whole) return [whole];
  const senses = whole
    .split(/[;；,，/／、]|\s+\|\s+/)
    .map((s) => s.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
  return [...new Set([whole, ...senses])];
}

/** Vocabulary with each meaning kept once (case- and space-insensitive). */
function distinctMeanings<T extends { meaning: string }>(vocab: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of vocab) {
    const key = (v.meaning ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * All the rounds of one session. Rounds are built in order against a shared
 * `used` set, so an item is not dealt twice while unused ones remain.
 */
export function buildSessionRounds(
  gameId: Exclude<GameId, 'mirror-writing'>,
  level: LevelTier,
  sourceLang: SourceLang,
  count: number,
  content?: GameContent,
  ctx: PickContext = {},
): GameRound[] {
  const shared: PickContext = { ...ctx, used: ctx.used ?? new Set() };
  return Array.from({ length: count }, (_, i) => buildGameRound(gameId, level, sourceLang, i, content, shared));
}

export function evaluateRound(round: GameRound, answer: string | string[] | Record<string, string>): RoundOutcome {
  if (round.kind === 'type') {
    const value = String(answer);
    const correct = fuzzyIncludes(value, round.acceptable, round.inputLang, round.answerMode);
    return correct ? { correct } : { correct, mistake: makeMistake(round, value) };
  }

  if (round.kind === 'builder') {
    const tokens = Array.isArray(answer) ? answer : [];
    const expected = normalizeJapanese(round.answerTokens.join(''));
    const given = normalizeJapanese(tokens.join(''));
    const correct = given === expected;
    return correct ? { correct } : { correct, mistake: makeMistake(round, tokens.join(round.studyLang === 'ru' ? ' ' : '')) };
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
  const lang = content?.studyLang ?? 'ja';
  const pack = content?.pack ?? GAME_PACKS[lang];
  switch (gameId) {
    case 'kana-sprint': {
      if (lang !== 'ja') return pack.sprint.length;
      // Automatic mode widens as the session runs, so its pool is everything
      // it will eventually reach — not the narrow scope it starts on.
      const selection = content?.kana;
      const effective =
        !selection || selection.mode === 'auto' ? autoSelection(Number.MAX_SAFE_INTEGER) : selection;
      return kanaInScope(pack.sprint, effective).length;
    }
    case 'kanji-reading': {
      const own = (content?.vocab ?? []).filter((v) => v.reading).length;
      return own || nearLevel(pack.reading, level);
    }
    case 'reverse-recall': {
      const own = (content?.vocab ?? []).length;
      return own || nearLevel(pack.sentences, level);
    }
    case 'word-match': {
      const own = (content?.vocab ?? []).length;
      return own >= 4 ? own : nearLevel(pack.vocab, level);
    }
    case 'cloze-blitz':
    case 'listening-flash': {
      const own = (content?.cloze ?? []).length;
      return own || nearLevel(pack.cloze, level);
    }
    case 'particle-panic':
      return nearLevel(pack.particles, level);
    case 'counter-quiz':
      return nearLevel(pack.counters, level);
    case 'sentence-builder':
    case 'speed-type':
      return nearLevel(pack.sentences, level);
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
