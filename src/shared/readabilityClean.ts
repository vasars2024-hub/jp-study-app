// Pure helpers for Reader Mode article cleaning (testable without a browser DOM).

/** Multilingual headings that label discovery / promo blocks, not article body. */
export const RECOMMENDATION_HEADING_PATTERNS: ReadonlyArray<RegExp> = [
  /^注目(ワード|の?キーワード|の記事)?/,
  /^あわせて読みたい/,
  /^深掘り(コンテンツ)?/,
  /^関連(記事|ニュース|コンテンツ|リンク|トピック)/,
  /^最新・注目(の動画|ニュース)?/,
  /^新着(ニュース|記事)?/,
  /^各地のニュース/,
  /^天気予報/,
  /^防災情報/,
  /^動画・番組/,
  /^新着・注目/,
  /^おすすめ/,
  /^話題の/,
  /^キーワード/,
  /^タグ/,
  /^ピックアップ/,
  /^(?:この)?特集/,
  /^ランキング/,
  /^人気(記事|ニュース|ワード|の記事)/,
  /^もっと(読む|見る)/,
  /^シェア/,
  /^フォロー/,
  /^ニュースレター/,
  /^配信登録/,
  /^関連(阅读|推荐|文章|新闻|内容)/,
  /^热门(文章|新闻|推荐)?/,
  /^推荐阅读/,
  /^猜你喜欢/,
  /^标签/,
  /^专题/,
  /^更多(报道|阅读|新闻)/,
  /^читайте\s+также/i,
  /^похожие\s+(статьи|материалы)/i,
  /^рекомендуем/i,
  /^related\s+(articles?|stories|content|links?|coverage)/i,
  /^read\s+more/i,
  /^more\s+(on|from|stories|coverage|in\s+this)/i,
  /^trending(\s+now|\s+topics?|\s+keywords?)?/i,
  /^popular\s+(articles?|stories|now)/i,
  /^recommended(\s+for\s+you)?/i,
  /^suggested\s+(reading|articles?|for\s+you)/i,
  /^you\s+may\s+(also\s+)?(like|enjoy)/i,
  /^also\s+read/i,
  /^deep\s+dive/i,
  /^featured\s+(articles?|stories|content)/i,
  /^follow\s+us/i,
  /^share(\s+this|\s+on)?/i,
  /^newsletter/i,
  /^subscribe/i,
  /^tags?$/i,
  /^topics?$/i,
  /^comments?$/i,
  /^from\s+our\s+(network|archives)/i,
  /^around\s+the\s+(web|bbc)/i,
  /^explore\s+more/i,
  /^discover\s+more/i,
  /^keep\s+reading/i,
  /^in\s+this\s+series/i,
];

/** Normalize a title/heading for duplicate detection. */
export function normalizeTitleText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[|｜\-–—:：·•].*$/, '')
    .trim()
    .toLowerCase();
}

export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitleText(a);
  const nb = normalizeTitleText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 12 && nb.length > 12 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export interface ListItemProbe {
  text: string;
  isLink: boolean;
}

/**
 * Heuristic: menus, category rails, and section indexes are mostly short linked items.
 */
export function isRecommendationHeading(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').replace(/[：:｜|]\s*$/u, '').trim();
  if (!t || t.length > 96) return false;
  if (RECOMMENDATION_HEADING_PATTERNS.some((re) => re.test(t))) return true;
  if (
    /^(注目|あわせて|深掘り|関連|おすすめ|人気|トピック|キーワード|タグ|ピックアップ|ランキング|シェア|フォロー|もっと見る|続きを読む)/u.test(t) &&
    t.length <= 28
  ) {
    return true;
  }
  return false;
}

export interface BlockProbe {
  totalChars: number;
  linkChars: number;
  linkCount: number;
  paragraphCount: number;
  imageCount: number;
}

export function linkDensity(probe: BlockProbe): number {
  if (probe.totalChars <= 0) return 0;
  return probe.linkChars / probe.totalChars;
}

/**
 * Blocks whose primary purpose is discovery/navigation rather than prose.
 * Keeps genuine paragraphs and long-form linked references.
 */
export function isDiscoveryBlock(probe: BlockProbe): boolean {
  if (probe.totalChars < 16) return true;
  const density = linkDensity(probe);
  const avgLinkLen = probe.linkCount > 0 ? probe.linkChars / probe.linkCount : 0;

  if (probe.paragraphCount >= 2 && density < 0.42 && probe.linkCount <= 6) return false;
  if (probe.paragraphCount >= 1 && probe.totalChars > 280 && density < 0.35) return false;
  if (probe.imageCount >= 1 && probe.paragraphCount >= 1 && density < 0.5) return false;

  if (probe.linkCount >= 4 && density > 0.52 && avgLinkLen < 52) return true;
  if (probe.linkCount >= 6 && probe.paragraphCount === 0) return true;
  if (probe.linkCount >= 3 && density > 0.68 && avgLinkLen < 40) return true;
  return false;
}

/** Rows of short linked chips (tags, topics, trending keywords). */
export function isTagChipContainer(probe: BlockProbe): boolean {
  if (probe.paragraphCount > 0) return false;
  if (probe.imageCount > 0) return false;
  if (probe.linkCount < 3) return false;
  const avgLinkLen = probe.linkChars / probe.linkCount;
  return avgLinkLen <= 28 && probe.linkCount >= 3;
}

export function isLikelyNavigationList(items: ListItemProbe[]): boolean {
  if (items.length < 4) return false;
  const linked = items.filter((i) => i.isLink);
  if (linked.length / items.length < 0.55) return false;
  const avgLen =
    linked.reduce((sum, i) => sum + i.text.trim().length, 0) / Math.max(1, linked.length);
  if (avgLen > 48) return false;
  const shortLinked = linked.filter((i) => i.text.trim().length <= 32).length;
  return shortLinked / linked.length >= 0.6;
}

/** id/class tokens that usually indicate non-article UI. */
export const BOILERPLATE_HINT =
  /(?:^|[-_])(?:nav|menu|navbar|breadcrumb|sidebar|footer|header|toolbar|global|site-nav|related|recommend|suggested|trending|popular|featured|discover|explore|share|social|advert|promo|widget|category|categories|tag-list|tags|topics|chips|keyword|trend|ranking|pickup|newsletter|subscribe|signup|login|search|skip-link|accessibility|comment|disqus|follow|embed|outbrain|taboola|deep-dive|deepdive|read-more|readmore|awase|attention|注目)(?:$|[-_])/i;

export const BOILERPLATE_ROLE = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'menubar',
  'menu',
  'toolbar',
  'dialog',
]);

/** Tags removed before Readability runs (chrome outside the article). */
export const PRE_READABILITY_REMOVE = [
  'header',
  'nav',
  'footer',
  'aside',
  'form',
  'noscript',
  'iframe',
  'dialog',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[role="menubar"]',
  '[aria-label="breadcrumb" i]',
  '.breadcrumb',
  '.breadcrumbs',
  '#breadcrumb',
  '.site-header',
  '.global-header',
  '.page-header',
  '.navbar',
  '.nav-menu',
  '.site-nav',
  '.global-nav',
  '.footer',
  '.site-footer',
  '.page-footer',
  '.sidebar',
  '.related',
  '.recommend',
  '.share',
  '.social-share',
  '.advertisement',
  '.ad-container',
  '.newsletter',
  '.cookie',
  '.gdpr',
  '.l-navigation',
  '.p-header',
  '.c-global-header',
  '.c-header',
  '.c-nav',
  '.p-nav',
  '.header-wrap',
  '.footer-wrap',
];

/** Tags removed from Readability output (leftover chrome inside the candidate). */
export const POST_READABILITY_REMOVE = [
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'video',
  'audio',
  'svg',
  'canvas',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '.breadcrumb',
  '.breadcrumbs',
  '.nav',
  '.navbar',
  '.menu',
  '.site-nav',
  '.global-nav',
  '.sidebar',
  '.related',
  '.recommend',
  '.share',
  '.social',
  '.advertisement',
  '.ad',
  '.tags',
  '.tag-list',
  '.category-list',
  '.toc',
  '.table-of-contents',
  '.mw-editsection',
  '.mw-jump-link',
  'sup.reference',
  '.reflist',
  'table.infobox',
  '.navbox',
  '.ambox',
  '.noprint',
  '.printfooter',
  '.metadata',
  '.article-meta--bottom',
  '.article-tools',
  '[class*="related"]',
  '[class*="recommend"]',
  '[class*="trending"]',
  '[class*="popular"]',
  '[class*="tag-list"]',
  '[class*="topic-list"]',
  '[class*="keyword"]',
  '[class*="chip"]',
  '[class*="newsletter"]',
  '[class*="share-"]',
  '[class*="social-"]',
  '[class*="comment"]',
  '[class*="promo"]',
  '[class*="outbrain"]',
  '[class*="taboola"]',
];

/** Metadata lines often duplicated inside Readability output. */
export function isDuplicateMetadataLine(
  text: string,
  opts: { title?: string; byline?: string; publishedTime?: string },
): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 200) return false;
  if (opts.title && titlesMatch(t, opts.title)) return true;
  if (opts.byline && t.includes(opts.byline) && t.length <= opts.byline.length + 40) return true;
  if (opts.publishedTime) {
    try {
      const d = new Date(opts.publishedTime);
      if (!Number.isNaN(d.getTime())) {
        const short = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        if (t === short || t.includes(short)) return true;
      }
    } catch {
      /* ignore */
    }
    if (t.includes(opts.publishedTime.slice(0, 10))) return true;
  }
  if (/^(published|updated|posted|by|author|source|credit)\s*[:：]/i.test(t)) return true;
  if (/^\d{4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(t) && t.length < 40) return true;
  return false;
}