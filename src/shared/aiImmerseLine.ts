/**
 * The per-line AI helpers for reading (docs/AI_AUDIT.md N7/N12 family):
 *
 * - "Explain this line": a natural translation, why it is phrased that way, the
 *   grammar in it and what the one unknown word means here. Used for an i+1
 *   sentence in the immersion reader (`readerExplain`) and for the current
 *   visual-novel line with the lines around it (`vnExplain`).
 * - "Simplify this paragraph" (`readerSimplify`): the same content in easier
 *   study-language text, shown BESIDE the original and labelled as AI.
 * - "Translate with context" (`vnTranslate`): a translation of a mined VN line
 *   that has none, using the speaker and the previous lines.
 *
 * Each request is normalized here (never trusted), each reply is checked for
 * content after its shape, and only a reply that passes is cached or shown.
 *
 * Pure: the renderer and main both read it.
 */
import {
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { immerseLanguageName, immerseLevelScale, immerseTextInStudyLang } from './aiImmerseCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const LINE_EXPLAIN_PROMPT_VERSION = 1;
export const READER_SIMPLIFY_PROMPT_VERSION = 1;
export const CONTEXT_TRANSLATE_PROMPT_VERSION = 1;

/** The most text one "Simplify" sends: a paragraph, or the start of a page. */
export const READER_SIMPLIFY_MAX_CHARS = 1_500;
const LINE_MAX = 400;
const CONTEXT_MAX = 1_000;

export type LineExplainSurface = 'reader' | 'vn';

// ---- explain a line -----------------------------------------------------------

export interface LineExplainRequest {
  requestId?: string;
  refresh?: boolean;
  surface: LineExplainSurface;
  text: string;
  /** The unknown word (i+1 target), when known. */
  target: string;
  /** Surrounding lines (VN) or the paragraph (reader). */
  context: string;
  speaker: string;
  studyLang: StudyLang;
  answerLang: UiLang;
}

export interface LineExplainGrammar {
  pattern: string;
  note: string;
}

export interface LineExplainResult {
  translation: string;
  explanation: string;
  grammar: LineExplainGrammar[];
  /** What `target` means in this line; '' when there was no target. */
  targetMeaning: string;
}

export function normalizeLineExplainRequest(input: unknown): LineExplainRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = clipText(raw.text, LINE_MAX);
  if (!text) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  const context = typeof raw.context === 'string' ? raw.context.replace(/[ \t]+/g, ' ').trim().slice(0, CONTEXT_MAX) : '';
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    surface: raw.surface === 'vn' ? 'vn' : 'reader',
    text,
    target: clipText(raw.target, 40),
    context,
    speaker: clipText(raw.speaker, 60),
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
  };
}

export function lineExplainKeyParts(request: LineExplainRequest): string[] {
  return [request.surface, request.text, request.target, request.context, request.speaker, request.studyLang, request.answerLang];
}

export function buildLineExplainPrompt(request: LineExplainRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const where = request.surface === 'vn' ? 'a visual novel' : 'an article they are reading';
  return [
    `A ${study} learner (${immerseLevelScale(request.studyLang)} scale) asks about one line from ${where}.`,
    request.context ? `Context (the surrounding text, for meaning only):\n${request.context}` : '',
    request.speaker ? `Speaker: ${request.speaker}` : '',
    `Line: ${request.text}`,
    request.target ? `The learner does not know the word "${request.target}".` : '',
    '',
    'Reply with JSON:',
    `- "translation": a natural ${answer} translation of the line.`,
    `- "explanation": 2-3 short sentences in ${answer} on what the line means here and why it is phrased this way (tone, register, omitted words).`,
    `- "grammar": up to 4 items, each "pattern" (as written in the line, in ${study}) and "note" (one short sentence in ${answer}).`,
    request.target
      ? `- "targetMeaning": what "${request.target}" means in this line, in ${answer}, in a few words.`
      : '- "targetMeaning": an empty string.',
    'Do not invent story facts that are not in the line or the context.',
    PLAIN_TEXT_RULE,
  ].filter(Boolean).join('\n');
}

export const LINE_EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
    explanation: { type: 'string' },
    grammar: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pattern: { type: 'string' }, note: { type: 'string' } },
        required: ['pattern', 'note'],
      },
    },
    targetMeaning: { type: 'string' },
  },
  required: ['translation', 'explanation', 'grammar', 'targetMeaning'],
} as const;

export function finalizeLineExplainResult(
  parsed: { translation: string; explanation: string; grammar: { pattern: string; note: string }[]; targetMeaning: string },
  request: LineExplainRequest,
): LineExplainResult | null {
  const translation = plainModelText(parsed.translation, 600);
  const explanation = plainModelText(parsed.explanation, 900);
  if (!translation || !explanation) return null;
  // A "translation" that is the line again is no translation.
  if (translation.replace(/\s+/g, '') === request.text.replace(/\s+/g, '')) return null;
  const grammar: LineExplainGrammar[] = [];
  for (const entry of parsed.grammar) {
    if (grammar.length >= 4) break;
    const pattern = plainModelText(entry.pattern, 60);
    const note = plainModelText(entry.note, 300);
    if (pattern && note) grammar.push({ pattern, note });
  }
  return {
    translation,
    explanation,
    grammar,
    targetMeaning: request.target ? plainModelText(parsed.targetMeaning, 200) : '',
  };
}

export function isLineExplainResult(value: unknown): value is LineExplainResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.translation === 'string' && v.translation.length > 0
    && typeof v.explanation === 'string' && v.explanation.length > 0
    && Array.isArray(v.grammar) && typeof v.targetMeaning === 'string';
}

// ---- simplify a paragraph ---------------------------------------------------

export interface ReaderSimplifyRequest {
  requestId?: string;
  refresh?: boolean;
  text: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  level: string;
  /** Words on the page the learner does not know yet; the rewrite should avoid or explain them. */
  unknownWords: string[];
}

export interface ReaderSimplifyResult {
  simplified: string;
  notes: string[];
}

export function normalizeReaderSimplifyRequest(input: unknown): ReaderSimplifyRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === 'string'
    ? raw.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, READER_SIMPLIFY_MAX_CHARS)
    : '';
  if (!text) return null;
  const studyLang = normalizeStudyLang(raw.studyLang);
  if (!immerseTextInStudyLang(text, studyLang)) return null;
  const unknownWords = Array.isArray(raw.unknownWords)
    ? [...new Set(raw.unknownWords.map((w) => clipText(w, 30)).filter(Boolean))].slice(0, 40)
    : [];
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    text,
    studyLang,
    answerLang: normalizeAnswerLang(raw.answerLang),
    level: clipText(raw.level, 160),
    unknownWords,
  };
}

export function readerSimplifyKeyParts(request: ReaderSimplifyRequest): string[] {
  return [request.text, request.studyLang, request.answerLang, request.level, request.unknownWords.join(',')];
}

export function buildReaderSimplifyPrompt(request: ReaderSimplifyRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `Rewrite this ${study} text so a learner can read it. Learner level: ${request.level || 'unknown'}.`,
    request.unknownWords.length
      ? `Words the learner does not know yet (replace them with easier words where you can): ${request.unknownWords.join(', ')}`
      : '',
    'Text:',
    request.text,
    '',
    'Reply with JSON:',
    `- "simplified": the same content in simpler, natural ${study}. Keep every fact; do not add any. Keep paragraph breaks.`,
    `- "notes": up to 4 short notes in ${answer} on the biggest changes (which hard word or pattern became what).`,
    PLAIN_TEXT_RULE,
  ].filter(Boolean).join('\n');
}

export const READER_SIMPLIFY_SCHEMA = {
  type: 'object',
  properties: {
    simplified: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['simplified', 'notes'],
} as const;

export function finalizeReaderSimplifyResult(
  parsed: { simplified: string; notes: string[] },
  request: ReaderSimplifyRequest,
): ReaderSimplifyResult | null {
  const limit = request.text.length * 2 + 80;
  const simplified = plainModelText(parsed.simplified, limit + 1);
  if (!simplified || simplified.length > limit) return null;
  if (!immerseTextInStudyLang(simplified, request.studyLang)) return null;
  if (simplified.replace(/\s+/g, '') === request.text.replace(/\s+/g, '')) return null;
  const notes = parsed.notes.map((note) => plainModelText(note, 240)).filter(Boolean).slice(0, 4);
  return { simplified, notes };
}

export function isReaderSimplifyResult(value: unknown): value is ReaderSimplifyResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.simplified === 'string' && v.simplified.length > 0
    && Array.isArray(v.notes) && v.notes.every((n) => typeof n === 'string');
}

// ---- translate a line with its context -----------------------------------------

export interface ContextTranslateRequest {
  requestId?: string;
  refresh?: boolean;
  text: string;
  context: string;
  speaker: string;
  studyLang: StudyLang;
  /** The learner's translation target (`translateTarget.ts`), a language code. */
  targetLang: string;
}

export interface ContextTranslateResult {
  translation: string;
}

export function normalizeContextTranslateRequest(input: unknown): ContextTranslateRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = clipText(raw.text, LINE_MAX);
  if (!text) return null;
  const target = typeof raw.targetLang === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(raw.targetLang)
    ? raw.targetLang
    : 'en';
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    text,
    context: typeof raw.context === 'string' ? raw.context.replace(/[ \t]+/g, ' ').trim().slice(0, CONTEXT_MAX) : '',
    speaker: clipText(raw.speaker, 60),
    studyLang: normalizeStudyLang(raw.studyLang),
    targetLang: target,
  };
}

export function contextTranslateKeyParts(request: ContextTranslateRequest): string[] {
  return [request.text, request.context, request.speaker, request.studyLang, request.targetLang];
}

export function buildContextTranslatePrompt(request: ContextTranslateRequest): string {
  const study = promptLanguageName(request.studyLang);
  const target = immerseLanguageName(request.targetLang);
  return [
    `Translate one ${study} line from a visual novel into ${target}.`,
    request.context ? `Previous lines (context only, do not translate them):\n${request.context}` : '',
    request.speaker ? `Speaker: ${request.speaker}` : '',
    `Line: ${request.text}`,
    '',
    `Reply with JSON: "translation": a natural ${target} translation of the line only, keeping the speaker's tone. Keep character names consistent with the context.`,
    PLAIN_TEXT_RULE,
  ].filter(Boolean).join('\n');
}

export const CONTEXT_TRANSLATE_SCHEMA = {
  type: 'object',
  properties: { translation: { type: 'string' } },
  required: ['translation'],
} as const;

export function finalizeContextTranslateResult(
  parsed: { translation: string },
  request: ContextTranslateRequest,
): ContextTranslateResult | null {
  const limit = request.text.length * 6 + 80;
  const translation = plainModelText(parsed.translation, limit + 1);
  if (!translation || translation.length > limit) return null;
  if (translation.replace(/\s+/g, '') === request.text.replace(/\s+/g, '')) return null;
  return { translation };
}

export function isContextTranslateResult(value: unknown): value is ContextTranslateResult {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as ContextTranslateResult).translation === 'string'
    && (value as ContextTranslateResult).translation.length > 0;
}
