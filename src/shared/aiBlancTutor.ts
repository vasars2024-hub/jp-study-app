/**
 * The Blanc study tools' optional AI (docs/AI_AUDIT.md N27), kept minimal:
 *
 * - "Explain my mistake" in the conjugation drill and the counter reader. The
 *   tool already knows the right answer (`conjugate.ts`, `japaneseNumbers.ts`);
 *   the model only explains the gap. Fallback: where the two answers part, which
 *   is usually the rule (the ending that changes, the sound change in a counter).
 * - A memory aid for a kanji in the Kanji Inspector, and a short summary of a
 *   text sample in the Difficulty Analyzer. Fallback: the dictionary line, and
 *   the level, coverage and first unknown words the analyzer already computed.
 *
 * The panels load the code for this on first use only: Blanc is the low-RAM mode.
 */
import {
  clipList,
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const BLANC_MISTAKE_PROMPT_VERSION = 1;
export const BLANC_SUMMARY_PROMPT_VERSION = 1;

// ---- explain my mistake ------------------------------------------------------

export type BlancMistakeKind = 'conjugation' | 'counter';

export interface BlancMistakeRequest {
  requestId?: string;
  kind: BlancMistakeKind;
  /** The dictionary form or the number phrase asked about. */
  word: string;
  reading: string;
  meaning: string;
  /** What was asked: "te-form", "polite past", "reading of 3本". */
  task: string;
  expected: string;
  typed: string;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface BlancMistakeResult {
  explanation: string;
  /** The rule in one line, or ''. */
  rule: string;
  /** A way to remember it, or ''. */
  tip: string;
}

export function normalizeBlancMistakeRequest(input: unknown): BlancMistakeRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind: BlancMistakeKind = raw.kind === 'counter' ? 'counter' : 'conjugation';
  const word = clipText(raw.word, 40);
  const expected = clipText(raw.expected, 60);
  const typed = clipText(raw.typed, 60);
  if (!word || !expected || !typed || expected === typed) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    kind,
    word,
    reading: clipText(raw.reading, 60),
    meaning: clipText(raw.meaning, 120),
    task: clipText(raw.task, 80),
    expected,
    typed,
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function blancMistakeKeyParts(request: BlancMistakeRequest): string[] {
  return [request.kind, request.word, request.reading, request.meaning, request.task, request.expected, request.typed, request.answerLang];
}

export function buildBlancMistakePrompt(request: BlancMistakeRequest): string {
  const answer = promptLanguageName(request.answerLang);
  const what = request.kind === 'conjugation'
    ? `conjugate the Japanese word ${request.word}${request.reading && request.reading !== request.word ? ` (${request.reading})` : ''}${request.meaning ? `, "${request.meaning}"` : ''} into: ${request.task}`
    : `read the Japanese number phrase ${request.word}${request.task ? ` (${request.task})` : ''} aloud in kana`;
  return [
    `A learner was asked to ${what}.`,
    `- correct answer: ${request.expected}`,
    `- the learner wrote: ${request.typed}`,
    '',
    `Explain the mistake briefly, in ${answer}; quote Japanese exactly. The correct answer above is certain: do not dispute it.`,
    'Reply with JSON:',
    '- "explanation": one to three sentences: what went wrong and why the correct form is what it is.',
    '- "rule": the rule in one line (e.g. the ending change, the sound change), or "".',
    '- "tip": a short way to remember it, or "".',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const BLANC_MISTAKE_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
    rule: { type: 'string' },
    tip: { type: 'string' },
  },
  required: ['explanation', 'rule', 'tip'],
} as const;

export function finalizeBlancMistakeResult(parsed: { explanation: string; rule?: string; tip?: string }): BlancMistakeResult | null {
  const explanation = plainModelText(parsed.explanation, 500);
  if (!explanation) return null;
  return {
    explanation,
    rule: plainModelText(parsed.rule ?? '', 200).replace(/\s*\n\s*/g, ' '),
    tip: plainModelText(parsed.tip ?? '', 200).replace(/\s*\n\s*/g, ' '),
  };
}

export function isBlancMistakeResult(value: unknown): value is BlancMistakeResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.explanation === 'string' && v.explanation.length > 0 && typeof v.rule === 'string' && typeof v.tip === 'string';
}

export interface MistakeDiff {
  /** What both answers share at the start. */
  shared: string;
  /** Where they part: the expected tail and the typed tail. */
  expectedTail: string;
  typedTail: string;
}

/** Where the typed answer leaves the expected one (by character, from the start). */
export function blancMistakeDiff(expected: string, typed: string): MistakeDiff {
  const a = [...expected.trim()];
  const b = [...typed.trim()];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return { shared: a.slice(0, i).join(''), expectedTail: a.slice(i).join(''), typedTail: b.slice(i).join('') };
}

// ---- kanji memory aid / text summary -------------------------------------------

export type BlancSummaryKind = 'kanji' | 'text';

export interface BlancSummaryRequest {
  requestId?: string;
  kind: BlancSummaryKind;
  /** One kanji, or a text sample (at most 800 characters). */
  subject: string;
  reading: string;
  meaning: string;
  /** The analyzer's level label ("N3"), text only. */
  level: string;
  /** The analyzer's first unknown words, text only. */
  unknownWords: string[];
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface BlancSummaryResult {
  /** The memory aid (kanji) or the gist (text). */
  headline: string;
  /** Up to three short points: parts of the kanji, words to learn first. */
  points: string[];
}

export function normalizeBlancSummaryRequest(input: unknown): BlancSummaryRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind: BlancSummaryKind = raw.kind === 'text' ? 'text' : 'kanji';
  const subject = clipText(raw.subject, kind === 'kanji' ? 8 : 800);
  if (!subject) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    kind,
    subject: kind === 'kanji' ? ([...subject][0] ?? '') : subject,
    reading: clipText(raw.reading, 60),
    meaning: clipText(raw.meaning, 200),
    level: clipText(raw.level, 20),
    unknownWords: kind === 'text' ? clipList(raw.unknownWords, 20, 30) : [],
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function blancSummaryKeyParts(request: BlancSummaryRequest): string[] {
  return [request.kind, request.subject, request.reading, request.meaning, request.level, request.unknownWords.join('|'), request.studyLang, request.answerLang];
}

export function buildBlancSummaryPrompt(request: BlancSummaryRequest): string {
  const answer = promptLanguageName(request.answerLang);
  const study = promptLanguageName(request.studyLang);
  if (request.kind === 'kanji') {
    return [
      `Help a learner remember the kanji ${request.subject}${request.reading ? ` (read ${request.reading})` : ''}${request.meaning ? `, meaning "${request.meaning}"` : ''}.`,
      `Reply in ${answer} with JSON:`,
      '- "headline": a vivid one- or two-sentence memory aid linking the shape (its components) to the meaning. Do not invent etymology; say "picture it as" rather than "it comes from".',
      '- "points": up to 3 short points, e.g. its components, a common word that uses it with reading.',
      PLAIN_TEXT_RULE,
    ].join('\n');
  }
  return [
    `Summarize this ${study} text for a learner${request.level ? ` (the text is about ${request.level} level)` : ''}:`,
    request.subject,
    request.unknownWords.length ? `Words the learner does not know yet: ${request.unknownWords.join(', ')}` : '',
    `Reply in ${answer} with JSON:`,
    '- "headline": the gist in one or two sentences.',
    '- "points": up to 3 short points: which of the unknown words matter most for understanding this text, quoted exactly, with a short gloss.',
    PLAIN_TEXT_RULE,
  ].filter(Boolean).join('\n');
}

export const BLANC_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'points'],
} as const;

export function finalizeBlancSummaryResult(parsed: { headline: string; points?: string[] }): BlancSummaryResult | null {
  const headline = plainModelText(parsed.headline, 400);
  if (!headline) return null;
  const points = (parsed.points ?? [])
    .map((p) => plainModelText(p, 200).replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
    .slice(0, 3);
  return { headline, points };
}

export function isBlancSummaryResult(value: unknown): value is BlancSummaryResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.headline === 'string' && v.headline.length > 0 && Array.isArray(v.points)
    && v.points.length <= 3 && v.points.every((p) => typeof p === 'string');
}
