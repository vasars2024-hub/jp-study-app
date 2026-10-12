/**
 * Release notes are Markdown from GitHub. The update panel renders a small, safe
 * subset of it: headings, paragraphs, bullet and numbered lists (two levels),
 * bold, italic, inline code, code blocks, quotes, rules, and links.
 *
 * Nothing here produces HTML. The parser returns a tree of plain strings, and the
 * panel maps it to React elements, so `<script>`, `<img onerror>`, `<iframe>` …
 * in the notes are shown as the literal text they are and never become markup.
 * HTML comments are dropped (GitHub hides them too).
 *
 * Links: only `https://github.com/<owner>/<repo>/…` (this project) becomes a
 * link, and the panel opens it through main (`appUpdate:openLink`, which checks
 * the same rule before `shell.openExternal`). Any other link is shown as text,
 * with its address beside it so the reader can see where it pointed.
 */
import { GITHUB_OWNER, GITHUB_REPO } from './release';

export type MdInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: MdInline[] }
  | { t: 'em'; c: MdInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: MdInline[] }
  | { t: 'br' };

export interface MdListItem {
  c: MdInline[];
  sub?: MdList;
}

export interface MdList {
  t: 'list';
  ordered: boolean;
  start?: number;
  items: MdListItem[];
}

export type MdBlock =
  | { t: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; c: MdInline[] }
  | { t: 'paragraph'; c: MdInline[] }
  | MdList
  | { t: 'code'; v: string }
  | { t: 'quote'; c: MdInline[] }
  | { t: 'rule' };

const PROJECT_PATH = `/${GITHUB_OWNER}/${GITHUB_REPO}`.toLowerCase();

/** This project's pages on github.com, over https, with no credentials in the URL. */
export function isProjectGithubUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com' || u.port) return false;
  if (u.username || u.password) return false;
  const p = u.pathname.toLowerCase();
  return p === PROJECT_PATH || p.startsWith(`${PROJECT_PATH}/`);
}

const MAX_DEPTH = 4;
const URL_RE = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/;

function pushText(out: MdInline[], v: string): void {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += v;
  else out.push({ t: 'text', v });
}

function isWordChar(ch: string | undefined): boolean {
  return Boolean(ch && /[\p{L}\p{N}]/u.test(ch));
}

/** Inline Markdown to nodes. Unclosed or unknown syntax stays literal text. */
export function parseInline(src: string, allow: (url: string) => boolean = isProjectGithubUrl, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  const linkOrText = (href: string, label: MdInline[], labelText: string) => {
    if (allow(href)) {
      out.push({ t: 'link', href, c: label.length ? label : [{ t: 'text', v: href }] });
      return;
    }
    // Not a link we open: the words, then where it pointed, all as text.
    for (const node of label) {
      if (node.t === 'text') pushText(out, node.v);
      else out.push(node);
    }
    if (!labelText) pushText(out, href);
    else if (labelText !== href) pushText(out, ` (${href})`);
  };
  while (i < src.length) {
    const ch = src[i]!;
    const rest = src.slice(i);
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#+\-.!<>~|{}]/.test(src[i + 1]!)) {
      pushText(out, src[i + 1]!);
      i += 2;
      continue;
    }
    if (ch === '\n') {
      out.push({ t: 'br' });
      i += 1;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(rest)![0];
      const close = src.indexOf(run, i + run.length);
      if (close > i) {
        const code = src.slice(i + run.length, close);
        out.push({ t: 'code', v: code.length > 2 && code.startsWith(' ') && code.endsWith(' ') ? code.slice(1, -1) : code });
        i = close + run.length;
        continue;
      }
      pushText(out, run);
      i += run.length;
      continue;
    }
    if (depth < MAX_DEPTH && (rest.startsWith('**') || rest.startsWith('__'))) {
      const delim = rest.slice(0, 2);
      const close = src.indexOf(delim, i + 2);
      if (close > i + 2 && !/\s/.test(src[i + 2]!) && (delim === '**' || !isWordChar(src[i - 1]))) {
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, close), allow, depth + 1) });
        i = close + 2;
        continue;
      }
    }
    if (depth < MAX_DEPTH && (ch === '*' || ch === '_') && src[i + 1] !== ch) {
      // `_` only at a word boundary, so snake_case_names stay as they are.
      if (ch === '*' || !isWordChar(src[i - 1])) {
        let close = -1;
        for (let j = i + 1; j < src.length; j++) {
          if (src[j] === '\n' && src[j + 1] === '\n') break;
          if (src[j] === ch && src[j + 1] !== ch && src[j - 1] !== ch && !/\s/.test(src[j - 1]!)) {
            if (ch === '_' && isWordChar(src[j + 1])) continue;
            close = j;
            break;
          }
        }
        if (close > i + 1 && !/\s/.test(src[i + 1]!)) {
          out.push({ t: 'em', c: parseInline(src.slice(i + 1, close), allow, depth + 1) });
          i = close + 1;
          continue;
        }
      }
    }
    if (ch === '[') {
      const m = /^\[([^\]\n]{0,500})\]\(\s*<?([^\s<>()]{1,2048})>?(?:\s+"[^"\n]*")?\s*\)/.exec(rest);
      if (m) {
        const label = depth < MAX_DEPTH ? parseInline(m[1]!, () => false, depth + 1) : [{ t: 'text' as const, v: m[1]! }];
        linkOrText(m[2]!, label, m[1]!);
        i += m[0].length;
        continue;
      }
    }
    if (ch === '<') {
      const m = /^<(https?:\/\/[^\s<>]{1,2048})>/.exec(rest);
      if (m) {
        linkOrText(m[1]!, [], '');
        i += m[0].length;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && !isWordChar(src[i - 1])) {
      const m = URL_RE.exec(rest);
      if (m) {
        linkOrText(m[0], [], '');
        i += m[0].length;
        continue;
      }
    }
    pushText(out, ch);
    i += 1;
  }
  return out;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;

function indentOf(ws: string): number {
  return ws.replace(/\t/g, '    ').length;
}

/** Block Markdown to a tree. Never throws; at worst everything is a paragraph. */
export function parseReleaseMarkdown(source: string, allow: (url: string) => boolean = isProjectGithubUrl): MdBlock[] {
  const text = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = text.split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'paragraph', c: parseInline(para.join('\n').trim(), allow) });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1]!;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) body.push(lines[i++]!);
      i += 1; // the closing fence (or the end)
      blocks.push({ t: 'code', v: body.join('\n') });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ t: 'heading', level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline((heading[2] ?? '').trim(), allow) });
      i += 1;
      continue;
    }
    if (RULE_RE.test(line)) {
      flush();
      blocks.push({ t: 'rule' });
      i += 1;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim() && QUOTE_RE.test(lines[i]!)) body.push(QUOTE_RE.exec(lines[i++]!)![1]!);
      blocks.push({ t: 'quote', c: parseInline(body.join('\n').trim(), allow) });
      continue;
    }
    const item = ITEM_RE.exec(line);
    if (item) {
      flush();
      const { list, next } = parseList(lines, i, allow);
      blocks.push(list);
      i = next;
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flush();
  return blocks;
}

function parseList(lines: string[], start: number, allow: (url: string) => boolean): { list: MdList; next: number } {
  const first = ITEM_RE.exec(lines[start]!)!;
  const baseIndent = indentOf(first[1]!);
  const ordered = /\d/.test(first[2]!);
  const list: MdList = { t: 'list', ordered, items: [] };
  if (ordered) {
    const n = parseInt(first[2]!, 10);
    if (n !== 1) list.start = n;
  }
  type Raw = { text: string[]; sub: { ordered: boolean; start?: number; items: string[][] } | null };
  const raw: Raw[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      // A blank line ends the list unless the next line is still part of it.
      const nextLine = lines[i + 1];
      const m = nextLine !== undefined ? ITEM_RE.exec(nextLine) : null;
      if (m && indentOf(m[1]!) >= baseIndent) {
        i += 1;
        continue;
      }
      break;
    }
    const m = ITEM_RE.exec(line);
    if (m) {
      const indent = indentOf(m[1]!);
      if (indent < baseIndent) break;
      if (indent <= baseIndent + 1) {
        // A sibling of another kind (bullets after numbers) starts a new list.
        if (/\d/.test(m[2]!) !== ordered) break;
        raw.push({ text: [m[3]!], sub: null });
      } else {
        // Nested: one level is kept; deeper levels join it.
        const owner = raw[raw.length - 1];
        if (!owner) {
          raw.push({ text: [m[3]!], sub: null });
        } else {
          if (!owner.sub) {
            const subOrdered = /\d/.test(m[2]!);
            const n = parseInt(m[2]!, 10);
            owner.sub = { ordered: subOrdered, ...(subOrdered && n !== 1 ? { start: n } : {}), items: [] };
          }
          owner.sub.items.push([m[3]!]);
        }
      }
      i += 1;
      continue;
    }
    // A block that is not part of an item ends the list; anything else continues the last item.
    if (FENCE_RE.test(line) || HEADING_RE.test(line) || RULE_RE.test(line) || (QUOTE_RE.test(line) && indentOf(/^\s*/.exec(line)![0]) <= baseIndent)) break;
    const owner = raw[raw.length - 1]!;
    const target = owner.sub?.items.length ? owner.sub.items[owner.sub.items.length - 1]! : owner.text;
    target.push(line.trim());
    i += 1;
  }
  list.items = raw.map((r) => ({
    c: parseInline(r.text.join(' '), allow),
    ...(r.sub
      ? {
        sub: {
          t: 'list' as const,
          ordered: r.sub.ordered,
          ...(r.sub.start !== undefined ? { start: r.sub.start } : {}),
          items: r.sub.items.map((t) => ({ c: parseInline(t.join(' '), allow) })),
        },
      }
      : {}),
  }));
  return { list, next: i };
}
