/**
 * Reader Mode extraction — Mozilla Readability + aggressive post-cleaning.
 * Output feeds the existing Immersion/Library reader pipeline unchanged.
 */

import {
  BOILERPLATE_HINT,
  BOILERPLATE_ROLE,
  isDiscoveryBlock,
  isDuplicateMetadataLine,
  isLikelyNavigationList,
  isRecommendationHeading,
  isTagChipContainer,
  POST_READABILITY_REMOVE,
  PRE_READABILITY_REMOVE,
  titlesMatch,
  type BlockProbe,
  type ListItemProbe,
} from '../shared/readabilityClean';
import { getUiLang } from './i18n';
import { LANG_TAGS } from '../shared/i18n/core';
import { isNhkNewsArticleUrl, nhkArticleLooksHydrated } from '../shared/nhkArticle';
import { NHK_WEBVIEW_EXTRACT_SCRIPT } from './nhkWebviewScript';

export interface ReaderArticleMeta {
  byline?: string | null;
  publishedTime?: string | null;
  excerpt?: string | null;
  siteName?: string | null;
  lang?: string | null;
  dir?: string | null;
}

export interface ReadableArticle {
  title: string;
  html: string;
  url: string;
  meta: ReaderArticleMeta;
}

type WebviewGuest = HTMLElement & {
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
  getURL?: () => string;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPublished(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Rendered into the reader's own chrome, so it follows the UI language.
    // Not a component and not called during render, hence `getUiLang()` rather
    // than `useT()`; `undefined` here would follow the OS regional setting.
    return d.toLocaleDateString(LANG_TAGS[getUiLang()], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function plainTextLen(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
}

/** Strip cache-bust query params before network fetch. */
function normalizeArticleFetchUrl(raw: string): string {
  try {
    const u = new URL(String(raw ?? '').trim());
    u.searchParams.delete('_reload');
    return u.toString();
  } catch {
    return String(raw ?? '').trim();
  }
}

function elementHintsBoilerplate(el: Element): boolean {
  const id = el.id ?? '';
  const cls = el.className;
  const classStr = typeof cls === 'string' ? cls : '';
  if (BOILERPLATE_HINT.test(id) || BOILERPLATE_HINT.test(classStr)) return true;
  const role = el.getAttribute('role');
  if (role && BOILERPLATE_ROLE.has(role)) return true;
  const aria = el.getAttribute('aria-label') ?? '';
  if (aria && isRecommendationHeading(aria)) return true;
  return false;
}

/** True when a node still holds real article prose (not just promos/nav). */
function isProseHeavyContainer(probe: BlockProbe): boolean {
  return (
    probe.paragraphCount >= 2 &&
    probe.totalChars > 320 &&
    probe.linkChars / Math.max(1, probe.totalChars) < 0.42
  );
}

function probeBlock(el: Element): BlockProbe {
  const text = (el.textContent ?? '').replace(/\s+/g, '');
  const links = el.querySelectorAll('a');
  const linkChars = Array.from(links).reduce((n, a) => n + (a.textContent ?? '').replace(/\s+/g, '').length, 0);
  return {
    totalChars: text.length,
    linkChars,
    linkCount: links.length,
    paragraphCount: el.querySelectorAll('p').length,
    imageCount: el.querySelectorAll('img,picture,figure').length,
  };
}

const LABEL_TAGS = new Set([
  'P', 'SPAN', 'STRONG', 'B', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DT', 'LEGEND',
  'CAPTION', 'LABEL', 'TH', 'TD', 'DIV', 'LI',
]);

/** Short label nodes (e.g. NHK uses <p>注目ワード</p> rather than headings). */
function isShortLabelElement(el: Element): boolean {
  if (!LABEL_TAGS.has(el.tagName)) return false;
  if (el.querySelector('article,section,ul,ol,table,div p,div ul')) return false;
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= 56;
}

function elementDepth(el: Element): number {
  let d = 0;
  let n: Element | null = el;
  while (n?.parentElement) {
    d += 1;
    n = n.parentElement;
  }
  return d;
}

function containsRecommendationLabel(el: Element): boolean {
  for (const child of el.querySelectorAll('p,span,strong,b,h1,h2,h3,h4,h5,h6,dt,legend,div')) {
    if (!isShortLabelElement(child)) continue;
    if (isRecommendationHeading((child.textContent ?? '').replace(/\s+/g, ' ').trim())) return true;
  }
  return false;
}

function containsArticleTitle(el: Element): boolean {
  return !!el.querySelector('h1');
}

/** Smallest promo module around a label — stops before ancestors that contain h1 / long prose. */
function pickRemovalTarget(label: Element, root: Element): Element {
  let node: Element | null = label;
  let module: Element = label.parentElement ?? label;
  while (node && node !== root) {
    const probe = probeBlock(node);
    const proseHeavy =
      probe.paragraphCount >= 4 &&
      probe.totalChars > 700 &&
      probe.linkChars / Math.max(1, probe.totalChars) < 0.28;
    if (containsArticleTitle(node) || proseHeavy) break;
    if (isDiscoveryBlock(probe) || isTagChipContainer(probe) || containsRecommendationLabel(node)) {
      module = node;
    }
    const parent = node.parentElement;
    if (parent && (containsArticleTitle(parent) || parent === root)) break;
    node = parent;
  }
  return module;
}

function removeLabelSection(label: Element, root: Element): void {
  const target = pickRemovalTarget(label, root);
  const probe = probeBlock(target);
  const proseHeavy =
    probe.paragraphCount >= 4 &&
    probe.totalChars > 700 &&
    probe.linkChars / Math.max(1, probe.totalChars) < 0.28;
  if (
    target.isConnected &&
    target !== root &&
    !containsArticleTitle(target) &&
    !proseHeavy
  ) {
    target.remove();
    return;
  }
  let sib = label.nextElementSibling;
  label.remove();
  while (sib) {
    const sibProbe = probeBlock(sib);
    if (isShortLabelElement(sib) && isRecommendationHeading((sib.textContent ?? '').trim())) break;
    if (/^H[1-6]$/i.test(sib.tagName)) break;
    if (
      sibProbe.paragraphCount >= 2 &&
      sibProbe.totalChars > 260 &&
      sibProbe.linkChars / Math.max(1, sibProbe.totalChars) < 0.35
    ) {
      break;
    }
    const next = sib.nextElementSibling;
    sib.remove();
    sib = next;
  }
}

const LABEL_SELECTOR = 'h2,h3,h4,h5,h6,dt,legend,caption,strong,b,span,p,div';

function collectRecommendationLabels(root: Element): Element[] {
  return Array.from(root.querySelectorAll(LABEL_SELECTOR))
    .filter((el) => {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 56) return false;
      if (!isRecommendationHeading(t)) return false;
      if (el.tagName === 'DIV' && el.querySelector('h2,h3,h4,p,ul,ol')) {
        return t.length <= 24;
      }
      return isShortLabelElement(el) || /^H[2-6]$/i.test(el.tagName);
    })
    .sort((a, b) => elementDepth(b) - elementDepth(a));
}

function isPromoLabelElement(el: Element): boolean {
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!t || !isRecommendationHeading(t)) return false;
  if (/^H[2-6]$/i.test(el.tagName)) return true;
  return isShortLabelElement(el);
}

/**
 * NHK and similar sites append promos after the article in the same Readability node.
 * Cut from the first promo heading (e.g. 注目ワード) upward until article siblings remain.
 */
function pruneTailFromFirstPromoLabel(root: Element): void {
  for (let pass = 0; pass < 8; pass += 1) {
    const labels = Array.from(root.querySelectorAll('h2,h3,h4,h5,h6,p,span,strong,dt,legend')).filter(
      isPromoLabelElement,
    );
    if (!labels.length) break;

    let node: Element | null = labels[0];
    while (node?.parentElement) {
      const parent = node.parentElement;
      const children = Array.from(parent.children);
      const idx = children.indexOf(node);
      if (idx < 0) break;
      for (let i = idx; i < children.length; i += 1) children[i]?.remove();
      if (parent === root) break;
      const hasProseBefore = children.slice(0, idx).some((c) => {
        const probe = probeBlock(c);
        return probe.paragraphCount >= 1 && probe.totalChars > 80;
      });
      if (hasProseBefore) break;
      node = parent;
    }
  }
}

/** Scan promo headings/labels — NHK uses h2/h3, not only h2. Multi-pass until clean. */
function pruneByRecommendationLabels(root: Element): void {
  for (let pass = 0; pass < 12; pass += 1) {
    const labels = collectRecommendationLabels(root);
    if (!labels.length) break;
    for (const label of labels) {
      if (label.isConnected) removeLabelSection(label, root);
    }
  }
}

/** Drop nav/list junk Readability leaves at the top of the extracted node. */
function removeLeadingBoilerplate(root: Element): void {
  for (let pass = 0; pass < 24; pass += 1) {
    const first = root.firstElementChild;
    if (!first) break;
    const probe = probeBlock(first);
    const lead = (first.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    const proseRatio = 1 - probe.linkChars / Math.max(1, probe.totalChars);
    if (probe.paragraphCount >= 1 && probe.totalChars > 120 && proseRatio > 0.45) break;
    if (isProseHeavyContainer(probe)) break;
    if (
      isDiscoveryBlock(probe) ||
      isTagChipContainer(probe) ||
      isRecommendationHeading(lead) ||
      (probe.linkCount >= 3 && probe.paragraphCount === 0)
    ) {
      first.remove();
    } else {
      break;
    }
  }
}

/** News sites append related/trending modules at the end of the article node. */
function pruneTrailingDiscovery(root: Element): void {
  for (let pass = 0; pass < 16; pass += 1) {
    const children = Array.from(root.children);
    if (!children.length) break;
    const last = children[children.length - 1];
    const probe = probeBlock(last);
    const lead = (last.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (isProseHeavyContainer(probe)) break;
    if (
      isDiscoveryBlock(probe) ||
      isTagChipContainer(probe) ||
      isRecommendationHeading(lead) ||
      elementHintsBoilerplate(last)
    ) {
      last.remove();
    } else {
      break;
    }
  }
}

function pruneDiscoveryBlocks(root: Element): void {
  const tags = ['div', 'section', 'aside', 'ul', 'ol', 'nav', 'li'];
  for (let pass = 0; pass < 6; pass += 1) {
    let removed = false;
    root.querySelectorAll(tags.join(',')).forEach((el) => {
      if (!(el instanceof HTMLElement) || el === root || !el.isConnected) return;
      const probe = probeBlock(el);
      if (isProseHeavyContainer(probe)) return;
      if (!isDiscoveryBlock(probe) && !isTagChipContainer(probe)) return;
      if (probe.paragraphCount >= 3 && probe.totalChars > 420 && probe.linkChars / Math.max(1, probe.totalChars) < 0.4) {
        return;
      }
      el.remove();
      removed = true;
    });
    if (!removed) break;
  }
}

function probeList(el: Element): ListItemProbe[] {
  return Array.from(el.querySelectorAll(':scope > li')).map((li) => {
    const a = li.querySelector('a');
    const text = (a?.textContent ?? li.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { text, isLink: !!a };
  });
}

function isTrackingPixel(img: HTMLImageElement): boolean {
  const w = Number(img.getAttribute('width') ?? img.width ?? 0);
  const h = Number(img.getAttribute('height') ?? img.height ?? 0);
  if (w > 0 && h > 0 && w <= 2 && h <= 2) return true;
  const src = (img.getAttribute('src') ?? '').toLowerCase();
  return /pixel|beacon|1x1|spacer|transparent\.gif/.test(src);
}

function removeMatching(root: ParentNode, selectors: string[]): void {
  for (const sel of selectors) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
}

function pruneNavigationLists(root: ParentNode): void {
  root.querySelectorAll('ul, ol').forEach((list) => {
    const items = probeList(list);
    if (isLikelyNavigationList(items)) {
      list.remove();
      return;
    }
    const links = list.querySelectorAll('a');
    const text = (list.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (links.length >= 4 && text.length > 0) {
      const linkTextLen = Array.from(links).reduce((n, a) => n + (a.textContent ?? '').length, 0);
      if (linkTextLen / text.length > 0.68 && items.length >= 4) list.remove();
    }
  });
}

function pruneDuplicateMetadata(root: Element, meta: ReaderArticleMeta, title: string): void {
  const opts = { title, byline: meta.byline ?? undefined, publishedTime: meta.publishedTime ?? undefined };
  root.querySelectorAll('p,li,div,span,figcaption,time').forEach((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || el.children.length > 3) return;
    if (isDuplicateMetadataLine(text, opts)) el.remove();
  });
}

function removeDuplicateTitle(root: ParentNode, title: string): void {
  root.querySelectorAll('h1, h2, h3').forEach((h) => {
    const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (titlesMatch(t, title)) h.remove();
  });
}

function unwrapEmptyWrappers(root: ParentNode): void {
  for (let pass = 0; pass < 8; pass += 1) {
    let removed = false;
    root.querySelectorAll('div, section, span').forEach((el) => {
      if (!el.children.length && !(el.textContent ?? '').trim()) {
        el.remove();
        removed = true;
      }
    });
    if (!removed) break;
  }
}

function runArticleCleanup(holder: Element, title: string, meta: ReaderArticleMeta): void {
  removeMatching(holder, POST_READABILITY_REMOVE);
  holder.querySelectorAll('div, section, aside, ul, ol, table, article').forEach((el) => {
    if (elementHintsBoilerplate(el)) el.remove();
  });
  removeLeadingBoilerplate(holder);
  pruneTailFromFirstPromoLabel(holder);
  pruneByRecommendationLabels(holder);
  pruneTrailingDiscovery(holder);
  pruneDiscoveryBlocks(holder);
  pruneNavigationLists(holder);
  pruneByRecommendationLabels(holder);
  pruneTrailingDiscovery(holder);
  pruneDuplicateMetadata(holder, meta, title);
  removeDuplicateTitle(holder, title);
  holder.querySelectorAll('img').forEach((img) => {
    if (isTrackingPixel(img)) img.remove();
    else {
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.setAttribute('loading', 'lazy');
    }
  });
  holder.querySelectorAll('a').forEach((a) => {
    const label = (a.textContent ?? '').trim();
    const href = a.getAttribute('href') ?? '';
    if (!label && (!href || href.startsWith('#'))) a.remove();
  });
  unwrapEmptyWrappers(holder);
}

/** Last-resort extraction from <main> when Readability cannot score the page. */
function extractMainContentFallback(doc: Document): { title: string; content: string } | null {
  const main = doc.querySelector('main,[role="main"],article');
  if (!main) return null;
  const h1 = main.querySelector('h1');
  const title = (h1?.textContent ?? doc.title ?? '').replace(/\s+/g, ' ').trim();
  const holder = document.createElement('div');
  holder.innerHTML = main.innerHTML;
  holder.querySelectorAll('script,style,noscript,nav,header,footer,form,button').forEach((el) => el.remove());
  const text = (holder.textContent ?? '').replace(/\s/g, '');
  if (text.length < 80) return null;
  return { title: title || doc.title || '', content: holder.innerHTML };
}

/** Keep only <main> article tree — drops header/nav that hijack Readability scoring. */
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

/** Light pre-Readability pass — promo cleanup happens after extraction. */
export function prepDocumentForReadability(doc: Document): void {
  removeMatching(doc, PRE_READABILITY_REMOVE);
  isolateMainContent(doc);
}

function cloneDocumentFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function lightPrepDocument(doc: Document): void {
  doc.querySelectorAll('nav, header, footer, dialog, [role="navigation"]').forEach((el) => el.remove());
  isolateMainContent(doc);
}

function lightReaderCleanup(holder: Element, title: string, meta: ReaderArticleMeta): void {
  removeMatching(holder, POST_READABILITY_REMOVE);
  pruneTailFromFirstPromoLabel(holder);
  pruneByRecommendationLabels(holder);
  pruneTrailingDiscovery(holder);
  pruneDuplicateMetadata(holder, meta, title);
  removeDuplicateTitle(holder, title);
}

export function cleanReaderArticleHtml(
  contentHtml: string,
  title: string,
  meta: ReaderArticleMeta = {},
): string {
  const holder = document.createElement('div');
  holder.innerHTML = contentHtml;
  const beforeLen = plainTextLen(holder.innerHTML);
  runArticleCleanup(holder, title, meta);
  let cleaned = holder.innerHTML.trim();
  let afterLen = plainTextLen(cleaned);
  if (afterLen < 40 && beforeLen >= 80) {
    const light = document.createElement('div');
    light.innerHTML = contentHtml;
    lightReaderCleanup(light, title, meta);
    const lightHtml = light.innerHTML.trim();
    const lightLen = plainTextLen(lightHtml);
    if (lightLen > afterLen) {
      cleaned = lightHtml;
      afterLen = lightLen;
    }
  }
  if (afterLen < 20 && beforeLen >= 40) return contentHtml.trim();
  return cleaned;
}

export function cleanImportedArticleHtml(contentHtml: string, title = '', meta: ReaderArticleMeta = {}): string {
  return cleanReaderArticleHtml(contentHtml, title, meta);
}

export function articleBodyHtml(title: string, html: string, meta?: ReaderArticleMeta): string {
  const parts: string[] = [`<h1>${esc(title)}</h1>`];
  const byline = meta?.byline?.trim();
  const date = meta?.publishedTime?.trim();
  if (byline || date) {
    parts.push('<div class="reader-meta" data-lookup-block>');
    if (byline) parts.push(`<span class="reader-byline">${esc(byline)}</span>`);
    if (date) parts.push(`<span class="reader-date">${esc(formatPublished(date))}</span>`);
    parts.push('</div>');
  }
  parts.push(`<div class="reader-article" data-lookup-block>${html}</div>`);
  return parts.join('');
}

const READABILITY_OPTIONS = {
  charThreshold: 140,
  nbTopCandidates: 5,
  classesToPreserve: ['page', 'ruby', 'rt', 'rb', 'rp', 'ref', 'footnote'],
};

async function runReadability(doc: Document) {
  const { Readability } = await import('@mozilla/readability');
  return new Readability(doc, READABILITY_OPTIONS).parse();
}

async function parseReadableArticleFromDocument(doc: Document, url: string): Promise<ReadableArticle> {
  const snapshot = doc.documentElement.outerHTML;
  const attempts: Array<{ doc: Document; minText: number }> = [
    { doc, minText: 80 },
    { doc: cloneDocumentFromHtml(snapshot), minText: 80 },
  ];
  const light = cloneDocumentFromHtml(snapshot);
  lightPrepDocument(light);
  attempts.push({ doc: light, minText: 60 });
  const raw = cloneDocumentFromHtml(snapshot);
  attempts.push({ doc: raw, minText: 100 });

  let art: Awaited<ReturnType<typeof runReadability>> = null;
  for (const attempt of attempts) {
    if (attempt.doc === doc) prepDocumentForReadability(doc);
    art = await runReadability(attempt.doc);
    const textLen = art?.textContent?.replace(/\s/g, '').length ?? 0;
    if (art?.content && textLen >= attempt.minText) break;
    art = null;
  }
  if (!art?.content) {
    const fallback = extractMainContentFallback(doc);
    if (!fallback || plainTextLen(fallback.content) < 40) {
      throw new Error('No readable article found on that page.');
    }
    const meta: ReaderArticleMeta = {};
    return {
      title: fallback.title,
      html: cleanReaderArticleHtml(fallback.content, fallback.title, meta),
      url,
      meta,
    };
  }
  const title = (art.title || doc.title || url).trim();
  const meta: ReaderArticleMeta = {
    byline: art.byline,
    publishedTime: art.publishedTime,
    excerpt: art.excerpt,
    siteName: art.siteName,
    lang: art.lang,
    dir: art.dir,
  };
  return {
    title,
    html: cleanReaderArticleHtml(art.content, title, meta),
    url,
    meta,
  };
}

/** Parse already-rendered page HTML (e.g. from a loaded <webview>). */
export async function extractReadableArticleFromHtml(html: string, url: string): Promise<ReadableArticle> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return parseReadableArticleFromDocument(doc, url);
}

type NhkWebviewPayload = {
  ready?: boolean;
  title?: string;
  html?: string;
  publishedTime?: string | null;
  byline?: string | null;
  textLen?: number;
  url?: string;
};

async function fetchNhkArticleFromWebview(
  webview: WebviewGuest,
  url: string,
): Promise<ReadableArticle | null> {
  const payload = (await webview.executeJavaScript(NHK_WEBVIEW_EXTRACT_SCRIPT, false)) as NhkWebviewPayload;
  if (!payload?.ready || !payload.html) return null;
  const guestUrl = webview.getURL?.() ?? payload.url ?? url;
  const pageUrl = typeof guestUrl === 'string' && guestUrl.startsWith('http') ? guestUrl : url;
  const title = (payload.title || pageUrl).trim();
  const meta: ReaderArticleMeta = {
    byline: payload.byline ?? null,
    publishedTime: payload.publishedTime ?? null,
  };
  const cleaned = cleanReaderArticleHtml(payload.html, title, meta);
  if (!nhkArticleLooksHydrated(cleaned.replace(/<[^>]+>/g, ' '))) return null;
  return { title, html: cleaned, url: pageUrl, meta };
}

export async function fetchReadableArticleFromWebview(
  webview: WebviewGuest | null | undefined,
  url: string,
): Promise<ReadableArticle | null> {
  if (!webview?.executeJavaScript) return null;
  try {
    if (isNhkNewsArticleUrl(url)) {
      const nhk = await fetchNhkArticleFromWebview(webview, url);
      if (nhk) return nhk;
    }

    const outer = await webview.executeJavaScript('document.documentElement.outerHTML', false);
    const guestUrl = webview.getURL?.() ?? (await webview.executeJavaScript('location.href', false));
    const pageUrl = typeof guestUrl === 'string' && guestUrl.startsWith('http') ? guestUrl : url;
    if (typeof outer !== 'string' || outer.length < 400) return null;
    if (!/<main\b/i.test(outer) && outer.replace(/<[^>]+>/g, '').trim().length < 200) return null;
    const art = await extractReadableArticleFromHtml(outer, pageUrl);
    if (isNhkNewsArticleUrl(pageUrl) && !nhkArticleLooksHydrated(art.html.replace(/<[^>]+>/g, ' '))) {
      return null;
    }
    return plainTextLen(art.html) >= 40 ? art : null;
  } catch {
    return null;
  }
}

function articleScore(article: ReadableArticle, url: string): number {
  const text = article.html.replace(/<[^>]+>/g, ' ');
  let score = plainTextLen(article.html);
  if (isNhkNewsArticleUrl(url) && nhkArticleLooksHydrated(text)) score += 5000;
  return score;
}

function pickBestArticle(candidates: ReadableArticle[], url: string): ReadableArticle | null {
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => (articleScore(cur, url) > articleScore(best, url) ? cur : best));
}

export async function fetchReadableArticle(url: string, webview?: WebviewGuest | null): Promise<ReadableArticle> {
  const errors: string[] = [];
  const fetchUrl = normalizeArticleFetchUrl(url);
  const candidates: ReadableArticle[] = [];

  if (webview) {
    try {
      const fromGuest = await fetchReadableArticleFromWebview(webview, fetchUrl);
      if (fromGuest) candidates.push(fromGuest);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  try {
    const extracted = await window.api.extractReadableArticle(fetchUrl);
    if (extracted.ok && extracted.content && extracted.title) {
      const meta: ReaderArticleMeta = extracted.meta ?? {};
      const cleaned = cleanReaderArticleHtml(extracted.content, extracted.title, meta);
      if (plainTextLen(cleaned) >= 40) {
        candidates.push({
          title: extracted.title,
          html: cleaned,
          url: extracted.url ?? fetchUrl,
          meta,
        });
      } else {
        errors.push('Reader extraction returned too little text.');
      }
    } else if (extracted.error) {
      errors.push(extracted.error);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  const page = await window.api.fetchPage(fetchUrl);
  if (page.ok && page.html) {
    try {
      const fromPage = await extractReadableArticleFromHtml(page.html, page.url ?? fetchUrl);
      if (plainTextLen(fromPage.html) >= 40) candidates.push(fromPage);
      else errors.push('Reader extraction returned too little text.');
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  } else if (page.error) {
    errors.push(page.error);
  }

  const best = pickBestArticle(candidates, fetchUrl);
  if (best) return best;

  if (errors.length) throw new Error(errors[0]);
  throw new Error('No readable article found on that page.');
}