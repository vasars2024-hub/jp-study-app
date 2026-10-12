/**
 * The optional AI helpers for grammar points — requests, prompts, reply
 * contracts and the deterministic fallbacks (feature list: `aiTutorCommon.ts`).
 *
 * - Explain: a point the reference says nothing about (`isHollowGrammarPoint`)
 *   gets a short explanation. Fallback: what the pattern's own shape says —
 *   where it attaches and which parts are fixed.
 * - Examples: sentences that use the pattern, each checked to show it; nothing
 *   is saved until the learner ticks it, and saved ones are marked generated.
 * - Production: the learner writes a sentence with the pattern; the model says
 *   whether the pattern is used, correctly and naturally, and suggests a rating
 *   the learner confirms. The suggestion is made CONSISTENT with the verdict
 *   here, not trusted. Fallback: whether the offline matcher finds the pattern.
 * - Sightings: confirm or reject the offline matcher's sightings. Never removes
 *   a sighting; it only labels them. Fallback: the sightings as they are.
 */
import {
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { immerseLevelScale } from './aiImmerseCommon';
import { tutorTextInStudyLang } from './aiTutorCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const GRAMMAR_EXPLAIN_PROMPT_VERSION = 1;
export const GRAMMAR_EXAMPLES_PROMPT_VERSION = 1;
export const GRAMMAR_PRODUCTION_PROMPT_VERSION = 1;
export const GRAMMAR_SIGHTING_PROMPT_VERSION = 1;

/** What the helpers need to know about a grammar point. */
export interface GrammarPointBrief {
  id: string;
  title: string;
  meaning: string;
  structure: string;
  explanation: string;
  level: string;
  lang: StudyLang;
}

export function normalizeGrammarPointBrief(value: unknown): GrammarPointBrief | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = clipText(raw.title, 80);
  if (!title) return null;
  return {
    id: clipText(raw.id, 120) || title,
    title,
    meaning: clipText(raw.meaning, 200),
    structure: clipText(raw.structure, 200),
    explanation: clipText(raw.explanation, 600),
    level: clipText(raw.level, 12),
    lang: normalizeStudyLang(raw.lang),
  };
}

function pointKeyParts(point: GrammarPointBrief): string[] {
  return [point.id, point.title, point.meaning, point.structure, point.explanation, point.level, point.lang];
}

function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

function pointPromptLines(point: GrammarPointBrief): string[] {
  return [
    `- pattern: ${point.title}`,
    point.level ? `- level: ${point.level}` : '',
    point.meaning ? `- gloss: ${point.meaning}` : '',
    point.structure && !sameText(point.structure, point.title) ? `- structure: ${point.structure}` : '',
    point.explanation && !sameText(point.explanation, point.meaning) ? `- note: ${point.explanation}` : '',
  ].filter(Boolean);
}

// ---- the pattern's own shape (deterministic) --------------------------------

const PLACEHOLDER = /[～〜~]/u;

function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The fixed parts of a pattern title, in order: "も〜ば〜も" → [も, ば, も]. Notes in brackets are dropped. */
export function grammarPatternFragments(title: string, lang: StudyLang): string[] {
  const cleaned = title.replace(/[（(][^）)]*[）)]/gu, ' ');
  return cleaned
    .split(/[～〜~…・/／,、+＋|]+|\.{2,}/u)
    .map((part) => part.trim())
    .filter((part) => part && tutorTextInStudyLang(part, lang));
}

/**
 * Whether a sentence plausibly shows the pattern: the longest fixed part (or,
 * for a conjugating one, its first two characters) appears, and at least half
 * of the fixed parts do. Deliberately loose — a conjugated pattern changes its
 * tail — but it rejects a sentence that does not use the pattern at all.
 */
export function sentenceShowsGrammarPattern(sentence: string, title: string, lang: StudyLang): boolean {
  const fragments = grammarPatternFragments(title, lang).map(normalizeForMatch).filter(Boolean);
  if (!fragments.length) return tutorTextInStudyLang(sentence, lang);
  const text = normalizeForMatch(sentence);
  const lead = (fragment: string): string => [...fragment].slice(0, Math.min(2, [...fragment].length)).join('');
  const longest = [...fragments].sort((a, b) => [...b].length - [...a].length)[0];
  if (!text.includes(lead(longest))) return false;
  const hits = fragments.filter((fragment) => text.includes(fragment) || text.includes(lead(fragment))).length;
  return hits / fragments.length >= 0.5;
}

export type GrammarAttach = 'after' | 'before' | 'frame' | 'standalone';

export interface GrammarExplainFallback {
  /** Where the slot(s) are: after a word ("〜てください"), before ("お〜"), around ("も〜ば〜も"), none. */
  attach: GrammarAttach;
  /** The fixed parts the learner has to produce. */
  fragments: string[];
}

export function grammarExplainFallback(point: Pick<GrammarPointBrief, 'title' | 'lang'>): GrammarExplainFallback {
  const title = point.title.replace(/[（(][^）)]*[）)]/gu, '').trim();
  const fragments = grammarPatternFragments(title, point.lang);
  const slots = (title.match(/[～〜~]|\.{2,}|…/gu) ?? []).length;
  let attach: GrammarAttach = 'standalone';
  if (slots > 1 || (slots === 1 && !PLACEHOLDER.test(title[0] ?? '') && !/[～〜~…]$/u.test(title))) attach = 'frame';
  else if (slots === 1 && /^[～〜~…]/u.test(title)) attach = 'after';
  else if (slots === 1) attach = 'before';
  return { attach, fragments };
}

// ---- (a) explain -------------------------------------------------------------

export interface GrammarExplainRequest {
  requestId?: string;
  point: GrammarPointBrief;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GrammarExplainExample {
  text: string;
  translation: string;
}

export interface GrammarExplainResult {
  /** One sentence: what the pattern expresses. */
  summary: string;
  /** How it is formed: what comes before it. */
  formation: string;
  /** When to use it, register. May be ''. */
  usage: string;
  /** How it differs from a close alternative. May be ''. */
  nuance: string;
  /** Up to two short examples that show the pattern. */
  examples: GrammarExplainExample[];
}

function requestBase(raw: Record<string, unknown>): { requestId?: string; answerLang: UiLang; refresh?: boolean } {
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function normalizeGrammarExplainRequest(input: unknown): GrammarExplainRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const point = normalizeGrammarPointBrief(raw.point);
  if (!point) return null;
  return { ...requestBase(raw), point };
}

export function grammarExplainKeyParts(request: GrammarExplainRequest): string[] {
  return [...pointKeyParts(request.point), request.answerLang];
}

export function buildGrammarExplainPrompt(request: GrammarExplainRequest): string {
  const study = promptLanguageName(request.point.lang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A learner of ${study} (${immerseLevelScale(request.point.lang)} scale) asks about this grammar pattern. The reference they use says almost nothing about it:`,
    ...pointPromptLines(request.point),
    '',
    `Explain it briefly. Write every explanation in ${answer}; quote ${study} forms exactly as written.`,
    'Reply with JSON:',
    '- "summary": one sentence: what the pattern expresses.',
    '- "formation": how it is formed: which word forms come before or around it.',
    '- "usage": one or two sentences on when it is used (register, typical situations), or "".',
    '- "nuance": one sentence on how it differs from the closest similar pattern, naming it, or "".',
    `- "examples": exactly 2 short, natural ${study} sentences that use the pattern, each {"text", "translation"} with the translation in ${answer}.`,
    'If you are not sure about a detail, leave that field "" rather than guessing.',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const GRAMMAR_EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    formation: { type: 'string' },
    usage: { type: 'string' },
    nuance: { type: 'string' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, translation: { type: 'string' } },
        required: ['text', 'translation'],
      },
    },
  },
  required: ['summary', 'formation', 'usage', 'nuance', 'examples'],
} as const;

export function finalizeGrammarExplainResult(
  parsed: { summary: string; formation: string; usage?: string; nuance?: string; examples?: Array<{ text: string; translation?: string }> },
  request: GrammarExplainRequest,
): GrammarExplainResult | null {
  const summary = plainModelText(parsed.summary, 300);
  const formation = plainModelText(parsed.formation, 300);
  if (!summary || !formation) return null;
  const { point } = request;
  const seen = new Set<string>();
  const examples: GrammarExplainExample[] = [];
  for (const example of parsed.examples ?? []) {
    const text = plainModelText(example.text, 120).replace(/\s*\n\s*/g, ' ');
    if (!text || seen.has(text)) continue;
    if (!tutorTextInStudyLang(text, point.lang) || !sentenceShowsGrammarPattern(text, point.title, point.lang)) continue;
    seen.add(text);
    examples.push({ text, translation: plainModelText(example.translation ?? '', 200) });
    if (examples.length >= 2) break;
  }
  return {
    summary,
    formation,
    usage: plainModelText(parsed.usage ?? '', 400),
    nuance: plainModelText(parsed.nuance ?? '', 300),
    examples,
  };
}

function isExampleList(value: unknown): value is GrammarExplainExample[] {
  return Array.isArray(value) && value.every((e) => !!e && typeof e === 'object'
    && typeof (e as GrammarExplainExample).text === 'string' && typeof (e as GrammarExplainExample).translation === 'string');
}

export function isGrammarExplainResult(value: unknown): value is GrammarExplainResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === 'string' && v.summary.length > 0
    && typeof v.formation === 'string' && v.formation.length > 0
    && typeof v.usage === 'string' && typeof v.nuance === 'string'
    && isExampleList(v.examples);
}

// ---- (b) examples ------------------------------------------------------------

export interface GrammarExamplesRequest {
  requestId?: string;
  point: GrammarPointBrief;
  count: number;
  /** Sentences the point already has, so none is offered twice. */
  avoid: string[];
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GrammarGeneratedExample {
  text: string;
  /** Kana / pinyin / stress-marked reading, or ''. */
  reading: string;
  translation: string;
}

export interface GrammarExamplesResult {
  sentences: GrammarGeneratedExample[];
}

export function normalizeGrammarExamplesRequest(input: unknown): GrammarExamplesRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const point = normalizeGrammarPointBrief(raw.point);
  if (!point) return null;
  const avoid: string[] = [];
  if (Array.isArray(raw.avoid)) {
    for (const entry of raw.avoid) {
      if (avoid.length >= 12) break;
      const text = clipText(entry, 160);
      if (text) avoid.push(text);
    }
  }
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.max(1, Math.min(5, Math.trunc(raw.count))) : 3;
  return { ...requestBase(raw), point, count, avoid };
}

export function grammarExamplesKeyParts(request: GrammarExamplesRequest): string[] {
  return [...pointKeyParts(request.point), String(request.count), request.avoid.join('\u0001'), request.answerLang];
}

export function buildGrammarExamplesPrompt(request: GrammarExamplesRequest): string {
  const { point } = request;
  const study = promptLanguageName(point.lang);
  const answer = promptLanguageName(request.answerLang);
  const lines = [
    `Write ${request.count} short, natural ${study} example sentences that each use this grammar pattern, for a learner at ${point.level || 'their'} level (${immerseLevelScale(point.lang)} scale):`,
    ...pointPromptLines(point),
    '',
    'Keep the rest of each sentence simple, everyday and at or below the pattern\'s level.',
  ];
  if (request.avoid.length) {
    lines.push('Do not repeat these existing examples:');
    for (const text of request.avoid) lines.push(`- ${text}`);
  }
  lines.push(
    'Reply with JSON: {"sentences": [{"text", "reading", "translation"}]}.',
    `- "text": the ${study} sentence. "reading": ${point.lang === 'ja' ? 'the whole sentence in hiragana' : point.lang === 'zh' ? 'pinyin with tone marks' : 'the sentence with stress marks'}, or "".`,
    `- "translation": a natural ${answer} translation.`,
    PLAIN_TEXT_RULE,
  );
  return lines.join('\n');
}

export const GRAMMAR_EXAMPLES_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, reading: { type: 'string' }, translation: { type: 'string' } },
        required: ['text', 'reading', 'translation'],
      },
    },
  },
  required: ['sentences'],
} as const;

/** Each sentence must be in the study language, show the pattern, be new and carry a translation. */
export function finalizeGrammarExamplesResult(
  parsed: { sentences: Array<{ text: string; reading?: string; translation?: string }> },
  request: GrammarExamplesRequest,
): GrammarExamplesResult | null {
  const { point } = request;
  const seen = new Set(request.avoid.map(normalizeForMatch));
  const sentences: GrammarGeneratedExample[] = [];
  for (const raw of parsed.sentences) {
    const text = plainModelText(raw.text, 120).replace(/\s*\n\s*/g, ' ');
    const translation = plainModelText(raw.translation ?? '', 200).replace(/\s*\n\s*/g, ' ');
    if (!text || !translation) continue;
    const key = normalizeForMatch(text);
    if (seen.has(key)) continue;
    if (!tutorTextInStudyLang(text, point.lang) || !sentenceShowsGrammarPattern(text, point.title, point.lang)) continue;
    seen.add(key);
    sentences.push({ text, reading: plainModelText(raw.reading ?? '', 200).replace(/\s*\n\s*/g, ' '), translation });
    if (sentences.length >= request.count) break;
  }
  return sentences.length ? { sentences } : null;
}

export function isGrammarExamplesResult(value: unknown): value is GrammarExamplesResult {
  if (!value || typeof value !== 'object') return false;
  const list = (value as Record<string, unknown>).sentences;
  return Array.isArray(list) && list.length > 0 && list.every((s) => !!s && typeof s === 'object'
    && typeof (s as GrammarGeneratedExample).text === 'string' && (s as GrammarGeneratedExample).text.length > 0
    && typeof (s as GrammarGeneratedExample).reading === 'string'
    && typeof (s as GrammarGeneratedExample).translation === 'string');
}

// ---- (c) production ----------------------------------------------------------

/** The three self-grades of the practice test and the review card (`AnswerGrade`). */
export type GrammarSuggestedRating = 'hard' | 'okay' | 'good';

export const GRAMMAR_SUGGESTED_RATINGS: readonly GrammarSuggestedRating[] = ['hard', 'okay', 'good'];

export interface GrammarProductionRequest {
  requestId?: string;
  point: GrammarPointBrief;
  /** What the learner wrote. */
  sentence: string;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GrammarProductionResult {
  /** The sentence uses the pattern at all. */
  usesPattern: boolean;
  /** …and uses it correctly (form and meaning). */
  correct: boolean;
  /** …and the sentence sounds natural. */
  natural: boolean;
  explanation: string;
  /** A corrected or more natural version, or '' when none is needed. */
  corrected: string;
  /** Consistent with the three verdicts above; the learner confirms it. */
  suggestedRating: GrammarSuggestedRating;
}

export function normalizeGrammarProductionRequest(input: unknown): GrammarProductionRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const point = normalizeGrammarPointBrief(raw.point);
  const sentence = clipText(raw.sentence, 200);
  if (!point || !sentence || !tutorTextInStudyLang(sentence, point.lang)) return null;
  return { ...requestBase(raw), point, sentence };
}

export function grammarProductionKeyParts(request: GrammarProductionRequest): string[] {
  return [...pointKeyParts(request.point), request.sentence, request.answerLang];
}

export function buildGrammarProductionPrompt(request: GrammarProductionRequest): string {
  const { point } = request;
  const study = promptLanguageName(point.lang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A learner of ${study} practised this grammar pattern by writing their own sentence.`,
    ...pointPromptLines(point),
    `- the learner's sentence: ${request.sentence}`,
    '',
    `Grade it like a patient teacher. Write the explanation in ${answer}; quote ${study} exactly.`,
    'Reply with JSON:',
    '- "usesPattern": true if the sentence uses this pattern at all.',
    '- "correct": true if the pattern is formed and used correctly for its meaning.',
    '- "natural": true if a native speaker would say it this way.',
    '- "explanation": one to three sentences: what is right, what is wrong and why.',
    `- "corrected": the sentence corrected or made natural, in ${study}, or "" if it is already fine.`,
    '- "suggestedRating": "hard" if the pattern is missing or wrong, "okay" if correct but unnatural or hesitant, "good" if correct and natural.',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const GRAMMAR_PRODUCTION_SCHEMA = {
  type: 'object',
  properties: {
    usesPattern: { type: 'boolean' },
    correct: { type: 'boolean' },
    natural: { type: 'boolean' },
    explanation: { type: 'string' },
    corrected: { type: 'string' },
    suggestedRating: { type: 'string', enum: ['hard', 'okay', 'good'] },
  },
  required: ['usesPattern', 'correct', 'natural', 'explanation', 'corrected', 'suggestedRating'],
} as const;

/**
 * The rating the verdicts allow. A pattern that is missing or wrong is Hard
 * whatever the model suggested; a correct but unnatural sentence is at most
 * Okay; a correct, natural one is at least Okay.
 */
export function consistentGrammarRating(
  verdict: { usesPattern: boolean; correct: boolean; natural: boolean },
  suggested: string,
): GrammarSuggestedRating {
  if (!verdict.usesPattern || !verdict.correct) return 'hard';
  if (!verdict.natural) return 'okay';
  return suggested === 'good' ? 'good' : 'okay';
}

export function finalizeGrammarProductionResult(
  parsed: { usesPattern: boolean; correct: boolean; natural: boolean; explanation: string; corrected?: string; suggestedRating: string },
  request: GrammarProductionRequest,
): GrammarProductionResult | null {
  const explanation = plainModelText(parsed.explanation, 600);
  if (!explanation) return null;
  // A sentence that does not use the pattern cannot use it correctly.
  const usesPattern = parsed.usesPattern;
  const correct = usesPattern && parsed.correct;
  const natural = parsed.natural;
  let corrected = plainModelText(parsed.corrected ?? '', 200).replace(/\s*\n\s*/g, ' ');
  if (corrected && (!tutorTextInStudyLang(corrected, request.point.lang) || normalizeForMatch(corrected) === normalizeForMatch(request.sentence))) {
    corrected = '';
  }
  return {
    usesPattern,
    correct,
    natural,
    explanation,
    corrected,
    suggestedRating: consistentGrammarRating({ usesPattern, correct, natural }, parsed.suggestedRating),
  };
}

export function isGrammarProductionResult(value: unknown): value is GrammarProductionResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.usesPattern === 'boolean' && typeof v.correct === 'boolean' && typeof v.natural === 'boolean'
    && typeof v.explanation === 'string' && v.explanation.length > 0 && typeof v.corrected === 'string'
    && (GRAMMAR_SUGGESTED_RATINGS as readonly unknown[]).includes(v.suggestedRating);
}

export interface GrammarProductionFallback {
  usesPattern: boolean;
  suggestedRating: GrammarSuggestedRating;
}

/**
 * Without a model: the pattern is "used" when the offline highlighter claims it
 * (`matcherFound`) or the fixed parts are there; correctness cannot be judged,
 * so the best suggestion is Okay, and Hard when the pattern is missing.
 */
export function grammarProductionFallback(
  sentence: string,
  point: Pick<GrammarPointBrief, 'title' | 'lang'>,
  matcherFound: boolean,
): GrammarProductionFallback {
  const usesPattern = matcherFound || sentenceShowsGrammarPattern(sentence, point.title, point.lang);
  return { usesPattern, suggestedRating: usesPattern ? 'okay' : 'hard' };
}

// ---- (d) sightings -----------------------------------------------------------

export interface GrammarSightingInput {
  id: string;
  text: string;
}

export interface GrammarSightingRequest {
  requestId?: string;
  point: GrammarPointBrief;
  sentences: GrammarSightingInput[];
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GrammarSightingVerdict {
  id: string;
  /** The sentence really uses this pattern (not a lookalike string). */
  uses: boolean;
  note: string;
}

export interface GrammarSightingResult {
  verdicts: GrammarSightingVerdict[];
}

const SIGHTING_ID = /^[A-Za-z0-9_:.-]{1,120}$/;
export const MAX_GRAMMAR_SIGHTING_CHECKS = 6;

export function normalizeGrammarSightingRequest(input: unknown): GrammarSightingRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const point = normalizeGrammarPointBrief(raw.point);
  if (!point || !Array.isArray(raw.sentences)) return null;
  const sentences: GrammarSightingInput[] = [];
  const ids = new Set<string>();
  for (const entry of raw.sentences) {
    if (sentences.length >= MAX_GRAMMAR_SIGHTING_CHECKS) break;
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' && SIGHTING_ID.test(e.id) ? e.id : '';
    const text = clipText(e.text, 200);
    if (!id || !text || ids.has(id)) continue;
    ids.add(id);
    sentences.push({ id, text });
  }
  if (!sentences.length) return null;
  return { ...requestBase(raw), point, sentences };
}

export function grammarSightingKeyParts(request: GrammarSightingRequest): string[] {
  return [...pointKeyParts(request.point), request.sentences.map((s) => `${s.id}|${s.text}`).join('\u0001'), request.answerLang];
}

export function buildGrammarSightingPrompt(request: GrammarSightingRequest): string {
  const { point } = request;
  const study = promptLanguageName(point.lang);
  const answer = promptLanguageName(request.answerLang);
  const lines = [
    `A string matcher flagged these ${study} sentences as using a grammar pattern. Check each one: does the sentence really use THIS pattern with this meaning, or only contain similar characters?`,
    ...pointPromptLines(point),
    '',
    'Sentences:',
    ...request.sentences.map((s) => `- [${s.id}] ${s.text}`),
    '',
    'Reply with JSON: {"verdicts": [{"id", "uses", "note"}]} with one verdict for EVERY id above.',
    `- "uses": true or false. "note": at most one short sentence in ${answer} saying why.`,
    PLAIN_TEXT_RULE,
  ];
  return lines.join('\n');
}

export const GRAMMAR_SIGHTING_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, uses: { type: 'boolean' }, note: { type: 'string' } },
        required: ['id', 'uses', 'note'],
      },
    },
  },
  required: ['verdicts'],
} as const;

/** Complete or nothing: every sentence asked about must have exactly one verdict. */
export function finalizeGrammarSightingResult(
  parsed: { verdicts: Array<{ id: string; uses: boolean; note?: string }> },
  request: GrammarSightingRequest,
): GrammarSightingResult | null {
  const wanted = new Set(request.sentences.map((s) => s.id));
  const byId = new Map<string, GrammarSightingVerdict>();
  for (const verdict of parsed.verdicts) {
    const id = String(verdict.id).replace(/^\[|\]$/g, '');
    if (!wanted.has(id) || byId.has(id)) continue;
    byId.set(id, { id, uses: verdict.uses, note: plainModelText(verdict.note ?? '', 200).replace(/\s*\n\s*/g, ' ') });
  }
  if (byId.size !== wanted.size) return null;
  return { verdicts: request.sentences.map((s) => byId.get(s.id) as GrammarSightingVerdict) };
}

export function isGrammarSightingResult(value: unknown, request?: GrammarSightingRequest): value is GrammarSightingResult {
  if (!value || typeof value !== 'object') return false;
  const list = (value as Record<string, unknown>).verdicts;
  if (!Array.isArray(list) || !list.length) return false;
  const ok = list.every((v) => !!v && typeof v === 'object' && typeof (v as GrammarSightingVerdict).id === 'string'
    && typeof (v as GrammarSightingVerdict).uses === 'boolean' && typeof (v as GrammarSightingVerdict).note === 'string');
  if (!ok || !request) return ok;
  const ids = new Set(list.map((v) => (v as GrammarSightingVerdict).id));
  return request.sentences.every((s) => ids.has(s.id)) && list.length === request.sentences.length;
}
