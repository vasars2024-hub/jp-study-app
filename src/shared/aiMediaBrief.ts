/**
 * N9 + N10 — an episode / video brief from its subtitle cues:
 *
 * - a short summary in the UI language;
 * - 3-8 comprehension questions in the study language, each with its answer and
 *   the cue it is answered by (so clicking it seeks there);
 * - the most teachable i+1 lines to mine, each with a reason.
 *
 * Long transcripts are cut into chunks under a size cap and the renderer asks
 * for one chunk at a time (progress, Cancel between chunks). The model never
 * produces a timestamp: it names a cue by the id it was given, the id is checked
 * against the chunk, and the time comes from the cue itself.
 *
 * The line pick never trusts the model about knowledge either. Its candidates are
 * the deterministic i+1 lines (exactly one unknown word, `yt5StudyVideo`), and a
 * pick is re-validated in the renderer against the learner's CURRENT known words
 * (tokenize, count unknowns) before it is shown. With AI off, the deterministic
 * ranking below is the pick.
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
import { immerseLevelScale, immerseTextInStudyLang } from './aiImmerseCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const MEDIA_BRIEF_PROMPT_VERSION = 1;
export const LINE_PICK_PROMPT_VERSION = 1;

/** Characters of cue text per request: a long episode becomes several requests. */
export const MEDIA_BRIEF_CHUNK_CHARS = 5_000;
/** At most this many requests per brief; the rest of a very long video is left out and said so. */
export const MEDIA_BRIEF_MAX_CHUNKS = 6;
export const MEDIA_BRIEF_MIN_QUESTIONS = 3;
export const MEDIA_BRIEF_MAX_QUESTIONS = 8;
/** A cue line longer than this is clipped in the prompt (it is still the same cue). */
const CUE_TEXT_MAX = 240;
export const LINE_PICK_MAX_CANDIDATES = 24;
export const LINE_PICK_MAX_PICKS = 6;

export interface MediaBriefCue {
  /** Position in the full cue list: the only handle the model gets. */
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface MediaBriefChunk {
  index: number;
  cues: MediaBriefCue[];
  chars: number;
}

export interface MediaBriefChunking {
  chunks: MediaBriefChunk[];
  totalCues: number;
  /** Cues that went into a chunk. */
  usedCues: number;
  /** The cap cut the transcript short: the brief covers up to `coveredUntilSec`. */
  truncated: boolean;
  coveredUntilSec: number;
}

/** Cue text as one line, without ASS override tags or markup. */
export function mediaBriefCueText(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\N/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cuts cues into request-sized chunks. Empty and repeated consecutive lines
 * (rolling auto-captions) are skipped; ids stay the cue's position in `cues`.
 */
export function chunkMediaBriefCues(
  cues: readonly { start: number; end: number; text: string }[],
  opts: { chunkChars?: number; maxChunks?: number } = {},
): MediaBriefChunking {
  const chunkChars = Math.max(500, opts.chunkChars ?? MEDIA_BRIEF_CHUNK_CHARS);
  const maxChunks = Math.max(1, opts.maxChunks ?? MEDIA_BRIEF_MAX_CHUNKS);
  const chunks: MediaBriefChunk[] = [];
  let current: MediaBriefChunk = { index: 0, cues: [], chars: 0 };
  let used = 0;
  let previous = '';
  let truncated = false;
  let coveredUntilSec = 0;
  for (let id = 0; id < cues.length; id++) {
    const cue = cues[id];
    const text = clipText(mediaBriefCueText(cue.text), CUE_TEXT_MAX);
    if (!text || text === previous) continue;
    previous = text;
    const cost = text.length + 8;
    if (current.cues.length > 0 && current.chars + cost > chunkChars) {
      chunks.push(current);
      if (chunks.length >= maxChunks) {
        truncated = true;
        break;
      }
      current = { index: chunks.length, cues: [], chars: 0 };
    }
    current.cues.push({ id, start: Number(cue.start) || 0, end: Number(cue.end) || 0, text });
    current.chars += cost;
    used += 1;
    coveredUntilSec = Math.max(coveredUntilSec, Number(cue.end) || 0);
  }
  if (!truncated && current.cues.length > 0) chunks.push(current);
  if (truncated) {
    const last = chunks[chunks.length - 1];
    used = chunks.reduce((sum, chunk) => sum + chunk.cues.length, 0);
    coveredUntilSec = last.cues[last.cues.length - 1]?.end ?? coveredUntilSec;
  }
  return { chunks, totalCues: cues.length, usedCues: used, truncated, coveredUntilSec };
}

/** How many questions to ask of each chunk so the whole brief lands in 3-8. */
export function mediaBriefQuestionsPerChunk(chunkCount: number, target = 6): number {
  const total = Math.min(MEDIA_BRIEF_MAX_QUESTIONS, Math.max(MEDIA_BRIEF_MIN_QUESTIONS, Math.round(target)));
  return Math.max(1, Math.min(MEDIA_BRIEF_MAX_QUESTIONS, Math.ceil(total / Math.max(1, chunkCount))));
}

// ---- the brief (one chunk per request) --------------------------------------

export interface MediaBriefRequest {
  requestId?: string;
  refresh?: boolean;
  title: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  /** One line describing the learner's level (`immerseLevelLine`). */
  level: string;
  chunkIndex: number;
  chunkCount: number;
  questionCount: number;
  cues: { id: number; text: string }[];
}

export interface MediaBriefQuestion {
  question: string;
  answer: string;
  cueId: number;
}

export interface MediaBriefChunkResult {
  summary: string;
  questions: MediaBriefQuestion[];
}

export function normalizeMediaBriefRequest(input: unknown): MediaBriefRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.cues)) return null;
  const cues: { id: number; text: string }[] = [];
  const seen = new Set<number>();
  let chars = 0;
  for (const entry of raw.cues) {
    if (!entry || typeof entry !== 'object') continue;
    const cue = entry as Record<string, unknown>;
    const id = typeof cue.id === 'number' && Number.isInteger(cue.id) && cue.id >= 0 ? cue.id : -1;
    const text = clipText(cue.text, CUE_TEXT_MAX);
    if (id < 0 || !text || seen.has(id)) continue;
    chars += text.length + 8;
    // A chunk over the cap is refused rather than sent whole: the cap is a cost promise.
    if (chars > MEDIA_BRIEF_CHUNK_CHARS * 1.25) return null;
    seen.add(id);
    cues.push({ id, text });
  }
  if (cues.length === 0) return null;
  const chunkCount = Math.max(1, Math.min(MEDIA_BRIEF_MAX_CHUNKS, Math.floor(Number(raw.chunkCount) || 1)));
  const chunkIndex = Math.max(0, Math.min(chunkCount - 1, Math.floor(Number(raw.chunkIndex) || 0)));
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    title: clipText(raw.title, 160),
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    level: clipText(raw.level, 160),
    chunkIndex,
    chunkCount,
    questionCount: Math.max(1, Math.min(MEDIA_BRIEF_MAX_QUESTIONS, Math.floor(Number(raw.questionCount) || 3))),
    cues,
  };
}

export function mediaBriefKeyParts(request: MediaBriefRequest): string[] {
  return [
    request.title,
    request.studyLang,
    request.answerLang,
    request.level,
    `${request.chunkIndex}/${request.chunkCount}`,
    String(request.questionCount),
    request.cues.map((cue) => `${cue.id}\t${cue.text}`).join('\n'),
  ];
}

export function buildMediaBriefPrompt(request: MediaBriefRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const part = request.chunkCount > 1 ? ` This is part ${request.chunkIndex + 1} of ${request.chunkCount} of the transcript.` : '';
  return [
    `You help a ${study} learner study a video${request.title ? ` titled "${request.title}"` : ''}.${part}`,
    `Learner level: ${request.level || `unknown (${immerseLevelScale(request.studyLang)} scale)`}.`,
    'Subtitle lines, one per row as "id<TAB>text":',
    ...request.cues.map((cue) => `${cue.id}\t${cue.text}`),
    '',
    'Reply with JSON:',
    `- "summary": 2-4 sentences in ${answer} saying what happens in these lines. Use only what the lines say; do not invent plot.`,
    `- "questions": exactly ${request.questionCount} comprehension questions written in ${study}, simple enough for this learner.`,
    `  Each has "question" (in ${study}), "answer" (a short answer in ${study}) and "cueId" (the id of the line that answers it, copied from the list above).`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const MEDIA_BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          cueId: { type: 'integer' },
        },
        required: ['question', 'answer', 'cueId'],
      },
    },
  },
  required: ['summary', 'questions'],
} as const;

/**
 * Content checks after the shape check. A question naming a cue that is not in
 * this chunk, or not written in the study language, is dropped; an answer with
 * no summary or no usable question at all is no answer (and is never cached).
 */
export function finalizeMediaBriefResult(
  parsed: { summary: string; questions: { question: string; answer: string; cueId: number }[] },
  request: MediaBriefRequest,
): MediaBriefChunkResult | null {
  const summary = plainModelText(parsed.summary, 900);
  if (!summary) return null;
  const ids = new Set(request.cues.map((cue) => cue.id));
  const questions: MediaBriefQuestion[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.questions) {
    if (questions.length >= request.questionCount) break;
    const question = plainModelText(entry.question, 300);
    const answer = plainModelText(entry.answer, 300);
    if (!question || !answer || !ids.has(entry.cueId) || seen.has(question)) continue;
    if (!immerseTextInStudyLang(question, request.studyLang)) continue;
    seen.add(question);
    questions.push({ question, answer, cueId: entry.cueId });
  }
  if (questions.length === 0) return null;
  return { summary, questions };
}

export function isMediaBriefChunkResult(value: unknown): value is MediaBriefChunkResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === 'string' && v.summary.length > 0
    && Array.isArray(v.questions) && v.questions.length > 0
    && v.questions.every((q) => Boolean(q) && typeof q === 'object'
      && typeof (q as MediaBriefQuestion).question === 'string'
      && typeof (q as MediaBriefQuestion).answer === 'string'
      && Number.isInteger((q as MediaBriefQuestion).cueId));
}

export interface MediaBriefQuizItem extends MediaBriefQuestion {
  /** Seconds, from the cue the id names. */
  start: number;
}

export interface MediaBrief {
  summaries: string[];
  questions: MediaBriefQuizItem[];
}

/**
 * The finished brief from per-chunk answers: one summary paragraph per part, and
 * questions taken round-robin from the parts (so a long episode's quiz covers all
 * of it), at most 8, in playback order.
 */
export function mergeMediaBriefChunks(
  parts: readonly MediaBriefChunkResult[],
  cueStart: (cueId: number) => number | null,
  maxQuestions = MEDIA_BRIEF_MAX_QUESTIONS,
): MediaBrief {
  const pools = parts.map((part) => [...part.questions]);
  const picked: MediaBriefQuizItem[] = [];
  let progress = true;
  while (picked.length < maxQuestions && progress) {
    progress = false;
    for (const pool of pools) {
      if (picked.length >= maxQuestions) break;
      const next = pool.shift();
      if (!next) continue;
      progress = true;
      const start = cueStart(next.cueId);
      if (start == null) continue;
      picked.push({ ...next, start });
    }
  }
  return {
    summaries: parts.map((part) => part.summary).filter(Boolean),
    questions: picked.sort((a, b) => a.start - b.start),
  };
}

// ---- the deterministic quiz (no AI) -----------------------------------------

export interface MediaBriefFallbackItem {
  /** The line with the target word blanked out. */
  cloze: string;
  answer: string;
  start: number;
  text: string;
}

const BLANK = '＿＿';

/**
 * A vocabulary quiz from the i+1 lines, the deterministic fallback when AI is off
 * or fails: each line's one unknown word is blanked out. Lines whose word does
 * not appear verbatim (a conjugated form) are skipped rather than blanked wrong.
 */
export function mediaBriefFallbackQuiz(
  lines: readonly { start: number; text: string; lemma: string }[],
  limit = MEDIA_BRIEF_MAX_QUESTIONS,
): MediaBriefFallbackItem[] {
  const out: MediaBriefFallbackItem[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (out.length >= limit) break;
    const lemma = line.lemma.trim();
    if (!lemma || seen.has(lemma)) continue;
    const at = line.text.indexOf(lemma);
    if (at < 0) continue;
    seen.add(lemma);
    out.push({
      cloze: `${line.text.slice(0, at)}${BLANK}${line.text.slice(at + lemma.length)}`,
      answer: lemma,
      start: line.start,
      text: line.text,
    });
  }
  return out;
}

// ---- i+1 line picking ---------------------------------------------------------

export interface LinePickCandidate {
  id: number;
  start: number;
  text: string;
  /** The one unknown word. */
  target: string;
  /** How often the target word is heard in the whole video. */
  targetCount: number;
}

/**
 * The deterministic ranking (always on): lines whose unknown word comes back
 * most often first (learning it pays off most in this very video), then lines of
 * a comfortable length, then playback order.
 */
export function rankLinePickCandidates(
  lines: readonly { start: number; text: string; lemma: string }[],
  countOf: (lemma: string) => number,
  limit = LINE_PICK_MAX_CANDIDATES,
): LinePickCandidate[] {
  const comfort = (text: string): number => Math.abs([...text].length - 18);
  return lines
    .map((line, index) => ({
      id: index,
      start: line.start,
      text: line.text,
      target: line.lemma,
      targetCount: Math.max(1, countOf(line.lemma)),
    }))
    .sort((a, b) => b.targetCount - a.targetCount || comfort(a.text) - comfort(b.text) || a.start - b.start)
    .slice(0, Math.max(0, limit));
}

export interface LinePickRequest {
  requestId?: string;
  refresh?: boolean;
  studyLang: StudyLang;
  answerLang: UiLang;
  level: string;
  pickCount: number;
  candidates: { id: number; text: string; target: string }[];
}

export interface LinePick {
  id: number;
  reason: string;
}

export interface LinePickResult {
  picks: LinePick[];
}

export function normalizeLinePickRequest(input: unknown): LinePickRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.candidates)) return null;
  const candidates: LinePickRequest['candidates'] = [];
  const seen = new Set<number>();
  for (const entry of raw.candidates) {
    if (candidates.length >= LINE_PICK_MAX_CANDIDATES) break;
    if (!entry || typeof entry !== 'object') continue;
    const c = entry as Record<string, unknown>;
    const id = typeof c.id === 'number' && Number.isInteger(c.id) && c.id >= 0 ? c.id : -1;
    const text = clipText(c.text, CUE_TEXT_MAX);
    const target = clipText(c.target, 40);
    if (id < 0 || !text || !target || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, text, target });
  }
  if (candidates.length === 0) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    level: clipText(raw.level, 160),
    pickCount: Math.max(1, Math.min(LINE_PICK_MAX_PICKS, Math.floor(Number(raw.pickCount) || 3), candidates.length)),
    candidates,
  };
}

export function linePickKeyParts(request: LinePickRequest): string[] {
  return [
    request.studyLang,
    request.answerLang,
    request.level,
    String(request.pickCount),
    request.candidates.map((c) => `${c.id}\t${c.target}\t${c.text}`).join('\n'),
  ];
}

export function buildLinePickPrompt(request: LinePickRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  return [
    `A ${study} learner wants to mine sentence cards from a video. Learner level: ${request.level || 'unknown'}.`,
    'Each candidate line below has exactly ONE word the learner does not know yet (the target). Rows are "id<TAB>target<TAB>line":',
    ...request.candidates.map((c) => `${c.id}\t${c.target}\t${c.text}`),
    '',
    `Choose the ${request.pickCount} most teachable lines: a useful target word, a clear and natural sentence, context that makes the meaning guessable.`,
    'Reply with JSON:',
    `- "picks": exactly ${request.pickCount} items, best first, each with "id" (copied from the list) and "reason" (one short sentence in ${answer} saying why this line is worth mining).`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const LINE_PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, reason: { type: 'string' } },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['picks'],
} as const;

/** Only ids that were offered, once each, with a reason; at least one. */
export function finalizeLinePickResult(
  parsed: { picks: { id: number; reason: string }[] },
  request: LinePickRequest,
): LinePickResult | null {
  const offered = new Set(request.candidates.map((c) => c.id));
  const picks: LinePick[] = [];
  const seen = new Set<number>();
  for (const entry of parsed.picks) {
    if (picks.length >= request.pickCount) break;
    const reason = plainModelText(entry.reason, 240);
    if (!offered.has(entry.id) || seen.has(entry.id) || !reason) continue;
    seen.add(entry.id);
    picks.push({ id: entry.id, reason });
  }
  return picks.length ? { picks } : null;
}

export function isLinePickResult(value: unknown): value is LinePickResult {
  if (!value || typeof value !== 'object') return false;
  const picks = (value as { picks?: unknown }).picks;
  return Array.isArray(picks) && picks.length > 0 && picks.every((p) => Boolean(p) && typeof p === 'object'
    && Number.isInteger((p as LinePick).id) && typeof (p as LinePick).reason === 'string' && (p as LinePick).reason.length > 0);
}

export interface ValidatedLinePick extends LinePickCandidate {
  reason: string;
}

/**
 * The local check every AI pick passes before it is shown: the line is
 * re-tokenized and must STILL have exactly one unknown content word (the learner
 * may have learned it, or another word may have been forgotten, since the
 * candidates were built). Proper nouns never count as the unknown.
 */
export function validateLinePicks(
  picks: readonly LinePick[],
  candidates: readonly LinePickCandidate[],
  tokenize: (text: string) => readonly { lemma: string; content: boolean; proper?: boolean }[],
  levelOf: (lemma: string) => number,
  knownAt = 2,
): ValidatedLinePick[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out: ValidatedLinePick[] = [];
  for (const pick of picks) {
    const candidate = byId.get(pick.id);
    if (!candidate) continue;
    let unknown = 0;
    for (const token of tokenize(candidate.text)) {
      const lemma = token.lemma.trim();
      if (!token.content || token.proper || !lemma) continue;
      if (levelOf(lemma) < knownAt) unknown += 1;
    }
    if (unknown === 1) out.push({ ...candidate, reason: pick.reason });
  }
  return out;
}
