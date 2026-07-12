// Pure JP/ZH/mixed sentence boundary detection (no DOM). Used by reader
// highlight / collection and unit-tested without a browser.

const ENDERS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥']);
const TRAIL_CLOSE = new Set(['」', '』', '）', ')', '」', '"', "'", '”', '’']);
const OPEN_QUOTES: Record<string, string> = {
  '「': '」',
  '『': '』',
  '（': '）',
  '(': ')',
  '“': '”',
  '"': '"',
  "'": "'",
};

export interface SentenceBounds {
  start: number;
  end: number;
}

/**
 * Find the sentence containing `offset` in `text`.
 * - Enders: 。．！？!?… plus optional trailing closers 」』）"'
 * - Does not treat enders inside nested 「」『』（） pairs as sentence breaks
 *   when a matching open is on the stack (best-effort for nested quotes).
 */
export function detectSentenceBounds(text: string, offset: number): SentenceBounds {
  if (!text) return { start: 0, end: 0 };
  const n = text.length;
  let o = Math.max(0, Math.min(offset, n));

  // Start: walk back to previous ender (outside open quotes) or start.
  let start = 0;
  {
    const stack: string[] = [];
    for (let i = 0; i < o; i++) {
      const ch = text[i];
      const closer = OPEN_QUOTES[ch];
      if (closer) {
        stack.push(closer);
        continue;
      }
      if (stack.length && ch === stack[stack.length - 1]) {
        stack.pop();
        continue;
      }
      if (stack.length === 0 && ENDERS.has(ch)) {
        // Include trailing closers with previous sentence; next char is start.
        let j = i + 1;
        while (j < n && (TRAIL_CLOSE.has(text[j]) || text[j] === ' ' || text[j] === '\n')) j++;
        start = j;
      }
    }
  }

  // End: walk forward to ender (+ trailing closers) or end of text.
  let end = n;
  {
    const stack: string[] = [];
    for (let i = start; i < n; i++) {
      const ch = text[i];
      const closer = OPEN_QUOTES[ch];
      if (closer) {
        stack.push(closer);
        continue;
      }
      if (stack.length && ch === stack[stack.length - 1]) {
        stack.pop();
        continue;
      }
      if (stack.length === 0 && ENDERS.has(ch)) {
        end = i + 1;
        while (end < n && TRAIL_CLOSE.has(text[end])) end++;
        break;
      }
      // Soft break on newline when not inside quotes and we already have content.
      if (stack.length === 0 && ch === '\n' && i > start) {
        end = i;
        break;
      }
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
