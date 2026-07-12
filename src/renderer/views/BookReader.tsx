import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import ReaderSettingsPanel from '../components/ReaderSettingsPanel';
import DictionaryPopup from '../components/DictionaryPopup';
import Icon from '../components/Icons';
import SentenceTranslatePopup from '../components/SentenceTranslatePopup';
import {
  buildReaderCss,
  clampFontSize,
  loadSettings,
  onReaderSettingsChanged,
  saveSettings,
  THEMES,
  type ReaderSettings,
} from '../readerSettings';
import { addBookmark, loadBookmarks, removeBookmark, type Bookmark } from '../bookmarks';
import { lookupWordFromSelection, isLookupClick, noteLookupPointerDown } from '../wordLookup';
import { getTokenizer, tokenizerReady } from '../tokenizer';
import { highlightDocument, recolorEl } from '../wordHighlight';
import { onKnowledgeChanged } from '../knownWords';
import { recordReading } from '../stats';
import {
  articleBodyHtml,
  fetchReadableArticle,
  isJaWikiArticleUrl,
  resolveWikiUrl,
  type WikiNavEntry,
} from '../wikiArticle';
import { registerCommandHandler } from '../keyboardShortcuts';

// epub.js builds its location map at ~this many characters per location, so
// (number of locations × this) is a good estimate of the book's total length —
// which we use to turn reading progress into a "characters read" figure.
const CHARS_PER_LOCATION = 1600;

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

// epub.js types are loose, so these are kept as `any`.
function styleContents(contents: any, css: string): void {
  const doc = contents?.document;
  if (!doc) return;
  let el = doc.getElementById('jp-reader-style');
  if (!el) {
    el = doc.createElement('style');
    el.id = 'jp-reader-style';
    doc.head.appendChild(el);
  }
  el.textContent = css;
}

export default function BookReader({ item, onClose }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [title, setTitle] = useState(item.title);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popup, setPopup] = useState<
    { query: string; x: number; y: number; kind: 'dict' | 'translate' } | null
  >(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(item.id));
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [hlTick, setHlTick] = useState(0);
  const [wikiBusy, setWikiBusy] = useState(false);
  const [canWikiBack, setCanWikiBack] = useState(false);

  /** In-app Wikipedia link history (when reading imported wiki EPUBs). */
  const wikiHistoryRef = useRef<WikiNavEntry[]>([]);
  const currentWikiUrlRef = useRef(item.sourcePath ?? '');
  const wikiBusyRef = useRef(false);
  const canWikiBackRef = useRef(false);
  canWikiBackRef.current = canWikiBack;
  const wikiNavRef = useRef<{
    navigate: (contents: unknown, url: string) => Promise<void>;
    goBack: (contents: unknown) => void;
  }>({ navigate: async () => {}, goBack: () => {} });

  // The latest place the reader settled, captured from 'relocated'. Used as the
  // spot to save when you hit "Add here".
  const curLocRef = useRef<{ cfi: string; percent: number } | null>(null);

  // Reachable from the once-registered keyboard handler without re-binding it.
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const epubLookupHandledRef = useRef(false);

  // Keep the latest settings reachable from epub.js hooks registered once.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Keep the latest title reachable from the once-registered stats flusher.
  const titleRef = useRef(title);
  titleRef.current = title;

  // Build the tokenizer lazily the first time highlighting is turned on.
  useEffect(() => {
    if (!settings.wordHighlight || tokenizerReady()) return;
    let dead = false;
    getTokenizer()
      .then(() => !dead && setHlTick((t) => t + 1))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [settings.wordHighlight]);

  useEffect(() => onKnowledgeChanged((words) => {
    recolorEl(document, words.length ? new Set(words) : undefined);
  }), []);

  useEffect(() => onReaderSettingsChanged(setSettings), []);

  const runHighlightOnContents = useCallback((force = false) => {
    if (!settingsRef.current.wordHighlight || !tokenizerReady()) return;
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      rendition.getContents().forEach((c: { document?: Document }) => {
        if (c.document) highlightDocument(c.document, force);
      });
    } catch {
      /* rendition not ready */
    }
  }, []);

  const applyPageToContents = useCallback((contents: unknown, entry: { title: string; bodyHtml: string }) => {
    const c = contents as { document?: Document; window?: Window };
    const doc = c?.document;
    if (!doc) return;
    doc.body.innerHTML = entry.bodyHtml;
    doc.title = entry.title;
    styleContents(c, buildReaderCss(settingsRef.current));
    c.window?.scrollTo(0, 0);
    if (settingsRef.current.wordHighlight && tokenizerReady()) highlightDocument(doc, true);
  }, []);

  const navigateWikiLink = useCallback(
    async (contents: unknown, url: string) => {
      const c = contents as { document?: Document };
      const doc = c?.document;
      if (!doc || wikiBusyRef.current) return;
      wikiHistoryRef.current.push({
        url: currentWikiUrlRef.current,
        title: doc.title || titleRef.current,
        bodyHtml: doc.body.innerHTML,
      });
      setCanWikiBack(true);
      wikiBusyRef.current = true;
      setWikiBusy(true);
      setPopup(null);
      try {
        const art = await fetchReadableArticle(url);
        currentWikiUrlRef.current = art.url;
        setTitle(art.title);
        applyPageToContents(c, {
          title: art.title,
          bodyHtml: articleBodyHtml(art.title, art.html, art.meta),
        });
      } catch (err) {
        wikiHistoryRef.current.pop();
        setCanWikiBack(wikiHistoryRef.current.length > 0);
        console.error(err);
      } finally {
        wikiBusyRef.current = false;
        setWikiBusy(false);
      }
    },
    [applyPageToContents],
  );

  const goBackWikiLink = useCallback(
    (contents: unknown) => {
      const prev = wikiHistoryRef.current.pop();
      setCanWikiBack(wikiHistoryRef.current.length > 0);
      if (!prev) return;
      currentWikiUrlRef.current = prev.url;
      setTitle(prev.title);
      setPopup(null);
      applyPageToContents(contents, { title: prev.title, bodyHtml: prev.bodyHtml });
    },
    [applyPageToContents],
  );

  const wikiBack = useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      const contents = rendition.getContents()?.[0];
      if (contents) goBackWikiLink(contents);
    } catch {
      /* ignore */
    }
  }, [goBackWikiLink]);

  useEffect(() => {
    wikiNavRef.current = { navigate: navigateWikiLink, goBack: goBackWikiLink };
  }, [navigateWikiLink, goBackWikiLink]);

  useEffect(() => {
    wikiHistoryRef.current = [];
    currentWikiUrlRef.current = item.sourcePath ?? '';
    setCanWikiBack(false);
  }, [item.id, item.sourcePath]);

  // ----- reading-statistics tracking -----
  const totalCharsRef = useRef(0); // estimated total characters in this book
  const maxPercentRef = useRef<number | null>(null); // furthest point reached
  const pendingCharsRef = useRef(0); // new chars read since the last stats flush
  const readStartRef = useRef(Date.now()); // clock for the current active stretch
  const activeReadingRef = useRef(true); // false while the window is unfocused

  // Debounced re-pagination after a reflow-affecting setting changes (see effect below).
  const reflowReady = useRef(false);
  const relayoutTimer = useRef<number | null>(null);

  // The parsed epub.js book. Held in state so the rendition-mount effect can
  // (re)build the rendered view whenever the flow / writing mode changes.
  const [bookObj, setBookObj] = useState<any>(null);

  // ----- footer: chapter navigation + reading progress -----
  const bookRef = useRef<any>(null);
  const spineIndexRef = useRef<number>(-1);
  const [toc, setToc] = useState<{ href: string; label: string }[]>([]);
  const [progress, setProgress] = useState<number>(item.progress?.percent ?? 0);
  const [locationsReady, setLocationsReady] = useState(false);
  // Live slider value while the user is dragging (null = not dragging → show real progress).
  const [seek, setSeek] = useState<number | null>(null);

  const bumpFont = useCallback((delta: number) => {
    setSettings((s) => ({ ...s, fontSize: clampFontSize(s.fontSize + delta) }));
  }, []);

  // ----- bookmarks: save / jump / remove -----
  const addCurrent = useCallback(() => {
    const rendition = renditionRef.current;
    const loc = curLocRef.current;
    if (!rendition || !loc) return;
    // Grab a short snippet of the visible page to use as a readable label.
    let snippet = '';
    try {
      const contents = rendition.getContents?.();
      const doc = Array.isArray(contents) ? contents[0]?.document : contents?.document;
      const text = (doc?.body?.innerText || '').replace(/\s+/g, ' ').trim();
      snippet = text.slice(0, 30);
    } catch {
      /* page text unavailable — fall back to the percentage */
    }
    const label = snippet || `${Math.round(loc.percent * 100)}%`;
    setBookmarks(
      addBookmark(item.id, { cfi: loc.cfi, label, percent: loc.percent, createdAt: Date.now() }),
    );
  }, [item.id]);

  const jumpTo = useCallback((cfi: string) => {
    setBookmarksOpen(false);
    setPopup(null);
    renditionRef.current?.display(cfi);
  }, []);

  const removeAt = useCallback(
    (cfi: string) => setBookmarks(removeBookmark(item.id, cfi)),
    [item.id],
  );

  // ----- chapter + seek navigation (footer bar) -----
  // Jump to a spine section by index (used by the prev/next-chapter buttons).
  const displaySpine = useCallback((target: number) => {
    const items = bookRef.current?.spine?.spineItems as { href: string }[] | undefined;
    if (!items?.length) return;
    const i = Math.min(Math.max(target, 0), items.length - 1);
    setPopup(null);
    renditionRef.current?.display(items[i].href);
  }, []);

  const prevChapter = useCallback(() => displaySpine(spineIndexRef.current - 1), [displaySpine]);
  const nextChapter = useCallback(() => displaySpine(spineIndexRef.current + 1), [displaySpine]);

  const jumpHref = useCallback((href: string) => {
    if (!href) return;
    setPopup(null);
    renditionRef.current?.display(href);
  }, []);

  // Seek to a 0..1 fraction of the whole book via the generated location map.
  const commitSeek = useCallback((p: number) => {
    const book = bookRef.current;
    if (!book?.locations || !renditionRef.current) return;
    const cfi = book.locations.cfiFromPercentage(Math.min(Math.max(p, 0), 1));
    setPopup(null);
    if (cfi) renditionRef.current.display(cfi);
  }, []);

  // ----- load + parse the book once (metadata, TOC, location map) -----
  useEffect(() => {
    let destroyed = false;
    let book: any;

    (async () => {
      try {
        const buf = await window.api.readBook(item.id);
        if (destroyed) return;
        if (!buf) throw new Error('The book file is missing from the library.');

        const ePub = (await import('epubjs')).default;
        book = ePub(buf as any);
        bookRef.current = book;

        book.loaded.metadata.then((m: any) => {
          if (m?.title) setTitle(m.title);
        });

        // Table of contents → the "Jump to chapter" dropdown in the footer.
        book.loaded.navigation.then((nav: any) => {
          const flat: { href: string; label: string }[] = [];
          const walk = (items: any[], depth: number) => {
            for (const it of items ?? []) {
              const label = String(it?.label ?? '').trim();
              if (it?.href) {
                flat.push({ href: it.href, label: `${'　'.repeat(depth)}${label || '—'}` });
              }
              if (it?.subitems?.length) walk(it.subitems, depth + 1);
            }
          };
          walk(nav?.toc ?? [], 0);
          if (!destroyed) setToc(flat);
        });

        // Build a fine location map in the background so the seek bar and the
        // "% read" are accurate (epub.js only rough-estimates until this runs).
        book.ready
          .then(() => book.locations.generate(CHARS_PER_LOCATION))
          .then(() => {
            if (destroyed) return;
            setLocationsReady(true);
            // Estimate total length for the "characters read" stat.
            try {
              const loc = book.locations;
              const n = typeof loc.length === 'function' ? loc.length() : loc.total;
              if (n && n > 0) totalCharsRef.current = n * CHARS_PER_LOCATION;
            } catch {
              /* estimate stays 0 → chars just won't be counted */
            }
          })
          .catch(() => {
            /* locations are a nice-to-have; ignore failures */
          });

        // Hand the book to the rendition-mount effect below.
        if (!destroyed) setBookObj(book);
      } catch (err) {
        console.error(err);
        const detail = err instanceof Error ? err.message : String(err);
        setError(`Could not open this EPUB file.\n${detail}`);
        setLoading(false);
      }
    })();

    return () => {
      destroyed = true;
      setBookObj(null);
      try {
        book?.destroy?.();
      } catch {
        /* ignore */
      }
      bookRef.current = null;
    };
  }, [item.id]);

  // ----- (re)mount the rendered view; rebuilds on flow / writing-mode change -----
  // epub.js bakes the flow (paginated vs scrolled) and column direction into the
  // view manager at creation, so switching either one means tearing the view
  // down and rebuilding it — re-displaying at the last spot so the reader
  // doesn't lose its place.
  useEffect(() => {
    const book = bookObj;
    if (!book || !viewerRef.current) return;
    let destroyed = false;

    // epub.js scroll managers only scroll *vertically*, so vertical (tategaki)
    // text — which needs to flow right-to-left — can't use scroll; it always
    // paginates (page-flip R→L, the traditional way to read it). Horizontal
    // text honours the Pages/Scroll choice, using the continuous manager for a
    // proper full-length scroll (the default manager clips at one screen).
    const vertical = settingsRef.current.writingMode === 'vertical';
    const scrolled = settingsRef.current.flow === 'scrolled' && !vertical;
    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: scrolled ? 'scrolled' : 'paginated',
      manager: scrolled ? 'continuous' : 'default',
      spread: scrolled ? 'none' : 'auto',
      allowScriptedContent: true,
    });
    renditionRef.current = rendition;

    // Style every chapter as it loads, and catch Ctrl+wheel inside the iframe.
    rendition.hooks.content.register((contents: any) => {
      styleContents(contents, buildReaderCss(settingsRef.current));
      const doc = contents?.document;
      doc?.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          if (e.ctrlKey) {
            e.preventDefault();
            bumpFont(e.deltaY < 0 ? 10 : -10);
          }
        },
        { passive: false },
      );
      doc?.addEventListener('mousedown', (e: MouseEvent) => {
        epubLookupHandledRef.current = false;
        popupOpenOnDownRef.current = !!popupRef.current;
        noteLookupPointerDown(e);
      });
      doc?.addEventListener('mouseup', (e: MouseEvent) => {
        const win = contents?.window as Window | undefined;
        const onLink = (e.target as Element | null)?.closest?.('a[href]');
        if (!onLink && win) {
          const hit = lookupWordFromMouseUp(e, win.document);
          if (hit) {
            epubLookupHandledRef.current = true;
            const base = viewerRef.current?.getBoundingClientRect();
            setPopup({
              kind: hit.translate ? 'translate' : 'dict',
              query: hit.query,
              x: (base?.left ?? 0) + hit.x,
              y: (base?.top ?? 0) + hit.y,
            });
            return;
          }
        }
        if (!popupOpenOnDownRef.current || !popupRef.current) return;
        requestAnimationFrame(() => {
          if (
            popupRef.current &&
            !epubLookupHandledRef.current &&
            isLookupClick(e)
          ) {
            setPopup(null);
          }
          epubLookupHandledRef.current = false;
        });
      });
      doc?.addEventListener(
        'click',
        (e: MouseEvent) => {
          const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
          if (!a) return;
          const href = a.getAttribute('href');
          if (!href || href.startsWith('#')) return;
          const resolved = resolveWikiUrl(href, doc?.baseURI);
          if (!isJaWikiArticleUrl(resolved)) {
            e.preventDefault();
            e.stopPropagation();
            void window.api.openExternal(resolved);
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          void wikiNavRef.current.navigate(contents, resolved);
        },
        true,
      );
      const scheduleHighlight = () => {
        if (!settingsRef.current.wordHighlight || !tokenizerReady() || !doc) return;
        highlightDocument(doc);
      };
      const idle = (contents?.window as Window | undefined)?.requestIdleCallback ?? window.requestIdleCallback;
      if (idle) idle(scheduleHighlight, { timeout: 600 });
      else window.setTimeout(scheduleHighlight, 0);
    });

    rendition.on('relocated', (loc: any) => {
      setPopup(null);
      const cfi: string | undefined = loc?.start?.cfi;
      const percent: number = loc?.start?.percentage ?? 0;
      const sIndex: number = loc?.start?.index ?? -1;
      if (typeof sIndex === 'number' && sIndex >= 0) spineIndexRef.current = sIndex;
      setProgress(percent);
      if (cfi) curLocRef.current = { cfi, percent };
      window.api.setProgress(item.id, { location: cfi, percent });

      // Count characters for new ground only (moving forward past the furthest
      // point reached), so re-reading a page doesn't inflate the tally.
      if (maxPercentRef.current == null) {
        maxPercentRef.current = percent; // baseline at the resume spot
      } else if (percent > maxPercentRef.current && totalCharsRef.current > 0) {
        pendingCharsRef.current += Math.round(
          (percent - maxPercentRef.current) * totalCharsRef.current,
        );
        maxPercentRef.current = percent;
      }
    });

    // Highlight text -> a single word opens the dictionary; a longer phrase
    // or sentence opens the auto-translation popup.
    rendition.on('selected', (_cfiRange: string, contents: any) => {
      try {
        epubLookupHandledRef.current = true;
        const win = contents?.window as Window | undefined;
        if (!win) return;
        const hit = lookupWordFromSelection(win);
        if (!hit) return;
        const base = viewerRef.current?.getBoundingClientRect();
        setPopup({
          kind: hit.translate ? 'translate' : 'dict',
          query: hit.query,
          x: (base?.left ?? 0) + hit.x,
          y: (base?.top ?? 0) + hit.y,
        });
      } catch {
        /* selection went away */
      }
    });

    // Resume where we were: the live spot if we're rebuilding, else the saved one.
    const startAt = curLocRef.current?.cfi || item.progress?.location || undefined;
    Promise.resolve(rendition.display(startAt))
      .then(() => {
        if (destroyed) return;
        try {
          rendition.themes.fontSize(`${settingsRef.current.fontSize}%`);
        } catch {
          /* ignore */
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        console.error(err);
        setError(`Could not open this EPUB file.\n${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      });

    return () => {
      destroyed = true;
      try {
        rendition.destroy();
      } catch {
        /* ignore */
      }
      if (renditionRef.current === rendition) renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookObj, settings.flow, settings.writingMode, bumpFont]);

  // ----- re-apply settings whenever they change, and auto-save them -----
  useEffect(() => {
    saveSettings(settings);
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      rendition.themes.fontSize(`${settings.fontSize}%`);
      const css = buildReaderCss(settings);
      rendition.getContents().forEach((c: any) => styleContents(c, css));
    } catch {
      /* rendition not ready yet */
    }
  }, [settings]);

  useEffect(() => {
    if (!settings.wordHighlight || !tokenizerReady()) return;
    runHighlightOnContents(true);
  }, [settings.wordHighlight, hlTick, runHighlightOnContents]);

  // epub.js applies a new font size but does NOT recompute where the columns
  // break, so the enlarged text spills past the fixed page height and gets
  // clipped (especially in vertical / tategaki books, where the whole column
  // overflows). Just re-displaying the current spot only repositions the same
  // stale layout — we have to fully tear the rendered view down and rebuild it
  // so epub.js re-paginates at the new size. Debounced so live zooming
  // (Ctrl+wheel) stays smooth and we only rebuild once the user settles.
  useEffect(() => {
    if (!reflowReady.current) {
      reflowReady.current = true; // skip the initial mount; the load effect already displayed
      return;
    }
    const rendition = renditionRef.current;
    if (!rendition) return;
    if (relayoutTimer.current) window.clearTimeout(relayoutTimer.current);
    relayoutTimer.current = window.setTimeout(() => {
      const cfi = curLocRef.current?.cfi;
      if (!cfi) return;
      try {
        rendition.clear(); // drop the stale view so display() re-renders from scratch
        const shown = rendition.display(cfi);
        shown?.then?.(() => {
          // Re-assert the font size on the freshly rendered view.
          try {
            rendition.themes.fontSize(`${settingsRef.current.fontSize}%`);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* rendition not ready */
      }
    }, 250);
    return () => {
      if (relayoutTimer.current) window.clearTimeout(relayoutTimer.current);
    };
  }, [
    settings.fontSize,
    settings.font,
    settings.fontWeight,
    settings.lineHeight,
    settings.paragraphIndent,
    settings.sideMargin,
    settings.justify,
    settings.kerning,
    settings.vpal,
    settings.prettyWrap,
    settings.prioritizeStyles,
    settings.hideFurigana,
  ]);

  // ----- reading time + characters → statistics -----
  // Accrue active reading time (only while the window is focused) and the
  // characters counted above, flushing to the stats store periodically and on
  // close. Long gaps (sleep / left open in the background) are discarded.
  useEffect(() => {
    const flush = () => {
      const now = Date.now();
      let secs = (now - readStartRef.current) / 1000;
      readStartRef.current = now;
      if (!activeReadingRef.current || secs < 0 || secs > 3600) secs = 0;
      const chars = pendingCharsRef.current;
      pendingCharsRef.current = 0;
      if (secs > 0 || chars > 0) {
        recordReading(item.id, titleRef.current, secs, chars);
      }
    };
    const setActive = (on: boolean) => {
      if (on) {
        activeReadingRef.current = true;
        readStartRef.current = Date.now();
      } else {
        flush();
        activeReadingRef.current = false;
      }
    };
    activeReadingRef.current = true;
    readStartRef.current = Date.now();

    const iv = window.setInterval(flush, 20000);
    const onFocus = () => setActive(true);
    const onBlur = () => setActive(false);
    const onVis = () => setActive(!document.hidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [item.id]);

  // ----- keyboard: rebindable page/font via shortcut manager; Escape local -----
  useEffect(() => {
    const offs = [
      registerCommandHandler('reader.fontUp', () => {
        bumpFont(10);
      }),
      registerCommandHandler('reader.fontDown', () => {
        bumpFont(-10);
      }),
      registerCommandHandler('reader.zoomReset', () => {
        setSettings((s) => ({ ...s, fontSize: clampFontSize(100) }));
      }),
      registerCommandHandler('reader.pageNext', () => {
        setPopup(null);
        renditionRef.current?.next();
      }),
      registerCommandHandler('reader.pagePrev', () => {
        setPopup(null);
        renditionRef.current?.prev();
      }),
    ];
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (popupRef.current) setPopup(null);
        else onClose();
      } else if (
        canWikiBackRef.current &&
        (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft'))
      ) {
        e.preventDefault();
        wikiBack();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, bumpFont, wikiBack]);

  // ----- Ctrl+wheel over the app chrome (outside the book iframe) -----
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        bumpFont(e.deltaY < 0 ? 10 : -10);
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [bumpFont]);

  const stageBg = THEMES[settings.theme].bg;

  return (
    <div className="reader">
      <div className="reader-bar">
        <button className="btn" onClick={onClose}>
          <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
          Library
        </button>
        {canWikiBack && (
          <button className="btn" title="Back (Alt+← or Backspace)" onClick={wikiBack}>
            <Icon name="chevron" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Back
          </button>
        )}
        <div className="reader-title">{title}</div>
        <div className="reader-controls">
          <button
            className="btn"
            onClick={() => {
              setPopup(null);
              renditionRef.current?.prev();
            }}
          >
            ‹ Prev
          </button>
          <button
            className="btn"
            onClick={() => {
              setPopup(null);
              renditionRef.current?.next();
            }}
          >
            Next ›
          </button>
          <div className="settings-anchor">
            <button
              className={`btn ${bookmarksOpen ? 'active' : ''}`}
              title="Bookmarks"
              onClick={() => setBookmarksOpen((o) => !o)}
            >
              <Icon name="bookmark" size={14} />
            </button>
            {bookmarksOpen && (
              <>
                <div className="panel-backdrop" onClick={() => setBookmarksOpen(false)} />
                <div className="settings-panel bookmarks-panel">
                  <div className="bm-head">
                    <span>Bookmarks</span>
                    <button className="btn small primary" onClick={addCurrent}>
                      + Add here
                    </button>
                  </div>
                  {bookmarks.length === 0 ? (
                    <div className="bm-empty">
                      No bookmarks yet. “+ Add here” saves your current spot so you can jump
                      straight back to it later.
                    </div>
                  ) : (
                    <ul className="bm-list">
                      {bookmarks.map((b) => (
                        <li key={b.cfi} className="bm-row">
                          <button
                            className="bm-jump"
                            title="Jump to this spot"
                            onClick={() => jumpTo(b.cfi)}
                          >
                            <span className="bm-pct">{Math.round(b.percent * 100)}%</span>
                            <span className="bm-label">{b.label}</span>
                          </button>
                          <button
                            className="bm-del"
                            title="Remove bookmark"
                            onClick={() => removeAt(b.cfi)}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="settings-anchor">
            <button
              className={`btn ${settingsOpen ? 'active' : ''}`}
              title="Reading settings"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              Aa
            </button>
            {settingsOpen && (
              <>
                <div className="panel-backdrop" onClick={() => setSettingsOpen(false)} />
                <ReaderSettingsPanel settings={settings} onChange={setSettings} />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="reader-stage book-stage" style={{ background: stageBg }}>
        {loading && <div className="reader-msg">Opening book…</div>}
        {wikiBusy && <div className="reader-msg">Loading article…</div>}
        {error && <div className="reader-msg error">{error}</div>}
        <div ref={viewerRef} className="epub-viewer" />
      </div>
      <div className="reader-footer">
        <button className="btn small" title="Previous chapter" onClick={prevChapter}>
          <Icon name="skip-back" size={13} />
        </button>
        <select
          className="chapter-select"
          value=""
          title="Jump to chapter"
          onChange={(e) => jumpHref(e.target.value)}
        >
          <option value="" disabled>
            {toc.length ? 'Jump to chapter…' : 'Loading chapters…'}
          </option>
          {toc.map((t, i) => (
            <option key={i} value={t.href}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn small" title="Next chapter" onClick={nextChapter}>
          <Icon name="skip-forward" size={13} />
        </button>
        <input
          className="reader-seek"
          type="range"
          min={0}
          max={1000}
          value={Math.round((seek ?? progress) * 1000)}
          disabled={!locationsReady}
          title={locationsReady ? 'Seek through the book' : 'Calculating reading positions…'}
          onChange={(e) => setSeek(Number(e.target.value) / 1000)}
          onPointerUp={() => {
            if (seek != null) {
              commitSeek(seek);
              setSeek(null);
            }
          }}
          onKeyUp={() => {
            if (seek != null) {
              commitSeek(seek);
              setSeek(null);
            }
          }}
        />
        <span className="reader-pct muted">{Math.round((seek ?? progress) * 100)}%</span>
      </div>
      {popup &&
        (popup.kind === 'translate' ? (
          <SentenceTranslatePopup text={popup.query} onClose={() => setPopup(null)} />
        ) : (
          <DictionaryPopup
            query={popup.query}
            x={popup.x}
            y={popup.y}
            onClose={() => setPopup(null)}
          />
        ))}
    </div>
  );
}
