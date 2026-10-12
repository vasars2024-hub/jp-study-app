/**
 * N1 "Why was I wrong?" — the request, the prompt, the reply contract and the
 * deterministic fallback.
 *
 * Offered after an Again in review, and after a `close` or `wrong` typed answer
 * in Write and Learn. The model explains the difference between what the learner
 * answered (or forgot) and the card, and may say the typed answer was a valid
 * synonym. That verdict is only ever a SUGGESTION: the surface shows an "Accept my
 * answer as correct" button, and nothing is changed until the learner presses it
 * (`flashcardWrite.ts` keeps the same rule for `close`: never silently correct).
 *
 * The fallback needs no model: the card's near neighbours in the learner's own
 * deck (same reading, shared kanji, overlapping meaning), whether the typed answer
 * is another card's answer, and whether it was one typo away.
 */
import {
  clipText,
  normalizeAiStudyLang,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { toHiragana } from './furigana';
import type { UiLang } from './i18n/core';
import type { StudyLang } from './studyLang';

/** Bumped whenever the prompt or the reply contract changes: it is part of the cache key. */
export const WHY_WRONG_PROMPT_VERSION = 1;

/**
 * - `meaning-to-target`: the meaning was shown, the study-language word was typed.
 * - `target-to-meaning`: the word was shown, its meaning was typed.
 * - `review`: a flip-card review rated Again; nothing was typed.
 */
export type WhyWrongDirection = 'meaning-to-target' | 'target-to-meaning' | 'review';
export type WhyWrongVerdict = 'again' | 'close' | 'wrong';

export interface WhyWrongCard {
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
}

export interface WhyWrongNeighbour {
  word: string;
  reading: string;
  meaning: string;
}

export interface WhyWrongRequest {
  requestId?: string;
  card: WhyWrongCard;
  /** What the learner typed; empty for a flip review. */
  typed: string;
  /** The canonical answer the surface showed. */
  expected: string;
  direction: WhyWrongDirection;
  verdict: WhyWrongVerdict;
  /** Similar cards from the learner's deck (`pickWhyWrongNeighbours`). */
  neighbours: WhyWrongNeighbour[];
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export const WHY_WRONG_CONFUSIONS = [
  'typo',
  'similar-word',
  'kanji-lookalike',
  'wrong-reading',
  'different-meaning',
  'synonym',
  'other',
] as const;
export type WhyWrongConfusion = (typeof WHY_WRONG_CONFUSIONS)[number];

export interface WhyWrongResult {
  confusion: WhyWrongConfusion;
  /** Two or three sentences in the UI language. */
  explanation: string;
  /** One short memory tip; may be empty. */
  tip: string;
  /**
   * The model judges the typed answer a valid answer for this card (a synonym, an
   * equivalent translation, a variant spelling). Always false without a typed answer.
   */
  acceptable: boolean;
  /** Why it is acceptable; empty unless `acceptable`. */
  acceptableReason: string;
}

const MAX_NEIGHBOURS = 8;

function readCard(value: unknown): WhyWrongCard | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const card = {
    word: clipText(raw.word, 80),
    reading: clipText(raw.reading, 80),
    meaning: clipText(raw.meaning, 300),
    sentence: clipText(raw.sentence, 300),
  };
  return card.word || card.meaning ? card : null;
}

function readNeighbours(value: unknown): WhyWrongNeighbour[] {
  if (!Array.isArray(value)) return [];
  const out: WhyWrongNeighbour[] = [];
  for (const raw of value) {
    if (out.length >= MAX_NEIGHBOURS) break;
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const neighbour = {
      word: clipText(entry.word, 60),
      reading: clipText(entry.reading, 60),
      meaning: clipText(entry.meaning, 120),
    };
    if (neighbour.word) out.push(neighbour);
  }
  return out;
}

export function normalizeWhyWrongRequest(input: unknown): WhyWrongRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const card = readCard(raw.card);
  if (!card) return null;
  const direction: WhyWrongDirection = raw.direction === 'meaning-to-target' || raw.direction === 'target-to-meaning'
    ? raw.direction
    : 'review';
  const typed = direction === 'review' ? '' : clipText(raw.typed, 120);
  const verdict: WhyWrongVerdict = raw.verdict === 'close' || raw.verdict === 'wrong' ? raw.verdict : 'again';
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    card,
    typed,
    expected: clipText(raw.expected, 300) || (direction === 'target-to-meaning' ? card.meaning : card.word),
    direction,
    verdict: direction === 'review' ? 'again' : verdict === 'again' ? 'wrong' : verdict,
    neighbours: readNeighbours(raw.neighbours),
    studyLang: normalizeAiStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

/** Everything that changes the answer, for the cache key. */
export function whyWrongKeyParts(request: WhyWrongRequest): string[] {
  return [
    request.card.word,
    request.card.reading,
    request.card.meaning,
    request.card.sentence,
    request.typed,
    request.expected,
    request.direction,
    request.verdict,
    request.neighbours.map((n) => `${n.word}|${n.reading}|${n.meaning}`).join(';'),
    request.studyLang,
    request.answerLang,
  ];
}

export function buildWhyWrongPrompt(request: WhyWrongRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const { card } = request;
  const lines = [
    `You help a learner of ${study} understand a mistake on a flashcard.`,
    `Write every field in ${answer}. Quote ${study} words exactly as written.`,
    '',
    'The card:',
    `- word: ${card.word}`,
    card.reading && card.reading !== card.word ? `- reading: ${card.reading}` : '',
    `- meaning: ${card.meaning}`,
    card.sentence ? `- example sentence: ${card.sentence}` : '',
    '',
  ];
  if (request.direction === 'review') {
    lines.push('The learner saw this card and pressed "Again": they did not remember it. Nothing was typed.');
  } else {
    lines.push(
      request.direction === 'meaning-to-target'
        ? `The learner was shown the meaning and had to type the ${study} word.`
        : `The learner was shown the ${study} word and had to type its meaning.`,
      `The learner typed: "${request.typed}"`,
      `The expected answer was: "${request.expected}"`,
      `The app graded it ${request.verdict === 'close' ? 'as a near miss' : 'as wrong'}.`,
    );
  }
  if (request.neighbours.length) {
    lines.push('', 'Similar cards in the learner\'s deck (possible sources of confusion):');
    for (const n of request.neighbours) {
      lines.push(`- ${n.word}${n.reading && n.reading !== n.word ? ` (${n.reading})` : ''}: ${n.meaning}`);
    }
  }
  lines.push(
    '',
    'Reply with JSON:',
    `- "confusion": the most likely cause, one of ${WHY_WRONG_CONFUSIONS.map((c) => `"${c}"`).join(', ')}.`,
    '- "explanation": at most three short sentences on the difference between the learner\'s answer (or a likely confusion) and the correct one.',
    '- "tip": one short sentence that will help remember the card, or "".',
    request.typed
      ? '- "acceptable": true ONLY if the typed answer is genuinely a correct answer for this card (a true synonym, an equivalent translation, or a variant spelling of the same word). A related but different word is NOT acceptable. When unsure, false.'
      : '- "acceptable": false (nothing was typed).',
    '- "acceptableReason": one sentence explaining why it is acceptable, or "" when it is not.',
    PLAIN_TEXT_RULE,
  );
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
}

/** Provider-side schema (Gemini `responseSchema`, Anthropic forced tool, OpenAI hint). */
export const WHY_WRONG_SCHEMA = {
  type: 'object',
  properties: {
    confusion: { type: 'string', enum: [...WHY_WRONG_CONFUSIONS] },
    explanation: { type: 'string' },
    tip: { type: 'string' },
    acceptable: { type: 'boolean' },
    acceptableReason: { type: 'string' },
  },
  required: ['confusion', 'explanation', 'tip', 'acceptable', 'acceptableReason'],
} as const;

/**
 * The checks a shape-valid reply must still pass. `null` means "unusable": never
 * cached and reported as `invalid`.
 */
export function finalizeWhyWrongResult(
  parsed: { confusion: string; explanation: string; tip?: string; acceptable?: boolean; acceptableReason?: string },
  request: WhyWrongRequest,
): WhyWrongResult | null {
  const explanation = plainModelText(parsed.explanation, 700);
  if (!explanation) return null;
  const confusion = (WHY_WRONG_CONFUSIONS as readonly string[]).includes(parsed.confusion)
    ? parsed.confusion as WhyWrongConfusion
    : 'other';
  const acceptableReason = plainModelText(parsed.acceptableReason ?? '', 300);
  // Only a typed answer can be accepted, and only with a stated reason.
  const acceptable = Boolean(parsed.acceptable) && request.typed.length > 0 && acceptableReason.length > 0;
  return {
    confusion,
    explanation,
    tip: plainModelText(parsed.tip ?? '', 300),
    acceptable,
    acceptableReason: acceptable ? acceptableReason : '',
  };
}

/** A cached value is reused only when it still has the full validated shape. */
export function isWhyWrongResult(value: unknown): value is WhyWrongResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.explanation === 'string' && v.explanation.length > 0
    && typeof v.confusion === 'string' && (WHY_WRONG_CONFUSIONS as readonly string[]).includes(v.confusion)
    && typeof v.tip === 'string' && typeof v.acceptable === 'boolean' && typeof v.acceptableReason === 'string';
}

// ---- the deterministic half ------------------------------------------------

export interface WhyWrongDeckCard extends WhyWrongNeighbour {
  id: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'that', 'this', 'one', "one's", 'someone', 'something',
  'thing', 'things', 'person', 'people', 'about', 'etc', 'very', 'make', 'have', 'been', 'being', 'some',
]);

const HAN = /\p{Script=Han}/u;

function hanChars(text: string): Set<string> {
  return new Set([...text].filter((char) => HAN.test(char)));
}

function meaningWords(meaning: string): Set<string> {
  const out = new Set<string>();
  for (const word of meaning.toLowerCase().match(/\p{L}[\p{L}'-]*/gu) ?? []) {
    if (word.length >= 3 && !STOP_WORDS.has(word)) out.add(word);
  }
  return out;
}

function foldKana(text: string): string {
  return toHiragana(text.normalize('NFKC').toLowerCase().replace(/[\s.,!?;:'"、。・…〜~()（）]/g, ''));
}

function foldMeaning(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[.,!?;:"'()]/g, '').replace(/^(?:to|a|an|the)\s+/, '').replace(/\s+/g, ' ').trim();
}

/** Each sense of a gloss, folded, with and without its bracketed clarification. */
function meaningSenses(meaning: string): string[] {
  const out = new Set<string>();
  for (const sense of meaning.split(/[;/,、，；]/)) {
    out.add(foldMeaning(sense));
    out.add(foldMeaning(sense.replace(/[(（][^()（）]*[)）]/g, ' ')));
  }
  out.delete('');
  return [...out];
}

/**
 * Up to `limit` cards of the deck most likely to be confused with `card`:
 * same reading first (homophones), then shared kanji, then overlapping meaning.
 * Deterministic: ties keep deck order.
 */
export function pickWhyWrongNeighbours(
  card: WhyWrongDeckCard,
  deck: readonly WhyWrongDeckCard[],
  limit = MAX_NEIGHBOURS,
): WhyWrongDeckCard[] {
  const reading = foldKana(card.reading || card.word);
  const kanji = hanChars(card.word);
  const words = meaningWords(card.meaning);
  const scored: Array<{ entry: WhyWrongDeckCard; score: number; index: number }> = [];
  deck.forEach((entry, index) => {
    if (entry.id === card.id || !entry.word || entry.word === card.word) return;
    let score = 0;
    if (reading && foldKana(entry.reading || entry.word) === reading) score += 6;
    for (const char of hanChars(entry.word)) if (kanji.has(char)) score += 3;
    for (const word of meaningWords(entry.meaning)) if (words.has(word)) score += 1;
    if (score > 0) scored.push({ entry, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, limit)).map((row) => row.entry);
}

export type WhyWrongNoteKind =
  | 'typo'
  | 'other-card'
  | 'typed-shares-kanji'
  | 'homophone'
  | 'shared-kanji'
  | 'similar-meaning'
  | 'no-clue';

export interface WhyWrongNote {
  kind: WhyWrongNoteKind;
  /** The catalog variables for `aiStudy.whyWrong.note.<kind>`. */
  vars: Record<string, string>;
}

function editDistance(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * What the app can say without a model. Each note is rendered from a catalog key
 * (`aiStudy.whyWrong.note.<kind>`), so the fallback is translated like the rest
 * of the UI. Never empty: with no clue at all it says so.
 */
export function whyWrongFallback(input: {
  card: WhyWrongDeckCard;
  typed: string;
  expected: string;
  direction: WhyWrongDirection;
  deck: readonly WhyWrongDeckCard[];
}): WhyWrongNote[] {
  const notes: WhyWrongNote[] = [];
  const typed = input.typed.trim();
  const others = input.deck.filter((entry) => entry.id !== input.card.id);
  if (typed && input.direction !== 'review') {
    const toMeaning = input.direction === 'target-to-meaning';
    const fold = toMeaning ? foldMeaning : foldKana;
    const attempt = fold(typed);
    // The typed answer is another card's answer: the classic mix-up.
    const owner = others.find((entry) => (toMeaning
      ? meaningSenses(entry.meaning).includes(attempt)
      : [entry.word, entry.reading].filter(Boolean).some((form) => fold(form) === attempt)));
    if (owner) {
      notes.push({ kind: 'other-card', vars: { typed, word: owner.word, meaning: owner.meaning } });
    }
    // A slip against any accepted form of the answer: one edit per four characters.
    const forms = toMeaning ? meaningSenses(input.expected) : [fold(input.expected), fold(input.card.reading)];
    const slip = forms.filter(Boolean).some((form) => {
      const expected = [...form];
      const distance = editDistance([...attempt], expected);
      return distance > 0 && distance <= Math.max(1, Math.floor(expected.length / 4));
    });
    if (!owner && slip) {
      notes.push({ kind: 'typo', vars: { typed, expected: input.expected } });
    }
    if (!toMeaning) {
      const shared = [...hanChars(typed)].filter((char) => hanChars(input.expected).has(char));
      if (shared.length && fold(typed) !== fold(input.expected)) {
        notes.push({ kind: 'typed-shares-kanji', vars: { typed, expected: input.expected, chars: shared.join('') } });
      }
    }
  }
  for (const neighbour of pickWhyWrongNeighbours(input.card, others, 6)) {
    if (notes.length >= 4) break;
    if (notes.some((note) => note.vars.word === neighbour.word)) continue;
    const sameReading = foldKana(neighbour.reading || neighbour.word) === foldKana(input.card.reading || input.card.word);
    const chars = [...hanChars(neighbour.word)].filter((char) => hanChars(input.card.word).has(char));
    if (sameReading) {
      notes.push({ kind: 'homophone', vars: { word: neighbour.word, reading: neighbour.reading, meaning: neighbour.meaning } });
    } else if (chars.length) {
      notes.push({ kind: 'shared-kanji', vars: { word: neighbour.word, meaning: neighbour.meaning, chars: chars.join('') } });
    } else {
      notes.push({ kind: 'similar-meaning', vars: { word: neighbour.word, meaning: neighbour.meaning } });
    }
  }
  if (!notes.length) notes.push({ kind: 'no-clue', vars: { word: input.card.word } });
  return notes;
}

/** Which accepted-answer list an accepted typed answer belongs to. */
export function acceptedAnswerSide(direction: WhyWrongDirection): 'meaning' | 'target' | null {
  if (direction === 'target-to-meaning') return 'meaning';
  if (direction === 'meaning-to-target') return 'target';
  return null;
}
