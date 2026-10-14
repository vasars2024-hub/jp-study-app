/**
 * The JSON value inside a model's reply, as text.
 *
 * Models fence their JSON or put prose around it whatever the prompt says. Five
 * places used to dig it out by taking the text between the first two ``` FIRST,
 * which cut `{"explanation":"Use ```code``` like this"}` down to `code` (bug 13).
 * This reads the reply the way a parser would: every `{`/`[` is a possible start,
 * a string-aware scan finds where that value ends, and the slice counts only if it
 * parses. A fence is then just prose, and backticks in a string just characters.
 * Shared (no Node, no DOM): the renderer's mirror evaluator needs it too.
 */

export type JsonReplyKind = 'object' | 'array';

export interface JsonReplyOptions {
  /** The kind to take when the reply holds both; otherwise the first value wins. */
  prefer?: JsonReplyKind;
  /** Only this kind will do; without one, the fallback text comes back. */
  only?: JsonReplyKind;
}

export interface JsonReplyValue {
  start: number;
  end: number;
  kind: JsonReplyKind;
  text: string;
  value: unknown;
}

/** Index just past the value opening at `start`, or -1 when it never closes or mismatches. */
export function jsonValueEnd(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
    } else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i + 1;
    }
  }
  return -1;
}

/**
 * Every top-level value in `text` that parses, in order. A span that closes but
 * is not JSON (`[note]`) is stepped over whole, so nothing inside it is taken for
 * the answer; one that never closes ends the search (a truncated reply's inner
 * object is not the answer either).
 */
export function findJsonValues(text: string): JsonReplyValue[] {
  const found: JsonReplyValue[] = [];
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    const bracket = text.indexOf('[', i);
    const start = brace < 0 ? bracket : bracket < 0 ? brace : Math.min(brace, bracket);
    if (start < 0) break;
    const end = jsonValueEnd(text, start);
    if (end < 0) break;
    const slice = text.slice(start, end);
    try {
      found.push({ start, end, kind: text[start] === '{' ? 'object' : 'array', text: slice, value: JSON.parse(slice) });
    } catch {
      /* closed but not JSON */
    }
    i = end;
  }
  return found;
}

export function pickJsonValue(text: string, options: JsonReplyOptions = {}): JsonReplyValue | null {
  const values = findJsonValues(text);
  if (options.only) return values.find((v) => v.kind === options.only) ?? null;
  return (options.prefer && values.find((v) => v.kind === options.prefer)) || values[0] || null;
}

/**
 * The JSON text inside a reply. When nothing parses, the best guess at what was
 * meant comes back so the caller's own parse fails (or repairs) as before: a
 * fence's body, else everything from an unclosed `{`/`[`, else the trimmed reply.
 */
export function extractJsonReply(text: string, options: JsonReplyOptions = {}): string {
  const trimmed = text.trim();
  const picked = pickJsonValue(trimmed, options);
  if (picked) return picked.text;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]?.trim()) return fence[1].trim();
  const opens = [trimmed.indexOf('{'), trimmed.indexOf('[')].filter((n) => n >= 0);
  const start = opens.length ? Math.min(...opens) : -1;
  return start >= 0 && jsonValueEnd(trimmed, start) < 0 ? trimmed.slice(start) : trimmed;
}

/** The parsed value inside a reply, or `undefined`. */
export function parseJsonReply(text: string, options: JsonReplyOptions = {}): unknown {
  return pickJsonValue(text.trim(), options)?.value;
}
