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

export interface ImmersionSitesStore {
  schemaVersion: 1;
  sites: ImmersionSite[];
  folders: ImmersionFolder[];
}

export interface ImmersionSaveSiteInput {
  url: string;
  title?: string;
  lang?: ImmersionLang;
  tags?: string[];
  favorite?: boolean;
  folderId?: string | null;
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
 * Curated starter immersion destinations (no emoji). `label` is the English
 * name; `labelKey`, when present, is what the UI shows ("Wikipedia JP" used to
 * print as-is in every language). A proper name with no translation has none.
 */
export const IMMERSION_STARTERS: ReadonlyArray<{ label: string; labelKey?: string; url: string; lang: ImmersionLang }> = [
  { label: 'NHK Easy', labelKey: 'immersion.starter.nhkEasy', url: 'https://news.web.nhk/news/easy/', lang: 'ja' },
  { label: 'Japanese Wikipedia', labelKey: 'immersion.starter.wikipediaJa', url: 'https://ja.wikipedia.org/wiki/メインページ', lang: 'ja' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com/', lang: 'auto' },
  { label: 'Chinese Wikipedia', labelKey: 'immersion.starter.wikipediaZh', url: 'https://zh.wikipedia.org/wiki/Wikipedia:首页', lang: 'zh' },
  { label: 'Russian Wikipedia', labelKey: 'immersion.starter.wikipediaRu', url: 'https://ru.wikipedia.org/wiki/Заглавная_страница', lang: 'ru' },
];

/**
 * The language this app is about. `IMMERSION_STARTERS` carries five destinations in four
 * languages because Immersion reads any of them, but only two of them are what someone
 * opens a Japanese study app to read. The empty state surfaces the subject-language
 * destinations and tucks the rest behind one disclosure, so the split is derived from the
 * starter data rather than from a hand-picked "show these two" list.
 */
export const IMMERSION_SUBJECT_LANG: ImmersionLang = 'ja';

export const IMMERSION_MAX_TABS = 5;

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
  return { schemaVersion: 1, sites: [], folders: [] };
}

export function emptySession(): ImmersionSession {
  const id = 'tab-1';
  return {
    activeTabId: id,
    tabs: [{ id, url: '', title: 'New tab', mode: 'reader' }],
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
