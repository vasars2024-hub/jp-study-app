/**
 * Pure helpers for Chrome-extension capture / mine (Phase 9).
 * Safe for unit tests — no Electron / DOM.
 */

import { parseYoutubePlaylistId } from './ytPlaylists';

export type ExtensionPageKind = 'youtube-playlist' | 'youtube-video' | 'article';
export type ExtensionArticleSubtype = 'news' | 'blog' | 'other';
/**
 * Coarse content category for UI + optional profile-rule matching.
 * Heuristic only — host/path/title clues, not a classifier.
 */
export type ExtensionContentCategory =
  | 'news'
  | 'novel'
  | 'manga'
  | 'youtube'
  | 'article'
  | 'other';
export type ExtensionMineMode = 'word' | 'sentence';

/** JP + major news hosts (suffix match after stripping www.). */
export const NEWS_HOST_SUFFIXES: readonly string[] = [
  'nhk.or.jp',
  'asahi.com',
  'mainichi.jp',
  'yomiuri.co.jp',
  'nikkei.com',
  'sankei.com',
  'news.yahoo.co.jp',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'cnn.com',
  'reuters.com',
  'theguardian.com',
  'japantimes.co.jp',
  'kyodo.co.jp',
  'jiji.com',
  'fnn.jp',
  'news24.jp',
  'tbs.co.jp',
];

/** Web-novel / serial fiction hosts. */
export const NOVEL_HOST_SUFFIXES: readonly string[] = [
  'syosetu.com',
  'ncode.syosetu.com',
  'novel18.syosetu.com',
  'kakuyomu.jp',
  'alphapolis.co.jp',
  'novel.naver.com',
  'novelup.plus',
  'estar.jp',
  'hameln.info',
];

/** Manga / comic reader hosts (common patterns + known sites). */
export const MANGA_HOST_SUFFIXES: readonly string[] = [
  'manga-bunko.com',
  'comic-days.com',
  'comic-walker.com',
  'comic.pixiv.net',
  'mangaplus.shueisha.co.jp',
  'shonenjumpplus.com',
  'youngaceup.com',
  'sunday-webry.com',
  'magcomi.com',
  'ganma.jp',
  'comico.jp',
  'webtoons.com',
  'mangadex.org',
  'mangakakalot.com',
  'manganato.com',
  'chapmanganato.com',
  'mangasee123.com',
  'bato.to',
  'batotoo.com',
  'comic-meteor.jp',
  'viewer.pocket.shonenmagazine.com',
  'periodico.tonarinoyj.jp',
  'tonarinoyj.jp',
  'younganimal.com',
  'comic-zenon.com',
  'cmoa.jp',
  'booklive.jp',
  'ebookjapan.yahoo.co.jp',
];

const NEWS_PATH_HINT = /\/(news|article|articles|stories)\b/i;
const NOVEL_PATH_HINT = /\/(novel|ncode|n\d{4,})\b/i;
const MANGA_TITLE_HINT = /manga|漫画|マンガ|comic|webtoon|ウェブトゥーン|连载|漫畫/i;
const MANGA_PATH_HINT = /\/(manga|comic|webtoon|episode|chapter|viewer|title)\b/i;

/** Extract a YouTube video id from common URL shapes. */
export function parseYoutubeVideoId(url: string): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        return id && /^[\w-]{6,}$/.test(id) ? id : null;
      }
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        return id && /^[\w-]{6,}$/.test(id) ? id : null;
      }
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{6,}$/.test(v)) return v;
    }
  } catch {
    /* fall through */
  }
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/.exec(raw);
  return m?.[1] ?? null;
}

/**
 * Classify the active page for one-click capture.
 * Playlist pages win over video; watch URLs (even with list=) count as video.
 */
export function detectPageKind(url: string): ExtensionPageKind {
  const raw = (url ?? '').trim();
  if (!raw) return 'article';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const isYt =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be';
    if (!isYt) return 'article';
    if (u.pathname === '/playlist' || u.pathname.startsWith('/playlist')) {
      return parseYoutubePlaylistId(raw) ? 'youtube-playlist' : 'article';
    }
    if (parseYoutubeVideoId(raw)) return 'youtube-video';
    if (parseYoutubePlaylistId(raw)) return 'youtube-playlist';
    return 'article';
  } catch {
    if (parseYoutubePlaylistId(raw) && /[?&]list=/.test(raw) && !/[?&]v=/.test(raw)) {
      return 'youtube-playlist';
    }
    if (parseYoutubeVideoId(raw)) return 'youtube-video';
    return 'article';
  }
}

/** Prefer word vs sentence from the user's selection. */
export function classifyMineSelection(text: string): ExtensionMineMode {
  try {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return 'word';
    if (/[。．！？!?\n]/.test(t)) return 'sentence';
    if (t.length > 40) return 'sentence';
    // Latin multi-word phrases → sentence (ASCII apostrophe only — fancy quotes break some engines).
    if (/^[A-Za-zÀ-ÿ0-9'._-]+(?:\s+[A-Za-zÀ-ÿ0-9'._-]+){3,}/u.test(t)) return 'sentence';
    if (t.length <= 24) return 'word';
    return 'sentence';
  } catch {
    return 'word';
  }
}

/** Headword for sentence cards when we have no dictionary lemma. */
export function extractMineTerm(text: string, mode: ExtensionMineMode): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (mode === 'word') return t.slice(0, 80);
  // Prefer first JP content chunk before punctuation / particle-ish break
  const jp = t.split(/[。．！？!?\n、,\s]+/).find((s) => s.trim().length > 0);
  if (jp) return jp.trim().slice(0, 40);
  return t.slice(0, 40);
}

export function primaryCaptureAction(kind: ExtensionPageKind): 'inbox' | 'playlist' | 'video' {
  if (kind === 'youtube-playlist') return 'playlist';
  if (kind === 'youtube-video') return 'video';
  return 'inbox';
}

function hostMatchesSuffix(host: string, suffixes: readonly string[]): boolean {
  const h = host.replace(/^www\./, '').toLowerCase();
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`));
}

function parseHostPath(url: string): { host: string; pathname: string } | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.replace(/^www\./, '').toLowerCase(),
      pathname: u.pathname || '/',
    };
  } catch {
    return null;
  }
}

/**
 * Light heuristics for article-ish pages (news vs blog vs other).
 * Uses HTML meta / schema when available; falls back to host hints.
 */
export function detectArticleSubtype(html: string, url: string): ExtensionArticleSubtype {
  const raw = String(html ?? '');
  const lower = raw.slice(0, 200_000).toLowerCase();
  if (
    /og:type["'\s]+content=["']article["']/.test(lower) ||
    /property=["']og:type["']\s+content=["']article["']/.test(lower) ||
    /itemtype=["'][^"']*schema\.org\/(newsarticle|article)["']/.test(lower) ||
    /"@type"\s*:\s*"(newsarticle|article)"/.test(lower)
  ) {
    if (/newsarticle|news\.|\/news\//.test(lower) || /\/news\//i.test(url)) return 'news';
    return 'blog';
  }
  const parsed = parseHostPath(url);
  if (parsed) {
    if (hostMatchesSuffix(parsed.host, NEWS_HOST_SUFFIXES) || NEWS_PATH_HINT.test(parsed.pathname)) {
      return 'news';
    }
    if (/(blog|medium\.com|hatena|note\.com)/i.test(parsed.host)) return 'blog';
  }
  if (/<article[\s>]/i.test(raw.slice(0, 50_000))) return 'news';
  return 'other';
}

export interface DetectContentCategoryOpts {
  /** Document title — used for manga / novel title clues. */
  title?: string;
  /** Optional HTML snippet for article subtype (meta/schema). */
  html?: string;
}

/**
 * Estimate a coarse page category for the extension indicator + mining rules.
 * Data-driven host lists + path/title hints; not authoritative.
 */
export function detectContentCategory(
  url: string,
  opts?: DetectContentCategoryOpts,
): ExtensionContentCategory {
  const pageKind = detectPageKind(url);
  if (pageKind === 'youtube-video' || pageKind === 'youtube-playlist') return 'youtube';

  const parsed = parseHostPath(url);
  const title = String(opts?.title ?? '');
  const host = parsed?.host ?? '';
  const pathname = parsed?.pathname ?? '';
  const hostTitle = `${host} ${title}`;

  if (
    hostMatchesSuffix(host, MANGA_HOST_SUFFIXES) ||
    /(^|\.)manga[a-z0-9-]*\./i.test(host) ||
    /(^|\.)comic[a-z0-9-]*\./i.test(host) ||
    /(^|\.)webtoon[a-z0-9-]*\./i.test(host) ||
    MANGA_TITLE_HINT.test(hostTitle) ||
    MANGA_PATH_HINT.test(pathname)
  ) {
    return 'manga';
  }

  if (
    hostMatchesSuffix(host, NOVEL_HOST_SUFFIXES) ||
    /(^|\.)novel[a-z0-9-]*\./i.test(host) ||
    NOVEL_PATH_HINT.test(pathname) ||
    /小説|novel/i.test(title)
  ) {
    return 'novel';
  }

  if (
    hostMatchesSuffix(host, NEWS_HOST_SUFFIXES) ||
    NEWS_PATH_HINT.test(pathname) ||
    /(^|\.)news[a-z0-9-]*\./i.test(host)
  ) {
    // BBC Japanese lives under /japanese — still news
    if (host.includes('bbc.') && /\/japanese\b/i.test(pathname + url)) return 'news';
    return 'news';
  }

  const subtype = detectArticleSubtype(opts?.html ?? '', url);
  if (subtype === 'news') return 'news';
  if (subtype === 'blog') return 'article';
  return 'other';
}

/** Short English label for the FAB indicator (extension UI is English-chrome). */
export function contentCategoryLabel(category: ExtensionContentCategory): string {
  switch (category) {
    case 'news':
      return 'News';
    case 'novel':
      return 'Novel';
    case 'manga':
      return 'Manga';
    case 'youtube':
      return 'YouTube';
    case 'article':
      return 'Article';
    default:
      return 'Other';
  }
}
