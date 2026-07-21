/**
 * Reading Finder content fetch (main process — the renderer would hit CORS).
 *
 * Builds on readabilityExtract.ts: fetches a candidate URL, extracts the
 * readable article, and — the part the plain extractor doesn't do — follows a
 * "next page" chain so a multi-page work (Aozora long texts, paginated news)
 * comes back whole instead of silently truncated. When a continuation exists
 * but the page cap stops us, the result says so honestly (`partial` +
 * `nextPageUrl`) rather than pretending the text is complete.
 *
 * The chain-follow is deliberately conservative: it only follows links that
 * clearly mean "next page of THIS text" (rel=next, or 次のページ-style anchors),
 * never generic "次の話 / next episode" links — following those on Narou would
 * merge unrelated chapters. Same-origin, no revisits, hard page + size caps.
 */

import { createRequire } from 'node:module';
import {
  extractReadableFromHtml,
  normalizeArticleFetchUrl,
  type ExtractReadableMeta,
} from './readabilityExtract';

const require = createRequire(import.meta.url);
const { parseHTML } = require('linkedom') as typeof import('linkedom');

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,zh-CN,zh,en;q=0.9',
};

const DEFAULT_MAX_PAGES = 12;
const PER_PAGE_TIMEOUT_MS = 15_000;
const MAX_TOTAL_TEXT = 2_000_000;
const MAX_TOTAL_HTML = 6_000_000;

// "Next page of the same text" — explicit page language only. 次の話 / 次へ /
// next episode are intentionally NOT here: on serial sites they jump chapters.
const NEXT_PAGE_TEXT = /次のページ|次ページ|次の頁|つぎのページ|続きを読む/;

export interface ReadingContentResult {
  ok: boolean;
  title?: string;
  /** Combined readable HTML across all fetched pages. */
  content?: string;
  /** Combined plain text — used for comprehensibility scoring. */
  text?: string;
  /** Final URL of the first page (after redirects). */
  url?: string;
  /** How many pages were fetched and combined. */
  pages?: number;
  /** True when a further page existed but the cap stopped the crawl. */
  partial?: boolean;
  /** The un-fetched continuation URL, when `partial`. */
  nextPageUrl?: string;
  meta?: ExtractReadableMeta;
  error?: string;
}

export interface FetchReadingOptions {
  /** Max pages to follow (incl. the first). Default 12; clamped to [1, 40]. */
  maxPages?: number;
  /** Set false to disable next-page following entirely (single page only). */
  followPagination?: boolean;
}

async function fetchHtml(url: string): Promise<{ html: string; url: string }> {
  const u = normalizeArticleFetchUrl(url);
  if (!/^https?:\/\//i.test(u)) throw new Error('Enter a full http(s):// address.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PER_PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') ?? '';
    if (ct && !/html|xml|text/i.test(ct)) throw new Error(`Not a web page (${ct.split(';')[0]}).`);
    const html = (await res.text()).slice(0, MAX_TOTAL_HTML);
    if (html.length < 200) throw new Error('Page returned too little content.');
    return { html, url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The URL of the "next page of the same text", or null. Trusts rel=next; else an
 * anchor whose text explicitly says "next page". Must be same-origin, absolute,
 * and different from the current page.
 */
export function findNextPageUrl(html: string, baseUrl: string): string | null {
  let doc: Document;
  try {
    doc = parseHTML(html).document as unknown as Document;
  } catch {
    return null;
  }
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  const resolve = (href: string | null | undefined): string | null => {
    if (!href) return null;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(abs.protocol)) return null;
    if (abs.host !== base.host) return null; // never leave the origin
    abs.hash = '';
    const out = abs.toString();
    return out === base.toString() ? null : out;
  };

  // 1. rel=next (the standards-blessed signal), <link> or <a>.
  for (const el of doc.querySelectorAll('link[rel~="next"], a[rel~="next"]')) {
    const hit = resolve(el.getAttribute('href'));
    if (hit) return hit;
  }
  // 2. An anchor that explicitly names the next *page* (not next episode).
  for (const a of doc.querySelectorAll('a[href]')) {
    const text = (a.textContent ?? '').replace(/\s+/g, '');
    if (!text || !NEXT_PAGE_TEXT.test(text)) continue;
    const hit = resolve(a.getAttribute('href'));
    if (hit) return hit;
  }
  return null;
}

/**
 * Fetch a candidate's readable content, following the same-text pagination chain
 * up to the page cap. Reuses the article extractor per page.
 */
export async function fetchReadingContent(
  rawUrl: string,
  opts: FetchReadingOptions = {},
): Promise<ReadingContentResult> {
  const maxPages = Math.max(1, Math.min(40, opts.maxPages ?? DEFAULT_MAX_PAGES));
  const follow = opts.followPagination !== false;

  let current: string | null = String(rawUrl ?? '').trim();
  const visited = new Set<string>();
  const htmlParts: string[] = [];
  const textParts: string[] = [];
  let title = '';
  let firstUrl = '';
  let meta: ExtractReadableMeta | undefined;
  let pages = 0;
  let nextPageUrl: string | null = null;

  try {
    while (current && pages < maxPages) {
      if (visited.has(current)) break; // cycle guard
      visited.add(current);

      const { html, url: finalUrl } = await fetchHtml(current);
      const extracted = extractReadableFromHtml(html, finalUrl);
      if (!extracted.ok || !extracted.content) {
        if (pages === 0) return { ok: false, error: extracted.error ?? 'No readable article found on that page.' };
        break; // a later page failed — keep what we have, stop cleanly
      }

      if (pages === 0) {
        title = extracted.title ?? finalUrl;
        firstUrl = extracted.url ?? finalUrl;
        meta = extracted.meta;
      }
      htmlParts.push(extracted.content);
      if (extracted.text) textParts.push(extracted.text);
      pages += 1;

      const combinedText = textParts.reduce((n, p) => n + p.length, 0);
      const combinedHtml = htmlParts.reduce((n, p) => n + p.length, 0);
      if (combinedText >= MAX_TOTAL_TEXT || combinedHtml >= MAX_TOTAL_HTML) {
        nextPageUrl = follow ? findNextPageUrl(html, finalUrl) : null;
        break;
      }

      nextPageUrl = follow ? findNextPageUrl(html, finalUrl) : null;
      current = nextPageUrl && !visited.has(nextPageUrl) ? nextPageUrl : null;
    }
  } catch (err) {
    if (pages === 0) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: /abort/i.test(msg) ? 'The page took too long to load.' : msg };
    }
    // Mid-chain failure after at least one good page → return partial honestly.
  }

  if (pages === 0) return { ok: false, error: 'No readable article found on that page.' };

  // Partial iff a real continuation is still ahead that we never fetched (cap or
  // size limit stopped us). A next-link that just loops back to a visited page
  // is not a continuation.
  const partial = Boolean(nextPageUrl) && !visited.has(nextPageUrl ?? '');

  return {
    ok: true,
    title,
    content: htmlParts.join('\n'),
    text: textParts.join('\n\n'),
    url: firstUrl,
    pages,
    partial: partial ? true : undefined,
    nextPageUrl: partial ? (nextPageUrl ?? undefined) : undefined,
    meta,
  };
}
