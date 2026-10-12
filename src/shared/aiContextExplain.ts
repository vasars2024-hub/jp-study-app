/**
 * N5 "Explain in context" — which dictionary sense a word has in the sentence it
 * was looked up from, and why.
 *
 * The popup dictionary lists every sense of a word; a reader who met it in a
 * sentence wants the one that sentence uses. The model is given the sentence and
 * the numbered senses and must pick one by number (or none) and say why in a
 * sentence or two. A number outside the list is an invalid reply, never a guess
 * shown as an answer.
 *
 * The fallback needs no model: dictionary order puts the most common sense first,
 * so the first sense is marked "most common", honestly labelled as a heuristic.
 */
import {
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import type { UiLang } from './i18n/core';

export const CONTEXT_EXPLAIN_PROMPT_VERSION = 1;
export const MAX_CONTEXT_SENSES = 12;

export interface ContextExplainRequest {
  requestId?: string;
  word: string;
  reading: string;
  /** The dictionary's language: the word's, not the UI's. */
  lang: string;
  sentence: string;
  /** One line per sense, in dictionary order. */
  senses: string[];
  answerLang: UiLang;
  refresh?: boolean;
}

export const CONTEXT_EXPLAIN_CONFIDENCE = ['high', 'medium', 'low'] as const;
export type ContextExplainConfidence = (typeof CONTEXT_EXPLAIN_CONFIDENCE)[number];

export interface ContextExplainResult {
  /** 0-based index into `senses`, or -1 when none of them fits. */
  senseIndex: number;
  explanation: string;
  confidence: ContextExplainConfidence;
}

/** One line per sense from the shape `DictEntry.senses` has. */
export function contextSenseLines(
  senses: ReadonlyArray<{ definitions?: readonly string[]; partsOfSpeech?: readonly string[] }> | undefined,
): string[] {
  const out: string[] = [];
  for (const sense of senses ?? []) {
    if (out.length >= MAX_CONTEXT_SENSES) break;
    const glosses = (sense.definitions ?? []).map((d) => (typeof d === 'string' ? d.trim() : '')).filter(Boolean);
    if (!glosses.length) continue;
    out.push(clipText(glosses.join('; '), 200));
  }
  return out;
}

export function normalizeContextExplainRequest(input: unknown): ContextExplainRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const word = clipText(raw.word, 60);
  const sentence = clipText(raw.sentence, 400);
  const senses = Array.isArray(raw.senses)
    ? raw.senses.map((s) => clipText(s, 200)).filter(Boolean).slice(0, MAX_CONTEXT_SENSES)
    : [];
  if (!word || !sentence || senses.length === 0) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    word,
    reading: clipText(raw.reading, 60),
    lang: typeof raw.lang === 'string' && /^[a-z]{2}$/.test(raw.lang) ? raw.lang : 'ja',
    sentence,
    senses,
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

/** Keyed on the word, the sentence, the senses offered and the answer language. */
export function contextExplainKeyParts(request: ContextExplainRequest): string[] {
  return [request.word, request.reading, request.lang, request.sentence, request.senses.join('\n'), request.answerLang];
}

export function buildContextExplainPrompt(request: ContextExplainRequest): string {
  const study = promptLanguageName(request.lang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A learner looked up the ${study} word "${request.word}"${request.reading && request.reading !== request.word ? ` (${request.reading})` : ''} in this sentence:`,
    request.sentence,
    '',
    'The dictionary lists these senses:',
    ...request.senses.map((sense, index) => `${index + 1}. ${sense}`),
    '',
    'Which sense does the word have IN THIS SENTENCE?',
    'Reply with JSON:',
    `- "sense": the number of the sense (1 to ${request.senses.length}), or 0 if none of them fits.`,
    `- "explanation": one or two short sentences in ${answer} saying why this sense fits here (mention the words around it).`,
    '- "confidence": "high", "medium" or "low".',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const CONTEXT_EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    sense: { type: 'integer' },
    explanation: { type: 'string' },
    confidence: { type: 'string', enum: [...CONTEXT_EXPLAIN_CONFIDENCE] },
  },
  required: ['sense', 'explanation', 'confidence'],
} as const;

export function finalizeContextExplainResult(
  parsed: { sense: number; explanation: string; confidence?: string },
  request: ContextExplainRequest,
): ContextExplainResult | null {
  if (!Number.isInteger(parsed.sense) || parsed.sense < 0 || parsed.sense > request.senses.length) return null;
  const explanation = plainModelText(parsed.explanation, 500);
  if (!explanation) return null;
  const confidence = (CONTEXT_EXPLAIN_CONFIDENCE as readonly string[]).includes(parsed.confidence ?? '')
    ? parsed.confidence as ContextExplainConfidence
    : 'low';
  return { senseIndex: parsed.sense - 1, explanation, confidence };
}

export function isContextExplainResult(value: unknown): value is ContextExplainResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.senseIndex === 'number' && Number.isInteger(v.senseIndex) && v.senseIndex >= -1
    && typeof v.explanation === 'string' && v.explanation.length > 0
    && typeof v.confidence === 'string' && (CONTEXT_EXPLAIN_CONFIDENCE as readonly string[]).includes(v.confidence);
}

/** Without a model: dictionary order lists the most common sense first. */
export function contextExplainFallback(senses: readonly string[]): { senseIndex: number } | null {
  return senses.length ? { senseIndex: 0 } : null;
}
