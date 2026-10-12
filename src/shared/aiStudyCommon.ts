/**
 * What the optional AI study helpers share: the reply shape every one of them
 * returns, the request-id rule that lets the renderer cancel one, and the small
 * text helpers the request normalizers use.
 *
 * The helpers themselves (docs/AI_AUDIT.md N1, N2, N3, N5):
 *
 * - `whyWrong`          "Why was I wrong?" after Again / a wrong typed answer
 * - `exampleSentences`  i+1 example sentences for a card
 * - `leechRescue`       mnemonic, clearer meaning and a distinguishing note for a leech
 * - `contextExplain`    which dictionary sense fits the sentence a word was looked up in
 *
 * Each is ADDITIVE: the surface it sits on works exactly as before without it,
 * each has a deterministic fallback computed in the renderer, and each runs on
 * the offline model when that is the configured engine. A cloud provider is only
 * used when the feature's own opt-in in Settings > AI allows it.
 *
 * Pure and framework-free: the renderer and main both read it.
 */
import type { AiErrorCode } from './aiErrorCodes';
import { isUiLang, type UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export type AiStudyFeature = 'whyWrong' | 'exampleSentences' | 'leechRescue' | 'contextExplain';

/** Every helper answers in this shape. `result` is only present on success. */
export interface AiStudyResponse<T> {
  ok: boolean;
  result?: T;
  /** Why it failed; the surface says it in the UI language (`aiErrorKey`). */
  code?: AiErrorCode;
  /** English, for logs only. Never rendered when `code` is present. */
  error?: string;
  /** Served from the cache of validated answers; nothing was sent. */
  cached?: boolean;
  /** "Use AI features" is off. The surface hides itself. */
  aiOff?: boolean;
  /** The configured cloud provider has no key (or local server URL). */
  needsKey?: boolean;
  /** The offline engine is selected but its model is not installed. */
  needsLocalModel?: boolean;
  /** The cloud engine is selected and this feature's opt-in is off. */
  needsConsent?: boolean;
  /**
   * The request carries study statistics and the user has not allowed them to
   * leave the device (Agent settings, `agentCloudStudyDataGate.ts`).
   */
  studyDataWithheld?: boolean;
  /** Which engine produced the answer. */
  engine?: 'cloud' | 'local';
}

/** Ids the renderer makes up for a request it may want to cancel. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeAiStudyRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : undefined;
}

/** A trimmed, length-capped single string; anything that is not a string is empty. */
export function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const chars = [...value.replace(/\s+/g, ' ').trim()];
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
}

/** A list of clipped, non-empty, de-duplicated strings, at most `limit` of them. */
export function clipList(value: unknown, limit: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (out.length >= limit) break;
    const text = clipText(raw, maxChars);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export function normalizeAnswerLang(value: unknown): UiLang {
  return isUiLang(value) ? value : 'en';
}

export function normalizeAiStudyLang(value: unknown): StudyLang {
  return normalizeStudyLang(value);
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Mandarin Chinese',
  ru: 'Russian',
};

/** The English name a prompt uses for a language code. */
export function promptLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? 'English';
}

/** Shared tail of every prompt: the answer is shown as plain text, never as markup. */
export const PLAIN_TEXT_RULE =
  'Write plain text only: no Markdown, no HTML, no emoji, no code fences. Keep every field short.';

/**
 * Model text is only ever rendered as React text, which escapes it. This also
 * drops control characters and any tag-shaped markup a model added anyway, so a
 * stored answer cannot carry markup into a later surface that is less careful.
 */
export function plainModelText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(/\*\*|__|`+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const chars = [...cleaned];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : cleaned;
}
