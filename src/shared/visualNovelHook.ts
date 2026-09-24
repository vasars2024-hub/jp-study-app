import type { VisualNovelTextKind } from './visualNovel';

export const VISUAL_NOVEL_HOOK_LINE_LIMIT = 500;
export const VISUAL_NOVEL_HOOK_TEXT_LIMIT = 2_000;

export interface VisualNovelHookLine {
  japanese: string;
  speaker: string;
  kind: VisualNovelTextKind;
}

export interface VisualNovelHookState {
  visualNovelId: string;
  active: boolean;
  filePath: string;
  capturedLines: number;
  lastError: string;
}

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u;

/** Opening bracket → its closing bracket, for the quote styles VN engines print. */
const QUOTE_PAIRS: Record<string, string> = {
  '「': '」',
  '『': '』',
  '（': '）',
  '(': ')',
  '“': '”',
};

/**
 * A speaker prefix is a short name: no sentence punctuation, no whitespace, and
 * not ending in a particle. The particle rule is what keeps `彼は「そうだ」` — a
 * narration line that QUOTES someone — from being read as a speaker called 彼は.
 */
function plausibleSpeaker(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > 16) return false;
  if (/[\s。、．，,.!！]/u.test(trimmed)) return false;
  if (/[「」『』（）()【】[\]]/u.test(trimmed)) return false;
  if (/[はがをにへとでもやて]$/u.test(trimmed) && [...trimmed].length > 1) return false;
  return true;
}

/** `「…」` → `…` when the whole text is exactly one quotation. */
function unwrapQuote(text: string): { text: string; quoted: boolean } {
  const value = text.trim();
  const open = value[0];
  const close = open ? QUOTE_PAIRS[open] : undefined;
  if (!close || value.length < 3) return { text: value, quoted: false };
  const inner = value.endsWith(close) ? value.slice(1, -1) : value.slice(1);
  // Two quotations on one line (「a」「b」) stay as printed.
  if (inner.includes(open) || inner.includes(close)) return { text: value, quoted: false };
  return { text: inner.trim(), quoted: true };
}

/**
 * Split one captured line into speaker and text.
 *
 * Handles the formats text hookers and VN engines print:
 *   【紅莉栖】それは違うわ。      [紅莉栖] それは違うわ。
 *   紅莉栖「実験を始めよう。」    紅莉栖『……』    紅莉栖（そうかしら）
 *   まゆり: トゥットゥルー        まゆり：トゥットゥルー
 * and `【紅莉栖】「…」`, where the bracketed name is followed by a quotation.
 * A lone quotation with no name is dialogue by an unknown speaker; anything
 * else is narration. The outer quote marks of attributed dialogue are removed
 * so a mined sentence reads as the sentence itself.
 */
export function parseVisualNovelHookLine(value: string): VisualNovelHookLine | null {
  const normalized = value
    .replace(/^\uFEFF/, '')
    .replace(/^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|\d{1,2}:\d{2}(?::\d{2})?)\s*/, '')
    .trim();
  if (!normalized || !JAPANESE.test(normalized)) return null;

  let speaker = '';
  let rest = normalized;

  const bracketed = normalized.match(/^(?:【([^】]{1,80})】|\[([^\]]{1,80})\])\s*(.+)$/u);
  if (bracketed) {
    speaker = (bracketed[1] ?? bracketed[2] ?? '').trim();
    rest = bracketed[3];
  } else {
    const quoted = normalized.match(/^([^「『（(“:：]{1,16})\s*([「『（(“].*)$/u);
    const quoteClose = quoted ? QUOTE_PAIRS[quoted[2][0]] : undefined;
    if (quoted && quoteClose && quoted[2].trim().endsWith(quoteClose) && plausibleSpeaker(quoted[1])) {
      speaker = quoted[1].trim();
      rest = quoted[2];
    } else {
      const colon = normalized.match(/^([^：:\s]{1,40})[：:]\s*(.+)$/u);
      if (colon && plausibleSpeaker(colon[1])) {
        speaker = colon[1].trim();
        rest = colon[2];
      }
    }
  }

  const unwrapped = unwrapQuote(rest);
  const japanese = unwrapped.text.slice(0, VISUAL_NOVEL_HOOK_TEXT_LIMIT);
  if (!japanese || !JAPANESE.test(japanese)) return null;
  return {
    japanese,
    speaker,
    kind: speaker || unwrapped.quoted ? 'dialogue' : 'narration',
  };
}

export function parseVisualNovelHookChunk(value: string): VisualNovelHookLine[] {
  return value
    .split(/\r?\n/u)
    .slice(0, VISUAL_NOVEL_HOOK_LINE_LIMIT)
    .flatMap((line) => {
      const parsed = parseVisualNovelHookLine(line);
      return parsed ? [parsed] : [];
    });
}

/**
 * One capture from a source that delivers a whole text box at a time (the
 * clipboard, a texthooker websocket). A text box can wrap onto several lines;
 * Japanese has no spaces between words, so the pieces are joined, not spaced.
 */
export function parseVisualNovelTextBox(value: string): VisualNovelHookLine | null {
  const joined = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('');
  return parseVisualNovelHookLine(joined);
}
