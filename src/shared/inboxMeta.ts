/**
 * Pure helpers for Chrome-extension Inbox tagging (Phase 9).
 * No Electron / DOM / Node imports — unit-tested in isolation.
 */

import { hasHan, hasKana, hasLatin } from './langs';

export type InboxLang = 'ja' | 'zh' | 'en' | 'unknown';

export const INBOX_FOLDER = 'Inbox';
export const EXTENSION_PORT = 18765;

/** Normalize article text before hashing / length stats. */
export function normalizeInboxText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** FNV-1a 64-bit hex digest — sync, no Node crypto (safe for renderer imports). */
export function contentHash(text: string): string {
  const s = normalizeInboxText(text);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Script heuristic lang-ID for inbox articles. */
export function detectInboxLang(text: string): InboxLang {
  const sample = text.slice(0, 8000);
  const kana = hasKana(sample);
  const han = hasHan(sample);
  if (kana) return 'ja';
  if (han && !kana) return 'zh';
  if (hasLatin(sample) && !han && !kana) return 'en';
  return 'unknown';
}

/** Count characters excluding pure whitespace. */
export function charCount(text: string): number {
  return normalizeInboxText(text).replace(/\s/g, '').length;
}

/** Rough reading-time estimate in minutes (minimum 1 when there is text). */
export function estReadingMinutes(text: string, lang: InboxLang): number {
  const n = charCount(text);
  if (n <= 0) return 0;
  const perMin = lang === 'zh' ? 200 : lang === 'ja' ? 400 : 1000;
  return Math.max(1, Math.round(n / perMin));
}

/**
 * Map known-ratio (0..1) to a coarse 1..7 level band.
 * Higher known% → lower difficulty estimate.
 */
export function levelFromKnownRatio(knownRatio: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const r = Math.min(1, Math.max(0, knownRatio));
  if (r >= 0.95) return 1;
  if (r >= 0.88) return 2;
  if (r >= 0.8) return 3;
  if (r >= 0.7) return 4;
  if (r >= 0.55) return 5;
  if (r >= 0.4) return 6;
  return 7;
}

export function buildInboxMetaBase(opts: {
  sourceUrl: string;
  text: string;
  receivedAt?: number;
}): {
  sourceUrl: string;
  contentHash: string;
  lang: InboxLang;
  charCount: number;
  estMinutes: number;
  knownRatio: number;
  levelEstimate: null;
  receivedAt: number;
  textSample: string;
} {
  const text = normalizeInboxText(opts.text);
  const lang = detectInboxLang(text);
  return {
    sourceUrl: opts.sourceUrl,
    contentHash: contentHash(text),
    lang,
    charCount: charCount(text),
    estMinutes: estReadingMinutes(text, lang),
    knownRatio: 0,
    levelEstimate: null,
    receivedAt: opts.receivedAt ?? Date.now(),
    textSample: text.slice(0, 8000),
  };
}

/**
 * Compare two strings in time that depends only on their lengths, never on
 * where they first differ.
 *
 * `===` returns at the first mismatching character, which lets a caller who can
 * time requests recover a secret one character at a time. Pure JS rather than
 * `crypto.timingSafeEqual` because this module is also bundled into the
 * renderer (see the header), where `node:crypto` does not exist. Every position
 * up to the longer length is visited, and a length mismatch is folded into the
 * same accumulator instead of returning early.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    // Past the end, charCodeAt is NaN and `| 0` turns it into 0 without a branch.
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/** True when Authorization header carries the expected bearer token. */
export function checkBearerToken(header: string | undefined, token: string): boolean {
  if (!token || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return constantTimeEqual(m[1].trim(), token);
}

/** Allow chrome-extension:// origins (and missing Origin on same-machine tools). */
export function isAllowedExtensionOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return /^chrome-extension:\/\//i.test(origin);
}
