/**
 * Shadowing feedback, the optional AI half (docs/AI_AUDIT.md N18).
 *
 * The score, the token diff and the named issues are computed on the device
 * (`shadowingScore.ts`); the recording itself never leaves it. This asks the
 * configured engine only to EXPLAIN the result in words: what the learner most
 * likely did with long vowels, っ, ん or pitch (Japanese) or with tones,
 * retroflexes and nasal finals (Chinese), and one thing to try next time.
 *
 * What is sent is text: the line, Whisper's transcript, and the deterministic
 * findings. Runs through the shared runner in `main/aiStudyAssist.ts`.
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
import type { ShadowHintKind, ShadowLang, ShadowPace } from './shadowingScore';

export const SHADOWING_PROMPT_VERSION = 2;

const HINT_KINDS: readonly ShadowHintKind[] = [
  'long-vowel', 'sokuon', 'moraic-n', 'voicing', 'small-kana',
  'tone', 'retroflex', 'nasal-final', 'l-n', 'missed-sound', 'extra-sound',
];

export const SHADOWING_FOCUS = [
  'long-vowel', 'sokuon', 'moraic-n', 'voicing', 'pitch', 'rhythm',
  'tone', 'retroflex', 'nasal-final', 'initial', 'pace', 'word', 'other',
] as const;
export type ShadowingFocus = (typeof SHADOWING_FOCUS)[number];

export interface ShadowingFeedbackRequest {
  requestId?: string;
  lang: ShadowLang;
  /** The subtitle line. */
  expected: string;
  /** What Whisper heard. */
  heard: string;
  score: number;
  missed: string[];
  extra: string[];
  hints: ShadowHintKind[];
  pace: ShadowPace | '';
  /**
   * Measured on the device from the recording (`shadowingProsody.ts`): words whose
   * pitch accent did not match the dictionary, as "word: expected → heard"
   * (downstep numbers), and pauses inside the line, as "inside 図書館 0.4s".
   */
  accent?: string[];
  pauses?: string[];
  answerLang: UiLang;
  refresh?: boolean;
}

export interface ShadowingFeedbackIssue {
  focus: ShadowingFocus;
  explanation: string;
  tip: string;
}

export interface ShadowingFeedbackResult {
  summary: string;
  issues: ShadowingFeedbackIssue[];
}

export function normalizeShadowingFeedbackRequest(input: unknown): ShadowingFeedbackRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const lang: ShadowLang | null = raw.lang === 'ja' || raw.lang === 'zh' ? raw.lang : null;
  const expected = clipText(raw.expected, 200);
  if (!lang || !expected) return null;
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.min(100, Math.round(raw.score))) : 0;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  const hints = Array.isArray(raw.hints)
    ? [...new Set(raw.hints.filter((kind): kind is ShadowHintKind => HINT_KINDS.includes(kind as ShadowHintKind)))]
    : [];
  return {
    ...(requestId ? { requestId } : {}),
    lang,
    expected,
    heard: clipText(raw.heard, 300),
    score,
    missed: clipList(raw.missed, 12, 24),
    extra: clipList(raw.extra, 12, 24),
    hints,
    pace: raw.pace === 'slow' || raw.pace === 'fast' || raw.pace === 'ok' ? raw.pace : '',
    ...(lang === 'ja' && clipList(raw.accent, 6, 40).length ? { accent: clipList(raw.accent, 6, 40) } : {}),
    ...(clipList(raw.pauses, 4, 40).length ? { pauses: clipList(raw.pauses, 4, 40) } : {}),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function shadowingFeedbackKeyParts(request: ShadowingFeedbackRequest): string[] {
  return [
    request.lang, request.expected, request.heard, String(request.score), request.missed.join('|'),
    request.extra.join('|'), request.hints.join('|'), request.pace, request.answerLang,
    (request.accent ?? []).join('|'), (request.pauses ?? []).join('|'),
  ];
}

export function buildShadowingFeedbackPrompt(request: ShadowingFeedbackRequest): string {
  const study = promptLanguageName(request.lang);
  const answer = promptLanguageName(request.answerLang);
  const focus = request.lang === 'ja'
    ? 'long vowels, the small tsu (っ), the moraic n (ん), voiced vs unvoiced consonants, small ya/yu/yo, and pitch accent'
    : 'the four tones and the neutral tone, retroflex initials (zh/ch/sh vs z/c/s), -n vs -ng finals, l vs n';
  return [
    `A learner of ${study} shadowed (repeated aloud) this line:`,
    request.expected,
    `A speech recognizer transcribed what they said as: ${request.heard || '(nothing recognizable)'}`,
    `Similarity of the sounds: ${request.score}/100.`,
    request.missed.length ? `Words of the line not heard clearly: ${request.missed.join(', ')}` : '',
    request.extra.length ? `Words heard that the line does not have: ${request.extra.join(', ')}` : '',
    request.hints.length ? `Sound differences a rule-based check found: ${request.hints.join(', ')}` : '',
    request.pace === 'slow' ? 'They spoke much slower than the original.' : request.pace === 'fast' ? 'They spoke much faster than the original.' : '',
    request.accent?.length
      ? `Pitch accent measured from their recording did not match the dictionary for (word: expected downstep → heard; 0 = flat/heiban, n = drop after mora n): ${request.accent.join('; ')}`
      : '',
    request.pauses?.length ? `Pauses measured inside the line: ${request.pauses.join('; ')}` : '',
    '',
    `Explain the most likely pronunciation issues behind these differences, in ${answer}; quote ${study} exactly.`,
    `Consider especially ${focus}. The recognizer can mishear, so say "likely", never "you said".`,
    'If the transcript matches the line, say what to keep practising (rhythm, pitch or tones) instead of inventing errors.',
    'Reply with JSON:',
    '- "summary": one or two sentences.',
    `- "issues": up to 3 objects { "focus": one of ${SHADOWING_FOCUS.join(', ')}; "explanation": one sentence; "tip": one short practice tip }.`,
    PLAIN_TEXT_RULE,
  ].filter(Boolean).join('\n');
}

export const SHADOWING_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: { focus: { type: 'string' }, explanation: { type: 'string' }, tip: { type: 'string' } },
        required: ['focus', 'explanation', 'tip'],
      },
    },
  },
  required: ['summary', 'issues'],
} as const;

export function finalizeShadowingFeedback(parsed: {
  summary: string;
  issues?: Array<{ focus?: string; explanation?: string; tip?: string }>;
}): ShadowingFeedbackResult | null {
  const summary = plainModelText(parsed.summary, 400);
  if (!summary) return null;
  const issues: ShadowingFeedbackIssue[] = [];
  for (const issue of parsed.issues ?? []) {
    const explanation = plainModelText(issue.explanation ?? '', 300).replace(/\s*\n\s*/g, ' ');
    if (!explanation) continue;
    const focus = (SHADOWING_FOCUS as readonly string[]).includes(issue.focus ?? '') ? issue.focus as ShadowingFocus : 'other';
    issues.push({ focus, explanation, tip: plainModelText(issue.tip ?? '', 200).replace(/\s*\n\s*/g, ' ') });
    if (issues.length >= 3) break;
  }
  return { summary, issues };
}

export function isShadowingFeedbackResult(value: unknown): value is ShadowingFeedbackResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === 'string' && v.summary.length > 0 && Array.isArray(v.issues) && v.issues.length <= 3
    && v.issues.every((issue) => {
      if (!issue || typeof issue !== 'object') return false;
      const i = issue as Record<string, unknown>;
      return (SHADOWING_FOCUS as readonly unknown[]).includes(i.focus) && typeof i.explanation === 'string' && i.explanation.length > 0
        && typeof i.tip === 'string';
    });
}
