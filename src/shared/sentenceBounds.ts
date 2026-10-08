// Pure JP/ZH/mixed sentence boundary detection (no DOM). Used by reader
// highlight / collection and unit-tested without a browser.
// extension/shared.js carries a twin of this file; keep the two in step
// (src/shared/__tests__/extensionCommandRegistry.test.ts compares them).

const ENDERS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥']);
const TRAIL_CLOSE = new Set(['」', '』', '）', ')', '"', "'", '”', '’']);
const OPEN_QUOTES = new Set(['「', '『', '（', '(', '“', '"', "'"]);
/** Closing brackets that can end a sentence on their own (dialogue without a 。). */
const CJK_CLOSE = new Set(['」', '』', '）']);
/** Openers that start a new sentence right after a closing bracket. */
const CJK_OPEN = new Set(['「', '『', '（', '“']);

/** True for any punctuation that should trigger sentence-select instead of word lookup on click. */
export function isSentencePunct(ch: string): boolean {
  return ENDERS.has(ch) || TRAIL_CLOSE.has(ch) || OPEN_QUOTES.has(ch) || ch === '、' || ch === ',' || ch === '，';
}

export interface SentenceBounds {
  start: number;
  end: number;
}

/**
 * Does the sentence end at index `i`?
 *
 * An ender (。．！？!?…) ends it, together with any closers and further enders
 * that follow. A closing bracket (」』）) ends it on its own only when nothing
 * carries on after it — end of text, a line break, a space, or the next quote
 * opening — because Japanese dialogue routinely omits the ender before a
 * closing quote (「元気ですか」「はい」). A quote the sentence continues past is
 * part of it: 「行く」と言った。 and 彼は「行く。」と言った。 are one sentence
 * each, which is what a card mined from either should carry. ASCII quotes and
 * apostrophes are never boundaries by themselves (an apostrophe split "don't").
 */
function sentenceBoundaryAt(text: string, i: number): boolean {
  const ch = text[i];
  const ender = ENDERS.has(ch);
  if (!ender && !CJK_CLOSE.has(ch)) return false;
  let j = i + 1;
  let sawCloser = false;
  while (j < text.length && (TRAIL_CLOSE.has(text[j]) || (ender && ENDERS.has(text[j])))) {
    if (TRAIL_CLOSE.has(text[j])) sawCloser = true;
    j++;
  }
  if (ender && !sawCloser) return true;
  if (j >= text.length) return true;
  const next = text[j];
  if (/\s/.test(next) || CJK_OPEN.has(next)) return true;
  // 」。 — the 。 is the boundary. 「行く。」と / 「行く」と — the sentence goes on.
  return false;
}

/**
 * Find the sentence containing `offset` in `text`.
 *
 * Boundaries are decided by `sentenceBoundaryAt`. This deliberately does NOT
 * special-case quote nesting: a 「...」 block containing several sentences
 * (the normal case for dialogue) breaks sentence-by-sentence like any other
 * text, rather than being treated as one giant unbreakable span.
 */
export function detectSentenceBounds(text: string, offset: number): SentenceBounds {
  if (!text) return { start: 0, end: 0 };
  const n = text.length;
  const o = Math.max(0, Math.min(offset, n));

  // Start: walk back to the previous boundary, or start of text.
  let start = 0;
  for (let i = 0; i < o; i++) {
    if (sentenceBoundaryAt(text, i)) {
      let j = i + 1;
      while (j < n && (TRAIL_CLOSE.has(text[j]) || ENDERS.has(text[j]) || text[j] === ' ' || text[j] === '\n')) j++;
      start = j;
    }
  }

  // End: walk forward to the next boundary (absorbing further trailing closers
  // and enders), a newline, or end of text.
  let end = n;
  for (let i = start; i < n; i++) {
    const ch = text[i];
    if (sentenceBoundaryAt(text, i)) {
      end = i + 1;
      while (end < n && (TRAIL_CLOSE.has(text[end]) || ENDERS.has(text[end]))) end++;
      break;
    }
    if (ch === '\n' && i > start) {
      end = i;
      break;
    }
  }

  // Skip leading whitespace in the slice.
  while (start < end && /\s/.test(text[start])) start++;
  return { start, end };
}

/** Sentence string at offset (trimmed, length-capped). */
export function sentenceAt(text: string, offset: number, maxLen = 200): string {
  const { start, end } = detectSentenceBounds(text, offset);
  return text.slice(start, end).trim().slice(0, maxLen);
}
