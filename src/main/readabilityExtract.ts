/**
 * Main-process article extraction — Mozilla Readability + tolerant HTML parsing.
 * Uses linkedom first (modern/news sites); JSDOMParser as fallback.
 */

import { createRequire } from 'node:module';
import { Readability } from '@mozilla/readability';
import { decodeHtmlBytes } from '../shared/htmlCharset';

const require = createRequire(import.meta.url);
const { parseHTML } = require('linkedom') as typeof import('linkedom');
// CJS subpath — no ESM export; required at runtime from node_modules.
const JSDOMParser = require('@mozilla/readability/JSDOMParser') as new () => {
  parse(html: string): Document;
};

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,zh-CN,zh,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

const READABILITY_OPTIONS = {
  charThreshold: 140,
  nbTopCandidates: 5,
  classesToPreserve: ['page', 'ruby', 'rt', 'rb', 'rp', 'ref', 'footnote'],
};

const PRE_TAGS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  'dialog',
];

export interface ExtractReadableMeta {
  byline?: string | null;
  publishedTime?: string | null;
  excerpt?: string | null;
  siteName?: string | null;
  lang?: string | null;
  dir?: string | null;
}

export interface ExtractReadableResult {
  ok: boolean;
  title?: string;
  content?: string;
  /** Plain text of the article (no markup) — used for comprehensibility scoring. */
  text?: string;
  url?: string;
  meta?: ExtractReadableMeta;
  error?: string;
}

/** Strip tags + decode the handful of entities that matter for scoring text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip cache-bust / reload query params before fetching. */
export function normalizeArticleFetchUrl(raw: string): string {
  try {
    const u = new URL(String(raw ?? '').trim());
    u.searchParams.delete('_reload');
    return u.toString();
  } catch {
    return String(raw ?? '').trim();
  }
}

function isReadableDocument(doc: unknown): doc is Document {
  return !!doc && typeof doc === 'object' && !!(doc as Document).documentElement;
}

function parseHtmlDocuments(html: string): Document[] {
  const docs: Document[] = [];
  try {
    const { document } = parseHTML(html);
    if (isReadableDocument(document)) docs.push(document);
  } catch {
    /* linkedom could not parse */
  }
  if (!docs.length) {
    try {
      const legacy = new JSDOMParser().parse(html);
      if (isReadableDocument(legacy)) docs.push(legacy);
    } catch {
      /* JSDOMParser could not parse */
    }
  }
  return docs;
}

function cloneDocument(html: string): Document | null {
  try {
    const { document } = parseHTML(html);
    return isReadableDocument(document) ? document : null;
  } catch {
    return null;
  }
}

function removeTags(root: ParentNode, tags: string[]): void {
  for (const tag of tags) {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  }
}

function isolateMainContent(doc: Document): void {
  doc
    .querySelectorAll('nav, header, footer, dialog, [role="navigation"], [role="banner"], [role="contentinfo"]')
    .forEach((el) => el.remove());
  const main = doc.querySelector('main');
  const body = doc.body;
  if (!main || !body) return;
  const shell = doc.createElement('div');
  shell.id = 'reader-main-root';
  shell.innerHTML = main.innerHTML;
  body.innerHTML = '';
  body.appendChild(shell);
}

function prepDocument(doc: Document): void {
  removeTags(doc, PRE_TAGS);
  isolateMainContent(doc);
}

function lightPrepDocument(doc: Document): void {
  removeTags(doc, ['nav', 'header', 'footer', 'dialog', 'script', 'style', 'noscript']);
  isolateMainContent(doc);
}

function plainTextLen(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
}

function extractMainFallback(doc: Document): { title: string; content: string } | null {
  const main = doc.querySelector('main,[role="main"],article');
  if (!main) return null;
  const h1 = main.querySelector('h1');
  const title = (h1?.textContent ?? doc.title) ?? '';
  const holder = doc.createElement('div');
  holder.innerHTML = main.innerHTML;
  removeTags(holder, ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'form']);
  const text = (holder.textContent ?? '').replace(/\s/g, '');
  if (text.length < 80) return null;
  return { title: title.replace(/\s+/g, ' ').trim(), content: holder.innerHTML };
}

async function fetchArticleHtml(url: string): Promise<{ html: string; url: string }> {
  const u = normalizeArticleFetchUrl(url);
  if (!/^https?:\/\//i.test(u)) throw new Error('Enter a full http(s):// address.');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  const res = await fetch(u, {
    signal: ctl.signal,
    redirect: 'follow',
    headers: FETCH_HEADERS,
  });
  clearTimeout(t);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct && !/html|xml|text/i.test(ct)) {
    throw new Error(`Not a web page (${ct.split(';')[0]}).`);
  }
  // In the page's own charset (header, then <meta>): a GBK, Big5 or
  // windows-1251 page decoded as UTF-8 was mojibake in Reader Mode.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const html = decodeHtmlBytes(bytes.subarray(0, 12_000_000), ct).text.slice(0, 3_000_000);
  if (html.length < 400) throw new Error('Page returned too little content.');
  return { html, url: res.url };
}

function parseWithReadability(doc: Document): ReturnType<Readability['parse']> {
  if (!isReadableDocument(doc)) return null;
  try {
    return new Readability(doc, READABILITY_OPTIONS).parse();
  } catch {
    return null;
  }
}

export function extractReadableFromHtml(html: string, pageUrl: string): ExtractReadableResult {
  if (!parseHtmlDocuments(html).length) {
    return { ok: false, error: 'Could not parse page HTML.' };
  }

  const snapshot = html;
  const attempts: Array<{ prep: (d: Document) => void; minText: number }> = [
    { prep: prepDocument, minText: 80 },
    { prep: lightPrepDocument, minText: 60 },
    { prep: () => undefined, minText: 100 },
  ];

  let art: ReturnType<Readability['parse']> = null;
  for (const attempt of attempts) {
    const doc = cloneDocument(snapshot);
    if (!doc) continue;
    attempt.prep(doc);
    art = parseWithReadability(doc);
    const textLen = art?.textContent?.replace(/\s/g, '').length ?? 0;
    if (art?.content && textLen >= attempt.minText) break;
    art = null;
  }

  if (!art?.content) {
    const doc = cloneDocument(snapshot);
    if (doc) {
      lightPrepDocument(doc);
      const fallback = extractMainFallback(doc);
      if (fallback && plainTextLen(fallback.content) >= 40) {
        return {
          ok: true,
          title: fallback.title || pageUrl,
          content: fallback.content,
          text: htmlToText(fallback.content),
          url: pageUrl,
          meta: {},
        };
      }
    }
    return { ok: false, error: 'No readable article found on that page.' };
  }

  return {
    ok: true,
    title: (art.title || pageUrl).trim(),
    content: art.content,
    text: (art.textContent ?? htmlToText(art.content)).trim(),
    url: pageUrl,
    meta: {
      byline: art.byline,
      publishedTime: art.publishedTime,
      excerpt: art.excerpt,
      siteName: art.siteName,
      lang: art.lang,
      dir: art.dir,
    },
  };
}

export async function extractReadableFromUrl(url: string): Promise<ExtractReadableResult> {
  try {
    const { html, url: finalUrl } = await fetchArticleHtml(url);
    return extractReadableFromHtml(html, finalUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: /abort/i.test(msg) ? 'The page took too long to load.' : msg,
    };
  }
}