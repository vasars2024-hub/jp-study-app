/**
 * Fetch a readable Japanese Wikipedia (or other web) article for in-app reading.
 * Shared by the library import dialog, random Wikipedia game, and EPUB wiki links.
 */

export {
  articleBodyHtml,
  cleanImportedArticleHtml,
  cleanReaderArticleHtml,
  extractReadableArticleFromHtml,
  fetchReadableArticle,
  fetchReadableArticleFromWebview,
  type ReadableArticle,
  type ReaderArticleMeta,
} from './readabilityArticle';

export function resolveWikiUrl(href: string, base?: string): string {
  try {
    return new URL(href, base || 'https://ja.wikipedia.org/').href;
  } catch {
    return href;
  }
}

/** Normal article page on Japanese Wikipedia (not Special:, File:, etc.). */
export function isJaWikiArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'ja.wikipedia.org') return false;
    const p = decodeURIComponent(u.pathname);
    if (!p.startsWith('/wiki/')) return false;
    const name = p.slice('/wiki/'.length);
    if (/^(特殊:|ファイル:|Category:|Help:|Wikipedia:)/.test(name)) return false;
    return true;
  } catch {
    return false;
  }
}

export interface WikiNavEntry {
  url: string;
  title: string;
  bodyHtml: string;
}