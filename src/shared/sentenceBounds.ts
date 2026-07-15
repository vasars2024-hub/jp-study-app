// Pure JP/ZH/mixed sentence boundary detection (no DOM). Used by reader
// highlight / collection and unit-tested without a browser.

const ENDERS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥']);
const TRAIL_CLOSE = new Set(['」', '』', '）', ')', '"', "'", '”', '’']);
const OPEN_QUOTES = new Set(['「', '『', '（', '(', '“', '"', "'"]);

/** True for any punctuation that should trigger sentence-select instead of word lookup on click. */
export function isSentencePunct(ch: string): boolean {
  return ENDERS.has(ch) || TRAIL_CLOSE.has(ch) || OPEN_QUOTES.has(ch) || ch === '、' || ch === ',' || ch === '，';
}

export interface SentenceBounds {
  start: number;
  end: number;
}

/**
 * Find the sentence containing `offset` in `text`.
 *
 * A sentence ends at an ender (。．！？!?…) or a closing bracket/quote
 * (」』）)"'”’ — Japanese dialogue routinely omits the ender before a closing
 * quote (「元気ですか」 not 「元気ですか。」), so closers are boundaries in
 * their own right, not just trailing decoration on an ender. This
 * deliberately does NOT special-case quote nesting: a 「...」 block containing
 * several sentences (the normal case for dialogue) breaks sentence-by-
 * sentence like any other text, rather than being treated as one giant
 * unbreakable span.
 */
export function detectSentenceBounds(text: string, offset: number): SentenceBounds {
  if (!text) return { start: 0, end: 0 };
  const n = text.length;
  const o = Math.max(0, Math.min(offset, n));
  const isBoundary = (ch: string) => ENDERS.has(ch) || TRAIL_CLOSE.has(ch);

  // Start: walk back to the previous boundary char, or start of text.
  let start = 0;
  for (let i = 0; i < o; i++) {
    if (isBoundary(text[i])) {
      let j = i + 1;
      while (j < n && (TRAIL_CLOSE.has(text[j]) || text[j] === ' ' || text[j] === '\n')) j++;
      start = j;
    }
  }

  // End: walk forward to the next boundary char (absorbing further trailing
  // closers), a newline, or end of text.
  let end = n;
  for (let i = start; i < n; i++) {
    const ch = text[i];
    if (isBoundary(ch)) {
      end = i + 1;
      while (end < n && TRAIL_CLOSE.has(text[end])) end++;
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
