// Immersion browser logic + the classic (non-aero) presentation blocks, shared
// by Study OS's `ImmersionView` and Blanc's `BlancImmersionPanel`.
//
// Pillar 2 (BLANC_REFINEMENT_PLAN.md): Blanc had only `immersion-tracker`
// (read-only totals); this promotes it to the full browser — live <webview>
// guest, Reader Mode extraction, the sites rail, dictionary/translate popups,
// and the stats feed. All of that was view-local state; it moves into
// `useImmersion` so both shells drive one implementation.
//
// Study OS keeps its bespoke aero chrome (rendered in `ImmersionView` off this
// hook, like `TranslateContent`); the classic `immersion-*` markup below is what
// both the non-aero Study OS path and Blanc render. Those classes live in
// `styles.css`, which both shells load. Nothing here imports
// `AppChrome`/`MenuBar`/`StatusBar` or the `components/ui` barrel.

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DictionaryPopup from '../DictionaryPopup';
import SentenceTranslatePopup from '../SentenceTranslatePopup';
import Icon from '../Icons';
import VirtualList from '../VirtualList';
import {
  IMMERSION_HISTORY_RANGES,
  IMMERSION_MAX_TABS,
  IMMERSION_MODE_CYCLE,
  IMMERSION_STARTERS,
  addImmersionTab,
  closeImmersionTab,
  cycleImmersionTab,
  detectImmersionTextLang,
  emptySession,
  immersionNavAfter,
  immersionScrollPct,
  immersionStatsId,
  isNoVideoCaptureError,
  isRemoteMediaUrl,
  nextImmersionMode,
  normalizeImmersionUrl,
  shouldUseLiveImmersionMode,
  updateImmersionTab,
  type ImmersionBookmark,
  type ImmersionDayMetrics,
  type ImmersionFolder,
  type ImmersionHistoryRange,
  type ImmersionMode,
  type ImmersionNavStack,
  type ImmersionSession,
  type ImmersionSite,
  type ImmersionSitesStore,
} from '../../../shared/immersion';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { getStudyLang, onStudyLangChanged } from '../../studyEnvironment';
import { confirmDialog } from '../ui/dialogService';
import {
  buildBrowserCaptureTarget,
  browserCaptureUrl,
  LENS_CAPTURE_TARGET_KEY,
} from '../../../shared/lensCaptureTarget';
import { isNhkNewsArticleUrl, nhkArticleLooksHydrated } from '../../../shared/nhkArticle';
import {
  immersionLoadFailure,
  immersionLoadFailureMessage,
  mayRunReaderPass,
  type ImmersionLoadFailEvent,
  type ImmersionLoadFailure,
} from '../../../shared/immersionLoadFailure';
import { READING_CANVAS_FILL_POLICY } from '../../../shared/liquidReadingCanvas';
import { ReadingCanvas, type ReadingCanvasTool } from '../liquid/ReadingCanvas';
import { AnchorSurface } from '../liquid/LiquidSurface';
import { articleBodyHtml, fetchReadableArticle } from '../../wikiArticle';
import {
  clearLookupHighlight,
  isLookupClick,
  lookupHitFromText,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
} from '../../wordLookup';
import {
  IMMERSION_CONFIG_CHANNEL,
  IMMERSION_LOOKUP_CHANNEL,
  createGuestLookupGate,
  validateGuestLookupMessage,
} from '../../../shared/immersionGuestBridge';
import { highlightEl, recolorEl, resetHighlightRoot, WK_HIGHLIGHT_CSS } from '../../wordHighlight';
import { recordReading } from '../../stats';
import { getTokenizer, tokenizerReady } from '../../tokenizer';
import { onKnowledgeChanged } from '../../knownWords';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { useT } from '../../i18n';
import { removeImmersionSiteWithConfirm } from './immersionSiteActions';

export { IMMERSION_MODE_CYCLE, IMMERSION_STARTERS, WK_HIGHLIGHT_CSS };
export type { ImmersionMode };

type PopupState =
  | { kind: 'dict'; query: string; x: number; y: number; context?: string }
  | { kind: 'translate'; query: string }
  | null;

const STATS_FLUSH_MS = 5000;

/**
 * Electron <webview> is not in React's DOM typings; create via createElement.
 *
 * Note what is deliberately absent: no `preload`, no `webpreferences`, no
 * `nodeintegration`, no `disablewebsecurity`. The guest's privileges — including
 * the study bridge preload added in slice 70 — are set in the main process, in
 * `attachNavGuards`'s `will-attach-webview` handler, which also strips those
 * attributes if they ever appear here. Adding one to this bag would not grant
 * it; it would just be deleted.
 */
export function createWebview(src: string, setRef: (el: HTMLElement | null) => void) {
  return createElement('webview', {
    ref: setRef,
    className: 'immersion-webview',
    src,
    partition: 'persist:immersion',
    allowpopups: 'true',
    style: { width: '100%', height: '100%', display: 'flex' },
  } as Record<string, unknown>);
}

/** The subset of the `<webview>` element this file drives. */
type ImmersionWebview = HTMLElement & {
  send?: (channel: string, payload: unknown) => void;
  getBoundingClientRect: () => DOMRect;
};

function ensureProtocol(raw: string): string {
  const n = normalizeImmersionUrl(raw);
  if (n) return n;
  // Treat as search fallback
  const q = raw.trim();
  if (!q) return '';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function useImmersion() {
  const { t, lang } = useT();
  const MODE_LABELS: Record<ImmersionMode, string> = {
    live: t('immersion.mode.live'),
    reader: t('immersion.mode.reader'),
    focus: t('immersion.mode.focus'),
  };
  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [title, setTitle] = useState('Immersion');
  const [mode, setMode] = useState<ImmersionMode>('reader');
  const [railOpen, setRailOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readerHtml, setReaderHtml] = useState('');
  /** History: one row per page visited. */
  const [sites, setSites] = useState<ImmersionSite[]>([]);
  /** Bookmarks: the pages the user starred (audit r2 #12 — no longer the same list). */
  const [bookmarks, setBookmarks] = useState<ImmersionBookmark[]>([]);
  const [folders, setFolders] = useState<ImmersionFolder[]>([]);
  /** `null` until the user picks: then Bookmarks when there are any, else History. */
  const [railViewChoice, setRailView] = useState<'bookmarks' | 'history' | null>(null);
  const [sitesStatus, setSitesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [siteQuery, setSiteQuery] = useState('');
  const normalizedSiteQuery = siteQuery.trim().normalize('NFKC').toLowerCase();
  /**
   * The haystack depends on `sites` alone, so it is folded ONCE per rail change
   * rather than once per keystroke. `String.prototype.normalize('NFKC')` is an ICU
   * call that allocates a new string every time, and this rail is ~1,200 sites on a
   * real profile — re-folding all of them on every character is work the query
   * cannot change the answer to.
   */
  const siteHaystacks = useMemo(
    () => sites.map((site) => `${site.title} ${site.url}`.normalize('NFKC').toLowerCase()),
    [sites],
  );
  const filteredSites = useMemo(
    () => (normalizedSiteQuery
      ? sites.filter((_, index) => siteHaystacks[index].includes(normalizedSiteQuery))
      : sites),
    [sites, siteHaystacks, normalizedSiteQuery],
  );
  const railView = railViewChoice ?? (bookmarks.length > 0 ? 'bookmarks' : 'history');
  const filteredBookmarks = useMemo(() => {
    if (!normalizedSiteQuery) return bookmarks;
    return bookmarks.filter((b) =>
      `${b.title} ${b.url} ${b.tags.join(' ')}`.normalize('NFKC').toLowerCase().includes(normalizedSiteQuery),
    );
  }, [bookmarks, normalizedSiteQuery]);
  /**
   * Back/Forward. One stack, fed by the app's own navigations AND by the page's
   * (audit r2 #10: a link clicked inside the page moved the webview but never
   * reached this stack, so Back skipped straight past it).
   */
  const [nav, setNav] = useState<ImmersionNavStack>({ entries: [], index: -1 });
  const history = nav.entries;
  const histIdx = nav.index;
  /** The url `navigate` asked for, until the webview reports where it landed (redirects replace). */
  const pendingNavRef = useRef<string | null>(null);
  /** Furthest point read on this page, 0-100 — sent with the stats flush (audit r2 #13). */
  const readPctRef = useRef(0);
  /* ---- tabs (audit r2 #11): the session store main already kept ---- */
  const [session, setSession] = useState<ImmersionSession>(emptySession);
  const [sessionReady, setSessionReady] = useState(false);
  /** Each tab's Back/Forward stack. In memory: a restart restores pages, not trails. */
  const navByTab = useRef(new Map<string, ImmersionNavStack>());
  const rootRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<PopupState>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  /** Slice 70: study lookup on the LIVE guest page, not just Reader Mode. */
  const [liveLookup, setLiveLookup] = useState(true);
  /**
   * The study language (Settings), which the reader follows: Chinese and
   * Russian are study languages too, and nothing here may assume Japanese.
   */
  const [studyLang, setStudyLangState] = useState(getStudyLang);
  useEffect(() => onStudyLangChanged(setStudyLangState), []);

  const readerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);
  const urlBarRef = useRef<HTMLInputElement>(null);
  const secondsAcc = useRef(0);
  const charsAcc = useRef(0);
  const activeStatsId = useRef('');
  const activeTitle = useRef('Immersion');
  const pageOpenAt = useRef(Date.now());
  /**
   * The main-frame load failure for the navigation currently on screen, or null.
   *
   * A ref rather than state because two things read it in the same tick as the webview event
   * that writes it: `did-stop-loading` fires immediately after `did-fail-load`, and the reader
   * pass it would otherwise schedule runs 400 ms later. Both have to see the failure, and a
   * setState would not have committed for the first of them.
   */
  const loadFailure = useRef<ImmersionLoadFailure | null>(null);
  // Only the latest extraction for the page still on screen may publish results.
  const readerRequest = useRef(0);
  const readerUrl = useRef('');
  useEffect(() => () => {
    readerRequest.current += 1;
    readerUrl.current = '';
  }, []);
  // Host-side rate limit on the guest channel. The guest limits itself too, but
  // that limiter runs in the process we are defending against — this one is the
  // enforcement. Kept in a ref so it survives re-render but resets per page.
  const guestGate = useRef(createGuestLookupGate());
  /** One notice per page when a guest misbehaves — the notice must not spam either. */
  const guestNoticed = useRef(false);

  // Stable innerHTML object — React 19 re-applies dangerouslySetInnerHTML when the
  // prop reference changes, which wipes hand-injected .wk highlight spans on click.
  const readerHtmlProp = useMemo(
    () => (readerHtml ? { __html: readerHtml } : null),
    [readerHtml],
  );

  const showChrome = mode !== 'focus';
  const showReader = !!readerHtml && (mode === 'reader' || mode === 'focus');
  const showWebview =
    !!currentUrl && (mode === 'live' || mode === 'reader' || (mode === 'focus' && !readerHtml));
  const splitView = mode === 'reader' && showReader && showWebview;

  // ----- Sites library -----
  const applySitesStore = useCallback((store: ImmersionSitesStore) => {
    // History is newest first; bookmarks keep the order they were starred in.
    setSites([...store.sites].sort((a, b) => b.lastVisited - a.lastVisited));
    setBookmarks([...(store.bookmarks ?? [])].sort((a, b) => b.createdAt - a.createdAt));
    setFolders([...(store.folders ?? [])].sort((a, b) => a.order - b.order));
    setSitesStatus('ready');
  }, []);

  const refreshSites = useCallback(async () => {
    setSitesStatus('loading');
    try {
      applySitesStore(await window.api.immersionListSites());
    } catch {
      setSitesStatus('error');
    }
  }, [applySitesStore]);

  useEffect(() => {
    void refreshSites();
    return window.api.onImmersionSitesChanged(applySitesStore);
  }, [refreshSites, applySitesStore]);

  // ----- Stats flush (feeds study widgets via recordReading) -----
  const flushStats = useCallback(() => {
    const id = activeStatsId.current;
    if (!id) return;
    const secs = secondsAcc.current;
    const chars = charsAcc.current;
    if (secs <= 0 && chars <= 0) return;
    secondsAcc.current = 0;
    charsAcc.current = 0;
    recordReading(id, activeTitle.current, secs, chars);
    if (currentUrl) {
      // `countVisit: false` — this is the 5-second stats flush, not an arrival. Without
      // it main incremented `visitCount` on every flush, so the rail's "N visits" was
      // really "N five-second ticks with this tab open": one row in the real profile
      // read 7,692. The visit itself is counted once, in `navigate`.
      void window.api.immersionRecordVisit({
        url: currentUrl,
        title: activeTitle.current,
        seconds: secs,
        chars,
        // How far this page was read, so the rail's progress bar has a number.
        ...(readPctRef.current > 0 ? { completionPct: readPctRef.current } : {}),
        countVisit: false,
      });
    }
  }, [currentUrl]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - pageOpenAt.current) / 1000;
      // Reset the mark OUTSIDE the guard below: a span that is not credited must
      // still be consumed, or the first tick after the window comes back would
      // bank the whole hidden stretch in one go.
      pageOpenAt.current = Date.now();
      // A page nobody is looking at is not being read. Every host that mounts
      // this hook — Study OS's ImmersionView, Blanc's library panel, and one of
      // each per app window — runs its own ticker against ONE shared per-day
      // total in main, so a hidden or occluded window was adding wall-clock time
      // to the same day as the window in front of it. Measured on the real
      // profile before this guard: 2026-08-27 banked 36.8 HOURS in a 24-hour day
      // (metrics.json, 38 days, 343.7 h total).
      if (elapsed > 0 && elapsed < 120 && currentUrl && document.visibilityState === 'visible') {
        secondsAcc.current += elapsed;
      }
      if (secondsAcc.current >= 2 || charsAcc.current > 0) flushStats();
    }, STATS_FLUSH_MS);
    return () => {
      window.clearInterval(tick);
      flushStats();
    };
  }, [currentUrl, flushStats]);

  // ----- Reader highlight -----
  const runHighlight = useCallback(() => {
    const root = readerRef.current;
    if (!root || !readerHtml) return;
    // The known-word colouring is built on the Japanese tokenizer; over another
    // study language it would mark Japanese readings of Chinese text.
    if (studyLang !== 'ja') {
      resetHighlightRoot(root);
      return;
    }
    const apply = () => {
      resetHighlightRoot(root);
      highlightEl(root, true);
    };
    if (tokenizerReady()) apply();
    else void getTokenizer().then(apply).catch(() => undefined);
  }, [readerHtml, studyLang]);

  useEffect(() => {
    if (!showReader || !readerHtml) return;
    const timer = window.setTimeout(runHighlight, 40);
    return () => window.clearTimeout(timer);
  }, [readerHtml, showReader, runHighlight]);

  useEffect(() => {
    return onKnowledgeChanged(() => {
      if (readerRef.current) recolorEl(readerRef.current);
    });
  }, []);

  // ----- Navigation -----
  const loadReader = useCallback(async (url: string) => {
    // A page that never opened has no article to extract, and saying "reader extraction failed,
    // wait for the page to finish loading" about it is advice the user cannot act on: the load is
    // over and it failed. Keep the real reason on screen instead of overwriting it with a symptom.
    if (readerUrl.current !== url || !mayRunReaderPass(loadFailure.current, url)) return;
    const request = ++readerRequest.current;
    const isCurrent = () => request === readerRequest.current && readerUrl.current === url
      && mayRunReaderPass(loadFailure.current, url);
    setLoading(true);
    setError(null);
    try {
      const textLen = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
      const nhk = isNhkNewsArticleUrl(url);
      const targetLen = nhk ? 1800 : 900;
      const maxAttempts = nhk ? 12 : 6;
      const articleReady = (html: string) => {
        const plain = html.replace(/<[^>]+>/g, ' ');
        return nhk ? nhkArticleLooksHydrated(plain) : textLen(html) >= targetLen;
      };

      let art: Awaited<ReturnType<typeof fetchReadableArticle>> | null = null;
      let bestLen = 0;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) {
          await new Promise((r) => window.setTimeout(r, nhk ? 700 + attempt * 450 : 500 + attempt * 350));
        }
        if (!isCurrent()) return;
        try {
          const next = await fetchReadableArticle(url, webviewRef.current);
          if (!isCurrent()) return;
          const nextLen = textLen(next.html);
          if (nextLen > bestLen || (articleReady(next.html) && !art)) {
            art = next;
            bestLen = nextLen;
          }
          if (articleReady(next.html)) break;
        } catch {
          /* retry after webview hydration */
        }
      }
      if (!isCurrent()) return;
      if (!art || bestLen < 40) {
        throw new Error(t('immersion.readerExtractionFailed'));
      }
      if (nhk && !nhkArticleLooksHydrated(art.html.replace(/<[^>]+>/g, ' '))) {
        throw new Error(t('immersion.nhkStillLoading'));
      }
      const body = articleBodyHtml(art.title, art.html, art.meta);
      setReaderHtml(body);
      setTitle(art.title);
      activeTitle.current = art.title;
      charsAcc.current += Math.min(5000, art.html.replace(/<[^>]+>/g, '').length);
      setStatus(null);
      // The reader pass re-states the row's real title and canonical URL after a redirect.
      // It is the SAME arrival `navigate` already counted, so it must not count a second one.
      // …and the language the page is written in, which the rail prefixes
      // (audit r2 #13: the renderer never sent it, so every row read AUTO).
      const pageLang = detectImmersionTextLang(art.html.replace(/<[^>]+>/g, ' '), getStudyLang());
      void window.api.immersionRecordVisit({
        url: art.url,
        title: art.title,
        countVisit: false,
        ...(pageLang !== 'auto' ? { lang: pageLang } : {}),
      });
      setLoading(false);
    } catch (e) {
      if (!isCurrent()) return;
      setError(
        e instanceof Error ? e.message : t('immersion.readerExtractionFailedSwitchLive'),
      );
      setReaderHtml('');
      setLoading(false);
    }
  }, [t]);

  const navigate = useCallback(
    (raw: string, opts?: { pushHistory?: boolean; mode?: ImmersionMode }) => {
      const url = ensureProtocol(raw);
      if (!url) return;
      readerRequest.current += 1;
      readerUrl.current = url;
      // §5.13: route cue on node navigation (cue exists only in the wired pack).
      if (document.documentElement.getAttribute('data-materials') === 'wired') {
        window.dispatchEvent(new CustomEvent('wired:route'));
      }
      flushStats();
      pageOpenAt.current = Date.now();
      // THE arrival, counted exactly once, and only when the page actually changes.
      // `activeStatsId` still holds the OUTGOING page here, which is why the comparison
      // is made before it is reassigned two lines down — and why it is a ref rather than
      // `currentUrl`: reading state here would put it in this callback's dep list for a
      // value that only ever moves together with `flushStats`.
      // The guard is load-bearing, not tidiness: switching to Live mode re-enters
      // `navigate` with the SAME url (see `applyMode`), as does Reload, and neither is a
      // new visit. Back and Forward reach a different page and correctly do count.
      if (immersionStatsId(url) !== activeStatsId.current) {
        void window.api.immersionRecordVisit({ url });
        readPctRef.current = 0;
      }
      pendingNavRef.current = url;
      // A fresh attempt, so the previous one's failure stops speaking for it — including a retry
      // of the same URL, where `did-start-loading` may not fire before the reader pass is due.
      loadFailure.current = null;
      setCurrentUrl(url);
      setUrlInput(url);
      activeStatsId.current = immersionStatsId(url);
      activeTitle.current = url;
      setTitle(url);
      setPopup(null);
      clearLookupHighlight();
      // A new page gets a fresh lookup budget and a fresh right to warn once.
      guestGate.current = createGuestLookupGate();
      guestNoticed.current = false;

      const forceLive = shouldUseLiveImmersionMode(raw, url);
      let nextMode = opts?.mode ?? mode;
      if (forceLive) {
        nextMode = 'live';
        setMode('live');
      } else if (opts?.mode) {
        setMode(opts.mode);
      }
      if (opts?.pushHistory !== false) {
        setNav((current) => immersionNavAfter(current, url));
      }

      if (nextMode === 'reader' || nextMode === 'focus') {
        setLoading(true);
        // The previous page's failure is not this attempt's, and the reader pass that used to
        // clear it now refuses to run when one is pending.
        setError(null);
        setReaderHtml('');
        const wv = webviewRef.current as (HTMLElement & { loadURL?: (u: string) => void }) | null;
        if (wv) {
          if (typeof wv.loadURL === 'function') wv.loadURL(url);
          else wv.setAttribute('src', url);
        } else {
          void loadReader(url);
        }
      } else {
        setReaderHtml('');
        setError(null);
        setLoading(true);
        const wv = webviewRef.current as (HTMLElement & { loadURL?: (u: string) => void }) | null;
        if (wv) {
          if (typeof wv.loadURL === 'function') wv.loadURL(url);
          else wv.setAttribute('src', url);
        }
      }
    },
    [flushStats, loadReader, mode],
  );

  const goBack = () => {
    if (histIdx <= 0) return;
    const i = histIdx - 1;
    setNav((current) => ({ ...current, index: i }));
    navigate(history[i], { pushHistory: false });
  };
  const goForward = () => {
    if (histIdx < 0 || histIdx >= history.length - 1) return;
    const i = histIdx + 1;
    setNav((current) => ({ ...current, index: i }));
    navigate(history[i], { pushHistory: false });
  };
  const reload = () => {
    if (!currentUrl) return;
    if (showReader || mode === 'reader' || mode === 'focus') void loadReader(currentUrl);
    else {
      const wv = webviewRef.current as (HTMLElement & { reload?: () => void }) | null;
      wv?.reload?.();
    }
  };
  /**
   * The reverse of `navigate`. Opening a page was the only one-way door on this surface:
   * Back/Forward/Reload all need a page, so once one was open the starter state — the five
   * curated destinations and the "open a page to begin" copy — was unreachable without
   * destroying the window. Every open flow owes a close flow.
   *
   * The reading stats are flushed FIRST, exactly as `navigate` does, or the time spent on
   * the page being closed is discarded rather than banked. History and the saved-sites rail
   * are deliberately left intact: the rail is the route back, and clearing the stack would
   * make closing a page destroy the trail as a side effect.
   */
  const closePage = useCallback(() => {
    if (!currentUrl) return;
    flushStats();
    readerRequest.current += 1;
    readerUrl.current = '';
    activeStatsId.current = '';
    activeTitle.current = '';
    pageOpenAt.current = 0;
    loadFailure.current = null;
    setCurrentUrl('');
    setUrlInput('');
    setReaderHtml('');
    setError(null);
    setStatus(null);
    setPopup(null);
    setTitle('Immersion');
    setLoading(false);
    clearLookupHighlight();
  }, [currentUrl, flushStats]);

  const applyMode = useCallback(
    (next: ImmersionMode) => {
      setMode(next);
      if (!currentUrl) return;
      if (next === 'live') {
        navigate(currentUrl, { pushHistory: false, mode: 'live' });
      } else if (next === 'reader' || next === 'focus') {
        if (!readerHtml) void loadReader(currentUrl);
      }
    },
    [currentUrl, loadReader, navigate, readerHtml],
  );

  const cycleMode = () => {
    applyMode(nextImmersionMode(mode));
  };

  // Webview events
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || (mode === 'focus' && !!readerHtml)) return;
    let readerTimer: ReturnType<typeof window.setTimeout> | undefined;
    const onStart = () => {
      readerRequest.current += 1;
      loadFailure.current = null;
      setLoading(true);
    };
    const onStop = () => {
      setLoading(false);
      // Chromium fires `did-stop-loading` after a failed load too. Running the reader pass over
      // the error page is what buried the true reason under a reader-extraction message.
      if (loadFailure.current) return;
      if ((mode === 'reader' || mode === 'focus') && currentUrl) {
        const delay = isNhkNewsArticleUrl(currentUrl) ? 1200 : 400;
        window.clearTimeout(readerTimer);
        const url = readerUrl.current;
        readerTimer = window.setTimeout(() => void loadReader(url), delay);
      }
    };
    const onFail = (e: Event) => {
      const failure = immersionLoadFailure(e as ImmersionLoadFailEvent, currentUrl);
      // Null means this event is not THIS page failing — a subframe, or a load the user's own
      // next navigation aborted. Reporting either would be a fabricated error, not a missing one.
      if (!failure) return;
      readerRequest.current += 1;
      loadFailure.current = failure;
      setLoading(false);
      setReaderHtml('');
      const msg = immersionLoadFailureMessage(failure);
      setError(t(msg.key, msg.vars));
    };
    const onTitle = (e: Event) => {
      const tt = (e as { title?: string }).title;
      if (tt) {
        setTitle(tt);
        activeTitle.current = tt;
      }
    };
    const onNav = (e: Event) => {
      const u = (e as { url?: string }).url;
      if (u && /^https?:\/\//i.test(u)) {
        // Where a navigation the app asked for actually landed (possibly after a
        // redirect) replaces that entry; anything else is the PAGE moving — a
        // link, a form, pushState — and is a new entry Back can return from.
        const own = pendingNavRef.current !== null;
        pendingNavRef.current = null;
        if (readerUrl.current !== u) {
          readerRequest.current += 1;
          readerUrl.current = u;
          setReaderHtml('');
        }
        setNav((current) => immersionNavAfter(current, u, { replace: own }));
        const statsId = immersionStatsId(u);
        if (statsId !== activeStatsId.current) {
          // Bank the page being left before the next one starts counting, and
          // count the arrival exactly once — `navigate` already did for its own.
          flushStats();
          if (!own) void window.api.immersionRecordVisit({ url: u });
          readPctRef.current = 0;
          pageOpenAt.current = Date.now();
        }
        setCurrentUrl(u);
        setUrlInput(u);
        activeStatsId.current = statsId;
      }
    };
    const onNewWindow = (e: Event) => {
      const ev = e as { url?: string; preventDefault?: () => void };
      ev.preventDefault?.();
      const u = ev.url;
      if (u && /^https?:\/\//i.test(u)) navigate(u);
    };
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-fail-load', onFail);
    wv.addEventListener('page-title-updated', onTitle);
    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);
    wv.addEventListener('new-window', onNewWindow);
    return () => {
      window.clearTimeout(readerTimer);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-fail-load', onFail);
      wv.removeEventListener('page-title-updated', onTitle);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
      wv.removeEventListener('new-window', onNewWindow);
    };
  }, [mode, currentUrl, loadReader, navigate, readerHtml, t, flushStats]);

  // How far the reader has been scrolled — the furthest point counts (audit r2 #13).
  useEffect(() => {
    const el = readerRef.current;
    if (!el || !showReader) return undefined;
    const onScroll = (): void => {
      const pct = immersionScrollPct(el.scrollTop, el.scrollHeight, el.clientHeight);
      if (pct > readPctRef.current) readPctRef.current = pct;
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [showReader, readerHtml]);

  // ----- Reader lookup -----
  const onReaderPointerDown = (e: React.PointerEvent) => noteLookupPointerDown(e);
  const onReaderMouseUp = (e: React.MouseEvent) => {
    const hit = lookupWordFromMouseUp(e);
    if (!hit) {
      if (isLookupClick(e)) setPopup(null);
      return;
    }
    if (hit.translate) {
      setPopup({ kind: 'translate', query: hit.query });
      return;
    }
    setPopup({ kind: 'dict', query: hit.query, x: hit.x, y: hit.y, context: hit.context });
  };

  // ----- Live guest lookup (slice 70) -----
  //
  // Reader Mode looks words up in the host's own DOM (above). The live guest
  // page is a different, untrusted process, so the host cannot reach into it
  // and it cannot be handed the dictionary. Instead the guest preload sends a
  // narrow, enumerated message — text + offset, or text + selection — and the
  // result is resolved and RENDERED HERE, in the host, by the same
  // `wordLookup` module and the same `DictionaryPopup` the Reader uses.
  //
  // Nothing is injected into the guest document: no popup markup to fight the
  // page's CSS or CSP, and no host UI living inside untrusted content.
  const noteGuestAbuse = useCallback(
    (message: string) => {
      if (guestNoticed.current) return;
      guestNoticed.current = true;
      setStatus(message);
    },
    [],
  );

  const onGuestLookupMessage = useCallback(
    (event: Event) => {
      const ev = event as { channel?: string; args?: unknown[] };
      // A guest can only reach the embedder element, and only on this channel.
      // Anything else it tries to say is not listened for at all.
      if (ev.channel !== IMMERSION_LOOKUP_CHANNEL) return;

      if (!guestGate.current.accept(Date.now())) {
        noteGuestAbuse(t('immersion.liveLookupThrottled'));
        return;
      }

      const parsed = validateGuestLookupMessage(ev.args?.[0]);
      if (!parsed.ok) {
        noteGuestAbuse(t('immersion.liveLookupRejected'));
        return;
      }

      // Guest viewport coordinates → host coordinates. The popup is a host
      // element positioned over the webview, so it needs the element's origin.
      const rect = (webviewRef.current as ImmersionWebview | null)?.getBoundingClientRect();
      const hit = lookupHitFromText({
        text: parsed.value.text,
        offset: parsed.value.offset,
        selection: parsed.value.kind === 'selection' ? parsed.value.query : undefined,
        x: (rect?.left ?? 0) + parsed.value.x,
        y: (rect?.top ?? 0) + parsed.value.y,
      });
      if (!hit) return;

      if (hit.translate) {
        setPopup({ kind: 'translate', query: hit.query });
        return;
      }
      setPopup({ kind: 'dict', query: hit.query, x: hit.x, y: hit.y, context: hit.context });
    },
    // No eslint-disable: react-hooks/exhaustive-deps is not a configured rule in
    // this repo, so the directive is itself an ESLint error. `lang`, never `t`:
    // `t`'s identity is stable by design, so depending on it goes silently
    // stale after a language switch instead of erroring (CLAUDE.md §6).
    [lang, noteGuestAbuse],
  );

  useEffect(() => {
    const wv = webviewRef.current as ImmersionWebview | null;
    if (!wv || !showWebview) return;
    const pushConfig = () => {
      try {
        wv.send?.(IMMERSION_CONFIG_CHANNEL, { enabled: liveLookup });
      } catch {
        /* guest not attached yet — dom-ready will push again */
      }
    };
    wv.addEventListener('ipc-message', onGuestLookupMessage);
    wv.addEventListener('dom-ready', pushConfig);
    pushConfig();
    return () => {
      wv.removeEventListener('ipc-message', onGuestLookupMessage);
      wv.removeEventListener('dom-ready', pushConfig);
    };
  }, [showWebview, currentUrl, liveLookup, onGuestLookupMessage]);

  // The tokenizer is what makes a hover land on a word instead of a character
  // run; warm it as soon as live lookup is actually reachable.
  useEffect(() => {
    if (!liveLookup || !showWebview) return;
    void getTokenizer().catch(() => undefined);
  }, [liveLookup, showWebview]);

  // ----- Actions -----
  const bookmarkKey = (url: string): string => immersionStatsId(url);
  const currentBookmark = useMemo(
    () => (currentUrl ? bookmarks.find((b) => bookmarkKey(b.url) === bookmarkKey(currentUrl)) ?? null : null),
    [bookmarks, currentUrl],
  );

  /** Star or unstar the current page — "Save site" had no reverse (audit r2 #12). */
  const saveCurrentSite = async () => {
    if (!currentUrl) return;
    const starred = currentBookmark !== null;
    const res = await window.api.immersionSaveSite({
      url: currentUrl,
      title: activeTitle.current,
      favorite: !starred,
    });
    setStatus(
      res.ok
        ? t(starred ? 'immersion.bookmark.removed' : 'immersion.saved')
        : t('immersion.saveFailed'),
    );
  };

  const updateBookmark = async (
    bookmark: ImmersionBookmark,
    patch: { folderId?: string | null; tags?: string[] },
  ) => {
    const res = await window.api.immersionSaveSite({ url: bookmark.url, favorite: true, ...patch });
    if (!res.ok) setStatus(t('immersion.saveFailed'));
  };

  const removeBookmark = async (bookmark: ImmersionBookmark) => {
    const res = await window.api.immersionSaveSite({ url: bookmark.url, favorite: false });
    setStatus(res.ok ? t('immersion.bookmark.removed') : t('immersion.saveFailed'));
  };

  const addFolder = async (name: string) => {
    if (!name.trim()) return;
    const res = await window.api.immersionAddFolder(name);
    if (!res.ok) setStatus(t('immersion.saveFailed'));
  };

  const removeFolder = async (folder: ImmersionFolder) => {
    const ok = await confirmDialog({
      title: t('immersion.folders.removeTitle'),
      message: t('immersion.folders.removeMessage', { name: folder.name }),
      confirmLabel: t('immersion.remove'),
      danger: true,
    });
    if (!ok) return;
    await window.api.immersionRemoveFolder(folder.id);
  };

  /** Clear history over a time range; bookmarks are a separate list and stay. */
  const clearHistory = async (range: ImmersionHistoryRange) => {
    const ok = await confirmDialog({
      title: t('immersion.history.clearTitle'),
      message: t(`immersion.history.clearMessage.${range}`),
      confirmLabel: t('immersion.history.clear'),
      danger: true,
    });
    if (!ok) return;
    const res = await window.api.immersionClearHistory(range);
    setStatus(res.ok ? t('immersion.history.cleared') : t('immersion.saveFailed'));
  };

  // Save the current page to the Resources app's "My tools" collection.
  const saveCurrentAsTool = async () => {
    if (!currentUrl) return;
    const res = await window.api.toolsAdd({
      url: currentUrl,
      name: activeTitle.current || title,
      source: 'app',
    });
    if (res.ok) {
      setStatus(res.duplicate ? t('immersion.toolAlready') : t('immersion.toolSaved'));
    } else {
      setStatus(res.error ?? t('immersion.saveFailed'));
    }
  };

  const exportToLibrary = async () => {
    if (!readerHtml && mode === 'live') {
      // Try fetch reader extract first
      if (!currentUrl) return;
      try {
        setLoading(true);
        const art = await fetchReadableArticle(currentUrl);
        await window.api.importGenerated({
          title: art.title,
          html: articleBodyHtml(art.title, art.html, art.meta),
          source: art.url,
        });
        void window.api.immersionBumpMetrics({ pagesExported: 1 });
        setStatus(t('immersion.exported'));
      } catch (e) {
        setStatus(e instanceof Error ? e.message : t('immersion.exportFailed'));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!readerHtml) return;
    try {
      await window.api.importGenerated({
        title: activeTitle.current || title,
        html: readerHtml,
        source: currentUrl,
      });
      void window.api.immersionBumpMetrics({ pagesExported: 1 });
      setStatus(t('immersion.exported'));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t('immersion.exportFailed'));
    }
  };

  const captureVideo = async () => {
    if (!currentUrl || !isRemoteMediaUrl(currentUrl)) {
      setStatus(t('immersion.videoCaptureNeedsUrl'));
      return;
    }
    setCaptureBusy(true);
    setStatus(t('immersion.capturing'));
    try {
      const res = await window.api.downloadYouTube(currentUrl, false);
      if ('error' in res && res.error) {
        // `res.error` is main's `Download failed: <yt-dlp's last stderr line>`
        // (`main/media.ts:375`) — an English literal wrapping a raw tool
        // diagnostic. Neither half is a sentence a reader can act on, so the
        // common case gets the product's own words and everything else keeps
        // the detail but inside a translated frame.
        setStatus(isNoVideoCaptureError(res.error)
          ? t('immersion.captureNoVideo')
          : t('immersion.captureFailedDetail', { detail: res.error }));
      } else {
        void window.api.immersionBumpMetrics({ videosCaptured: 1 });
        setStatus(t('immersion.savedToMedia'));
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t('immersion.captureFailed'));
    } finally {
      setCaptureBusy(false);
    }
  };

  const openExternal = () => {
    if (currentUrl) void window.api.openExternal(currentUrl);
  };

  /**
   * The browser half of the shared ReadingLens pipeline, parked exactly the way
   * the manga reader and the visual-novel panel park theirs: the lens is a
   * separate always-on-top window owned by main, so this `localStorage` slot on
   * the shared origin is the only channel between the two renderers.
   *
   * This is the workflow the lens is *most* needed for. A `<webview>` guest is
   * a different frame with its own document, so the reader-mode word lookup and
   * the highlight layer only reach text this renderer extracted — a canvas
   * subtitle, a manga panel served as an image, or a site whose text is
   * inside a plugin are all invisible to it and visible to OCR.
   *
   * Provenance only, no save-back: a browser page is not a store this app owns.
   */
  const captureWithLens = async () => {
    // Refuse before opening the lens rather than parking a target the contract
    // will drop on read — `about:blank` and a `file:` page both land here.
    if (!browserCaptureUrl(currentUrl)) {
      setStatus(t('immersion.lensNeedsPage'));
      return;
    }
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildBrowserCaptureTarget({
      url: currentUrl,
      title: activeTitle.current || title,
    })));
    await window.api.lensOpen('select');
  };

  // ----- Tabs (audit r2 #11) -----
  // Restore the session main kept: the tabs, and the active tab's page.
  useEffect(() => {
    let alive = true;
    void Promise.resolve(window.api.immersionGetSession?.())
      .then((stored) => {
        if (!alive) return;
        const restored = stored && Array.isArray(stored.tabs) && stored.tabs.length ? stored : emptySession();
        setSession(restored);
        setSessionReady(true);
        const active = restored.tabs.find((tab) => tab.id === restored.activeTabId);
        if (active?.url) {
          setNav({ entries: [active.url], index: 0 });
          navigate(active.url, { pushHistory: false, mode: active.mode });
        }
      })
      .catch(() => {
        if (alive) setSessionReady(true);
      });
    return () => {
      alive = false;
    };
    // Once, on mount: a later `navigate` identity must not re-restore the session.
  }, []);

  // Keep the active tab describing the page on screen.
  useEffect(() => {
    if (!sessionReady) return;
    setSession((s) => {
      const tab = s.tabs.find((candidate) => candidate.id === s.activeTabId);
      // Until the page reports its own title, `title` is the url (or the
      // window's name): keep the tab's stored title for the same page, and
      // drop it for a new one so the strip shows the host instead.
      const real = currentUrl && title && title !== currentUrl && title !== 'Immersion' ? title : '';
      const keep = tab && tab.url === currentUrl ? tab.title : '';
      return updateImmersionTab(s, s.activeTabId, { url: currentUrl, title: real || keep, mode });
    });
  }, [sessionReady, currentUrl, title, mode]);

  // Persist, coalesced: a burst of title/url updates is one write.
  useEffect(() => {
    if (!sessionReady) return undefined;
    const timer = window.setTimeout(() => {
      void window.api.immersionSetSession?.(session);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [session, sessionReady]);

  /** Show `tabId`: park the current tab's trail, then load the target's page (or a blank one). */
  const activateTab = useCallback(
    (next: ImmersionSession, tabId: string) => {
      navByTab.current.set(session.activeTabId, nav);
      const target = next.tabs.find((tab) => tab.id === tabId);
      setSession({ ...next, activeTabId: tabId });
      if (!target) return;
      const trail = navByTab.current.get(tabId) ?? {
        entries: target.url ? [target.url] : [],
        index: target.url ? 0 : -1,
      };
      setNav(trail);
      if (target.url) {
        navigate(target.url, { pushHistory: false, mode: target.mode });
      } else {
        closePage();
        setMode(target.mode);
      }
    },
    [session.activeTabId, nav, navigate, closePage],
  );

  const switchTab = useCallback(
    (tabId: string) => {
      if (tabId === session.activeTabId) return;
      activateTab(session, tabId);
    },
    [session, activateTab],
  );

  const newTab = useCallback(() => {
    if (session.tabs.length >= IMMERSION_MAX_TABS) {
      setStatus(t('immersion.tabs.max', { max: IMMERSION_MAX_TABS }));
      return;
    }
    const next = addImmersionTab(session, mode === 'focus' ? 'reader' : mode);
    activateTab(next, next.activeTabId);
    window.setTimeout(() => urlBarRef.current?.focus(), 0);
  }, [session, mode, activateTab, t]);

  const closeTab = useCallback(
    (tabId: string) => {
      navByTab.current.delete(tabId);
      const next = closeImmersionTab(session, tabId);
      if (tabId === session.activeTabId) activateTab(next, next.activeTabId);
      else setSession(next);
    },
    [session, activateTab],
  );

  // Keyboard — rebindable via Settings → Shortcuts; Escape stays local.
  useEffect(() => {
    const offs = [
      registerCommandHandler('immersion.focusUrl', () => {
        urlBarRef.current?.focus();
        urlBarRef.current?.select();
      }),
      registerCommandHandler('immersion.reload', () => {
        reload();
      }),
      registerCommandHandler('immersion.bookmark', () => {
        void saveCurrentSite();
      }),
      registerCommandHandler('immersion.focusMode', () => {
        applyMode('focus');
      }),
      registerCommandHandler('immersion.cycleMode', () => {
        cycleMode();
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      // Tab shortcuts only while THIS browser has focus — the desktop shell
      // hosts other apps in the same window, and Ctrl+W there is theirs.
      const focusedHere = !!rootRef.current && rootRef.current.contains(document.activeElement);
      if (focusedHere && e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 't' && !e.shiftKey) {
          e.preventDefault();
          newTab();
          return;
        }
        if (key === 'w' && !e.shiftKey) {
          e.preventDefault();
          closeTab(session.activeTabId);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          switchTab(cycleImmersionTab(session, e.shiftKey ? -1 : 1));
          return;
        }
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') {
        setPopup(null);
        if (mode === 'focus') applyMode('reader');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey);
    };
  }, [applyMode, cycleMode, currentUrl, mode, newTab, closeTab, switchTab, session]);

  const showRail = railOpen && showChrome;

  return {
    t, MODE_LABELS,
    urlInput, setUrlInput, siteQuery, setSiteQuery, filteredSites,
    currentUrl, title, mode, loading, error, status, setStatus,
    readerHtml, readerHtmlProp,
    sites, sitesStatus, history, histIdx, popup, setPopup,
    bookmarks, filteredBookmarks, folders, railView, setRailView, currentBookmark,
    updateBookmark, removeBookmark, addFolder, removeFolder, clearHistory,
    session, switchTab, newTab, closeTab, rootRef, lang, studyLang,
    captureBusy, railOpen, setRailOpen,
    liveLookup, setLiveLookup,
    showChrome, showReader, showWebview, splitView, showRail,
    readerRef, webviewRef, urlBarRef,
    navigate, goBack, goForward, reload, closePage, applyMode, cycleMode, setMode,
    saveCurrentSite, saveCurrentAsTool, exportToLibrary, captureVideo, openExternal,
    captureWithLens, refreshSites,
    onReaderPointerDown, onReaderMouseUp,
  };
}

export type ImmersionState = ReturnType<typeof useImmersion>;

/**
 * The browser's tabs (audit r2 #11), on the session store main has always kept.
 * Rendered by the host above its toolbar; Ctrl+T / Ctrl+W / Ctrl+Tab work
 * while the browser has focus (see the keyboard effect in `useImmersion`).
 */
export function ImmersionTabStrip({ state }: { state: ImmersionState }) {
  const { t, session } = state;
  const atCap = session.tabs.length >= IMMERSION_MAX_TABS;
  const labelFor = (tab: ImmersionSession['tabs'][number]): string => {
    if (tab.title && tab.title !== 'New tab') return tab.title;
    if (tab.url) {
      try {
        return new URL(tab.url).host;
      } catch {
        return tab.url;
      }
    }
    return t('immersion.tabs.blank');
  };
  return (
    <div className="immersion-tabs lq-hit-scope" role="tablist" aria-label={t('immersion.tabs.label')}>
      {session.tabs.map((tab) => {
        const label = labelFor(tab);
        const active = tab.id === session.activeTabId;
        return (
          <div key={tab.id} className={`immersion-tab${active ? ' active' : ''}`} data-tab={tab.id}>
            <button
              type="button"
              role="tab"
              className="immersion-tab-button"
              aria-selected={active}
              title={tab.url || label}
              onClick={() => state.switchTab(tab.id)}
            >
              {label}
            </button>
            <button
              type="button"
              className="immersion-tab-close"
              aria-label={t('immersion.tabs.close', { title: label })}
              title={t('immersion.tabs.close', { title: label })}
              onClick={() => state.closeTab(tab.id)}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="immersion-tab-new"
        aria-label={t('immersion.tabs.new')}
        title={atCap ? t('immersion.tabs.max', { max: IMMERSION_MAX_TABS }) : t('immersion.tabs.new')}
        disabled={atCap}
        onClick={state.newTab}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

/** Classic (non-aero) toolbar — reused by Study OS's plain path and Blanc. */
/**
 * `trailing` is the host's own controls, rendered INSIDE the toolbar row rather
 * than floated over the canvas beside it.
 *
 * L6's Gate, and the reason it is a slot rather than a fixed button: Study OS's
 * Visual Novel Library shipped as `position: absolute; right: 12px; top: 46px;
 * z-index: 4` on `.immersion-root`, a SIBLING of the reading canvas, so no
 * placement the canvas chose could get out from under it. Measured live at
 * 2026-08-25 through the category-4 harness, both placements broken and the
 * DOCKED one — the default — worse than the sheet:
 *   - sheet, canvas 342 px: button 409,240 136x26 inside a sheet of 215,238
 *     342x469, sitting on its header, `elementFromPoint` at the button's centre
 *     returning the button while the document was `inert`;
 *   - docked, canvas 550 px: button 849,240 136x26 over a rail of 777,238
 *     220x469, overlapping the rail's close control (952,247 32x32) by 32x19,
 *     and `elementFromPoint` at that control's own centre returned `button.btn`
 *     — **the rail's × was not clickable at its centre**, a dead control in the
 *     surface's default state.
 * A host control in the toolbar row cannot collide with a canvas tool at any
 * width, which is why this is a relocation and not a `z-index` or a withdrawal.
 * Blanc passes nothing and is unchanged.
 */
export function ImmersionToolbar({ state, overflow }: { state: ImmersionState; overflow?: ReactNode }) {
  const { t, mode, MODE_LABELS, urlInput, setUrlInput, histIdx, history, showRail, captureBusy, liveLookup } =
    state;
  const noBack = histIdx <= 0;
  const noForward = histIdx < 0 || histIdx >= history.length - 1;
  const noPage = !state.currentUrl;
  const pageActionProps = { disabled: noPage, title: noPage ? t('immersion.reason.noPage') : undefined };
  return (
    /* `lq-hit-scope`: rubric category 1 measured every button in this bar under the 32px
       pointer floor — the icon buttons at 28x24, the mode segments at 25.5. The scope gives
       each one a transparent centred hit region without changing a single rendered box, which
       is the recorded remedy; growing compact chrome is what category 4's dead-region number
       then pays for. The URL input is not covered by it and is fixed on its own box. */
    <div className="immersion-toolbar lq-hit-scope">
      {/* These three are icon-only, so their accessible name came from `title` alone. Back and
          Forward hand `title` over to the disabled REASON — "Back" says what the button does,
          never why it is greyed out — which would have taken the name with it. `aria-label`
          holds the name independently, on all three so the group is consistent. */}
      <button
        type="button"
        className="btn small icon-btn"
        aria-label={t('immersion.back')}
        title={noBack ? t('immersion.reason.noBack') : t('immersion.back')}
        onClick={state.goBack}
        disabled={noBack}
      >
        <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button
        type="button"
        className="btn small icon-btn"
        aria-label={t('immersion.forward')}
        title={noForward ? t('immersion.reason.noForward') : t('immersion.forward')}
        onClick={state.goForward}
        disabled={noForward}
      >
        <Icon name="chevron" size={14} />
      </button>
      <button
        type="button"
        className="btn small icon-btn"
        aria-label={t('immersion.reload')}
        title={noPage ? t('immersion.reason.noPage') : t('immersion.reload')}
        onClick={state.reload}
        disabled={noPage}
      >
        <Icon name="refresh" size={14} />
      </button>
      {/* The URL entry is a form, so §2.3 makes it an Anchor: category 3 measured it live at
          `alpha 0.88 on div.immersion-toolbar`, dense work on the toolbar's glass. `bare` keeps
          the box the toolbar already spaces (it went 186x32 to 186x66 without it), and `raised`
          picks `--panel-2` — the toolbar's OWN base colour — so the fill the field now sits on
          is the colour that was behind it before. Measured conventional delta: rgb(17,28,22) to
          rgb(19,30,23). */}
      <AnchorSurface
        as="form"
        bare
        raised
        className="immersion-url-form"
        onSubmit={(e) => {
          e.preventDefault();
          state.navigate(urlInput);
        }}
      >
        <input
          ref={state.urlBarRef}
          className="immersion-url"
          aria-label={t('immersion.urlPlaceholder')}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={t('immersion.urlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
        />
      </AnchorSurface>
      <div className="immersion-mode-seg" role="group" aria-label={t('immersion.viewMode.ariaLabel')}>
        {IMMERSION_MODE_CYCLE.map((m) => (
          <button
            key={m}
            type="button"
            className={`immersion-mode-btn immersion-mode-btn-${m}${mode === m ? ' active' : ''}`}
            aria-pressed={mode === m}
            title={`${MODE_LABELS[m]}${m === 'focus' ? t('immersion.mode.titleSuffix.focus') : ''}${t(`immersion.mode.titleDesc.${m}`)}`}
            onClick={() => state.applyMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`btn small icon-btn${liveLookup ? ' active' : ''}`}
        aria-pressed={liveLookup}
        title={liveLookup ? t('immersion.liveLookupOn') : t('immersion.liveLookupOff')}
        onClick={() => state.setLiveLookup((v) => !v)}
      >
        <Icon name="dictionary" size={14} />
      </button>
      {/* The trigger for an L6 reading tool, so it reports the tool's state the
          way Captures' and Novels' do: `aria-pressed` rather than a title that
          silently flips between two localised strings. The class is what a test
          selects on — a title is not a safe selector once it is translated.
          It stays in the open for the same reason `+ Import file(s)` did on
          Library: a stateful toggle whose state is only visible once you open a
          menu is a toggle you cannot read. */}
      <button
        type="button"
        className="btn small icon-btn immersion-sites-toggle"
        aria-pressed={showRail}
        title={showRail ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
        onClick={() => state.setRailOpen((v) => !v)}
      >
        <Icon name="folder" size={14} />
      </button>
      {/*
        THE OVERFLOW. Rubric category 5 Q4 scored this surface NO: 23 chrome controls to
        scan in the default state against a bar of 12, with zero disclosures — sixteen of
        them in this one non-wrapping row, thirteen of those icon-only. What stays in the
        open is what a browser keeps in the open: transport, the location field, the view
        mode, the lookup toggle and the rail toggle. What tucks away is every action that
        operates on a page you have already opened.

        Nothing is removed and nothing becomes menu-only — six of the eight are already
        items in this app's own menu bar (`save-site`, `export-library`, `capture-video`,
        `visual-novels`, `open-external`, `close-page` in `ImmersionView`), and the two
        that are not (Save as tool, the lens) are reachable here in one click. That matters
        on the default theme specifically, where `AppChrome` renders bare children and a
        menu-only route would be invisible.

        Labels, not bare glyphs: an icon-only button is legible in a toolbar row where
        position carries meaning, and illegible in a vertical list where it does not.
      */}
      <details className="immersion-overflow">
        <summary className="btn small immersion-overflow-summary" title={t('immersion.moreActions')}>
          {t('immersion.moreActions')}
        </summary>
        <div className="immersion-overflow-body">
          {/* The reverse of opening a page. Without it the starter state — the curated
              destinations and the "open a page to begin" copy — was unreachable once
              anything had loaded, since Back, Forward and Reload all require a page. Same
              disabled-reason shape as its neighbours: `title` explains the greyed-out
              state, `aria-label` keeps the accessible name. */}
          <button
            type="button"
            className="btn small immersion-close-page"
            aria-label={t('immersion.closePage')}
            title={noPage ? t('immersion.reason.noPage') : t('immersion.closePage')}
            onClick={state.closePage}
            disabled={noPage}
          >
            <Icon name="close" size={14} />
            <span>{t('immersion.closePage')}</span>
          </button>
          <button
            type="button"
            className="btn small immersion-bookmark-toggle"
            {...pageActionProps}
            aria-pressed={state.currentBookmark !== null}
            onClick={() => void state.saveCurrentSite()}
          >
            <Icon name="bookmark" size={14} />
            <span>{state.currentBookmark ? t('immersion.bookmark.unstar') : t('immersion.saveSite')}</span>
          </button>
          <button type="button" className="btn small" {...pageActionProps} onClick={() => void state.saveCurrentAsTool()}>
            <Icon name="star" size={14} />
            <span>{t('immersion.saveAsTool')}</span>
          </button>
          <button type="button" className="btn small" {...pageActionProps} onClick={() => void state.exportToLibrary()}>
            <Icon name="download" size={14} />
            <span>{t('immersion.exportToLibrary')}</span>
          </button>
          <button
            type="button"
            className="btn small"
            {...pageActionProps}
            disabled={captureBusy || noPage}
            onClick={() => void state.captureVideo()}
          >
            <Icon name="video" size={14} />
            <span>{t('immersion.captureVideo')}</span>
          </button>
          <button type="button" className="btn small" {...pageActionProps} onClick={() => void state.captureWithLens()}>
            <Icon name="scan" size={14} />
            <span>{t('immersion.lensCapture')}</span>
          </button>
          <button type="button" className="btn small" {...pageActionProps} onClick={state.openExternal}>
            <Icon name="external" size={14} />
            <span>{t('immersion.openInSystemBrowser')}</span>
          </button>
          {overflow}
        </div>
      </details>
    </div>
  );
}

/**
 * Classic stage — banners, empty starters, live webview, and Reader Mode.
 * `stageClassName` lets Study OS append its wired NODE-FEED effect class
 * (`is-tuning`/`is-settle`) onto the `.immersion-stage` element itself; Blanc
 * passes nothing.
 */
export function ImmersionStage({ state, stageClassName }: { state: ImmersionState; stageClassName?: string }) {
  const { t, loading, error, status, currentUrl, splitView, readerHtmlProp } = state;
  const starterButton = (s: (typeof IMMERSION_STARTERS)[number]) => (
    <button
      key={s.url}
      type="button"
      className="btn small"
      /* `navigate` already defaults to the CURRENT mode, and the hook's initial mode is
         'reader' — so pinning it here changed nothing for a new user and silently threw
         away an explicit Live or Focus choice for everyone else. */
      onClick={() => state.navigate(s.url)}
    >
      {t(s.labelKey)}
    </button>
  );
  return (
    <div className={`immersion-stage${splitView ? ' immersion-split' : ''}${stageClassName ? ` ${stageClassName}` : ''}`}>
      {loading && <div className="immersion-banner">{t('immersion.loading')}</div>}
      {error && <div className="immersion-banner error" role="alert">{error}</div>}
      {/*
        The banner below is the ONLY outcome channel the eight overflow actions
        have — Save site, Save as tool, Export to Library, Capture video and the
        lens all report through it and nothing else. It was a bare `div` with an
        `onClick`, so the dismissal was mouse-only and the outcome was never
        announced; Aero's copy of the same banner is already a `button`
        (`ImmersionView.tsx:286`), so this is the classic shell catching up.

        The live region is a separate always-mounted node on purpose. A region
        that mounts together with its first message is not reliably announced —
        the text has to CHANGE inside a region that was already there.
      */}
      <div className="sr-only" role="status" aria-live="polite">{status ?? ''}</div>
      {status && (
        <button type="button" className="immersion-banner status" onClick={() => state.setStatus(null)}>
          {status}
        </button>
      )}

      {!currentUrl && !loading && (
        <div className="immersion-empty">
          <p className="muted">{t('immersion.openPageToBegin')}</p>
          {/*
            Five destinations in four languages, all in one flat row, was the other half of
            category 5 Q4's 23. The split is derived from the starter data — a destination in
            the language this app is about stays in the open, the rest are one click away —
            so it is not a hand-picked "show these two", and adding a Japanese starter
            surfaces it without anyone editing this component.

            The tucked three are not lost: `ImmersionView`'s Sites menu lists all five, and
            the disclosure's reverse transition is the same click that opened it.
          */}
          <div className="immersion-starters">
            {IMMERSION_STARTERS.filter((s) => s.lang === state.studyLang).map(starterButton)}
          </div>
          {IMMERSION_STARTERS.some((s) => s.lang !== state.studyLang) && (
            <details className="immersion-starters-more">
              <summary className="immersion-starters-summary">{t('immersion.moreDestinations')}</summary>
              <div className="immersion-starters">
                {IMMERSION_STARTERS.filter((s) => s.lang !== state.studyLang).map(starterButton)}
              </div>
            </details>
          )}
          <p className="muted immersion-hint">{t('immersion.hint')}</p>
        </div>
      )}

      {state.showWebview &&
        createWebview(currentUrl, (el) => {
          state.webviewRef.current = el;
        })}

      {state.showReader && readerHtmlProp && (
        <div
          ref={state.readerRef}
          className={`immersion-reader wk-on${splitView ? ' immersion-split-reader' : ''}`}
          onPointerDown={state.onReaderPointerDown}
          data-dict-owner=""
          onMouseUp={state.onReaderMouseUp}
          dangerouslySetInnerHTML={readerHtmlProp}
        />
      )}
    </div>
  );
}

/**
 * One site row's slot, in px, gap included.
 *
 * `VirtualList` is FIXED-height, so this number has to be the row's height, not
 * an estimate of it — 883 rows at one pixel out is 883px of cumulative drift.
 * Measured live on a real profile at `.immersion-site-card`'s shipped box:
 * 1 border + 8 padding + 16 title + 2 gap + 15 meta + 6 padding + 1 border = 49,
 * plus the 4px the `<li>` used to contribute as `margin-bottom` and which the
 * slot now owns (VirtualList renders each row in its own fixed slot, not as a
 * flex child — the same note `FlashcardsContent`'s CARD_ROW_HEIGHT carries).
 *
 * Two things made the shipped row NON-deterministic, and both are fixed in
 * `styles.css` rather than papered over here:
 *   • `line-height: normal` on the title. 879 of 883 rows measured 49px; the
 *     other four measured 50 and 51 because titles containing `(`, `[` and `․`
 *     fall back to a font with a taller line box. Pinned to 16px/15px — exactly
 *     what the 879 already computed to, so nothing moves for them.
 *   • the completion bar, `margin-top: 4 + height: 2`, added 6px in flow to any
 *     row that had progress. It is now absolutely positioned inside the card's
 *     existing 6px bottom padding, same 4px gap below the meta line, so the row
 *     is 49px whether the bar renders or not. NOTE: 0 of 883 sites in the
 *     measured profile have `completionPct > 0`, so that branch was verified in
 *     JSDOM, not live — its absence there is not evidence it is dead.
 */
export const IMMERSION_SITE_ROW_HEIGHT = 53;

/**
 * Shared by the classic/Blanc rail and Aero's own rail. Failed reads retain
 * any sites already shown and must never claim the saved library is empty.
 *
 * `messageClassName` is how Aero keeps its own rail typography without this
 * component knowing a shell's tokens — the same seam `ImmersionStage` uses for
 * `stageClassName`. It is the ONLY status line either rail renders: a caller
 * that also keeps its own `sites.length === 0` paragraph prints the empty
 * message twice, and prints it *under* "Loading…" while the read is still in
 * flight, which is the contradiction this component exists to remove.
 */
export function ImmersionSitesStatus(
  { state, messageClassName = 'immersion-rail-empty' }:
  { state: ImmersionState; messageClassName?: string },
) {
  const { t, sites, sitesStatus, refreshSites } = state;
  if (sitesStatus === 'loading') {
    // Sites already on screen are the better answer than a spinner over them:
    // only an empty rail has nothing to show while a refresh is running.
    return sites.length === 0
      ? <p className={messageClassName} role="status">{t('common.loading')}</p>
      : null;
  }
  if (sitesStatus === 'error') {
    return (
      <div className="immersion-sites-error">
        <p className={messageClassName} role="alert">{t('immersion.rail.loadFailed')}</p>
        <button type="button" className="btn btn-sm lq-hit" onClick={() => void refreshSites()}>
          {t('immersion.rail.retry')}
        </button>
      </div>
    );
  }
  return sites.length === 0
    ? <p className={`muted ${messageClassName}`} role="status">{t('immersion.rail.empty')}</p>
    : null;
}

/**
 * The saved-sites rail, as the CONTENT of an L6 reading tool.
 *
 * No `<aside>` and no head of its own: `ReadingCanvas` renders both, and a
 * migration that keeps its own panel header ends up with two stacked headings —
 * the exact thing `ReadingCanvasTool.actions` warns about.
 *
 * Windowed since 2026-08-25: the rail is a real collection, not a shortlist.
 * Measured 883 saved sites laying out to 46,822px inside a 418px viewport —
 * 112x overdraw and 6,182 elements — with every row in the DOM.
 */
/** Local search stays in the shared hook so a dock/sheet reflow keeps the draft. */
export function ImmersionSiteSearch({ state }: { state: ImmersionState }) {
  const { t, siteQuery, setSiteQuery, sites, filteredSites } = state;
  if (sites.length === 0) return null;
  return (
    <>
      <AnchorSurface as="label" className="immersion-site-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={siteQuery}
          onChange={(event) => setSiteQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && siteQuery) {
              event.preventDefault();
              event.stopPropagation();
              setSiteQuery('');
            }
          }}
          aria-label={t('immersion.rail.search')}
          placeholder={t('immersion.rail.search')}
        />
      </AnchorSurface>
      {filteredSites.length === 0 && (
        <p className="immersion-rail-empty" role="status">{t('immersion.rail.noMatches')}</p>
      )}
    </>
  );
}

/**
 * Today's immersion totals — the metrics main has always counted and nothing
 * read (audit r2 #14): reading time, characters, pages exported, videos
 * captured, plus the last seven days' reading time.
 */
export function ImmersionStatsCard({ state }: { state: ImmersionState }) {
  const { t, lang } = state;
  const [today, setToday] = useState<ImmersionDayMetrics | null>(null);
  const [weekSeconds, setWeekSeconds] = useState(0);
  useEffect(() => {
    let alive = true;
    const weekOf = (all: Record<string, ImmersionDayMetrics>): number => {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return Object.entries(all).reduce((sum, [day, m]) => {
        const at = new Date(`${day}T12:00:00`).getTime();
        return at >= since ? sum + (m?.seconds ?? 0) : sum;
      }, 0);
    };
    void Promise.resolve(window.api.immersionGetMetrics?.())
      .then((res) => {
        if (!alive || !res) return;
        setToday(res.today);
        setWeekSeconds(weekOf(res.all ?? {}));
      })
      .catch(() => undefined);
    const off = window.api.onImmersionMetricsChanged?.((p) => {
      setToday(p.metrics);
      setWeekSeconds(weekOf(p.all ?? {}));
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  if (!today) return null;
  const nf = new Intl.NumberFormat(LANG_TAGS[lang]);
  const minutes = (s: number) => nf.format(Math.round(s / 60));
  return (
    <div className="immersion-stats-card" aria-label={t('immersion.stats.label')}>
      <p className="immersion-stats-line">
        {t('immersion.stats.today', { minutes: minutes(today.seconds), chars: nf.format(today.chars) })}
      </p>
      <p className="immersion-stats-line muted">
        {t('immersion.stats.pages', {
          pages: nf.format(today.pagesExported),
          videos: nf.format(today.videosCaptured),
        })}
      </p>
      <p className="immersion-stats-line muted">{t('immersion.stats.week', { minutes: minutes(weekSeconds) })}</p>
    </div>
  );
}

/** Bookmarks, with folders and tags — the pages the user chose to keep (audit r2 #12). */
function ImmersionBookmarkList({ state }: { state: ImmersionState }) {
  const { t, filteredBookmarks, folders, bookmarks } = state;
  const [folderFilter, setFolderFilter] = useState<string>('');
  const [editing, setEditing] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState('');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const shown = folderFilter
    ? filteredBookmarks.filter((b) => (folderFilter === '-' ? !b.folderId : b.folderId === folderFilter))
    : filteredBookmarks;
  return (
    <div className="immersion-bookmarks lq-hit-scope">
      <div className="immersion-folder-row" role="group" aria-label={t('immersion.folders.label')}>
        <select
          className="immersion-folder-filter"
          aria-label={t('immersion.folders.filter')}
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
        >
          <option value="">{t('immersion.folders.all')}</option>
          <option value="-">{t('immersion.folders.unfiled')}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {newFolder === null ? (
          <button type="button" className="btn small" onClick={() => setNewFolder('')}>
            {t('immersion.folders.new')}
          </button>
        ) : (
          <form
            className="immersion-folder-new"
            onSubmit={(e) => {
              e.preventDefault();
              void state.addFolder(newFolder);
              setNewFolder(null);
            }}
          >
            <input
              autoFocus
              value={newFolder}
              aria-label={t('immersion.folders.name')}
              placeholder={t('immersion.folders.name')}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNewFolder(null);
              }}
            />
          </form>
        )}
        {folderFilter && folderFilter !== '-' ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const folder = folders.find((f) => f.id === folderFilter);
              if (folder) void state.removeFolder(folder).then(() => setFolderFilter(''));
            }}
          >
            {t('immersion.folders.remove')}
          </button>
        ) : null}
      </div>
      {bookmarks.length === 0 ? (
        <p className="muted immersion-rail-empty" role="status">{t('immersion.bookmarks.empty')}</p>
      ) : null}
      <ul className="immersion-bookmark-list">
        {shown.map((b) => (
          <li key={b.id} className="immersion-bookmark-row" data-bookmark={b.id}>
            <button type="button" className="immersion-site-card" onClick={() => state.navigate(b.url)} title={b.url}>
              <span className="immersion-site-title">
                <Icon name="star" size={11} className="immersion-site-fav" fill />
                {b.title}
              </span>
              <span className="immersion-site-meta muted">
                {b.lang !== 'auto' ? `${b.lang.toUpperCase()} · ` : ''}
                {folders.find((f) => f.id === b.folderId)?.name ?? t('immersion.folders.unfiled')}
                {b.tags.length ? ` · ${b.tags.map((tag) => `#${tag}`).join(' ')}` : ''}
              </span>
            </button>
            <button
              type="button"
              className="immersion-site-remove"
              title={t('immersion.bookmark.edit')}
              aria-label={`${t('immersion.bookmark.edit')} — ${b.title}`}
              aria-expanded={editing === b.id}
              onClick={() => {
                setEditing(editing === b.id ? null : b.id);
                setTagsDraft(b.tags.join(', '));
              }}
            >
              <Icon name="edit" size={12} />
            </button>
            <button
              type="button"
              className="immersion-site-remove immersion-bookmark-unstar"
              title={t('immersion.bookmark.unstar')}
              aria-label={`${t('immersion.bookmark.unstar')} — ${b.title}`}
              onClick={() => void state.removeBookmark(b)}
            >
              <Icon name="close" size={12} />
            </button>
            {editing === b.id ? (
              <form
                className="immersion-bookmark-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void state.updateBookmark(b, { tags: tagsDraft.split(',').map((tag) => tag.trim()).filter(Boolean) });
                  setEditing(null);
                }}
              >
                <label>
                  <span>{t('immersion.bookmark.folder')}</span>
                  <select
                    value={b.folderId ?? ''}
                    onChange={(e) => void state.updateBookmark(b, { folderId: e.target.value || null })}
                  >
                    <option value="">{t('immersion.folders.unfiled')}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('immersion.bookmark.tags')}</span>
                  <input value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} />
                </label>
                <button type="submit" className="btn small">{t('immersion.bookmark.save')}</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** History, newest first, with a time-ranged Clear (audit r2 #12). */
function ImmersionHistoryControls({ state }: { state: ImmersionState }) {
  const { t, sites } = state;
  const [range, setRange] = useState<ImmersionHistoryRange>('hour');
  if (sites.length === 0) return null;
  return (
    <div className="immersion-history-clear">
      <select
        aria-label={t('immersion.history.range')}
        value={range}
        onChange={(e) => setRange(e.target.value as ImmersionHistoryRange)}
      >
        {IMMERSION_HISTORY_RANGES.map((r) => (
          <option key={r} value={r}>
            {t(`immersion.history.range.${r}`)}
          </option>
        ))}
      </select>
      <button type="button" className="btn small" onClick={() => void state.clearHistory(range)}>
        {t('immersion.history.clear')}
      </button>
    </div>
  );
}

export function ImmersionSiteList({ state }: { state: ImmersionState }) {
  // `sites` is deliberately not read here any more: the rail's empty/loading/error
  // copy belongs to `ImmersionSitesStatus`, which is the only thing allowed to
  // describe the saved library's state.
  const { t, currentUrl, filteredSites, siteQuery, railView } = state;
  return (
    <div className="immersion-rail">
      <ImmersionStatsCard state={state} />
      <div className="immersion-rail-views" role="tablist" aria-label={t('immersion.sites')}>
        {(['bookmarks', 'history'] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            className={`immersion-rail-view${railView === view ? ' active' : ''}`}
            aria-selected={railView === view}
            data-view={view}
            onClick={() => state.setRailView(view)}
          >
            {t(`immersion.rail.view.${view}`)}
          </button>
        ))}
      </div>
      <ImmersionSiteSearch state={state} />
      {railView === 'bookmarks' ? (
        <ImmersionBookmarkList state={state} />
      ) : (
        <>
      <ImmersionHistoryControls state={state} />
      <ImmersionSitesStatus state={state} />
      <VirtualList
        /* Was `key={normalizedQuery}`, which reset the scroll offset by REMOUNTING the
           scroller and every windowed row on every keystroke. `resetScrollKey` is the
           same behaviour in place — see the prop's own note for the measurement. */
        resetScrollKey={siteQuery.trim().normalize('NFKC').toLowerCase()}
        items={filteredSites}
        itemHeight={IMMERSION_SITE_ROW_HEIGHT}
        /* `lq-hit-scope` on the list, not on 20 identical rows: the remove button renders
           20x49, so it is under the floor on the x axis alone and every row repeats it. */
        className="immersion-site-list lq-hit-scope"
        listRole="list"
        itemRole="listitem"
        getKey={(s) => s.id}
        renderItem={(s) => (
          <div className="immersion-site-row">
            <button type="button" className="immersion-site-card" onClick={() => state.navigate(s.url)} title={s.url}>
              <span className="immersion-site-title">
                {state.bookmarks.some((b) => immersionStatsId(b.url) === immersionStatsId(s.url)) && (
                  <Icon name="star" size={11} className="immersion-site-fav" fill />
                )}
                {s.title}
              </span>
              <span className="immersion-site-meta muted">
                {s.lang !== 'auto' ? s.lang.toUpperCase() + ' · ' : ''}
                {t('immersion.visitsCount', { count: s.visitCount })}
                {s.streakDays > 0 ? ` · ${t('immersion.streakDays', { days: s.streakDays })}` : ''}
              </span>
              {s.completionPct > 0 && (
                <span className="immersion-site-bar">
                  <span style={{ width: `${s.completionPct}%` }} />
                </span>
              )}
            </button>
            <button
              type="button"
              className="immersion-site-remove"
              title={t('immersion.remove')}
              /* Every row's visible control is the same glyph, so the title alone makes
                 all ~1,200 of them announce one word. The name is composed rather than
                 given a new key: the verb is already translated and the site title is
                 the user's own text. */
              aria-label={`${t('immersion.remove')} — ${s.title}`}
              onClick={() => void removeImmersionSiteWithConfirm(s)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
      />
        </>
      )}
      {/*
       * The curated destinations, in the rail, and ONLY once a page is open.
       *
       * Measured: `IMMERSION_STARTERS` had exactly two routes — `ImmersionStage`'s
       * empty state and `ImmersionView`'s aero Sites menu — and the empty state is
       * by definition gone the moment a page loads. So on the surface this rail
       * belongs to, the five destinations were reachable only by CLOSING the page
       * you were reading, which discards the current page's extraction. Putting
       * them here makes the route non-destructive, and the `currentUrl` guard is
       * what keeps them from rendering twice: with no page open the stage already
       * shows them, larger and with its own disclosure split.
       *
       * This is also the honest fill for category 4's dead region on this surface.
       * The rail is a fixed 220px column whose one saved-site row left 572px of it
       * empty at maximize (15.6% dead against a 15 bar). `cat4-use-of-space.cjs`
       * marks coverage from text nodes and interactive elements, so a panel's own
       * background marks nothing — only real content moves that number.
       */}
      {currentUrl && (
        <div className="immersion-rail-destinations lq-hit-scope">
          <h4 className="immersion-rail-destinations-head">{t('immersion.rail.destinations')}</h4>
          <ul className="immersion-rail-destination-list">
            {IMMERSION_STARTERS.map((s) => (
              <li key={s.url}>
                <button
                  type="button"
                  className="immersion-rail-destination"
                  title={s.url}
                  /* Same as the empty state's starters: keep the mode the user chose. */
                  onClick={() => state.navigate(s.url)}
                >
                  <span className="immersion-rail-destination-label">{t(s.labelKey)}</span>
                  {s.lang !== 'auto' && (
                    <span className="immersion-rail-destination-lang muted">{s.lang.toUpperCase()}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * L6 — the immersion body as a reading canvas.
 *
 * ## The defect
 *
 * `.immersion-rail` was `width: 220px; flex-shrink: 0` beside a `flex: 1` stage,
 * with NO responsive rule at all — not even a media query that could have fired.
 * The rail is the browser's saved-sites list, so it renders in the Reading
 * Finder's pane, in Blanc's `blanc-tool-detail`, and in pop-outs. At a 500px body
 * the stage was left 280px, below the 384 floor the rest of L6 holds; the article
 * inside it then reflowed to roughly 16 characters a line and nothing anywhere
 * reported a problem. `flex-shrink: 0` is what makes it unconditional: the rail
 * takes its 220 first and the document absorbs the whole shortfall.
 *
 * ## What replaces it
 *
 * The canvas measures its OWN box, so the rail docks while the stage can still
 * keep 384 and becomes a dismissible sheet below that. Dismissal is not a new
 * affordance: the sheet's close is `setRailOpen(false)`, the same state the
 * toolbar's folder button toggles, so the reverse transition already existed and
 * still works from either control.
 *
 * FILL policy, not the prose default. The document here is the STAGE, and in
 * `live` mode the stage is a `<webview>` whose guest lays itself out; clamping it
 * to 760px would letterbox a real browser. Reader Mode brings its own measure —
 * `.immersion-reader` is `max-width: 42rem; margin: 0 auto` — so the prose half of
 * the Gate is already owned one level down, by the element that renders the prose.
 *
 * WHAT DELIBERATELY DID NOT MOVE: the live `<webview>` stays inside
 * `ImmersionStage`. An Electron `<webview>` that changes DOM parent is destroyed
 * and its guest reloaded, and the live-lookup listener bound at the `ipc-message`
 * effect below keys off `[showWebview, currentUrl, liveLookup, ...]` — none of
 * which change on a mode switch — so it would silently stay bound to the dead
 * element and live lookup would die without a message. The split-view pane's own
 * geometry is a separate slice for that reason.
 */
export function ImmersionBody({
  state,
  stageClassName,
}: {
  state: ImmersionState;
  stageClassName?: string;
}) {
  const { t, showRail } = state;
  const tools: ReadingCanvasTool[] = showRail
    ? [
        {
          id: 'sites',
          label: t('immersion.sites'),
          // 180 is where a site card's meta line ("12 visits · 3d streak") stops
          // fitting on one row; 220 is the width the rail actually shipped at.
          minWidth: 180,
          preferredWidth: 220,
          onClose: () => state.setRailOpen(false),
          content: <ImmersionSiteList state={state} />,
        },
      ]
    : [];
  return (
    <ReadingCanvas
      className="immersion-body"
      tools={tools}
      closeLabel={t('immersion.hideLibrary')}
      policy={READING_CANVAS_FILL_POLICY}
    >
      <ImmersionStage state={state} stageClassName={stageClassName} />
    </ReadingCanvas>
  );
}

/** Dictionary / sentence-translate popups, shared by every immersion surface. */
export function ImmersionPopups({ state }: { state: ImmersionState }) {
  const { popup } = state;
  return (
    <>
      {popup?.kind === 'dict' && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          context={popup.context}
          onClose={() => state.setPopup(null)}
        />
      )}
      {popup?.kind === 'translate' && (
        <SentenceTranslatePopup text={popup.query} onClose={() => state.setPopup(null)} />
      )}
    </>
  );
}
