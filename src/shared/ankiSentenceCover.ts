// Sentence cards that do not contain their own word — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 7, recipe 16 ("find sentence cards missing the target expression or
// reading").
//
// A mined sentence card whose sentence does not contain the word it teaches is a
// card that tests nothing. It happens constantly in real decks: the sentence was
// edited, the word was pasted from a dictionary in its dictionary form, the
// sentence field was filled from a different subtitle line.
//
// The whole difficulty is Japanese inflection. 食べる is *in* 昨日ケーキを食べました
// and a plain `includes` says it is not. So this module reports **how** the
// sentence covers the word, never a yes/no:
//
//   exact    the sentence contains the written form as typed
//   reading  it does not, but it contains the note's own reading field
//   stem     it contains the word minus its final kana — 食べる → 食べ, which is
//            the shared prefix of 食べます / 食べた / 食べない / 食べれば
//   none     a stem *was* computed and the sentence contains none of the three
//   unknown  no stem could be computed, so this module cannot decide
//
// **`unknown` exists because of a measurement, not a hunch.** On the user's own
// 3,221-note mined deck the four-mode version put **234** notes in `none`, and
// **233** of them were notes whose stem had been refused — two-character verbs
// like 訊く, 出す, 帰る, 殺す, whose sentences hold 訊いた, 出した, 帰って,
// 殺される. Exactly **one** was a computed stem the sentence genuinely lacked.
// Folding those together would have handed the user a 234-card "broken sentence"
// queue with one real entry in it, which is the kind of false alarm this plan's
// exclusions forbid. `none` is now the answerable question and `unknown` is the
// module saying so.
//
// **Why the stem floor stays even though it costs those 233.** The stem is never
// one character. A single kanji is specific enough to be tempting — 訊 really
// does only occur in 訊く — but 見 occurs in 意見, 見せる and 見物, so a
// one-character rule would report `stem` for sentences that do not contain the
// word at all. A false `stem` *hides* a broken card; a false `unknown` merely
// leaves it undecided. The recipe is a review queue, so undecided is the safe
// direction. Suppletive forms are undecidable for the same reason: する → した,
// 来る → きた.

import { containsScript } from './textScripts';

export type SentenceCover = 'exact' | 'reading' | 'stem' | 'none' | 'unknown';

/** The modes, most-covered first — the order a surface should list them in. */
export const SENTENCE_COVERS: readonly SentenceCover[] = [
  'exact',
  'reading',
  'stem',
  'none',
  'unknown',
];

export function parseSentenceCover(value: string): SentenceCover | null {
  const key = value.trim().toLowerCase();
  return (SENTENCE_COVERS as readonly string[]).includes(key) ? (key as SentenceCover) : null;
}

/**
 * Field names a reading is read from, lowercased, in preference order. Same
 * shape and same reason as `VOCAB_FIELD_CANDIDATES`: a note type that declares
 * none of them simply has no reading, which is not a reason to guess a field.
 */
export const READING_FIELD_CANDIDATES: readonly string[] = [
  'reading',
  'kana',
  'furigana',
  'yomi',
  'pronunciation',
  '読み',
  '読み方',
  'よみ',
];

/**
 * Field names the sentence is read from when the query does not name one, so
 * `cover:none` works without the user knowing this deck calls it `Example`.
 * `back` is absent on purpose: on a vocabulary deck it holds the meaning, and
 * asking whether the meaning contains the word would fail every note.
 */
export const SENTENCE_FIELD_CANDIDATES: readonly string[] = [
  'sentence',
  'example',
  'examplesentence',
  'example sentence',
  'context',
  'expressionsentence',
  '例文',
  '文',
  'usage',
];

function resolveBy(
  candidates: readonly string[],
  fieldNames: readonly string[],
): string | null {
  const byLower = new Map<string, string>();
  for (const name of fieldNames) {
    const key = name.trim().toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, name);
  }
  for (const candidate of candidates) {
    const hit = byLower.get(candidate);
    if (hit !== undefined) return hit;
  }
  return null;
}

export function resolveReadingField(fieldNames: readonly string[]): string | null {
  return resolveBy(READING_FIELD_CANDIDATES, fieldNames);
}

/** `null` is an honest "this note type declares no sentence", never field 0. */
export function resolveSentenceField(fieldNames: readonly string[]): string | null {
  return resolveBy(SENTENCE_FIELD_CANDIDATES, fieldNames);
}

/** Trailing kana an inflecting word ends in. Anything else has no stem. */
const INFLECTING_TAIL = /[ぁ-ゖー]$/u;

/**
 * The prefix every inflected form of `term` shares, or `null` when the term does
 * not inflect or is too short for a stem to mean anything.
 */
export function inflectionStem(term: string): string | null {
  const word = term.trim();
  // Two characters is the floor: a one-character stem is a single kanji, which
  // occurs in unrelated words all over a real deck.
  if (word.length < 3 || !INFLECTING_TAIL.test(word)) return null;
  return word.slice(0, -1);
}

export interface SentenceCoverInput {
  /** The sentence text, already HTML/furigana-stripped (a note's `normalized`). */
  sentence: string;
  /** The note's word, as written. */
  term: string;
  /** The note's own reading field, when its note type declares one. */
  reading?: string | null;
}

/**
 * How `sentence` covers `term`. Pure containment on already-normalized text —
 * no dictionary, no deinflector, and no network.
 *
 * An empty sentence is `none` rather than a separate mode: a sentence card with
 * no sentence is exactly the case this recipe exists to surface, and splitting
 * it out would let a surface report it as its own tidy category and move on.
 */
export function sentenceCover(input: SentenceCoverInput): SentenceCover {
  const sentence = input.sentence.trim();
  const term = input.term.trim();
  if (!sentence || !term) return 'none';
  if (sentence.includes(term)) return 'exact';
  const reading = (input.reading ?? '').trim();
  // A reading that holds no kana is not a reading. On this machine that is a
  // Chinese dictionary answering a kanji with pinyin — the same case
  // `ankiReadingFill` refuses rather than writes, and matching a sentence
  // against `shí` would be a coverage verdict built on the wrong language.
  if (reading && reading !== term && containsScript(reading, 'kana')) {
    if (sentence.includes(reading)) return 'reading';
  }
  const stem = inflectionStem(term);
  // No stem means the question was never answerable, and saying 'none' would
  // put 233 undecidable notes into a queue of one real defect. See the header.
  if (stem === null) return 'unknown';
  return sentence.includes(stem) ? 'stem' : 'none';
}

export interface SentenceCoverTally {
  exact: number;
  reading: number;
  stem: number;
  none: number;
  unknown: number;
  /** Notes with no sentence field, or no word — neither is a cover verdict. */
  notApplicable: number;
}

export function emptySentenceCoverTally(): SentenceCoverTally {
  return { exact: 0, reading: 0, stem: 0, none: 0, unknown: 0, notApplicable: 0 };
}
