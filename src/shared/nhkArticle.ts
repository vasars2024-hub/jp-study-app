/** NHK news.web.nhk article helpers — shared between renderer webview scripts and tests. */

export const NHK_NEWS_HOSTS = new Set(['news.web.nhk', 'www.web.nhk']);

export const NHK_HYDRATION_MARKERS = [
  'イギリスの海事機関',
  'ペルシャ湾内',
  'UAE',
  'イランメディア',
  '米中央軍',
] as const;

export const NHK_MIN_FULL_TEXT_LEN = 1800;

export interface MarkedInlineNode {
  type?: string;
  value?: string;
  url?: string;
  children?: MarkedInlineNode[];
}

export interface MarkedBlockNode {
  type?: string;
  depth?: number;
  children?: MarkedInlineNode[];
}

export interface NhkArticlePayload {
  title: string;
  html: string;
  publishedTime?: string | null;
  byline?: string | null;
}

export function isNhkNewsArticleUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw ?? '').trim());
    if (!NHK_NEWS_HOSTS.has(u.hostname)) return false;
    return /^\/newsweb\/na\/na-[a-z0-9]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function nhkArticleLooksHydrated(plainText: string): boolean {
  const compact = plainText.replace(/\s+/g, '');
  if (compact.length >= NHK_MIN_FULL_TEXT_LEN + 400) return true;
  return NHK_HYDRATION_MARKERS.some((m) => compact.includes(m.replace(/\s+/g, '')));
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkedInline(nodes: MarkedInlineNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes
    .map((node) => {
      const type = node.type ?? 'text';
      if (type === 'text') return escHtml(node.value ?? '');
      if (type === 'strong') return `<strong>${renderMarkedInline(node.children)}</strong>`;
      if (type === 'highlight') return `<mark>${renderMarkedInline(node.children)}</mark>`;
      if (type === 'link') {
        const href = escHtml(node.url ?? '#');
        return `<a href="${href}">${renderMarkedInline(node.children)}</a>`;
      }
      if (node.children?.length) return renderMarkedInline(node.children);
      return escHtml(node.value ?? '');
    })
    .join('');
}

/** Convert NHK markedBody / markedLead AST blocks to reader HTML. */
export function markedBlocksToHtml(blocks: MarkedBlockNode[] | null | undefined): string {
  if (!blocks?.length) return '';
  const parts: string[] = [];
  for (const block of blocks) {
    const type = block.type ?? '';
    const inner = renderMarkedInline(block.children);
    if (!inner && type !== 'thematicBreak') continue;
    if (type === 'paragraph') parts.push(`<p>${inner}</p>`);
    else if (type === 'heading') {
      const depth = Math.min(6, Math.max(2, Number(block.depth) || 2));
      parts.push(`<h${depth}>${inner}</h${depth}>`);
    } else if (type === 'thematicBreak') parts.push('<hr/>');
    else if (inner) parts.push(`<p>${inner}</p>`);
  }
  return parts.join('\n');
}

export function buildNhkArticleHtml(
  markedBody: MarkedBlockNode[] | null | undefined,
  markedLead?: MarkedBlockNode[] | null,
): string {
  const lead = markedBlocksToHtml(markedLead);
  const body = markedBlocksToHtml(markedBody);
  return `${lead}${body}`.trim();
}