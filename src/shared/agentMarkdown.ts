/**
 * The small markdown a language model actually emits, turned into a tree.
 *
 * Every provider this app talks to — the local Qwen host and both cloud
 * providers — answers in markdown whether or not it was asked to, so the Agent
 * and Blanc chat bubbles were rendering `**「食べる」**` and `- *私たちは…*` as
 * literal asterisks. This module exists so that text can be shown as the model
 * meant it without pulling in a markdown dependency, and without ever building
 * HTML from provider output.
 *
 * Three deliberate limits, each of which is a property and not an omission:
 *
 * 1. **No HTML.** The result is a plain data tree the renderer maps to React
 *    elements. Nothing here produces a string that any caller could hand to
 *    `dangerouslySetInnerHTML`, so a provider cannot inject markup by returning
 *    it. That is the whole reason this is a parser and not a `String.replace`
 *    chain.
 * 2. **Links are not anchors.** `[label](url)` renders as its label followed by
 *    the bare URL as text. A model-supplied URL must not become a one-click
 *    navigation out of a chat bubble; the user can still read and copy it.
 * 3. **An unclosed delimiter stays literal.** Answers are rendered *while they
 *    stream*, so a half-arrived `**bold` must not swallow the rest of the
 *    message and then re-flow when the closing pair lands. Emphasis is emitted
 *    only on a matched close.
 */

/** A run of text inside a block. */
export interface AgentMarkdownSpan {
  kind: 'text' | 'bold' | 'italic' | 'code';
  text: string;
}

export type AgentMarkdownBlock =
  | { kind: 'paragraph'; spans: AgentMarkdownSpan[] }
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: AgentMarkdownSpan[] }
  | { kind: 'list'; ordered: boolean; items: AgentMarkdownSpan[][] }
  | { kind: 'code'; text: string; language: string };

const BULLET = /^[ \t]{0,3}[-*•]\s+(.*)$/;
const ORDERED = /^[ \t]{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^[ \t]{0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^[ \t]{0,3}(?:```|~~~)\s*([A-Za-z0-9+#._-]*)\s*$/;
const LINK = /\[([^\]\n]*)\]\(([^()\s]*)\)/;

/**
 * `**bold**` before `*italic*`, so the longer delimiter wins on a string that
 * opens with both. Each entry is the delimiter, its span kind, and whether the
 * content may contain the delimiter's own character (code may; emphasis may
 * not, or `a * b * c` inside a formula becomes an italic run).
 */
const INLINE_RULES: readonly { open: string; kind: AgentMarkdownSpan['kind'] }[] = [
  { open: '**', kind: 'bold' },
  { open: '__', kind: 'bold' },
  { open: '`', kind: 'code' },
  { open: '*', kind: 'italic' },
  { open: '_', kind: 'italic' },
];

function pushText(spans: AgentMarkdownSpan[], text: string): void {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else spans.push({ kind: 'text', text });
}

/**
 * Emphasis needs a non-space character on the inside of both delimiters, which
 * is what keeps a bare `2 * 3 * 4` and a trailing `_` in an identifier literal.
 * Code spans skip that rule: `` ` ` `` is a legitimate one-space code span and
 * models do emit it.
 */
function closeIndexFor(source: string, from: number, open: string, kind: string): number {
  let at = from;
  for (;;) {
    const found = source.indexOf(open, at);
    if (found < 0) return -1;
    const inner = source.slice(from, found);
    if (!inner) {
      at = found + open.length;
      continue;
    }
    if (kind === 'code') return found;
    if (!/\s$/.test(inner)) return found;
    at = found + open.length;
  }
}

/** Splits one logical line into text/bold/italic/code runs. */
export function parseAgentMarkdownSpans(line: string): AgentMarkdownSpan[] {
  const spans: AgentMarkdownSpan[] = [];
  let index = 0;
  while (index < line.length) {
    const link = LINK.exec(line.slice(index));
    const linkAt = link ? index + (link.index ?? 0) : -1;

    let matched: { open: string; kind: AgentMarkdownSpan['kind'] } | null = null;
    for (const rule of INLINE_RULES) {
      if (line.startsWith(rule.open, index)) {
        matched = rule;
        break;
      }
    }

    if (linkAt === index && link) {
      // Label plus the bare URL as text — never an anchor. See the header.
      const [, label, url] = link;
      pushText(spans, label && url ? `${label} (${url})` : label || url);
      index += link[0].length;
      continue;
    }

    if (matched) {
      const contentFrom = index + matched.open.length;
      // Emphasis must open on a non-space too, so `a ** b` stays literal, and an
      // underscore inside a word is a word — `some_var_name` is an identifier a
      // model writes constantly and is not two italic runs.
      const intraword = matched.open.startsWith('_') && /[A-Za-z0-9]/.test(line[index - 1] ?? '');
      const opensWell = matched.kind === 'code'
        || (!intraword && !/^\s/.test(line.slice(contentFrom, contentFrom + 1)));
      const close = opensWell ? closeIndexFor(line, contentFrom, matched.open, matched.kind) : -1;
      if (close > contentFrom) {
        spans.push({ kind: matched.kind, text: line.slice(contentFrom, close) });
        index = close + matched.open.length;
        continue;
      }
      // Unmatched (or still streaming): the delimiter is content.
      pushText(spans, line.slice(index, index + matched.open.length));
      index += matched.open.length;
      continue;
    }

    const nextSpecial = (() => {
      let best = line.length;
      for (const rule of INLINE_RULES) {
        const at = line.indexOf(rule.open, index + 1);
        if (at >= 0 && at < best) best = at;
      }
      if (linkAt > index && linkAt < best) best = linkAt;
      return best;
    })();
    pushText(spans, line.slice(index, Math.max(nextSpecial, index + 1)));
    index = Math.max(nextSpecial, index + 1);
  }
  return spans;
}

/**
 * Turns an assistant answer into blocks.
 *
 * Never throws and never returns nothing for non-empty input: a message that
 * parses to no block at all would silently erase an answer the user is waiting
 * on, which is strictly worse than the raw asterisks this replaces.
 */
export function parseAgentMarkdown(source: string): AgentMarkdownBlock[] {
  const text = typeof source === 'string' ? source : '';
  if (!text.trim()) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: AgentMarkdownBlock[] = [];

  let paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const joined = paragraph.join('\n').trim();
    paragraph = [];
    if (joined) blocks.push({ kind: 'paragraph', spans: parseAgentMarkdownSpans(joined) });
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const language = fence[1] ?? '';
      const body: string[] = [];
      index += 1;
      // An unterminated fence is kept as a code block rather than discarded —
      // that is the shape of a code answer that is still streaming.
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', text: body.join('\n'), language });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        spans: parseAgentMarkdownSpans(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: AgentMarkdownSpan[][] = [];
      while (index < lines.length) {
        const b = BULLET.exec(lines[index]);
        const o = ORDERED.exec(lines[index]);
        const content = isOrdered ? o?.[2] : b?.[1];
        // A list ends at the first line that is not the same kind of item, so a
        // bulleted list under a numbered one stays two lists rather than one.
        if (content === undefined) break;
        items.push(parseAgentMarkdownSpans(content.trim()));
        index += 1;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();

  // Unreachable against today's grammar — every non-blank line falls through to
  // `paragraph` — and kept as the floor under it, so a future block kind that
  // consumes lines and emits nothing cannot silently erase an answer.
  if (!blocks.length) blocks.push({ kind: 'paragraph', spans: [{ kind: 'text', text }] });
  return blocks;
}

/**
 * Whether the text carries any construct this parser would change. Used by the
 * renderers so a plain answer keeps the exact single `<p>` it has today — the
 * markdown path is an addition for the messages that need it, not a rewrite of
 * every message.
 */
export function hasAgentMarkdown(source: string): boolean {
  const text = typeof source === 'string' ? source : '';
  if (!text) return false;
  if (/(\*\*|__|`|\[[^\]\n]*\]\()/.test(text)) return true;
  return text.split('\n').some((line) => BULLET.test(line) || ORDERED.test(line) || HEADING.test(line));
}
