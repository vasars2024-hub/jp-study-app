/**
 * N2 i+1 example sentences — the request, the prompt, the reply contract and the
 * local i+1 check.
 *
 * The model is asked for 1–3 sentences that use the card's word and otherwise
 * only words the learner already knows (a sample of their known words is sent).
 * A model cannot be trusted to have obeyed, so every sentence is checked here and
 * in the renderer: it must contain the target word, and after tokenizing it with
 * the app's own tokenizer and looking every word up in the learner's knowledge
 * store, it may contain at most ONE unknown word — the target itself (i+1). A
 * sentence over that is shown as discarded, never offered for the card.
 *
 * Nothing is written to a card here. The learner ticks which sentences to keep.
 */
import {
  clipList,
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

export const EXAMPLE_SENTENCES_PROMPT_VERSION = 1;

/** How many known words travel with a request. Enough to steer, small enough to stay cheap. */
export const MAX_KNOWN_WORD_SAMPLE = 200;
export const MAX_EXAMPLE_SENTENCES = 3;

export interface ExampleSentencesRequest {
  requestId?: string;
  word: string;
  reading: string;
  meaning: string;
  /** A sample of words the learner knows (knowledge level Familiar or Known). */
  knownWords: string[];
  count: number;
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GeneratedExampleSentence {
  /** The sentence, in the study language. */
  text: string;
  /** Its translation into the UI language. */
  translation: string;
}

export interface ExampleSentencesResult {
  sentences: GeneratedExampleSentence[];
}

export function normalizeExampleSentencesRequest(input: unknown): ExampleSentencesRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const word = clipText(raw.word, 60);
  if (!word) return null;
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count)
    ? Math.min(MAX_EXAMPLE_SENTENCES, Math.max(1, Math.trunc(raw.count)))
    : MAX_EXAMPLE_SENTENCES;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    word,
    reading: clipText(raw.reading, 60),
    meaning: clipText(raw.meaning, 200),
    knownWords: clipList(raw.knownWords, MAX_KNOWN_WORD_SAMPLE, 24).filter((known) => known !== word),
    count,
    studyLang: normalizeAiStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

/**
 * The cache key leaves the known-word sample out on purpose: it changes with
 * every word the learner grades, and every answer is re-checked against the
 * CURRENT knowledge store before it is offered anyway.
 */
export function exampleSentencesKeyParts(request: ExampleSentencesRequest): string[] {
  return [request.word, request.reading, request.meaning, String(request.count), request.studyLang, request.answerLang];
}

export function buildExampleSentencesPrompt(request: ExampleSentencesRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const lines = [
    `Write ${request.count} short, natural ${study} example sentence${request.count === 1 ? '' : 's'} for a learner.`,
    `Each sentence MUST use the word "${request.word}"${request.reading && request.reading !== request.word ? ` (${request.reading})` : ''}, meaning "${request.meaning}". Inflected forms are fine.`,
    'Apart from that word, use ONLY words from the list of words the learner already knows, plus basic grammar (particles, copulas, auxiliaries) and simple numbers.',
    'Keep each sentence under 25 characters for Japanese or Chinese, or 12 words otherwise. Each sentence must show what the word means.',
    `Give each sentence a natural translation into ${answer}.`,
    '',
    'Words the learner knows:',
    request.knownWords.length ? request.knownWords.join(', ') : '(none recorded — use only very common, beginner words)',
    '',
    'Reply with JSON: {"sentences": [{"text": "...", "translation": "..."}]}.',
    PLAIN_TEXT_RULE,
  ];
  return lines.join('\n');
}

export const EXAMPLE_SENTENCES_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          translation: { type: 'string' },
        },
        required: ['text', 'translation'],
      },
    },
  },
  required: ['sentences'],
} as const;

/** Japanese verbs and adjectives inflect: 食べる → 食べた. Accept the kanji stem too. */
function stemsOf(word: string, reading: string): string[] {
  const forms = new Set<string>();
  for (const form of [word, reading]) {
    const plain = form.trim();
    if (!plain) continue;
    forms.add(plain);
    const chars = [...plain];
    const last = chars[chars.length - 1] ?? '';
    if (!/\p{Script=Hiragana}/u.test(last) || chars.length < 2) continue;
    // A suru-verb inflects its する: 勉強する → 勉強した.
    if (plain.endsWith('する') && chars.length > 2) forms.add(chars.slice(0, -2).join(''));
    // Otherwise only the final kana inflects: 食べる → 食べた, 高い → 高かった.
    const stem = chars.slice(0, -1).join('');
    if (/\p{Script=Han}/u.test(stem) || [...stem].length >= 2) forms.add(stem);
  }
  return [...forms];
}

/** The sentence actually uses the target word (allowing inflection and kana spelling). */
export function containsTargetWord(text: string, word: string, reading: string, studyLang: StudyLang): boolean {
  if (studyLang === 'ru') {
    const lower = text.toLowerCase();
    const stem = word.toLowerCase().slice(0, Math.max(3, word.length - 2));
    return lower.includes(word.toLowerCase()) || lower.includes(stem);
  }
  const haystack = toHiragana(text);
  return stemsOf(word, reading).some((form) => form && (text.includes(form) || haystack.includes(toHiragana(form))));
}

export function finalizeExampleSentencesResult(
  parsed: { sentences: Array<{ text: string; translation?: string }> },
  request: ExampleSentencesRequest,
): ExampleSentencesResult | null {
  const sentences: GeneratedExampleSentence[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.sentences) {
    if (sentences.length >= request.count) break;
    const text = plainModelText(raw.text, 160).replace(/\s*\n\s*/g, ' ');
    if (!text || seen.has(text)) continue;
    if (!containsTargetWord(text, request.word, request.reading, request.studyLang)) continue;
    seen.add(text);
    sentences.push({ text, translation: plainModelText(raw.translation ?? '', 240) });
  }
  return sentences.length ? { sentences } : null;
}

export function isExampleSentencesResult(value: unknown): value is ExampleSentencesResult {
  if (!value || typeof value !== 'object') return false;
  const list = (value as { sentences?: unknown }).sentences;
  return Array.isArray(list) && list.length > 0 && list.every((entry) => (
    !!entry && typeof entry === 'object'
    && typeof (entry as GeneratedExampleSentence).text === 'string'
    && (entry as GeneratedExampleSentence).text.length > 0
    && typeof (entry as GeneratedExampleSentence).translation === 'string'
  ));
}

// ---- the local i+1 check ---------------------------------------------------

export interface ExampleCoverageLike {
  /** Distinct content words below the known threshold, EXCLUDING the target. */
  unknown: number;
  /** Distinct content words, excluding the target. */
  words: number;
}

export interface ExampleAssessment {
  /** Unknown words counting the target when the learner does not know it yet. */
  unknown: number;
  /** 0–100: the share of the sentence's words the learner knows, target included. */
  coveragePercent: number | null;
  /** i+1 or better: offered for the card. */
  keep: boolean;
  /** The sentence could not be tokenized: not checked, offered unticked with a label. */
  unchecked: boolean;
}

/**
 * The i+1 rule. `coverage` is `exampleCoverage` over the sentence with the target
 * excluded; `targetKnown` says whether the learner already knows the target. A
 * sentence with more than one unknown word is discarded.
 */
export function assessExampleSentence(coverage: ExampleCoverageLike | null, targetKnown: boolean): ExampleAssessment {
  if (!coverage) return { unknown: 0, coveragePercent: null, keep: true, unchecked: true };
  const unknown = coverage.unknown + (targetKnown ? 0 : 1);
  const total = coverage.words + 1;
  const known = total - unknown;
  return {
    unknown,
    coveragePercent: Math.round((Math.max(0, known) / total) * 100),
    keep: unknown <= 1,
    unchecked: false,
  };
}

/** An example kept on a card. `origin` says who wrote it; the card shows it. */
export interface CardExampleSentence {
  text: string;
  translation?: string;
  origin: 'ai' | 'corpus';
}

/** Adds `incoming` to a card's examples, skipping duplicates, capped at `limit`. */
export function mergeCardExamples(
  existing: readonly CardExampleSentence[] | undefined,
  incoming: readonly CardExampleSentence[],
  limit = 6,
): CardExampleSentence[] {
  const out = [...(existing ?? [])];
  for (const entry of incoming) {
    const text = clipText(entry.text, 200);
    if (!text || out.some((kept) => kept.text === text)) continue;
    if (out.length >= limit) break;
    out.push({ text, ...(entry.translation ? { translation: clipText(entry.translation, 240) } : {}), origin: entry.origin });
  }
  return out;
}
