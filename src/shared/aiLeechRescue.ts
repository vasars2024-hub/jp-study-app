/**
 * N3 AI leech rescue — the request, the prompt, the reply contract and the
 * deterministic fallback.
 *
 * A leech is a card the learner keeps forgetting. The model suggests three
 * things: a mnemonic, a clearer meaning, and a note that tells this card apart
 * from the similar cards in the learner's deck. They are SUGGESTIONS, labelled as
 * AI text, and the card changes only when the learner approves a part of one
 * (`ankiLeechRescue.ts` keeps the same rule: never overwrite what the learner
 * wrote without them saying so).
 *
 * The fallback needs no model: a partial-reveal hint of the reading (the same
 * reveal the Anki leech recipe writes) and the similar cards to compare against.
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
import { leechHintText } from './ankiLeechRescue';
import type { UiLang } from './i18n/core';
import type { StudyLang } from './studyLang';
import type { WhyWrongNeighbour } from './aiWhyWrong';

export const LEECH_RESCUE_PROMPT_VERSION = 1;

export interface LeechRescueCard {
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
  /** How many times the card lapsed; context for the prompt only. */
  lapses: number;
}

export interface LeechRescueRequest {
  requestId?: string;
  card: LeechRescueCard;
  /** Similar cards in the deck (`pickWhyWrongNeighbours`). */
  similar: WhyWrongNeighbour[];
  studyLang: StudyLang;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface LeechRescueSuggestion {
  /** A memory hook in the UI language. */
  mnemonic: string;
  /** A clearer gloss than the card's current meaning, or '' when the current one is fine. */
  clearerMeaning: string;
  /** How this card differs from the similar ones, or '' when nothing is similar. */
  distinction: string;
}

const MAX_SIMILAR = 6;

export function normalizeLeechRescueRequest(input: unknown): LeechRescueRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const cardRaw = raw.card && typeof raw.card === 'object' ? raw.card as Record<string, unknown> : null;
  if (!cardRaw) return null;
  const card: LeechRescueCard = {
    word: clipText(cardRaw.word, 80),
    reading: clipText(cardRaw.reading, 80),
    meaning: clipText(cardRaw.meaning, 300),
    sentence: clipText(cardRaw.sentence, 300),
    lapses: typeof cardRaw.lapses === 'number' && Number.isFinite(cardRaw.lapses)
      ? Math.max(0, Math.min(999, Math.trunc(cardRaw.lapses)))
      : 0,
  };
  if (!card.word) return null;
  const similar: WhyWrongNeighbour[] = [];
  if (Array.isArray(raw.similar)) {
    for (const entry of raw.similar) {
      if (similar.length >= MAX_SIMILAR) break;
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const word = clipText(e.word, 60);
      if (word) similar.push({ word, reading: clipText(e.reading, 60), meaning: clipText(e.meaning, 120) });
    }
  }
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    card,
    similar,
    studyLang: normalizeAiStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

/** The lapse count is left out: a suggestion for the same card stays valid as it lapses again. */
export function leechRescueKeyParts(request: LeechRescueRequest): string[] {
  return [
    request.card.word,
    request.card.reading,
    request.card.meaning,
    request.card.sentence,
    request.similar.map((n) => `${n.word}|${n.reading}|${n.meaning}`).join(';'),
    request.studyLang,
    request.answerLang,
  ];
}

export function buildLeechRescuePrompt(request: LeechRescueRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const { card } = request;
  const lines = [
    `A learner of ${study} keeps forgetting this flashcard${card.lapses ? ` (forgotten ${card.lapses} times)` : ''}.`,
    `Help them rescue it. Write every field in ${answer}; quote ${study} words exactly as written.`,
    '',
    `- word: ${card.word}`,
    card.reading && card.reading !== card.word ? `- reading: ${card.reading}` : '',
    `- current meaning on the card: ${card.meaning || '(empty)'}`,
    card.sentence ? `- example sentence: ${card.sentence}` : '',
  ];
  if (request.similar.length) {
    lines.push('', 'Similar cards in the same deck:');
    for (const n of request.similar) {
      lines.push(`- ${n.word}${n.reading && n.reading !== n.word ? ` (${n.reading})` : ''}: ${n.meaning}`);
    }
  }
  lines.push(
    '',
    'Reply with JSON:',
    '- "mnemonic": one or two short sentences: a vivid memory hook linking the form (kanji parts or sound) to the meaning. Do not invent facts about the word\'s history.',
    '- "clearerMeaning": a short, clearer gloss for the card\'s meaning field, or "" if the current meaning is already clear.',
    request.similar.length
      ? '- "distinction": one or two sentences on how this word differs from the similar cards listed, naming them.'
      : '- "distinction": "" (no similar cards were given).',
    PLAIN_TEXT_RULE,
  );
  return lines.filter(Boolean).join('\n');
}

export const LEECH_RESCUE_SCHEMA = {
  type: 'object',
  properties: {
    mnemonic: { type: 'string' },
    clearerMeaning: { type: 'string' },
    distinction: { type: 'string' },
  },
  required: ['mnemonic', 'clearerMeaning', 'distinction'],
} as const;

export function finalizeLeechRescueSuggestion(
  parsed: { mnemonic: string; clearerMeaning?: string; distinction?: string },
  request: LeechRescueRequest,
): LeechRescueSuggestion | null {
  const mnemonic = plainModelText(parsed.mnemonic, 400);
  let clearerMeaning = plainModelText(parsed.clearerMeaning ?? '', 200).replace(/\s*\n\s*/g, ' ');
  if (clearerMeaning.toLowerCase() === request.card.meaning.toLowerCase()) clearerMeaning = '';
  const distinction = request.similar.length ? plainModelText(parsed.distinction ?? '', 400) : '';
  // The mnemonic is the one part every rescue must have; without it the reply is incomplete.
  if (!mnemonic) return null;
  return { mnemonic, clearerMeaning, distinction };
}

export function isLeechRescueSuggestion(value: unknown): value is LeechRescueSuggestion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.mnemonic === 'string' && v.mnemonic.length > 0
    && typeof v.clearerMeaning === 'string' && typeof v.distinction === 'string';
}

// ---- the deterministic half ------------------------------------------------

export interface LeechRescueFallback {
  /** A partial reveal of the reading ("た…"), or null when the reading is too short to hint. */
  hint: string | null;
  /** The similar cards to compare against. */
  similar: WhyWrongNeighbour[];
}

export function leechRescueFallback(card: { word: string; reading: string }, similar: readonly WhyWrongNeighbour[]): LeechRescueFallback {
  const source = (card.reading || card.word).trim();
  return { hint: source ? leechHintText(source, 1) : null, similar: similar.slice(0, MAX_SIMILAR) };
}

/** The parts of a suggestion the learner ticked; only these are written. */
export interface LeechRescueApproval {
  mnemonic: boolean;
  clearerMeaning: boolean;
  distinction: boolean;
}

/**
 * The card patch an approval writes. A part not ticked, or empty, is left out,
 * so it can never blank or overwrite a field the learner did not approve.
 */
export function leechRescuePatch(
  suggestion: LeechRescueSuggestion,
  approval: LeechRescueApproval,
): { mnemonic?: string; meaning?: string; distinction?: string } {
  return {
    ...(approval.mnemonic && suggestion.mnemonic ? { mnemonic: suggestion.mnemonic } : {}),
    ...(approval.clearerMeaning && suggestion.clearerMeaning ? { meaning: suggestion.clearerMeaning } : {}),
    ...(approval.distinction && suggestion.distinction ? { distinction: suggestion.distinction } : {}),
  };
}
