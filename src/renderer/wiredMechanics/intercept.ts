/**
 * Intercepts — the pure half of the idle-return dictation.
 *
 * When the operator comes back to the terminal after being away, the archive
 * may have caught a transmission: one of their own mined sentences (or a word
 * from their deck), spoken by the OS voice, to be typed back. This file decides
 * WHETHER one may fire (gates + rate limit) and WHAT it carries; the host owns
 * the listeners and the panel.
 */
import { seededIndex } from '../findingModules';

/** How long without input counts as "away". */
export const INTERCEPT_IDLE_MS = 90_000;

export interface InterceptBlockers {
  /** A review is on screen (Signal decrypt console, or a flashcard review). */
  reviewing: boolean;
  /** A video is playing. */
  video: boolean;
  /** Focus is in a text field. */
  typing: boolean;
  /** Lock screen / boot / sleep owns the screen. */
  locked: boolean;
  /** Window hidden. */
  hidden: boolean;
}

export interface InterceptGateInput {
  now: number;
  enabled: boolean;
  /** Epoch ms of the last intercept shown (answered or ignored), null if never. */
  lastAt: number | null;
  intervalMin: number;
  /** How long the user had been idle before this activity. */
  idleForMs: number;
  blockers: InterceptBlockers;
  /** Manual trigger (`intercept` command): skips the idle + interval checks, keeps the blockers. */
  manual?: boolean;
}

export type InterceptGateReason =
  | 'ok'
  | 'disabled'
  | 'not-idle'
  | 'rate-limited'
  | 'reviewing'
  | 'video'
  | 'typing'
  | 'locked'
  | 'hidden';

export function interceptGate(input: InterceptGateInput): InterceptGateReason {
  if (!input.enabled && !input.manual) return 'disabled';
  const b = input.blockers;
  if (b.hidden) return 'hidden';
  if (b.locked) return 'locked';
  if (b.reviewing) return 'reviewing';
  if (b.video) return 'video';
  // A manual `intercept` is typed into the terminal, so focus is in a field by
  // definition; only the automatic trigger waits for the user to stop typing.
  if (b.typing && !input.manual) return 'typing';
  if (input.manual) return 'ok';
  if (input.idleForMs < INTERCEPT_IDLE_MS) return 'not-idle';
  const minGap = Math.max(1, input.intervalMin) * 60_000;
  if (input.lastAt !== null && input.now - input.lastAt < minGap) return 'rate-limited';
  return 'ok';
}

export function nextInterceptAllowedAt(lastAt: number | null, intervalMin: number): number {
  return lastAt === null ? 0 : lastAt + Math.max(1, intervalMin) * 60_000;
}

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

export interface InterceptCardLike {
  id: string;
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  known?: boolean;
  srs?: { intervalDays?: number } | undefined;
}

export interface InterceptSource {
  cardId: string;
  /** What is spoken and must be typed back. */
  text: string;
  /** The deck word this came from (for the log and the reveal). */
  word: string;
  reading?: string;
  meaning?: string;
  /** `sentence` = a mined sentence; `word` = a known-word fallback. */
  kind: 'sentence' | 'word';
}

const JP = /[぀-ヿ㐀-鿿]/u;

function usableSentence(s: string | undefined): s is string {
  if (!s) return false;
  const t = s.trim();
  const len = [...t].length;
  return len >= 5 && len <= 42 && JP.test(t);
}

/**
 * Prefer sentences the user has already met (reviewed at least once, or marked
 * known) — dictation tests listening, not new material. Falls back to any mined
 * sentence, then to a reviewed word. Null when the deck holds nothing usable.
 */
export function pickInterceptSource(cards: readonly InterceptCardLike[], seed: number): InterceptSource | null {
  const met = (c: InterceptCardLike): boolean => !!c.known || (c.srs?.intervalDays ?? 0) > 0;
  const sentences = cards.filter((c) => usableSentence(c.sentence));
  const metSentences = sentences.filter(met);
  const pool = metSentences.length ? metSentences : sentences;
  if (pool.length) {
    const c = pool[seededIndex(seed, pool.length)];
    return {
      cardId: c.id,
      text: (c.sentence ?? '').trim(),
      word: c.word,
      reading: c.reading,
      meaning: c.meaning,
      kind: 'sentence',
    };
  }
  const words = cards.filter((c) => JP.test(c.word ?? '') && met(c));
  if (!words.length) return null;
  const c = words[seededIndex(seed, words.length)];
  return { cardId: c.id, text: c.word.trim(), word: c.word, reading: c.reading, meaning: c.meaning, kind: 'word' };
}

/** A pass is an exact match, or 90+ after kana folding. */
export function interceptPassed(evaluation: { exact: boolean; score: number }): boolean {
  return evaluation.exact || evaluation.score >= 90;
}

/** `ICP-4F2A` — transmission id, literal. */
export function interceptCode(seed: number): string {
  return `ICP-${((seed >>> 0) % 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}
