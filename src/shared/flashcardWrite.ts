/**
 * Write: type the answer, from any local deck.
 *
 * The second of the four deck-agnostic practice modes. Match's ambiguity rule
 * applies here for a sharper reason: if two cards both mean "to eat", a typed
 * 食べる against the 食う card is marked wrong while being a perfectly good
 * answer to the question the user was actually shown. So prompts are
 * deduplicated before a round is dealt.
 *
 * The other thing this module exists to get right is that a typo is not the
 * same as not knowing the word. A near miss resolves to `close`, which is
 * neither credit nor a mark against the user — it asks them to type it again.
 * `close` never silently becomes `correct`; promoting it is an explicit act the
 * host records as an override.
 */
import { toHiragana } from './furigana';

export interface WriteSourceCard {
  id: string;
  word?: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
}

/**
 * Which way round the question runs.
 * - `meaning-to-jp`: the English is shown, the Japanese is typed (production).
 * - `jp-to-meaning`: the Japanese is shown, the English is typed (recognition).
 */
export type WriteDirection = 'meaning-to-jp' | 'jp-to-meaning';

export interface WriteQuestion {
  cardId: string;
  direction: WriteDirection;
  /** What the user reads. */
  prompt: string;
  /** The answer shown on reveal — one canonical form, never a list. */
  answer: string;
  /** Every form accepted as correct, canonical first. Reading counts as an answer. */
  accepted: string[];
  /** Context that does not give the answer away. Empty when there is none. */
  hint: string;
  /** Characters in the canonical answer, so a host can offer a shape hint. */
  answerLength: number;
}

export interface WriteRound {
  questions: WriteQuestion[];
  /** Cards left out: nothing to prompt with, nothing to type, or a duplicate prompt. */
  skipped: number;
  /** `null` when the round is playable. */
  refusal: WriteRefusal | null;
}

export type WriteRefusal = 'too-few-cards' | 'no-usable-cards';

/** One question is a legitimate round here — unlike Match, which needs a board. */
export const MIN_WRITE_QUESTIONS = 1;
export const DEFAULT_WRITE_QUESTIONS = 10;

export type WriteVerdict = 'correct' | 'close' | 'wrong' | 'empty';

export interface WriteGrade {
  verdict: WriteVerdict;
  /** Which accepted form the answer matched, or `null` for `close`/`wrong`/`empty`. */
  matched: string | null;
  /** True when the user typed the reading of a kanji answer rather than the kanji. */
  viaReading: boolean;
}

/**
 * Fold everything that two people would call the same answer.
 *
 * NFKC collapses full-width Latin and half-width kana, which a Japanese IME
 * produces constantly; punctuation goes because a trailing period is not a
 * vocabulary error. Case and runs of whitespace go for the same reason.
 */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,!?;:"'`()[\]{}・…、。]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * English-only extra folding. "to eat" / "eat" and "a house" / "house" are the
 * same answer to anyone learning vocabulary; the article and the infinitive
 * marker are dictionary formatting, not knowledge being tested.
 */
function normalizeEnglish(text: string): string {
  return normalize(text).replace(/^(?:to|a|an|the)\s+/, '');
}

/** Kana-insensitive form, so ジュース and じゅーす are one answer. */
function normalizeJapanese(text: string): string {
  return toHiragana(normalize(text));
}

/** Split a gloss into its senses. Any one of them, typed alone, is correct. */
function glossSenses(meaning: string): string[] {
  return meaning
    .split(/[;/、]|,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function levenshtein(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * How far off an answer may be and still count as a typo.
 *
 * Length-scaled on purpose: one character out of two is a different Japanese
 * word, not a slip, so short answers get no tolerance at all.
 */
function typoTolerance(expected: string): number {
  if (expected.length >= 8) return 2;
  if (expected.length >= 4) return 1;
  return 0;
}

/** The Japanese side of a card. The word is the unit; a sentence is the fallback. */
export function writeJapaneseText(card: WriteSourceCard): string {
  return (card.word || card.sentence || '').trim();
}

export function writeMeaningText(card: WriteSourceCard): string {
  return (card.meaning || '').trim();
}

function buildQuestion(card: WriteSourceCard, direction: WriteDirection): WriteQuestion | null {
  const japanese = writeJapaneseText(card);
  const meaning = writeMeaningText(card);
  const reading = (card.reading || '').trim();
  if (!japanese || !meaning) return null;

  if (direction === 'meaning-to-jp') {
    // The reading is accepted but never the canonical answer: a learner who
    // types かんじ knows the word, and still ought to be shown 漢字.
    const accepted = reading && reading !== japanese ? [japanese, reading] : [japanese];
    return {
      cardId: card.id,
      direction,
      prompt: meaning,
      answer: japanese,
      accepted,
      // The reading IS an accepted answer, so it cannot also be the hint.
      hint: '',
      answerLength: japanese.length,
    };
  }

  return {
    cardId: card.id,
    direction,
    prompt: japanese,
    answer: meaning,
    accepted: [meaning, ...glossSenses(meaning)],
    hint: reading && reading !== japanese ? reading : '',
    answerLength: meaning.length,
  };
}

/**
 * Build one round.
 *
 * `direction` may be fixed, or left out to alternate — alternating is the
 * default because typing only one direction drills recognition or production
 * but never both.
 */
export function buildWriteRound(
  cards: readonly WriteSourceCard[],
  options: {
    size?: number;
    direction?: WriteDirection;
    random?: () => number;
  } = {},
): WriteRound {
  const size = Math.max(MIN_WRITE_QUESTIONS, Math.floor(options.size ?? DEFAULT_WRITE_QUESTIONS));
  const random = options.random ?? Math.random;

  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const seenJapanese = new Set<string>();
  const seenMeaning = new Set<string>();
  const usable: WriteSourceCard[] = [];
  let skipped = 0;

  for (const card of shuffled) {
    const japanese = normalizeJapanese(writeJapaneseText(card));
    const meaning = normalizeEnglish(writeMeaningText(card));
    if (!japanese || !meaning || seenJapanese.has(japanese) || seenMeaning.has(meaning)) {
      skipped += 1;
      continue;
    }
    seenJapanese.add(japanese);
    seenMeaning.add(meaning);
    usable.push(card);
  }

  const chosen = usable.slice(0, size);
  if (chosen.length < MIN_WRITE_QUESTIONS) {
    return { questions: [], skipped, refusal: 'no-usable-cards' };
  }

  const questions: WriteQuestion[] = [];
  chosen.forEach((card, index) => {
    const direction = options.direction
      ?? (index % 2 === 0 ? 'meaning-to-jp' : 'jp-to-meaning');
    const question = buildQuestion(card, direction);
    if (question) questions.push(question);
  });

  if (!questions.length) return { questions: [], skipped, refusal: 'no-usable-cards' };
  return { questions, skipped, refusal: null };
}

/**
 * Grade one typed answer.
 *
 * An empty answer is its own verdict rather than a wrong one — "I did not type
 * anything" and "I typed the wrong word" are different events, and counting a
 * blank as a miss makes a skipped question look like a failure.
 */
export function gradeWrittenAnswer(typed: string, question: WriteQuestion): WriteGrade {
  const raw = typed.trim();
  if (!raw) return { verdict: 'empty', matched: null, viaReading: false };

  const english = question.direction === 'jp-to-meaning';
  const fold = english ? normalizeEnglish : normalizeJapanese;
  const attempt = fold(raw);
  if (!attempt) return { verdict: 'empty', matched: null, viaReading: false };

  for (const candidate of question.accepted) {
    if (fold(candidate) === attempt) {
      return {
        verdict: 'correct',
        matched: candidate,
        viaReading: !english && candidate !== question.answer,
      };
    }
  }

  for (const candidate of question.accepted) {
    const expected = fold(candidate);
    if (!expected) continue;
    if (levenshtein(attempt, expected, typoTolerance(expected)) <= typoTolerance(expected)) {
      return { verdict: 'close', matched: null, viaReading: false };
    }
  }

  return { verdict: 'wrong', matched: null, viaReading: false };
}

export interface WriteScore {
  total: number;
  answered: number;
  correct: number;
  /** `close` answers promoted by the user. Kept separate so the score is honest. */
  overridden: number;
  wrong: number;
  done: boolean;
}

export function writeScore(
  total: number,
  correct: number,
  overridden: number,
  wrong: number,
): WriteScore {
  const answered = correct + overridden + wrong;
  return {
    total,
    answered,
    correct,
    overridden,
    wrong,
    done: total > 0 && answered >= total,
  };
}
