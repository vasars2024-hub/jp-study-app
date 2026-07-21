/* Shared helpers — keep detection in sync with src/shared/extensionCapture.ts + sentenceBounds.ts */

const DEFAULT_PORT = 18765;

/** Heuristic host lists — keep in sync with src/shared/extensionCapture.ts */
const NEWS_HOST_SUFFIXES = [
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

const NOVEL_HOST_SUFFIXES = [
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

const MANGA_HOST_SUFFIXES = [
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

function parseYoutubePlaylistId(url) {
  try {
    const u = new URL(url);
    const list = u.searchParams.get('list');
    if (list && /^[\w-]+$/.test(list)) return list;
  } catch {
    /* ignore */
  }
  const m = /[?&]list=([\w-]+)/.exec(url || '');
  return m ? m[1] : null;
}

function parseYoutubeVideoId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        return id && /^[\w-]{6,}$/.test(id) ? id : null;
      }
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{6,}$/.test(v)) return v;
    }
  } catch {
    /* ignore */
  }
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/.exec(url || '');
  return m ? m[1] : null;
}

function detectPageKind(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const isYt =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be';
    if (!isYt) return 'article';
    if (u.pathname === '/playlist' || u.pathname.startsWith('/playlist')) {
      return parseYoutubePlaylistId(url) ? 'youtube-playlist' : 'article';
    }
    if (parseYoutubeVideoId(url)) return 'youtube-video';
    if (parseYoutubePlaylistId(url)) return 'youtube-playlist';
    return 'article';
  } catch {
    return 'article';
  }
}

function hostMatchesSuffix(host, suffixes) {
  const h = String(host || '')
    .replace(/^www\./, '')
    .toLowerCase();
  return suffixes.some((s) => h === s || h.endsWith('.' + s));
}

function parseHostPath(url) {
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

function detectArticleSubtype(html, url) {
  const raw = String(html || '');
  const lower = raw.slice(0, 200000).toLowerCase();
  if (
    /og:type["'\s]+content=["']article["']/.test(lower) ||
    /property=["']og:type["']\s+content=["']article["']/.test(lower) ||
    /itemtype=["'][^"']*schema\.org\/(newsarticle|article)["']/.test(lower) ||
    /"@type"\s*:\s*"(newsarticle|article)"/.test(lower)
  ) {
    if (/newsarticle|\/news\//.test(lower) || /\/news\//i.test(url || '')) return 'news';
    return 'blog';
  }
  const parsed = parseHostPath(url);
  if (parsed) {
    if (hostMatchesSuffix(parsed.host, NEWS_HOST_SUFFIXES) || NEWS_PATH_HINT.test(parsed.pathname)) {
      return 'news';
    }
    if (/(blog|medium\.com|hatena|note\.com)/i.test(parsed.host)) return 'blog';
  }
  if (/<article[\s>]/i.test(raw.slice(0, 50000))) return 'news';
  return 'other';
}

/**
 * Heuristic page category (news / novel / manga / …).
 * Keep in sync with src/shared/extensionCapture.ts detectContentCategory.
 */
function detectContentCategory(url, opts) {
  const pageKind = detectPageKind(url);
  if (pageKind === 'youtube-video' || pageKind === 'youtube-playlist') return 'youtube';

  const parsed = parseHostPath(url);
  const title = String((opts && opts.title) || '');
  const host = (parsed && parsed.host) || '';
  const pathname = (parsed && parsed.pathname) || '';
  const hostTitle = host + ' ' + title;

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
    return 'news';
  }

  const subtype = detectArticleSubtype((opts && opts.html) || '', url);
  if (subtype === 'news') return 'news';
  if (subtype === 'blog') return 'article';
  return 'other';
}

function contentCategoryLabel(category) {
  switch (category) {
    case 'news':
      return 'News';
    case 'novel':
      return 'Web novel';
    case 'manga':
      return 'Manga';
    case 'youtube':
      return 'Video';
    case 'article':
      return 'Article';
    default:
      return 'Webpage';
  }
}

function classifyMineSelection(text) {
  try {
    const t = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return 'word';
    if (/[。．！？!?\n]/.test(t)) return 'sentence';
    if (t.length > 40) return 'sentence';
    // Latin multi-word phrases → sentence (avoid fancy quotes in the class — they break some engines).
    if (/^[A-Za-zÀ-ÿ0-9'._-]+(?:\s+[A-Za-zÀ-ÿ0-9'._-]+){3,}/u.test(t)) return 'sentence';
    if (t.length <= 24) return 'word';
    return 'sentence';
  } catch {
    return 'word';
  }
}

function primaryAction(kind) {
  if (kind === 'youtube-playlist') return 'playlist';
  if (kind === 'youtube-video') return 'video';
  return 'inbox';
}

/* ----------------------------------------------------------------------------
 * Unified command registry
 *
 * Every surface (toolbar popup, reader popup, context menu, radial wheel,
 * keyboard commands, tab list) refers to commands by these ids. The background
 * service worker owns the single dispatch for them ("run-command" message).
 * Old ids ("mine", "save", "download", …) are accepted through COMMAND_ALIASES
 * so stored wheel layouts and shortcuts keep working after the update.
 * -------------------------------------------------------------------------- */

const COMMANDS = [
  {
    id: 'lookup.selection',
    label: 'Look up',
    shortLabel: 'Look up',
    description: 'Open the reader popup for the selected or last-hovered text.',
    category: 'read',
    contexts: ['page', 'selection'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'save.word',
    label: 'Save word',
    shortLabel: 'Word',
    description: 'Save the selected word to your GrammarX library.',
    category: 'save',
    contexts: ['selection'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'save.sentence',
    label: 'Save sentence',
    shortLabel: 'Sentence',
    description: 'Save the selected or detected sentence to your GrammarX library.',
    category: 'save',
    contexts: ['selection'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'card.create',
    label: 'Create card',
    shortLabel: 'Card',
    description: 'Create a flashcard from the selection (Anki when available; a copy always stays in GrammarX).',
    category: 'card',
    contexts: ['selection'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'capture.page',
    label: 'Save page',
    shortLabel: 'Page',
    description: 'Save this page (article, video, or playlist) into GrammarX.',
    category: 'capture',
    contexts: ['page'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'capture.ocr',
    label: 'OCR capture',
    shortLabel: 'OCR',
    description: 'Drag a box over an image to recognize Japanese text.',
    category: 'capture',
    contexts: ['page'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'capture.audio.record',
    label: 'Record audio',
    shortLabel: 'Record',
    description: 'Record microphone audio for the next Save audio.',
    category: 'capture',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'capture.audio.save',
    label: 'Save audio',
    shortLabel: 'Audio',
    description: 'Save the last recording into GrammarX.',
    category: 'capture',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'capture.manga',
    label: 'Import manga pages',
    shortLabel: 'Manga',
    description: 'Scan a long-strip / webtoon page and import the panels into GrammarX.',
    category: 'capture',
    contexts: ['page:manga'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'media.download',
    label: 'Download video',
    shortLabel: 'Download',
    description: 'Download the current YouTube video or playlist into GrammarX.',
    category: 'capture',
    contexts: ['page:youtube'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'clipboard.send',
    label: 'Send to clipboard history',
    shortLabel: 'Clip',
    description: 'Add the selection to the GrammarX clipboard history.',
    category: 'save',
    contexts: ['selection'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'translate.selection',
    label: 'Translate',
    shortLabel: 'Translate',
    description: 'Translate the selection with the GrammarX translation model.',
    category: 'read',
    contexts: ['selection'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'grammar.match',
    label: 'Match grammar',
    shortLabel: 'Grammar',
    description: 'Find grammar patterns in the selected sentence.',
    category: 'read',
    contexts: ['selection'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'reader.theme',
    label: 'Reading theme',
    shortLabel: 'Theme',
    description: 'Cycle the page reading theme (night, sepia, paper, gray).',
    category: 'page',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'reader.highlight',
    label: 'Highlight mode',
    shortLabel: 'Highlight',
    description: 'Toggle select-to-highlight on this page.',
    category: 'page',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'reader.knownTint',
    label: 'Known-word tint',
    shortLabel: 'Tint',
    description: 'Tint words on the page by how well you know them.',
    category: 'page',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'tabs.picker',
    label: 'Reading list',
    shortLabel: 'Tabs',
    description: 'Open the tab list to save several pages at once.',
    category: 'app',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
  {
    id: 'app.open',
    label: 'Open GrammarX',
    shortLabel: 'App',
    description: 'Bring the GrammarX desktop app to the front.',
    category: 'app',
    contexts: ['page'],
    wheel: true,
    contextMenu: true,
  },
  {
    id: 'wheel.more',
    label: 'More…',
    shortLabel: 'More',
    description: 'Open the secondary action list (OCR, media, page tools).',
    category: 'app',
    contexts: ['page'],
    wheel: true,
    contextMenu: false,
  },
];

/** Old action / wheel-slot ids → current command ids. */
const COMMAND_ALIASES = {
  mine: 'save.word',
  'mine-auto': 'save.word',
  'mine-word': 'save.word',
  'mine-sentence': 'save.sentence',
  dictionary: 'lookup.selection',
  save: 'capture.page',
  epub: 'capture.page',
  capture: 'capture.page',
  download: 'media.download',
  clipboard: 'clipboard.send',
  ocr: 'capture.ocr',
  'bulk-tabs': 'tabs.picker',
  record: 'capture.audio.record',
  'audio-save': 'capture.audio.save',
  theme: 'reader.theme',
  highlight: 'reader.highlight',
  learn: 'reader.knownTint',
  grammar: 'grammar.match',
  translate: 'translate.selection',
  more: 'wheel.more',
};

function resolveCommandId(id) {
  const raw = String(id || '').trim();
  if (COMMANDS.some((c) => c.id === raw)) return raw;
  return COMMAND_ALIASES[raw] || null;
}

function getCommand(id) {
  const resolved = resolveCommandId(id);
  return COMMANDS.find((c) => c.id === resolved) || null;
}

/** Commands allowed in a wheel slot. */
function wheelAssignableCommands() {
  return COMMANDS.filter((c) => c.wheel);
}

/**
 * Whether a command applies on a page of the given category / kind.
 * Commands without a page-restricted context always apply.
 */
function commandAvailableOnPage(id, pageKind, category) {
  const cmd = getCommand(id);
  if (!cmd) return false;
  const restricted = cmd.contexts.filter((c) => c.startsWith('page:'));
  if (!restricted.length) return true;
  if (restricted.includes('page:youtube')) {
    if (pageKind === 'youtube-video' || pageKind === 'youtube-playlist') return true;
  }
  if (restricted.includes('page:manga') && category === 'manga') return true;
  return false;
}

/* ----------------------------------------------------------------------------
 * Save destinations
 *
 * The bridge always keeps a copy in the GrammarX library. The only real
 * choice is whether Anki cards are also created. Keep the model that honest.
 * -------------------------------------------------------------------------- */

/** @returns {'anki' | 'app'} primary destination for a save */
function savePrimaryDestination(destination, forceAnki) {
  if (forceAnki) return 'anki';
  return destination === 'both' ? 'anki' : 'app';
}

function saveWorkingMessage(destination, forceAnki) {
  return savePrimaryDestination(destination, forceAnki) === 'anki'
    ? 'Creating card…'
    : 'Saving to GrammarX…';
}

/** Human-readable save / card result for toasts and popup status. */
function formatSaveResultMessage(res) {
  if (!res) return 'Save failed';
  if (!res.ok && !res.queued) return res.error || 'Save failed';

  const kind = res.mode === 'sentence' ? 'Sentence' : 'Word';
  const term = res.term ? ` “${String(res.term).slice(0, 40)}”` : '';

  if (res.queued) {
    return `Queued${term} — will sync when GrammarX is open`;
  }

  const anki = res.anki || (res.destinations && res.destinations.anki) || null;
  if (anki && anki.ok) {
    const deck = [res.profileName, res.deckName].filter(Boolean).join(' / ');
    return `Card created in Anki${term}${deck ? ` (${deck})` : ''} · saved in GrammarX`;
  }

  const parts = [`${kind} saved${term} to GrammarX`];
  const ankiAttempted =
    res.ankiAttempted === true ||
    (res.ankiAttempted !== false &&
      (res.forceAnki === true || res.preferAnki === true) &&
      anki != null &&
      anki.error !== 'skipped');
  if (ankiAttempted && anki && !anki.ok && anki.error && anki.error !== 'skipped') {
    parts.push(`Anki unavailable: ${anki.error}`);
  }
  return parts.join(' · ');
}

function formatClipboardResultMessage(res) {
  if (!res?.ok && !res?.queued) return res?.error || 'Could not add to clipboard history';
  if (res.queued) return 'Queued — will sync when GrammarX is open';
  return 'Added to GrammarX clipboard history';
}

function formatCaptureResultMessage(res) {
  if (!res?.ok && !res?.queued) return res?.error || 'Could not save this page';
  if (res.queued) return 'Page queued — will sync when GrammarX is open';
  if (res.action === 'playlist') return 'Playlist saved to GrammarX';
  if (res.action === 'video') return res.duplicate ? 'Video is already in GrammarX' : 'Video saved to GrammarX';
  return 'Page saved to your GrammarX inbox';
}

/* ---------------------------------------------------------------------------- */

const ENDERS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥']);
const TRAIL_CLOSE = new Set(['」', '』', '）', ')', '"', "'", '”', '’']);

function detectSentenceBounds(text, offset) {
  if (!text) return { start: 0, end: 0 };
  const n = text.length;
  const o = Math.max(0, Math.min(offset, n));
  const isBoundary = (ch) => ENDERS.has(ch) || TRAIL_CLOSE.has(ch);
  let start = 0;
  for (let i = 0; i < o; i++) {
    if (isBoundary(text[i])) {
      let j = i + 1;
      while (j < n && (TRAIL_CLOSE.has(text[j]) || text[j] === ' ' || text[j] === '\n')) j++;
      start = j;
    }
  }
  let end = n;
  for (let i = start; i < n; i++) {
    const ch = text[i];
    if (isBoundary(ch)) {
      end = i + 1;
      while (end < n && TRAIL_CLOSE.has(text[end])) end++;
      break;
    }
    if (ch === '\n' && i > start) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function sentenceAt(text, offset) {
  const b = detectSentenceBounds(text, offset);
  return text.slice(b.start, b.end).trim();
}

/**
 * Map a BCP-47 / HTML lang tag to an OCR language hint.
 * Keep in sync with MineLanguage / PaddleLang (ja | zh | ru).
 */
function langTagToOcrLang(tag) {
  const t = String(tag || '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (!t) return '';
  const primary = t.split('-')[0];
  if (primary === 'ja' || primary === 'jp') return 'ja';
  if (primary === 'zh' || primary === 'cn' || primary === 'tw' || primary === 'hk') return 'zh';
  if (primary === 'ru') return 'ru';
  return '';
}

/**
 * Heuristic script language from text — same rules as src/shared/profileRules.ts
 * detectMineLanguage (Cyrillic → ru, Han without kana → zh, kana/kanji → ja).
 * @returns {'ja'|'zh'|'ru'|''}
 */
function detectScriptLang(text) {
  const s = String(text || '');
  if (/[\u0400-\u04FF]/.test(s)) return 'ru';
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(s) && !/[\u3040-\u30FF]/.test(s)) return 'zh';
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(s)) return 'ja';
  return '';
}

/**
 * Best-effort OCR language hint from page metadata + a text sample.
 * Used when the level badge has not classified the page (Russian never does).
 *
 * Order matters: browser UI language (navigator.languages) is a weak signal and
 * must not override the scripts actually on the page.
 */
function detectPageLangHint(opts) {
  const o = opts || {};
  const fromBadge = o.badgeLang === 'ja' || o.badgeLang === 'zh' || o.badgeLang === 'ru' ? o.badgeLang : '';
  if (fromBadge) return fromBadge;

  const fromHtml = langTagToOcrLang(o.htmlLang);
  if (fromHtml) return fromHtml;

  const fromSample = detectScriptLang(o.sampleText || '');
  if (fromSample) return fromSample;

  if (Array.isArray(o.navigatorLanguages)) {
    for (const tag of o.navigatorLanguages) {
      const mapped = langTagToOcrLang(tag);
      if (mapped) return mapped;
    }
  }
  return '';
}

if (typeof globalThis !== 'undefined') {
  globalThis.jpStudyShared = {
    DEFAULT_PORT,
    NEWS_HOST_SUFFIXES,
    NOVEL_HOST_SUFFIXES,
    MANGA_HOST_SUFFIXES,
    parseYoutubePlaylistId,
    parseYoutubeVideoId,
    detectPageKind,
    detectArticleSubtype,
    detectContentCategory,
    contentCategoryLabel,
    classifyMineSelection,
    primaryAction,
    COMMANDS,
    COMMAND_ALIASES,
    resolveCommandId,
    getCommand,
    wheelAssignableCommands,
    commandAvailableOnPage,
    savePrimaryDestination,
    saveWorkingMessage,
    formatSaveResultMessage,
    formatClipboardResultMessage,
    formatCaptureResultMessage,
    detectSentenceBounds,
    sentenceAt,
    langTagToOcrLang,
    detectScriptLang,
    detectPageLangHint,
  };
}
