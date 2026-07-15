// Immersion Browser panel — live guest + Reader Mode, sites rail, dict popup.
// Feeds existing stats / knownWords; does not touch tracking widgets.

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DictionaryPopup from '../components/DictionaryPopup';
import SentenceTranslatePopup from '../components/SentenceTranslatePopup';
import Icon from '../components/Icons';
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
} from '../../shared/immersion';
import { isNhkNewsArticleUrl, nhkArticleLooksHydrated } from '../../shared/nhkArticle';
import { articleBodyHtml, fetchReadableArticle } from '../wikiArticle';
import {
  clearLookupHighlight,
  isLookupClick,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
} from '../wordLookup';
import { highlightEl, recolorEl, resetHighlightRoot, WK_HIGHLIGHT_CSS } from '../wordHighlight';
import { recordReading } from '../stats';
import { getTokenizer, tokenizerReady } from '../tokenizer';
import { onKnowledgeChanged } from '../knownWords';
import { registerCommandHandler } from '../keyboardShortcuts';
import { useT } from '../i18n';

type PopupState =
  | { kind: 'dict'; query: string; x: number; y: number; context?: string }
  | { kind: 'translate'; query: string }
  | null;

const STATS_FLUSH_MS = 5000;

/** Electron <webview> is not in React's DOM typings; create via createElement. */
function createWebview(src: string, setRef: (el: HTMLElement | null) => void) {
  return createElement('webview', {
    ref: setRef,
    className: 'immersion-webview',
    src,
    partition: 'persist:immersion',
    allowpopups: 'true',
    style: { width: '100%', height: '100%', display: 'flex' },
  } as Record<string, unknown>);
}

function ensureProtocol(raw: string): string {
  const n = normalizeImmersionUrl(raw);
  if (n) return n;
  // Treat as search fallback
  const q = raw.trim();
  if (!q) return '';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export default function ImmersionView() {
  const { t } = useT();
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

  const readerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);
  const urlBarRef = useRef<HTMLInputElement>(null);
  const secondsAcc = useRef(0);
  const charsAcc = useRef(0);
  const activeStatsId = useRef('');
  const activeTitle = useRef('Immersion');
  const pageOpenAt = useRef(Date.now());

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
    const t = window.setTimeout(runHighlight, 40);
    return () => window.clearTimeout(t);
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
      flushStats();
      pageOpenAt.current = Date.now();
      setCurrentUrl(url);
      setUrlInput(url);
      activeStatsId.current = immersionStatsId(url);
      activeTitle.current = url;
      setTitle(url);
      setPopup(null);
      clearLookupHighlight();

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
      const t = (e as { title?: string }).title;
      if (t) {
        setTitle(t);
        activeTitle.current = t;
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
  }, [mode, currentUrl, loadReader, navigate, readerHtml]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyMode, cycleMode, currentUrl, mode]);

  const showRail = railOpen && showChrome;

  return (
    <div className={`immersion-root immersion-mode-${mode}`} data-mode={mode}>
      {showChrome && (
        <div className="immersion-toolbar">
          <button type="button" className="btn small icon-btn" title={t('immersion.back')} onClick={goBack} disabled={histIdx <= 0}>
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button
            type="button"
            className="btn small icon-btn"
            title={t('immersion.forward')}
            onClick={goForward}
            disabled={histIdx < 0 || histIdx >= history.length - 1}
          >
            <Icon name="chevron" size={14} />
          </button>
          <button type="button" className="btn small icon-btn" title={t('immersion.reload')} onClick={reload}>
            <Icon name="refresh" size={14} />
          </button>
          <form
            className="immersion-url-form"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(urlInput);
            }}
          >
            <input
              ref={urlBarRef}
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
                onClick={() => applyMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <button type="button" className="btn small icon-btn" title={t('immersion.saveSite')} onClick={() => void saveCurrentSite()}>
            <Icon name="bookmark" size={14} />
          </button>
          <button type="button" className="btn small icon-btn" title={t('immersion.exportToLibrary')} onClick={() => void exportToLibrary()}>
            <Icon name="download" size={14} />
          </button>
          <button
            type="button"
            className="btn small icon-btn"
            title={t('immersion.captureVideo')}
            disabled={captureBusy}
            onClick={() => void captureVideo()}
          >
            <Icon name="video" size={14} />
          </button>
          <button type="button" className="btn small icon-btn" title={t('immersion.openInSystemBrowser')} onClick={openExternal}>
            <Icon name="external" size={14} />
          </button>
          <button
            type="button"
            className="btn small icon-btn"
            title={showRail ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
            onClick={() => setRailOpen((v) => !v)}
          >
            <Icon name="folder" size={14} />
          </button>
        </div>
      )}

      {mode === 'focus' && (
        <button type="button" className="immersion-focus-exit btn small" onClick={() => applyMode('reader')}>
          {t('immersion.exitFocus')}
        </button>
      )}

      <div className="immersion-body">
        <div className={`immersion-stage${splitView ? ' immersion-split' : ''}`}>
          {loading && <div className="immersion-banner">{t('immersion.loading')}</div>}
          {error && <div className="immersion-banner error">{error}</div>}
          {status && (
            <div className="immersion-banner status" onClick={() => setStatus(null)}>
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
                      setMode('reader');
                      navigate(s.url, { mode: 'reader' });
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="muted immersion-hint">{t('immersion.hint')}</p>
            </div>
          )}

          {showWebview &&
            createWebview(currentUrl, (el) => {
              webviewRef.current = el;
            })}

          {showReader && readerHtmlProp && (
            <div
              ref={readerRef}
              className={`immersion-reader wk-on${splitView ? ' immersion-split-reader' : ''}`}
              onPointerDown={onReaderPointerDown}
              onMouseUp={onReaderMouseUp}
              dangerouslySetInnerHTML={readerHtmlProp}
            />
          )}
        </div>

        {showRail && (
          <aside className="immersion-rail">
            <div className="immersion-rail-head">{t('immersion.sites')}</div>
            {sites.length === 0 && (
              <p className="muted immersion-rail-empty">{t('immersion.rail.empty')}</p>
            )}
            <ul className="immersion-site-list">
              {sites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="immersion-site-card"
                    onClick={() => navigate(s.url)}
                    title={s.url}
                  >
                    <span className="immersion-site-title">
                      {s.favorite ? '★ ' : ''}
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
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* Inject highlight CSS for reader (mirrors reader settings) */}
      <style>{WK_HIGHLIGHT_CSS}</style>

      {popup?.kind === 'dict' && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          context={popup.context}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'translate' && (
        <SentenceTranslatePopup text={popup.query} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}
