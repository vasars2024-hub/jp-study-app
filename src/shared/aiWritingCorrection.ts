/**
 * Writing correction and the journal prompt (docs/AI_AUDIT.md N19).
 *
 * "Correct my Japanese/Chinese" on a note or a selection asks the configured
 * engine for a list of EDITS, never for a rewritten text: each edit quotes the
 * exact words it changes, the replacement and a short reason. The edits are
 * checked here against the text they claim to change (an edit whose quote is not
 * in the text, or that overlaps another, is dropped) and are applied only when
 * the learner approves them — one at a time or all — by `applyWritingEdits`,
 * which refuses to run against a text that changed since it was checked.
 *
 * The journal prompt ("write 3 sentences about your day using: …due words…") is
 * graded twice: deterministically here (`checkJournalEntry`: which words appear,
 * how many sentences) and, optionally, by the model, whose word-by-word verdict
 * cannot claim a word was used when it does not appear in the text.
 *
 * Pure: the renderer, main and the tests share it.
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
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const WRITING_CORRECTION_PROMPT_VERSION = 1;
export const JOURNAL_GRADE_PROMPT_VERSION = 1;

export const WRITING_TEXT_MAX = 2_000;
export const WRITING_EDITS_MAX = 12;

export const WRITING_EDIT_KINDS = ['grammar', 'particle', 'word', 'conjugation', 'spelling', 'style', 'other'] as const;
export type WritingEditKind = (typeof WRITING_EDIT_KINDS)[number];

/** Keeps the original's line breaks; only trims the ends and caps the length. */
function clipMultiline(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const chars = [...value.replace(/\r\n?/g, '\n').trim()];
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
}

// ---- correction --------------------------------------------------------------------

export interface WritingCorrectionRequest {
  requestId?: string;
  text: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface WritingEdit {
  id: string;
  /** Where the quoted words start in the checked text (UTF-16 offset). */
  start: number;
  /** The exact words changed. */
  original: string;
  corrected: string;
  explanation: string;
  kind: WritingEditKind;
}

export interface WritingCorrectionResult {
  /** The text the edits were checked against. */
  text: string;
  edits: WritingEdit[];
  /** One or two sentences on the whole text. */
  overall: string;
}

export function normalizeWritingCorrectionRequest(input: unknown): WritingCorrectionRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = clipMultiline(raw.text, WRITING_TEXT_MAX);
  if (!text) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    text,
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function writingCorrectionKeyParts(request: WritingCorrectionRequest): string[] {
  return [request.text, request.studyLang, request.answerLang];
}

export function buildWritingCorrectionPrompt(request: WritingCorrectionRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A learner of ${study} wrote this text:`,
    '<<<',
    request.text,
    '>>>',
    `Find its mistakes in ${study}: grammar, particles, word choice, conjugation, spelling (kanji/hanzi), and clearly unnatural phrasing.`,
    'Do NOT rewrite the text and do not change what it says. Leave correct parts alone; if everything is fine, return no edits.',
    'Reply with JSON:',
    `- "edits": up to ${WRITING_EDITS_MAX} objects, in text order, each { "original": the exact words to change, copied character for character from the text (as short as possible, but long enough to be unique); "corrected": the replacement; "explanation": one short sentence in ${answer}; "kind": one of ${WRITING_EDIT_KINDS.join(', ')} }.`,
    `- "overall": one or two sentences in ${answer} on the text as a whole (encouraging and specific).`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const WRITING_CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          corrected: { type: 'string' },
          explanation: { type: 'string' },
          kind: { type: 'string' },
        },
        required: ['original', 'corrected', 'explanation', 'kind'],
      },
    },
    overall: { type: 'string' },
  },
  required: ['edits', 'overall'],
} as const;

/** Model text inside an edit: one line, no markup, never trimmed of meaningful spaces. */
function editText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/<\/?[A-Za-z][^<>]*>/g, '');
  const chars = [...cleaned];
  return chars.length > max ? '' : cleaned;
}

/**
 * Locates every edit in the text, in order, and drops the ones that cannot be
 * applied safely: a quote that is not in the text, an edit that changes nothing,
 * one that overlaps an earlier edit. `null` when the reply has neither a usable
 * edit nor an overall comment.
 */
export function finalizeWritingCorrection(
  parsed: { edits?: Array<{ original?: string; corrected?: string; explanation?: string; kind?: string }>; overall?: string },
  request: WritingCorrectionRequest,
): WritingCorrectionResult | null {
  const text = request.text;
  const placed: WritingEdit[] = [];
  let cursor = 0;
  for (const raw of parsed.edits ?? []) {
    if (placed.length >= WRITING_EDITS_MAX) break;
    const original = editText(raw.original, 200);
    const corrected = editText(raw.corrected, 300);
    const explanation = plainModelText(raw.explanation ?? '', 300).replace(/\s*\n\s*/g, ' ');
    if (!original.trim() || original === corrected || !explanation) continue;
    // Prefer the next occurrence after the previous edit (text order), else any free one.
    let start = text.indexOf(original, cursor);
    if (start < 0) {
      start = text.indexOf(original);
      while (start >= 0 && placed.some((edit) => start < edit.start + edit.original.length && edit.start < start + original.length)) {
        start = text.indexOf(original, start + 1);
      }
    }
    if (start < 0) continue;
    const end = start + original.length;
    if (placed.some((edit) => start < edit.start + edit.original.length && edit.start < end)) continue;
    const kind = (WRITING_EDIT_KINDS as readonly string[]).includes(raw.kind ?? '') ? raw.kind as WritingEditKind : 'other';
    placed.push({ id: `e${placed.length + 1}`, start, original, corrected, explanation, kind });
    cursor = end;
  }
  placed.sort((a, b) => a.start - b.start);
  const overall = plainModelText(parsed.overall ?? '', 400);
  if (!placed.length && !overall) return null;
  return { text, edits: placed, overall };
}

export function isWritingCorrectionResult(value: unknown, request: WritingCorrectionRequest): value is WritingCorrectionResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.text !== request.text || typeof v.overall !== 'string' || !Array.isArray(v.edits)) return false;
  if (!v.edits.length && !v.overall) return false;
  return v.edits.every((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const edit = raw as Record<string, unknown>;
    return typeof edit.id === 'string' && typeof edit.start === 'number' && typeof edit.original === 'string'
      && typeof edit.corrected === 'string' && typeof edit.explanation === 'string'
      && request.text.slice(edit.start, edit.start + edit.original.length) === edit.original;
  });
}

export type ApplyWritingEditsOutcome =
  | { ok: true; text: string; applied: number }
  | { ok: false; reason: 'text-changed' | 'nothing-approved' };

/**
 * Applies the approved edits to `current`, which must still be the text they
 * were checked against. Nothing is applied that the learner did not approve.
 */
export function applyWritingEdits(
  current: string,
  result: WritingCorrectionResult,
  approvedIds: ReadonlySet<string>,
): ApplyWritingEditsOutcome {
  if (current !== result.text) return { ok: false, reason: 'text-changed' };
  const chosen = result.edits.filter((edit) => approvedIds.has(edit.id)).sort((a, b) => b.start - a.start);
  if (!chosen.length) return { ok: false, reason: 'nothing-approved' };
  let text = current;
  for (const edit of chosen) {
    if (text.slice(edit.start, edit.start + edit.original.length) !== edit.original) return { ok: false, reason: 'text-changed' };
    text = text.slice(0, edit.start) + edit.corrected + text.slice(edit.start + edit.original.length);
  }
  return { ok: true, text, applied: chosen.length };
}

/** Replaces `[start, end)` of `whole` by `replacement` (a corrected selection back into its note). */
export function spliceText(whole: string, start: number, end: number, replacement: string): string {
  const s = Math.max(0, Math.min(whole.length, start));
  const e = Math.max(s, Math.min(whole.length, end));
  return whole.slice(0, s) + replacement + whole.slice(e);
}

// ---- the journal prompt ------------------------------------------------------------

export const JOURNAL_WORDS_MAX = 5;
export const JOURNAL_SENTENCES_TARGET = 3;

export interface JournalWord {
  word: string;
  reading: string;
  meaning: string;
}

export interface JournalGradeRequest {
  requestId?: string;
  words: JournalWord[];
  text: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface JournalWordVerdict {
  word: string;
  /** Appears in the text (checked here, not taken from the model). */
  used: boolean;
  /** Used with a fitting meaning and form. */
  correct: boolean;
  note: string;
}

export interface JournalGradeResult {
  words: JournalWordVerdict[];
  feedback: string;
}

export function normalizeJournalWords(value: unknown): JournalWord[] {
  if (!Array.isArray(value)) return [];
  const out: JournalWord[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const word = clipText(entry.word, 24);
    if (!word || out.some((w) => w.word === word)) continue;
    out.push({ word, reading: clipText(entry.reading, 40), meaning: clipText(entry.meaning, 80) });
    if (out.length >= JOURNAL_WORDS_MAX) break;
  }
  return out;
}

export function normalizeJournalGradeRequest(input: unknown): JournalGradeRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const words = normalizeJournalWords(raw.words);
  const text = clipMultiline(raw.text, WRITING_TEXT_MAX);
  if (!words.length || !text) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    words,
    text,
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function journalGradeKeyParts(request: JournalGradeRequest): string[] {
  return [request.words.map((w) => `${w.word}/${w.reading}/${w.meaning}`).join('|'), request.text, request.studyLang, request.answerLang];
}

export function buildJournalGradePrompt(request: JournalGradeRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A learner of ${study} was asked to write ${JOURNAL_SENTENCES_TARGET} sentences about their day using these words:`,
    ...request.words.map((w) => `- ${w.word}${w.reading && w.reading !== w.word ? ` (${w.reading})` : ''}${w.meaning ? `: ${w.meaning}` : ''}`),
    'They wrote:',
    '<<<',
    request.text,
    '>>>',
    'Grade how they used each word.',
    'Reply with JSON:',
    `- "words": one object per word above, { "word": the word exactly as listed; "used": true if it appears (in any conjugated form); "correct": true if used with a fitting meaning and form; "note": one short sentence in ${answer} }.`,
    `- "feedback": two short sentences in ${answer}: what went well, and one thing to improve.`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const JOURNAL_GRADE_SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          used: { type: 'boolean' },
          correct: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['word', 'used', 'correct', 'note'],
      },
    },
    feedback: { type: 'string' },
  },
  required: ['words', 'feedback'],
} as const;

/**
 * Does `word` appear in `text`? The word itself, its reading, or — for a
 * Japanese verb or adjective — its stem (食べる → 食べ, 高い → 高), so a
 * conjugated use counts. `lemmas` (the text's dictionary forms from the
 * tokenizer) catch the rest when the renderer supplies them.
 */
export function journalWordAppears(word: JournalWord, text: string, lemmas: ReadonlySet<string> = new Set()): boolean {
  const haystack = text.normalize('NFKC');
  const forms = [word.word, word.reading].map((form) => form.normalize('NFKC').trim()).filter(Boolean);
  if (forms.some((form) => haystack.includes(form) || lemmas.has(form))) return true;
  for (const form of forms) {
    const chars = [...form];
    // A Japanese conjugating word: drop its final kana (る, う, い…) and look for the stem.
    if (chars.length >= 2 && /[ぁ-ゖ]$/.test(form) && /[一-鿿㐀-䶿々]/.test(form)) {
      const stem = chars.slice(0, -1).join('');
      if (haystack.includes(stem)) return true;
    }
    // A Russian word: its ending changes with case and person (книга → книгу), the stem does not.
    if (chars.length >= 4 && /^[Ѐ-ӿ]+$/u.test(form)) {
      const stem = chars.slice(0, -2).join('').toLowerCase();
      if (haystack.toLowerCase().includes(stem)) return true;
    }
  }
  return false;
}

/** Sentences in the text: split on sentence-final punctuation and line breaks. */
export function countJournalSentences(text: string): number {
  return text.split(/[。！？!?\n]+|\.(?:\s|$)/u).map((part) => part.trim()).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

export interface JournalCheck {
  words: Array<{ word: string; used: boolean }>;
  usedCount: number;
  sentences: number;
  /** Every word used and at least the target number of sentences. */
  complete: boolean;
}

/** The deterministic grade: what the app can tell without a model. */
export function checkJournalEntry(text: string, words: readonly JournalWord[], lemmas?: ReadonlySet<string>): JournalCheck {
  const verdicts = words.map((word) => ({ word: word.word, used: journalWordAppears(word, text, lemmas) }));
  const usedCount = verdicts.filter((v) => v.used).length;
  const sentences = countJournalSentences(text);
  return {
    words: verdicts,
    usedCount,
    sentences,
    complete: usedCount === words.length && sentences >= JOURNAL_SENTENCES_TARGET,
  };
}

export function finalizeJournalGrade(
  parsed: { words?: Array<{ word?: string; used?: boolean; correct?: boolean; note?: string }>; feedback?: string },
  request: JournalGradeRequest,
): JournalGradeResult | null {
  const feedback = plainModelText(parsed.feedback ?? '', 500);
  if (!feedback) return null;
  const words: JournalWordVerdict[] = request.words.map((word) => {
    const verdict = (parsed.words ?? []).find((entry) => (entry.word ?? '').trim() === word.word);
    // "Used" is a fact about the text; the model may not claim otherwise.
    const used = journalWordAppears(word, request.text);
    return {
      word: word.word,
      used,
      correct: used && verdict?.correct === true,
      note: plainModelText(verdict?.note ?? '', 200).replace(/\s*\n\s*/g, ' '),
    };
  });
  return { words, feedback };
}

export function isJournalGradeResult(value: unknown, request: JournalGradeRequest): value is JournalGradeResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.feedback === 'string' && v.feedback.length > 0 && Array.isArray(v.words)
    && v.words.length === request.words.length
    && v.words.every((raw, index) => {
      const entry = raw as Record<string, unknown> | null;
      return !!entry && entry.word === request.words[index].word && typeof entry.used === 'boolean'
        && typeof entry.correct === 'boolean' && typeof entry.note === 'string';
    });
}

// ---- quick checks without a model ----------------------------------------------------

export type WritingLintKind = 'doubled' | 'ascii-punctuation' | 'romaji' | 'no-sentence-end' | 'mixed-politeness';

export interface WritingLint {
  kind: WritingLintKind;
  /** The text that triggered it ('' when it is about the whole text). */
  quote: string;
}

const JA_POLITE = /(です|ます|でした|ました|ません|ましょう)[。！？!?\s]*$/u;
const JA_PLAIN_END = /(だ|である|だった|[うくすつぬふむゆるぐぶ]|た|ない)[。！？!?\s]*$/u;

/**
 * What the app can say about a text on its own — the fallback when no model is
 * available. Deliberately narrow: only patterns that are almost never right.
 */
export function lintStudyWriting(text: string, lang: StudyLang): WritingLint[] {
  const out: WritingLint[] = [];
  const add = (kind: WritingLintKind, quote: string): void => {
    if (out.length < 8 && !out.some((lint) => lint.kind === kind && lint.quote === quote)) out.push({ kind, quote });
  };
  if (lang === 'ja' || lang === 'zh') {
    const doubled = lang === 'ja' ? /([はがをにでへとも])\1/gu : /([的了吗呢吧])\1/gu;
    for (const match of text.matchAll(doubled)) add('doubled', match[0]);
    for (const match of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][,.](?=\s|$|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu)) {
      add('ascii-punctuation', match[0]);
    }
    if (lang === 'ja') for (const match of text.matchAll(/[\p{Script=Hiragana}\p{Script=Han}][a-z]{2,}/gu)) add('romaji', match[0]);
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const last = lines[lines.length - 1] ?? '';
    if (last && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(last)) add('no-sentence-end', '');
    if (lang === 'ja') {
      const sentences = text.split(/(?<=[。！？!?])|\n/u).map((part) => part.trim()).filter(Boolean);
      const polite = sentences.filter((sentence) => JA_POLITE.test(sentence)).length;
      const plain = sentences.filter((sentence) => !JA_POLITE.test(sentence) && JA_PLAIN_END.test(sentence)).length;
      if (polite > 0 && plain > 0) add('mixed-politeness', '');
    }
  } else {
    for (const match of text.matchAll(/(?<![\p{L}])([\p{L}]+)\s+\1(?![\p{L}])/giu)) add('doubled', match[0]);
  }
  return out;
}
