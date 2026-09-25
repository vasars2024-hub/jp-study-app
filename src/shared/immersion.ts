// Immersion Browser shared DTOs and pure helpers.
// Sites / session / metrics are persisted in main (userData/immersion/).

export type ImmersionLang = 'ja' | 'zh' | 'ru' | 'auto';
export type ImmersionMode = 'live' | 'reader' | 'focus';

/** F8 cycles Live → Reader → Focus. */
export const IMMERSION_MODE_CYCLE: readonly ImmersionMode[] = ['live', 'reader', 'focus'];

export function nextImmersionMode(current: ImmersionMode): ImmersionMode {
  const i = IMMERSION_MODE_CYCLE.indexOf(current);
  return IMMERSION_MODE_CYCLE[(i + 1) % IMMERSION_MODE_CYCLE.length];
}

export function sanitizeImmersionMode(v: unknown): ImmersionMode {
  return v === 'live' || v === 'reader' || v === 'focus' ? v : 'reader';
}

export interface ImmersionSite {
  id: string;
  url: string;
  title: string;
  lang: ImmersionLang;
  tags: string[];
  levelGuess?: string;
  completionPct: number;
  lastVisited: number;
  visitCount: number;
  estimatedDifficulty: number;
  streakDays: number;
  lastStreakDay?: string;
  totalSeconds: number;
  totalChars: number;
  favorite?: boolean;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImmersionFolder {
  id: string;
  name: string;
  order: number;
}

export interface ImmersionTab {
  id: string;
  url: string;
  title: string;
  mode: ImmersionMode;
  scrollY?: number;
}

export interface ImmersionSession {
  activeTabId: string;
  tabs: ImmersionTab[];
  updatedAt: number;
}

export interface ImmersionDayMetrics {
  seconds: number;
  chars: number;
  wordsMined: number;
  videosCaptured: number;
  pagesExported: number;
}

export type ImmersionMetricsMap = Record<string, ImmersionDayMetrics>;

/**
 * A page the user chose to keep — separate from `ImmersionSite`, which is the
 * per-page HISTORY row every visit creates (audit r2 #12: the two were one list,
 * so a real profile's "saved sites" rail held 883 rows of browsing history, and
 * "Save site" only set a flag nothing could unset).
 */
export interface ImmersionBookmark {
  id: string;
  url: string;
  title: string;
  lang: ImmersionLang;
  tags: string[];
  folderId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImmersionSitesStore {
  /** 2 adds `bookmarks`; a v1 store is migrated on read (`migrateSitesStore`). */
  schemaVersion: 2;
  /** History: one row per page visited, with its reading stats. */
  sites: ImmersionSite[];
  folders: ImmersionFolder[];
  bookmarks: ImmersionBookmark[];
}

export interface ImmersionSaveSiteInput {
  url: string;
  title?: string;
  lang?: ImmersionLang;
  tags?: string[];
  /** true stars the page (creates or updates its bookmark); false unstars it. */
  favorite?: boolean;
  folderId?: string | null;
}

/** How far back "Clear history" reaches. */
export type ImmersionHistoryRange = 'hour' | 'day' | 'week' | 'all';

export const IMMERSION_HISTORY_RANGES: readonly ImmersionHistoryRange[] = ['hour', 'day', 'week', 'all'];

const RANGE_MS: Record<Exclude<ImmersionHistoryRange, 'all'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** History rows kept after clearing `range`, measured back from `now`. */
export function clearImmersionHistory(
  sites: readonly ImmersionSite[],
  range: ImmersionHistoryRange,
  now: number,
): ImmersionSite[] {
  if (range === 'all') return [];
  const since = now - RANGE_MS[range];
  return sites.filter((site) => site.lastVisited < since);
}

export interface ImmersionVisitInput {
  url: string;
  title?: string;
  lang?: ImmersionLang;
  seconds?: number;
  chars?: number;
  completionPct?: number;
  estimatedDifficulty?: number;
  /**
   * Whether this call is a NEW VISIT, or an accumulation onto the one already in
   * progress. Defaults to `true`, so the extension bridge and every other existing
   * caller keep their old semantics.
   *
   * It exists because the periodic stats flush is not a visit. `useImmersion` calls
   * `immersionRecordVisit` from a 5-second interval to bank reading seconds and
   * characters, and main incremented `visitCount` on every one of those — so the
   * counter measured "how many five-second flushes happened while this tab was open",
   * not visits. Measured on the real profile before the fix: one row read **7,692
   * visits** against 416,216 recorded seconds, and the whole store of 1,560 sites is
   * inflated the same way. The rail prints that number to the user.
   */
  countVisit?: boolean;
}

export interface ImmersionMetricsDelta {
  seconds?: number;
  chars?: number;
  wordsMined?: number;
  videosCaptured?: number;
  pagesExported?: number;
}

/**
 * Curated starter immersion destinations (no emoji). `labelKey` is resolved with
 * `t()` at render time (CLAUDE.md i18n rule 7); `label` is the English fallback
 * for a caller outside React.
 */
export const IMMERSION_STARTERS: ReadonlyArray<{ label: string; labelKey: string; url: string; lang: ImmersionLang }> = [
  { label: 'NHK Easy', labelKey: 'immersion.starter.nhkEasy', url: 'https://news.web.nhk/news/easy/', lang: 'ja' },
  { label: 'Wikipedia JP', labelKey: 'immersion.starter.wikipediaJa', url: 'https://ja.wikipedia.org/wiki/メインページ', lang: 'ja' },
  { label: 'Hacker News', labelKey: 'immersion.starter.hackerNews', url: 'https://news.ycombinator.com/', lang: 'auto' },
  { label: 'Chinese Wikipedia', labelKey: 'immersion.starter.wikipediaZh', url: 'https://zh.wikipedia.org/wiki/Wikipedia:首页', lang: 'zh' },
  { label: 'Russian Wikipedia', labelKey: 'immersion.starter.wikipediaRu', url: 'https://ru.wikipedia.org/wiki/Заглавная_страница', lang: 'ru' },
];

/**
 * The DEFAULT study language — the empty state's split follows the user's
 * actual study language (`getStudyLang()` in the renderer), this is only the
 * fallback for a caller with no access to it. `IMMERSION_STARTERS` carries five destinations in four
 * languages because Immersion reads any of them, but only two of them are what someone
 * opens a Japanese study app to read. The empty state surfaces the subject-language
 * destinations and tucks the rest behind one disclosure, so the split is derived from the
 * starter data rather than from a hand-picked "show these two" list.
 */
export const IMMERSION_SUBJECT_LANG: ImmersionLang = 'ja';

export const IMMERSION_MAX_TABS = 5;

/* ------------------------------------------------------------------ *
 * Back/Forward — audit r2 #10.
 * ------------------------------------------------------------------ */

export interface ImmersionNavStack {
  entries: string[];
  index: number;
}

export const IMMERSION_NAV_LIMIT = 40;

/**
 * The stack after the page moved to `url`.
 *
 * `replace` is for the page the app itself asked for landing somewhere else (a
 * redirect): the entry it pushed IS this navigation, so it is rewritten rather
 * than followed by a second one Back would bounce through. A move to the entry
 * already current changes nothing — which is what makes Back/Forward, and the
 * `did-navigate` they cause, safe to feed through here.
 */
export function immersionNavAfter(
  stack: ImmersionNavStack,
  url: string,
  opts: { replace?: boolean } = {},
): ImmersionNavStack {
  if (!url) return stack;
  const current = stack.index >= 0 ? stack.entries[stack.index] : undefined;
  if (current === url) return stack;
  if (opts.replace && stack.index >= 0) {
    const entries = [...stack.entries];
    entries[stack.index] = url;
    return { entries, index: stack.index };
  }
  const base = stack.index >= 0 ? stack.entries.slice(0, stack.index + 1) : [];
  const entries = [...base, url].slice(-IMMERSION_NAV_LIMIT);
  return { entries, index: entries.length - 1 };
}

/* ------------------------------------------------------------------ *
 * Tabs — audit r2 #11.
 * ------------------------------------------------------------------ */

function nextTabIdFor(session: ImmersionSession): string {
  let n = session.tabs.length + 1;
  const used = new Set(session.tabs.map((tab) => tab.id));
  while (used.has(`tab-${n}`)) n += 1;
  return `tab-${n}`;
}

/** A new blank tab, made active — or the session unchanged at the cap. */
export function addImmersionTab(session: ImmersionSession, mode: ImmersionMode = 'reader'): ImmersionSession {
  if (session.tabs.length >= IMMERSION_MAX_TABS) return session;
  const id = nextTabIdFor(session);
  return {
    activeTabId: id,
    tabs: [...session.tabs, { id, url: '', title: '', mode }],
    updatedAt: Date.now(),
  };
}

/** Close one tab. The neighbour to its left takes over; the last tab is replaced by a blank one. */
export function closeImmersionTab(session: ImmersionSession, tabId: string): ImmersionSession {
  const at = session.tabs.findIndex((tab) => tab.id === tabId);
  if (at < 0) return session;
  const tabs = session.tabs.filter((tab) => tab.id !== tabId);
  if (tabs.length === 0) return emptySession();
  const activeTabId =
    session.activeTabId === tabId ? tabs[Math.max(0, at - 1)].id : session.activeTabId;
  return { activeTabId, tabs, updatedAt: Date.now() };
}

/** The tab `step` places away from the active one, wrapping (Ctrl+Tab / Ctrl+Shift+Tab). */
export function cycleImmersionTab(session: ImmersionSession, step: 1 | -1): string {
  const at = Math.max(0, session.tabs.findIndex((tab) => tab.id === session.activeTabId));
  const next = (at + step + session.tabs.length) % session.tabs.length;
  return session.tabs[next]?.id ?? session.activeTabId;
}

/** Record where the active tab is, so switching away and back (or a restart) returns to it. */
export function updateImmersionTab(
  session: ImmersionSession,
  tabId: string,
  patch: Partial<Pick<ImmersionTab, 'url' | 'title' | 'mode' | 'scrollY'>>,
): ImmersionSession {
  let changed = false;
  const tabs = session.tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    const next = { ...tab, ...patch };
    if (next.url !== tab.url || next.title !== tab.title || next.mode !== tab.mode || next.scrollY !== tab.scrollY) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...session, tabs, updatedAt: Date.now() } : session;
}

/* ------------------------------------------------------------------ *
 * The page's language and how far it was read — audit r2 #13.
 * ------------------------------------------------------------------ */

/**
 * The study language a page is written in, from its own text: kana means
 * Japanese, Han without kana means Chinese, Cyrillic means Russian. Counted,
 * not sniffed from one character — an English page quoting one kanji is still
 * English. `auto` when nothing dominates.
 */
export function detectImmersionTextLang(text: string, studyLang?: ImmersionLang): ImmersionLang {
  let kana = 0;
  let han = 0;
  let cyr = 0;
  let latin = 0;
  const sample = text.slice(0, 20_000);
  for (const ch of sample) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kana += 1;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) han += 1;
    else if (c >= 0x0400 && c <= 0x04ff) cyr += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1;
  }
  const cjk = kana + han;
  const total = cjk + cyr + latin;
  if (total < 20) return 'auto';
  if (cjk >= cyr && cjk / total >= 0.3) {
    if (kana / cjk >= 0.05) return 'ja';
    if (kana === 0) return 'zh';
    // A trace of kana in Han text is what both a Chinese page quoting Japanese
    // and a kanji-heavy Japanese page look like; the study language decides.
    return studyLang === 'ja' ? 'ja' : 'zh';
  }
  if (cyr / total >= 0.3) return 'ru';
  return 'auto';
}

/** Scroll position as a reading percentage, 0-100; a page that fits reads as 100. */
export function immersionScrollPct(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const room = scrollHeight - clientHeight;
  if (!(room > 0)) return scrollHeight > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((scrollTop + clientHeight) / scrollHeight) * 100)));
}

export function immersionDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize and validate http(s) URLs; add https if bare host. */
export function normalizeImmersionUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject non-web schemes before any auto-prefix.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[\w.-]+\.[\w.-]+/.test(candidate) || candidate.includes('/')) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/|youtu\.be\/)/i.test(url);
}

/** Plain text that is not a URL — treated as a web search in the immersion browser. */
export function isImmersionSearchQuery(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && normalizeImmersionUrl(t) === null;
}

/** Search engines and homepages that need full Live browsing (Reader strips their UI). */
export function isBrowsingPortalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'google.com' || host.endsWith('.google.com')) return true;
    if (host === 'bing.com' || host.endsWith('.bing.com')) return true;
    if (host === 'duckduckgo.com') return true;
    if (host === 'search.yahoo.com') return true;
    if (host === 'yahoo.com' && u.pathname.startsWith('/search')) return true;
    if (host === 'startpage.com' || host === 'ecosia.org') return true;
    return false;
  } catch {
    return false;
  }
}

/** Use Live webview instead of Reader extraction (search, portals, interactive pages). */
export function shouldUseLiveImmersionMode(raw: string, url: string): boolean {
  return isImmersionSearchQuery(raw) || isBrowsingPortalUrl(url);
}

/** http(s) link suitable for yt-dlp remote capture (excludes search portals). */
export function isRemoteMediaUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !isBrowsingPortalUrl(u.href);
  } catch {
    return false;
  }
}

/**
 * Does a failed capture mean "this page simply has no video", rather than
 * something the user could act on?
 *
 * `isRemoteMediaUrl` deliberately admits every http(s) page that is not a
 * search portal, because yt-dlp supports over a thousand sites and no
 * host-list this app could carry would stay right. The cost of that
 * permissiveness is that Capture is offered on an ordinary article too, and
 * measured live on NHK Easy the banner then read
 * `Download failed: ERROR: Unsupported URL: https://news.web.nhk/news/easy/` —
 * a raw yt-dlp diagnostic, in English in every language, telling a reader
 * nothing they can do. The attempt is right; only the reporting was wrong.
 *
 * Matched against yt-dlp's own wording, not ours, so it must stay substring
 * matching on lowercase: the tool prefixes `ERROR: `, sometimes a colon and
 * the URL, and localises nothing.
 */
export function isNoVideoCaptureError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('unsupported url')
    || m.includes('no video formats')
    || m.includes('no video could be found')
    || m.includes('does not have a video');
}

export function emptyDayMetrics(): ImmersionDayMetrics {
  return { seconds: 0, chars: 0, wordsMined: 0, videosCaptured: 0, pagesExported: 0 };
}

export function applyMetricsDelta(
  prev: ImmersionDayMetrics | undefined,
  delta: ImmersionMetricsDelta,
): ImmersionDayMetrics {
  const base = prev ?? emptyDayMetrics();
  return {
    seconds: base.seconds + Math.max(0, delta.seconds ?? 0),
    chars: base.chars + Math.max(0, delta.chars ?? 0),
    wordsMined: base.wordsMined + Math.max(0, delta.wordsMined ?? 0),
    videosCaptured: base.videosCaptured + Math.max(0, delta.videosCaptured ?? 0),
    pagesExported: base.pagesExported + Math.max(0, delta.pagesExported ?? 0),
  };
}

/** Advance site streak given lastStreakDay and today's key. */
export function nextSiteStreak(
  streakDays: number,
  lastStreakDay: string | undefined,
  today: string,
): { streakDays: number; lastStreakDay: string } {
  if (lastStreakDay === today) {
    return { streakDays: Math.max(1, streakDays), lastStreakDay: today };
  }
  if (!lastStreakDay) {
    return { streakDays: 1, lastStreakDay: today };
  }
  // Yesterday?
  const y = new Date(`${today}T12:00:00`);
  y.setDate(y.getDate() - 1);
  const yKey = immersionDayKey(y);
  if (lastStreakDay === yKey) {
    return { streakDays: streakDays + 1, lastStreakDay: today };
  }
  return { streakDays: 1, lastStreakDay: today };
}

export function emptySitesStore(): ImmersionSitesStore {
  return { schemaVersion: 2, sites: [], folders: [], bookmarks: [] };
}

export function sanitizeBookmark(raw: unknown): ImmersionBookmark | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.url !== 'string') return null;
  const url = normalizeImmersionUrl(o.url);
  if (!url) return null;
  const now = Date.now();
  return {
    id: o.id,
    url,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : url,
    lang: sanitizeLang(o.lang),
    tags: Array.isArray(o.tags)
      ? [...new Set(o.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()))]
      : [],
    folderId: typeof o.folderId === 'string' && o.folderId ? o.folderId : undefined,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
  };
}

/**
 * Read a stored sites document of either schema.
 *
 * A v1 store has no bookmarks: every page it holds is history, and the rows the
 * user starred (`favorite`) ALSO become bookmarks, keeping their title, tags and
 * folder. The history rows stay as they are — their reading stats are the rail's
 * progress bars — so migrating loses nothing and can run on every read of an
 * unmigrated file without duplicating anything.
 */
export function migrateSitesStore(raw: unknown): ImmersionSitesStore {
  if (!raw || typeof raw !== 'object') return emptySitesStore();
  const o = raw as Record<string, unknown>;
  const sites = Array.isArray(o.sites) ? (o.sites.map(sanitizeSite).filter(Boolean) as ImmersionSite[]) : [];
  const folders = Array.isArray(o.folders)
    ? o.folders
        .filter((f): f is { id: string; name: string; order?: unknown } => {
          if (!f || typeof f !== 'object') return false;
          const x = f as Record<string, unknown>;
          return typeof x.id === 'string' && typeof x.name === 'string';
        })
        .map((f) => ({ id: f.id, name: f.name, order: typeof f.order === 'number' ? f.order : 0 }))
    : [];
  let bookmarks: ImmersionBookmark[];
  if (Array.isArray(o.bookmarks)) {
    bookmarks = o.bookmarks.map(sanitizeBookmark).filter(Boolean) as ImmersionBookmark[];
  } else {
    bookmarks = sites
      .filter((site) => site.favorite)
      .map((site) => ({
        id: `bm-${site.id}`,
        url: site.url,
        title: site.title,
        lang: site.lang,
        tags: [...site.tags],
        folderId: site.folderId,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
      }));
  }
  return { schemaVersion: 2, sites, folders, bookmarks };
}

export function emptySession(): ImmersionSession {
  const id = 'tab-1';
  return {
    activeTabId: id,
    // No title: the tab strip names a blank tab in the UI language.
    tabs: [{ id, url: '', title: '', mode: 'reader' }],
    updatedAt: Date.now(),
  };
}

export function sanitizeLang(v: unknown): ImmersionLang {
  return v === 'ja' || v === 'zh' || v === 'ru' || v === 'auto' ? v : 'auto';
}

export function sanitizeSite(raw: unknown): ImmersionSite | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.url !== 'string') return null;
  const url = normalizeImmersionUrl(o.url) ?? o.url;
  if (!/^https?:\/\//i.test(url)) return null;
  const now = Date.now();
  return {
    id: o.id,
    url,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : url,
    lang: sanitizeLang(o.lang),
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    levelGuess: typeof o.levelGuess === 'string' ? o.levelGuess : undefined,
    completionPct: clampNum(o.completionPct, 0, 100, 0),
    lastVisited: typeof o.lastVisited === 'number' ? o.lastVisited : 0,
    visitCount: Math.max(0, Math.floor(Number(o.visitCount) || 0)),
    estimatedDifficulty: clampNum(o.estimatedDifficulty, 0, 1, 0),
    streakDays: Math.max(0, Math.floor(Number(o.streakDays) || 0)),
    lastStreakDay: typeof o.lastStreakDay === 'string' ? o.lastStreakDay : undefined,
    totalSeconds: Math.max(0, Number(o.totalSeconds) || 0),
    totalChars: Math.max(0, Number(o.totalChars) || 0),
    favorite: Boolean(o.favorite),
    folderId: typeof o.folderId === 'string' ? o.folderId : undefined,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
  };
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Stable id from URL host+path (for stats bookId without needing a saved site). */
export function immersionStatsId(url: string): string {
  try {
    const u = new URL(url);
    return `immersion:${u.host}${u.pathname}`.slice(0, 180);
  } catch {
    return `immersion:${url}`.slice(0, 180);
  }
}
