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
  IMMERSION_MODE_CYCLE,
  IMMERSION_STARTERS,
  immersionStatsId,
  isRemoteMediaUrl,
  nextImmersionMode,
  normalizeImmersionUrl,
  shouldUseLiveImmersionMode,
  type ImmersionMode,
  type ImmersionSite,
  type ImmersionSitesStore,
} from '../../../shared/immersion';
import {
  buildBrowserCaptureTarget,
  browserCaptureUrl,
  LENS_CAPTURE_TARGET_KEY,
} from '../../../shared/lensCaptureTarget';
import { isNhkNewsArticleUrl, nhkArticleLooksHydrated } from '../../../shared/nhkArticle';
import { READING_CANVAS_FILL_POLICY } from '../../../shared/liquidReadingCanvas';
import { ReadingCanvas, type ReadingCanvasTool } from '../liquid/ReadingCanvas';
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
  const [sites, setSites] = useState<ImmersionSite[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [popup, setPopup] = useState<PopupState>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  /** Slice 70: study lookup on the LIVE guest page, not just Reader Mode. */
  const [liveLookup, setLiveLookup] = useState(true);

  const readerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);
  const urlBarRef = useRef<HTMLInputElement>(null);
  const secondsAcc = useRef(0);
  const charsAcc = useRef(0);
  const activeStatsId = useRef('');
  const activeTitle = useRef('Immersion');
  const pageOpenAt = useRef(Date.now());
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
  const refreshSites = useCallback(async () => {
    try {
      const store: ImmersionSitesStore = await window.api.immersionListSites();
      setSites(
        [...store.sites].sort(
          (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.lastVisited - a.lastVisited,
        ),
      );
    } catch {
      /* IPC not ready */
    }
  }, []);

  useEffect(() => {
    void refreshSites();
    return window.api.onImmersionSitesChanged((store) => {
      setSites(
        [...store.sites].sort(
          (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.lastVisited - a.lastVisited,
        ),
      );
    });
  }, [refreshSites]);

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
      void window.api.immersionRecordVisit({
        url: currentUrl,
        title: activeTitle.current,
        seconds: secs,
        chars,
      });
    }
  }, [currentUrl]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - pageOpenAt.current) / 1000;
      pageOpenAt.current = Date.now();
      if (elapsed > 0 && elapsed < 120 && currentUrl) {
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
    const apply = () => {
      resetHighlightRoot(root);
      highlightEl(root, true);
    };
    if (tokenizerReady()) apply();
    else void getTokenizer().then(apply).catch(() => undefined);
  }, [readerHtml]);

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
        try {
          const next = await fetchReadableArticle(url, webviewRef.current);
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
      void window.api.immersionRecordVisit({ url: art.url, title: art.title });
      setLoading(false);
    } catch (e) {
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
      // §5.13: route cue on node navigation (cue exists only in the wired pack).
      if (document.documentElement.getAttribute('data-materials') === 'wired') {
        window.dispatchEvent(new CustomEvent('wired:route'));
      }
      flushStats();
      pageOpenAt.current = Date.now();
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
        setHistory((h) => {
          const base = histIdx >= 0 ? h.slice(0, histIdx + 1) : h;
          if (base[base.length - 1] === url) return base;
          const next = [...base, url].slice(-40);
          setHistIdx(next.length - 1);
          return next;
        });
      }

      if (nextMode === 'reader' || nextMode === 'focus') {
        setLoading(true);
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
    [flushStats, histIdx, loadReader, mode],
  );

  const goBack = () => {
    if (histIdx <= 0) return;
    const i = histIdx - 1;
    setHistIdx(i);
    navigate(history[i], { pushHistory: false });
  };
  const goForward = () => {
    if (histIdx < 0 || histIdx >= history.length - 1) return;
    const i = histIdx + 1;
    setHistIdx(i);
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
    const onStart = () => setLoading(true);
    const onStop = () => {
      setLoading(false);
      if ((mode === 'reader' || mode === 'focus') && currentUrl) {
        const delay = isNhkNewsArticleUrl(currentUrl) ? 1200 : 400;
        window.setTimeout(() => void loadReader(currentUrl), delay);
      }
    };
    const onFail = () => {
      setLoading(false);
      setError(t('immersion.pageLoadFailed'));
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
        setCurrentUrl(u);
        setUrlInput(u);
        activeStatsId.current = immersionStatsId(u);
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
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-fail-load', onFail);
      wv.removeEventListener('page-title-updated', onTitle);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
      wv.removeEventListener('new-window', onNewWindow);
    };
  }, [mode, currentUrl, loadReader, navigate, readerHtml, t]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang`, never `t`:
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
  const saveCurrentSite = async () => {
    if (!currentUrl) return;
    const res = await window.api.immersionSaveSite({
      url: currentUrl,
      title: activeTitle.current,
      favorite: true,
    });
    setStatus(res.ok ? t('immersion.saved') : res.error ?? t('immersion.saveFailed'));
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
        setStatus(res.error);
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
  }, [applyMode, cycleMode, currentUrl, mode]);

  const showRail = railOpen && showChrome;

  return {
    t, MODE_LABELS,
    urlInput, setUrlInput,
    currentUrl, title, mode, loading, error, status, setStatus,
    readerHtml, readerHtmlProp,
    sites, history, histIdx, popup, setPopup,
    captureBusy, railOpen, setRailOpen,
    liveLookup, setLiveLookup,
    showChrome, showReader, showWebview, splitView, showRail,
    readerRef, webviewRef, urlBarRef,
    navigate, goBack, goForward, reload, applyMode, cycleMode, setMode,
    saveCurrentSite, saveCurrentAsTool, exportToLibrary, captureVideo, openExternal,
    captureWithLens, refreshSites,
    onReaderPointerDown, onReaderMouseUp,
  };
}

export type ImmersionState = ReturnType<typeof useImmersion>;

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
export function ImmersionToolbar({ state, trailing }: { state: ImmersionState; trailing?: ReactNode }) {
  const { t, mode, MODE_LABELS, urlInput, setUrlInput, histIdx, history, showRail, captureBusy, liveLookup } =
    state;
  return (
    /* `lq-hit-scope`: rubric category 1 measured every button in this bar under the 32px
       pointer floor — the icon buttons at 28x24, the mode segments at 25.5. The scope gives
       each one a transparent centred hit region without changing a single rendered box, which
       is the recorded remedy; growing compact chrome is what category 4's dead-region number
       then pays for. The URL input is not covered by it and is fixed on its own box. */
    <div className="immersion-toolbar lq-hit-scope">
      <button type="button" className="btn small icon-btn" title={t('immersion.back')} onClick={state.goBack} disabled={histIdx <= 0}>
        <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button
        type="button"
        className="btn small icon-btn"
        title={t('immersion.forward')}
        onClick={state.goForward}
        disabled={histIdx < 0 || histIdx >= history.length - 1}
      >
        <Icon name="chevron" size={14} />
      </button>
      <button type="button" className="btn small icon-btn" title={t('immersion.reload')} onClick={state.reload}>
        <Icon name="refresh" size={14} />
      </button>
      <form
        className="immersion-url-form"
        onSubmit={(e) => {
          e.preventDefault();
          state.navigate(urlInput);
        }}
      >
        <input
          ref={state.urlBarRef}
          className="immersion-url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={t('immersion.urlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
        />
      </form>
      <div className="immersion-mode-seg" role="group" aria-label={t('immersion.viewMode.ariaLabel')}>
        {IMMERSION_MODE_CYCLE.map((m) => (
          <button
            key={m}
            type="button"
            className={`immersion-mode-btn immersion-mode-btn-${m}${mode === m ? ' active' : ''}`}
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
      <button type="button" className="btn small icon-btn" title={t('immersion.saveSite')} onClick={() => void state.saveCurrentSite()}>
        <Icon name="bookmark" size={14} />
      </button>
      <button type="button" className="btn small icon-btn" title={t('immersion.saveAsTool')} onClick={() => void state.saveCurrentAsTool()}>
        <Icon name="star" size={14} />
      </button>
      <button type="button" className="btn small icon-btn" title={t('immersion.exportToLibrary')} onClick={() => void state.exportToLibrary()}>
        <Icon name="download" size={14} />
      </button>
      <button
        type="button"
        className="btn small icon-btn"
        title={t('immersion.captureVideo')}
        disabled={captureBusy}
        onClick={() => void state.captureVideo()}
      >
        <Icon name="video" size={14} />
      </button>
      <button
        type="button"
        className="btn small icon-btn"
        title={t('immersion.lensCapture')}
        onClick={() => void state.captureWithLens()}
      >
        <Icon name="scan" size={14} />
      </button>
      <button type="button" className="btn small icon-btn" title={t('immersion.openInSystemBrowser')} onClick={state.openExternal}>
        <Icon name="external" size={14} />
      </button>
      {/* The trigger for an L6 reading tool, so it reports the tool's state the
          way Captures' and Novels' do: `aria-pressed` rather than a title that
          silently flips between two localised strings. The class is what a test
          selects on — a title is not a safe selector once it is translated. */}
      <button
        type="button"
        className="btn small icon-btn immersion-sites-toggle"
        aria-pressed={showRail}
        title={showRail ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
        onClick={() => state.setRailOpen((v) => !v)}
      >
        <Icon name="folder" size={14} />
      </button>
      {trailing}
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
  return (
    <div className={`immersion-stage${splitView ? ' immersion-split' : ''}${stageClassName ? ` ${stageClassName}` : ''}`}>
      {loading && <div className="immersion-banner">{t('immersion.loading')}</div>}
      {error && <div className="immersion-banner error">{error}</div>}
      {status && (
        <div className="immersion-banner status" onClick={() => state.setStatus(null)}>
          {status}
        </div>
      )}

      {!currentUrl && !loading && (
        <div className="immersion-empty">
          <p className="muted">{t('immersion.openPageToBegin')}</p>
          <div className="immersion-starters">
            {IMMERSION_STARTERS.map((s) => (
              <button
                key={s.url}
                type="button"
                className="btn small"
                onClick={() => {
                  state.setMode('reader');
                  state.navigate(s.url, { mode: 'reader' });
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
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
export function ImmersionSiteList({ state }: { state: ImmersionState }) {
  const { t, sites } = state;
  return (
    <div className="immersion-rail">
      {sites.length === 0 && <p className="muted immersion-rail-empty">{t('immersion.rail.empty')}</p>}
      <VirtualList
        items={sites}
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
                {s.favorite && <Icon name="star" size={11} className="immersion-site-fav" fill />}
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
              onClick={() => void window.api.immersionRemoveSite(s.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
      />
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
